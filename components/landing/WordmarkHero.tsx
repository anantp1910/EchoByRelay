"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";

import { ThemeToggle } from "@/components/AppHeader";
import { BRAND } from "@/components/brand";

import { usePillMode } from "./pill/mode";
import { StaticPill } from "./pill/TravelingPill";

// Hero: a giant condensed wordmark with the 3D Echo pill (TravelingPill)
// resting over it. Four small labels frame the word.

// Two compositions: one line on wide screens, stacked on phones (as the
// reference stacks its wordmark). The filled letters sit under the 3D pill;
// an identical hairline copy sits above it, so where the pill covers a
// letter only its outline shows.
type Comp = { box: string; lines: { text: string; y: number }[] };
const WORD = BRAND.name.toUpperCase();
const HALF = Math.ceil(WORD.length / 2);
const WIDE: Comp = { box: "0 -40 1000 440", lines: [{ text: WORD, y: 345 }] };
const TALL: Comp = {
  box: "0 -40 1000 880",
  lines: [
    { text: WORD.slice(0, HALF), y: 380 },
    { text: WORD.slice(HALF), y: 790 },
  ],
};

function Words({ comp, outline, className }: { comp: Comp; outline?: boolean; className?: string }) {
  return (
    <svg viewBox={comp.box} className={`w-full overflow-visible text-[var(--wordmark)] ${className ?? ""}`} aria-hidden>
      {comp.lines.map((l) => (
        <text
          key={l.text}
          x="0"
          y={l.y}
          fontSize="470"
          textLength="1000"
          lengthAdjust="spacingAndGlyphs"
          className="font-wordmark"
          fill={outline ? "none" : "currentColor"}
          stroke={outline ? "currentColor" : undefined}
          strokeWidth={outline ? 1.4 : undefined}
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}

const linkCls =
  "glow-text inline-flex min-h-11 items-center rounded-md text-[0.95rem] text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

export function WordmarkHero() {
  const ref = useRef<HTMLElement>(null);
  const mode = usePillMode();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Leave gently: the composition drifts up and fades as the page scrolls on.
  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} id="top" aria-labelledby="hero-title" className="relative flex min-h-svh flex-col px-5 pt-5 pb-8 sm:px-10 lg:px-[6.25rem] lg:pt-8">
      {/* Top labels: the only way in. Each opens sign-in with that role chosen. */}
      <nav aria-label="Sign in as" className="relative z-20 flex items-center justify-between gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <Link href="/signin?role=doctor" data-testid="nav-doctor" className={linkCls}>
          Doctor
        </Link>
        <Link href="/signin?role=patient" data-testid="nav-patient" className={`${linkCls} sm:justify-self-center`}>
          Patient
        </Link>
        <div className="flex items-center justify-self-end gap-2 sm:gap-4">
          <Link href="/signin?role=pharma" data-testid="nav-pharma" className={linkCls}>
            Pharma
          </Link>
          <ThemeToggle className="size-11 rounded-full" />
        </div>
      </nav>

      <div className="relative flex flex-1 items-center py-6 lg:py-4">
        <motion.div style={{ y, opacity: fade }} className="w-full">
          <Words comp={WIDE} className="hidden sm:block" />
          <Words comp={TALL} className="sm:hidden" />
        </motion.div>
        {mode === "static" && (
          <StaticPill className="pointer-events-none absolute top-1/2 left-[56%] z-30 w-[72%] -translate-x-1/2 -translate-y-1/2 sm:w-[36%]" />
        )}
        {/* Above the pill (z-40 > its z-30): the letters continue as hairlines. */}
        <motion.div style={{ y, opacity: fade }} className="pointer-events-none absolute inset-x-0 z-40 flex items-center py-6 lg:py-4">
          <Words comp={WIDE} outline className="hidden sm:block" />
          <Words comp={TALL} outline className="sm:hidden" />
        </motion.div>
      </div>

      {/* Bottom labels carry the headline. */}
      <h1 id="hero-title" className="relative z-10 flex flex-col gap-1 text-[clamp(1rem,1.4vw,1.15rem)] leading-snug sm:flex-row sm:justify-between">
        <span>The doctor speaks once.</span>
        <span className="sm:text-right">{BRAND.name} carries it all the way home.</span>
      </h1>
    </section>
  );
}
