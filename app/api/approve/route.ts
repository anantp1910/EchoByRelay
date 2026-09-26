// Approve route — Phase 4 (extends A3).
//
// POST /api/approve  { eventId, decision, actor, via } -> { ok: true }
//
// Records a human decision on a needs_approval event and resumes the chain:
//   - 404 if the event is missing
//   - already approved -> { ok: true } (idempotent, no re-work)
//   - not needs_approval -> 409
//   - approve + data.action "enroll": medvantx.enroll, set prescription
//     program/status/expected_delivery_day, then run paDrafter in after()
//   - approve + data.action "submit_pa": payer.submitPA, mark pa submitted,
//     keep status bridge if a bridge/quick_start supply is active, else pa_pending
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

      const { shipsInDays } = await medvantx.enroll(ctx, rxId, program);
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

      // Draft the PA now, awaited (bounded by maxDuration=60). We do NOT use
      // next/server after() here: in `next dev` the after() context is torn down
      // after the response, so the ~20s reasoning call hangs forever at
      // "running". Awaiting is reliable in dev, `next start`, and Vercel; the
      // paDrafter step still streams running -> needs_approval via realtime.
      const { paDrafter } = await import("@/lib/agents/paDrafter");
      await paDrafter(ctx);

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

  if (action === "submit_pa") {
    const paRequestId = typeof data.paRequestId === "string" ? data.paRequestId : "";
    if (!paRequestId) {
      return errorResponse("conflict", "Event has no PA request to submit");
    }

    const s = await ctx.step("payer", "Submitting PA to insurer…", { simulated: true });
    try {
      const { submitPA } = await import("@/lib/mocks/payer");
      await submitPA(paRequestId);

      // Keep status `bridge` while an active bridge/quick_start supply exists;
      // otherwise the prescription is now purely waiting on the PA.
      let bridgeActive = false;
      if (rxId) {
        const { data: enr } = await db
          .from("enrollments")
          .select("id")
          .eq("rx_id", rxId)
          .in("program", ["bridge", "quick_start"])
          .eq("status", "active")
          .limit(1);
        bridgeActive = Boolean(enr && enr.length > 0);
        if (!bridgeActive) {
          await db.from("prescriptions").update({ status: "pa_pending" }).eq("id", rxId);
        }
      }

      await s.done(
        "PA submitted to insurer",
        bridgeActive
          ? "Bridge supply active; awaiting the payer's decision."
          : "Awaiting the payer's decision."
      );
      return jsonResponse({ ok: true as const });
    } catch (err) {
      console.error("[approve] submit_pa dispatch failed:", err);
      await s.blocked("PA submission failed", err instanceof Error ? err.message : String(err));
      return errorResponse("internal", "PA submission failed");
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
