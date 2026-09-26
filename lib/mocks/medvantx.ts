import "server-only";

import { db } from "@/lib/db/server";
import { now } from "@/lib/clock";
import type { AgentContext } from "@/lib/agents/context";
import type { EnrollmentProgram } from "@/lib/db/types";

// Simulated Medvantx. Shapes mirror the real program/enrollment/order API.
// Stateful calls (enroll, createCashPayOrder, orderStatus) write rows and emit a
// simulated=true timeline event. listPrograms is pure data (no side effects).

const PROGRAM_LABELS: Record<string, string> = {
  bridge: "Medvantx Bridge",
  quick_start: "Medvantx Quick Start",
  pap: "Patient Assistance Program",
  cash_pay: "Medvantx Cash Pay",
  retail_copay_card: "Retail Copay Card",
};

const SUPPLY_DAYS = 30;
const SHIPS_IN_DAYS = 2;
const CASH_PAY_PRICE_USD = 89;

export interface EnrollResult {
  enrollmentId: string;
  supplyDays: number;
  shipsInDays: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drug mirrors the real API shape
export function listPrograms(drug: string): EnrollmentProgram[] {
  return ["bridge", "quick_start", "pap", "cash_pay", "retail_copay_card"];
}

// Reuse or create an enrollment for rx+program; returns its id. bridge/quick_start
// get a supply window (end_day); other programs have no fixed window.
async function ensureEnrollment(rxId: string, program: EnrollmentProgram): Promise<string> {
  const { data: existing } = await db
    .from("enrollments")
    .select("id")
    .eq("rx_id", rxId)
    .eq("program", program)
    .limit(1);
  if (existing && existing.length > 0) {
    return (existing[0] as { id: string }).id;
  }

  const day = (await now()).day;
  const windowed = program === "bridge" || program === "quick_start";
  const { data, error } = await db
    .from("enrollments")
    .insert({
      rx_id: rxId,
      program,
      start_day: day,
      end_day: windowed ? day + SUPPLY_DAYS : null,
      status: "active",
      is_seed: false,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`ensureEnrollment(${program}) failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/** Enroll a prescription in a program. Idempotent: reuses an existing enrollment for rx+program. */
export async function enroll(
  ctx: AgentContext,
  rxId: string,
  program: EnrollmentProgram
): Promise<EnrollResult> {
  const label = PROGRAM_LABELS[program] ?? program;
  const s = await ctx.step("medvantx", `Enrolling in ${label}…`, { simulated: true });

  try {
    const enrollmentId = await ensureEnrollment(rxId, program);

    await s.done(`Enrolled in ${label}`, `${SUPPLY_DAYS}-day supply · ships in ${SHIPS_IN_DAYS} days.`, {
      enrollmentId,
      program,
    });
    return { enrollmentId, supplyDays: SUPPLY_DAYS, shipsInDays: SHIPS_IN_DAYS };
  } catch (err) {
    await s.blocked("Enrollment failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function createCashPayOrder(
  ctx: AgentContext,
  rxId: string
): Promise<{ orderId: string; amountUsd: number }> {
  const s = await ctx.step("medvantx", "Creating Cash Pay order…", { simulated: true });

  try {
    // Ensure a cash_pay enrollment exists for this rx, and link the order to it
    // (checkout's free-program guard reads the order's enrollment program).
    const enrollmentId = await ensureEnrollment(rxId, "cash_pay");

    const { data, error } = await db
      .from("orders")
      .insert({
        rx_id: rxId,
        enrollment_id: enrollmentId,
        amount_usd: CASH_PAY_PRICE_USD,
        status: "created",
        is_seed: false,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(`medvantx.createCashPayOrder failed: ${error.message}`);
    }
    const orderId = (data as { id: string }).id;

    await s.done("Cash Pay order created", `$${CASH_PAY_PRICE_USD} self-pay order.`, {
      orderId,
      amountUsd: CASH_PAY_PRICE_USD,
    });
    return { orderId, amountUsd: CASH_PAY_PRICE_USD };
  } catch (err) {
    await s.blocked("Cash Pay order failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function orderStatus(ctx: AgentContext, orderId: string): Promise<{ status: string }> {
  const s = await ctx.step("medvantx", "Checking order status…", { simulated: true });

  try {
    const { data, error } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
    if (error) {
      throw new Error(`medvantx.orderStatus failed: ${error.message}`);
    }
    const status = (data as { status: string } | null)?.status ?? "unknown";

    await s.done(`Order status: ${status}`, null, { orderId, status });
    return { status };
  } catch (err) {
    await s.blocked("Order status check failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
