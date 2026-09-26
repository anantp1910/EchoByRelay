"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "intro", label: "Intro" },
  { id: "journey", label: "Journey" },
  { id: "signin", label: "Sign in" },
  { id: "why", label: "Why it matters" },
];

/** Gutter index: hairline + ring on the section in view. Desktop only. */
export function SectionIndex() {
  const [active, setActive] = useState("intro");

  useEffect(() => {
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <nav aria-label="Sections" className="sticky top-[38vh] hidden lg:block">
      <ol className="relative border-l border-line">
        {ITEMS.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 -left-[5px] size-[9px] -translate-y-1/2 rounded-full border transition-colors duration-200",
                  on ? "border-foreground bg-card" : "border-transparent bg-transparent"
                )}
              />
              <a
                href={`#${item.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded pl-5 text-[0.8rem] transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
