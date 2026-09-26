import "server-only";

import { db } from "@/lib/db/server";
import type { AgentEventStatus, Json } from "@/lib/db/types";

// Agent execution context. `emit` is the ONLY way agents write to the timeline:
// it inserts one agent_events row AND one audit_log row (so every step is
// audited) and returns the new event id. Agents that need the simulated "now"
// import lib/clock.ts and call now() — never Date.now() (CLAUDE.md rule #10).

export interface EmitInput {
  agent: string;
  status: AgentEventStatus;
  title: string;
  detail?: string | null;
  simulated?: boolean;
  data?: Json;
}

export interface AgentContext {
  patientId: string;
  rxId: string | null;
  emit(event: EmitInput): Promise<string>;
}

export function createContext(patientId: string, rxId: string | null): AgentContext {
  return {
    patientId,
    rxId,
    async emit(event: EmitInput): Promise<string> {
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

      // Audit trail. Best-effort: a failed audit insert must not sink the step,
      // but it is surfaced loudly rather than swallowed.
      const { error: auditError } = await db.from("audit_log").insert({
        actor: event.agent,
        action: `${event.agent}.${event.status}`,
        payload: {
          eventId,
          rxId,
          patientId,
          title: event.title,
          detail: event.detail ?? null,
          simulated: event.simulated ?? false,
          data: event.data ?? {},
        },
      });
      if (auditError) {
        console.warn(`[context] audit_log insert failed: ${auditError.message}`);
      }

      return eventId;
    },
  };
}
