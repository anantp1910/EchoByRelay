"use client";

import { useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useRef } from "react";

import { InkPill, WordReveal } from "./motion";
import { Strand } from "./Strand";

const HEADLINE = "A prescription is only useful if it reaches the patient.";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Scrolling through the hero braids the six strands into one route.
  const resolve = useTransform(scrollYProgress, [0.05, 0.75], [0, 1], { clamp: true });

  return (
    <section ref={ref} id="intro" aria-labelledby="hero-title" className="relative flex flex-col lg:min-h-[calc(100svh-7rem)]">
      <Strand
        progress={resolve}
        className="pointer-events-none relative -mx-5 h-[46svh] sm:-mx-8 lg:absolute lg:-top-40 lg:right-[-4%] lg:mx-0 lg:h-[134%] lg:w-[64%]"
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center pt-4 pb-10 lg:pt-10 lg:pb-16">
        <div className="max-w-[36rem]">
          <p className="text-[0.8rem] font-medium tracking-[0.08em] uppercase">What Relay does</p>
          <h1
            id="hero-title"
            className="mt-7 text-[clamp(2.5rem,4.8vw,4.6rem)] leading-[1.04] font-medium tracking-[-0.03em] text-balance"
          >
            <WordReveal text={HEADLINE} />
          </h1>
          <p className="mt-[clamp(2rem,7vh,5.5rem)] max-w-[34ch] text-lg leading-relaxed text-muted-foreground">
            Relay finds the path from prescription to treatment.
          </p>
        </div>

        <div className="mt-[clamp(2.25rem,8vh,6rem)] flex flex-wrap items-center justify-between gap-4">
          <InkPill href="#journey" testId="cta-how">
            See how Relay works
          </InkPill>
          <a
            href="#journey"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <ArrowDown aria-hidden className="size-4" /> Scroll for more
          </a>
        </div>
      </div>

      <p className="sr-only">
        Insurance, prior authorization, a $480 copay, bridge supply, assistance programs and cash pay tangle together.
        Relay braids them into one route to the patient.
      </p>
    </section>
  );
}
