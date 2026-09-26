import "server-only";
import { db } from "@/lib/db/server";
import * as clock from "@/lib/clock";
import { MARIA_ID } from "./constants";
import { createContext } from "@/lib/agents/context";
import { markOnTherapy, raiseAlert, runWatchdog } from "@/lib/agents/watchdog";
import { paDrafter } from "@/lib/agents/paDrafter";
import { router } from "@/lib/agents/router";
import { notify } from "@/lib/agents/patientComms";
import { checkCoverage, decidePA } from "@/lib/mocks/payer";
import type { Patient } from "@/lib/db/types";
import type { DemoReq } from "@/lib/api/contracts";

export async function runDemoAction({ action, day: requestedDay }: DemoReq): Promise<{ day: number }> {
  const started = performance.now();
  if (action === "reset") {
    const { error } = await db.rpc("reset_demo");
    if (error) throw new Error(error.message);
  } else if (action === "advance") await clock.advance(1);
  else if (action === "jump") await clock.setDay(requestedDay!);
  const { day } = await clock.now();
  if (["deny_pa", "approve_pa", "no_pickup"].includes(action)) {
    const { data: rx, error } = await db.from("prescriptions").select("*").eq("patient_id", MARIA_ID)
      .eq("is_seed", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rx) throw new Error("Start Maria's prescription before this demo action");
    const ctx = createContext(MARIA_ID, rx.id);
    if (action === "no_pickup") {
      const { data: order, error: orderError } = await db.from("orders").select("id")
        .eq("rx_id", rx.id).eq("status", "shipped").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (orderError) throw new Error(orderError.message);
      if (!order) throw new Error("No shipped, undelivered order to hold");
      const step = await ctx.step("watchdog", "Simulating a delivery delay…", { simulated: true });
      const { error: updateError } = await db.from("prescriptions").update({ expected_delivery_day: day - 3 }).eq("id", rx.id);
      if (updateError) throw new Error(updateError.message);
      await step.done("Delivery held for follow-up", "The shipment has not arrived.", { deliveryHeld: true, orderId: order.id, day });
    } else {
      const decision = action === "deny_pa" ? "denied" : "approved";
      const { data: pa, error: paError } = await db.from("pa_requests").select("id,status")
        .eq("rx_id", rx.id).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (paError) throw new Error(paError.message);
      if (pa) {
        const step = await ctx.step("payer", "Recording insurer decision…", { simulated: true });
        await decidePA(pa.id, decision);
        await step.done(`PA ${decision}`, null, { day, paRequestId: pa.id, decision });
      } else {
        const { data: previous, error: previousError } = await db.from("pa_requests").select("id")
          .eq("rx_id", rx.id).eq("status", decision).limit(1);
        if (previousError) throw new Error(previousError.message);
        if (!previous?.length) throw new Error("No submitted PA is awaiting a decision");
      }
      if (decision === "denied") {
        await raiseAlert(ctx, "pa_denied", day);
        const { data: patient, error: patientError } = await db.from("patients").select("*").eq("id", MARIA_ID).single();
        if (patientError) throw new Error(patientError.message);
        const { data: events, error: eventError } = await db.from("agent_events").select("agent,status,data")
          .eq("rx_id", rx.id).in("status", ["needs_approval", "approved", "rejected", "done"]);
        if (eventError) throw new Error(eventError.message);
        const hasReroute = events?.some((e) => e.agent === "router" && e.data?.paDenied);
        const hasAppeal = events?.some((e) => e.agent === "paDrafter" && e.data?.appeal);
        const results = await Promise.allSettled([
          hasAppeal ? Promise.resolve() : paDrafter(ctx, { appeal: true }),
          hasReroute ? Promise.resolve() : router(patient as Patient, checkCoverage(patient as Patient, rx.drug), ctx, { paDenied: true }),
        ]);
        for (const result of results) if (result.status === "rejected") throw result.reason;
      } else {
        await markOnTherapy(ctx, day);
        if (pa) await notify(ctx, "pa_approved", { preferTemplate: true });
      }
    }
  }
  await runWatchdog(day);
  console.info(`[demo] ${action} ${Math.round(performance.now() - started)}ms day=${day}`);
  return { day };
}
