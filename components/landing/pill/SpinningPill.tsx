"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

import { usePillMode } from "./mode";
import { StaticPill } from "./TravelingPill";

const SpinningCanvas = dynamic(() => import("./SpinningCanvas"), { ssr: false, loading: () => <StaticPill /> });

/**
 * Interactive, always-spinning pill (lazy WebGL); static art for reduced
 * motion / no WebGL. `glow` adds a breathing teal halo behind it; `big` frames
 * the pill closer so it fills its box.
 */
export function SpinningPill({ className, glow = false, big = false }: { className?: string; glow?: boolean; big?: boolean }) {
  const mode = usePillMode();
  return (
    <div className={cn("relative", className)} data-testid="spinning-pill">
      {glow && <span aria-hidden className="pill-halo pointer-events-none absolute inset-[12%] rounded-full" />}
      <div className="relative h-full w-full">
        {mode === "3d" ? <SpinningCanvas distance={big ? 5 : 6.2} /> : mode === "static" ? <StaticPill /> : null}
      </div>
    </div>
  );
}
