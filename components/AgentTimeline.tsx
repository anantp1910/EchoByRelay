"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  CreditCard,
  FilePen,
  FileText,
  Inbox,
  Landmark,
  LoaderCircle,
  MessageCircle,
  Mic,
  Package,
  Radar,
  RotateCcw,
  Route,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentEvent, AgentEventStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { isRouterProgram, PROGRAM } from "./labels";
import { StatusPill, TONE_CLASSES, toneFor, type Tone } from "./StatusPill";
import { LocalTime } from "./LocalTime";

const AGENT: Record<string, { icon: LucideIcon; label: string }> = {
  trustGate: { icon: ShieldCheck, label: "Trust gate" },
  intake: { icon: Mic, label: "Intake" },
  coverage: { icon: ShieldCheck, label: "Coverage" },
  router: { icon: Route, label: "Router" },
  medvantx: { icon: Package, label: "Medvantx" },
  paDrafter: { icon: FilePen, label: "PA drafter" },
  payer: { icon: Landmark, label: "Payer" },
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


export type Decision = "approve" | "reject";

/** Reads a string field from an event's jsonb `data`. */
function dataField(event: AgentEvent, key: string): string | undefined {
  const d = event.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const v = d[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

interface AgentTimelineProps {
  events: AgentEvent[];
  state?: "loading" | "ready" | "error";
  error?: string | null;
  onRetry?: () => void;
  /**
   * Called from approval cards. Should apply the decision optimistically (the
   * card closes at once); the slow server work finishes behind Realtime.
   * Omit (or set readOnly) to hide the buttons.
   */
  onDecision?: (event: AgentEvent, decision: Decision) => void;
  readOnly?: boolean;
  /** Shows "Open letter" on PA steps (data.action "submit_pa") once drafted. */
  onOpenLetter?: (event: AgentEvent) => void;
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
  onOpenLetter,
  density = "dense",
  emptyTitle = "No agent activity yet",
  emptyHint = "Steps appear here as soon as a prescription starts moving.",
  className,
}: AgentTimelineProps) {
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

  if (events.length === 0) {
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
        {events.map((event, i) => (
          <TimelineStep
            key={event.id}
            event={event}
            last={i === events.length - 1}
            density={density}
            onDecision={readOnly ? undefined : onDecision}
            onOpenLetter={onOpenLetter}
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
  onOpenLetter,
  readOnly,
}: {
  event: AgentEvent;
  last: boolean;
  density: "dense" | "comfortable";
  onDecision?: AgentTimelineProps["onDecision"];
  onOpenLetter?: AgentTimelineProps["onOpenLetter"];
  readOnly: boolean;
}) {
  const meta = agentMeta(event.agent);
  const dense = density === "dense";
  const program = dataField(event, "program");
  const decidedBy = dataField(event, "decidedBy");
  const decidedVia = dataField(event, "decidedVia");
  const hasLetter =
    dataField(event, "action") === "submit_pa" && event.status !== "running" && event.status !== "blocked";

  return (
    <motion.li
      id={`step-${event.id}`}
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
          <LocalTime iso={event.created_at} className="ml-auto" />
        </div>

        <p className={cn("mt-0.5 font-medium text-foreground", dense ? "text-sm" : "text-base")}>{event.title}</p>
        {event.detail && (
          <p className={cn("mt-0.5 text-muted-foreground", dense ? "text-sm" : "text-[0.95rem]")}>{event.detail}</p>
        )}

        {(isRouterProgram(program) || (event.status !== "running" && event.status !== "done")) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {event.status !== "running" && event.status !== "done" && <StatusPill status={event.status} />}
            {isRouterProgram(program) && (
              <span
                data-program={program}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
                  TONE_CLASSES[PROGRAM[program].tone]
                )}
              >
                {PROGRAM[program].label}
              </span>
            )}
            {decidedBy && (event.status === "approved" || event.status === "rejected") && (
              <span className="text-xs text-muted-foreground">
                by {decidedBy}
                {decidedVia === "voice" ? " · by voice" : ""}
              </span>
            )}
          </div>
        )}

        {hasLetter && onOpenLetter && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => onOpenLetter(event)}
            data-testid="open-letter"
          >
            <FileText aria-hidden /> Open letter
          </Button>
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
            <Button size="sm" onClick={() => onDecision(event, "approve")} data-testid="approve">
              <Check aria-hidden />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecision(event, "reject")} data-testid="reject">
              <X aria-hidden /> Reject
            </Button>
            <span className="text-xs text-muted-foreground">or say &ldquo;approve&rdquo;</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
