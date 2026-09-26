"use client";


import { BRAND } from "@/components/brand";

import { usePillMode } from "./pill/mode";
import { StaticPill } from "./pill/TravelingPill";

/** Steel footer; the Echo pill rests across its top edge. */
export function Footer() {
  // The 3D pill ends its journey here; show the static one only without it.
  const mode = usePillMode();
  return (
    <footer className="relative mt-24 bg-[var(--steel)] text-white">
      {mode === "static" && <StaticPill className="pointer-events-none absolute -top-24 right-[8%] w-40 sm:w-56" />}
      <div className="flex min-h-[14rem] flex-col justify-end gap-6 px-5 py-12 sm:px-10 lg:px-[6.25rem]">
        <p className="font-wordmark text-5xl tracking-wide">
          {BRAND.name.toUpperCase()} <span className="font-sans text-base tracking-normal text-white/85">by {BRAND.maker}</span>
        </p>
        <p className="text-sm text-white/85">Synthetic data only · built at HackGT 13</p>
      </div>
    </footer>
  );
}
