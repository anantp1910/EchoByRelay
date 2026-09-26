// Display copy + status tone for every router program and alert kind. Record<>
// over the contract unions: adding a value to ROUTER_PROGRAMS or ALERT_KINDS
// without a label here is a compile error.

import type { RouterProgramLabel } from "@/lib/api/contracts";
import type { AlertKind, AlertSeverity } from "@/lib/db/types";

import type { Tone } from "./StatusPill";

export const PROGRAM: Record<RouterProgramLabel, { label: string; short: string; tone: Tone }> = {
  bridge: { label: "Medvantx Bridge", short: "Bridge", tone: "ok" },
  quick_start: { label: "Medvantx Quick Start", short: "Quick Start", tone: "ok" },
  pap: { label: "Patient Assistance Program", short: "PAP", tone: "ok" },
  cash_pay: { label: "Medvantx Cash Pay", short: "Cash Pay", tone: "pending" },
  retail_copay_card: { label: "Retail + copay card", short: "Copay card", tone: "pending" },
  retail: { label: "Retail pharmacy", short: "Retail", tone: "pending" },
  escalate: { label: "Doctor review needed", short: "Review", tone: "risk" },
};

export function isRouterProgram(v: unknown): v is RouterProgramLabel {
  return typeof v === "string" && v in PROGRAM;
}

export const ALERT: Record<AlertKind, { title: string; action: string; tone: Tone }> = {
  bridge_cliff: { title: "Bridge supply ends soon", action: "Review new path", tone: "risk" },
  pa_denied: { title: "Prior authorization denied", action: "Open appeal draft", tone: "blocked" },
  no_pickup: { title: "Medicine not picked up", action: "Contact patient", tone: "risk" },
  escalation: { title: "Router needs your review", action: "Choose a path", tone: "risk" },
};

/** Critical alerts are red regardless of kind; otherwise the kind's tone. */
export function alertTone(kind: AlertKind, severity: AlertSeverity): Tone {
  return severity === "critical" ? "blocked" : ALERT[kind].tone;
}
