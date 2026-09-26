"use client";

import { BarChart3, LineChart, type LucideIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { AgentTimeline } from "@/components/AgentTimeline";
import { FIXTURE_KPIS } from "@/components/fixtures";
import { StatusPill } from "@/components/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveEvents } from "@/components/useLiveEvents";

const KPIS: { label: string; value: string; hint: string }[] = [
  { label: "Scripts rescued", value: String(FIXTURE_KPIS.scriptsRescued), hint: "Would have been abandoned" },
  { label: "Median days to therapy", value: FIXTURE_KPIS.medianDaysToTherapy.toFixed(1), hint: "Decision to first dose" },
  { label: "Bridge cliffs caught", value: String(FIXTURE_KPIS.bridgeCliffsCaught), hint: "Before supply ran out" },
  { label: "Rural or underserved", value: `${FIXTURE_KPIS.pctUnderserved}%`, hint: "Patients by ZIP code" },
];

/** Pharma dashboard: executive view. KPIs, charts (Phase 8), live feed, audit. */
export function PharmaDashboard() {
  // All patients; the feed shows agent steps only (no names), i.e. de-identified.
  const { events, state, error, retry } = useLiveEvents();
  const audit = [...events].reverse();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader portal="Pharma dashboard" />

      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 lg:p-8">
        <div>
          <h1 className="text-3xl font-bold">Access performance</h1>
          <p className="mt-1 text-muted-foreground">Every prescription Relay carried, from decision to delivery.</p>
        </div>

        <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className="rounded-xl border border-line bg-card p-4 lg:p-5">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="mt-2 font-heading text-3xl font-bold tabular lg:text-4xl">{k.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Charts">
          <ChartPlaceholder title="Program mix" icon={BarChart3} />
          <ChartPlaceholder title="Scripts rescued over time" icon={LineChart} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-labelledby="feed-title" className="rounded-xl border border-line bg-card p-5">
            <h2 id="feed-title" className="mb-4 text-lg font-bold">
              Live agent feed
            </h2>
            <AgentTimeline
              events={events}
              state={state}
              error={error}
              onRetry={retry}
              readOnly
              density="comfortable"
            />
          </section>

          <section aria-labelledby="audit-title" className="min-w-0 rounded-xl border border-line bg-card p-5">
            <h2 id="audit-title" className="mb-4 text-lg font-bold">
              Audit trail
            </h2>
            {audit.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No actions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time (UTC)</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs tabular">{e.created_at.slice(11, 19)}</TableCell>
                        <TableCell className="text-sm">{e.agent}</TableCell>
                        <TableCell className="max-w-[28ch] truncate text-sm" title={e.title}>
                          {e.title}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={e.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ChartPlaceholder({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-muted-foreground">
        <Icon aria-hidden className="size-6" />
        Chart arrives with live metrics
      </div>
    </div>
  );
}
