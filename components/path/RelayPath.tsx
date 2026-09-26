"use client";

import { motion, useReducedMotion, type MotionValue } from "framer-motion";

import { cn } from "@/lib/utils";
import { useMounted } from "@/components/useMounted";

/**
 * The Relay Path: a thin luminous stroke. `progress` (0–1 MotionValue) draws
 * it from scroll; otherwise it draws once on mount (`drawMs`). Reduced motion
 * renders it fully drawn. Purely decorative: always aria-hidden.
 */
export function GlowPath({
  d,
  progress,
  drawMs = 900,
  width = 2,
  className,
}: {
  d: string;
  progress?: MotionValue<number>;
  drawMs?: number;
  width?: number;
  className?: string;
}) {
  // Gate on mount: the media query isn't known during SSR/hydration.
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const common = {
    d,
    fill: "none",
    stroke: "var(--color-glow)",
    strokeWidth: width,
    strokeLinecap: "round" as const,
  };
  if (reduce) return <path {...common} className={cn("relay-glow", className)} aria-hidden />;
  if (progress) return <motion.path {...common} style={{ pathLength: progress }} className={cn("relay-glow", className)} aria-hidden />;
  return (
    <motion.path
      {...common}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: drawMs / 1000, ease: "easeInOut" }}
      className={cn("relay-glow", className)}
      aria-hidden
    />
  );
}

/** A glowing node on the path. `state` sets how lit it is. */
export function PathNode({
  cx,
  cy,
  state,
  r = 7,
}: {
  cx: number;
  cy: number;
  state: "done" | "active" | "upcoming";
  r?: number;
}) {
  return (
    <g aria-hidden>
      {state === "active" && (
        <circle cx={cx} cy={cy} r={r * 2.4} fill="var(--color-glow)" opacity={0.18} className="transition-opacity duration-200" />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={state === "upcoming" ? "var(--color-background)" : "var(--color-glow)"}
        stroke={state === "upcoming" ? "var(--color-muted-foreground)" : "var(--color-glow)"}
        strokeWidth={2}
        className={cn("transition-colors duration-200", state !== "upcoming" && "relay-glow")}
      />
    </g>
  );
}
