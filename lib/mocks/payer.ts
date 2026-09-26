import "server-only";

import { db } from "@/lib/db/server";
import { MARIA_PLAN_ID } from "@/lib/demo/constants";
import type { PaStatus, Patient } from "@/lib/db/types";

// Simulated payer. Deterministic; shapes mirror a real coverage/PA API so a real
// integration is a small swap later. The coverage agent emits the timeline
// event — the mock itself does not.

export interface CoverageQuote {
  paRequired: boolean;
  copayUsd: number;
  tier: number;
}

export interface PlanInfo {
  planName: string;
  memberId: string;
}

/** Plan name + member ID for a patient's plan (simulated; shapes mirror a real eligibility lookup). */
export function getPlan(planId: string | null): PlanInfo {
  if (planId === MARIA_PLAN_ID) {
    return { planName: "Peach State Health Plus (demo)", memberId: "PSH-4471-0921 (demo)" };
  }
  return { planName: "Commercial PBM (demo)", memberId: "MBR-0000-0000 (demo)" };
}

/** Coverage for a patient's plan. Maria's plan requires PA at a $480 / tier-3 copay. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drug mirrors the real API shape
export function checkCoverage(patient: Pick<Patient, "plan_id">, drug: string): CoverageQuote {
  if (patient.plan_id === MARIA_PLAN_ID) {
    return { paRequired: true, copayUsd: 480, tier: 3 };
  }
  // Default: covered, cheap, low tier.
  return { paRequired: false, copayUsd: 10, tier: 1 };
}

/** Mark a PA request submitted. */
export async function submitPA(paRequestId: string): Promise<{ id: string; status: PaStatus }> {
  const { error } = await db.from("pa_requests").update({ status: "submitted" }).eq("id", paRequestId);
  if (error) {
    console.warn(`[payer] submitPA failed: ${error.message}`);
  }
  return { id: paRequestId, status: "submitted" };
}

/** Payer decision on a PA (called from the demo panel in A7). Real wall-clock decided_at. */
export async function decidePA(
  id: string,
  decision: "approved" | "denied"
): Promise<{ id: string; status: PaStatus }> {
  const { error } = await db
    .from("pa_requests")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.warn(`[payer] decidePA failed: ${error.message}`);
  }
  return { id, status: decision };
}
