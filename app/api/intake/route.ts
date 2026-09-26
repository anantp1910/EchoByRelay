// Intake route — Phase 2 (replaces the A1.5 stub).
//
// POST /api/intake  { patientId, transcript } -> { rxId }
//
// Validates the contract, creates the prescription, and kicks off the
// orchestrator via next/server `after()` so the agent chain runs AFTER the
// response is sent — the client gets { rxId } immediately. maxDuration gives
// after() room on Vercel. Response shape is unchanged from the stub.

import { after } from "next/server";
import type { NextRequest } from "next/server";

import { IntakeReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const maxDuration = 60;

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

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
  const { patientId, transcript } = parsed.data;

  // Works before keys arrive: return a valid id and skip orchestration.
  if (!hasServerEnv()) {
    return jsonResponse({ rxId: crypto.randomUUID() });
  }

  // Dynamic import so a missing key never throws at module load.
  const { createPrescription, findRecentPrescription, run } = await import(
    "@/lib/agents/orchestrator"
  );

  try {
    // Double-submit guard: reuse a very recent in-flight prescription instead
    // of creating (and re-running the chain on) a duplicate.
    const existing = await findRecentPrescription(patientId, 30);
    const rxId = existing ?? (await createPrescription(patientId));

    if (!existing) {
      after(async () => {
        try {
          await run(patientId, transcript, { rxId });
        } catch (err) {
          console.error("[intake] orchestrator run failed:", err);
        }
      });
    }

    return jsonResponse({ rxId });
  } catch (err) {
    console.error("[intake] failed to start:", err);
    return errorResponse("internal", "Could not start intake");
  }
}
