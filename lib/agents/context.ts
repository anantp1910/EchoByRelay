import "server-only";

import { db } from "@/lib/db/server";
import type { AgentEventStatus, Json } from "@/lib/db/types";

// Agent execution context.
//
// ONE ROW PER STEP: `step()` inserts a single agent_events row in status
// `running` and returns a handle whose .done/.blocked/.needsApproval UPDATE that
// same row (so the "running" row always resolves — no orphans). Every insert and
// every update also appends an audit_log row, so full history lives in the
// audit trail.
//
// `emit()` remains for single-shot events that never "run" (e.g. "Doctor
// declined"). Agents that need the simulated "now" import lib/clock.ts.

export interface EmitInput {
  agent: string;
  status: AgentEventStatus;
  title: string;
  detail?: string | null;
  simulated?: boolean;
  data?: Json;
}

export interface StepOptions {
  detail?: string | null;
  simulated?: boolean;
}

export interface TransitionOptions {
  /** Override the step's simulated flag on this transition (e.g. intake ai vs fallback). */
  simulated?: boolean;
}

export interface StepHandle {
  readonly id: string;
  done(title: string, detail?: string | null, data?: Json, opts?: TransitionOptions): Promise<string>;
  blocked(title: string, detail?: string | null, opts?: TransitionOptions): Promise<string>;
  needsApproval(title: string, detail: string | null, data?: Json, opts?: TransitionOptions): Promise<string>;
}

export interface AgentContext {
  patientId: string;
  rxId: string | null;
  /** Single-shot event (inserts one row that never transitions). */
  emit(event: EmitInput): Promise<string>;
  /** Begin a step: inserts a `running` row; resolve it via the returned handle. */
  step(agent: string, runningTitle: string, opts?: StepOptions): Promise<StepHandle>;
}

export function createContext(patientId: string, rxId: string | null): AgentContext {
  async function audit(
    agent: string,
    status: AgentEventStatus,
    eventId: string,
    title: string,
    detail: string | null | undefined,
    simulated: boolean,
    data: Json | undefined
  ): Promise<void> {
    const { error } = await db.from("audit_log").insert({
      actor: agent,
      action: `${agent}.${status}`,
      payload: {
        eventId,
        rxId,
        patientId,
        title,
        detail: detail ?? null,
        simulated,
        data: data ?? {},
      },
    });
    if (error) {
      console.warn(`[context] audit_log insert failed: ${error.message}`);
    }
  }

  async function emit(event: EmitInput): Promise<string> {
    const { data, error } = await db
      .from("agent_events")
      .insert({
        rx_id: rxId,
        patient_id: patientId,
        agent: event.agent,
        status: event.status,
        title: event.title,
        detail: event.detail ?? null,
        simulated: event.simulated ?? false,
        data: event.data ?? {},
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(`emit(${event.agent}.${event.status}) failed: ${error.message}`);
    }
    const eventId = (data as { id: string }).id;
    await audit(event.agent, event.status, eventId, event.title, event.detail, event.simulated ?? false, event.data);
    return eventId;
  }

  async function step(agent: string, runningTitle: string, opts: StepOptions = {}): Promise<StepHandle> {
    let simulated = opts.simulated ?? false;

    const { data, error } = await db
      .from("agent_events")
      .insert({
        rx_id: rxId,
        patient_id: patientId,
        agent,
        status: "running",
        title: runningTitle,
        detail: opts.detail ?? null,
        simulated,
        data: {},
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(`step(${agent}) insert failed: ${error.message}`);
    }
    const id = (data as { id: string }).id;
    await audit(agent, "running", id, runningTitle, opts.detail ?? null, simulated, {});

    async function transition(
      status: AgentEventStatus,
      title: string,
      detail: string | null,
      data2: Json | undefined
    ): Promise<string> {
      const { error: updateError } = await db
        .from("agent_events")
        .update({ status, title, detail, data: data2 ?? {}, simulated })
        .eq("id", id);
      if (updateError) {
        throw new Error(`step(${agent}).${status} update failed: ${updateError.message}`);
      }
      await audit(agent, status, id, title, detail, simulated, data2);
      return id;
    }

    return {
      id,
      done(title, detail = null, data2, tOpts) {
        if (tOpts?.simulated !== undefined) simulated = tOpts.simulated;
        return transition("done", title, detail ?? null, data2);
      },
      blocked(title, detail = null, tOpts) {
        if (tOpts?.simulated !== undefined) simulated = tOpts.simulated;
        return transition("blocked", title, detail ?? null, undefined);
      },
      needsApproval(title, detail, data2, tOpts) {
        if (tOpts?.simulated !== undefined) simulated = tOpts.simulated;
        return transition("needs_approval", title, detail, data2);
      },
    };
  }

  return { patientId, rxId, emit, step };
}
