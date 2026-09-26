import { createHash } from "node:crypto";

/** Stable UUID for a logical demo operation, enforced by existing primary keys. */
export function operationId(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join(":" )).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
