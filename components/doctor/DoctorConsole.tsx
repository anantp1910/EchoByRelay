"use client";

import { Bell, BellOff, ExternalLink, Languages, MapPin, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DashboardShell, DashCard } from "@/components/shell/DashboardShell";
import { AgentTimeline, type Decision } from "@/components/AgentTimeline";
import { CheckInStrip, checkInEvents, FlagPills } from "@/components/checkins/CheckInBits";
import type { CheckInView } from "@/components/checkins/types";
import { useCheckIns, visibleCheckIns } from "@/components/checkins/useCheckIns";
import type { AlertRow, PatientRow } from "@/components/fixtures";
import { ALERT, alertTone } from "@/components/labels";
import { StatusPill, TONE_CLASSES } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HAS_SUPABASE, useLiveEvents } from "@/components/useLiveEvents";
import { VoiceButton } from "@/components/VoiceButton";
import { approve, intake } from "@/lib/api/client";
import type { ApproveVia } from "@/lib/api/contracts";
import type { AgentEvent } from "@/lib/db/types";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { PaDrawer } from "./PaDrawer";
import { RelaySummary } from "./RelaySummary";
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
  const [letterRx, setLetterRx] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  // Set by alert actions: scroll to the approval card once the patient's steps load.
  const wantPending = useRef(false);
  const doctor = useDoctorData();
  const selected = doctor.rows.find((r) => r.patient.id === selectedId) ?? doctor.rows[0] ?? null;
  const live = useLiveEvents({ patientId: selected?.patient.id ?? selectedId });

  // Show the current prescription's steps only; older runs stay in the audit trail.
  const rxId = selected?.rxId;
  // Check-ins (sample data until the check_ins table exists), after the agent chain.
  const checkins = useCheckIns(selected?.patient.id ?? selectedId);
  const patientFirst = selected?.patient.name.split(" ")[0] ?? "Patient";
  const { memberNames } = doctor;
  const nameFor = useCallback(
    (memberId: string | null) =>
      memberId === null ? patientFirst : (memberNames.get(memberId)?.split(" ")[0] ?? "Care circle"),
    [patientFirst, memberNames]
  );
  const agentEvents = useMemo(
    () => (rxId ? live.events.filter((e) => e.rx_id === rxId || e.rx_id === null) : live.events),
    [live.events, rxId]
  );
  const events = useMemo(
    () => (live.state === "ready" ? [...agentEvents, ...checkInEvents(checkins.checkIns, nameFor)] : agentEvents),
    [agentEvents, live.state, checkins.checkIns, nameFor]
  );
  const recipients = useMemo(
    () => [patientFirst, ...(selected ? doctor.circleOf(selected.patient.id) : []).map((n) => n.split(" ")[0])],
    [patientFirst, selected, doctor]
  );
  const latestCheckInFor = (patientId: string | null): CheckInView | null =>
    patientId && checkins.day !== null ? (visibleCheckIns(patientId, checkins.day)[0] ?? null) : null;
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
    <DashboardShell
      portal="doctor"
      title="Doctor"
      subtitle={selected ? `${selected.patient.name}'s prescription, live` : "Today's patients"}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div id="patient" className="scroll-mt-20">
            <PatientHeader row={selected} loading={doctor.state === "loading"}>
              <CheckInStrip latest={checkins.latest} nameFor={nameFor} />
            </PatientHeader>
          </div>
          <DashCard id="voice" title="New prescription" meta={<span className="text-xs text-muted-foreground">Hold to talk</span>}>
            <VoiceButton onTranscript={handleTranscript} />
          </DashCard>
          <DashCard
            id="today"
            title="Today"
            meta={
              doctor.state === "ready" ? (
                <span className="grid size-8 place-items-center rounded-full bg-muted font-mono text-xs tabular">{doctor.rows.length}</span>
              ) : undefined
            }
            bodyClassName="p-2"
          >
            {patientList}
          </DashCard>
        </div>

        <DashCard
          id="activity"
          title="Agent activity"
          meta={<span className="text-xs text-muted-foreground">{live.source === "live" ? "Live" : "Offline fixtures"}</span>}
          className="lg:row-span-2 xl:row-span-1"
        >
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
        </DashCard>

        <div className="flex min-w-0 flex-col gap-4">
          {live.state === "ready" && agentEvents.some((e) => e.agent === "intake") && (
            <DashCard feature id="echo-did">
              <RelaySummary
                events={agentEvents}
                checkIns={checkins.checkIns}
                patientFirstName={patientFirst}
                recipients={recipients}
                className="mb-0 border-0 bg-transparent p-0"
              />
            </DashCard>
          )}
          <DashCard
            id="alerts"
            title={
              <span className="inline-flex items-center gap-2">
                <Bell aria-hidden className="size-4 text-muted-foreground" /> Alerts
              </span>
            }
            meta={
              doctor.state === "ready" ? (
                <span className="grid size-8 place-items-center rounded-full bg-muted font-mono text-xs tabular">{doctor.alerts.length}</span>
              ) : undefined
            }
            bodyClassName="p-2"
          >
            <AlertsInbox
              alerts={doctor.alerts}
              latestCheckInFor={latestCheckInFor}
              state={doctor.state}
              onRetry={doctor.retry}
              onAction={handleAlert}
            />
          </DashCard>
        </div>
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
    </DashboardShell>
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

function PatientHeader({
  row,
  loading,
  children,
}: {
  row: PatientRow | null;
  loading: boolean;
  children?: React.ReactNode;
}) {
  if (!row) {
    return (
      <section className="rounded-2xl border border-line bg-card px-5 py-4">
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
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-2xl font-bold">{patient.name}</h2>
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
      {children && <div className="w-full border-t border-line pt-2">{children}</div>}
    </section>
  );
}

function AlertsInbox({
  alerts,
  latestCheckInFor,
  state,
  onRetry,
  onAction,
}: {
  alerts: AlertRow[];
  latestCheckInFor: (patientId: string | null) => CheckInView | null;
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
        const checkIn = latestCheckInFor(a.patientId);
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
            {checkIn && checkIn.flags.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="alert-checkin">
                Day {checkIn.day} check-in: <FlagPills flags={checkIn.flags} />
              </p>
            )}
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
