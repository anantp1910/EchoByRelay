import "server-only";

import { db } from "@/lib/db/server";
import { DEMO_DRUG } from "@/lib/demo/constants";
import { createContext, type AgentContext } from "./context";
import { intake, isUsableIntake } from "./intake";

// Orchestrator: plans and runs the agent chain for one prescription.
//
// Phase 2 scope: create the prescription (row lives in status `new`), run
// intake, and — UNTIL A3 replaces them with real agents — emit placeholder
// coverage + router events so the timeline still ends with the Bridge
// needs_approval card Person B is wiring. Every step is wrapped so a failure
// emits a `blocked` event with a human message instead of throwing.

/** Insert a fresh prescription (status `new`) and return its id. */
export async function createPrescription(patientId: string): Promise<string> {
  const { data, error } = await db
    .from("prescriptions")
    .insert({
      patient_id: patientId,
      // NOT NULL placeholder until intake fills the real drug.
      drug: "(pending intake)",
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
 * Double-submit guard: return the id of a recent non-seed prescription for this
 * patient still in `new`/`routing`, else null. Uses REAL wall-clock time (this
 * dedups rapid duplicate HTTP submits), not the demo clock.
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

  // --- persist parsed fields; flip status new -> routing ---
  try {
    const { error } = await db
      .from("prescriptions")
      .update({
        drug: result.drug,
        dose: result.dose || null,
        frequency: result.frequency || null,
        indication: result.indication || null,
        status: "routing",
      })
      .eq("id", rxId);
    if (error) throw new Error(error.message);
  } catch (err) {
    await emitBlocked(ctx, "intake", "Could not save the prescription", err);
    return;
  }

  // --- placeholder coverage (real coverage agent lands in A3) ---
  try {
    await ctx.emit({
      agent: "coverage",
      status: "done",
      title: "Coverage checked",
      detail: "PA required · $480 copay",
      simulated: true,
    });
  } catch (err) {
    await emitBlocked(ctx, "coverage", "Coverage check failed", err);
    return;
  }

  // --- placeholder router (real router lands in A3) ---
  try {
    await ctx.emit({
      agent: "router",
      status: "needs_approval",
      title: "Recommended: Medvantx Bridge",
      detail: "Already on therapy; new plan requires prior authorization.",
      simulated: true,
      data: { action: "enroll", program: "bridge", rxId, drug: DEMO_DRUG.name },
    });
  } catch (err) {
    await emitBlocked(ctx, "router", "Routing failed", err);
  }
}
