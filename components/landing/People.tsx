"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { BRAND } from "@/components/brand";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { Reveal } from "./motion";

// The people on the path: abstract portrait tiles (no photographs; synthetic
// people), staggered like a portrait wall, joined by a glowing path.
const doctorName = DEMO_PRESCRIBER.name.replace(/^Dr\.\s*/, "").replace(/,.*$/, "");

const PEOPLE = [
  { role: "Doctor", name: doctorName, initial: doctorName[0], bg: "bg-[#ccd3dd] from-[#dfe4ec] to-[#b8c1cf]" },
  { role: "Patient", name: "Maria González", initial: "M", bg: "bg-[#c1dedf] from-[#d9ecec] to-[#a9cfd1]" },
  { role: "Her daughter", name: "Ana González", initial: "A", bg: "bg-[#d5d1e3] from-[#e6e3ef] to-[#c3bfd6]" },
  { role: "Pharmacy", name: "Medvantx", initial: "Rx", bg: "bg-[#d5dbe3] from-[#e4e8ee] to-[#c6ced9]", simulated: true },
];

export function People() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const draw = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="people" aria-labelledby="people-title" className="scroll-mt-24 bg-[var(--slate-band)] text-[var(--slate-band-ink)]">
      <div className="mx-auto max-w-[40rem] px-5 pt-[clamp(6rem,14vh,10rem)] pb-[clamp(6rem,16vh,12rem)] sm:px-8">
        <Reveal>
          <h2 id="people-title" className="font-[family-name:var(--font-figtree)] text-[clamp(2.4rem,4.2vw,3.4rem)] leading-[1.02] font-light tracking-[-0.015em]">
            No patient left between the prescription and the pharmacy.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-[clamp(3rem,10vh,7rem)] text-lg leading-relaxed text-[var(--slate-band-muted)]">
            {BRAND.name} listens when the doctor prescribes, then does the follow-through nobody has time for. It
            checks coverage, finds the free path, drafts the paperwork, explains it to the patient in her own language
            and lets her family help. The doctor, Maria, her daughter Ana and the pharmacy stay on one path.
          </p>
        </Reveal>

        <p className="mt-[clamp(5rem,14vh,9rem)] text-xl text-[var(--slate-band-muted)]">The people on the path</p>
        <div ref={ref} className="relative mt-12 grid grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2">
          {/* The path joining the four (desktop). */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block" aria-hidden>
            <motion.path
              d="M25 16 C 50 16, 50 34, 75 34 S 50 66, 25 66 S 50 84, 75 84"
              fill="none"
              stroke="var(--echo-accent)"
              strokeWidth={0.4}
              style={{ pathLength: draw }}
              className="relay-glow"
            />
          </svg>
          {PEOPLE.map((p, i) => (
            <Reveal key={p.role} delay={i * 0.05} className={cn("relative", i % 2 === 1 && "sm:mt-24")}>
              <motion.figure whileHover={{ y: -6, scale: 1.015 }} transition={{ duration: 0.25 }}>
                <div className={cn("relative grid aspect-[7/10] place-items-center overflow-hidden bg-gradient-to-br", p.bg)}>
                  <span className="font-[family-name:var(--font-figtree)] text-[7rem] leading-none font-light text-[#283040]/70">{p.initial}</span>
                  <span className="absolute bottom-4 left-4 size-3 rounded-full bg-[var(--echo-accent)] shadow-[0_0_18px_var(--color-glow)]" aria-hidden />
                </div>
                <figcaption className="mt-4 text-base">
                  <span className="text-[var(--slate-band-muted)]">{p.role}</span> {p.name}
                  {p.simulated && <span className="ml-2 rounded border border-[var(--slate-band-muted)]/50 px-1.5 text-xs text-[var(--slate-band-muted)]">Simulated</span>}
                </figcaption>
              </motion.figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
