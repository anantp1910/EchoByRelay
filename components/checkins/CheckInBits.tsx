"use client";

import { CircleAlert, CircleX, ClipboardCheck } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { TONE_CLASSES } from "@/components/StatusPill";
import type { AgentEvent, Language } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { FLAG, summarize, UI } from "./questions";
import type { CheckInFlag, CheckInView } from "./types";

/** Flag chip: icon + text, never color alone. amber = risk, red = blocked. */
export function FlagPill({ flag, lang = "en", size = "sm" }: { flag: CheckInFlag; lang?: Language; size?: "sm" | "md" }) {
  const { tone, text } = FLAG[flag];
  const Icon = tone === "blocked" ? CircleX : CircleAlert;
  return (
    <span
      data-flag={flag}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm",
        TONE_CLASSES[tone]
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      {text[lang]}
    </span>
  );
}

export function FlagPills({ flags, lang, size }: { flags: CheckInFlag[]; lang?: Language; size?: "sm" | "md" }) {
  if (flags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <FlagPill key={f} flag={f} lang={lang} size={size} />
      ))}
    </span>
  );
}

/** Doctor patient header: last check-in day, who answered, flags. */
export function CheckInStrip({ latest, nameFor }: { latest: CheckInView | null; nameFor: (memberId: string | null) => string }) {
  if (!latest) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="checkin-strip">
        <ClipboardCheck aria-hidden className="size-4" /> No check-ins yet
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="checkin-strip">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <ClipboardCheck aria-hidden className="size-4 text-[var(--echo-accent)]" /> Check-in · Day {latest.day}
      </span>
      <span className="text-muted-foreground">by {nameFor(latest.submitted_by_member_id)}</span>
      <FlagPills flags={latest.flags} />
      {latest.source === "sample" && <SimulatedBadge label={UI.en.sample} />}
      {!latest.synced && <SimulatedBadge label={UI.en.notSynced} />}
    </div>
  );
}

/**
 * Check-ins as read-only timeline rows (agent "checkin"). They carry the
 * demo day instead of a wall-clock time, and "Sample data" while they come
 * from fixtures.
 */
export function checkInEvents(checkIns: CheckInView[], nameFor: (memberId: string | null) => string): AgentEvent[] {
  return [...checkIns]
    .sort((a, b) => a.day - b.day)
    .map((c) => ({
      id: `checkin-${c.id}`,
      rx_id: null,
      patient_id: c.patient_id,
      agent: "checkin",
      status: "done", // severity shows as a red flag pill, not a "Blocked" step
      title: `Answered by ${nameFor(c.submitted_by_member_id)}`, // header already reads "Check-in · Day N"
      detail: [summarize(c.answers, "en"), c.answers.voiceNote ? `Voice note: “${c.answers.voiceNote}”` : ""]
        .filter(Boolean)
        .join(" · "),
      simulated: false,
      data: {
        demoDay: c.day,
        flags: c.flags,
        badge: c.source === "sample" ? UI.en.sample : c.synced ? null : UI.en.notSynced,
      },
      is_seed: c.is_seed,
      created_at: c.created_at,
    }));
}
