"use client";

import { ArrowRight, BarChart3, HeartHandshake, Stethoscope, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { setDemoRole, type DemoRole } from "@/components/role";
import { DEMO_PRESCRIBER, MARIA_ID } from "@/lib/demo/constants";

import { prescriberShortName } from "./prescriber";

const ROLES: { role: DemoRole; href: string; who: string; sub: string; icon: LucideIcon }[] = [
  {
    role: "doctor",
    href: "/doctor",
    who: `Doctor · ${prescriberShortName()}`,
    sub: `${DEMO_PRESCRIBER.specialty} · ${DEMO_PRESCRIBER.clinic}`,
    icon: Stethoscope,
  },
  {
    role: "patient",
    href: `/patient/${MARIA_ID}`,
    who: "Patient · Maria / Ana",
    sub: "Maria's phone, in Spanish, and her daughter Ana's view",
    icon: HeartHandshake,
  },
  {
    role: "pharma",
    href: "/pharma",
    who: "Pharma",
    sub: "Scripts rescued, time to therapy, the audit trail",
    icon: BarChart3,
  },
];

/** Demo sign-in: picks a portal. No accounts, no passwords, nothing sent. */
export function DemoSignIn() {
  return (
    <section aria-labelledby="signin-title" className="mx-auto max-w-5xl px-5 py-28 lg:px-8">
      <p className="font-mono text-xs tracking-[0.2em] text-ice-strong uppercase">Demo sign-in · no real accounts</p>
      <h2 id="signin-title" className="mt-4 font-heading text-[clamp(2.25rem,5vw,4rem)] leading-[1.02] font-bold tracking-tight">
        Step onto the path.
      </h2>
      <ul className="mt-12 flex flex-col">
        {ROLES.map(({ role, href, who, sub, icon: Icon }) => (
          <li key={role} className="border-t border-line last:border-b">
            <Link
              href={href}
              onClick={() => setDemoRole(role)}
              data-testid={`signin-${role}`}
              className="group flex min-h-24 items-center gap-5 rounded-lg px-2 py-5 transition-colors duration-200 hover:bg-ice focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none sm:px-4"
            >
              <span className="relative grid size-12 shrink-0 place-items-center rounded-full border border-line bg-background text-primary">
                <span aria-hidden className="absolute inset-0 rounded-full opacity-0 shadow-[0_0_24px_var(--color-glow)] transition-opacity duration-200 group-hover:opacity-100" />
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-heading text-2xl font-bold sm:text-3xl">{who}</span>
                <span className="text-base text-muted-foreground">{sub}</span>
              </span>
              <span className="hidden items-center gap-2 font-medium text-primary sm:inline-flex">
                Continue <ArrowRight aria-hidden className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <ArrowRight aria-hidden className="size-5 text-primary sm:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
