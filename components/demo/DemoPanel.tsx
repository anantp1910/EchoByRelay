"use client";

import {
  CalendarClock,
  CircleCheck,
  CircleX,
  FastForward,
  PackageX,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { FixtureBadge, RelayMark, ThemeToggle } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import type { DemoAction } from "@/lib/api/contracts";

// Order matches the demo script. Wired to POST /api/demo in Phase 7.
const ACTIONS: { action: DemoAction; label: string; hint: string; icon: LucideIcon; day?: number; tone?: "danger" }[] = [
  { action: "reset", label: "Reset demo", hint: "Clear live rows, clock to day 0", icon: RotateCcw },
  { action: "advance", label: "Day +1", hint: "Advance the demo clock", icon: FastForward },
  { action: "jump", label: "Jump to day 24", hint: "Bridge ends in 6 days", icon: CalendarClock, day: 24 },
  { action: "deny_pa", label: "Deny PA", hint: "Payer denies Maria's PA", icon: CircleX, tone: "danger" },
  { action: "approve_pa", label: "Approve PA", hint: "Payer approves the PA", icon: CircleCheck },
  { action: "no_pickup", label: "Simulate no pickup", hint: "Order not delivered on time", icon: PackageX },
];

/** Hidden control panel used during judging. Not linked from any nav. */
export function DemoPanel() {
  const day = 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <RelayMark />
          <span className="text-sm font-medium text-muted-foreground">Demo control</span>
          <FixtureBadge />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">Demo clock</p>
            <p className="mt-1 font-mono text-5xl font-bold whitespace-nowrap tabular" aria-live="polite">
              Day {day}
            </p>
          </div>
          <p className="text-sm text-muted-foreground sm:max-w-[22ch] sm:text-right">
            Simulated time. All watchdog rules read this clock.
          </p>
        </section>

        <section aria-label="Demo actions" className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map(({ action, label, hint, icon: Icon, tone }) => (
            <Button
              key={action}
              variant={tone === "danger" ? "destructive" : "outline"}
              className="h-auto justify-start gap-3 px-4 py-3 text-left whitespace-normal"
              disabled
              data-testid={`demo-${action}`}
            >
              <Icon aria-hidden className="size-5!" />
              <span className="flex flex-col">
                <span className="text-base font-bold">{label}</span>
                <span className="text-sm font-normal text-muted-foreground">{hint}</span>
              </span>
            </Button>
          ))}
        </section>

        <p className="text-sm text-muted-foreground">
          Buttons are wired to the demo API in Phase 7. Portals:{" "}
          <Link className="text-primary underline underline-offset-4" href="/doctor">
            doctor
          </Link>
          ,{" "}
          <Link className="text-primary underline underline-offset-4" href="/pharma">
            pharma
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
