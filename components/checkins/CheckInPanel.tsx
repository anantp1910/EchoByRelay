"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Language } from "@/lib/db/types";

// Check-in tab: a panel that slides in from the left and, when closed with X
// (or Escape / backdrop), slides out to the right. Modal: focus moves in,
// Escape closes, focus returns to the opener, page behind doesn't scroll.
// With reduced motion, MotionConfig makes the slide instant (fade only).

const EASE = [0.22, 1, 0.36, 1] as const;

export function CheckInPanel({
  open,
  onClose,
  lang,
  returnFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Element to focus after closing (the tab that opened the panel). */
  returnFocus?: React.RefObject<HTMLElement | null>;
  lang: Language;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Captured now (the ref may change before cleanup runs).
    const back = (returnFocus?.current ?? document.activeElement) as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, [open, onClose, returnFocus]);

  const title = lang === "es" ? "Registro" : "Check-in";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" data-testid="checkin-panel-root">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[#0e131a]/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-panel-title"
            data-testid="checkin-panel"
            lang={lang}
            className="absolute inset-y-0 left-0 flex w-full max-w-xl flex-col bg-background shadow-[30px_0_80px_-40px_rgba(14,19,26,0.6)]"
            // Enter from the left; leave toward the right.
            initial={{ x: "-100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.5, ease: EASE } }}
            exit={{ x: "110vw", opacity: 0.4, transition: { duration: 0.55, ease: EASE } }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
              <h2 id="checkin-panel-title" className="flex items-center gap-2 text-xl font-normal">
                <ClipboardCheck aria-hidden className="size-5 text-[var(--echo-accent)]" /> {title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={lang === "es" ? "Cerrar registro" : "Close check-in"}
                data-testid="checkin-panel-close"
                className="grid size-11 place-items-center rounded-full bg-muted transition-transform duration-200 hover:rotate-90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6 text-lg sm:px-7">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** The Check-in tab button (rail + phone top bar), with a "due" marker. */
export function CheckInTab({
  onOpen,
  due,
  overdue,
  lang,
  compact = false,
}: {
  onOpen: (tab: HTMLButtonElement) => void;
  due: boolean;
  overdue: boolean;
  lang: Language;
  compact?: boolean;
}) {
  const label = lang === "es" ? "Registro" : "Check-in";
  const status = overdue ? (lang === "es" ? "atrasado" : "overdue") : due ? (lang === "es" ? "pendiente" : "due") : null;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      data-testid={compact ? "checkin-tab-mobile" : "checkin-tab"}
      className={
        compact
          ? "relative inline-flex min-h-11 items-center gap-2 rounded-full bg-muted px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          : "relative flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-[1.05rem] text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      }
    >
      <ClipboardCheck aria-hidden className="size-5 text-[var(--echo-accent)]" />
      {label}
      {status && (
        <span
          className={
            overdue
              ? "ml-auto rounded-full border border-risk/40 bg-risk-soft px-2 text-xs leading-5 text-risk-strong"
              : "ml-auto rounded-full bg-[var(--echo-accent)] px-2 text-xs leading-5 text-white dark:text-[#0e131a]"
          }
        >
          {status}
        </span>
      )}
    </button>
  );
}
