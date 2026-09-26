"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useId, useRef } from "react";

import { ThemeToggle } from "@/components/AppHeader";
import { BRAND } from "@/components/brand";

import { Drop, DROP_PATH } from "./Drop";

// Hero: a giant condensed wordmark with the Echo drop resting over it. Where
// the drop covers the letters they continue as hairline outlines, clipped to
// the drop's exact shape. Four small labels frame the word.

// Two compositions: one line on wide screens, stacked "EC / HO" on phones
// (as the reference stacks its wordmark). Drop sizes are in wordmark units.
type Comp = { box: string; lines: { text: string; y: number }[]; drop: { x: number; y: number; w: number } };
const WORD = BRAND.name.toUpperCase();
const HALF = Math.ceil(WORD.length / 2);
const WIDE: Comp = { box: "0 -40 1000 440", lines: [{ text: WORD, y: 345 }], drop: { x: 330, y: -150, w: 460 } };
const TALL: Comp = {
  box: "0 -40 1000 880",
  lines: [
    { text: WORD.slice(0, HALF), y: 380 },
    { text: WORD.slice(HALF), y: 790 },
  ],
  drop: { x: 170, y: -60, w: 760 },
};

function Wordmark({ comp, className }: { comp: Comp; className?: string }) {
  const clipId = `hero-clip-${useId().replace(/:/g, "")}`;
  const s = comp.drop.w / 480;
  const t = `translate(${comp.drop.x + 40 * s} ${comp.drop.y + 40 * s}) scale(${s})`;
  const text = (props: React.SVGProps<SVGTextElement>) =>
    comp.lines.map((l) => (
      <text key={l.text} x="0" y={l.y} fontSize="470" textLength="1000" lengthAdjust="spacingAndGlyphs" className="font-wordmark" {...props}>
        {l.text}
      </text>
    ));
  return (
    <svg viewBox={comp.box} className={`w-full overflow-visible text-[var(--wordmark)] ${className ?? ""}`} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d={DROP_PATH} transform={t} />
        </clipPath>
      </defs>
      {text({ fill: "currentColor" })}
      <motion.g
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${comp.drop.x + comp.drop.w / 2}px ${comp.drop.y + comp.drop.w / 2}px` }}
      >
        <Drop place={{ x: comp.drop.x, y: comp.drop.y, width: comp.drop.w, height: s * 500 }} ripples tint />
        {/* The letters continue as hairlines across the drop. */}
        {text({ fill: "none", stroke: "currentColor", strokeWidth: 1.4, clipPath: `url(#${clipId})` })}
      </motion.g>
    </svg>
  );
}

const linkCls =
  "inline-flex min-h-11 items-center rounded-md text-[0.95rem] text-foreground/80 transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

export function WordmarkHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Leave gently: the composition drifts up and fades as the page scrolls on.
  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} id="top" aria-labelledby="hero-title" className="relative flex min-h-svh flex-col px-5 pt-5 pb-8 sm:px-10 lg:px-[6.25rem] lg:pt-8">
      {/* Top labels: sections, sign in, theme. */}
      <nav aria-label="Primary" className="relative z-20 flex items-center justify-between gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <a href="#story" className={linkCls}>
          The story
        </a>
        <a href="#people" className={`${linkCls} justify-self-center max-sm:hidden`}>
          The people
        </a>
        <div className="flex items-center justify-self-end gap-2">
          <Link
            href="/signin"
            data-testid="nav-signin"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-foreground/25 px-5 text-[0.95rem] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-muted active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            Sign in
          </Link>
          <ThemeToggle className="size-11 rounded-full" />
        </div>
      </nav>

      <motion.div style={{ y, opacity: fade }} className="relative flex flex-1 items-center py-6 lg:py-4">
        <Wordmark comp={WIDE} className="hidden sm:block" />
        <Wordmark comp={TALL} className="sm:hidden" />
      </motion.div>

      {/* Bottom labels carry the headline. */}
      <h1 id="hero-title" className="relative z-10 flex flex-col gap-1 text-[clamp(1rem,1.4vw,1.15rem)] leading-snug sm:flex-row sm:justify-between">
        <span>The doctor speaks once.</span>
        <span className="sm:text-right">{BRAND.name} carries it all the way home.</span>
      </h1>
    </section>
  );
}
