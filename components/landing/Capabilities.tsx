"use client";

import { motion } from "framer-motion";

import { BRAND } from "@/components/brand";

import { BridgeArt, CoverageArt, FamilyPayArt, LetterArt } from "./illustrations";
import { Reveal } from "./motion";

const CARDS = [
  {
    title: "Coverage, checked",
    body: `Before the patient leaves the room, ${BRAND.name} checks her plan: prior authorization required, $480 a month. The wall shows up on day 0, not at the pharmacy counter.`,
    Art: CoverageArt,
  },
  {
    title: "A free bridge",
    body: `${BRAND.name}'s router picks the path from fixed rules, not guesswork: a free Medvantx Bridge supply ships while the insurer decides. The doctor approves in one tap, or one word.`,
    Art: BridgeArt,
  },
  {
    title: "The paperwork, drafted",
    body: `${BRAND.name} drafts the prior authorization from the FDA drug label, every clinical claim numbered and cited. The doctor reads it, then submits.`,
    Art: LetterArt,
  },
  {
    title: "Family can help",
    body: "When the plan changes, her caregiver can approve Medvantx Cash Pay from her phone, under a spending cap she sets, with a passkey. Free programs never touch a card.",
    Art: FamilyPayArt,
  },
];

export function Capabilities() {
  return (
    <section id="what" aria-labelledby="what-title" className="scroll-mt-24 px-3 py-[clamp(4rem,10vh,7rem)] sm:px-5">
      <h2 id="what-title" className="sr-only">
        What {BRAND.name} does
      </h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {CARDS.map(({ title, body, Art }, i) => (
          <Reveal key={title} delay={(i % 2) * 0.06}>
            <motion.article
              whileHover={{ y: -6, scale: 1.01 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-line bg-card p-8 sm:p-12"
            >
              <h3 className="text-[clamp(2rem,3vw,2.6rem)] leading-tight font-normal tracking-[-0.01em]">{title}</h3>
              <p className="mt-8 max-w-[46ch] text-base leading-relaxed text-muted-foreground">{body}</p>
              <div className="mt-auto ml-auto w-44 pt-10 sm:w-52">
                <Art />
              </div>
            </motion.article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
