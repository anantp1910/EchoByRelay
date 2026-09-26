"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  CreditCard,
  FilePen,
  Inbox,
  LoaderCircle,
  MessageCircle,
  Mic,
  Radar,
  RotateCcw,
  Route,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentEvent, AgentEventStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { StatusPill, toneFor, type Tone } from "./StatusPill";

const AGENT: Record<string, { icon: LucideIcon; label: string }> = {
  trustGate: { icon: ShieldCheck, label: "Trust gate" },
  intake: { icon: Mic, label: "Intake" },
  coverage: { icon: ShieldCheck, label: "Coverage" },
  router: { icon: Route, label: "Router" },
  paDrafter: { icon: FilePen, label: "PA drafter" },
  patientComms: { icon: MessageCircle, label: "Patient comms" },
  checkout: { icon: CreditCard, label: "Checkout" },
  watchdog: { icon: Radar, label: "Watchdog" },
};
const agentMeta = (agent: string) => AGENT[agent] ?? { icon: Bot, label: agent };

const NODE: Record<Tone, string> = {
  ok: "bg-ok text-white dark:text-[#062326]",
  risk: "bg-risk text-white dark:text-[#062326]",
  blocked: "bg-block text-white dark:text-[#062326]",
  pending: "bg-pending-soft text-pending-strong ring-1 ring-pending/40",
};

/** Timestamps render as UTC HH:MM:SS — identical on server and client. */
const clock = (iso: string) => iso.slice(11, 19);

export type Decision = "approve" | "reject";

/**
 * Agents may log "running" and the result as separate rows instead of updating
 * one row. Drop a "running" step once the same agent has a later event for the
 * same prescription, so its spinner never hangs. Expects created_at order.
 */
export function collapseSuperseded(events: AgentEvent[]): AgentEvent[] {
  const later = new Set<string>();
  const keep: AgentEvent[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const key = `${e.agent}|${e.rx_id ?? ""}`;
    if (!(e.status === "running" && later.has(key))) keep.push(e);
    later.add(key);
  }
  return keep.reverse();
}

interface AgentTimelineProps {
  events: AgentEvent[];
  state?: "loading" | "ready" | "error";
  error?: string | null;
  onRetry?: () => void;
  /** Called from approval cards. Omit (or set readOnly) to hide the buttons. */
  onDecision?: (event: AgentEvent, decision: Decision) => Promise<void> | void;
  readOnly?: boolean;
  /** dense = doctor console; comfortable = pharma / wide views. */
  density?: "dense" | "comfortable";
  emptyTitle?: string;
  emptyHint?: string;
  className?: string;
}

/** Hero component: live, streaming list of agent steps with inline approvals. */
export function AgentTimeline({
  events,
  state = "ready",
  error,
  onRetry,
  onDecision,
  readOnly = false,
  density = "dense",
  emptyTitle = "No agent activity yet",
  emptyHint = "Steps appear here as soon as a prescription starts moving.",
  className,
}: AgentTimelineProps) {
  const steps = collapseSuperseded(events);

  if (state === "loading") {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading agent activity">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-start gap-3 rounded-xl border border-block/30 bg-block-soft p-4 text-block-strong",
          className
        )}
      >
        <div className="flex items-center gap-2 font-medium">
          <TriangleAlert aria-hidden className="size-4" />
          Couldn&apos;t load agent activity
        </div>
        {error && <p className="text-sm">{error}</p>}
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden /> Try again
          </Button>
        )}
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center",
          className
        )}
      >
        <Inbox aria-hidden className="size-6 text-muted-foreground" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ol className={cn("relative", className)} aria-live="polite" aria-label="Agent activity">
      <AnimatePresence initial={false}>
        {steps.map((event, i) => (
          <TimelineStep
            key={event.id}
            event={event}
            last={i === steps.length - 1}
            density={density}
            onDecision={readOnly ? undefined : onDecision}
            readOnly={readOnly}
          />
        ))}
      </AnimatePresence>
    </ol>
  );
}

function StatusNode({ status, icon: Icon }: { status: AgentEventStatus; icon: LucideIcon }) {
  const tone = toneFor(status);
  const Glyph =
    status === "running"
      ? LoaderCircle
      : status === "done" || status === "approved"
        ? Check
        : status === "blocked" || status === "rejected"
          ? X
          : Icon;
  return (
    <span
      className={cn(
        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-200",
        // Solid blue (vs. the soft "running" node) so a step waiting on a human stands out.
        status === "needs_approval" ? "bg-pending text-white dark:text-[#062326]" : NODE[tone]
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="grid place-items-center"
        >
          <Glyph
            aria-hidden
            className={cn("size-4", status === "running" && "animate-spin motion-reduce:animate-none")}
          />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function TimelineStep({
  event,
  last,
  density,
  onDecision,
  readOnly,
}: {
  event: AgentEvent;
  last: boolean;
  density: "dense" | "comfortable";
  onDecision?: AgentTimelineProps["onDecision"];
  readOnly: boolean;
}) {
  const meta = agentMeta(event.agent);
  const dense = density === "dense";

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("relative flex gap-3", dense ? "pb-4" : "pb-6")}
      data-agent={event.agent}
      data-status={event.status}
    >
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-line" />}
      <StatusNode status={event.status} icon={meta.icon} />

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{meta.label}</span>
          {event.simulated && (
            <span
              title="Backed by a mock that mirrors the real API"
              className="rounded border border-line px-1.5 text-[0.7rem] leading-5 text-muted-foreground"
            >
              Simulated
            </span>
          )}
          <time dateTime={event.created_at} className="ml-auto font-mono text-xs text-muted-foreground tabular">
            {clock(event.created_at)}
          </time>
        </div>

        <p className={cn("mt-0.5 font-medium text-foreground", dense ? "text-sm" : "text-base")}>{event.title}</p>
        {event.detail && (
          <p className={cn("mt-0.5 text-muted-foreground", dense ? "text-sm" : "text-[0.95rem]")}>{event.detail}</p>
        )}

        {event.status !== "running" && event.status !== "done" && (
          <div className="mt-1.5">
            <StatusPill status={event.status} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {event.status === "needs_approval" && (
            <ApprovalCard key="approval" event={event} onDecision={onDecision} readOnly={readOnly} />
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function ApprovalCard({
  event,
  onDecision,
  readOnly,
}: {
  event: AgentEvent;
  onDecision?: AgentTimelineProps["onDecision"];
  readOnly: boolean;
}) {
  const [busy, setBusy] = useState<Decision | null>(null);

  async function decide(decision: Decision) {
    if (!onDecision) return;
    setBusy(decision);
    try {
      await onDecision(event, decision);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-lg border border-pending/40 bg-pending-soft p-3">
        <p className="text-sm font-medium text-pending-strong">
          {readOnly || !onDecision ? "Waiting for the doctor's approval" : "Your approval is needed"}
        </p>
        {!readOnly && onDecision && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => decide("approve")} disabled={busy !== null} data-testid="approve">
              {busy === "approve" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Check aria-hidden />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => decide("reject")}
              disabled={busy !== null}
              data-testid="reject"
            >
              <X aria-hidden /> Reject
            </Button>
            <span className="text-xs text-muted-foreground">or say &ldquo;approve&rdquo;</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
