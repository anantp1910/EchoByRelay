"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FIXTURE_KPIS, FIXTURE_MARIA } from "@/components/fixtures";
import { pharmaMetrics } from "@/lib/api/client";
import type { PharmaMetricsRes } from "@/lib/api/contracts";
import { supabase } from "@/lib/db/client";
import type { AuditLog, Patient } from "@/lib/db/types";

export type Load = "loading" | "ready" | "error";

type PatientLite = Pick<Patient, "id" | "name" | "zip">;

const FIXTURE_METRICS: PharmaMetricsRes = {
  ...FIXTURE_KPIS,
  rescuedSeries: [
    { day: 0, count: 3 },
    { day: 8, count: 14 },
    { day: 16, count: 27 },
    { day: 24, count: FIXTURE_KPIS.scriptsRescued },
  ],
  programMix: [
    { program: "bridge", count: 12 },
    { program: "quick_start", count: 13 },
    { program: "pap", count: 6 },
    { program: "cash_pay", count: 7 },
    { program: "retail_copay_card", count: 3 },
  ],
};

// Tables whose changes can move the KPIs / charts / audit trail.
const WATCHED = ["agent_events", "prescriptions", "enrollments", "alerts", "orders", "pa_requests"] as const;
const REFRESH_MS = 1000;

/**
 * Pharma dashboard data: /api/pharma/metrics, submitted-PA count, audit_log,
 * and patient ZIPs for de-identification. Realtime changes on the watched
 * tables trigger one debounced refetch. audit_log isn't in the Realtime
 * publication, so it reloads on those same changes (every agent step writes
 * both an agent_events and an audit_log row).
 */
export function usePharmaData() {
  const live = supabase !== null;
  const [metrics, setMetrics] = useState<PharmaMetricsRes | null>(live ? null : FIXTURE_METRICS);
  const [metricsState, setMetricsState] = useState<Load>(live ? "loading" : "ready");
  const [paSubmitted, setPaSubmitted] = useState<number | null>(live ? null : 9);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [auditState, setAuditState] = useState<Load>(live ? "loading" : "ready");
  const [patients, setPatients] = useState<Map<string, PatientLite>>(
    () => new Map(live ? [] : [[FIXTURE_MARIA.id, FIXTURE_MARIA]])
  );
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function refresh() {
      const [m, pa, log, pts] = await Promise.allSettled([
        pharmaMetrics(),
        client.from("pa_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "approved", "denied"]),
        client.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
        client.from("patients").select("id, name, zip"),
      ]);
      if (cancelled) return;

      if (m.status === "fulfilled") {
        setMetrics(m.value);
        setMetricsState("ready");
      } else {
        setMetricsState((s) => (s === "ready" ? s : "error")); // keep last good numbers
      }
      if (pa.status === "fulfilled" && !pa.value.error) setPaSubmitted(pa.value.count ?? 0);
      if (log.status === "fulfilled" && !log.value.error) {
        setAudit((log.value.data ?? []) as AuditLog[]);
        setAuditState("ready");
      } else {
        setAuditState((s) => (s === "ready" ? s : "error"));
      }
      if (pts.status === "fulfilled" && !pts.value.error) {
        setPatients(new Map(((pts.value.data ?? []) as PatientLite[]).map((p) => [p.id, p])));
      }
    }

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), REFRESH_MS);
    };

    let channel = client.channel(`pharma:${attempt}`);
    for (const table of WATCHED) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    void refresh();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      void client.removeChannel(channel);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setMetricsState("loading");
    setAuditState("loading");
    setAttempt((n) => n + 1);
  }, []);

  return { live, metrics, metricsState, paSubmitted, audit, auditState, patients, retry };
}
