// STUB — replaced in A2..A6.
//
// POST /api/approve  { eventId, decision, actor, via } -> { ok: true }
//
// Records a human decision on a needs_approval agent_event. If the DB is
// available it marks the event approved/rejected (so B can test the approval
// card end to end); otherwise it just validates and returns ok.

import type { NextRequest } from "next/server";

import { ApproveReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import { markEventDecision } from "@/lib/api/stub-events";

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }

  const parsed = ApproveReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }
  const { eventId, decision } = parsed.data;

  await markEventDecision(eventId, decision);

  return jsonResponse({ ok: true as const });
}
