// STUB — replaced in A2..A6.
//
// Server-side helpers that write fake agent_events / a demo prescription so the
// UI has something to render before the real agents exist. Everything here is
// env-guarded: if the Supabase vars are missing, these no-op (the app must work
// before the keys arrive). server.ts is imported dynamically and only when the
// env is present, because it throws at module load when the key is missing.
//
// Only route handlers import this (it reaches the service-role client). Never
// import it into a client component.

import type { AgentEventStatus, Json } from "@/lib/db/types";
import { DEMO_DRUG } from "@/lib/demo/constants";

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export interface StubEventInput {
  rx_id: string | null;
  patient_id: string;
  agent: string;
  status: AgentEventStatus;
  title: string;
  detail?: string | null;
  data?: Json;
}

/**
 * Insert a demo prescription for the given patient and return its id, or null
 * if the DB is unavailable or the insert fails. Keeping this separate lets the
 * caller only write agent_events (which FK to prescriptions) when a real rx row
 * exists, avoiding foreign-key violations.
 */
export async function createStubPrescription(patientId: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const { db } = await import("@/lib/db/server");
    const { data, error } = await db
      .from("prescriptions")
      .insert({
        patient_id: patientId,
        drug: DEMO_DRUG.name,
        dose: DEMO_DRUG.dose,
        frequency: DEMO_DRUG.frequency,
        indication: DEMO_DRUG.indication,
        status: "routing",
        is_seed: false,
      })
      .select("id")
      .single();
    if (error) {
      console.warn(`[stub-events] prescription insert failed: ${error.message}`);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stub-events] prescription insert threw: ${msg}`);
    return null;
  }
}

/**
 * Insert simulated agent_events. Returns the inserted rows' ids (or []). Never
 * throws: on missing env or DB error it logs and returns [] so stubs still 200.
 */
export async function writeStubEvents(events: StubEventInput[]): Promise<string[]> {
  if (!hasSupabaseEnv() || events.length === 0) return [];
  try {
    const { db } = await import("@/lib/db/server");
    const rows = events.map((e) => ({
      rx_id: e.rx_id,
      patient_id: e.patient_id,
      agent: e.agent,
      status: e.status,
      title: e.title,
      detail: e.detail ?? null,
      simulated: true,
      data: e.data ?? {},
    }));
    const { data, error } = await db.from("agent_events").insert(rows).select("id");
    if (error) {
      console.warn(`[stub-events] agent_events insert failed: ${error.message}`);
      return [];
    }
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stub-events] agent_events insert threw: ${msg}`);
    return [];
  }
}

/**
 * Mark an agent_event approved/rejected if the DB is available. Returns true if
 * a row was updated. Used by the approve stub so B can test the approval card.
 */
export async function markEventDecision(
  eventId: string,
  decision: "approve" | "reject"
): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  try {
    const { db } = await import("@/lib/db/server");
    const status: AgentEventStatus = decision === "approve" ? "approved" : "rejected";
    const { data, error } = await db
      .from("agent_events")
      .update({ status })
      .eq("id", eventId)
      .select("id");
    if (error) {
      console.warn(`[stub-events] agent_events update failed for ${eventId}: ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stub-events] agent_events update threw for ${eventId}: ${msg}`);
    return false;
  }
}
