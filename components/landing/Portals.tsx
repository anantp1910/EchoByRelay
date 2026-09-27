"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { Reveal } from "./motion";
import { PortalPreview } from "./mockups";

const TILES: { role: "doctor" | "patient" | "pharma"; title: string; sub: string; wide?: boolean; dark?: boolean }[] = [
  { role: "doctor", title: "Doctor", sub: "Speak once, approve once", wide: true },
  { role: "patient", title: "Patient & family", sub: "The patient in Spanish, family in English" },
  { role: "pharma", title: "Pharma", sub: "Scripts rescued, audited", dark: true },
];

/** Gallery-style previews of the three portals (sign in from the top). */
export function Portals() {
  return (
    <section aria-labelledby="portals-title" className="px-3 pb-[clamp(5rem,12vh,8rem)] sm:px-3">
      <h2 id="portals-title" className="sr-only">
        The three portals
      </h2>
      <div className="grid gap-3 md:grid-cols-4">
        {TILES.map((t, i) => (
          <Reveal key={t.role} delay={i * 0.06} className={cn(t.wide ? "md:col-span-2" : "md:col-span-1", i === 0 && "md:row-span-1")}>
            <motion.div
              data-testid={`portal-${t.role}`}
              whileHover={{ y: -6, scale: 1.01 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "relative flex aspect-[4/3] flex-col overflow-hidden rounded-lg p-6 md:aspect-auto md:h-[26rem]",
                t.dark ? "bg-[#0e131a] text-[#e3e8ef]" : "bg-[var(--slate-pale)]"
              )}
            >
              <div className="grid flex-1 place-items-center">
                <PortalPreview kind={t.role} />
              </div>
              <div>
                <p className="text-xl">{t.title}</p>
                <p className={cn("text-sm", t.dark ? "text-[#b3bdcc]" : "text-muted-foreground")}>{t.sub}</p>
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
