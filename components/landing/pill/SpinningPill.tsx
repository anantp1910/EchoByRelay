"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

import { usePillMode } from "./mode";
import { StaticPill } from "./TravelingPill";

const SpinningCanvas = dynamic(() => import("./SpinningCanvas"), { ssr: false, loading: () => <StaticPill /> });

/** Interactive, always-spinning pill (lazy WebGL); static art for reduced motion / no WebGL. */
export function SpinningPill({ className }: { className?: string }) {
  const mode = usePillMode();
  return (
    <div className={cn("relative", className)} data-testid="spinning-pill">
      {mode === "3d" ? <SpinningCanvas /> : mode === "static" ? <StaticPill /> : null}
    </div>
  );
}
