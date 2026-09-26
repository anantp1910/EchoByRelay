import "server-only";

import { db } from "@/lib/db/server";
import { now } from "@/lib/clock";
import * as visa from "@/lib/mocks/visa";
import { notify } from "./patientComms";
import type { AgentContext } from "./context";
import type { CheckoutRes, CheckoutStep } from "@/lib/api/contracts";

// Checkout agent (Visa Intelligent Commerce, simulated). Free programs never
// touch Visa; only cash_pay orders are payable. Deterministic policy checks
// decline (no charge); success runs the 5-step Visa flow, records the mandate +
// payment, ships the order, and notifies the patient/family. Idempotent.

export interface CheckoutInput {
  orderId: string;
  payerMemberId: string;
  capUsd: number;
  recurring: boolean;
  passkeyConfirmed: boolean;
}

export interface OrderRow {
  id: string;
  rx_id: string;
  enrollment_id: string | null;
  amount_usd: number | null;
  status: string;
}

export interface PrescriptionRow {
  patient_id: string;
  program: string | null;
}

const VISA_STEP_NAMES = [
  "enroll_card",
  "create_instruction",
  "retrieve_credentials",
  "pay",
  "confirm_outcome",
] as const;

function successSteps(): CheckoutStep[] {
  return VISA_STEP_NAMES.map((name) => ({ name, ok: true, simulated: true }));
}

async function decline(ctx: AgentContext, reason: string): Promise<CheckoutRes> {
  const step = await ctx.step("checkout", "Reviewing payment…", { simulated: true });
  await step.done("Payment declined", reason);
  return { status: "declined", visaRef: null, reason, steps: [{ name: "authorize", ok: false, simulated: true }] };
}

/** Program that governs this order: the order's enrollment first, else the prescription. */
async function orderProgram(order: OrderRow, rx: PrescriptionRow): Promise<string | null> {
  if (order.enrollment_id) {
    const { data } = await db
      .from("enrollments")
      .select("program")
      .eq("id", order.enrollment_id)
      .maybeSingle();
    if (data?.program) return data.program as string;
  }
  return rx.program;
}

async function isAuthorizedPayer(payerMemberId: string, patientId: string): Promise<boolean> {
  if (payerMemberId === patientId) return true; // the patient paying for themselves
  const { data } = await db
    .from("care_circle")
    .select("id")
    .eq("id", payerMemberId)
    .eq("patient_id", patientId)
    .eq("can_pay", true)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function visaStep<T>(
  ctx: AgentContext,
  name: string,
  title: string,
  fn: () => T | Promise<T>,
  steps: CheckoutStep[]
): Promise<T> {
  const step = await ctx.step("checkout", `${title}…`, { simulated: true });
  try {
    const result = await fn();
    await step.done(title);
    steps.push({ name, ok: true, simulated: true });
    return result;
  } catch (err) {
    await step.blocked(`${title} failed`, err instanceof Error ? err.message : String(err));
    steps.push({ name, ok: false, simulated: true });
    throw err;
  }
}

/** Run checkout for an already-loaded order + prescription. Returns the contract response. */
export async function checkout(
  ctx: AgentContext,
  order: OrderRow,
  rx: PrescriptionRow,
  input: CheckoutInput
): Promise<CheckoutRes> {
  const amount = Number(order.amount_usd ?? 0);

  // Idempotent: already paid -> return the existing result, no second charge.
  if (order.status === "paid" || order.status === "shipped" || order.status === "delivered") {
    const { data: pay } = await db
      .from("payments")
      .select("visa_ref")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { status: "paid", visaRef: (pay?.visa_ref as string) ?? null, reason: null, steps: successSteps() };
  }

  // Policy gates (no charge on decline).
  const program = await orderProgram(order, rx);
  if (program !== "cash_pay") {
    return decline(ctx, "This program is free — no payment is needed.");
  }
  if (!input.passkeyConfirmed) {
    return decline(ctx, "Passkey not confirmed.");
  }
  if (amount > input.capUsd) {
    return decline(ctx, `Amount $${amount} exceeds the $${input.capUsd} spending cap.`);
  }
  if (!(await isAuthorizedPayer(input.payerMemberId, rx.patient_id))) {
    return decline(ctx, "Payer is not authorized to pay for this patient.");
  }

  // Success: 5-step Visa flow.
  const steps: CheckoutStep[] = [];
  const token = await visaStep(ctx, "enroll_card", "Enrolling card", () => visa.enrollCard(input.payerMemberId), steps);
  const instructionId = await visaStep(
    ctx,
    "create_instruction",
    "Creating purchase instruction",
    () => visa.createPurchaseInstruction({ token, rxId: order.rx_id, merchant: "Medvantx", capUsd: input.capUsd, recurring: input.recurring }),
    steps
  );
  const credential = await visaStep(ctx, "retrieve_credentials", "Retrieving credentials", () => visa.retrieveCredentials(instructionId), steps);
  const visaRef = await visaStep(ctx, "pay", "Paying Medvantx", () => visa.pay(credential, order.id, amount), steps);
  await visaStep(ctx, "confirm_outcome", "Confirming outcome", () => visa.confirmOutcome(instructionId, visaRef), steps);

  // Records: mandate + payment; order paid -> shipped; expected delivery day.
  const { data: mandate, error: mandateErr } = await db
    .from("payment_mandates")
    .insert({
      payer_member_id: input.payerMemberId,
      rx_id: order.rx_id,
      merchant: "Medvantx",
      cap_usd: input.capUsd,
      recurring: input.recurring,
      passkey_verified: true,
      is_seed: false,
    })
    .select("id")
    .single();
  if (mandateErr || !mandate) throw new Error(`payment_mandates insert failed: ${mandateErr?.message ?? "no id"}`);

  const { error: paymentError } = await db.from("payments").insert({
    mandate_id: (mandate as { id: string }).id,
    order_id: order.id,
    amount_usd: amount,
    visa_ref: visaRef,
    status: "succeeded",
    is_seed: false,
  });
  if (paymentError) throw new Error(`payments insert failed: ${paymentError.message}`);

  const day = (await now()).day;
  // Prescription stays `routing`; only expected_delivery_day is set (A6 marks
  // on_therapy on delivery — never before the patient has the medicine).
  const { error: rxError } = await db.from("prescriptions").update({ expected_delivery_day: day + 2 }).eq("id", order.rx_id);
  if (rxError) throw new Error(`delivery schedule failed: ${rxError.message}`);
  const { error: orderError } = await db.from("orders").update({ status: "shipped" }).eq("id", order.id);
  if (orderError) throw new Error(`shipment update failed: ${orderError.message}`);

  const overall = await ctx.step("checkout", "Finalizing payment…", { simulated: true });
  await overall.done(`Paid $${amount} · Visa ref ${visaRef.slice(-4)}`, null, { visaRef, amount });

  // One combined family/patient update (payment + shipping). Template (no LLM)
  // to keep the user-facing checkout within its latency budget.
  await notify(ctx, "payment_done_shipped", { preferTemplate: true, payerMemberId: input.payerMemberId, amountUsd: amount });

  return { status: "paid", visaRef, reason: null, steps };
}
