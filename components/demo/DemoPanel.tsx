"use client";

import {
  CalendarClock,
  CircleCheck,
  CircleX,
  FastForward,
  LoaderCircle,
  PackageX,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FixtureBadge, RelayMark, ThemeToggle } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { demo } from "@/lib/api/client";
import type { DemoAction } from "@/lib/api/contracts";
import { supabase } from "@/lib/db/client";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

// Actions the demo API really implements today. deny_pa / approve_pa /
// no_pickup are stubs until A6 — add them here once they do real work.
const READY = new Set<DemoAction>(["reset", "advance", "jump"]);

const ACTIONS: {
  action: DemoAction;
  testId: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  day?: number;
  tone?: "danger";
}[] = [
  // Until A6, reset only moves the clock; npm run demo:reset clears the data.
  {
    action: "reset",
    testId: "demo-reset",
    label: "Reset clock",
    hint: "Clock to day 0 only. Run npm run demo:reset to clear data.",
    icon: RotateCcw,
  },
  { action: "advance", testId: "demo-advance", label: "Day +1", hint: "Advance the demo clock", icon: FastForward, day: 1 },
  { action: "jump", testId: "demo-jump-24", label: "Jump to day 24", hint: "Bridge ends in 6 days", icon: CalendarClock, day: 24 },
  { action: "deny_pa", testId: "demo-deny-pa", label: "Deny PA", hint: "Payer denies Maria's PA", icon: CircleX, tone: "danger" },
  { action: "approve_pa", testId: "demo-approve-pa", label: "Approve PA", hint: "Payer approves the PA", icon: CircleCheck },
  { action: "no_pickup", testId: "demo-no-pickup", label: "Simulate no pickup", hint: "Order not delivered on time", icon: PackageX },
];

/** Live demo_state.day via Realtime (null until loaded). */
function useDemoDay() {
  const [day, setDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    const channel = client
      .channel("demo_state:panel")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "demo_state", filter: "id=eq.1" }, (payload) =>
        setDay((payload.new as { day: number }).day)
      )
      .subscribe();
    client
      .from("demo_state")
      .select("day")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setDay((current) => current ?? (data as { day: number } | null)?.day ?? 0);
      });
    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, []);

  return { day, setDay, error };
}

/** Hidden control panel used during judging. Not linked from any nav. */
export function DemoPanel() {
  const { day, setDay, error } = useDemoDay();
  const [running, setRunning] = useState<DemoAction | null>(null);

  async function run(action: DemoAction, dayArg?: number) {
    setRunning(action);
    try {
      const res = await demo(action === "jump" || action === "advance" ? { action, day: dayArg } : { action });
      setDay(res.day); // Realtime confirms; this keeps the counter instant.
      toast.success(`Day ${res.day}`, { description: ACTIONS.find((a) => a.action === action)?.label });
    } catch (e) {
      toast.error("Demo action failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setRunning(null);
    }
  }

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
            <p
              className="mt-1 font-mono text-6xl font-bold whitespace-nowrap tabular sm:text-7xl"
              aria-live="polite"
              data-testid="demo-day"
              data-day={day ?? ""}
            >
              Day {day ?? "–"}
            </p>
            {error && (
              <p role="alert" className="mt-1 text-sm text-block-strong">
                Couldn&apos;t read the clock: {error}
              </p>
            )}
            {!supabase && day === null && (
              <p className="mt-1 text-sm text-muted-foreground">Offline fixtures: no Supabase keys, so the clock isn&apos;t live.</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground sm:max-w-[22ch] sm:text-right">
            Simulated time, live for everyone. All watchdog rules read this clock.
          </p>
        </section>

        <section aria-label="Demo actions" className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map(({ action, testId, label, hint, icon: Icon, tone, day: dayArg }) => {
            const ready = READY.has(action);
            const busy = running === action;
            return (
              <Button
                key={action}
                variant={tone === "danger" && ready ? "destructive" : "outline"}
                className={cn("h-auto min-h-16 justify-start gap-3 px-4 py-3 text-left whitespace-normal", !ready && "border-dashed")}
                disabled={!ready || running !== null}
                onClick={() => run(action, dayArg)}
                data-testid={testId}
                data-ready={ready}
              >
                {busy ? (
                  <LoaderCircle aria-hidden className="size-5! animate-spin motion-reduce:animate-none" />
                ) : (
                  <Icon aria-hidden className="size-5!" />
                )}
                <span className="flex flex-col">
                  <span className="text-base font-bold">{label}</span>
                  {/* Dark outline buttons tint the ground; muted ink drops to 4.25:1 there. */}
                  <span className="text-sm font-normal text-muted-foreground dark:text-foreground/85">
                    {ready ? hint : "Coming in A6"}
                  </span>
                </span>
              </Button>
            );
          })}
        </section>

        <nav aria-label="Portals" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Portals:</span>
          {[
            { href: "/doctor", label: "Doctor" },
            { href: `/patient/${MARIA_ID}`, label: "Patient" },
            { href: "/pharma", label: "Pharma" },
          ].map((l) => (
            <Button key={l.href} variant="outline" size="sm" nativeButton={false} render={<Link href={l.href} />}>
              {l.label}
            </Button>
          ))}
        </nav>
      </main>
    </div>
  );
}
