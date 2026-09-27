"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { usePillMode } from "./mode";

// The 3D pill travels with the page: big over the hero wordmark, then into
// margins and gaps, and beside the story panel where it splits, reassembles
// and glows. Transform + opacity only on the container; the WebGL buffer
// stays one fixed size (never upscaled). Phones: hero only, then it rests.

const PillCanvas = dynamic(() => import("./PillCanvas"), { ssr: false, loading: () => <StaticPill /> });

export function StaticPill({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, no optimization needed
  return <img src="/echo-pill.svg" alt="" aria-hidden className={className ?? "h-full w-full"} draggable={false} />;
}

type Pose = { x: number; y: number; s: number }; // x, y as viewport fractions of the pill's center
const DESKTOP: Record<string, Pose> = {
  top: { x: 0.56, y: 0.47, s: 1 },
  people: { x: 0.84, y: 0.36, s: 0.42 },
  what: { x: 0.5, y: 0.52, s: 0.3 },
  story: { x: 0.34, y: 0.2, s: 0.5 },
  storyEnd: { x: 0.34, y: 0.2, s: 0.5 },
  why: { x: 0.9, y: 0.72, s: 0.34 },
};
// "storyEnd" holds the story pose until the story has scrolled past, so the
// pill stays beside the panel while it splits, reassembles and glows.
const ORDER = ["top", "people", "what", "story", "storyEnd", "why"] as const;
const BOX = 640; // px, the canvas box at scale 1

export function TravelingPill() {
  const mode = usePillMode();
  const { scrollY } = useScroll();
  const [m, setM] = useState<{ stops: number[]; vw: number; vh: number } | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const measure = () => {
      const topOf = (id: string) => {
        const el = document.getElementById(id);
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
      };
      const stops = ORDER.map((id) => {
        if (id === "storyEnd") {
          const el = document.getElementById("story");
          return el ? topOf("story") + el.offsetHeight - window.innerHeight * 1.2 : 0;
        }
        return Math.max(0, topOf(id) - window.innerHeight * 0.2);
      });
      stops[0] = 0;
      if (stops.every((t, i) => i === 0 || t > stops[i - 1])) setM({ stops, vw: window.innerWidth, vh: window.innerHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const desktop = (m?.vw ?? 1440) >= 1024;
  const box = desktop ? BOX : Math.min(BOX, (m?.vw ?? 390) * 0.9);
  const input = m?.stops ?? ORDER.map((_, i) => i);
  const poses = ORDER.map((k) => (desktop ? DESKTOP[k] : { ...DESKTOP.top, x: 0.5, y: 0.47, s: 1 }));
  const vw = m?.vw ?? 1440;
  const vh = m?.vh ?? 900;
  const x = useTransform(scrollY, input, poses.map((p) => p.x * vw - (box * p.s) / 2));
  const y = useTransform(scrollY, input, poses.map((p) => p.y * vh - (box * p.s) / 2));
  const scale = useTransform(scrollY, input, poses.map((p) => p.s));
  // Phones: the pill belongs to the hero; it fades out as the page moves on.
  const opacity = useTransform(scrollY, desktop ? [0, 1] : [0, vh * 0.55], desktop ? [1, 1] : [1, 0]);
  useMotionValueEvent(opacity, "change", (v) => setVisible((cur) => (cur === v > 0.02 ? cur : v > 0.02)));

  if (mode !== "3d" || !m) return null;
  return (
    <motion.div
      aria-hidden
      style={{ x, y, scale, opacity, width: box, height: box }}
      className="pointer-events-none fixed top-0 left-0 z-30 origin-top-left will-change-transform"
    >
      <motion.div
        className="h-full w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <PillCanvas active={visible} />
      </motion.div>
    </motion.div>
  );
}
