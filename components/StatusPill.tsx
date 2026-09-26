import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

import type { AgentEventStatus, PrescriptionStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/** The four status colors used everywhere (CLAUDE.md UI rules). */
export type Tone = "ok" | "risk" | "blocked" | "pending";

export type PillStatus = PrescriptionStatus | AgentEventStatus;

// Record<> over the full union: adding a status to lib/db/types.ts without
// mapping it here is a compile error. "blocked" appears in both unions with
// the same meaning, so it has one entry.
const STATUS: Record<PillStatus, { tone: Tone; label: string }> = {
  // prescriptions.status
  new: { tone: "pending", label: "New" },
  routing: { tone: "pending", label: "Routing" },
  bridge: { tone: "ok", label: "On bridge supply" },
  pa_pending: { tone: "pending", label: "PA pending" },
  on_therapy: { tone: "ok", label: "On therapy" },
  at_risk: { tone: "risk", label: "At risk" },
  abandoned: { tone: "blocked", label: "Abandoned" },
  // agent_events.status
  running: { tone: "pending", label: "Running" },
  done: { tone: "ok", label: "Done" },
  blocked: { tone: "blocked", label: "Blocked" },
  needs_approval: { tone: "pending", label: "Needs approval" }, // amber is only for at-risk patients
  approved: { tone: "ok", label: "Approved" },
  rejected: { tone: "blocked", label: "Rejected" },
};

export const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok-strong border-ok/30",
  risk: "bg-risk-soft text-risk-strong border-risk/30",
  blocked: "bg-block-soft text-block-strong border-block/30",
  pending: "bg-pending-soft text-pending-strong border-pending/30",
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CircleCheck,
  risk: CircleAlert,
  blocked: CircleX,
  pending: CircleDashed,
};

export function toneFor(status: PillStatus): Tone {
  return STATUS[status].tone;
}

export function labelFor(status: PillStatus): string {
  return STATUS[status].label;
}

interface StatusPillProps {
  status: PillStatus;
  /** Override the default label (e.g. localized patient copy). */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Colored status chip. Always icon + text, so color is never the only signal. */
export function StatusPill({ status, label, size = "sm", className }: StatusPillProps) {
  const { tone, label: defaultLabel } = STATUS[status];
  // needs_approval shares blue with other pending states; its own icon keeps it distinct.
  const Icon = status === "running" ? LoaderCircle : status === "needs_approval" ? CircleAlert : TONE_ICON[tone];
  return (
    <span
      data-status={status}
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium",
        size === "sm" && "h-6 px-2 text-xs",
        size === "md" && "h-7 px-2.5 text-sm",
        size === "lg" && "h-9 px-3.5 text-base",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          size === "lg" ? "size-4.5" : "size-3.5",
          status === "running" && "animate-spin motion-reduce:animate-none"
        )}
      />
      {label ?? defaultLabel}
    </span>
  );
}
