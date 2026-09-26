import { DEMO_PRESCRIBER } from "@/lib/demo/constants";

/** "Dr. Ruth Calhoun, MD" -> "Dr. Calhoun" (derived, never hardcoded). */
export function prescriberShortName(): string {
  const parts = DEMO_PRESCRIBER.name.replace(/,.*$/, "").trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : parts.join(" ");
}
