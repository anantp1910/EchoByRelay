"use client";

import { cn } from "@/lib/utils";

import { useMounted } from "./useMounted";

/** Viewer's local time, rendered after mount so server and client HTML match. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useMounted();
  return (
    <time dateTime={iso} className={cn("font-mono text-xs text-muted-foreground tabular", className)}>
      {mounted
        ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
        : null}
    </time>
  );
}
