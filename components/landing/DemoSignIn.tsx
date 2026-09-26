"use client";

import { motion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { setDemoRole, type DemoRole } from "@/components/role";
import { DEMO_PRESCRIBER, MARIA_ID } from "@/lib/demo/constants";

import { Reveal } from "./motion";
import { prescriberShortName } from "./prescriber";

const MotionLink = motion.create(Link);

const ROLES: { role: DemoRole; href: string; who: string; sub: string }[] = [
  {
    role: "doctor",
    href: "/doctor",
    who: `Doctor · ${prescriberShortName()}`,
    sub: `${DEMO_PRESCRIBER.specialty} · ${DEMO_PRESCRIBER.clinic}`,
  },
  { role: "patient", href: `/patient/${MARIA_ID}`, who: "Patient · Maria / Ana", sub: "Maria's phone in Spanish, and her daughter Ana's view" },
  { role: "pharma", href: "/pharma", who: "Pharma", sub: "Scripts rescued, time to therapy, the full audit trail" },
];

const EASE = [0.22, 1, 0.36, 1] as const;
const line: Variants = { rest: { scaleX: 0 }, hover: { scaleX: 1, transition: { duration: 0.45, ease: EASE } } };
const circle: Variants = {
  rest: { rotate: -45, backgroundColor: "rgba(0,0,0,0)", color: "var(--color-foreground)" },
  hover: {
    rotate: 0,
    backgroundColor: "var(--color-foreground)",
    color: "var(--color-background)",
    transition: { duration: 0.3, ease: EASE },
  },
};

/** Demo sign-in: picks a portal. No accounts, no passwords, nothing sent. */
export function DemoSignIn() {
  return (
    <section id="signin" aria-labelledby="signin-title" className="scroll-mt-8 pt-[clamp(7rem,16vh,11rem)] pb-[clamp(4rem,9vh,6rem)]">
      <Reveal>
        <p className="text-[0.8rem] font-medium tracking-[0.08em] uppercase">Demo sign-in · no real accounts</p>
        <h2 id="signin-title" className="mt-6 text-[clamp(2.4rem,4.6vw,4.25rem)] leading-[1.04] font-medium tracking-[-0.03em]">
          Step onto the path.
        </h2>
      </Reveal>
      <ul className="mt-16 border-t border-line">
        {ROLES.map(({ role, href, who, sub }, i) => (
          <li key={role} className="relative border-b border-line">
            <MotionLink
              href={href}
              onClick={() => setDemoRole(role)}
              data-testid={`signin-${role}`}
              initial="rest"
              animate="rest"
              whileHover="hover"
              whileFocus="hover"
              className="grid min-h-28 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 py-6 focus-visible:outline-none sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-8"
            >
              <span className="font-mono text-sm text-muted-foreground tabular">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block text-[clamp(1.5rem,2.6vw,2.25rem)] leading-tight font-medium tracking-[-0.02em]">{who}</span>
                <span className="mt-1 block text-base text-muted-foreground">{sub}</span>
              </span>
              <motion.span
                variants={circle}
                className="grid size-12 place-items-center rounded-full border border-foreground sm:size-14"
              >
                <ArrowRight aria-hidden className="size-5" />
              </motion.span>
              {/* Hairline extends under the row on hover/focus. */}
              <motion.span aria-hidden variants={line} className="absolute right-0 -bottom-px left-0 h-px origin-left bg-foreground" />
            </MotionLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
