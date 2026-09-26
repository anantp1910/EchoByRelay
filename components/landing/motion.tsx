"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Motion for the landing. MotionConfig reducedMotion="user" (Providers) makes
// every transform here instant for reduced-motion users (only opacity fades
// remain), and keeps SSR and hydration identical.

const EASE = [0.22, 1, 0.36, 1] as const;

/** Headline that rises in word by word (~60 ms stagger) on load. */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <motion.span
      className={cn("block", className)}
      initial="hidden"
      animate="shown"
      transition={{ staggerChildren: 0.06, delayChildren: 0.1 }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "0.6em", opacity: 0 },
              shown: { y: 0, opacity: 1, transition: { duration: 0.7, ease: EASE } },
            }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </motion.span>
  );
}

/** Fades up once when it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "p";
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 to `to` when scrolled into view (~900 ms); instant with reduced motion. */
export function CountUpInView({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(to);
      return;
    }
    const c = animate(mv, to, { duration: 0.9, ease: "easeOut" });
    return () => c.stop();
  }, [inView, reduce, mv, to]);

  return (
    <span ref={ref} className={className}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">
        {to}
        {suffix}
      </span>
    </span>
  );
}

const pill: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1 },
  press: { scale: 0.97 },
};
const sweep: Variants = {
  rest: { scaleX: 0 },
  hover: { scaleX: 1, transition: { duration: 0.35, ease: EASE } },
};
const label: Variants = {
  rest: { color: "var(--color-foreground)" },
  hover: { color: "var(--color-background)", transition: { duration: 0.2 } },
};
const arrow: Variants = {
  rest: { x: 0 },
  hover: { x: 4, transition: { duration: 0.25, ease: EASE } },
};

/** Outline pill: ink sweeps in from the left on hover, arrow nudges right, press scales down. */
export function InkPill({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <motion.a
      href={href}
      data-testid={testId}
      variants={pill}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
      whileTap="press"
      className="relative inline-flex min-h-12 items-center overflow-hidden rounded-full border border-foreground px-7 text-[0.8rem] font-medium tracking-[0.12em] uppercase focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <motion.span aria-hidden variants={sweep} className="absolute inset-0 origin-left bg-foreground" />
      <motion.span variants={label} className="relative inline-flex items-center gap-3">
        {children}
        <motion.span variants={arrow} className="inline-flex">
          <ArrowRight aria-hidden className="size-4" />
        </motion.span>
      </motion.span>
    </motion.a>
  );
}
