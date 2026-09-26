// Approve route — Phase 3 (replaces the A1.5 stub).
//
// POST /api/approve  { eventId, decision, actor, via } -> { ok: true }
//
// Records a human decision on a needs_approval event and resumes the chain:
//   - 404 if the event is missing
//   - already approved -> { ok: true } (idempotent, no re-work)
//   - not needs_approval -> 409
//   - approve + data.action "enroll": medvantx.enroll, set prescription
//     program/status and expected_delivery_day, then emit "Ready to draft PA"
//   - reject: emit "Doctor declined — no action taken"

import type { NextRequest } from "next/server";

import { ApproveReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import { ENROLLMENT_PROGRAMS, type EnrollmentProgram } from "@/lib/db/types";

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

  const parsed = ApproveReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }
  const { eventId, decision, actor, via } = parsed.data;

  if (!hasServerEnv()) {
    return jsonResponse({ ok: true as const });
  }

  const { db } = await import("@/lib/db/server");

  // Load the event.
  const { data: event, error: loadErr } = await db
    .from("agent_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (loadErr) {
    return errorResponse("internal", loadErr.message);
  }
  if (!event) {
    return errorResponse("not_found", "Event not found");
  }

  // Idempotency + state guards.
  if (event.status === "approved") {
    return jsonResponse({ ok: true as const });
  }
  if (event.status !== "needs_approval") {
    return errorResponse("conflict", `Event is ${event.status}, not awaiting approval`);
  }

  const patientId: string = event.patient_id;
  const rxId: string | null = event.rx_id ?? (event.data?.rxId as string | undefined) ?? null;
  const data = (event.data ?? {}) as Record<string, unknown>;

  // Mark the decision and write actor/via to the audit trail.
  const newStatus = decision === "approve" ? "approved" : "rejected";
  await db
    .from("agent_events")
    .update({ status: newStatus, data: { ...data, decidedBy: actor, decidedVia: via } })
    .eq("id", eventId);
  await db.from("audit_log").insert({
    actor,
    action: `approve.${decision}`,
    payload: { eventId, via, rxId, patientId, program: data.program ?? null },
  });

  const { createContext } = await import("@/lib/agents/context");
  const ctx = createContext(patientId, rxId);

  // --- reject ---
  if (decision === "reject") {
    const agent = typeof event.agent === "string" ? event.agent : "router";
    await ctx.emit({
      agent,
      status: "done",
      title: "Doctor declined — no action taken",
      detail: `Declined by ${actor} via ${via}.`,
    });
    return jsonResponse({ ok: true as const });
  }

  // --- approve: dispatch on data.action ---
  const action = typeof data.action === "string" ? data.action : "";

  if (action === "enroll") {
    const program = String(data.program) as EnrollmentProgram;
    if (!(ENROLLMENT_PROGRAMS as readonly string[]).includes(program)) {
      return errorResponse("conflict", `Program "${program}" is not enrollable`);
    }
    if (!rxId) {
      return errorResponse("conflict", "Event has no prescription to enroll");
    }

    try {
      const medvantx = await import("@/lib/mocks/medvantx");
      const { statusForProgram } = await import("@/lib/agents/router");
      const { now } = await import("@/lib/clock");

      const { enrollmentId, supplyDays, shipsInDays } = await medvantx.enroll(ctx, rxId, program);
      const day = (await now()).day;

      const { error: updErr } = await db
        .from("prescriptions")
        .update({
          program,
          status: statusForProgram(program),
          expected_delivery_day: day + shipsInDays,
        })
        .eq("id", rxId);
      if (updErr) throw new Error(updErr.message);

      // Continue the chain (A4 replaces this with the real PA drafter).
      await ctx.emit({
        agent: "paDrafter",
        status: "done",
        title: "Ready to draft PA",
        detail: `Enrolled · ${supplyDays}-day supply · ships in ${shipsInDays} days.`,
        simulated: true,
        data: { rxId, enrollmentId, program },
      });

      return jsonResponse({ ok: true as const });
    } catch (err) {
      console.error("[approve] enroll dispatch failed:", err);
      await ctx.emit({
        agent: "medvantx",
        status: "blocked",
        title: "Enrollment failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      return errorResponse("internal", "Enrollment failed");
    }
  }

  // Non-enroll approvals (e.g. fill_retail): acknowledge.
  await ctx.emit({
    agent: "router",
    status: "done",
    title: "Recommendation acknowledged",
    detail: `Approved by ${actor} via ${via}.`,
  });
  return jsonResponse({ ok: true as const });
}
