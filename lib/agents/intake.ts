import { z } from "zod";

import { jsonCall } from "@/lib/llm/grok";
import { DEMO_DRUG } from "@/lib/demo/constants";
import type { AgentContext } from "./context";

// Intake agent: turn a doctor's spoken sentence into a structured prescription.
// Primary path is Grok (fast model); on any LLM failure it falls back to a
// deterministic regex parser so the demo never hangs.
//
// parseIntake() is pure (no DB) and unit-testable (scripts/intake-cases.ts).
// intake() wraps it with timeline events via ctx.emit.

export interface IntakeResult {
  patientName: string;
  drug: string;
  dose: string;
  frequency: string;
  indication: string;
  source: "ai" | "fallback";
}

const IntakeSchema = z.object({
  patientName: z.string(),
  drug: z.string(),
  dose: z.string(),
  frequency: z.string(),
  indication: z.string(),
});

const SYSTEM_PROMPT = `You extract a structured prescription from a doctor's spoken sentence.
Return ONLY a JSON object with these string fields:
- patientName: the patient's name as spoken
- drug: the medication name (brand or generic)
- dose: amount with units, e.g. "10 mg" (empty string if not stated)
- frequency: how often, e.g. "once daily" (empty string if not stated)
- indication: the condition treated, ONLY if stated; otherwise an empty string
Never invent an indication. Output valid JSON with no commentary or code fences.`;

/** A parse is usable if we recovered at least a drug name. */
export function isUsableIntake(result: IntakeResult): boolean {
  return result.drug.trim().length > 0;
}

/** Pure parse: Grok first, deterministic fallback on any failure. No DB writes. */
export async function parseIntake(transcript: string): Promise<IntakeResult> {
  try {
    const ai = await jsonCall(
      IntakeSchema,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
      { model: "fast", fixtureKey: "intake", timeoutMs: 10_000 }
    );
    return { ...ai, source: "ai" };
  } catch {
    return { ...fallbackParse(transcript), source: "fallback" };
  }
}

const FREQUENCY_RE =
  /\b(once daily|twice daily|three times daily|once a day|twice a day|every morning|at bedtime|nightly|weekly|daily|q\.?d\.?|b\.?i\.?d\.?|t\.?i\.?d\.?)\b/i;
const DOSE_RE = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?)\b/i;

/**
 * Deterministic parser for "Starting/Continue <name> on <drug>, <n> mg <freq>".
 * Returns empty fields for input it can't understand (drug === "" => unusable).
 */
function fallbackParse(transcript: string): Omit<IntakeResult, "source"> {
  const text = transcript.replace(/\s+/g, " ").trim();

  const nameOn = text.match(/\b(?:starting|start|continue|begin|put)\s+(.+?)\s+on\s+(.+)$/i);
  const patientName = nameOn ? nameOn[1].trim() : "";
  const rest = nameOn ? nameOn[2].trim() : text;

  const doseMatch = rest.match(DOSE_RE);
  const dose = doseMatch ? `${doseMatch[1]} ${doseMatch[2].toLowerCase()}` : "";

  const freqMatch = rest.match(FREQUENCY_RE);
  const frequency = freqMatch ? freqMatch[1].toLowerCase() : "";

  // Only treat text as a drug when there's structure (an "on <drug>" or a dose),
  // so pure gibberish yields an empty (unusable) drug.
  let drug = "";
  if (nameOn || doseMatch) {
    let end = rest.length;
    const comma = rest.indexOf(",");
    if (comma >= 0) end = Math.min(end, comma);
    if (doseMatch?.index !== undefined) end = Math.min(end, doseMatch.index);
    if (freqMatch?.index !== undefined) end = Math.min(end, freqMatch.index);
    drug = rest.slice(0, end).trim().replace(/[.,]+$/, "");
  }

  // Indication only when we recognize the demo drug; never invented otherwise.
  const indication =
    drug && drug.toLowerCase() === DEMO_DRUG.name.toLowerCase() ? DEMO_DRUG.indication : "";

  return { patientName, drug, dose, frequency, indication };
}

/** Intake as one step: running -> done (or blocked if unusable). */
export async function intake(transcript: string, ctx: AgentContext): Promise<IntakeResult> {
  const s = await ctx.step("intake", "Listening to the prescription…", {
    detail: "Parsing the doctor's sentence.",
  });

  let result: IntakeResult;
  try {
    result = await parseIntake(transcript);
  } catch (err) {
    await s.blocked("Couldn't process the prescription", err instanceof Error ? err.message : String(err));
    throw err;
  }

  if (!isUsableIntake(result)) {
    await s.blocked(
      "Couldn't understand the prescription",
      "No medication was recognized. Please repeat the order.",
      { simulated: result.source === "fallback" }
    );
    return result;
  }

  const summary = [result.drug, result.dose, result.frequency].filter(Boolean).join(" ");
  await s.done(
    `Understood: ${summary}`,
    result.source === "ai" ? "Parsed by Grok (fast model)." : "Parsed by deterministic fallback (no AI).",
    undefined,
    { simulated: result.source === "fallback" }
  );

  return result;
}
