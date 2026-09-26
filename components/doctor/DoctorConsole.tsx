"use client";

import { Bell, BellOff, ExternalLink, Languages, MapPin, RotateCcw, TriangleAlert, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { AgentTimeline, type Decision } from "@/components/AgentTimeline";
import type { AlertRow, PatientRow } from "@/components/fixtures";
import { ALERT, alertTone } from "@/components/labels";
import { StatusPill, TONE_CLASSES } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { HAS_SUPABASE, useLiveEvents } from "@/components/useLiveEvents";
import { VoiceButton } from "@/components/VoiceButton";
import { approve, intake } from "@/lib/api/client";
import type { ApproveVia } from "@/lib/api/contracts";
import type { AgentEvent } from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { PaDrawer } from "./PaDrawer";
import { useDoctorData } from "./useDoctorData";
import { APPROVE_COMMAND } from "./voiceCommands";

const isPaStep = (e: AgentEvent) =>
  typeof e.data === "object" && e.data !== null && !Array.isArray(e.data) && e.data.action === "submit_pa";

/** Scrolls the timeline to the step waiting on the doctor. False if there is none yet. */
function scrollToPending(): boolean {
  const el = document.querySelector('[data-status="needs_approval"]');
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  return el !== null;
}

/** Doctor portal: calm, dense, fast. Patients · voice + timeline · alerts. */
export function DoctorConsole() {
  const [selectedId, setSelectedId] = useState<string>(MARIA_ID);
  const [patientsOpen, setPatientsOpen] = useState(false);
  const [letterRx, setLetterRx] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  // Set by alert actions: scroll to the approval card once the patient's steps load.
  const wantPending = useRef(false);
  const doctor = useDoctorData();
  const selected = doctor.rows.find((r) => r.patient.id === selectedId) ?? doctor.rows[0] ?? null;
  const live = useLiveEvents({ patientId: selected?.patient.id ?? selectedId });

  // Show the current prescription's steps only; older runs stay in the audit trail.
  const rxId = selected?.rxId;
  const events = rxId ? live.events.filter((e) => e.rx_id === rxId || e.rx_id === null) : live.events;
  const pending = events.findLast((e) => e.status === "needs_approval");
  const letterEvent = letterRx ? live.events.findLast((e) => e.rx_id === letterRx && isPaStep(e)) : undefined;

  useEffect(() => {
    if (wantPending.current && scrollToPending()) wantPending.current = false;
  }, [events]);

  function decide(event: AgentEvent, decision: Decision, via: ApproveVia = "click") {
    // Optimistic: the card closes at once. Enrollment takes ~10s server-side and
    // its steps stream in over Realtime; approving twice is a server no-op.
    live.setOptimistic(event.id, decision === "approve" ? "approved" : "rejected");
    toast.success(decision === "approve" ? "Approved" : "Rejected", { description: event.title });
    if (!HAS_SUPABASE) return;
    approve({ eventId: event.id, decision, actor: "doctor", via }).catch((e: unknown) => {
      live.setOptimistic(event.id, null);
      toast.error("Approval didn't go through", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    });
  }

  async function handleTranscript(transcript: string) {
    if (APPROVE_COMMAND.test(transcript)) {
      if (pending) decide(pending, "approve", "voice");
      else toast("Nothing is waiting for approval");
      return;
    }
    setSelectedId(MARIA_ID);
    if (!HAS_SUPABASE) {
      live.replay();
      toast("Running the demo steps", { description: "Offline fixtures: no Supabase keys set." });
      return;
    }
    try {
      await intake({ patientId: MARIA_ID, transcript });
    } catch (e) {
      toast.error("Couldn't start the prescription", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  function openPatient(id: string) {
    setSelectedId(id);
    setPatientsOpen(false);
  }

  function openLetter(rx: string) {
    setLetterRx(rx);
    setLetterOpen(true);
  }

  function handleAlert(a: AlertRow) {
    if (!a.patientId) return;
    openPatient(a.patientId);
    if (a.kind === "pa_denied" && a.rx_id) {
      openLetter(a.rx_id);
    } else if (a.kind === "bridge_cliff" || a.kind === "escalation") {
      // Another patient's steps haven't loaded yet; the effect scrolls once they do.
      if (a.patientId === selected?.patient.id && scrollToPending()) return;
      wantPending.current = true;
      document.getElementById("timeline-title")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  const patientList = (
    <PatientList
      rows={doctor.rows}
      state={doctor.state}
      error={doctor.error}
      onRetry={doctor.retry}
      selectedId={selected?.patient.id ?? null}
      onSelect={openPatient}
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
          <Panel title="Today" count={doctor.state === "ready" ? doctor.rows.length : undefined}>
            {patientList}
          </Panel>
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <PatientHeader row={selected} loading={doctor.state === "loading"} />

          <section aria-label="New prescription by voice" className="rounded-xl border border-line bg-card p-5">
            <VoiceButton onTranscript={handleTranscript} />
          </section>

          <section aria-labelledby="timeline-title" className="rounded-xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="timeline-title" className="text-base font-bold">
                Agent activity
              </h2>
              <span className="text-xs text-muted-foreground">{live.source === "live" ? "Live" : "Offline fixtures"}</span>
            </div>
            <AgentTimeline
              events={events}
              state={live.state}
              error={live.error}
              onRetry={live.retry}
              onDecision={(event, decision) => decide(event, decision)}
              onOpenLetter={(event) => event.rx_id && openLetter(event.rx_id)}
              density="dense"
              emptyTitle={`Nothing in motion for ${selected?.patient.name.split(" ")[0] ?? "this patient"}`}
              emptyHint="Hold the mic and say the prescription to start."
            />
          </section>
        </main>

        <aside aria-label="Alerts">
          <Panel title="Alerts" count={doctor.state === "ready" ? doctor.alerts.length : undefined} icon={Bell}>
            <AlertsInbox
              alerts={doctor.alerts}
              state={doctor.state}
              onRetry={doctor.retry}
              onAction={handleAlert}
            />
          </Panel>
        </aside>
      </div>

      {letterRx && (
        <PaDrawer
          key={letterRx}
          open={letterOpen}
          onOpenChange={setLetterOpen}
          rxId={letterRx}
          event={letterEvent}
          onApprove={(event, via) => decide(event, "approve", via)}
        />
      )}
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

function RowSkeletons() {
  return (
    <div className="flex flex-col gap-3 p-2" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function PatientList({
  rows,
  state,
  error,
  onRetry,
  selectedId,
  onSelect,
}: {
  rows: PatientRow[];
  state: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (state === "loading") return <RowSkeletons />;
  if (state === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm text-block-strong">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <TriangleAlert aria-hidden className="size-4" /> Couldn&apos;t load patients
        </span>
        {error && <span>{error}</span>}
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    );
  }
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
              data-testid={`patient-row-${row.patient.id}`}
              className={cn(
                "flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
                active && "bg-accent hover:bg-accent"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{row.patient.name}</span>
                {row.status && <StatusPill status={row.status} />}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[row.drug, row.note].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PatientHeader({ row, loading }: { row: PatientRow | null; loading: boolean }) {
  if (!row) {
    return (
      <section className="rounded-xl border border-line bg-card px-5 py-4">
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading patient">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Pick a patient to begin.</p>
        )}
      </section>
    );
  }
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
          {row.drug && <span>{row.drug}</span>}
          <span>{row.note}</span>
        </p>
      </div>
      {row.status && <StatusPill status={row.status} size="md" className="ml-auto" />}
    </section>
  );
}

function AlertsInbox({
  alerts,
  state,
  onRetry,
  onAction,
}: {
  alerts: AlertRow[];
  state: "loading" | "ready" | "error";
  onRetry: () => void;
  onAction: (alert: AlertRow) => void;
}) {
  if (state === "loading") return <RowSkeletons />;
  if (state === "error") {
    // Never "All clear" when we simply couldn't check.
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm text-block-strong">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <TriangleAlert aria-hidden className="size-4" /> Couldn&apos;t load alerts
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    );
  }
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
        <BellOff aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          All clear. The watchdog will flag bridge cliffs, denials, and missed pickups here.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {alerts.map((a) => {
        const copy = ALERT[a.kind];
        return (
          <li
            key={a.id}
            data-alert-kind={a.kind}
            className={cn("rounded-lg border p-3", TONE_CLASSES[alertTone(a.kind, a.severity)])}
          >
            <p className="text-sm font-bold">{copy.title}</p>
            <p className="mt-0.5 text-sm text-foreground">
              <span className="font-medium">{a.patientName}</span>
              {a.detail && <> · {a.detail}</>}
            </p>
            {a.kind === "no_pickup" && a.patientId ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                nativeButton={false}
                render={<a href={`/patient/${a.patientId}`} target="_blank" rel="noopener noreferrer" />}
                data-testid={`alert-action-${a.kind}`}
              >
                {copy.action} <ExternalLink aria-hidden />
                <span className="sr-only">(opens the patient portal in a new tab)</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={!a.patientId}
                onClick={() => onAction(a)}
                data-testid={`alert-action-${a.kind}`}
              >
                {copy.action}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
