"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { supabase } from "@/lib/db/client";

import { postCheckIn, type CheckInDraft } from "./api";
import { FIXTURE_CHECKINS } from "./fixtures";
import { CHECKIN_DAYS, SCHEDULE, type CheckInDay, type QuestionKey } from "./questions";
import type { CheckIn, CheckInView } from "./types";

/**
 * Sample check-ins. Swap this for a check_ins query (+ Realtime) once the
 * table exists; nothing else in the hook needs to change.
 */
function loadCheckIns(patientId: string): CheckIn[] {
  return FIXTURE_CHECKINS.filter((c) => c.patient_id === patientId);
}

/** Live demo_state.day (0 offline, null while loading). */
function useDemoDay(): number | null {
  const channelId = useId();
  const [day, setDay] = useState<number | null>(supabase ? null : 0);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    const channel = client
      .channel(`demo_state:checkins:${channelId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "demo_state", filter: "id=eq.1" }, (p) =>
        setDay((p.new as { day: number }).day)
      )
      .subscribe();
    client
      .from("demo_state")
      .select("day")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDay((d) => d ?? (data as { day: number } | null)?.day ?? 0);
      });
    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [channelId]);
  return day;
}

/**
 * Check-ins visible on demo day `day`: this page's answers plus sample answers
 * for days already past. A sample answer for *today's* check-in is held back
 * so today's check-in can still be answered live on the phone.
 */
export function visibleCheckIns(patientId: string, day: number, session: CheckInView[] = []): CheckInView[] {
  const mine = session.filter((c) => c.patient_id === patientId);
  const answered = new Set(mine.map((c) => c.day));
  const samples = loadCheckIns(patientId)
    .filter((c) => c.day < day && !answered.has(c.day))
    .map((c): CheckInView => ({ ...c, source: "sample", synced: true }));
  return [...mine, ...samples].sort((a, b) => b.day - a.day || b.created_at.localeCompare(a.created_at));
}

export interface DueCheckIn {
  day: CheckInDay;
  questions: QuestionKey[];
  overdue: boolean;
}

/**
 * Check-ins for a patient up to the current demo day (see visibleCheckIns),
 * plus the one that is due. Earlier sample answers stand in as history (the
 * day-21 one feeds the day-24 story). Answers submitted on this page are kept
 * in state, flagged "not synced" if POST /api/checkins isn't available.
 */
export function useCheckIns(patientId: string) {
  const day = useDemoDay();
  const [session, setSession] = useState<CheckInView[]>([]);

  const checkIns = useMemo<CheckInView[]>(
    () => (day === null ? [] : visibleCheckIns(patientId, day, session)),
    [day, session, patientId]
  );

  const due = useMemo<DueCheckIn | null>(() => {
    if (day === null) return null;
    const answered = new Set(checkIns.map((c) => c.day));
    const open = CHECKIN_DAYS.filter((d) => d <= day && !answered.has(d));
    const latest = open.at(-1);
    return latest === undefined ? null : { day: latest, questions: SCHEDULE[latest], overdue: latest < day };
  }, [day, checkIns]);

  const submit = useCallback(async (draft: CheckInDraft) => {
    const synced = await postCheckIn(draft);
    const row: CheckInView = {
      ...draft,
      id: `local-${draft.patient_id}-${draft.day}-${session.length}`,
      created_at: new Date().toISOString(),
      is_seed: false,
      source: "session",
      synced,
    };
    setSession((s) => [row, ...s.filter((c) => !(c.patient_id === row.patient_id && c.day === row.day))]);
    return synced;
  }, [session.length]);

  return { day, checkIns, latest: checkIns[0] ?? null, due, submit };
}
