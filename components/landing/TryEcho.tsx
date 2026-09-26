"use client";

import Link from "next/link";

import { BRAND } from "@/components/brand";

import { CountUpInView, Magnetic, Reveal } from "./motion";

const SPONSORS = ["Impiricus", "Medvantx", "Visa", "xAI Grok", "Meta", "Aramco"];

/** Why it matters + try the demo: the reference's "contact" block, our content. */
export function TryEcho() {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-24 px-5 pb-[clamp(6rem,14vh,10rem)] sm:px-10 lg:px-[6.25rem]">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-10">
        <Reveal>
          <div className="flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-lg bg-[#1f2530] p-8 text-[#e3e8ef] sm:p-10">
            <p className="text-sm tracking-[0.14em] text-[#b3bdcc] uppercase">Why it matters</p>
            <p className="mt-3 font-[family-name:var(--font-figtree)] text-[clamp(5rem,12vw,10rem)] leading-[0.85] font-light tracking-[-0.04em]">
              <CountUpInView to={29} suffix="%" />
            </p>
            <p className="mt-4 max-w-sm text-lg leading-snug">Almost a third of new branded prescriptions never reach the patient.</p>
          </div>
        </Reveal>
        <Reveal delay={0.08} className="flex flex-col justify-center">
          <h2 id="why-title" className="font-[family-name:var(--font-figtree)] text-[clamp(2.6rem,4.4vw,3.6rem)] leading-[1.02] font-normal tracking-[-0.015em]">
            Try {BRAND.name}
          </h2>
          <p className="mt-6 text-base text-muted-foreground">Demo sign-in · no real accounts</p>
          <div className="mt-6">
            <Magnetic>
              <Link
                href="/signin"
                data-testid="try-signin"
                className="inline-flex min-h-12 items-center rounded-full bg-foreground px-7 text-base text-background transition-transform duration-200 active:scale-[0.97] focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Sign in to {BRAND.name}
              </Link>
            </Magnetic>
          </div>
          <p className="mt-10 max-w-xl text-sm leading-relaxed text-muted-foreground" data-testid="honesty-line">
            The insurer and Medvantx are simulated with shapes that mirror the real systems. All patient data is synthetic.
            Clinical content comes only from the FDA drug label.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs tracking-[0.12em] text-muted-foreground uppercase" aria-label="Sponsors">
            {SPONSORS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
