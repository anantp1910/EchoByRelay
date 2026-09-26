"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, LoaderCircle, Sparkles } from "lucide-react";

import type { CheckInView } from "@/components/checkins/types";
import { isRouterProgram, PROGRAM } from "@/components/labels";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import type { AgentEvent } from "@/lib/db/types";

// Staff minutes a human would otherwise spend, per item. Placeholders: change
// them here and the total + small print follow.
export const MINUTES_SAVED = {
  paDraft: 45, // writing a prior authorization letter
  enrollment: 15, // enrolling the patient in a manufacturer program
  patientCall: 10, // one call per person notified
} as const;

// Check-ins are listed but kept out of the total while they are sample data.
const COUNT_CHECKINS = false;

type Item = {
  key: string;
  label: string;
  note?: string;
  badge?: string;
  pending?: boolean;
  minutes: number;
};

const obj = (e: AgentEvent) =>
  e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {};
const last = (events: AgentEvent[], pred: (e: AgentEvent) => boolean) => events.findLast(pred);
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Builds the list from real agent_events (plus check-ins), in a fixed order. */
function itemsFrom(events: AgentEvent[], checkIns: CheckInView[], recipients: string[]): Item[] {
  const items: Item[] = [];

  const coverage = last(events, (e) => e.agent === "coverage");
  if (coverage) {
    items.push(
      coverage.status === "done"
        ? { key: "coverage", label: "Checked coverage", note: coverage.title, badge: coverage.simulated ? "Simulated" : undefined, minutes: 0 }
        : { key: "coverage", label: "Checking coverage", pending: coverage.status === "running", minutes: 0 }
    );
  }

  const enrolled = last(events, (e) => e.agent === "medvantx" && e.status === "done" && isRouterProgram(obj(e).program));
  if (enrolled) {
    const program = obj(enrolled).program as keyof typeof PROGRAM;
    items.push({
      key: "enroll",
      label: `Enrolled in ${PROGRAM[program].label}`,
      badge: enrolled.simulated ? "Simulated" : undefined,
      minutes: MINUTES_SAVED.enrollment,
    });
  }

  const pa = last(events, (e) => e.agent === "paDrafter" && obj(e).action === "submit_pa");
  const paRunning = !pa && last(events, (e) => e.agent === "paDrafter" && e.status === "running");
  if (pa && pa.status !== "blocked") {
    const n = /(\d+)\s+citation/.exec(pa.detail ?? "")?.[1];
    items.push({
      key: "pa",
      label: n ? `Drafted a PA with ${n} FDA citation${n === "1" ? "" : "s"}` : "Drafted a PA from the FDA label",
      note: pa.status === "needs_approval" ? "Waiting on your approval" : undefined,
      minutes: MINUTES_SAVED.paDraft,
    });
  } else if (paRunning) {
    items.push({ key: "pa", label: "Drafting the PA", pending: true, minutes: 0 });
  }

  const submitted = last(events, (e) => e.agent === "payer" && e.status === "done" && /submitted/i.test(e.title));
  if (submitted) items.push({ key: "submit", label: "Submitted the PA to the insurer", badge: "Simulated", minutes: 0 });

  // Each patientComms step sends one update per person ("Sent 2 updates").
  const comms = events.filter((e) => e.agent === "patientComms" && e.status === "done");
  if (comms.length > 0) {
    const sent = comms.reduce((n, e) => n + Number(/Sent (\d+)/.exec(e.title)?.[1] ?? 1), 0);
    items.push({
      key: "notify",
      label: `Notified ${joinNames(recipients) || "the patient"}`,
      note: `${sent} update${sent === 1 ? "" : "s"} in their own language`,
      minutes: sent * MINUTES_SAVED.patientCall,
    });
  }

  const paid = last(events, (e) => e.agent === "checkout" && e.status === "done" && typeof obj(e).visaRef === "string");
  if (paid) items.push({ key: "paid", label: "Collected payment by Visa", note: paid.title, badge: "Simulated", minutes: 0 });

  if (checkIns.length > 0) {
    items.push({
      key: "checkins",
      label: `Collected ${checkIns.length} check-in${checkIns.length === 1 ? "" : "s"}`,
      badge: checkIns.some((c) => c.source === "sample") ? "Sample data" : undefined,
      minutes: COUNT_CHECKINS ? checkIns.length * MINUTES_SAVED.patientCall : 0,
    });
  }

  return items;
}

/**
 * "Relay did this for Maria": what Relay actually did from one sentence, built
 * live from the same agent_events the timeline shows. Hidden until intake runs.
 */
export function RelaySummary({
  events,
  checkIns,
  patientFirstName,
  recipients,
}: {
  events: AgentEvent[];
  checkIns: CheckInView[];
  patientFirstName: string;
  /** First names of everyone patientComms writes to (patient + care circle). */
  recipients: string[];
}) {
  const intake = last(events, (e) => e.agent === "intake");
  if (!intake) return null;

  const items = itemsFrom(events, checkIns, recipients);
  const minutes = items.reduce((n, i) => n + i.minutes, 0);

  return (
    <section
      aria-labelledby="relay-summary-title"
      className="mb-5 rounded-xl border border-primary/30 bg-accent/60 p-4"
      data-testid="relay-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 id="relay-summary-title" className="flex items-center gap-2 text-base font-bold">
            <Sparkles aria-hidden className="size-4 text-primary" /> Relay did this for {patientFirstName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {intake.status === "done" ? "From 1 sentence, Relay:" : "Listening to the prescription…"}
          </p>
        </div>
        {minutes > 0 && (
          <p className="text-right" data-testid="time-saved" data-minutes={minutes}>
            <span className="flex items-center justify-end gap-1.5 font-heading text-2xl font-bold tabular">
              <Clock aria-hidden className="size-5 text-primary" />~{minutes} min
            </span>
            <span className="text-xs text-muted-foreground">Est. staff time saved</span>
          </p>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.key}
              layout="position"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
              data-item={item.key}
              data-pending={item.pending ?? false}
            >
              <span
                className={
                  item.pending
                    ? "grid size-5 shrink-0 place-items-center rounded-full bg-pending-soft text-pending-strong"
                    : "grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white dark:text-[#062326]"
                }
              >
                {item.pending ? (
                  <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check aria-hidden className="size-3.5" />
                )}
              </span>
              <span className={item.pending ? "text-muted-foreground" : "font-medium"}>{item.label}</span>
              {item.note && <span className="text-muted-foreground">· {item.note}</span>}
              {item.badge && <SimulatedBadge label={item.badge} />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {minutes > 0 && (
        <p className="mt-3 border-t border-primary/20 pt-2 text-xs text-muted-foreground" data-testid="time-saved-assumptions">
          Estimate assumes PA letter {MINUTES_SAVED.paDraft} min · program enrollment {MINUTES_SAVED.enrollment} min ·{" "}
          {MINUTES_SAVED.patientCall} min per patient or family call.
          {!COUNT_CHECKINS && " Check-ins aren't counted until they're real data."}
        </p>
      )}
    </section>
  );
}
