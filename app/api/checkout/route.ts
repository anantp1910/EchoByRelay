// Checkout route — Phase 6 (replaces the A1.5 stub).
//
// POST /api/checkout  { orderId, payerMemberId, capUsd, recurring, passkeyConfirmed }
//   -> { status, visaRef, reason, steps }
//
// 404 if the order doesn't exist. Otherwise the checkout agent runs the Visa
// flow (or declines with a reason). Awaited (no after()); maxDuration gives the
// Visa steps + family notification room.

import type { NextRequest } from "next/server";

import { CheckoutReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import type { CheckoutRes } from "@/lib/api/contracts";

export const maxDuration = 60;

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const routeStarted = Date.now();

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
  const input = parsed.data;

  if (!hasServerEnv()) {
    const res: CheckoutRes = {
      status: "declined",
      visaRef: null,
      reason: "Payments are temporarily unavailable.",
      steps: [],
    };
    return jsonResponse(res);
  }

  const { db } = await import("@/lib/db/server");

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, rx_id, enrollment_id, amount_usd, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderErr) return errorResponse("internal", orderErr.message);
  if (!order) return errorResponse("not_found", "Order not found");

  const { data: rx, error: rxErr } = await db
    .from("prescriptions")
    .select("patient_id, program")
    .eq("id", order.rx_id)
    .maybeSingle();
  if (rxErr) return errorResponse("internal", rxErr.message);
  if (!rx) return errorResponse("not_found", "Prescription for this order not found");

  const { createContext } = await import("@/lib/agents/context");
  const { checkout } = await import("@/lib/agents/checkout");
  const ctx = createContext(rx.patient_id as string, order.rx_id as string);

  const res = await checkout(
    ctx,
    order as { id: string; rx_id: string; enrollment_id: string | null; amount_usd: number | null; status: string },
    { patient_id: rx.patient_id as string, program: (rx.program as string | null) ?? null },
    input
  );

  console.info(`[checkout] route ${Date.now() - routeStarted}ms status=${res.status}`);
  return jsonResponse(res);
}
