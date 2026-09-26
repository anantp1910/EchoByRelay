import "server-only";

import { z } from "zod";

import { db } from "@/lib/db/server";
import { jsonCall } from "@/lib/llm/grok";
import { getJardianceLabel, type LabelData } from "@/lib/data/openfda";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import type { Citation } from "@/lib/api/contracts";
import type { AgentContext } from "./context";

// PA drafter. Builds a professional, cited prior-authorization letter:
// patient facts come ONLY from the DB; clinical claims come ONLY from the FDA
// label and are cited [n] with >= 8-word verbatim quotes. Validates the
// citations; retries the LLM once; then falls back to a deterministic template
// with the same structure (the demo never hangs).

type PrescriptionFacts = {
  drug: string;
  dose: string | null;
  frequency: string | null;
  indication: string | null;
  program: string | null;
};
type PatientFacts = { name: string; conditions: string[]; planId: string | null };

const PaLetterLlmSchema = z.object({
  letterMd: z.string().min(1),
  citations: z.array(
    z.object({ n: z.number().int(), section: z.string(), quote: z.string() })
  ),
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

const normWs = (s: string): string => s.replace(/\s+/g, " ").trim();
const wordCount = (s: string): number => normWs(s).split(" ").filter(Boolean).length;

function resolveSectionKey(section: string): SectionKey | null {
  const s = section.toLowerCase();
  for (const key of SECTION_KEYS) {
    if (s.includes(key) || s.includes(key.replace(/_/g, " "))) return key;
    if (SECTION_ALIASES[key].some((a) => s.includes(a))) return key;
  }
  return null;
}

function programLabel(program: string | null): { label: string; supply: boolean } {
  switch (program) {
    case "bridge":
      return { label: "Medvantx Bridge", supply: true };
    case "quick_start":
      return { label: "Medvantx Quick Start", supply: true };
    default:
      return { label: "the manufacturer access program", supply: false };
  }
}

function displayDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Validate + normalize citations. Returns corrected Citation[] (section fixed to
 * where the quote is actually found, url injected) or null. Rules: refs match;
 * every citation used; each quote >= 8 words and a whitespace-normalized,
 * case-sensitive exact substring of a label section.
 */
function validateAndCorrect(
  letterMd: string,
  citations: { n: number; section: string; quote: string }[],
  label: LabelData
): Citation[] | null {
  if (citations.length === 0) return null;

  const used = new Set([...letterMd.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const defined = new Set(citations.map((c) => c.n));
  for (const n of used) if (!defined.has(n)) return null;
  for (const n of defined) if (!used.has(n)) return null;

  const sectionsNorm = {} as Record<SectionKey, string>;
  for (const key of SECTION_KEYS) sectionsNorm[key] = normWs(label.sections[key]);

  const corrected: Citation[] = [];
  for (const c of citations) {
    const quote = normWs(c.quote);
    if (wordCount(quote) < 8) return null;

    const containing = SECTION_KEYS.filter((k) => sectionsNorm[k].includes(quote));
    if (containing.length === 0) return null;

    const named = resolveSectionKey(c.section);
    let finalKey: SectionKey;
    if (named && containing.includes(named)) {
      finalKey = named;
    } else {
      finalKey = containing[0];
      console.warn(
        `[paDrafter] citation [${c.n}] section "${c.section}" -> "${SECTION_LABELS[finalKey]}" (quote found there)`
      );
    }
    corrected.push({ n: c.n, section: SECTION_LABELS[finalKey], quote: c.quote, url: label.citationUrl });
  }
  return corrected;
}

const SYSTEM_PROMPT = `You draft a professional prior authorization letter for a prescriber, in Markdown.
STRICT RULES:
- Use ONLY the provided letter facts for patient/prescriber details; never invent facts.
- Every clinical claim about the medication must come ONLY from the provided FDA label sections and MUST end with a citation marker like [1].
- Each citation's "quote" MUST be copied VERBATIM (exact characters) from a label section and be at least 8 words long.
- The patient has TWO diagnoses. In the Clinical Rationale, cite BOTH: (a) the glycemic-control / type 2 diabetes indication AND (b) the heart-failure indication — each as its OWN citation quoting the exact matching sentence from Indications and Usage. Also cite the dosing from Dosage and Administration. Each clinical claim cites the sentence that supports it.
- Structure the letter EXACTLY: a header with "**To:**", "**Date:**", and "**Re:**" (patient name · plan id · drug/dose/frequency), then sections "**Diagnoses:**", "**Clinical Rationale:**" (with citations), "**Continuity of Therapy:**", "**Request:**", and a prescriber signature block (name, specialty, clinic, city, NPI).
- Continuity of Therapy must contain ONLY the provided facts (already established on therapy; the plan requires prior authorization; the named supply is in place). NO uncited clinical claims there.
- Return ONLY JSON: {"letterMd":"<markdown>","citations":[{"n":1,"section":"<section name>","quote":"<verbatim label text, >= 8 words>"}]}.
- Every [n] in letterMd must have a matching citation, and every citation must be used. Do NOT include URLs.`;

function capForPrompt(text: string, max = 3000): string {
  return text.length <= max ? text : `${text.slice(0, max)} …`;
}

function buildUserPrompt(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData,
  date: string
): string {
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  const prog = programLabel(rx.program);
  const prescriber = `${DEMO_PRESCRIBER.name}, ${DEMO_PRESCRIBER.specialty}, ${DEMO_PRESCRIBER.clinic}, ${DEMO_PRESCRIBER.city}, NPI ${DEMO_PRESCRIBER.npi} (demo)`;
  return [
    `Letter facts (use verbatim; do not invent):`,
    `To: Pharmacy Benefits — Prior Authorization Department`,
    `Date: ${date}`,
    `Patient: ${patient.name}`,
    `Plan ID: ${patient.planId ?? "(on file)"}`,
    `Medication: ${med}`,
    `Diagnoses: ${diagnoses}`,
    `Already established on therapy: yes`,
    `Access program in place: ${prog.supply ? prog.label : "(none)"}`,
    `Prescriber: ${prescriber}`,
    ``,
    `FDA label sections (quote VERBATIM; each quote at least 8 words):`,
    ``,
    `[Indications and Usage]`,
    capForPrompt(label.sections.indications_and_usage),
    ``,
    `[Dosage and Administration]`,
    capForPrompt(label.sections.dosage_and_administration),
    ``,
    `[Contraindications]`,
    capForPrompt(label.sections.contraindications),
    ``,
    `[Warnings and Cautions]`,
    capForPrompt(label.sections.warnings_and_cautions),
  ].join("\n");
}

/** First verbatim sentence (>= minWords) in `sectionNorm` containing any keyword. */
function findSentence(sectionNorm: string, keywords: string[], minWords = 8): string {
  for (const sentence of sectionNorm.split(/(?<=\.)\s+/)) {
    const s = sentence.trim();
    if (wordCount(s) >= minWords && keywords.some((k) => s.toLowerCase().includes(k))) {
      return s;
    }
  }
  return "";
}

/** Take a verbatim span of >= minWords from a (already normalized) section. */
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

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Deterministic, professional letter that quotes the label verbatim, matching the LLM structure. */
function templateLetter(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData,
  date: string
): { letterMd: string; citations: Citation[] } {
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  const prog = programLabel(rx.program);

  const indNorm = normWs(label.sections.indications_and_usage);
  const dosNorm = normWs(label.sections.dosage_and_administration);
  const glycemic = findSentence(indNorm, ["glycemic", "type 2 diabetes"]);
  const heartFailure = findSentence(indNorm, ["heart failure"]);
  const dosing = findSentence(dosNorm, ["10 mg", "once daily", "recommended"]) || extractQuote(dosNorm);

  // Professional claim sentences, each backed by a verbatim label quote.
  const claims: { text: string; section: string; quote: string }[] = [];
  if (glycemic) {
    claims.push({
      text: `${rx.drug} is indicated to improve glycemic control in adults with type 2 diabetes mellitus`,
      section: SECTION_LABELS.indications_and_usage,
      quote: glycemic,
    });
  }
  if (heartFailure && heartFailure !== glycemic) {
    claims.push({
      text: `${rx.drug} is also indicated to reduce the risk of cardiovascular death and hospitalization for heart failure in adults with heart failure`,
      section: SECTION_LABELS.indications_and_usage,
      quote: heartFailure,
    });
  }
  if (dosing) {
    claims.push({
      text: `the prescribed regimen is consistent with the FDA-approved dosing`,
      section: SECTION_LABELS.dosage_and_administration,
      quote: dosing,
    });
  }
  if (claims.length === 0) {
    claims.push({
      text: `${rx.drug} is indicated as described in its FDA labeling`,
      section: SECTION_LABELS.indications_and_usage,
      quote: extractQuote(indNorm),
    });
  }

  const citations: Citation[] = [];
  const rationale: string[] = [];
  claims.forEach((c, i) => {
    const n = i + 1;
    citations.push({ n, section: c.section, quote: c.quote, url: label.citationUrl });
    rationale.push(`${cap(c.text)} [${n}].`);
  });

  const continuity = `${patient.name} is currently established on ${med}; the plan requires prior authorization for continued coverage.${
    prog.supply ? ` A ${prog.label} supply is in place so therapy is not interrupted while this request is reviewed.` : ""
  }`;

  const letterMd = [
    `## Prior Authorization Request`,
    ``,
    `**To:** Pharmacy Benefits — Prior Authorization Department`,
    `**Date:** ${date}`,
    `**Re:** ${patient.name} · Plan ID ${patient.planId ?? "(on file)"} · ${med}`,
    ``,
    `**Diagnoses:** ${diagnoses}`,
    ``,
    `**Clinical Rationale:** ${rationale.join(" ")}`,
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

  return { letterMd, citations };
}

async function draftLetter(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData,
  date: string
): Promise<{ letterMd: string; citations: Citation[]; source: "ai" | "template" }> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(rx, patient, label, date) },
  ];

  // Fast model, then retry once. (Reasoning model takes ~88s on this prompt —
  // infeasible within maxDuration=60.) Any failure or failed validation falls
  // through to the template.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const llm = await jsonCall(PaLetterLlmSchema, messages, {
        model: "fast",
        fixtureKey: "paLetter",
        timeoutMs: 20_000,
      });
      const corrected = validateAndCorrect(llm.letterMd, llm.citations, label);
      if (corrected) {
        return { letterMd: llm.letterMd, citations: corrected, source: "ai" };
      }
      console.warn(`[paDrafter] citation validation failed on attempt ${attempt}`);
    } catch (err) {
      console.warn(`[paDrafter] LLM attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { ...templateLetter(rx, patient, label, date), source: "template" };
}

/**
 * Draft the PA for ctx.rxId: load facts + label, draft (AI or template), save a
 * pa_requests row (status draft), and pause for approval. One step:
 * running -> needsApproval (data.action "submit_pa").
 */
export async function paDrafter(ctx: AgentContext): Promise<void> {
  const step = await ctx.step("paDrafter", "Drafting prior authorization…", {
    detail: "Grounding every clinical claim in the FDA label.",
  });
  const startedAt = Date.now();

  try {
    if (!ctx.rxId) throw new Error("no prescription to draft for");

    const { data: rxRow, error: rxErr } = await db
      .from("prescriptions")
      .select("drug, dose, frequency, indication, program")
      .eq("id", ctx.rxId)
      .single();
    if (rxErr || !rxRow) throw new Error(`could not load prescription: ${rxErr?.message ?? "not found"}`);

    const { data: patRow, error: patErr } = await db
      .from("patients")
      .select("name, conditions, plan_id")
      .eq("id", ctx.patientId)
      .single();
    if (patErr || !patRow) throw new Error(`could not load patient: ${patErr?.message ?? "not found"}`);

    const rx: PrescriptionFacts = {
      drug: rxRow.drug,
      dose: rxRow.dose ?? null,
      frequency: rxRow.frequency ?? null,
      indication: rxRow.indication ?? null,
      program: rxRow.program ?? null,
    };
    const patient: PatientFacts = {
      name: patRow.name,
      conditions: patRow.conditions ?? [],
      planId: patRow.plan_id ?? null,
    };

    const label = await getJardianceLabel();
    const { letterMd, citations, source } = await draftLetter(rx, patient, label, displayDate());

    const { data: paRow, error: paErr } = await db
      .from("pa_requests")
      .insert({ rx_id: ctx.rxId, letter_md: letterMd, citations, status: "draft", is_seed: false })
      .select("id")
      .single();
    if (paErr || !paRow) throw new Error(`pa_requests insert failed: ${paErr?.message ?? "no id"}`);

    const draftMs = Date.now() - startedAt;
    const simulated = source === "template" || label.source === "fixture";
    await step.needsApproval(
      "PA ready for review",
      `Drafted from the FDA label with ${citations.length} citation(s) · ${source === "ai" ? "AI-drafted" : "template"}.`,
      { action: "submit_pa", paRequestId: (paRow as { id: string }).id, rxId: ctx.rxId, source, draftMs },
      { simulated }
    );
  } catch (err) {
    await step.blocked("Could not draft the PA", err instanceof Error ? err.message : String(err));
  }
}
