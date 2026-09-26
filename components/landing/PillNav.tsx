"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

// Floating segmented pill (reference pattern): appears once the hero is behind you.
const ITEMS = [
  { href: "#story", label: "The story" },
  { href: "#people", label: "The people", hideSm: true },
  { href: "#why", label: "Why" },
];

export function PillNav() {
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => {
    const next = v > window.innerHeight * 0.75;
    setShow((s) => (s === next ? s : next));
  });

  const shape =
    "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-3.5 text-sm transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none sm:px-6";
  const btn = `${shape} bg-[var(--muted)] text-foreground hover:bg-[var(--accent)]`;
  const primary = `${shape} bg-foreground text-background hover:bg-foreground/85`;

  return (
    <AnimatePresence>
      {show && (
        <motion.nav
          aria-label="Sections"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/70 bg-white/60 p-1 shadow-[0_10px_30px_-12px_rgba(40,48,64,0.35)] backdrop-blur-md dark:border-white/10 dark:bg-[#141b24]/70"
        >
          {ITEMS.map((i) => (
            <a key={i.href} href={i.href} className={`${btn} ${i.hideSm ? "hidden sm:inline-flex" : ""}`}>
              {i.label}
            </a>
          ))}
          <Link href="/signin" className={primary} data-testid="pill-signin">
            Sign in
          </Link>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
