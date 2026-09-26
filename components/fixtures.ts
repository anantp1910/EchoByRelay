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
  Message,
  Patient,
  PrescriptionStatus,
} from "@/lib/db/types";
import type { PaRes } from "@/lib/api/contracts";
import { ANA_ID, DEMO_DRUG, DEMO_PRESCRIBER, MARIA_ID, MARIA_PLAN_ID } from "@/lib/demo/constants";

import { PROGRAM } from "./labels";

const fx = (n: number) => `f1c70000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Maria's demo prescription id (fixture-only; the real one is created live by intake). */
export const FIXTURE_MARIA_RX_ID = fx(1);

// Fixed timestamps (demo day 0), never Date.now() — keeps renders deterministic.
const T0 = "2026-09-26T14:02:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

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
  on_drug_before: true,
  conditions: ["type 2 diabetes", "heart failure"],
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
  /** Latest prescription; null when the patient has none yet. */
  rxId?: string | null;
  drug: string | null;
  status: PrescriptionStatus | null;
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
    status: "approved",
    title: `Recommended: ${PROGRAM.bridge.label}`,
    detail: "Free 30-day supply ships today while the PA is reviewed. No cost to the patient.",
    simulated: false,
    data: { action: "enroll", program: "bridge", rxId: FIXTURE_MARIA_RX_ID },
  }),
  event(14, {
    agent: "paDrafter",
    status: "needs_approval",
    title: "PA ready for review",
    detail: "Drafted from the FDA label with 3 citation(s) · template.",
    simulated: true,
    data: { action: "submit_pa", rxId: FIXTURE_MARIA_RX_ID, paRequestId: fx(401) },
  }),
];

// ---------------------------------------------------------------------------
// PA letter (offline stand-in for GET /api/pa/[rxId]; same shape as the drafter)
// ---------------------------------------------------------------------------

const DAILYMED_JARDIANCE =
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1782b947-4a72-4feb-a488-1469d9af82bd";

export const FIXTURE_PA: PaRes = {
  status: "draft",
  letterMd: `## Prior Authorization Request

**To:** Peach State Health Plus (demo) — Pharmacy Benefits, Prior Authorization Department
**Re:** ${FIXTURE_MARIA.name} · ${DEMO_DRUG.name} ${DEMO_DRUG.dose} daily

**Diagnoses:** type 2 diabetes mellitus; heart failure

**Clinical Rationale:** ${DEMO_DRUG.name} is indicated as an adjunct to diet and exercise to improve glycemic control in adults with type 2 diabetes mellitus [1]. It is also indicated to reduce the risk of cardiovascular death and hospitalization for heart failure in adults with heart failure [2]. The prescribed regimen matches the FDA-approved dosing [3].

**Request:** Please approve ${DEMO_DRUG.name} ${DEMO_DRUG.dose} daily for continued coverage without interruption.

**Sincerely,**

${DEMO_PRESCRIBER.name}
${DEMO_PRESCRIBER.clinic}, ${DEMO_PRESCRIBER.city}`,
  citations: [
    {
      n: 1,
      section: "Indications and Usage",
      quote: "as an adjunct to diet and exercise to improve glycemic control in adults and pediatric patients aged 10 years and older with type 2 diabetes mellitus.",
      url: DAILYMED_JARDIANCE,
    },
    {
      n: 2,
      section: "Indications and Usage",
      quote: "to reduce the risk of cardiovascular death and hospitalization for heart failure in adults with heart failure.",
      url: DAILYMED_JARDIANCE,
    },
    {
      n: 3,
      section: "Dosage and Administration",
      quote: "Recommended dose is 10 mg once daily in the morning, taken with or without food",
      url: DAILYMED_JARDIANCE,
    },
  ],
};

// ---------------------------------------------------------------------------
// Alerts, messages
// ---------------------------------------------------------------------------

/** Alert joined with its patient, for the doctor's inbox. */
export interface AlertRow extends Alert {
  patientId: string | null;
  patientName: string;
  detail: string | null;
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
    patientId: fx(103),
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
