"use client";

import { useAnimationFrame, useReducedMotion, useScroll, type MotionValue } from "framer-motion";
import Link from "next/link";
import { useId, useRef } from "react";

import { ThemeToggle } from "@/components/AppHeader";
import { BRAND } from "@/components/brand";
import { useMounted } from "@/components/useMounted";

// Hero: the layered wordmark.
//   1. solid ECHO in ink (bottom)
//   2. the hero object: a soft, white, 3D-looking capsule (opaque, shaded)
//   3. ECHO again as a 1px ink hairline, clipped to the capsule's exact shape
//
// The capsule lives in a group with transform T (float + sway + scroll). The
// clip is defined in that group's local space, and the outline text sits
// inside the clip under the inverse transform T⁻¹, so it stays put in world
// space while the clip moves with the capsule: the hairlines only ever show
// inside the object. One animation frame drives both (transform attributes
// only; no React re-render). Reduced motion: static composition.

const WORD = BRAND.name.toUpperCase();
const HALF = Math.ceil(WORD.length / 2);

type Comp = {
  box: string;
  lines: { text: string; y: number }[];
  obj: { cx: number; cy: number; len: number; r: number; angle: number; shadowY: number };
  scroll: { dy: number; dr: number };
};
const WIDE: Comp = {
  box: "0 -60 1000 460",
  lines: [{ text: WORD, y: 345 }],
  obj: { cx: 560, cy: 175, len: 500, r: 92, angle: -36, shadowY: 395 },
  scroll: { dy: 120, dr: 16 },
};
const TALL: Comp = {
  box: "0 -40 1000 930",
  lines: [
    { text: WORD.slice(0, HALF), y: 380 },
    { text: WORD.slice(HALF), y: 810 },
  ],
  obj: { cx: 520, cy: 430, len: 760, r: 140, angle: -40, shadowY: 850 },
  scroll: { dy: 90, dr: 12 },
};

/** Capsule outline centred on (0,0), long axis on x. */
function capsulePath(len: number, r: number) {
  const a = len / 2 - r;
  return `M ${-a} ${-r} H ${a} A ${r} ${r} 0 0 1 ${a} ${r} H ${-a} A ${r} ${r} 0 0 1 ${-a} ${-r} Z`;
}

function Wordmark({
  comp,
  className,
  progress,
  still,
}: {
  comp: Comp;
  className?: string;
  progress: MotionValue<number>;
  still: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const obj = useRef<SVGGElement>(null);
  const inverse = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const { cx, cy, len, r, angle, shadowY } = comp.obj;
  const path = capsulePath(len, r);

  useAnimationFrame((t) => {
    if (still) return;
    const p = progress.get();
    if (p >= 1) return; // hero off-screen: nothing to update
    const s = t / 1000;
    const ty = Math.sin(s * 1.1) * 7 + p * comp.scroll.dy; // idle float + scroll
    const rot = Math.sin(s * 0.6) * 2.5 + p * comp.scroll.dr; // gentle sway + scroll
    const x = cx + p * 30;
    const y = cy + ty;
    const a = angle + rot;
    // T on the object, T⁻¹ on the outline text: the clip moves, the letters don't.
    obj.current?.setAttribute("transform", `translate(${x} ${y}) rotate(${a})`);
    inverse.current?.setAttribute("transform", `rotate(${-a}) translate(${-x} ${-y})`);
    shadow.current?.setAttribute("transform", `translate(${x} ${shadowY + ty * 0.35}) scale(${1 - ty / 900} 1)`);
  });

  // Initial / reduced-motion transforms (also what SSR renders).
  const T = `translate(${cx} ${cy}) rotate(${angle})`;
  const Tinv = `rotate(${-angle}) translate(${-cx} ${-cy})`;

  const text = (props: React.SVGProps<SVGTextElement>) =>
    comp.lines.map((l) => (
      <text key={l.text} x="0" y={l.y} fontSize="470" textLength="1000" lengthAdjust="spacingAndGlyphs" className="font-wordmark" {...props}>
        {l.text}
      </text>
    ));

  return (
    <svg viewBox={comp.box} className={`w-full overflow-visible text-[var(--wordmark)] ${className ?? ""}`} aria-hidden>
      <defs>
        <radialGradient id={`${uid}-body`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#f2f4f8" />
          <stop offset="0.82" stopColor="#d3d9e2" />
          <stop offset="1" stopColor="#aeb7c4" />
        </radialGradient>
        <linearGradient id={`${uid}-tint`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0f7f86" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#0f7f86" stopOpacity="0.08" />
          <stop offset="0.5" stopColor="#0f7f86" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-glint`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#3f4859" stopOpacity="0.32" />
          <stop offset="1" stopColor="#3f4859" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        {/* The object's silhouette in its own local space. */}
        <clipPath id={`${uid}-clip`}>
          <path d={path} />
        </clipPath>
      </defs>

      {/* 1. Solid wordmark */}
      {text({ fill: "currentColor" })}

      {/* Ground shadow follows the object horizontally, squashes as it rises. */}
      <ellipse ref={shadow} cx="0" cy="0" rx={len * 0.42} ry={r * 0.22} fill={`url(#${uid}-shadow)`} transform={`translate(${cx} ${shadowY})`} />

      {/* 2 + 3. Object group (transform T) */}
      <g ref={obj} transform={T}>
        <path d={path} fill={`url(#${uid}-body)`} />
        <g clipPath={`url(#${uid}-clip)`}>
          {/* soft shading: tinted cap, inner shadow, specular highlight */}
          <path d={path} fill={`url(#${uid}-tint)`} />
          <path
            d={path}
            fill="none"
            stroke="#7f8a9b"
            strokeOpacity="0.4"
            strokeWidth={r * 0.5}
            filter={`url(#${uid}-soft)`}
            transform={`translate(${r * 0.12} ${r * 0.22})`}
          />
          <ellipse cx={-len * 0.12} cy={-r * 0.45} rx={len * 0.3} ry={r * 0.22} fill={`url(#${uid}-glint)`} />
          {/* 3. Hairline wordmark, counter-transformed (T⁻¹) back to world space. */}
          <g ref={inverse} transform={Tinv}>
            {text({ fill: "none", stroke: "currentColor", strokeOpacity: 0.6, strokeWidth: 1, vectorEffect: "non-scaling-stroke" })}
          </g>
        </g>
        <path d={path} fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

const linkCls =
  "glow-text inline-flex min-h-11 items-center rounded-md text-[0.95rem] text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

export function WordmarkHero() {
  const ref = useRef<HTMLElement>(null);
  const mounted = useMounted();
  const still = Boolean(useReducedMotion()) && mounted;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  return (
    <section
      ref={ref}
      id="top"
      aria-labelledby="hero-title"
      className="relative flex min-h-svh flex-col justify-center px-5 py-8 sm:px-10 lg:px-[6.25rem]"
    >
      <div className="w-full">
        {/* Labels above the word: the only way in (each opens sign-in with that role). */}
        <nav aria-label="Sign in as" className="relative z-20 flex items-center justify-between gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <Link href="/signin?role=doctor" data-testid="nav-doctor" className={linkCls}>
            Doctor
          </Link>
          <Link href="/signin?role=patient" data-testid="nav-patient" className={`${linkCls} sm:justify-self-center`}>
            Patient
          </Link>
          <div className="flex items-center justify-self-end gap-2 sm:gap-4">
            <Link href="/signin?role=pharma" data-testid="nav-pharma" className={linkCls}>
              Pharma
            </Link>
            <ThemeToggle className="size-11 rounded-full" />
          </div>
        </nav>

        <div className="py-4 sm:py-6">
          <Wordmark comp={WIDE} className="hidden sm:block" progress={scrollYProgress} still={still} />
          <Wordmark comp={TALL} className="sm:hidden" progress={scrollYProgress} still={still} />
        </div>

        {/* Labels below the word carry the headline. */}
        <h1 id="hero-title" className="relative z-10 flex flex-col gap-1 text-[clamp(1rem,1.4vw,1.15rem)] leading-snug sm:flex-row sm:justify-between">
          <span>The doctor speaks once.</span>
          <span className="sm:text-right">{BRAND.name} carries it all the way home.</span>
        </h1>
      </div>
    </section>
  );
}
