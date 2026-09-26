// De-identification for the pharma views: no names, no full ZIP codes.
// Patients become a short stable tag; location is state + 3-digit ZIP prefix
// (HIPAA safe-harbor style).

/** Stable 3-char tag from the patient id (FNV-1a), e.g. "#4F2". */
export function patientTag(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `#${((h >>> 0) % 0xfff).toString(16).toUpperCase().padStart(3, "0")}`;
}

// ZIP3 prefix ranges → state, for the states our synthetic patients live in.
const ZIP3_STATE: [number, number, string][] = [
  [300, 319, "GA"],
  [398, 399, "GA"],
  [320, 349, "FL"],
  [350, 369, "AL"],
  [290, 299, "SC"],
  [370, 385, "TN"],
];

/** "GA 398xx", or "ZIP unknown". */
export function coarseLocation(zip: string | null | undefined): string {
  const z3 = zip?.trim().slice(0, 3);
  if (!z3 || !/^\d{3}$/.test(z3)) return "ZIP unknown";
  const n = Number(z3);
  const state = ZIP3_STATE.find(([lo, hi]) => n >= lo && n <= hi)?.[2];
  return `${state ? `${state} ` : ""}${z3}xx`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces a patient's full and first name in free text with their tag. */
export function redactName(text: string, name: string | null | undefined, tag: string): string {
  if (!name) return text;
  const parts = [name, name.split(" ")[0]].filter((p) => p.length > 1);
  return parts.reduce((t, p) => t.replace(new RegExp(`\\b${escapeRe(p)}\\b`, "gi"), `Patient ${tag}`), text);
}
