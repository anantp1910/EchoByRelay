"use client";

import { RotateCcw, Search, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { DashboardShell, DashCard } from "@/components/shell/DashboardShell";
import { BRAND } from "@/components/brand";
import { AgentTimeline } from "@/components/AgentTimeline";
import { LocalTime } from "@/components/LocalTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveEvents } from "@/components/useLiveEvents";
import type { PharmaMetricsRes } from "@/lib/api/contracts";
import type { AgentEvent, AuditLog, Json } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { ProgramMixChart, RescuedLineChart, programRows } from "./Charts";
import { CountUp } from "./CountUp";
import { coarseLocation, patientTag, redactName } from "./deid";
import { HOURS_PER_MANUAL_PA, METRICS_ARE_SAMPLE } from "./sample";
import { usePharmaData, type Load } from "./usePharmaData";

const int = new Intl.NumberFormat("en-US");
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Pharma dashboard: executive view. KPIs, charts, de-identified live feed, audit. */
export function PharmaDashboard() {
  const data = usePharmaData();
  const live = useLiveEvents({ limit: 60 });

  // De-identify: tag + coarse location instead of name/ZIP; names in text redacted.
  const feed = useMemo<AgentEvent[]>(
    () =>
      [...live.events].reverse().map((e) => {
        const p = data.patients.get(e.patient_id);
        const tag = patientTag(e.patient_id);
        const clean = (s: string) => redactName(s, p?.name, tag);
        return {
          ...e,
          title: `Patient ${tag} · ${coarseLocation(p?.zip)} · ${clean(e.title)}`,
          detail: e.detail ? clean(e.detail) : null,
        };
      }),
    [live.events, data.patients]
  );

  return (
    <DashboardShell
      portal="pharma"
      title="Pharma"
      subtitle={`Every prescription ${BRAND.name} carried, from decision to delivery.`}
      sections={[
        { id: "metrics", label: "Key metrics" },
        { id: "charts", label: "Scripts rescued" },
        { id: "mix", label: "Program mix" },
        { id: "feed", label: "Live feed" },
        { id: "audit", label: "Audit trail" },
      ]}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpis metrics={data.metrics} state={data.metricsState} paSubmitted={data.paSubmitted} onRetry={data.retry} />

        <ChartCard
          id="charts"
          className="md:col-span-2 xl:col-span-3"
          title="Scripts rescued over time"
          subtitle="Cumulative, by demo day"
          state={data.metricsState}
          onRetry={data.retry}
          empty={!data.metrics?.rescuedSeries.length}
          table={
            data.metrics && (
              <DataTable
                head={["Demo day", "Scripts rescued"]}
                rows={data.metrics.rescuedSeries.map((r) => [String(r.day), int.format(r.count)])}
              />
            )
          }
        >
          {data.metrics && <RescuedLineChart series={data.metrics.rescuedSeries} />}
        </ChartCard>

        <ChartCard
          id="mix"
          className="md:col-span-2 xl:col-span-2"
          title="Program mix"
          subtitle="Prescriptions by access path"
          state={data.metricsState}
          onRetry={data.retry}
          empty={!data.metrics}
          table={
            data.metrics && (
              <DataTable
                head={["Access path", "Prescriptions"]}
                rows={programRows(data.metrics.programMix).map((r) => [r.label, int.format(r.count)])}
              />
            )
          }
        >
          {data.metrics && <ProgramMixChart mix={data.metrics.programMix} />}
        </ChartCard>

        <DashCard
          id="feed"
          className="md:col-span-2 xl:col-span-2"
          title="Live agent feed"
          meta={<span className="text-xs text-muted-foreground">De-identified</span>}
        >
          <div className="max-h-[560px] overflow-y-auto pr-1">
            <AgentTimeline
              events={feed}
              state={live.state}
              error={live.error}
              onRetry={live.retry}
              readOnly
              density="comfortable"
              emptyHint="Agent steps from every portal stream here, without patient names."
            />
          </div>
        </DashCard>

        <div id="audit" className="scroll-mt-20 md:col-span-2 xl:col-span-4">
          <AuditTrail rows={data.audit} state={data.auditState} onRetry={data.retry} />
        </div>
      </div>
    </DashboardShell>
  );
}

function SampleBadge() {
  if (!METRICS_ARE_SAMPLE) return null;
  return (
    <span
      title="The metrics route still returns placeholder numbers"
      className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
      data-testid="sample-badge"
    >
      Sample data
    </span>
  );
}

function Kpis({
  metrics,
  state,
  paSubmitted,
  onRetry,
}: {
  metrics: PharmaMetricsRes | null;
  state: Load;
  paSubmitted: number | null;
  onRetry: () => void;
}) {
  const tiles: { id: string; label: string; hint: string; value: number | null; format: (n: number) => string; sample: boolean }[] = [
    {
      id: "scripts-rescued",
      label: "Scripts rescued",
      hint: "Would have been abandoned",
      value: metrics?.scriptsRescued ?? null,
      format: (n) => int.format(Math.round(n)),
      sample: true,
    },
    {
      id: "time-to-therapy",
      label: "Median time to therapy",
      hint: "Decision to first dose",
      value: metrics?.medianDaysToTherapy ?? null,
      format: (n) => `${oneDecimal.format(n)} days`,
      sample: true,
    },
    {
      id: "pa-hours-saved",
      label: "PA hours saved",
      hint: `est. at ${HOURS_PER_MANUAL_PA} h per PA`,
      value: paSubmitted === null ? null : paSubmitted * HOURS_PER_MANUAL_PA,
      format: (n) => `${int.format(Math.round(n))} h`,
      sample: false,
    },
    {
      id: "bridge-cliffs",
      label: "Bridge cliffs caught",
      hint: "Before supply ran out",
      value: metrics?.bridgeCliffsCaught ?? null,
      format: (n) => int.format(Math.round(n)),
      sample: true,
    },
  ];

  return (
    <>
      {tiles.map((k, i) => (
        <div
          key={k.id}
          id={i === 0 ? "metrics" : undefined}
          data-testid={`kpi-${k.id}`}
          className={cn(
            "relative flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border p-5",
            i === 0
              ? "dark min-h-[16rem] border-transparent bg-[#0b0f14] text-foreground md:col-span-2 xl:col-span-1 xl:row-span-2 xl:min-h-full"
              : "border-line bg-card"
          )}
        >
          {i === 0 && (
            <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-[var(--echo-accent)] opacity-25 blur-3xl" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            {k.sample && <SampleBadge />}
          </div>
          <div
            className={cn(
              "relative mt-2 font-heading font-light tracking-tight tabular",
              i === 0 ? "mt-auto text-[clamp(4.5rem,7vw,7rem)] leading-none text-[var(--echo-accent)]" : "text-3xl lg:text-4xl"
            )}
          >
            {k.value !== null ? (
              <CountUp value={k.value} format={k.format} />
            ) : k.sample && state === "error" ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded text-base font-medium text-block-strong underline-offset-2 hover:underline"
              >
                <RotateCcw aria-hidden className="size-4" /> Retry
              </button>
            ) : (
              <Skeleton className="h-9 w-20" />
            )}
          </div>
          <p className="relative mt-1 text-xs text-muted-foreground">{k.hint}</p>
        </div>
      ))}
    </>
  );
}

function ChartCard({
  id,
  className,
  title,
  subtitle,
  state,
  onRetry,
  empty,
  table,
  children,
}: {
  id?: string;
  className?: string;
  title: string;
  subtitle: string;
  state: Load;
  onRetry: () => void;
  empty: boolean;
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-20 rounded-2xl border border-line bg-card p-5", className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <SampleBadge />
      </div>
      <div className="mt-4">
        {state === "loading" ? (
          <Skeleton className="h-[240px] w-full" />
        ) : state === "error" && empty ? (
          <div role="alert" className="flex h-[240px] flex-col items-center justify-center gap-2 text-sm text-block-strong">
            <TriangleAlert aria-hidden className="size-5" />
            Couldn&apos;t load metrics
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw aria-hidden /> Try again
            </Button>
          </div>
        ) : empty ? (
          <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <>
            {children}
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer rounded py-3 leading-5 text-muted-foreground hover:text-foreground">
                View as table
              </summary>
              <div className="mt-2 overflow-x-auto">{table}</div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

function DataTable({ head, rows }: { head: [string, string]; rows: string[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{head[0]}</TableHead>
          <TableHead className="text-right">{head[1]}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([a, b]) => (
          <TableRow key={a}>
            <TableCell>{a}</TableCell>
            <TableCell className="text-right font-mono tabular">{b}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Payload as keys and short IDs only — never free-text values. */
function payloadSummary(payload: Json): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return Object.entries(payload)
    .map(([k, v]) => (typeof v === "string" && UUID.test(v) ? `${k}=${v.slice(0, 8)}` : k))
    .join(" · ");
}

function AuditTrail({ rows, state, onRetry }: { rows: AuditLog[]; state: Load; onRetry: () => void }) {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const ids = { actor: useId(), action: useId(), q: useId() };

  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor ?? "system"))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!actor || (r.actor ?? "system") === actor) &&
      (!action || r.action === action) &&
      (!needle || `${r.actor ?? "system"} ${r.action} ${payloadSummary(r.payload)}`.toLowerCase().includes(needle))
  );

  const selectCls =
    "h-11 rounded-lg border border-line bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:h-9";

  return (
    <section aria-labelledby="audit-title" className="min-w-0 rounded-2xl border border-line bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="audit-title" className="text-lg font-bold">
          Audit trail
        </h2>
        {state === "ready" && (
          <span className="font-mono text-xs text-muted-foreground tabular">
            {int.format(filtered.length)} of {int.format(rows.length)}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.actor} className="text-xs font-medium text-muted-foreground">
            Actor
          </label>
          <select id={ids.actor} value={actor} onChange={(e) => setActor(e.target.value)} className={selectCls} data-testid="audit-actor">
            <option value="">All</option>
            {actors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.action} className="text-xs font-medium text-muted-foreground">
            Action
          </label>
          <select
            id={ids.action}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={cn(selectCls, "max-w-[14rem]")}
            data-testid="audit-action"
          >
            <option value="">All</option>
            {actions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor={ids.q} className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={ids.q}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="action, actor, id"
              className="h-11 pl-8 sm:h-9"
              data-testid="audit-search"
            />
          </div>
        </div>
      </div>

      {state === "loading" ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading audit trail">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : state === "error" && rows.length === 0 ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-6 text-sm text-block-strong">
          Couldn&apos;t load the audit trail.
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden /> Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No actions recorded yet." : "No actions match these filters."}
        </p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table data-testid="audit-table">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell title={r.created_at}>
                    <LocalTime iso={r.created_at} />
                  </TableCell>
                  <TableCell className="text-sm">{r.actor ?? "system"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="max-w-[32ch] truncate font-mono text-xs text-muted-foreground" title={payloadSummary(r.payload)}>
                    {payloadSummary(r.payload)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
