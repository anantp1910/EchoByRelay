"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { HeartHandshake, Pill, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import { useRef } from "react";

import { BRAND } from "@/components/brand";
import { cn } from "@/lib/utils";

import { Reveal } from "./motion";

// The people on the path: abstract role tiles (no names, no photographs),
// staggered like a portrait wall, joined by a glowing path.
const PEOPLE: { role: string; note: string; icon: LucideIcon; bg: string; simulated?: boolean }[] = [
  { role: "The doctor", note: "prescribes", icon: Stethoscope, bg: "bg-[#ccd3dd] from-[#dfe4ec] to-[#b8c1cf]" },
  { role: "The patient", note: "receives", icon: UserRound, bg: "bg-[#c1dedf] from-[#d9ecec] to-[#a9cfd1]" },
  { role: "The caregiver", note: "helps", icon: HeartHandshake, bg: "bg-[#d5d1e3] from-[#e6e3ef] to-[#c3bfd6]" },
  { role: "The pharmacy", note: "ships", icon: Pill, bg: "bg-[#d5dbe3] from-[#e4e8ee] to-[#c6ced9]", simulated: true },
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
            and lets her family help. The doctor, the patient, her caregiver and the pharmacy stay on one path.
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
                  <p.icon aria-hidden strokeWidth={1} className="size-28 text-[#283040]/70" />
                  <span className="absolute bottom-4 left-4 size-3 rounded-full bg-[var(--echo-accent)] shadow-[0_0_18px_var(--color-glow)]" aria-hidden />
                </div>
                <figcaption className="mt-4 text-base">
                  {p.role} <span className="text-[var(--slate-band-muted)]">{p.note}</span>
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
