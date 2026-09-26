"use client";

import { useMotionValueEvent, useReducedMotion, type MotionValue } from "framer-motion";
import { useMemo, useRef } from "react";

import { useMounted } from "@/components/useMounted";

// "The Relay strand": ~600 particles on six braided strands (every way a
// prescription can stall) that converge into one luminous route as `progress`
// goes 0 → 1. Deterministic (seeded), SVG only. Each particle is drawn at its
// converged position and offset by its tangled delta scaled with CSS var --p,
// so scrolling updates one custom property — no React re-render per frame.

const STRANDS = [
  { label: "Insurance", amp: 150, freq: 1.4, phase: 0.2 },
  { label: "PA", amp: 110, freq: 2.2, phase: 1.9 },
  { label: "$480 copay", amp: 170, freq: 1.1, phase: 3.4 },
  { label: "Bridge", amp: 90, freq: 2.6, phase: 4.6 },
  { label: "PAP", amp: 130, freq: 1.8, phase: 5.5 },
  { label: "Cash Pay", amp: 75, freq: 3.0, phase: 2.7 },
];
export const PER_STRAND = 55;

// Centerline (the route), in a 1000×1500 box: from off the top edge, diagonally down.
const P = [
  [640, -160],
  [1020, 430],
  [-20, 820],
  [420, 1620],
] as const;

// Color along the route: indigo at the deep end → teal → cyan → ice.
const STOPS: [number, [number, number, number]][] = [
  [0, [58, 52, 160]],
  [0.25, [14, 110, 118]],
  [0.55, [25, 179, 170]],
  [0.8, [70, 190, 214]],
  [1, [120, 205, 228]],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bez(t: number) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  const x = a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0];
  const y = a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1];
  const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
  const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / len, ny: dx / len };
}

function colorAt(t: number) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(",")})`;
    }
  }
  return `rgb(${STOPS.at(-1)![1].join(",")})`;
}

const round = (v: number) => Math.round(v * 10) / 10;

type Particle = { x: number; y: number; dx: number; dy: number; r: number; o: number; fill: string };

function build(perStrand: number) {
  const rand = mulberry32(20260926);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const back: Particle[] = [];
  const front: Particle[] = [];
  const wisps: string[] = [];
  const labels: { label: string; x: number; y: number; side: 1 | -1 }[] = [];

  STRANDS.forEach((s, si) => {
    const tangledPts: string[] = [];
    for (let j = 0; j <= 40; j++) {
      const t = j / 40;
      const c = bez(t);
      const o = s.amp * Math.sin(2 * Math.PI * s.freq * t + s.phase);
      tangledPts.push(`${round(c.x + c.nx * o)},${round(c.y + c.ny * o)}`);
    }
    wisps.push(`M${tangledPts.join(" L")}`);

    for (let j = 0; j < perStrand; j++) {
      const t = (j + rand()) / perStrand;
      const c = bez(t);
      const tangledOff = s.amp * Math.sin(2 * Math.PI * s.freq * t + s.phase) + gauss() * 26;
      const routeOff = gauss() * 7;
      const along = gauss() * 8;
      const bx = c.x + c.nx * routeOff + c.ny * along;
      const by = c.y + c.ny * routeOff - c.nx * along;
      const ax = c.x + c.nx * tangledOff + gauss() * 10;
      const ay = c.y + c.ny * tangledOff + gauss() * 10;
      const z = rand();
      const bokeh = rand() < 0.03;
      const p: Particle = {
        x: round(bx),
        y: round(by),
        dx: round(ax - bx),
        dy: round(ay - by),
        r: round(bokeh ? 6 + rand() * 5 : z < 0.35 ? 1.2 + rand() * 1.6 : 1.5 + rand() * 3),
        o: round(bokeh ? 0.12 : z < 0.35 ? 0.3 + rand() * 0.3 : 0.6 + rand() * 0.38),
        fill: colorAt(Math.min(1, Math.max(0, t))),
      };
      (z < 0.35 || bokeh ? back : front).push(p);
      // One annotation per strand, spread down the braid, alternating sides.
      if (j === Math.round(perStrand * (0.24 + si * 0.09))) {
        labels.push({ label: s.label, x: p.x + p.dx, y: p.y + p.dy, side: si % 2 ? -1 : 1 });
      }
    }
  });

  const route = Array.from({ length: 61 }, (_, j) => {
    const c = bez(j / 60);
    return `${round(c.x)},${round(c.y)}`;
  });
  return { back, front, wisps, labels, route: `M${route.join(" L")}` };
}

const dot = (p: Particle, i: number) => (
  <circle
    key={i}
    cx={p.x}
    cy={p.y}
    r={p.r}
    fill={p.fill}
    opacity={p.o}
    style={{ transform: `translate(calc(${p.dx}px * (1 - var(--p))), calc(${p.dy}px * (1 - var(--p))))` }}
  />
);

export function Strand({
  progress,
  className,
  perStrand = PER_STRAND,
}: {
  progress: MotionValue<number>;
  className?: string;
  perStrand?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const g = useMemo(() => build(perStrand), [perStrand]);

  useMotionValueEvent(progress, "change", (v) => {
    if (!reduce) ref.current?.style.setProperty("--p", String(v));
  });

  // Reduced motion: show the resolved route, no drift.
  const p0 = reduce ? 1 : 0;

  return (
    <div aria-hidden className={className}>
      <div className={reduce ? undefined : "relay-drift h-full w-full"}>
        <svg ref={ref} viewBox="0 0 1000 1500" className="h-full w-full overflow-visible" style={{ ["--p" as string]: p0 }}>
          <defs>
            <linearGradient id="strand-route" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(58,52,160)" />
              <stop offset="0.3" stopColor="rgb(14,110,118)" />
              <stop offset="0.6" stopColor="rgb(25,179,170)" />
              <stop offset="1" stopColor="rgb(120,205,228)" />
            </linearGradient>
          </defs>

          {/* Fluid volume: wide, blurred, translucent ribbons along each strand. */}
          <g style={{ opacity: "calc(1 - var(--p))", filter: "blur(10px)" }}>
            {g.wisps.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="url(#strand-route)" strokeOpacity={0.14} strokeWidth={34} strokeLinecap="round" />
            ))}
          </g>
          <path
            d={g.route}
            fill="none"
            stroke="url(#strand-route)"
            strokeOpacity={0.22}
            strokeWidth={70}
            strokeLinecap="round"
            style={{ opacity: "var(--p)", filter: "blur(18px)" }}
          />

          {/* Tangled wisps fade out as the route resolves. */}
          <g style={{ opacity: "calc(0.8 * (1 - var(--p)))" }}>
            {g.wisps.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="url(#strand-route)" strokeOpacity={0.45} strokeWidth={1.2} />
            ))}
          </g>

          {/* Depth of field: a soft back layer, then the sharp front layer. */}
          <g style={{ filter: "blur(1.6px)" }}>{g.back.map(dot)}</g>
          <g>{g.front.map(dot)}</g>

          {/* The resolved route glows in as the strands converge. */}
          <path
            d={g.route}
            fill="none"
            stroke="url(#strand-route)"
            strokeWidth={3}
            strokeLinecap="round"
            className="relay-glow"
            style={{ opacity: "var(--p)" }}
          />

          {/* Technical annotations on hairline leaders, fading as the tangle resolves. */}
          {/* Hidden below lg: at phone scale the labels would render ~7px. */}
          <g style={{ opacity: "calc(1 - var(--p) * 1.4)" }} className="hidden font-mono lg:inline">
            {g.labels.map((l) => (
              <g key={l.label}>
                <line x1={l.x} y1={l.y} x2={l.x + 70 * l.side} y2={l.y - 36} stroke="var(--color-muted-foreground)" strokeWidth={1} />
                <circle cx={l.x} cy={l.y} r={3.5} fill="var(--color-card)" stroke="var(--color-foreground)" strokeWidth={1.2} />
                <text
                  x={l.x + 78 * l.side}
                  y={l.y - 40}
                  fontSize={19}
                  letterSpacing={2.5}
                  textAnchor={l.side === 1 ? "start" : "end"}
                  fill="var(--color-muted-foreground)"
                >
                  {l.label.toUpperCase()}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
