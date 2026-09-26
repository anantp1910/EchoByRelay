import "server-only";

import { db } from "@/lib/db/server";
import type { Patient } from "@/lib/db/types";
import { createContext, type AgentContext } from "./context";
import { intake, isUsableIntake } from "./intake";
import { coverage } from "./coverage";
import { router } from "./router";

// Orchestrator: plans and runs the agent chain for one prescription.
//
// Phase 3 chain: load patient -> intake -> backfill indication + persist
// (status routing) -> coverage -> router (pauses at needs_approval). The
// /api/approve route resumes the chain (enroll -> draft PA). Every step is
// wrapped so a failure emits a `blocked` event instead of throwing.

// Which of a patient's real diagnoses a drug treats. Used ONLY to backfill the
// indication from patient.conditions — never to invent a diagnosis.
const DRUG_CONDITION_KEYWORDS: Record<string, string[]> = {
  jardiance: ["diabetes", "heart failure"],
  empagliflozin: ["diabetes", "heart failure"],
};

/** Indication from the patient's own conditions that the drug treats; "" if none match. */
export function deriveIndication(drug: string, conditions: string[]): string {
  const keywords = DRUG_CONDITION_KEYWORDS[drug.trim().toLowerCase()];
  if (!keywords) return "";
  return conditions
    .filter((c) => keywords.some((k) => c.toLowerCase().includes(k)))
    .join(", ");
}

/** Insert a fresh prescription (status `new`) and return its id. */
export async function createPrescription(patientId: string): Promise<string> {
  const { data, error } = await db
    .from("prescriptions")
    .insert({
      patient_id: patientId,
      drug: "(pending intake)", // NOT NULL placeholder until intake fills it
      status: "new",
      is_seed: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`createPrescription failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/**
 * Double-submit guard: id of a recent non-seed prescription for this patient
 * still in `new`/`routing`, else null. REAL wall-clock (dedups rapid duplicate
 * HTTP submits), not the demo clock.
 */
export async function findRecentPrescription(
  patientId: string,
  withinSeconds = 30
): Promise<string | null> {
  const sinceIso = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const { data, error } = await db
    .from("prescriptions")
    .select("id")
    .eq("patient_id", patientId)
    .eq("is_seed", false)
    .in("status", ["new", "routing"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn(`[orchestrator] findRecentPrescription failed: ${error.message}`);
    return null;
  }
  return data && data.length > 0 ? (data[0] as { id: string }).id : null;
}

async function emitBlocked(
  ctx: AgentContext,
  agent: string,
  message: string,
  err: unknown
): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  try {
    await ctx.emit({ agent, status: "blocked", title: message, detail });
  } catch (emitErr) {
    console.error(`[orchestrator] failed to emit blocked for ${agent}:`, emitErr, "original:", err);
  }
}

/**
 * Run the chain for an already-created prescription. Never throws: each step
 * degrades to a blocked event. Idempotent w.r.t. prescriptions (never creates
 * one here — the caller passes rxId).
 */
export async function run(
  patientId: string,
  transcript: string,
  opts: { rxId: string }
): Promise<void> {
  const { rxId } = opts;
  const ctx = createContext(patientId, rxId);

  // --- load patient ---
  let patient: Patient;
  try {
    const { data, error } = await db.from("patients").select("*").eq("id", patientId).single();
    if (error) throw new Error(error.message);
    patient = data as Patient;
  } catch (err) {
    await emitBlocked(ctx, "intake", "Could not load the patient", err);
    return;
  }

  // --- intake ---
  let result;
  try {
    result = await intake(transcript, ctx);
  } catch (err) {
    await emitBlocked(ctx, "intake", "Couldn't process the prescription", err);
    return;
  }
  if (!isUsableIntake(result)) {
    // intake already emitted a blocked event; leave the row at status `new`.
    return;
  }

  // --- backfill indication from the patient's real conditions; persist; -> routing ---
  const indication = result.indication || deriveIndication(result.drug, patient.conditions ?? []);
  try {
    const { error } = await db
      .from("prescriptions")
      .update({
        drug: result.drug,
        dose: result.dose || null,
        frequency: result.frequency || null,
        indication: indication || null,
        status: "routing",
      })
      .eq("id", rxId);
    if (error) throw new Error(error.message);
  } catch (err) {
    await emitBlocked(ctx, "intake", "Could not save the prescription", err);
    return;
  }

  // --- coverage ---
  let coverageResult;
  try {
    coverageResult = await coverage(patient, ctx);
  } catch (err) {
    await emitBlocked(ctx, "coverage", "Coverage check failed", err);
    return;
  }

  // --- router (pauses at needs_approval; /api/approve resumes) ---
  try {
    await router(patient, coverageResult, ctx);
  } catch (err) {
    await emitBlocked(ctx, "router", "Routing failed", err);
  }
}
