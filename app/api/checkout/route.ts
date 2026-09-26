// STUB — replaced in A2..A6.
//
// POST /api/checkout  { orderId, payerMemberId, capUsd, recurring, passkeyConfirmed }
//   -> { status, visaRef, reason, steps[] }
//
// Simulates the Visa Intelligent Commerce five-step flow. Declines (409-free,
// 200 with status "declined") when the passkey is not confirmed; otherwise
// returns "paid" with a fake visaRef. Replaced by the real checkout agent + Visa
// mock in A6. No DB writes here.

import type { NextRequest } from "next/server";

import {
  CheckoutReqSchema,
  CheckoutRes,
  errorResponse,
  jsonResponse,
} from "@/lib/api/contracts";

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }

  const parsed = CheckoutReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }
  const { passkeyConfirmed } = parsed.data;

  if (!passkeyConfirmed) {
    const declined: CheckoutRes = {
      status: "declined",
      visaRef: null,
      reason: "Passkey not confirmed",
      steps: [
        { name: "enroll_card", ok: true, simulated: true },
        { name: "create_instruction", ok: true, simulated: true },
        { name: "verify_passkey", ok: false, simulated: true },
        { name: "pay", ok: false, simulated: true },
        { name: "confirm_outcome", ok: false, simulated: true },
      ],
    };
    return jsonResponse(declined);
  }

  const paid: CheckoutRes = {
    status: "paid",
    visaRef: `VISA-SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    reason: null,
    steps: [
      { name: "enroll_card", ok: true, simulated: true },
      { name: "create_instruction", ok: true, simulated: true },
      { name: "verify_passkey", ok: true, simulated: true },
      { name: "pay", ok: true, simulated: true },
      { name: "confirm_outcome", ok: true, simulated: true },
    ],
  };
  return jsonResponse(paid);
}
