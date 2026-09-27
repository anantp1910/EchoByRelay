"use client";

import { useReducedMotion } from "framer-motion";
import { useId } from "react";

import { useMounted } from "@/components/useMounted";
import { cn } from "@/lib/utils";

// The rail's glass pill: a tall frosted capsule with teal liquid, a soft glow,
// a tilted orbit ring and small dots travelling around it. Pure SVG + CSS
// (no WebGL). Floats gently; dots orbit via SMIL. Both stop with reduced
// motion. Decorative: aria-hidden.

const CX = 120;
const CY = 230;
const ORBIT = { rx: 108, ry: 30, tilt: -18 };
// Ellipse as a path (for animateMotion), centred on the pill.
const ORBIT_PATH = `M ${CX - ORBIT.rx} ${CY} a ${ORBIT.rx} ${ORBIT.ry} 0 1 0 ${ORBIT.rx * 2} 0 a ${ORBIT.rx} ${ORBIT.ry} 0 1 0 ${-ORBIT.rx * 2} 0`;
const DOTS = [
  { begin: "0s", r: 4.5 },
  { begin: "-2.2s", r: 3.5 },
  { begin: "-4.6s", r: 4 },
  { begin: "-6.8s", r: 3 },
];

export function GlassPill({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const mounted = useMounted();
  const still = Boolean(useReducedMotion()) && mounted;

  return (
    <div className={cn("relative", className)} data-testid="glass-pill" aria-hidden>
      <svg viewBox="0 0 240 460" className={cn("h-full w-full overflow-visible", !still && "glass-float")}>
        <defs>
          {/* Frosted glass body: clear top, teal liquid band, fading bottom. */}
          <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="0.22" stopColor="#e9f5f6" stopOpacity="0.55" />
            <stop offset="0.42" stopColor="#3fa7ac" stopOpacity="0.8" />
            <stop offset="0.58" stopColor="#0f7f86" stopOpacity="0.85" />
            <stop offset="0.78" stopColor="#7cc6cb" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.7" />
          </linearGradient>
          {/* Refraction: darker right edge, bright left edge. */}
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="0.18" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="0.75" stopColor="#0a5559" stopOpacity="0" />
            <stop offset="1" stopColor="#0a5559" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="var(--color-glow)" stopOpacity="0.45" />
            <stop offset="0.6" stopColor="var(--color-glow)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--color-glow)" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <clipPath id={`${id}-clip`}>
            <rect x="70" y="40" width="100" height="380" rx="50" />
          </clipPath>
        </defs>

        {/* Soft glow behind the glass */}
        <ellipse cx={CX} cy={CY + 10} rx="120" ry="200" fill={`url(#${id}-glow)`} />

        <g transform={`rotate(-12 ${CX} ${CY})`}>
          {/* Back half of the orbit ring (behind the pill) */}
          <g transform={`rotate(${ORBIT.tilt} ${CX} ${CY})`}>
            <path d={ORBIT_PATH} fill="none" stroke="var(--color-glow)" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="2 5" />
          </g>

          {/* Glass capsule */}
          <rect x="70" y="40" width="100" height="380" rx="50" fill={`url(#${id}-glass)`} />
          <g clipPath={`url(#${id}-clip)`}>
            {/* Liquid meniscus */}
            <ellipse cx={CX} cy="190" rx="52" ry="9" fill="#bfe7ea" opacity="0.55" />
            <rect x="70" y="40" width="100" height="380" fill={`url(#${id}-edge)`} />
            {/* Inner soft light */}
            <ellipse cx="98" cy="150" rx="14" ry="110" fill="#ffffff" opacity="0.35" filter={`url(#${id}-soft)`} />
          </g>
          <rect x="70" y="40" width="100" height="380" rx="50" fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.5" />
          <rect x="70" y="40" width="100" height="380" rx="50" fill="none" stroke="#0f7f86" strokeOpacity="0.25" strokeWidth="1" />

          {/* Front of the orbit ring + travelling dots */}
          <g transform={`rotate(${ORBIT.tilt} ${CX} ${CY})`}>
            <path
              d={`M ${CX - ORBIT.rx} ${CY} a ${ORBIT.rx} ${ORBIT.ry} 0 0 0 ${ORBIT.rx * 2} 0`}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.85"
              strokeWidth="1.4"
            />
            {DOTS.map((d, i) =>
              still ? (
                <circle
                  key={i}
                  cx={CX + ORBIT.rx * Math.cos((i * Math.PI) / 2 + 0.6)}
                  cy={CY + ORBIT.ry * Math.sin((i * Math.PI) / 2 + 0.6)}
                  r={d.r}
                  fill="#0f7f86"
                />
              ) : (
                <circle key={i} r={d.r} fill="#0f7f86">
                  <animateMotion dur="9s" begin={d.begin} repeatCount="indefinite" path={ORBIT_PATH} />
                </circle>
              )
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}
