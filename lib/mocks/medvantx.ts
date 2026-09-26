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

/** Enroll a prescription in a program. Idempotent: reuses an existing enrollment for rx+program. */
export async function enroll(
  ctx: AgentContext,
  rxId: string,
  program: EnrollmentProgram
): Promise<EnrollResult> {
  const { data: existing } = await db
    .from("enrollments")
    .select("id")
    .eq("rx_id", rxId)
    .eq("program", program)
    .limit(1);

  let enrollmentId: string;
  if (existing && existing.length > 0) {
    enrollmentId = (existing[0] as { id: string }).id;
  } else {
    const day = (await now()).day;
    const { data, error } = await db
      .from("enrollments")
      .insert({
        rx_id: rxId,
        program,
        start_day: day,
        end_day: day + SUPPLY_DAYS,
        status: "active",
        is_seed: false,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(`medvantx.enroll failed: ${error.message}`);
    }
    enrollmentId = (data as { id: string }).id;
  }

  await ctx.emit({
    agent: "medvantx",
    status: "done",
    title: `Enrolled in ${PROGRAM_LABELS[program] ?? program}`,
    detail: `${SUPPLY_DAYS}-day supply · ships in ${SHIPS_IN_DAYS} days.`,
    simulated: true,
    data: { enrollmentId, program },
  });

  return { enrollmentId, supplyDays: SUPPLY_DAYS, shipsInDays: SHIPS_IN_DAYS };
}

export async function createCashPayOrder(
  ctx: AgentContext,
  rxId: string
): Promise<{ orderId: string; amountUsd: number }> {
  const { data, error } = await db
    .from("orders")
    .insert({ rx_id: rxId, amount_usd: CASH_PAY_PRICE_USD, status: "created", is_seed: false })
    .select("id")
    .single();
  if (error) {
    throw new Error(`medvantx.createCashPayOrder failed: ${error.message}`);
  }
  const orderId = (data as { id: string }).id;

  await ctx.emit({
    agent: "medvantx",
    status: "done",
    title: "Cash Pay order created",
    detail: `$${CASH_PAY_PRICE_USD} self-pay order.`,
    simulated: true,
    data: { orderId, amountUsd: CASH_PAY_PRICE_USD },
  });

  return { orderId, amountUsd: CASH_PAY_PRICE_USD };
}

export async function orderStatus(ctx: AgentContext, orderId: string): Promise<{ status: string }> {
  const { data, error } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (error) {
    throw new Error(`medvantx.orderStatus failed: ${error.message}`);
  }
  const status = (data as { status: string } | null)?.status ?? "unknown";

  await ctx.emit({
    agent: "medvantx",
    status: "done",
    title: `Order status: ${status}`,
    simulated: true,
    data: { orderId, status },
  });

  return { status };
}
