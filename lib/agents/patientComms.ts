import "server-only";

import { z } from "zod";

import { db } from "@/lib/db/server";
import { now } from "@/lib/clock";
import { jsonCallWithProvider, type LlmProvider } from "@/lib/llm/grok";
import { getPlan } from "@/lib/mocks/payer";
import { appendNote } from "@/lib/memory/backboard";
import type { AgentContext } from "./context";
import type { Language } from "@/lib/db/types";

// Patient comms. One message PER RECIPIENT: the patient is addressed in the
// second person ("your medicine"); each care-circle member is addressed in the
// second person but refers to the patient in the third person, personalized by
// care_circle.relation (e.g. to Ana: "Your mother Maria …"). Clinical safety:
// messages use ONLY the FACTS from the DB — no new clinical claims, no dosing
// advice, and (validated) no numbers that aren't in the facts. On failure,
// deterministic es/en templates are used. Spanish patient copy avoids gendered
// participles.

export type CommsEvent =
  | "enrolled"
  | "pa_submitted"
  | "pa_approved"
  | "pa_denied_new_plan"
  | "payment_done_shipped"
  | "delivered";

type Role = "patient" | "caregiver";

interface Recipient {
  promptKey: string; // stable key the LLM echoes ("patient", "caregiver1", …)
  memberId: string | null; // null = the patient
  role: Role;
  relation: string | null;
  lang: Language;
  isPayer?: boolean;
  canPay?: boolean;
}

// `event` is optional: the live model omits it; the shared offline fixture
// (lib/data/fixtures/patientComms.json) tags each message so one file can hold
// several events without sending the wrong event's text.
const MessagesSchema = z.object({
  messages: z.array(
    z.object({ to: z.string(), lang: z.enum(["es", "en"]), body: z.string().min(1), event: z.string().optional() })
  ),
});

type Facts = Record<string, string | number>;

const PROGRAM_LABELS: Record<string, string> = {
  bridge: "Medvantx Bridge",
  quick_start: "Medvantx Quick Start",
  pap: "the Patient Assistance Program",
  cash_pay: "Medvantx Cash Pay",
  retail_copay_card: "a retail copay card",
};

const RELATION_ES: Record<string, string> = {
  daughter: "hija",
  son: "hijo",
  wife: "esposa",
  husband: "esposo",
  spouse: "cónyuge",
  mother: "madre",
  father: "padre",
  sister: "hermana",
  brother: "hermano",
  friend: "amigo",
  caregiver: "cuidador",
};

function programLabel(program: string | null): string {
  return (program && PROGRAM_LABELS[program]) || "the manufacturer program";
}

function relationEs(relation: string): string {
  return RELATION_ES[relation.toLowerCase()] ?? relation;
}

/** All digit-runs present anywhere in the facts — the only numbers a message may contain. */
function allowedNumbers(facts: Facts): Set<string> {
  const set = new Set<string>();
  for (const v of Object.values(facts)) {
    for (const n of String(v).match(/\d+/g) ?? []) set.add(n);
  }
  return set;
}

function isValidMessage(body: string, drug: string, allowed: Set<string>): boolean {
  if (!body.toLowerCase().includes(drug.toLowerCase())) return false;
  for (const n of body.match(/\d+/g) ?? []) {
    if (!allowed.has(n)) return false;
  }
  return true;
}

function templateMessage(event: CommsEvent, r: Recipient, f: Facts): string {
  const es = r.lang === "es";
  const name = String(f.patientFirstName);
  const drug = String(f.drug);
  const program = String(f.programLabel);
  const caregiver = r.role === "caregiver";
  const closer = caregiver && r.relation
    ? es
      ? ` Usted recibe este aviso como ${relationEs(r.relation)} de ${name}.`
      : ` You're getting this as ${name}'s ${r.relation}.`
    : "";

  switch (event) {
    case "enrolled":
      if (caregiver) {
        return es
          ? `La inscripción de ${name} en ${program} para ${drug} ya está lista. La medicina se enviará en unos ${f.shipsInDays} días.${closer}`
          : `${name} is now enrolled in ${program} for ${drug}. The medicine will ship in about ${f.shipsInDays} days.${closer}`;
      }
      return es
        ? `Buenas noticias: su inscripción en ${program} para ${drug} ya está lista. Su medicina se enviará en unos ${f.shipsInDays} días. No necesita hacer nada ahora; su equipo de atención le avisará.`
        : `Good news — your enrollment in ${program} for ${drug} is set. Your medicine will ship in about ${f.shipsInDays} days. You don't need to do anything now; your care team will keep you posted.`;
    case "pa_submitted":
      if (caregiver) {
        return es
          ? `El equipo de atención envió la autorización previa de ${drug} a ${f.planName} para ${name}. Compartiremos la decisión del plan. El suministro de ${program} mantiene el tratamiento de ${name} sin interrupción.${closer}`
          : `We sent the prior authorization for ${drug} to ${f.planName} for ${name}. We'll share the plan's decision. ${name}'s ${program} supply keeps treatment going in the meantime.${closer}`;
      }
      return es
        ? `Su equipo de atención envió la autorización previa de ${drug} a ${f.planName}. Le avisaremos la decisión del plan. Mientras tanto, su suministro de ${program} mantiene su tratamiento sin interrupción.`
        : `We sent the prior authorization for ${drug} to ${f.planName}. We'll tell you the plan's decision. In the meantime, your ${program} supply keeps your treatment going.`;
    case "pa_denied_new_plan":
      if (caregiver) {
        return es
          ? `El plan de ${name} no aprobó ${drug}. El médico aprobó ${f.newPathLabel}. ${r.canPay ? `Puede revisar y aprobar el pago de $${f.amountUsd} para la medicina de ${name}.` : "Una persona autorizada puede revisar el costo antes de pagar."}${closer}`
          : `${name}'s plan did not approve ${drug}. The doctor approved ${f.newPathLabel}. ${r.canPay ? `You can now review and approve the $${f.amountUsd} payment for ${name}'s medicine.` : "An authorized payer can review the cost before payment."}${closer}`;
      }
      return es
        ? `Su plan no aprobó ${drug}. Su médico aprobó el cambio a ${f.newPathLabel}. Su familiar autorizado puede revisar el costo de $${f.amountUsd} antes de pagar.`
        : `Your plan did not approve ${drug}. Your doctor approved ${f.newPathLabel}. Your authorized family member can review the $${f.amountUsd} cost before paying.`;
    case "payment_done_shipped":
      if (caregiver) {
        return es
          ? `El pago de $${f.amountUsd} por ${drug} de ${name} se realizó. La medicina fue enviada y debería llegar en unos ${f.daysUntil} días.${closer}`
          : `${r.isPayer ? "Your payment" : "The payment"} of $${f.amountUsd} for ${name}'s ${drug} is complete. The medicine has shipped and should arrive in about ${f.daysUntil} days.${closer}`;
      }
      return es
        ? `${r.isPayer ? "Su pago" : "El pago"} de $${f.amountUsd} por ${drug} se realizó. Su medicina fue enviada y debería llegar en unos ${f.daysUntil} días.`
        : `${r.isPayer ? "Your payment" : "The payment"} of $${f.amountUsd} for ${drug} is complete. Your medicine has shipped and should arrive in about ${f.daysUntil} days.`;
    case "pa_approved":
      return es
        ? `El plan aprobó la autorización de ${drug}${caregiver ? ` para ${name}` : ""}. Su equipo de atención confirmará la entrega de la medicina.`
        : `The plan approved the authorization for ${drug}${caregiver ? ` for ${name}` : ""}. The care team will confirm medicine delivery.`;
    case "delivered":
      if (caregiver) {
        return es
          ? `El ${drug} de ${name} llegó. ${name} debe seguir tomándolo tal como se lo recetaron. ¿Preguntas? Llame al equipo de atención.${closer}`
          : `${name}'s ${drug} has arrived. ${name} should keep taking it exactly as prescribed. Questions? Call the care team.${closer}`;
      }
      return es
        ? `Su ${drug} llegó. Siga tomándolo tal como se lo recetaron. Si tiene preguntas, llame a su equipo de atención.`
        : `Your ${drug} has arrived. Keep taking it exactly as prescribed. If you have questions, call your care team.`;
  }
}

const SYSTEM_PROMPT = `You write short patient/family notification messages at about a grade-6 reading level.
RULES:
- Use ONLY the facts provided. Do NOT add clinical claims or dosing advice beyond what is stated.
- Mention the medication by name. Do NOT include any number that is not in the facts.
- Warm, clear, 1-3 short sentences.
- For pa_submitted, the doctor/care team submitted the request to the insurer. Medvantx Bridge did NOT submit or transmit the PA.
- Address each recipient correctly:
  - role "patient": second person ("your medicine …").
  - role "caregiver": address them in the second person but refer to the PATIENT in the third person by first name. "relation" is the caregiver's relationship TO the patient (e.g. "daughter" means the patient is their parent), so phrase it naturally, e.g. "Your mother {patientFirstName} …". If relation is missing, use the patient's first name.
- In Spanish, avoid gendered participles for the patient (e.g. "Su inscripción … está lista", not "está inscrita").
- Write one message per recipient, in that recipient's language, echoing the recipient's "to" key.
- Return ONLY JSON: {"messages":[{"to":"<recipient key>","lang":"es|en","body":"..."}]}.`;

/** One short, factual English note per update for the patient's Backboard thread. */
function noteFact(event: CommsEvent, f: Facts, day: number): string {
  const name = String(f.patientFirstName);
  const drug = String(f.drug);
  switch (event) {
    case "enrolled":
      return `${name} is enrolled in ${f.programLabel} for ${drug}. The medicine ships in about ${f.shipsInDays} days (around demo day ${day + Number(f.shipsInDays)}).`;
    case "pa_submitted":
      return `The care team sent the prior authorization for ${drug} to ${f.planName}. ${name}'s ${f.programLabel} supply continues while the plan decides.`;
    case "pa_approved":
      return `${f.planName} approved the prior authorization for ${drug}.`;
    case "pa_denied_new_plan":
      return `${name}'s insurance plan did not approve ${drug}, so ${name}'s access plan changed: the doctor approved ${f.newPathLabel} at $${f.amountUsd}. An authorized family member can review and pay.`;
    case "payment_done_shipped":
      return `The $${f.amountUsd} payment for ${name}'s ${drug} is complete. The medicine has shipped and should arrive in about ${f.daysUntil} days (around demo day ${day + Number(f.daysUntil)}).`;
    case "delivered":
      return `${name}'s ${drug} was delivered on demo day ${day}.`;
  }
}

function buildFacts(
  event: CommsEvent,
  rx: { drug: string; dose: string | null; frequency: string | null; program: string | null; expected_delivery_day: number | null },
  patientFirstName: string,
  planName: string,
  day: number
): Facts {
  const base: Facts = {
    drug: rx.drug,
    dose: rx.dose ?? "",
    frequency: rx.frequency ?? "",
    programLabel: programLabel(rx.program),
    patientFirstName,
  };
  const daysUntil = rx.expected_delivery_day != null ? Math.max(0, rx.expected_delivery_day - day) : 2;

  switch (event) {
    case "enrolled":
      return { ...base, shipsInDays: 2 };
    case "pa_submitted":
    case "pa_approved":
      return { ...base, planName };
    case "pa_denied_new_plan":
      return { ...base, newPathLabel: "Medvantx Cash Pay", amountUsd: 89 };
    case "payment_done_shipped":
      return { ...base, amountUsd: 89, daysUntil };
    case "delivered":
      return base;
  }
}

async function draftMessages(
  event: CommsEvent,
  facts: Facts,
  recipients: Recipient[],
  preferTemplate: boolean
): Promise<{ byKey: Record<string, string>; source: "ai" | "template"; provider: LlmProvider }> {
  const templates = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const r of recipients) out[r.promptKey] = templateMessage(event, r, facts);
    return out;
  };

  if (preferTemplate) return { byKey: templates(), source: "template", provider: "template" };

  const allowed = allowedNumbers(facts);
  const drug = String(facts.drug);

  try {
    const { data: res, provider } = await jsonCallWithProvider(
      MessagesSchema,
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Event: ${event}\nFacts: ${JSON.stringify(facts)}\nRecipients: ${JSON.stringify(
            recipients.map((r) => ({ to: r.promptKey, role: r.role, relation: r.relation, lang: r.lang }))
          )}`,
        },
      ],
      { model: "fast", fixtureKey: "patientComms", timeoutMs: 15_000 }
    );

    const byKey: Record<string, string> = {};
    let ok = true;
    for (const r of recipients) {
      const m = res.messages.find((x) => x.to === r.promptKey && x.lang === r.lang && (!x.event || x.event === event));
      if (!m || !isValidMessage(m.body, drug, allowed)) {
        ok = false;
        break;
      }
      byKey[r.promptKey] = m.body.trim();
    }
    if (ok) return { byKey, source: "ai", provider };
    console.warn(`[patientComms] validation failed for ${event}; using templates`);
  } catch (err) {
    console.warn(`[patientComms] LLM failed for ${event}: ${err instanceof Error ? err.message : err}`);
  }

  return { byKey: templates(), source: "template", provider: "template" };
}

/**
 * Notify the patient + care circle about `event`. One step: running -> done.
 * `preferTemplate` skips the LLM (instant, deterministic) — used on the
 * user-facing checkout path to stay within its latency budget.
 */
export async function notify(
  ctx: AgentContext,
  event: CommsEvent,
  opts: { preferTemplate?: boolean; payerMemberId?: string; amountUsd?: number } = {}
): Promise<void> {
  const step = await ctx.step("patientComms", "Updating Maria and her family…", {});

  try {
    const { data: patient, error: pErr } = await db
      .from("patients")
      .select("name, language, plan_id")
      .eq("id", ctx.patientId)
      .single();
    if (pErr || !patient) throw new Error(`could not load patient: ${pErr?.message ?? "not found"}`);

    if (!ctx.rxId) throw new Error("no prescription for comms");
    const { data: rx, error: rxErr } = await db
      .from("prescriptions")
      .select("drug, dose, frequency, program, expected_delivery_day")
      .eq("id", ctx.rxId)
      .single();
    if (rxErr || !rx) throw new Error(`could not load prescription: ${rxErr?.message ?? "not found"}`);

    const { data: members } = await db
      .from("care_circle")
      .select("id, relation, lang, can_pay")
      .eq("patient_id", ctx.patientId);

    const patientFirstName = String(patient.name).split(" ")[0] || String(patient.name);

    const recipients: Recipient[] = [
      { promptKey: "patient", memberId: null, role: "patient", relation: null, lang: (patient.language as Language) ?? "en" },
      ...((members ?? []) as { id: string; relation: string | null; lang: string | null; can_pay: boolean }[]).map((m, i) => ({
        promptKey: `caregiver${i + 1}`,
        memberId: m.id,
        role: "caregiver" as Role,
        relation: m.relation,
        lang: (m.lang as Language) ?? "en",
        canPay: m.can_pay,
      })),
    ];
    for (const r of recipients) r.isPayer = (r.memberId ?? ctx.patientId) === opts.payerMemberId;

    const day = (await now()).day;
    const facts = buildFacts(event, rx, patientFirstName, getPlan(patient.plan_id ?? null).planName, day);
    if (opts.amountUsd !== undefined) facts.amountUsd = opts.amountUsd;
    const { byKey, source, provider } = await draftMessages(event, facts, recipients,
      opts.preferTemplate || process.env.DEMO_MODE === "true" || event !== "enrolled");

    for (const r of recipients) {
      const { error } = await db.from("messages").insert({
        patient_id: ctx.patientId,
        recipient_member_id: r.memberId,
        sender: "relay",
        lang: r.lang,
        body: byKey[r.promptKey],
        is_seed: false,
      });
      if (error) throw new Error(`messages insert failed: ${error.message}`);
    }

    // Care-circle memory. Bounded (5 s) and never throws: Backboard can't break the chain.
    await appendNote(ctx.patientId, day, noteFact(event, facts, day));

    const langs = [...new Set(recipients.map((r) => r.lang.toUpperCase()))].join(", ");
    await step.done(`Sent ${recipients.length} updates (${langs})`, provider === "gemini" ? "Backup AI: Gemini" : null, { provider }, {
      simulated: source === "template",
    });
  } catch (err) {
    await step.blocked("Could not send updates", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
