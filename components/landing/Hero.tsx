"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";

import { GlowPath } from "@/components/path/RelayPath";
import { useMounted } from "@/components/useMounted";

// The tangle: every way a prescription can stall. Hand-drawn curves in a
// 800×600 box; labels sit near where each curve starts.
const TANGLE: { label: string; d: string; x: number; y: number }[] = [
  { label: "Insurance", d: "M40 120 C 220 40, 300 420, 520 260 S 760 80, 780 300", x: 5, y: 16 },
  { label: "PA", d: "M60 520 C 200 300, 420 560, 480 300 S 700 520, 760 180", x: 7, y: 84 },
  { label: "$480 copay", d: "M20 300 C 160 180, 300 180, 360 380 S 620 420, 780 420", x: 2, y: 44 },
  { label: "Bridge", d: "M100 60 C 260 260, 180 460, 420 480 S 640 240, 740 560", x: 14, y: 6 },
  { label: "PAP", d: "M40 420 C 300 460, 260 120, 520 140 S 700 360, 790 100", x: 4, y: 66 },
  { label: "Cash Pay", d: "M160 580 C 240 380, 520 520, 560 200 S 740 140, 780 40", x: 22, y: 93 },
];

// The route Relay finds through it.
const ROUTE = "M20 330 C 180 330, 220 250, 360 270 S 540 360, 620 300 S 740 250, 790 260";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  // Gate on mount: the media query isn't known during SSR/hydration.
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Scrolling out of the hero resolves the tangle into one route.
  const route = useTransform(scrollYProgress, [0, 0.6], [0.28, 1]);
  const tangleOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0.25]);

  return (
    <section ref={ref} className="relay-aura relative isolate overflow-hidden" aria-labelledby="hero-title">
      <div className="mx-auto grid min-h-svh max-w-7xl items-center gap-10 px-5 pt-28 pb-16 lg:grid-cols-[1.25fr_1fr] lg:px-8">
        <div className="relative z-10">
          <p className="font-mono text-xs tracking-[0.2em] text-ice-strong uppercase">Relay · access router</p>
          <h1
            id="hero-title"
            className="mt-5 font-heading text-[clamp(2.6rem,5.6vw,5.5rem)] leading-[0.98] font-bold tracking-tight text-balance"
          >
            A prescription is only useful if it reaches the patient.
          </h1>
          <p className="mt-6 max-w-lg text-xl text-muted-foreground sm:text-2xl">
            Relay finds the path from prescription to treatment.
          </p>
          <a
            href="#journey"
            className="mt-10 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-lg font-medium text-primary-foreground shadow-[0_0_32px_-6px_var(--color-glow)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none"
            data-testid="cta-how"
          >
            See how Relay works <ArrowRight aria-hidden className="size-5" />
          </a>
        </div>

        <div className="relative aspect-[4/3] w-full" aria-hidden>
          <motion.svg viewBox="0 0 800 600" className="absolute inset-0 size-full" style={reduce ? { opacity: 0.35 } : { opacity: tangleOpacity }}>
            {TANGLE.map((t) => (
              <path
                key={t.label}
                d={t.d}
                fill="none"
                stroke="var(--color-ice-strong)"
                strokeOpacity={0.35}
                strokeWidth={1.5}
                className="relay-drift"
                style={{ animationDelay: `${t.x * -0.3}s` }}
              />
            ))}
          </motion.svg>
          <svg viewBox="0 0 800 600" className="absolute inset-0 size-full">
            <GlowPath d={ROUTE} progress={reduce ? undefined : route} width={3} />
          </svg>
          {TANGLE.map((t) => (
            <span
              key={t.label}
              className="absolute rounded-full bg-background/70 px-2 py-0.5 font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur-sm"
              style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translateY(-50%)" }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Screen readers get the idea without the picture. */}
      <p className="sr-only">
        Insurance, prior authorization, a $480 copay, bridge supply, assistance programs and cash pay tangle together. Relay
        finds one route through them.
      </p>
    </section>
  );
}
