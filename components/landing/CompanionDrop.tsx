"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

import { useMounted } from "@/components/useMounted";

import { Drop } from "./Drop";

// The drop that follows you down the page (reference continuity device): it
// takes a new pose in each section. Transform + opacity only (60 fps). Desktop
// only, so it never covers phone text; hidden with reduced motion.
const POSES: Record<string, { x: number; y: number; s: number; r: number }> = {
  people: { x: 80, y: 24, s: 0.4, r: -24 },
  story: { x: 38, y: 34, s: 0.3, r: 12 },
  what: { x: 47, y: 46, s: 0.24, r: 40 },
  why: { x: 84, y: 62, s: 0.34, r: -8 },
};
const ORDER = ["people", "what", "story", "why"] as const;

export function CompanionDrop() {
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const { scrollY } = useScroll();
  const [stops, setStops] = useState<number[] | null>(null);

  useEffect(() => {
    const measure = () => {
      const tops = ORDER.map((id) => {
        const el = document.getElementById(id);
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
      });
      setStops(tops.every((t, i) => i === 0 || t > tops[i - 1]) ? tops : null);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const input = stops ?? [1, 2, 3, 4];
  const pose = (k: "x" | "y" | "s" | "r") => ORDER.map((id) => POSES[id][k]);
  const x = useTransform(scrollY, input, pose("x").map((v) => `${v}vw`));
  const y = useTransform(scrollY, input, pose("y").map((v) => `${v}vh`));
  const scale = useTransform(scrollY, input, pose("s"));
  const rotate = useTransform(scrollY, input, pose("r"));
  const opacity = useTransform(scrollY, [input[0] - 600, input[0] - 200], [0, 1]);

  if (reduce || !stops) return null;
  return (
    <motion.div
      aria-hidden
      style={{ x, y, scale, rotate, opacity }}
      className="pointer-events-none fixed top-0 left-0 z-30 hidden w-[26rem] origin-top-left will-change-transform lg:block"
    >
      <Drop />
    </motion.div>
  );
}
