"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { setDemoRole, type DemoRole } from "@/components/role";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { Reveal } from "./motion";
import { PortalPreview } from "./mockups";

const MotionLink = motion.create(Link);

const TILES: { role: DemoRole; href: string; title: string; sub: string; wide?: boolean; dark?: boolean }[] = [
  { role: "doctor", href: "/doctor", title: "Doctor", sub: "Speak once, approve once", wide: true },
  { role: "patient", href: `/patient/${MARIA_ID}`, title: "Patient & family", sub: "Maria in Spanish, Ana in English" },
  { role: "pharma", href: "/pharma", title: "Pharma", sub: "Scripts rescued, audited", dark: true },
];

/** Gallery-style tiles into the three portals. */
export function Portals() {
  return (
    <section aria-labelledby="portals-title" className="px-3 pb-[clamp(5rem,12vh,8rem)] sm:px-3">
      <h2 id="portals-title" className="sr-only">
        The three portals
      </h2>
      <div className="grid gap-3 md:grid-cols-4">
        {TILES.map((t, i) => (
          <Reveal key={t.role} delay={i * 0.06} className={cn(t.wide ? "md:col-span-2" : "md:col-span-1", i === 0 && "md:row-span-1")}>
            <MotionLink
              href={t.href}
              onClick={() => setDemoRole(t.role)}
              data-testid={`portal-${t.role}`}
              whileHover={{ y: -6, scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "group relative flex aspect-[4/3] flex-col overflow-hidden rounded-lg p-6 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none md:aspect-auto md:h-[26rem]",
                t.dark ? "bg-[#0e131a] text-[#e3e8ef]" : "bg-[var(--slate-pale)]"
              )}
            >
              <div className="grid flex-1 place-items-center">
                <PortalPreview kind={t.role} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xl">{t.title}</p>
                  <p className={cn("text-sm", t.dark ? "text-[#b3bdcc]" : "text-muted-foreground")}>{t.sub}</p>
                </div>
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-full border transition-transform duration-200 group-hover:rotate-45", t.dark ? "border-[#e3e8ef]/40" : "border-foreground/30")}>
                  <ArrowUpRight aria-hidden className="size-5" />
                </span>
              </div>
            </MotionLink>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
