import "server-only";

import { z } from "zod";

import { db } from "@/lib/db/server";
import { jsonCall } from "@/lib/llm/grok";
import { getJardianceLabel, type LabelData } from "@/lib/data/openfda";
import type { Citation } from "@/lib/api/contracts";
import type { AgentContext } from "./context";

// PA drafter. Builds a cited prior-authorization letter for the prescription:
// patient facts come ONLY from the DB; clinical claims come ONLY from the FDA
// label and are cited [n]. Validates the citations; retries the LLM once; then
// falls back to a deterministic, professional template (the demo never hangs).

type PrescriptionFacts = {
  drug: string;
  dose: string | null;
  frequency: string | null;
  indication: string | null;
};
type PatientFacts = { name: string; conditions: string[] };

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

/**
 * Validate and normalize citations. Returns corrected Citation[] (section names
 * fixed to where the quote is actually found, url injected) or null on failure.
 * Rules: refs match; every citation used; each quote >= 8 words and a
 * whitespace-normalized, case-sensitive exact substring of a label section.
 */
function validateAndCorrect(
  letterMd: string,
  citations: { n: number; section: string; quote: string }[],
  label: LabelData
): Citation[] | null {
  if (citations.length === 0) return null;

  const used = new Set([...letterMd.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const defined = new Set(citations.map((c) => c.n));
  for (const n of used) if (!defined.has(n)) return null; // ref with no citation
  for (const n of defined) if (!used.has(n)) return null; // citation never used

  const sectionsNorm = {} as Record<SectionKey, string>;
  for (const key of SECTION_KEYS) sectionsNorm[key] = normWs(label.sections[key]);

  const corrected: Citation[] = [];
  for (const c of citations) {
    const quote = normWs(c.quote);
    if (wordCount(quote) < 8) return null;

    const containing = SECTION_KEYS.filter((k) => sectionsNorm[k].includes(quote));
    if (containing.length === 0) return null; // not found in any section

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

const SYSTEM_PROMPT = `You draft a prior authorization letter for a prescriber, in Markdown.
STRICT RULES:
- Use ONLY the provided patient facts for patient details; never invent patient facts.
- Every clinical claim about the medication must come ONLY from the provided FDA label sections and MUST end with a citation marker like [1].
- Each citation's "quote" MUST be copied VERBATIM (exact characters) from one label section and be at least 8 words long.
- Use a SEPARATE citation for each distinct section you quote: cite a dosing claim to the Dosage and Administration section and an indication claim to the Indications and Usage section. Do not reuse one citation for claims from different sections.
- Emphasize continuity of therapy: the patient is already established on the drug; interrupting it risks destabilizing management.
- Structure the letter: a header (patient, diagnoses, medication), a body (clinical rationale with citations, then a continuity-of-therapy argument, then an explicit request), and a professional closing.
- Return ONLY JSON: {"letterMd":"<markdown>","citations":[{"n":1,"section":"<section name>","quote":"<verbatim label text, >= 8 words>"}]}.
- Every [n] in letterMd must have a matching citation, and every citation must be used. Do NOT include URLs.`;

function capForPrompt(text: string, max = 3000): string {
  return text.length <= max ? text : `${text.slice(0, max)} …`;
}

function buildUserPrompt(rx: PrescriptionFacts, patient: PatientFacts, label: LabelData): string {
  const conditions = patient.conditions.length ? patient.conditions.join("; ") : rx.indication ?? "(none on file)";
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  return [
    `Patient name: ${patient.name}`,
    `Documented conditions: ${conditions}`,
    `Medication: ${med}`,
    `Already established on therapy: yes (continuity of care matters)`,
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

/** Deterministic, professional letter that quotes the label verbatim. Passes validateAndCorrect. */
function templateLetter(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData
): { letterMd: string; citations: Citation[] } {
  const med = [rx.drug, rx.dose, rx.frequency].filter(Boolean).join(" ");
  const diagnoses = patient.conditions.length
    ? patient.conditions.join("; ")
    : rx.indication ?? "the patient's documented condition";

  const indQuote = extractQuote(normWs(label.sections.indications_and_usage));
  const dosQuote = extractQuote(normWs(label.sections.dosage_and_administration));

  const citations: Citation[] = [];
  const clinical: string[] = [];
  let n = 0;

  clinical.push(
    `I am writing to request prior authorization for ${rx.drug} for the patient identified above, who is already established on this therapy.`
  );
  if (indQuote && wordCount(indQuote) >= 8) {
    n += 1;
    citations.push({ n, section: SECTION_LABELS.indications_and_usage, quote: indQuote, url: label.citationUrl });
    clinical.push(`Per the FDA-approved labeling, ${indQuote} [${n}].`);
  }
  if (dosQuote && wordCount(dosQuote) >= 8) {
    n += 1;
    citations.push({ n, section: SECTION_LABELS.dosage_and_administration, quote: dosQuote, url: label.citationUrl });
    clinical.push(`The prescribed regimen is consistent with the labeled dosing: ${dosQuote} [${n}].`);
  }

  const letterMd = [
    `## Prior Authorization Request`,
    ``,
    `**Patient:** ${patient.name}`,
    `**Diagnoses:** ${diagnoses}`,
    `**Requested medication:** ${med}`,
    ``,
    `To the Utilization Review Department,`,
    ``,
    clinical.join(" "),
    ``,
    `This patient is currently stabilized on ${rx.drug}. Interrupting treatment while authorization is pending would risk destabilizing management that has already been achieved, and a Medvantx Bridge supply is in place specifically to prevent a gap in therapy. I therefore respectfully request approval so that treatment can continue without interruption.`,
    ``,
    `Thank you for your prompt review. Please contact my office with any questions.`,
    ``,
    `Sincerely,`,
    `Prescribing Physician`,
  ].join("\n");

  return { letterMd, citations };
}

async function draftLetter(
  rx: PrescriptionFacts,
  patient: PatientFacts,
  label: LabelData
): Promise<{ letterMd: string; citations: Citation[]; source: "ai" | "template" }> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(rx, patient, label) },
  ];

  // Use the FAST model, then retry once. (The reasoning model takes ~88s on this
  // prompt — infeasible within maxDuration=60; it always timed out and fell to
  // template. Fast drafts a valid cited letter in ~9s.) Any failure (incl. two
  // timeouts) or failed validation falls through to the template.
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

  return { ...templateLetter(rx, patient, label), source: "template" };
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
      .select("drug, dose, frequency, indication")
      .eq("id", ctx.rxId)
      .single();
    if (rxErr || !rxRow) throw new Error(`could not load prescription: ${rxErr?.message ?? "not found"}`);

    const { data: patRow, error: patErr } = await db
      .from("patients")
      .select("name, conditions")
      .eq("id", ctx.patientId)
      .single();
    if (patErr || !patRow) throw new Error(`could not load patient: ${patErr?.message ?? "not found"}`);

    const rx: PrescriptionFacts = {
      drug: rxRow.drug,
      dose: rxRow.dose ?? null,
      frequency: rxRow.frequency ?? null,
      indication: rxRow.indication ?? null,
    };
    const patient: PatientFacts = { name: patRow.name, conditions: patRow.conditions ?? [] };

    const label = await getJardianceLabel();
    const { letterMd, citations, source } = await draftLetter(rx, patient, label);

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
