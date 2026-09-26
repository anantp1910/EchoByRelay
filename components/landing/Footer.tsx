"use client";

import Link from "next/link";

import { BRAND } from "@/components/brand";
import { MARIA_ID } from "@/lib/demo/constants";

import { Drop } from "./Drop";

/** Steel footer; the Echo drop rests across its top edge. */
export function Footer() {
  const links = [
    { href: "/signin", label: "Sign in" },
    { href: "/doctor", label: "Doctor" },
    { href: `/patient/${MARIA_ID}`, label: "Patient" },
    { href: "/pharma", label: "Pharma" },
  ];
  return (
    <footer className="relative mt-24 bg-[var(--steel)] text-white">
      <Drop className="pointer-events-none absolute -top-28 right-[8%] w-44 sm:w-60" />
      <div className="flex min-h-[18rem] flex-col justify-between gap-10 px-5 py-12 sm:px-10 lg:px-[6.25rem]">
        <p className="font-wordmark text-5xl tracking-wide">
          {BRAND.name.toUpperCase()} <span className="font-sans text-base tracking-normal text-white/85">by {BRAND.maker}</span>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 text-sm tracking-[0.08em] uppercase">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center rounded text-white/90 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
