"use client";

import { motion, useScroll } from "framer-motion";
import { useRef } from "react";

import { DEMO_PHRASE } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { Reveal } from "./motion";
import { prescriberShortName } from "./prescriber";

const doctor = prescriberShortName();

// The Maria journey as numbered chapters. Synthetic story; no clinical claims.
const CHAPTERS = [
  {
    meta: "Day 0 · Prescribed",
    title: `${doctor} says one sentence.`,
    body: `“${DEMO_PHRASE}.” Relay hears a prescription and starts moving it before Maria leaves the room.`,
  },
  {
    meta: "Day 0 · $480 copay",
    title: "Prior authorization, $480 a month.",
    body: "This is where new prescriptions quietly die. Relay checks coverage before anyone has to pick up a phone.",
  },
  {
    meta: "Day 0 · Bridge",
    title: "A free bridge supply ships today.",
    body: "Relay routes Maria to Medvantx Bridge and drafts the prior authorization from the FDA label, every claim cited.",
  },
  {
    meta: "Day 24 · PA denied",
    title: "The insurer says no. The bridge ends in six days.",
    body: "Relay's watchdog sees the cliff before the pharmacy counter does, and brings the doctor a new path.",
  },
  {
    meta: "Day 24 · Cash Pay",
    title: "Ana approves it from her phone.",
    body: "Relay re-routes to Medvantx Cash Pay. Maria's daughter pays under a spending cap she sets, with a passkey.",
  },
  {
    meta: "Day 26 · Delivered",
    title: "The medicine arrives.",
    body: "The script is rescued, and Relay keeps checking in with Maria in Spanish.",
  },
];

const num = (i: number) => String(i + 1).padStart(2, "0");

function Chapter({ i, card = false }: { i: number; card?: boolean }) {
  const c = CHAPTERS[i];
  return (
    <div
      className={cn(
        "relative grid gap-x-10 gap-y-4 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]",
        card
          ? "rounded-[1.5rem] border border-line bg-card/75 p-6 shadow-[0_30px_80px_-40px_rgba(14,40,43,0.35)] backdrop-blur-xl sm:p-10"
          : "border-t border-line py-14 md:py-20"
      )}
    >
      <Reveal>
        <p className="text-[clamp(3rem,5vw,4.5rem)] leading-none font-normal tracking-[-0.04em] tabular">{num(i)}</p>
      </Reveal>
      <Reveal delay={0.06}>
        <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">{c.meta}</p>
        <h3 className="mt-3 text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">{c.title}</h3>
      </Reveal>
      <Reveal delay={0.12}>
        <p className="text-lg leading-relaxed text-muted-foreground md:pt-8">{c.body}</p>
      </Reveal>
    </div>
  );
}

/** The Maria journey: chapter 01 overlaps the hero's fold, 02–06 follow with a scroll-drawn path. */
export function Chapters() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });

  return (
    <section id="journey" aria-labelledby="journey-title" className="relative z-10 scroll-mt-8">
      <h2 id="journey-title" className="sr-only">
        The Maria journey
      </h2>
      <Chapter i={0} card />

      <div ref={ref} className="relative mt-24 md:pl-0">
        {/* The path: a hairline that draws down the chapters in the strand's gradient. */}
        <div aria-hidden className="absolute top-0 bottom-0 left-[-1.5rem] hidden w-px bg-line lg:block" />
        <motion.div
          aria-hidden
          style={{ scaleY: scrollYProgress }}
          className="relay-glow absolute top-0 bottom-0 left-[-1.5rem] hidden w-px origin-top bg-gradient-to-b from-[rgb(46,42,122)] via-glow to-[rgb(169,227,238)] lg:block"
        />
        {CHAPTERS.slice(1).map((_, k) => (
          <Chapter key={k} i={k + 1} />
        ))}
        <Reveal className="border-t border-line pt-20 pb-8 md:pt-28">
          <p className="max-w-5xl text-[clamp(2.2rem,5vw,4.75rem)] leading-[1.02] font-medium tracking-[-0.035em] text-balance">
            Relay doesn&apos;t take notes. It gets the medicine to the patient.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
