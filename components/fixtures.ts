// UI fixtures for Person B's pages. Used when Supabase keys are missing (and as
// placeholder content until the engine is wired). Typed with the real contract
// from lib/db/types.ts so they can't drift from the DB shapes.
//
// Synthetic data only. Maria + Ana come from lib/demo/constants.ts; the other
// doctor-list patients exist only here (the minimal seed only has Maria/Ana).
// Fixture-only row IDs use the f1c7... prefix (valid hex, passes z.guid()) so they're easy to spot.

import type {
  AgentEvent,
  Alert,
  CareCircleMember,
  EnrollmentProgram,
  Message,
  Patient,
  PrescriptionStatus,
} from "@/lib/db/types";
import { ANA_ID, DEMO_DRUG, MARIA_ID, MARIA_PLAN_ID } from "@/lib/demo/constants";

const fx = (n: number) => `f1c70000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Maria's demo prescription id (fixture-only; the real one is created live by intake). */
export const FIXTURE_MARIA_RX_ID = fx(1);

// Fixed timestamps (demo day 0), never Date.now() — keeps renders deterministic.
const T0 = "2026-09-26T14:02:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const PROGRAM_LABEL: Record<EnrollmentProgram, string> = {
  bridge: "Medvantx Bridge",
  quick_start: "Medvantx Quick Start",
  pap: "Patient Assistance Program",
  cash_pay: "Medvantx Cash Pay",
  retail_copay_card: "Retail + copay card",
};
export function programLabel(p: EnrollmentProgram): string {
  return PROGRAM_LABEL[p];
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export const FIXTURE_MARIA: Patient = {
  id: MARIA_ID,
  name: "Maria González",
  language: "es",
  zip: "39840",
  rural: true,
  insured: true,
  plan_id: MARIA_PLAN_ID,
  income_band: "above_pap",
  on_drug_before: false,
  is_seed: true,
  created_at: T0,
};

export const FIXTURE_ANA: CareCircleMember = {
  id: ANA_ID,
  patient_id: MARIA_ID,
  name: "Ana González",
  relation: "daughter",
  can_pay: true,
  is_seed: true,
  created_at: T0,
};

/** Doctor's "today" list: patient + current Rx summary. */
export interface PatientRow {
  patient: Pick<Patient, "id" | "name" | "language" | "rural">;
  drug: string;
  status: PrescriptionStatus;
  note: string;
}

export const FIXTURE_PATIENT_ROWS: PatientRow[] = [
  {
    patient: FIXTURE_MARIA,
    drug: `${DEMO_DRUG.name} ${DEMO_DRUG.dose}`,
    status: "bridge",
    note: "Bridge supply · PA drafted",
  },
  {
    patient: { id: fx(101), name: "James Whitfield", language: "en", rural: true },
    drug: "Entresto 24/26 mg",
    status: "on_therapy",
    note: "Retail · picked up",
  },
  {
    patient: { id: fx(102), name: "Lucía Herrera", language: "es", rural: false },
    drug: "Ozempic 0.25 mg",
    status: "pa_pending",
    note: "Quick Start · PA submitted",
  },
  {
    patient: { id: fx(103), name: "Darnell Brooks", language: "en", rural: true },
    drug: "Eliquis 5 mg",
    status: "at_risk",
    note: "No pickup · day 9",
  },
  {
    patient: { id: fx(104), name: "Hoa Nguyen", language: "en", rural: false },
    drug: "Farxiga 10 mg",
    status: "routing",
    note: "Coverage check",
  },
  {
    patient: { id: fx(105), name: "Ruth Ellison", language: "en", rural: true },
    drug: "Trelegy Ellipta",
    status: "abandoned",
    note: "Declined $610 copay",
  },
];

// ---------------------------------------------------------------------------
// Maria demo timeline (day 0): intake → coverage → router → PA drafter
// ---------------------------------------------------------------------------

function event(
  n: number,
  e: Pick<AgentEvent, "agent" | "status" | "title" | "detail" | "simulated" | "data">
): AgentEvent {
  return {
    id: fx(n),
    rx_id: FIXTURE_MARIA_RX_ID,
    patient_id: MARIA_ID,
    is_seed: false,
    created_at: at(n * 3),
    ...e,
  };
}

export const FIXTURE_MARIA_EVENTS: AgentEvent[] = [
  event(11, {
    agent: "intake",
    status: "done",
    title: "Prescription understood",
    detail: `${DEMO_DRUG.name} ${DEMO_DRUG.dose} ${DEMO_DRUG.frequency} — ${DEMO_DRUG.indication}`,
    simulated: false,
    data: {
      drug: DEMO_DRUG.name,
      dose: DEMO_DRUG.dose,
      frequency: DEMO_DRUG.frequency,
      indication: DEMO_DRUG.indication,
    },
  }),
  event(12, {
    agent: "coverage",
    status: "done",
    title: "Coverage checked: prior authorization required",
    detail: "Tier 3 · $480 copay per month",
    simulated: true,
    data: { paRequired: true, copayUsd: 480, tier: 3 },
  }),
  event(13, {
    agent: "router",
    status: "done",
    title: `Routed to ${programLabel("bridge")}`,
    detail: "Free 30-day supply ships today while the PA is reviewed. No cost to the patient.",
    simulated: true,
    data: { program: "bridge", supplyDays: 30, reasons: ["Insured", "PA required", "Copay above $50"] },
  }),
  event(14, {
    agent: "paDrafter",
    status: "needs_approval",
    title: "PA letter drafted — review and approve",
    detail: "4 citations from the FDA label. Submit to the payer on your approval.",
    simulated: false,
    data: { action: "submit_pa", rxId: FIXTURE_MARIA_RX_ID, citations: 4 },
  }),
];

// ---------------------------------------------------------------------------
// Alerts, messages
// ---------------------------------------------------------------------------

export const ALERT_COPY: Record<Alert["kind"], { title: string; action: string }> = {
  bridge_cliff: { title: "Bridge supply ends soon", action: "Review new path" },
  pa_denied: { title: "Prior authorization denied", action: "Open appeal draft" },
  no_pickup: { title: "Medicine not picked up", action: "Contact patient" },
};

export interface AlertRow extends Alert {
  patientName: string;
  detail: string;
}

export const FIXTURE_ALERTS: AlertRow[] = [
  {
    id: fx(201),
    rx_id: fx(2),
    kind: "no_pickup",
    severity: "warning",
    resolved: false,
    is_seed: true,
    created_at: T0,
    patientName: "Darnell Brooks",
    detail: "Order shipped day 2, not delivered by day 9.",
  },
];

export const FIXTURE_MESSAGES: Message[] = [
  {
    id: fx(301),
    patient_id: MARIA_ID,
    sender: "Relay",
    lang: "es",
    body: `Su doctora le recetó ${DEMO_DRUG.name}. Le enviamos un suministro gratis de 30 días mientras su seguro lo revisa.`,
    is_seed: false,
    created_at: at(50),
  },
  {
    id: fx(302),
    patient_id: MARIA_ID,
    sender: "Relay",
    lang: "en",
    body: `Ana joined Maria's care circle. She'll get updates in English.`,
    is_seed: false,
    created_at: at(80),
  },
];

// ---------------------------------------------------------------------------
// Pharma placeholders (Phase 8 replaces these with /api/pharma/metrics)
// ---------------------------------------------------------------------------

export const FIXTURE_KPIS = {
  scriptsRescued: 41,
  medianDaysToTherapy: 2.5,
  bridgeCliffsCaught: 9,
  pctUnderserved: 58,
} as const;
