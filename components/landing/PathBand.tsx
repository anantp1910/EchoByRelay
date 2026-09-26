"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

// Full-bleed band: one path, four people, drawn as the band scrolls through.
const NODES = [
  { x: 120, y: 190, who: "The doctor", role: "prescribes" },
  { x: 420, y: 110, who: "The pharmacy", role: "ships" },
  { x: 720, y: 200, who: "The patient", role: "receives" },
  { x: 1000, y: 120, who: "The caregiver", role: "helps" },
];
const D = "M0 230 C 60 210, 90 190, 120 190 S 330 110, 420 110 S 640 200, 720 200 S 920 120, 1000 120 S 1140 150, 1200 130";

export function PathBand() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const draw = useTransform(scrollYProgress, [0.15, 0.6], [0, 1]);
  const drift = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section ref={ref} aria-label="One path, four people" className="relative overflow-clip bg-gradient-to-b from-[var(--slate-pale)] to-[var(--background)]">
      <motion.div style={{ y: drift }} className="mx-auto max-w-[90rem] px-5 py-[clamp(4rem,12vh,8rem)]">
        <p className="text-center text-sm tracking-[0.14em] text-muted-foreground uppercase">One path · four people</p>
        <svg viewBox="0 0 1200 300" className="mt-6 w-full overflow-visible" aria-hidden>
          <path d={D} fill="none" stroke="var(--line)" strokeWidth={2} />
          <motion.path d={D} fill="none" stroke="var(--echo-accent)" strokeWidth={3} strokeLinecap="round" style={{ pathLength: draw }} className="relay-glow" />
          {NODES.map((n) => (
            <g key={n.who}>
              <circle cx={n.x} cy={n.y} r={20} fill="var(--card)" stroke="var(--echo-accent)" strokeWidth={2} />
              <circle cx={n.x} cy={n.y} r={6} fill="var(--echo-accent)" className="relay-glow" />
              <text x={n.x} y={n.y + 52} textAnchor="middle" fontSize={22} fill="var(--foreground)">
                {n.who}
              </text>
              <text x={n.x} y={n.y + 78} textAnchor="middle" fontSize={16} fill="var(--muted-foreground)">
                {n.role}
              </text>
            </g>
          ))}
        </svg>
        <p className="sr-only">
          {NODES.map((n) => `${n.who} ${n.role}`).join(", ")}.
        </p>
      </motion.div>
    </section>
  );
}
