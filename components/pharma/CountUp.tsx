"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";

/** Number that counts up to `value` (and re-animates when it changes). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    // ~700 ms by design: the KPI count-up is the pharma scene's payoff on the
    // projector (the one exception to the 150–250 ms motion rule).
    const controls = animate(mv, value, { duration: 0.7, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value, reduce]);

  return <motion.span>{text}</motion.span>;
}
