import "server-only";

import { z } from "zod";

import { db } from "@/lib/db/server";
import { jsonCall } from "@/lib/llm/grok";
import { getJardianceLabel, type LabelData } from "@/lib/data/openfda";
import { getPlan, type PlanInfo } from "@/lib/mocks/payer";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import type { Citation } from "@/lib/api/contracts";
import type { AgentContext } from "./context";

// PA drafter. The AI writes ONLY the cited Clinical Rationale (clinical claims
// from the FDA label, each cited [n] with a >=8-word verbatim quote). Everything
// else — header, diagnoses, continuity of therapy, request, signature — is
// assembled deterministically from DB facts, so patient-facing prose never
// depends on the model. Validate citations; retry the LLM once; else a
// deterministic template rationale (the demo never hangs).

type PrescriptionFacts = {
  drug: string;
  dose: string | null;
  frequency: string | null;
  indication: string | null;
  program: string | null;
};
type PatientFacts = { name: string; conditions: string[]; planId: string | null };

const PaRationaleLlmSchema = z.object({
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
 * Validate + normalize citations against `rationaleMd`. Returns corrected
 * Citation[] (section fixed to where the quote is actually found, url injected)
 * or null. Rules: refs match; every citation used; each quote >= 8 words and a
 * whitespace-normalized, case-sensitive exact substring of a label section.
 */
function validateAndCorrect(
  rationaleMd: string,
  citations: { n: number; section: string; quote: string }[],
  label: LabelData
): Citation[] | null {
  if (citations.length === 0) return null;

  const used = new Set([...rationaleMd.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
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

const SYSTEM_PROMPT = `You write ONLY the "Clinical Rationale" of a prior authorization letter, in Markdown, plus its citations.
RULES:
- Every clinical claim about the medication comes ONLY from the provided FDA label sections and MUST end with a citation marker like [1].
- Each citation "quote" is copied VERBATIM (exact characters) from a label section and is at least 8 words long.
- The patient has TWO diagnoses. Cite BOTH: (a) the glycemic-control / type 2 diabetes indication AND (b) the heart-failure indication, each as its OWN citation quoting the exact matching sentence from Indications and Usage. Also cite the dosing from Dosage and Administration.
- Write 2-4 sentences of clinical rationale ONLY. Do NOT write any header, greeting, diagnoses list, continuity language, request, or signature — those are added separately.
- Return ONLY JSON: {"rationaleMd":"<sentences with [n] markers>","citations":[{"n":1,"section":"<section name>","quote":"<verbatim label text, >= 8 words>"}]}.
- Every [n] in rationaleMd has a matching citation, and every citation is used. No URLs.`;

function capForPrompt(text: string, max = 3000): string {
  return text.length <= max ? text : `${text.slice(0, max)} …`;
}

function buildUserPrompt(rx: PrescriptionFacts, patient: PatientFacts, label: LabelData): string {
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  return [
    `Medication: ${rx.drug}`,
    `Patient diagnoses (cite the label indication for each): ${diagnoses}`,
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

/** Deterministic Clinical Rationale that quotes the label verbatim (both indications + dosing). */
function templateRationale(
  rx: PrescriptionFacts,
  label: LabelData
): { rationaleMd: string; citations: Citation[] } {
  const indNorm = normWs(label.sections.indications_and_usage);
  const dosNorm = normWs(label.sections.dosage_and_administration);
  const glycemic = findSentence(indNorm, ["glycemic", "type 2 diabetes"]);
  const heartFailure = findSentence(indNorm, ["heart failure"]);
  const dosing = findSentence(dosNorm, ["10 mg", "once daily", "recommended"]) || extractQuote(dosNorm);

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
  const sentences: string[] = [];
  claims.forEach((c, i) => {
    const n = i + 1;
    citations.push({ n, section: c.section, quote: c.quote, url: label.citationUrl });
    sentences.push(`${cap(c.text)} [${n}].`);
  });

  return { rationaleMd: sentences.join(" "), citations };
}

/** Assemble the full letter around a (validated) Clinical Rationale, from DB facts only. */
function assembleLetter(
  rationaleMd: string,
  rx: PrescriptionFacts,
  patient: PatientFacts,
  plan: PlanInfo,
  date: string
): string {
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  const diagnoses = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(on file)";
  const prog = programLabel(rx.program);

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

async function draftRationale(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData
): Promise<{ rationaleMd: string; citations: Citation[]; source: "ai" | "template" }> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(rx, patient, label) },
  ];

  // Fast model, then retry once. (Reasoning model takes ~88s here — infeasible
  // within maxDuration=60.) Any failure or failed validation -> template.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const llm = await jsonCall(PaRationaleLlmSchema, messages, {
        model: "fast",
        fixtureKey: "paLetter",
        timeoutMs: 20_000,
      });
      const corrected = validateAndCorrect(llm.rationaleMd, llm.citations, label);
      if (corrected) {
        return { rationaleMd: llm.rationaleMd, citations: corrected, source: "ai" };
      }
      console.warn(`[paDrafter] citation validation failed on attempt ${attempt}`);
    } catch (err) {
      console.warn(`[paDrafter] LLM attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { ...templateRationale(rx, label), source: "template" };
}

/**
 * Draft the PA for ctx.rxId: load facts + plan + label, draft the cited
 * rationale (AI or template), assemble the full letter deterministically, save a
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
    const plan = getPlan(patient.planId);

    const label = await getJardianceLabel();
    const { rationaleMd, citations, source } = await draftRationale(rx, patient, label);
    const letterMd = assembleLetter(rationaleMd, rx, patient, plan, displayDate());

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
      `Drafted from the FDA label with ${citations.length} citation(s) · ${source === "ai" ? "AI rationale" : "template"}.`,
      { action: "submit_pa", paRequestId: (paRow as { id: string }).id, rxId: ctx.rxId, source, draftMs },
      { simulated }
    );
  } catch (err) {
    await step.blocked("Could not draft the PA", err instanceof Error ? err.message : String(err));
  }
}
