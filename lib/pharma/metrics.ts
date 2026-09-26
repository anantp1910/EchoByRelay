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
  enrollments: { program: string; rx_id: string; start_day: number | null }[];
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

/** Live results use explicit simulated days, never wall-clock test duration. */
export function calculateMetrics(rows: MetricsRows): PharmaMetricsRes {
  const rescuedDays: number[] = [];
  const durations: number[] = [];
  for (const rx of rows.prescriptions) {
    const events = rows.events.filter((e) => e.rx_id === rx.id);
    const reached = events.find((e) => e.data?.onTherapy === true);
    // Seed and live scripts use the same milestone. An order's created_at is
    // NOT its delivery time; never manufacture therapy dates from that column.
    if (!reached) continue;
    const days = events.map((e) => e.data?.day).filter((d): d is number => typeof d === "number");
    const start = days.length ? Math.min(...days) : rows.enrollments.find((e) => e.rx_id === rx.id)?.start_day;
    const end = typeof reached?.data.day === "number" ? reached.data.day : undefined;
    if (start != null && end !== undefined) durations.push(Math.max(0, end - start));
    const priorAlert = rows.alerts.some((a) => a.rx_id === rx.id && a.created_at <= reached.created_at);
    const rerouted = events.some((e) => e.data?.paDenied === true && e.created_at <= reached.created_at);
    if (end !== undefined && (reached.data.rescued === true || priorAlert || rerouted)) {
      rescuedDays.push(end);
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
    sample: false,
    paHoursSaved: Math.round((countInitialPaDrafts(rows.events) * PA_MINUTES_SAVED_ESTIMATE) / 60 * 10) / 10,
  };
}
