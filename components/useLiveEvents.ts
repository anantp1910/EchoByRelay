"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/db/client";
import type { AgentEvent, AgentEventStatus } from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";

import { FIXTURE_MARIA_EVENTS } from "./fixtures";

// Without Supabase keys, `supabase` is null and every page runs on fixtures.
export const HAS_SUPABASE = isSupabaseConfigured;

export type LiveState = "loading" | "ready" | "error";
export type LiveSource = "live" | "fixture";

function fixturesFor(patientId?: string): AgentEvent[] {
  if (!patientId || patientId === MARIA_ID) return FIXTURE_MARIA_EVENTS;
  return [];
}

function upsert(list: AgentEvent[], row: AgentEvent): AgentEvent[] {
  const i = list.findIndex((e) => e.id === row.id);
  if (i === -1) return [...list, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const next = list.slice();
  next[i] = row;
  return next;
}

interface Options {
  /** Scope to one patient. Omit for all events (pharma feed). */
  patientId?: string;
  /** Scope to one prescription. */
  rxId?: string;
  limit?: number;
}

type Decided = Extract<AgentEventStatus, "approved" | "rejected">;

/**
 * agent_events for the timeline, live via Supabase Realtime. One row per step:
 * INSERT adds a card, UPDATE replaces it in place by id (running → done, etc.).
 * Falls back to the Maria fixtures when Supabase keys are missing, so every page
 * renders offline. `replay()` (fixture mode only) re-streams the fixtures.
 */
export function useLiveEvents({ patientId, rxId, limit = 100 }: Options = {}) {
  const source: LiveSource = HAS_SUPABASE ? "live" : "fixture";
  const [events, setEvents] = useState<AgentEvent[]>(() =>
    HAS_SUPABASE ? [] : fixturesFor(patientId)
  );
  const [state, setState] = useState<LiveState>(HAS_SUPABASE ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Optimistic decisions from approval cards, applied only while the row is
  // still needs_approval — once Realtime delivers the real status, it wins.
  const [decided, setDecided] = useState<Record<string, Decided>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Scope changed (e.g. doctor picked another patient): reset during render,
  // not in an effect, so the old patient's steps never flash.
  const scopeKey = `${patientId ?? ""}|${rxId ?? ""}`;
  const [scope, setScope] = useState(scopeKey);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setEvents(HAS_SUPABASE ? [] : fixturesFor(patientId));
    setState(HAS_SUPABASE ? "loading" : "ready");
    setError(null);
    setDecided({});
  }

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    // Subscribe before loading so a step that lands mid-load is never lost;
    // upsert makes a row arriving twice harmless.
    const filter = rxId ? `rx_id=eq.${rxId}` : patientId ? `patient_id=eq.${patientId}` : undefined;
    const channel = client
      .channel(`agent_events:${rxId ?? patientId ?? "all"}:${attempt}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_events", ...(filter ? { filter } : {}) },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<AgentEvent>).id;
            setEvents((list) => list.filter((e) => e.id !== id));
          } else {
            setEvents((list) => upsert(list, payload.new as AgentEvent));
          }
        }
      )
      .subscribe();

    (async () => {
      try {
        // Newest `limit` rows, displayed oldest → newest.
        let q = client
          .from("agent_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (patientId) q = q.eq("patient_id", patientId);
        if (rxId) q = q.eq("rx_id", rxId);
        const { data, error: err } = await q;
        if (cancelled) return;
        if (err) throw new Error(err.message);
        const loaded = ((data ?? []) as AgentEvent[]).reverse();
        // Rows Realtime already delivered are at least as new as the load.
        setEvents((seen) => seen.reduce(upsert, loaded));
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load events");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [patientId, rxId, limit, attempt]);

  // Cancel any fixture replay on unmount or when the scope changes.
  useEffect(() => {
    const pending = timers;
    return () => {
      pending.current.forEach(clearTimeout);
      pending.current = [];
    };
  }, [scopeKey]);

  const retry = useCallback(() => {
    setError(null);
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  /** Fixture mode: stream the demo steps in one by one (running → final status). */
  const replay = useCallback(() => {
    if (HAS_SUPABASE) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const all = fixturesFor(patientId);
    setEvents([]);
    all.forEach((e, i) => {
      const start = 400 + i * 1100;
      timers.current.push(
        setTimeout(() => setEvents((l) => upsert(l, { ...e, status: "running" })), start),
        setTimeout(() => setEvents((l) => upsert(l, e)), start + 800)
      );
    });
  }, [patientId]);

  /** Show a decision on an approval card right away; pass null to roll it back. */
  const setOptimistic = useCallback((id: string, status: Decided | null) => {
    setDecided((prev) => {
      const next = { ...prev };
      if (status) next[id] = status;
      else delete next[id];
      return next;
    });
  }, []);

  const view = useMemo(
    () =>
      events.map((e) =>
        e.status === "needs_approval" && decided[e.id] ? { ...e, status: decided[e.id] } : e
      ),
    [events, decided]
  );

  return { events: view, state, error, source, retry, replay, setOptimistic };
}
