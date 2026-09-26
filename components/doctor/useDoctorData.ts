"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FIXTURE_ALERTS, FIXTURE_ANA, FIXTURE_PATIENT_ROWS, type AlertRow, type PatientRow } from "@/components/fixtures";
import { PROGRAM } from "@/components/labels";
import { mergeNewest, upsertNewest as upsert, type Row } from "@/components/rows";
import { labelFor } from "@/components/StatusPill";
import { supabase } from "@/lib/db/client";
import type { Alert, Enrollment, Order, OrderStatus, Patient, Prescription } from "@/lib/db/types";

import type { LiveState } from "../useLiveEvents";

type PatientLite = Pick<Patient, "id" | "name" | "language" | "rural">;

const ORDER_NOTE: Record<OrderStatus, string> = {
  created: "Order created",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
};

function rxNote(rx: Prescription, enrollment?: Enrollment, order?: Order): string {
  const parts: string[] = [];
  if (rx.program) parts.push(PROGRAM[rx.program].short);
  if (order) parts.push(ORDER_NOTE[order.status]);
  else if (enrollment?.status === "active" && enrollment.end_day !== null) parts.push(`until day ${enrollment.end_day}`);
  if (parts.length === 0) parts.push(labelFor(rx.status));
  return parts.join(" · ");
}

interface Tables {
  patients: PatientLite[];
  circle: { id: string; patient_id: string; name: string }[];
  prescriptions: Prescription[];
  alerts: Alert[];
  enrollments: Enrollment[];
  orders: Order[];
}

const EMPTY: Tables = { patients: [], circle: [], prescriptions: [], alerts: [], enrollments: [], orders: [] };

/**
 * Doctor portal data: patient rail + alerts inbox, live via Supabase Realtime
 * (INSERT + UPDATE on prescriptions, alerts, enrollments, orders). Falls back
 * to fixtures when Supabase keys are missing.
 */
export function useDoctorData() {
  const live = supabase !== null;
  const [t, setT] = useState<Tables>(EMPTY);
  const [state, setState] = useState<LiveState>(live ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    // Subscribe first so nothing that lands during the initial load is lost;
    // upsert makes a row arriving twice harmless.
    const put =
      <K extends Exclude<keyof Tables, "patients">>(key: K) =>
      (payload: { new: unknown }) =>
        setT((prev) => ({ ...prev, [key]: upsert(prev[key] as Row[], payload.new as Row) }));

    let channel = client.channel(`doctor:${attempt}`);
    for (const [table, key] of [
      ["prescriptions", "prescriptions"],
      ["alerts", "alerts"],
      ["enrollments", "enrollments"],
      ["orders", "orders"],
    ] as const) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        channel = channel.on("postgres_changes", { event, schema: "public", table }, put(key));
      }
    }
    channel.subscribe();

    (async () => {
      try {
        const [patients, prescriptions, alerts, enrollments, orders, circle] = await Promise.all([
          client.from("patients").select("id, name, language, rural").order("name"),
          client.from("prescriptions").select("*").order("created_at", { ascending: false }).limit(500),
          client.from("alerts").select("*").order("created_at", { ascending: false }).limit(200),
          client.from("enrollments").select("*").order("created_at", { ascending: false }).limit(500),
          client.from("orders").select("*").order("created_at", { ascending: false }).limit(500),
          client.from("care_circle").select("id, patient_id, name"),
        ]);
        if (cancelled) return;
        const err = [patients, prescriptions, alerts, enrollments, orders, circle].find((r) => r.error)?.error;
        if (err) throw new Error(err.message);
        // Merge with anything Realtime already delivered (those rows are newer).
        setT((prev) => {
          const merge = mergeNewest;
          return {
            patients: (patients.data ?? []) as PatientLite[],
            circle: (circle.data ?? []) as Tables["circle"],
            prescriptions: merge((prescriptions.data ?? []) as Prescription[], prev.prescriptions),
            alerts: merge((alerts.data ?? []) as Alert[], prev.alerts),
            enrollments: merge((enrollments.data ?? []) as Enrollment[], prev.enrollments),
            orders: merge((orders.data ?? []) as Order[], prev.orders),
          };
        });
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load patients");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setT(EMPTY);
    setError(null);
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  const derived = useMemo(() => {
    if (!live) {
      return { rows: FIXTURE_PATIENT_ROWS, alerts: FIXTURE_ALERTS.filter((a) => !a.resolved) };
    }
    const rxById = new Map(t.prescriptions.map((rx) => [rx.id, rx]));
    const nameById = new Map(t.patients.map((p) => [p.id, p.name]));

    // Newest-first lists, so the first match per key is the latest.
    const latestRx = new Map<string, Prescription>();
    for (const rx of t.prescriptions) if (!latestRx.has(rx.patient_id)) latestRx.set(rx.patient_id, rx);
    const latestEnrollment = new Map<string, Enrollment>();
    for (const e of t.enrollments) if (!latestEnrollment.has(e.rx_id)) latestEnrollment.set(e.rx_id, e);
    const latestOrder = new Map<string, Order>();
    for (const o of t.orders) if (!latestOrder.has(o.rx_id)) latestOrder.set(o.rx_id, o);

    const rows: PatientRow[] = t.patients.map((patient) => {
      const rx = latestRx.get(patient.id);
      return {
        patient,
        rxId: rx?.id ?? null,
        drug: rx ? [rx.drug, rx.dose].filter(Boolean).join(" ") : null,
        status: rx?.status ?? null,
        note: rx ? rxNote(rx, latestEnrollment.get(rx.id), latestOrder.get(rx.id)) : "No active prescription",
      };
    });

    const alerts: AlertRow[] = t.alerts
      .filter((a) => !a.resolved)
      .map((a) => {
        const rx = a.rx_id ? rxById.get(a.rx_id) : undefined;
        return {
          ...a,
          patientId: rx?.patient_id ?? null,
          patientName: (rx && nameById.get(rx.patient_id)) ?? "Unknown patient",
          detail: rx ? [rx.drug, rx.dose, rx.program && PROGRAM[rx.program].label].filter(Boolean).join(" · ") : null,
        };
      });

    return { rows, alerts };
  }, [live, t]);

  // Care-circle members (e.g. who answered a check-in, who was notified).
  const circle = useMemo(() => (live ? t.circle : [FIXTURE_ANA]), [live, t.circle]);
  const memberNames = useMemo(() => new Map(circle.map((m) => [m.id, m.name])), [circle]);
  const circleOf = useCallback(
    (patientId: string) => circle.filter((m) => m.patient_id === patientId).map((m) => m.name),
    [circle]
  );

  return { ...derived, memberNames, circleOf, state, error, retry };
}
