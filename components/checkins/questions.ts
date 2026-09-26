// Check-in schedule, questions and copy (ES/EN). No medical advice: the only
// instruction we ever give is "call your doctor" for a severe label warning.
//
// Side-effect options are the JARDIANCE label's Warnings and Precautions
// (section 5), reworded in plain language. The label fixture has no Adverse
// Reactions section, so section 5 is the only source. Each option cites its
// subsection. Nothing here adds symptoms the label does not name.

import type { Tone } from "@/components/StatusPill";
import type { Language } from "@/lib/db/types";

import type { CheckInAnswers, CheckInFlag, Feeling, PillsLeft, YesNo } from "./types";

export const CHECKIN_DAYS = [3, 7, 14, 21] as const;
export type CheckInDay = (typeof CHECKIN_DAYS)[number];

export interface SideEffect {
  id: string;
  section: string; // label subsection, e.g. "5.5"
  severe: boolean; // severe → "call your doctor" + severe_symptom flag
  text: Record<Language, string>;
}

export const SIDE_EFFECTS: SideEffect[] = [
  {
    id: "ketoacidosis_signs",
    section: "5.1",
    severe: true,
    // Label: "nausea, vomiting, abdominal pain, generalized malaise, and shortness of breath"
    text: {
      en: "Nausea, vomiting, belly pain, feeling generally unwell, or shortness of breath",
      es: "Náuseas, vómitos, dolor de barriga, malestar general o falta de aire",
    },
  },
  {
    id: "genital_pain_fever",
    section: "5.5",
    severe: true,
    // Label: "pain or tenderness, erythema, or swelling in the genital or perineal area, along with fever or malaise"
    text: {
      en: "Pain, tenderness, redness, or swelling in the genital area, with fever or feeling unwell",
      es: "Dolor, sensibilidad, enrojecimiento o hinchazón en la zona genital, con fiebre o malestar",
    },
  },
  {
    id: "serious_allergic_reaction",
    section: "5.7",
    severe: true,
    // Label: "serious hypersensitivity reactions (e.g., angioedema)"
    text: {
      en: "Serious allergic reaction, such as swelling (angioedema)",
      es: "Reacción alérgica grave, como hinchazón (angioedema)",
    },
  },
  {
    id: "low_blood_pressure",
    section: "5.2",
    severe: false,
    // Label: "volume depletion which may sometimes manifest as symptomatic hypotension"
    text: {
      en: "Low blood pressure or loss of body fluids",
      es: "Presión arterial baja o pérdida de líquidos del cuerpo",
    },
  },
  {
    id: "urinary_infection",
    section: "5.3",
    severe: false,
    // Label: "signs and symptoms of urinary tract infections"
    text: {
      en: "Signs of a urinary tract infection",
      es: "Señales de una infección urinaria",
    },
  },
  {
    id: "low_blood_sugar",
    section: "5.4",
    severe: false,
    // Label: "hypoglycemia" (5.4 names no symptoms, so none are listed here)
    text: {
      en: "Low blood sugar (hypoglycemia)",
      es: "Azúcar baja en la sangre (hipoglucemia)",
    },
  },
  {
    id: "genital_yeast_infection",
    section: "5.6",
    severe: false,
    // Label: "genital mycotic infections"
    text: {
      en: "Genital yeast (fungal) infection",
      es: "Infección genital por hongos",
    },
  },
];

export const SIDE_EFFECT_NONE = "none";
export const SIDE_EFFECT_OTHER = "other";

const SEVERE_IDS = new Set(SIDE_EFFECTS.filter((s) => s.severe).map((s) => s.id));
export const hasSevere = (ids: string[] | undefined) => (ids ?? []).some((id) => SEVERE_IDS.has(id));

/** Deterministic flags from answers (never the LLM). */
export function flagsFor(a: CheckInAnswers): CheckInFlag[] {
  const flags: CheckInFlag[] = [];
  if (a.pillsLeft === "few") flags.push("low_supply");
  if (a.costWorry === "yes") flags.push("cost_concern");
  if (hasSevere(a.sideEffects)) flags.push("severe_symptom");
  return flags;
}

export const FLAG: Record<CheckInFlag, { tone: Tone; text: Record<Language, string> }> = {
  low_supply: { tone: "risk", text: { en: "Low supply", es: "Quedan pocas pastillas" } },
  cost_concern: { tone: "risk", text: { en: "Cost concern", es: "Preocupa el costo" } },
  severe_symptom: { tone: "blocked", text: { en: "Severe symptom", es: "Síntoma grave" } },
};

// ---------------------------------------------------------------------------
// Question copy
// ---------------------------------------------------------------------------

type Choice<T extends string> = { value: T; text: Record<Language, string> };

export const YES_NO: Choice<YesNo>[] = [
  { value: "yes", text: { en: "Yes", es: "Sí" } },
  { value: "no", text: { en: "No", es: "No" } },
];
export const FEELINGS: Choice<Feeling>[] = [
  { value: "good", text: { en: "Good", es: "Bien" } },
  { value: "okay", text: { en: "Okay", es: "Regular" } },
  { value: "bad", text: { en: "Not good", es: "Mal" } },
];
export const PILLS: Choice<PillsLeft>[] = [
  { value: "many", text: { en: "Many", es: "Muchas" } },
  { value: "some", text: { en: "Some", es: "Algunas" } },
  { value: "few", text: { en: "Few", es: "Pocas" } },
];

/** Question text. `self` = the patient answering; `proxy` = a caregiver answering for them. */
export const Q = {
  arrived: {
    en: { self: "Did your medicine arrive?", proxy: (p: string) => `Did ${p}'s medicine arrive?` },
    es: { self: "¿Llegó su medicina?", proxy: (p: string) => `¿Llegó la medicina de ${p}?` },
  },
  takingDaily: {
    en: { self: "Are you taking it every day?", proxy: (p: string) => `Is ${p} taking it every day?` },
    es: { self: "¿La está tomando todos los días?", proxy: (p: string) => `¿${p} la está tomando todos los días?` },
  },
  sideEffects: {
    en: { self: "Have you noticed any of these?", proxy: (p: string) => `Has ${p} noticed any of these?` },
    es: { self: "¿Ha notado alguna de estas cosas?", proxy: (p: string) => `¿${p} ha notado alguna de estas cosas?` },
  },
  feeling: {
    en: { self: "How are you feeling?", proxy: (p: string) => `How is ${p} feeling?` },
    es: { self: "¿Cómo se siente?", proxy: (p: string) => `¿Cómo se siente ${p}?` },
  },
  pillsLeft: {
    en: { self: "How many pills are left?", proxy: () => "How many pills are left?" },
    es: { self: "¿Cuántas pastillas le quedan?", proxy: () => "¿Cuántas pastillas quedan?" },
  },
  costWorry: {
    en: { self: "Are you worried about the cost?", proxy: () => "Is the cost a worry for your family?" },
    es: { self: "¿Le preocupa el costo?", proxy: () => "¿Les preocupa el costo?" },
  },
} satisfies Record<string, Record<Language, { self: string; proxy: (p: string) => string }>>;

export type QuestionKey = keyof typeof Q;

/** Questions asked on each scheduled day. */
export const SCHEDULE: Record<CheckInDay, QuestionKey[]> = {
  3: ["arrived"],
  7: ["takingDaily", "sideEffects"],
  14: ["feeling"],
  21: ["pillsLeft", "costWorry"],
};

export const UI = {
  en: {
    title: (d: number) => `Check-in · Day ${d}`,
    forPatient: (p: string) => `Answering for ${p}`,
    none: "None of these",
    other: "Something else",
    labelRef: (s: string) => `Label ${s}`,
    callDoctor: "Call your doctor",
    callDoctorHint: "This is on the drug label as a serious warning.",
    voiceHint: "Optional: hold to add a voice note",
    voiceNote: "Voice note",
    submit: "Send check-in",
    sending: "Sending…",
    sent: "Sent",
    notSynced: "Not synced yet",
    history: "Check-ins",
    noHistory: "No check-ins yet.",
    answeredBy: (n: string) => `Answered by ${n}`,
    sample: "Sample data",
    dueNudge: (p: string, d: number) => `${p} hasn't answered the Day ${d} check-in yet. You can answer for them.`,
    overdueNudge: (p: string, d: number) => `Overdue: ${p} hasn't answered the Day ${d} check-in. You can answer for them.`,
  },
  es: {
    title: (d: number) => `Registro · Día ${d}`,
    forPatient: (p: string) => `Respondiendo por ${p}`,
    none: "Ninguna",
    other: "Otra cosa",
    labelRef: (s: string) => `Etiqueta ${s}`,
    callDoctor: "Llame a su médico",
    callDoctorHint: "La etiqueta del medicamento lo indica como advertencia grave.",
    voiceHint: "Opcional: mantenga presionado para dejar una nota de voz",
    voiceNote: "Nota de voz",
    submit: "Enviar registro",
    sending: "Enviando…",
    sent: "Enviado",
    notSynced: "Aún no sincronizado",
    history: "Registros",
    noHistory: "Aún no hay registros.",
    answeredBy: (n: string) => `Respondió ${n}`,
    sample: "Datos de muestra",
    dueNudge: (p: string, d: number) => `${p} aún no responde el registro del día ${d}. Puede responder por ${p}.`,
    overdueNudge: (p: string, d: number) => `Atrasado: ${p} no ha respondido el registro del día ${d}. Puede responder por ${p}.`,
  },
} satisfies Record<Language, unknown>;

/** Short plain summary of answers, e.g. for the doctor timeline (English). */
export function summarize(a: CheckInAnswers, lang: Language = "en"): string {
  const pick = <T extends string>(list: Choice<T>[], v: T | undefined) => list.find((c) => c.value === v)?.text[lang];
  const L = lang === "es";
  const parts: string[] = [];
  if (a.arrived) parts.push(`${L ? "Llegó" : "Arrived"}: ${pick(YES_NO, a.arrived)}`);
  if (a.takingDaily) parts.push(`${L ? "Toma diaria" : "Taking daily"}: ${pick(YES_NO, a.takingDaily)}`);
  if (a.sideEffects?.length) {
    const names = a.sideEffects.map((id) =>
      id === SIDE_EFFECT_NONE
        ? L ? "ninguno" : "none"
        : id === SIDE_EFFECT_OTHER
          ? L ? "otro" : "other"
          : (SIDE_EFFECTS.find((s) => s.id === id)?.text[lang] ?? id)
    );
    parts.push(`${L ? "Efectos" : "Side effects"}: ${names.join("; ")}`);
  }
  if (a.feeling) parts.push(`${L ? "Se siente" : "Feeling"}: ${pick(FEELINGS, a.feeling)}`);
  if (a.pillsLeft) parts.push(`${L ? "Pastillas" : "Pills left"}: ${pick(PILLS, a.pillsLeft)}`);
  if (a.costWorry) parts.push(`${L ? "Preocupa el costo" : "Cost worry"}: ${pick(YES_NO, a.costWorry)}`);
  return parts.join(" · ");
}
