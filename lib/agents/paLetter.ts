import { z } from "zod";

import { jsonCallWithProvider, type LlmProvider } from "@/lib/llm/grok";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import type { Citation } from "@/lib/api/contracts";
import type { LabelData } from "@/lib/data/openfda";
import type { PlanInfo } from "@/lib/mocks/payer";

// Pure PA-letter logic (no DB, no server-only) so it is unit-testable. The AI
// writes ONLY the cited Clinical Rationale; the rest of the letter is assembled
// deterministically from DB facts by assembleLetter(). Citations are validated
// (>=8-word verbatim substring) AND aligned (each [n] sentence must actually be
// about citation n's quote). Word overlap is a conservative mechanical check,
// not a proof of clinical equivalence. The template builds each sentence from its own
// quote, aligned by construction.

export type PrescriptionFacts = {
  drug: string;
  dose: string | null;
  frequency: string | null;
  indication: string | null;
  program: string | null;
};
export type PatientFacts = { name: string; conditions: string[]; planId: string | null };

export const PaLetterLlmSchema = z.object({
  rationaleMd: z.string().min(1),
  citations: z.array(z.object({ n: z.number().int(), section: z.string(), quote: z.string() })),
});

const SECTION_KEYS = [
  "indications_and_usage",
  "dosage_and_administration",
  "contraindications",
  "warnings_and_cautions",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  indications_and_usage: "Indications and Usage",
  dosage_and_administration: "Dosage and Administration",
  contraindications: "Contraindications",
  warnings_and_cautions: "Warnings and Cautions",
};

const SECTION_ALIASES: Record<SectionKey, string[]> = {
  indications_and_usage: ["indication", "usage"],
  dosage_and_administration: ["dosage", "dosing", "administration"],
  contraindications: ["contraindication"],
  warnings_and_cautions: ["warning", "caution", "precaution"],
};

const STOPWORDS = new Set(
  "a an and are as at be by for from in is it its of on or that the their they this to with you your her his has have was were will would".split(
    " "
  )
);

const normWs = (s: string): string => s.replace(/\s+/g, " ").trim();
const wordCount = (s: string): number => normWs(s).split(" ").filter(Boolean).length;

function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function resolveSectionKey(section: string): SectionKey | null {
  const s = section.toLowerCase();
  for (const key of SECTION_KEYS) {
    if (s.includes(key) || s.includes(key.replace(/_/g, " "))) return key;
    if (SECTION_ALIASES[key].some((a) => s.includes(a))) return key;
  }
  return null;
}

/** The rationale text belonging to citation [n]: everything since the previous
 * citation marker up to [n] (robust to periods just before the marker). */
function fragmentsForRef(rationaleMd: string, n: number): string[] {
  return [...rationaleMd.matchAll(/([^\]]*?)\[(\d+)\]/g)]
    .filter((m) => Number(m[2]) === n)
    .map((m) => m[1].replace(/^[.\s]+/, ""));
}

/** At least 60% of the cited sentence's content words must occur in its quote. */
function alignmentOk(sentence: string, quote: string): boolean {
  const words = contentWords(sentence);
  if (words.length === 0) return false;
  const inQuote = new Set(contentWords(quote));
  return words.filter((w) => inQuote.has(w)).length / words.length >= 0.6;
}

/**
 * Validate + normalize citations. Returns corrected Citation[] (section fixed to
 * where the quote is found, url injected) or null (logging the reason). Rules:
 * refs match; every citation used; each quote >= 8 words and a verbatim
 * substring of a label section; and each [n] sentence is aligned to its quote.
 */
export function validateAndCorrect(
  rationaleMd: string,
  citations: { n: number; section: string; quote: string }[],
  label: LabelData
): Citation[] | null {
  const fail = (reason: string): null => {
    console.warn(`[paLetter] validation failed: ${reason}`);
    return null;
  };

  if (citations.length === 0) return fail("no citations");

  const used = new Set([...rationaleMd.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const defined = new Set(citations.map((c) => c.n));
  if (defined.size !== citations.length || citations.some((c) => c.n < 1)) return fail("invalid citation numbering");
  for (const n of used) if (!defined.has(n)) return fail(`ref [${n}] has no citation`);
  for (const n of defined) if (!used.has(n)) return fail(`citation ${n} unused`);

  const sectionsNorm = {} as Record<SectionKey, string>;
  for (const key of SECTION_KEYS) sectionsNorm[key] = normWs(label.sections[key]);

  const corrected: Citation[] = [];
  for (const c of citations) {
    const quote = normWs(c.quote);
    if (wordCount(quote) < 8) return fail(`quote [${c.n}] under 8 words`);

    const containing = SECTION_KEYS.filter((k) => sectionsNorm[k].includes(quote));
    if (containing.length === 0) return fail(`quote [${c.n}] not a verbatim substring of any label section`);

    const named = resolveSectionKey(c.section);
    let finalKey: SectionKey;
    if (named && containing.includes(named)) {
      finalKey = named;
    } else {
      finalKey = containing[0];
      console.warn(`[paLetter] citation [${c.n}] section "${c.section}" -> "${SECTION_LABELS[finalKey]}"`);
    }

    if (!fragmentsForRef(rationaleMd, c.n).every((fragment) => alignmentOk(fragment, quote))) {
      return fail(`citation [${c.n}] sentence not aligned with its quote`);
    }

    corrected.push({ n: c.n, section: SECTION_LABELS[finalKey], quote: c.quote, url: label.citationUrl });
  }
  return corrected;
}

const SYSTEM_PROMPT = `You write ONLY the "Clinical Rationale" of a prior authorization letter, in Markdown, plus its citations.
RULES:
- Every clinical claim about the medication comes ONLY from the provided FDA label sections and MUST end with a citation marker like [1].
- Each citation "quote" is copied VERBATIM (exact characters) from a label section and is at least 8 words long.
- CRITICAL: each sentence must be ABOUT the citation it ends with — the sentence's claim and citation n's quote must describe the same thing.
- The patient has TWO diagnoses. Cite BOTH: (a) the glycemic-control / type 2 diabetes indication AND (b) the heart-failure indication, each as its OWN citation quoting the exact matching sentence from Indications and Usage. Also cite the dosing from Dosage and Administration.
- Write 2-4 sentences of clinical rationale ONLY. No header, greeting, continuity, request, or signature.
- Return ONLY JSON: {"rationaleMd":"<sentences with [n] markers>","citations":[{"n":1,"section":"<section name>","quote":"<verbatim label text, >= 8 words>"}]}.
- Every [n] in rationaleMd has a matching citation, and every citation is used. No URLs.`;

function buildUserPrompt(rx: PrescriptionFacts, patient: PatientFacts, label: LabelData): string {
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  return [
    `Medication: ${rx.drug}`,
    `Patient diagnoses (cite the label indication for each): ${diagnoses}`,
    ``,
    `Verified FDA excerpts (use these exact quotes and numbers; keep each sentence close to its excerpt):`,
    ...templateRationale(rx, label).citations.map((c) => `[${c.n}] ${c.section}: ${c.quote}`),
  ].join("\n");
}

/** First verbatim sentence (>= minWords) in `sectionNorm` containing any keyword. */
function findSentence(sectionNorm: string, keywords: string[], minWords = 8): string {
  for (const sentence of sectionNorm.split(/(?<=\.)\s+/)) {
    const s = sentence.trim();
    if (wordCount(s) >= minWords && keywords.some((k) => s.toLowerCase().includes(k))) return s;
  }
  return "";
}

/** Verbatim span of >= minWords from a (normalized) section. */
function extractQuote(sectionNorm: string, minWords = 14, maxWords = 42): string {
  const words = sectionNorm.split(" ").filter(Boolean);
  if (words.length <= minWords) return words.join(" ");
  let end = Math.min(maxWords, words.length);
  for (let i = minWords; i < Math.min(maxWords, words.length); i++) {
    if (words[i].endsWith(".")) {
      end = i + 1;
      break;
    }
  }
  return words.slice(0, end).join(" ");
}

/** A bounded verbatim snippet starting at `keyword` (up to `words` words). */
function snippetAround(sectionNorm: string, keyword: string, words = 18): string {
  const idx = sectionNorm.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return "";
  return sectionNorm.slice(idx).split(" ").slice(0, words).join(" ");
}

/** Split an indications section into its "to reduce / to improve / as an adjunct" clauses. */
function clauseWith(sectionNorm: string, keywords: string[], minWords = 8): string {
  const clauses = sectionNorm.split(/(?=\b(?:to reduce|to improve|as an adjunct)\b)/i);
  for (const clause of clauses) {
    const c = clause.trim();
    if (wordCount(c) >= minWords && keywords.some((k) => c.toLowerCase().includes(k))) {
      // Trim to the first sentence end for a clean, on-point quote.
      const periodIdx = c.indexOf(". ");
      const candidate = periodIdx > 0 ? c.slice(0, periodIdx + 1) : c;
      const chosen = wordCount(candidate) >= minWords ? candidate : c;
      const words = chosen.split(" ");
      return words.length > 42 ? words.slice(0, 42).join(" ") : chosen;
    }
  }
  return findSentence(sectionNorm, keywords, minWords);
}

/** Deterministic Clinical Rationale — each sentence embeds its own verbatim quote (aligned by construction). */
export function templateRationale(
  rx: PrescriptionFacts,
  label: LabelData
): { rationaleMd: string; citations: Citation[] } {
  const indNorm = normWs(label.sections.indications_and_usage);
  const dosNorm = normWs(label.sections.dosage_and_administration);
  // Match on the distinctive term so the glycemic clause isn't confused with the
  // cardiovascular-death-in-diabetes clause (which also mentions "type 2 diabetes").
  const glycemic = clauseWith(indNorm, ["glycemic"]);
  const heartFailure = clauseWith(indNorm, ["heart failure"]);
  const dosing =
    dosNorm.match(/The recommended dose of JARDIANCE is[^.]*\./i)?.[0] ||
    snippetAround(dosNorm, "recommended dose") ||
    findSentence(dosNorm, ["recommended", "10 mg", "once daily"]) ||
    extractQuote(dosNorm);

  const items: { section: string; quote: string; sentence: (n: number) => string }[] = [];
  if (glycemic) {
    items.push({
      section: SECTION_LABELS.indications_and_usage,
      quote: glycemic,
      sentence: (n) => `${rx.drug} is indicated ${glycemic.replace(/[.\s]+$/, "")} [${n}].`,
    });
  }
  if (heartFailure && heartFailure !== glycemic) {
    items.push({
      section: SECTION_LABELS.indications_and_usage,
      quote: heartFailure,
      sentence: (n) => `${rx.drug} is also indicated ${heartFailure.replace(/[.\s]+$/, "")} [${n}].`,
    });
  }
  if (dosing) {
    items.push({
      section: SECTION_LABELS.dosage_and_administration,
      quote: dosing,
      sentence: (n) => `${dosing.replace(/[.\s]+$/, "")} [${n}].`,
    });
  }
  if (items.length === 0) {
    const q = extractQuote(indNorm);
    items.push({
      section: SECTION_LABELS.indications_and_usage,
      quote: q,
      sentence: (n) => `Per the FDA label, ${rx.drug} is indicated ${q} [${n}].`,
    });
  }

  const citations: Citation[] = [];
  const sentences: string[] = [];
  items.forEach((it, i) => {
    const n = i + 1;
    citations.push({ n, section: it.section, quote: it.quote, url: label.citationUrl });
    sentences.push(it.sentence(n));
  });
  return { rationaleMd: sentences.join(" "), citations };
}

export function displayDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const PROGRAM_SUPPLY: Record<string, { label: string; supply: boolean }> = {
  bridge: { label: "Medvantx Bridge", supply: true },
  quick_start: { label: "Medvantx Quick Start", supply: true },
};

/** Assemble the full letter around a (validated) Clinical Rationale — DB facts only. */
export function assembleLetter(
  rationaleMd: string,
  rx: PrescriptionFacts,
  patient: PatientFacts,
  plan: PlanInfo,
  date: string
): string {
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  const prog = (rx.program && PROGRAM_SUPPLY[rx.program]) || { label: "the manufacturer program", supply: false };

  const continuity = `${patient.name} is currently established on ${med}. The new plan requires prior authorization for this medication.${
    prog.supply ? ` A ${prog.label} supply is in place so therapy is not interrupted while this request is reviewed.` : ""
  }`;

  return [
    `## Prior Authorization Request`,
    ``,
    `**To:** ${plan.planName} — Pharmacy Benefits, Prior Authorization Department`,
    `**Date:** ${date}`,
    `**Re:** ${patient.name} · ${plan.planName} · Member ${plan.memberId} · ${med}`,
    ``,
    `**Diagnoses:** ${diagnoses}`,
    ``,
    `**Clinical Rationale:** ${rationaleMd}`,
    ``,
    `**Continuity of Therapy:** ${continuity}`,
    ``,
    `**Request:** Please approve ${med} for continued coverage without interruption.`,
    ``,
    `**Sincerely,**`,
    ``,
    `${DEMO_PRESCRIBER.name}`,
    `${DEMO_PRESCRIBER.specialty}`,
    `${DEMO_PRESCRIBER.clinic}, ${DEMO_PRESCRIBER.city}`,
    `NPI ${DEMO_PRESCRIBER.npi} (demo)`,
  ].join("\n");
}

/**
 * Draft the rationale: Grok twice, then Gemini once (backup AI), then the
 * deterministic template. Every AI draft must pass citation validation.
 */
export async function draftRationale(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData,
  opts: { preferTemplate?: boolean } = {}
): Promise<{ rationaleMd: string; citations: Citation[]; source: "ai" | "template"; provider: LlmProvider }> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(rx, patient, label) },
  ];

  const plan: ("grok" | "gemini")[] = ["grok", "grok", "gemini"];
  for (let attempt = 1; !opts.preferTemplate && attempt <= plan.length; attempt++) {
    try {
      const { data: llm, provider } = await jsonCallWithProvider(PaLetterLlmSchema, messages, {
        model: "fast",
        fixtureKey: "paLetter",
        timeoutMs: 12_000,
        attempts: 1,
        providers: [plan[attempt - 1]],
      });
      const corrected = validateAndCorrect(llm.rationaleMd, llm.citations, label);
      if (corrected) return { rationaleMd: llm.rationaleMd, citations: corrected, source: "ai", provider };
      if (provider === "fixture") break; // same fixture every time; don't loop on it
    } catch (err) {
      console.warn(`[paLetter] ${plan[attempt - 1]} attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const template = templateRationale(rx, label);
  const citations = validateAndCorrect(template.rationaleMd, template.citations, label);
  if (!citations) throw new Error("FDA template failed citation validation");
  return { ...template, citations, source: "template", provider: "template" };
}
