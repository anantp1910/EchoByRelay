"use client";

import { Bell, BellOff, Languages, MapPin, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { AgentTimeline, type Decision } from "@/components/AgentTimeline";
import {
  ALERT_COPY,
  FIXTURE_ALERTS,
  FIXTURE_PATIENT_ROWS,
  type AlertRow,
  type PatientRow,
} from "@/components/fixtures";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { HAS_SUPABASE, useLiveEvents } from "@/components/useLiveEvents";
import { VoiceButton } from "@/components/VoiceButton";
import { approve, intake } from "@/lib/api/client";
import type { AgentEvent } from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

/** Doctor portal: calm, dense, fast. Patients · voice + timeline · alerts. */
export function DoctorConsole() {
  const [selectedId, setSelectedId] = useState<string>(MARIA_ID);
  const [patientsOpen, setPatientsOpen] = useState(false);
  const selected = FIXTURE_PATIENT_ROWS.find((r) => r.patient.id === selectedId) ?? FIXTURE_PATIENT_ROWS[0];
  const { events, state, error, retry, replay, patch } = useLiveEvents({ patientId: selected.patient.id });
  const alerts = FIXTURE_ALERTS.filter((a) => !a.resolved);

  async function handleTranscript(transcript: string) {
    if (!HAS_SUPABASE) {
      replay();
      toast("Running the demo steps", { description: "Offline fixtures: no Supabase keys set." });
      return;
    }
    try {
      await intake({ patientId: selected.patient.id, transcript });
    } catch (e) {
      toast.error("Couldn't start the prescription", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  async function handleDecision(event: AgentEvent, decision: Decision) {
    const status = decision === "approve" ? "approved" : "rejected";
    if (HAS_SUPABASE) {
      try {
        await approve({ eventId: event.id, decision, actor: "doctor", via: "click" });
      } catch (e) {
        toast.error("Approval didn't go through", {
          description: e instanceof Error ? e.message : "Please try again.",
        });
        return;
      }
    }
    patch(event.id, { status });
    toast.success(decision === "approve" ? "Approved" : "Rejected", { description: event.title });
  }

  const patientList = (
    <PatientList
      rows={FIXTURE_PATIENT_ROWS}
      selectedId={selected.patient.id}
      onSelect={(id) => {
        setSelectedId(id);
        setPatientsOpen(false);
      }}
    />
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader portal="Doctor portal">
        <Sheet open={patientsOpen} onOpenChange={setPatientsOpen}>
          <SheetTrigger render={<Button variant="outline" size="sm" className="lg:hidden" />}>
            <Users aria-hidden /> Patients
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <SheetHeader className="border-b border-line">
              <SheetTitle>Today&apos;s patients</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto p-2">{patientList}</div>
          </SheetContent>
        </Sheet>
      </AppHeader>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 content-start items-start gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:p-6">
        <aside aria-label="Today's patients" className="hidden lg:block">
          <Panel title="Today" count={FIXTURE_PATIENT_ROWS.length}>
            {patientList}
          </Panel>
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <PatientHeader row={selected} />

          <section aria-label="New prescription by voice" className="rounded-xl border border-line bg-card p-5">
            <VoiceButton onTranscript={handleTranscript} />
          </section>

          <section aria-labelledby="timeline-title" className="rounded-xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="timeline-title" className="text-base font-bold">
                Agent activity
              </h2>
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
            <AgentTimeline
              events={events}
              state={state}
              error={error}
              onRetry={retry}
              onDecision={handleDecision}
              density="dense"
              emptyTitle={`Nothing in motion for ${selected.patient.name.split(" ")[0]}`}
              emptyHint="Hold the mic and say the prescription to start."
            />
          </section>
        </main>

        <aside aria-label="Alerts">
          <Panel title="Alerts" count={alerts.length} icon={Bell}>
            <AlertsInbox alerts={alerts} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: typeof Bell;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {Icon && <Icon aria-hidden className="size-4 text-muted-foreground" />}
        <h2 className="text-sm font-bold">{title}</h2>
        {count !== undefined && (
          <span className="ml-auto rounded-full bg-muted px-2 font-mono text-xs leading-5 tabular">{count}</span>
        )}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function PatientList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PatientRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">No patients scheduled today.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const active = row.patient.id === selectedId;
        return (
          <li key={row.patient.id}>
            <button
              type="button"
              onClick={() => onSelect(row.patient.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
                active && "bg-accent hover:bg-accent"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{row.patient.name}</span>
                <StatusPill status={row.status} />
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.drug} · {row.note}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PatientHeader({ row }: { row: PatientRow }) {
  const { patient } = row;
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-5 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold">{patient.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Languages aria-hidden className="size-3.5" />
            {patient.language === "es" ? "Spanish" : "English"}
          </span>
          {patient.rural && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-3.5" /> Rural
            </span>
          )}
          <span>{row.drug}</span>
        </p>
      </div>
      <StatusPill status={row.status} size="md" className="ml-auto" />
    </section>
  );
}

function AlertsInbox({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
        <BellOff aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">All clear. The watchdog will flag bridge cliffs, denials, and missed pickups here.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => {
        const copy = ALERT_COPY[a.kind];
        const critical = a.severity === "critical";
        return (
          <li
            key={a.id}
            className={cn(
              "rounded-lg border p-3",
              critical ? "border-block/40 bg-block-soft" : "border-risk/40 bg-risk-soft"
            )}
          >
            <p className={cn("text-sm font-bold", critical ? "text-block-strong" : "text-risk-strong")}>{copy.title}</p>
            <p className="mt-0.5 text-sm">
              <span className="font-medium">{a.patientName}</span> · {a.detail}
            </p>
            <Button size="sm" variant="outline" className="mt-2" disabled title="Wired in Phase 7">
              {copy.action}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
