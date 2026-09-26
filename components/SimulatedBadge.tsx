import { cn } from "@/lib/utils";

/**
 * Marks a mock-backed step or value (payer, Medvantx, Visa, passkey). Mocks
 * mirror the real APIs' shapes, but the UI never lets them pass as real.
 */
export function SimulatedBadge({ label = "Simulated", className }: { label?: string; className?: string }) {
  return (
    <span
      title="Backed by a mock that mirrors the real API"
      data-testid="simulated-badge"
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-line px-1.5 text-[0.7rem] leading-5 font-medium text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
