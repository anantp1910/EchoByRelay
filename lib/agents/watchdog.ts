import "server-only";
import { db } from "@/lib/db/server";
import { operationId } from "@/lib/db/identity";
import { now } from "@/lib/clock";
import type { AlertKind, Prescription } from "@/lib/db/types";
import { createContext, type AgentContext } from "./context";
import { notify } from "./patientComms";
import { bridgeCliff, deliveryAction, sustainableAccess } from "./watchdogRules";

export async function raiseAlert(ctx: AgentContext, kind: AlertKind, day: number): Promise<void> {
  // The primary key prevents duplicate inserts across server instances.
  const id = operationId("alert", String(ctx.rxId), kind);
  const { data: existing, error: readError } = await db.from("alerts").select("id")
    .eq("rx_id", ctx.rxId).eq("kind", kind).limit(1);
  if (readError) throw new Error(readError.message);
  if (existing?.length) return;
  const { data, error } = await db.from("alerts").upsert({
    id, rx_id: ctx.rxId, kind, severity: kind === "pa_denied" ? "critical" : "warning",
    resolved: false, is_seed: false,
  }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return;
  const titles: Record<string, string> = {
    bridge_cliff: "Bridge supply ends within 7 days", pa_denied: "Prior authorization denied", no_pickup: "Medicine delivery overdue",
  };
  const step = await ctx.step("watchdog", "Checking therapy access…", { simulated: true });
  const { error: updateError } = await db.from("prescriptions").update({ status: "at_risk" }).eq("id", ctx.rxId);
  if (updateError) { await step.blocked("Could not update therapy risk", updateError.message); throw new Error(updateError.message); }
  await step.done(titles[kind] ?? kind, "The care team needs to review the access plan.", { kind, day, alertId: id });
}

export async function markOnTherapy(ctx: AgentContext, day: number): Promise<void> {
  const { data: orders, error: orderError } = await db.from("orders").select("id")
    .eq("rx_id", ctx.rxId).eq("status", "delivered").limit(1);
  if (orderError) throw new Error(orderError.message);
  if (!orders?.length) return;
  const { data: alerts, error: alertError } = await db.from("alerts").select("id").eq("rx_id", ctx.rxId);
  if (alertError) throw new Error(alertError.message);
  const { data: reroutes, error: rerouteError } = await db.from("agent_events").select("id")
    .eq("rx_id", ctx.rxId).contains("data", { paDenied: true }).limit(1);
  if (rerouteError) throw new Error(rerouteError.message);
  const { data: changed, error } = await db.from("prescriptions").update({ status: "on_therapy" })
    .eq("id", ctx.rxId).neq("status", "on_therapy").select("id");
  if (error) throw new Error(error.message);
  const { error: resolveError } = await db.from("alerts").update({ resolved: true }).eq("rx_id", ctx.rxId).eq("resolved", false);
  if (resolveError) throw new Error(resolveError.message);
  if (changed?.length) {
    const step = await ctx.step("watchdog", "Confirming medicine access…", { simulated: true });
    await step.done("On therapy — medicine delivered", "The patient has medicine; open access alerts are resolved.", {
      day, onTherapy: true, rescued: Boolean(alerts?.length || reroutes?.length),
    });
  }
}

/** Reconcile delivery before evaluating remaining access risks. */
export async function runWatchdog(day?: number): Promise<void> {
  day ??= (await now()).day;
  const { data: prescriptions, error } = await db.from("prescriptions").select("*")
    .eq("is_seed", false).neq("status", "abandoned");
  if (error) throw new Error(error.message);
  for (const rx of (prescriptions ?? []) as Prescription[]) {
    const ctx = createContext(rx.patient_id, rx.id);
    const results = await Promise.all([
      db.from("orders").select("id,status,enrollment_id,amount_usd").eq("rx_id", rx.id),
      db.from("enrollments").select("id,program,end_day,status").eq("rx_id", rx.id),
      db.from("pa_requests").select("id,status").eq("rx_id", rx.id).eq("status", "approved"),
      db.from("agent_events").select("data").eq("rx_id", rx.id).contains("data", { deliveryHeld: true }),
      db.from("payments").select("order_id").eq("status", "succeeded"),
    ]);
    for (const result of results) if (result.error) throw new Error(result.error.message);
    const [ordersResult, enrollmentsResult, paResult, heldResult, paidResult] = results;
    const enrollments = enrollmentsResult.data ?? [];
    const approved = Boolean(paResult.data?.length);
    const heldIds = new Set((heldResult.data ?? []).map((e) => e.data?.orderId));
    const paidIds = new Set((paidResult.data ?? []).map((p) => p.order_id));
    for (const order of ordersResult.data ?? []) {
      const enrollment = enrollments.find((e) => e.id === order.enrollment_id);
      const sustainable = sustainableAccess(enrollment?.program, paidIds.has(order.id), approved);
      if (order.status === "delivered") {
        if (sustainable) await markOnTherapy(ctx, day);
        continue;
      }
      const action = deliveryAction({ status: order.status, expectedDay: rx.expected_delivery_day, day, held: heldIds.has(order.id) });
      if (action === "no_pickup") await raiseAlert(ctx, "no_pickup", day);
      if (action !== "deliver") continue;
      const step = await ctx.step("watchdog", "Confirming delivery…", { simulated: true });
      try {
        const { data: delivered, error: deliveryError } = await db.from("orders").update({ status: "delivered" })
          .eq("id", order.id).eq("status", "shipped").select("id");
        if (deliveryError) throw new Error(deliveryError.message);
        if (!delivered?.length) { await step.done("Delivery already confirmed"); continue; }
        await step.done("Medicine delivered", `${rx.drug} delivery confirmed on day ${day}.`, { day, orderId: order.id, program: enrollment?.program ?? null, delivered: true });
        if (sustainable) await markOnTherapy(ctx, day);
        await notify(ctx, "delivered", { preferTemplate: true });
      } catch (err) {
        await step.blocked("Delivery reconciliation failed", err instanceof Error ? err.message : String(err));
        throw err;
      }
    }
    const { data: current, error: currentError } = await db.from("prescriptions").select("status").eq("id", rx.id).single();
    if (currentError) throw new Error(currentError.message);
    if (current.status === "on_therapy") continue;
    if (enrollments.some((e) => bridgeCliff({ program: e.program, status: e.status, endDay: e.end_day }, day, approved))) {
      await raiseAlert(ctx, "bridge_cliff", day);
    }
  }
}
