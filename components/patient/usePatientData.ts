"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FIXTURE_ANA,
  FIXTURE_MARIA,
  FIXTURE_MARIA_ENROLLMENT,
  FIXTURE_MARIA_RX,
  FIXTURE_MESSAGES,
} from "@/components/fixtures";
import { mergeNewest, upsertNewest, type Row } from "@/components/rows";
import { supabase } from "@/lib/db/client";
import type {
  CareCircleMember,
  Enrollment,
  Message,
  Order,
  Patient,
  PaymentMandate,
  Prescription,
} from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";

export type PatientState = "loading" | "ready" | "error" | "not_found";

interface Tables {
  patient: Patient | null;
  circle: CareCircleMember[];
  prescriptions: Prescription[];
  enrollments: Enrollment[];
  orders: Order[];
  mandates: PaymentMandate[];
  messages: Message[];
  day: number | null;
}

const EMPTY: Tables = {
  patient: null,
  circle: [],
  prescriptions: [],
  enrollments: [],
  orders: [],
  mandates: [],
  messages: [],
  day: null,
};

const FIXTURES: Tables = {
  patient: FIXTURE_MARIA,
  circle: [FIXTURE_ANA],
  prescriptions: [FIXTURE_MARIA_RX],
  enrollments: [FIXTURE_MARIA_ENROLLMENT],
  orders: [],
  mandates: [],
  messages: FIXTURE_MESSAGES,
  day: 0,
};

type Live = "prescriptions" | "messages" | "enrollments" | "orders";

/**
 * Everything the patient portal shows, live via Supabase Realtime: INSERT +
 * UPDATE on prescriptions, messages, enrollments, orders (each row replaced in
 * place by id) and the demo clock. Enrollments/orders have no patient column,
 * so they are subscribed unfiltered and narrowed to this patient's Rx ids.
 * Falls back to Maria's fixtures when Supabase keys are missing.
 */
export function usePatientData(patientId: string) {
  const live = supabase !== null;
  const [t, setT] = useState<Tables>(EMPTY);
  const [state, setState] = useState<PatientState>(live ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    const put = (key: Live) => (payload: { new: unknown }) =>
      setT((prev) => ({ ...prev, [key]: upsertNewest(prev[key] as Row[], payload.new as Row) }));

    let channel = client.channel(`patient:${patientId}:${attempt}`);
    for (const event of ["INSERT", "UPDATE"] as const) {
      const byPatient = { event, schema: "public", filter: `patient_id=eq.${patientId}` } as const;
      channel = channel
        .on("postgres_changes", { ...byPatient, table: "prescriptions" }, put("prescriptions"))
        .on("postgres_changes", { ...byPatient, table: "messages" }, put("messages"))
        .on("postgres_changes", { event, schema: "public", table: "enrollments" }, put("enrollments"))
        .on("postgres_changes", { event, schema: "public", table: "orders" }, put("orders"));
    }
    channel = channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "demo_state", filter: "id=eq.1" },
      (payload) => setT((prev) => ({ ...prev, day: (payload.new as { day: number }).day }))
    );
    channel.subscribe();

    (async () => {
      try {
        const [patient, circle, prescriptions, messages, demo] = await Promise.all([
          client.from("patients").select("*").eq("id", patientId).maybeSingle(),
          client.from("care_circle").select("*").eq("patient_id", patientId).order("created_at"),
          client
            .from("prescriptions")
            .select("*")
            .eq("patient_id", patientId)
            .order("created_at", { ascending: false })
            .limit(20),
          client
            .from("messages")
            .select("*")
            .eq("patient_id", patientId)
            .order("created_at", { ascending: false })
            .limit(100),
          client.from("demo_state").select("day").eq("id", 1).maybeSingle(),
        ]);
        const first = [patient, circle, prescriptions, messages, demo].find((r) => r.error)?.error;
        if (first) throw new Error(first.message);
        if (cancelled) return;
        if (!patient.data) {
          setState("not_found");
          return;
        }

        const rxIds = ((prescriptions.data ?? []) as Prescription[]).map((rx) => rx.id);
        const [enrollments, orders, mandates] = rxIds.length
          ? await Promise.all([
              client.from("enrollments").select("*").in("rx_id", rxIds).order("created_at", { ascending: false }),
              client.from("orders").select("*").in("rx_id", rxIds).order("created_at", { ascending: false }),
              client.from("payment_mandates").select("*").in("rx_id", rxIds).order("created_at", { ascending: false }),
            ])
          : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
        const second = [enrollments, orders, mandates].find((r) => r.error)?.error;
        if (second) throw new Error(second.message);
        if (cancelled) return;

        setT((prev) => ({
          patient: patient.data as Patient,
          circle: (circle.data ?? []) as CareCircleMember[],
          prescriptions: mergeNewest((prescriptions.data ?? []) as Prescription[], prev.prescriptions),
          messages: mergeNewest((messages.data ?? []) as Message[], prev.messages),
          enrollments: mergeNewest((enrollments.data ?? []) as Enrollment[], prev.enrollments),
          orders: mergeNewest((orders.data ?? []) as Order[], prev.orders),
          mandates: (mandates.data ?? []) as PaymentMandate[],
          day: prev.day ?? (demo.data as { day: number } | null)?.day ?? null,
        }));
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [patientId, attempt]);

  const data = live ? t : patientId === MARIA_ID ? FIXTURES : EMPTY;
  const fixtureState: PatientState = patientId === MARIA_ID ? "ready" : "not_found";

  // payment_mandates isn't in the Realtime publication: re-read it when the
  // order moves (checkout marks it paid → shipped right after the mandate).
  const rx = data.prescriptions[0] ?? null;
  const order = rx ? (data.orders.find((o) => o.rx_id === rx.id) ?? null) : null;
  const orderKey = order ? `${order.id}:${order.status}` : "";
  useEffect(() => {
    if (!supabase || !rx || !orderKey) return;
    let cancelled = false;
    supabase
      .from("payment_mandates")
      .select("*")
      .eq("rx_id", rx.id)
      .order("created_at", { ascending: false })
      .then(({ data: rows }) => {
        if (!cancelled && rows) setT((prev) => ({ ...prev, mandates: rows as PaymentMandate[] }));
      });
    return () => {
      cancelled = true;
    };
  }, [rx, orderKey]);

  const retry = useCallback(() => {
    setT(EMPTY);
    setError(null);
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  const derived = useMemo(() => {
    const enrollment = rx ? (data.enrollments.find((e) => e.rx_id === rx.id) ?? null) : null;
    const mandate = rx ? (data.mandates.find((m) => m.rx_id === rx.id) ?? null) : null;
    // The order's own enrollment decides whether it is payable (checkout does the same).
    const orderProgram =
      order && order.enrollment_id
        ? (data.enrollments.find((e) => e.id === order.enrollment_id)?.program ?? rx?.program ?? null)
        : (rx?.program ?? null);
    const messages = [...data.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { enrollment, mandate, orderProgram, messages };
  }, [data, rx, order]);

  return {
    state: live ? state : fixtureState,
    error,
    retry,
    live,
    patient: data.patient,
    circle: data.circle,
    day: data.day,
    rx,
    order,
    ...derived,
  };
}
