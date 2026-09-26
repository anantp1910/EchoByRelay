import type { PharmaMetricsRes } from "@/lib/api/contracts";

/**
 * Agreed estimate of staff time per manual prior authorization, derived from the
 * AMA prior-authorization physician survey average. Not a measured saving.
 */
export const PA_MINUTES_SAVED_ESTIMATE = 20;

export interface MetricsRows {
  prescriptions: { id: string; status: string; created_at: string; is_seed: boolean }[];
  patients: { rural: boolean }[];
  alerts: { rx_id: string | null; kind: string; created_at: string }[];
  enrollments: { program: string; rx_id: string; start_day: number | null; end_day?: number | null }[];
  events: { rx_id: string | null; agent: string; status: string; created_at: string; data: Record<string, unknown> }[];
}

/**
 * Initial PA drafts Relay actually completed: a paDrafter step that reached the
 * approval card (or a later decision) with a saved pa_request. Appeals are not
 * new PAs, and each prescription counts once even if it was re-drafted. Seed
 * stub letters have no drafter event, so they are never counted.
 */
export function countInitialPaDrafts(events: MetricsRows["events"]): number {
  const rxIds = new Set<string>();
  for (const e of events) {
    if (e.agent !== "paDrafter" || !["needs_approval", "approved", "rejected"].includes(e.status)) continue;
    if (e.data?.appeal === true || typeof e.data?.paRequestId !== "string" || !e.rx_id) continue;
    rxIds.add(e.rx_id);
  }
  return rxIds.size;
}

/** Programs whose supply is temporary: it ends at the enrollment's end_day. */
const TEMPORARY_SUPPLY = new Set(["bridge", "quick_start"]);

type Delivery = { day: number; program: string | null };

/**
 * A confirmed delivery step (medicine in hand). New rows carry `delivered: true`;
 * older watchdog rows are recognised by their orderId without a delivery hold.
 */
export function deliveryOf(e: MetricsRows["events"][number]): Delivery | null {
  const d = e.data ?? {};
  if (typeof d.day !== "number") return null;
  const legacy = e.agent === "watchdog" && e.status === "done" && typeof d.orderId === "string" && d.deliveryHeld !== true;
  if (d.delivered !== true && !legacy) return null;
  return { day: d.day, program: typeof d.program === "string" ? d.program : null };
}

/**
 * Days in [from, to) not covered by any delivered supply. A Bridge/Quick Start
 * delivery covers until its enrollment's end_day; paid, PAP and retail supply is
 * ongoing (refills), so it covers every later day.
 */
export function daysUncovered(
  deliveries: Delivery[],
  enrollments: MetricsRows["enrollments"],
  from: number,
  to: number
): number {
  const covered = deliveries.map(({ day, program }) => {
    const temporary = program !== null && TEMPORARY_SUPPLY.has(program);
    const endDay = temporary ? enrollments.find((en) => en.program === program)?.end_day : null;
    return { from: day, to: endDay ?? Infinity };
  });
  let gap = 0;
  for (let day = from; day < to; day++) {
    if (!covered.some((c) => day >= c.from && day < c.to)) gap++;
  }
  return gap;
}

/** Live results use explicit simulated days, never wall-clock test duration. */
export function calculateMetrics(rows: MetricsRows): PharmaMetricsRes {
  const rescuedDays: number[] = [];
  const durations: number[] = [];
  let daysWithoutMedication = 0;
  for (const rx of rows.prescriptions) {
    const events = rows.events.filter((e) => e.rx_id === rx.id);
    const enrollments = rows.enrollments.filter((e) => e.rx_id === rx.id);
    const days = events.map((e) => e.data?.day).filter((d): d is number => typeof d === "number");
    const start = days.length ? Math.min(...days) : enrollments.find((e) => e.start_day != null)?.start_day;
    // First medicine in hand, including a free Bridge/Quick Start supply. An
    // order's created_at is NOT its delivery time; only delivery steps count.
    const deliveries = events.map(deliveryOf).filter((d): d is Delivery => d !== null);
    const firstDose = deliveries.length ? Math.min(...deliveries.map((d) => d.day)) : undefined;
    if (start != null && firstDose !== undefined) durations.push(Math.max(0, firstDose - start));

    // Rescue milestone: on therapy (sustainable access delivered) after an alert
    // or a PA-denial reroute. Seed and live scripts use the same milestone.
    const reached = events.find((e) => e.data?.onTherapy === true);
    if (!reached) continue;
    const end = typeof reached.data.day === "number" ? reached.data.day : undefined;
    const priorAlert = rows.alerts.some((a) => a.rx_id === rx.id && a.created_at <= reached.created_at);
    const rerouted = events.some((e) => e.data?.paDenied === true && e.created_at <= reached.created_at);
    if (end !== undefined && (reached.data.rescued === true || priorAlert || rerouted)) {
      rescuedDays.push(end);
      if (firstDose !== undefined) daysWithoutMedication += daysUncovered(deliveries, enrollments, firstDose, end);
    }
  }
  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median = !durations.length ? 0 : durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  const counts = new Map<number, number>();
  for (const day of rescuedDays) counts.set(day, (counts.get(day) ?? 0) + 1);
  let cumulative = 0;
  const mix = new Map<string, number>();
  for (const enrollment of rows.enrollments) mix.set(enrollment.program, (mix.get(enrollment.program) ?? 0) + 1);
  return {
    scriptsRescued: rescuedDays.length,
    medianDaysToTherapy: Math.round(median * 10) / 10,
    bridgeCliffsCaught: rows.alerts.filter((a) => a.kind === "bridge_cliff").length,
    pctUnderserved: rows.patients.length ? Math.round(1000 * rows.patients.filter((p) => p.rural).length / rows.patients.length) / 10 : 0,
    rescuedSeries: [...counts].sort(([a], [b]) => a - b).map(([day, count]) => ({ day, count: cumulative += count })),
    programMix: [...mix].sort(([a], [b]) => a.localeCompare(b)).map(([program, count]) => ({ program, count })),
    daysWithoutMedication,
    sample: false,
    paHoursSaved: Math.round((countInitialPaDrafts(rows.events) * PA_MINUTES_SAVED_ESTIMATE) / 60 * 10) / 10,
  };
}
