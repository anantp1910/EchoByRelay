// STUB — replaced in A2..A6.
//
// POST /api/intake  { patientId, transcript } -> { rxId }
//
// Creates a demo prescription (if the DB is available) and seeds three
// simulated agent_events so Person B's timeline + approval card have data:
//   1. intake   "done"
//   2. coverage "done"           ("PA required · $480 copay")
//   3. router   "needs_approval" (data: { action:"enroll", program:"bridge", rxId })
// If Supabase env vars are missing, it skips all DB writes and still returns a
// valid { rxId } (a random UUID) so the app works before keys arrive.

import type { NextRequest } from "next/server";

import { IntakeReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import { createStubPrescription, writeStubEvents } from "@/lib/api/stub-events";

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }

  const parsed = IntakeReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }
  const { patientId } = parsed.data;

  // Real rx id if the DB is up; otherwise a throwaway id so the response is valid.
  const createdRxId = await createStubPrescription(patientId);
  const rxId = createdRxId ?? crypto.randomUUID();

  // Only write events when a real prescription row exists (agent_events.rx_id
  // FKs to prescriptions). writeStubEvents itself also no-ops without env.
  if (createdRxId) {
    await writeStubEvents([
      {
        rx_id: rxId,
        patient_id: patientId,
        agent: "intake",
        status: "done",
        title: "Prescription understood",
        detail: "Jardiance 10 mg once daily — type 2 diabetes with heart failure",
      },
      {
        rx_id: rxId,
        patient_id: patientId,
        agent: "coverage",
        status: "done",
        title: "Coverage checked",
        detail: "PA required · $480 copay",
      },
      {
        rx_id: rxId,
        patient_id: patientId,
        agent: "router",
        status: "needs_approval",
        title: "Recommended: Medvantx Bridge",
        detail: "Already on therapy; new plan requires prior authorization.",
        data: { action: "enroll", program: "bridge", rxId },
      },
    ]);
  }

  return jsonResponse({ rxId });
}
