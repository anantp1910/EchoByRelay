"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";

import { GlowPath, PathNode } from "@/components/path/RelayPath";
import { useMounted } from "@/components/useMounted";
import { cn } from "@/lib/utils";

import { prescriberShortName } from "./prescriber";

const doctor = prescriberShortName();

const STEPS: { label: string; line: string }[] = [
  { label: "Prescribed", line: `${doctor} says one sentence. Relay hears a prescription for Maria.` },
  { label: "$480 copay", line: "Coverage comes back: prior authorization required, $480 a month. This is where scripts die." },
  { label: "Bridge", line: "Relay routes Maria to a free Medvantx Bridge supply and drafts the PA from the FDA label." },
  { label: "PA denied", line: "Day 24. The insurer says no, and the bridge ends in six days. Relay sees the cliff first." },
  { label: "Cash Pay", line: "Relay re-routes to Medvantx Cash Pay. Her daughter Ana approves it from her phone." },
  { label: "Delivered", line: "The medicine arrives. The script is rescued." },
];
const CLOSING = "Relay doesn't take notes. It gets the medicine to the patient.";
const LAST = STEPS.length - 1;

// Horizontal wave (desktop) and vertical wave (phone) through the six nodes.
const H = STEPS.map((_, i) => ({ x: 100 + i * 200, y: i % 2 ? 190 : 110 }));
const V = STEPS.map((_, i) => ({ x: i % 2 ? 78 : 42, y: 60 + i * 176 }));
const H_D = H.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `C ${H[i - 1].x + 100} ${H[i - 1].y}, ${p.x - 100} ${p.y}, ${p.x} ${p.y}`)).join(" ");
const V_D = V.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `C ${V[i - 1].x} ${V[i - 1].y + 88}, ${p.x} ${p.y - 88}, ${p.x} ${p.y}`)).join(" ");

const stateOf = (i: number, active: number) => (i < active ? "done" : i === active ? "active" : "upcoming");

/** Scroll story: the route becomes Maria's journey, one node per screen of scroll. */
export function Journey() {
  // Gate on mount: the media query isn't known during SSR/hydration.
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  if (reduce) return <StaticJourney />;
  return <ScrollJourney />;
}

function ScrollJourney() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const route = useTransform(scrollYProgress, [0.04, 0.82], [0, 1], { clamp: true });
  const [active, setActive] = useState(0);
  const [closing, setClosing] = useState(false);

  useMotionValueEvent(route, "change", (v) => {
    const next = Math.min(LAST, Math.floor(v * LAST + 0.02));
    setActive((a) => (a === next ? a : next));
  });
  useMotionValueEvent(scrollYProgress, "change", (v) => setClosing((c) => (c === v > 0.88 ? c : v > 0.88)));

  return (
    <section ref={ref} id="journey" aria-labelledby="journey-title" className="relative h-[560svh] scroll-mt-0">
      <SrSteps />
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden" aria-hidden>
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <p className="font-mono text-xs tracking-[0.2em] text-ice-strong uppercase">The Maria journey</p>

          {/* Desktop: horizontal path with labels under the nodes. */}
          <div className="relative mt-8 hidden md:block">
            <svg viewBox="0 0 1200 300" className="w-full">
              <path d={H_D} fill="none" stroke="var(--color-line)" strokeWidth={2} />
              <GlowPath d={H_D} progress={route} width={3} />
              {H.map((p, i) => (
                <PathNode key={i} cx={p.x} cy={p.y} state={stateOf(i, active)} r={9} />
              ))}
            </svg>
            {H.map((p, i) => (
              <span
                key={i}
                className={cn(
                  "absolute -translate-x-1/2 font-mono text-xs tracking-[0.16em] whitespace-nowrap uppercase transition-colors duration-200",
                  i <= active ? "text-foreground" : "text-muted-foreground"
                )}
                style={{ left: `${(p.x / 1200) * 100}%`, top: `${((p.y + 34) / 300) * 100}%` }}
              >
                {STEPS[i].label}
              </span>
            ))}
          </div>

          <div className="mt-10 grid gap-6 md:mt-16 md:grid-cols-[auto_1fr]">
            {/* Phone: vertical path. */}
            <div className="relative h-[52svh] w-28 md:hidden">
              <svg viewBox="0 0 120 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-10">
                <path d={V_D} fill="none" stroke="var(--color-line)" strokeWidth={2} />
                <GlowPath d={V_D} progress={route} width={3} />
              </svg>
              {V.map((p, i) => (
                <span
                  key={i}
                  className={cn(
                    "absolute -translate-y-1/2 font-mono text-[0.68rem] tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-200",
                    i <= active ? "text-foreground" : "text-muted-foreground"
                  )}
                  style={{ top: `${(p.y / 1000) * 100}%`, left: `${(p.x / 120) * 40 - 4}px` }}
                >
                  <span className={cn("mr-1.5 inline-block size-2 rounded-full", i <= active ? "relay-glow bg-glow" : "border border-muted-foreground")} />
                  {STEPS[i].label}
                </span>
              ))}
            </div>

            <div className="min-h-[9rem] md:col-span-2 md:min-h-[12rem]">
              <AnimatePresence mode="wait">
                <motion.p
                  key={closing ? "closing" : active}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className={cn(
                    "max-w-4xl font-heading leading-[1.08] font-bold tracking-tight text-balance",
                    closing ? "text-[clamp(2rem,5vw,4.5rem)]" : "text-[clamp(1.6rem,3.6vw,3.25rem)]"
                  )}
                >
                  {closing ? CLOSING : STEPS[active].line}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Reduced motion: the whole journey at once, no sticky scroll, no drawing. */
function StaticJourney() {
  return (
    <section id="journey" aria-labelledby="journey-title" className="mx-auto max-w-4xl px-5 py-24 lg:px-8">
      <p className="font-mono text-xs tracking-[0.2em] text-ice-strong uppercase">The Maria journey</p>
      <h2 id="journey-title" className="sr-only">
        The Maria journey
      </h2>
      <ol className="mt-8 flex flex-col gap-8 border-l-2 border-glow pl-6">
        {STEPS.map((s) => (
          <li key={s.label}>
            <p className="font-mono text-xs tracking-[0.16em] text-ice-strong uppercase">{s.label}</p>
            <p className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{s.line}</p>
          </li>
        ))}
      </ol>
      <p className="mt-16 font-heading text-[clamp(2rem,5vw,4rem)] leading-tight font-bold text-balance">{CLOSING}</p>
    </section>
  );
}

function SrSteps() {
  return (
    <div className="sr-only">
      <h2 id="journey-title">The Maria journey</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s.label}>
            {s.label}: {s.line}
          </li>
        ))}
      </ol>
      <p>{CLOSING}</p>
    </div>
  );
}
