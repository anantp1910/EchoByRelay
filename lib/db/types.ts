// TypeScript mirror of supabase/schema.sql.
//
// For every enum-ish column we export a const array (so Person B can map
// colors / iterate values) plus a union type derived from it. Table row types
// match the SQL columns 1:1, including nullability.
//
// Contract file — see CLAUDE.md hard rule #11: fields here change only with a
// team-chat heads-up; never rename or remove a field without one.

// ---------------------------------------------------------------------------
// Enum value arrays + derived unions
// ---------------------------------------------------------------------------

export const LANGUAGES = ["es", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const INCOME_BANDS = ["low", "mid", "above_pap"] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export const PRESCRIPTION_STATUSES = [
  "new",
  "routing",
  "bridge",
  "pa_pending",
  "on_therapy",
  "at_risk",
  "abandoned",
] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

// Medvantx programs the router can pick. Also used as prescriptions.program.
export const ENROLLMENT_PROGRAMS = [
  "bridge",
  "quick_start",
  "pap",
  "cash_pay",
  "retail_copay_card",
] as const;
export type EnrollmentProgram = (typeof ENROLLMENT_PROGRAMS)[number];

export const ENROLLMENT_STATUSES = ["active", "ended", "cancelled"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const PA_STATUSES = ["draft", "submitted", "approved", "denied"] as const;
export type PaStatus = (typeof PA_STATUSES)[number];

export const ORDER_STATUSES = ["created", "paid", "shipped", "delivered"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["created", "succeeded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ALERT_KINDS = ["bridge_cliff", "pa_denied", "no_pickup", "escalation"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const AGENT_EVENT_STATUSES = [
  "running",
  "done",
  "blocked",
  "needs_approval",
  "approved",
  "rejected",
] as const;
export type AgentEventStatus = (typeof AGENT_EVENT_STATUSES)[number];

// Generic JSON value for jsonb columns.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

// ---------------------------------------------------------------------------
// Table row types
// ---------------------------------------------------------------------------

export interface Patient {
  id: string;
  name: string;
  language: Language;
  zip: string | null;
  rural: boolean;
  insured: boolean;
  plan_id: string | null;
  income_band: IncomeBand | null;
  on_drug_before: boolean;
  conditions: string[];
  /** Backboard thread holding this patient's care-circle notes (null until the first update). */
  backboard_thread_id?: string | null;
  is_seed: boolean;
  created_at: string;
}

export interface CareCircleMember {
  id: string;
  patient_id: string;
  name: string;
  relation: string | null;
  can_pay: boolean;
  lang: Language;
  is_seed: boolean;
  created_at: string;
}

export interface Prescription {
  id: string;
  patient_id: string;
  drug: string;
  dose: string | null;
  frequency: string | null;
  indication: string | null;
  status: PrescriptionStatus;
  program: EnrollmentProgram | null;
  expected_delivery_day: number | null;
  is_seed: boolean;
  created_at: string;
}

export interface CoverageCheck {
  id: string;
  rx_id: string;
  pa_required: boolean;
  copay_usd: number | null;
  tier: number | null;
  is_seed: boolean;
  created_at: string;
}

export interface PaRequest {
  id: string;
  rx_id: string;
  letter_md: string | null;
  citations: Json;
  status: PaStatus;
  decided_at: string | null;
  is_seed: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  rx_id: string;
  program: EnrollmentProgram;
  start_day: number | null;
  end_day: number | null;
  status: EnrollmentStatus;
  is_seed: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  rx_id: string;
  enrollment_id: string | null;
  amount_usd: number | null;
  status: OrderStatus;
  is_seed: boolean;
  created_at: string;
}

export interface PaymentMandate {
  id: string;
  payer_member_id: string | null;
  rx_id: string | null;
  merchant: string | null;
  cap_usd: number | null;
  recurring: boolean;
  passkey_verified: boolean;
  is_seed: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  mandate_id: string | null;
  order_id: string | null;
  amount_usd: number | null;
  visa_ref: string | null;
  status: PaymentStatus;
  is_seed: boolean;
  created_at: string;
}

export interface Alert {
  id: string;
  rx_id: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  resolved: boolean;
  is_seed: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  patient_id: string;
  recipient_member_id: string | null; // null = the patient
  sender: string | null;
  lang: Language;
  body: string;
  is_seed: boolean;
  created_at: string;
}

// Matches the agent_events columns exactly. rx_id nullable, patient_id required.
//
// One row per step. Subscribe to INSERT and UPDATE; a row moves
//   running -> done | blocked | needs_approval -> approved | rejected.
export interface AgentEvent {
  id: string;
  rx_id: string | null;
  patient_id: string;
  agent: string;
  status: AgentEventStatus;
  title: string;
  detail: string | null;
  simulated: boolean;
  data: Json;
  is_seed: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor: string | null;
  action: string;
  payload: Json;
  is_seed: boolean;
  created_at: string;
}

export interface DemoState {
  id: number;
  day: number;
  created_at: string;
}
