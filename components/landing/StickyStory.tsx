"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { BRAND } from "@/components/brand";
import { cn } from "@/lib/utils";

import { SCENE_MOCKS } from "./mockups";
import { story } from "./pill/storyState";
import { Reveal } from "./motion";
// One patient's journey, in the reference's sticky split (no names on the
// landing; names appear only in the portals after sign-in): the visual stays
// pinned on the left while the seven scenes scroll on the right. On phones
// each scene shows its mockup inline. No scroll-jacking anywhere.
const SCENES = [
  {
    title: "The doctor speaks",
    body: [
      `The doctor says one sentence at the end of the visit. ${BRAND.name} hears a prescription, not a note: drug, dose, frequency, for whom.`,
      "Nothing to type, no form to find. The work starts before the patient reaches the parking lot.",
    ],
  },
  {
    title: "The wall",
    body: [
      "Her new insurance wants prior authorization, and the copay would be $480 a month.",
      `This is where new prescriptions quietly die. ${BRAND.name} sees the wall on day 0 instead of at the pharmacy counter.`,
    ],
  },
  {
    title: `${BRAND.name} finds a path`,
    body: [
      "A free Medvantx Bridge supply ships while the insurer decides, chosen by fixed rules the doctor can read.",
      "At the same time the prior authorization is drafted from the FDA drug label, every claim cited, ready for one approval.",
    ],
  },
  {
    title: "The patient's phone, in Spanish",
    body: [
      "She gets the plan in her own language, in plain words: what is coming, when, and that it costs her nothing.",
      "Her daughter joins her care circle and gets the same updates, in English.",
    ],
  },
  {
    title: "Day 24: the cliff",
    body: [
      "The insurer says no, and the bridge ends in six days. For most patients, this is where therapy stops.",
      `${BRAND.name}'s watchdog sees it first and brings the doctor a new path: Medvantx Cash Pay.`,
    ],
  },
  {
    title: "Her daughter pays, safely",
    body: [
      "Her daughter approves the payment from her phone with a passkey, under a spending cap she sets. Refills can repeat on their own.",
      "Free programs never touch a card. Only cash pay does, and only with a person's approval.",
    ],
  },
  {
    title: "One more patient kept",
    body: [
      "The medicine arrives. The patient stays on therapy, and the manufacturer sees one more script rescued, with a full audit trail.",
      `The doctor spoke once. ${BRAND.name} carried it all the way home.`,
    ],
  },
];

export function StickyStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const section = useRef<HTMLElement>(null);

  // Tell the 3D pill which scene is showing (-1 outside the story).
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      story.scene = e.isIntersecting ? Number(section.current?.dataset.active ?? 0) : -1;
    });
    if (section.current) io.observe(section.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (story.scene !== -1) story.scene = active;
  }, [active]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.scene));
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const Mock = SCENE_MOCKS[active];
  const cliff = active === 4;

  return (
    <section ref={section} id="story" data-active={active} aria-labelledby="story-title" className="scroll-mt-24">
      <div className="px-5 pt-[clamp(5rem,12vh,8rem)] text-center">
        <Reveal>
          <h2 id="story-title" className="font-[family-name:var(--font-figtree)] text-[clamp(2.4rem,4.2vw,3.4rem)] leading-[1.02] font-light tracking-[-0.015em]">
            One patient&apos;s journey
          </h2>
        </Reveal>
      </div>

      <div className="mt-[clamp(4rem,10vh,7rem)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Pinned visual (desktop). Scene 5 warms the panel toward amber/red. */}
        <div className="sticky top-0 hidden h-svh lg:block">
          <div
            className={cn(
              "relative grid h-full place-items-center overflow-hidden px-8 transition-colors duration-500",
              cliff ? "bg-[color-mix(in_srgb,var(--risk)_16%,var(--background))]" : "bg-[var(--slate-pale)]"
            )}
            data-scene={active}
          >
            <p className="absolute top-8 left-8 font-[family-name:var(--font-figtree)] text-7xl font-light text-foreground/15 tabular" aria-hidden>
              {String(active + 1).padStart(2, "0")}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="grid w-full place-items-center"
              >
                <Mock />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <ol className="lg:pr-[6.25rem]">
          {SCENES.map((s, i) => {
            const M = SCENE_MOCKS[i];
            return (
              <li
                key={s.title}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-scene={i}
                className="flex min-h-[70svh] flex-col justify-center px-5 py-16 sm:px-8 lg:ml-auto lg:min-h-svh lg:max-w-[26rem] lg:px-0"
              >
                <div className="mb-10 grid place-items-center rounded-2xl bg-[var(--slate-pale)] px-4 py-10 lg:hidden">
                  <M />
                </div>
                <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground">{String(i + 1).padStart(2, "0")} / 07</p>
                <h3 className="mt-3 text-xl font-normal">{s.title}</h3>
                {s.body.map((p) => (
                  <p key={p.slice(0, 16)} className="mt-6 text-base leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
