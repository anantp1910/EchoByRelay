"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentEvent } from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";

import { FIXTURE_MARIA_EVENTS } from "./fixtures";

// lib/db/client.ts calls createClient() at module load and throws without keys,
// so it's only ever imported dynamically, behind this check.
export const HAS_SUPABASE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

/**
 * agent_events for the timeline, live via Supabase Realtime. Falls back to the
 * Maria fixtures when Supabase keys are missing, so every page renders offline.
 * `replay()` (fixture mode only) re-streams the fixtures step by step.
 */
export function useLiveEvents({ patientId, rxId, limit = 100 }: Options = {}) {
  const source: LiveSource = HAS_SUPABASE ? "live" : "fixture";
  const [events, setEvents] = useState<AgentEvent[]>(() =>
    HAS_SUPABASE ? [] : fixturesFor(patientId)
  );
  const [state, setState] = useState<LiveState>(HAS_SUPABASE ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
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
  }

  useEffect(() => {
    if (!HAS_SUPABASE) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { supabase } = await import("@/lib/db/client");
        let q = supabase
          .from("agent_events")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(limit);
        if (patientId) q = q.eq("patient_id", patientId);
        if (rxId) q = q.eq("rx_id", rxId);
        const { data, error: err } = await q;
        if (cancelled) return;
        if (err) throw new Error(err.message);
        setEvents((data ?? []) as AgentEvent[]);
        setState("ready");

        const filter = rxId
          ? `rx_id=eq.${rxId}`
          : patientId
            ? `patient_id=eq.${patientId}`
            : undefined;
        const channel = supabase
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
        cleanup = () => void supabase.removeChannel(channel);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load events");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
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

  /** Optimistic local status change (approval cards) until Realtime confirms it. */
  const patch = useCallback((id: string, changes: Partial<AgentEvent>) => {
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }, []);

  return { events, state, error, source, retry, replay, patch };
}
