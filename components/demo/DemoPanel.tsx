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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FixtureBadge, RelayMark, ThemeToggle } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { demo } from "@/lib/api/client";
import type { DemoAction } from "@/lib/api/contracts";
import { supabase } from "@/lib/db/client";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

type PanelAction = {
  action: DemoAction;
  testId: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  day?: number;
  tone?: "danger";
};

const ACTIONS: PanelAction[] = [
  // reset calls reset_demo(): clears all non-seed demo data and sets day 0.
  {
    action: "reset",
    testId: "demo-reset",
    label: "Reset demo",
    hint: "Clears demo data and sets the clock to day 0.",
    icon: RotateCcw,
  },
  { action: "advance", testId: "demo-advance", label: "Day +1", hint: "Advance the demo clock", icon: FastForward, day: 1 },
  { action: "jump", testId: "demo-jump-24", label: "Jump to day 24", hint: "Bridge ends in 6 days", icon: CalendarClock, day: 24 },
];

const INSURER_ACTIONS: PanelAction[] = [
  { action: "deny_pa", testId: "demo-deny-pa", label: "Deny PA", hint: "Payer denies Maria's PA", icon: CircleX, tone: "danger" },
  { action: "approve_pa", testId: "demo-approve-pa", label: "Approve PA", hint: "Payer approves the PA", icon: CircleCheck },
  { action: "no_pickup", testId: "demo-no-pickup", label: "Simulate no pickup", hint: "Order not delivered on time", icon: PackageX },
];

// The stage run, in order. Scene 4 needs the day-24 state (bridge cliff) first.
const SCENES: { n: number; mark: string; action: DemoAction; day?: number; label: string; hint: string; minDay?: number }[] = [
  { n: 1, mark: "①", action: "reset", label: "Reset", hint: "Clear demo data, day 0" },
  { n: 2, mark: "②", action: "jump", day: 2, label: "Bridge delivered", hint: "Day 2: free supply arrives" },
  { n: 3, mark: "③", action: "jump", day: 24, label: "Day 24", hint: "Bridge ends in 6 days" },
  { n: 4, mark: "④", action: "deny_pa", label: "Insurer denies", hint: "PA denied, Cash Pay offered", minDay: 24 },
  { n: 5, mark: "⑤", action: "jump", day: 26, label: "Delivered", hint: "Day 26: Cash Pay arrives" },
];

/**
 * Next scene to play, from the live day and Maria's PA state. Before her PA is
 * submitted the story is on the Doctor screen, so no scene is highlighted.
 */
function nextScene(day: number | null, { submitted, denied }: PaState): number | null {
  if (day === null || !submitted) return null;
  if (day >= 26) return 1; // story finished; reset for the next run
  if (day >= 24) return denied ? 5 : 4;
  if (day >= 2) return 3;
  return 2;
}

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

type PaState = { submitted: boolean; denied: boolean };

/** Maria's newest demo prescription: PA submitted yet? denied? (live via Realtime). */
function usePaState(): PaState {
  const [state, setState] = useState<PaState>({ submitted: false, denied: false });

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    async function load() {
      const { data: rx } = await client
        .from("prescriptions")
        .select("id")
        .eq("patient_id", MARIA_ID)
        .eq("is_seed", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rxId = (rx as { id: string } | null)?.id;
      if (!rxId) {
        if (!cancelled) setState({ submitted: false, denied: false });
        return;
      }
      const { data: pas } = await client.from("pa_requests").select("status").eq("rx_id", rxId);
      const statuses = ((pas ?? []) as { status: string }[]).map((p) => p.status);
      if (!cancelled) {
        setState({
          submitted: statuses.some((st) => st === "submitted" || st === "approved" || st === "denied"),
          denied: statuses.includes("denied"),
        });
      }
    }
    const channel = client
      .channel("demo_state:panel-pa")
      .on("postgres_changes", { event: "*", schema: "public", table: "pa_requests" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, () => void load())
      .subscribe();
    void load();
    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, []);

  return state;
}

/** Hidden control panel used during judging. Not linked from any nav. */
export function DemoPanel() {
  const { day, setDay, error } = useDemoDay();
  const pa = usePaState();
  const next = nextScene(day, pa);
  // Key of the control that is running (e.g. "jump:24", "scene:3"), for its spinner.
  const [running, setRunning] = useState<string | null>(null);
  // Reset wipes shared demo data: the first click arms it for 3 s, the second runs it.
  const [armed, setArmed] = useState<string | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (disarm.current) clearTimeout(disarm.current);
  }, []);

  async function run(key: string, label: string, action: DemoAction, dayArg?: number) {
    if (action === "reset" && armed !== key) {
      setArmed(key);
      if (disarm.current) clearTimeout(disarm.current);
      disarm.current = setTimeout(() => setArmed(null), 3000);
      return;
    }
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(null);
    setRunning(key);
    try {
      const res = await demo(action === "jump" || action === "advance" ? { action, day: dayArg } : { action });
      setDay(res.day); // Realtime confirms; this keeps the counter instant.
      toast.success(`Day ${res.day}`, { description: label });
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setRunning(null);
    }
  }

  function actionButton({ action, testId, label, hint, icon: Icon, tone, day: dayArg }: PanelAction) {
    const key = `${action}:${dayArg ?? ""}`;
    const isArmed = armed === key;
    return (
      <Button
        key={testId}
        variant={tone === "danger" || isArmed ? "destructive" : "outline"}
        className="h-auto min-h-16 justify-start gap-3 px-4 py-3 text-left whitespace-normal"
        disabled={running !== null}
        onClick={() => run(key, label, action, dayArg)}
        data-testid={testId}
        data-armed={isArmed}
      >
        {running === key ? (
          <LoaderCircle aria-hidden className="size-5! animate-spin motion-reduce:animate-none" />
        ) : (
          <Icon aria-hidden className="size-5!" />
        )}
        <span className="flex flex-col">
          <span className="text-base font-bold">{isArmed ? "Click again to wipe demo data" : label}</span>
          {/* Dark outline buttons tint the ground; muted ink drops to 4.25:1 there. */}
          <span className={cn("text-sm font-normal", tone === "danger" || isArmed ? "opacity-90" : "text-muted-foreground dark:text-foreground/85")}>
            {isArmed ? "Resets in one click · cancels in 3 s" : hint}
          </span>
        </span>
      </Button>
    );
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

        <section aria-labelledby="stage-scenes" className="flex flex-col gap-3">
          <h2 id="stage-scenes" className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Stage scenes
          </h2>
          {day !== null && !pa.submitted && (
            <p className="rounded-lg border border-pending/40 bg-pending-soft px-3 py-2 text-sm font-medium text-pending-strong" data-testid="demo-next-doctor">
              Next: on the Doctor screen — send the sentence, approve Bridge, approve the PA
            </p>
          )}
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SCENES.map((s) => {
              const key = `scene:${s.n}`;
              const isNext = next === s.n;
              const isArmed = armed === key;
              const locked = s.minDay !== undefined && (day === null || day < s.minDay);
              return (
                <li key={s.n} className="contents">
                  <Button
                    variant={isArmed ? "destructive" : isNext ? "default" : "outline"}
                    className={cn(
                      "h-auto min-h-20 flex-col items-start gap-1 px-3 py-3 text-left whitespace-normal",
                      isNext && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    )}
                    disabled={running !== null || locked}
                    aria-current={isNext ? "step" : undefined}
                    onClick={() => run(key, `${s.mark} ${s.label}`, s.action, s.day)}
                    data-testid={`demo-scene-${s.n}`}
                    data-next={isNext}
                    data-armed={isArmed}
                  >
                    <span className="flex items-center gap-2 text-base font-bold">
                      {running === key ? (
                        <LoaderCircle aria-hidden className="size-4! animate-spin motion-reduce:animate-none" />
                      ) : (
                        <span aria-hidden>{s.mark}</span>
                      )}
                      <span>{isArmed ? "Click again to wipe demo data" : s.label}</span>
                    </span>
                    <span className={cn("text-xs font-normal", isNext || isArmed ? "opacity-90" : "text-muted-foreground dark:text-foreground/85")}>
                      {isArmed ? "Cancels in 3 s" : locked ? `Available from day ${s.minDay}` : s.hint}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-label="Demo clock controls" className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map(actionButton)}
        </section>

        <section aria-labelledby="insurer-decision" className="flex flex-col gap-3">
          <h2 id="insurer-decision" className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Insurer decision
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">{INSURER_ACTIONS.map(actionButton)}</div>
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
