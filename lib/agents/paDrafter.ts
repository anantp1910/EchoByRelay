import "server-only";

import { db } from "@/lib/db/server";
import { getJardianceLabel } from "@/lib/data/openfda";
import { getPlan } from "@/lib/mocks/payer";
import { dateAtDay, now } from "@/lib/clock";
import {
  assembleLetter,
  draftRationale,
  type PatientFacts,
  type PrescriptionFacts,
} from "./paLetter";
import type { AgentContext } from "./context";

// PA drafter (DB + orchestration). The cited rationale + assembly live in
// paLetter.ts (pure, testable). This loads facts, drafts, saves the pa_request,
// and pauses for approval. One step: running -> needsApproval (action submit_pa).

export async function paDrafter(ctx: AgentContext, opts: { appeal?: boolean } = {}): Promise<void> {
  const step = await ctx.step("paDrafter", "Drafting prior authorization…", {
    detail: "Grounding every clinical claim in the FDA label.",
  });
  const startedAt = Date.now();

  try {
    if (!ctx.rxId) throw new Error("no prescription to draft for");

    const { data: rxRow, error: rxErr } = await db
      .from("prescriptions")
      .select("drug, dose, frequency, indication, program")
      .eq("id", ctx.rxId)
      .single();
    if (rxErr || !rxRow) throw new Error(`could not load prescription: ${rxErr?.message ?? "not found"}`);

    const { data: patRow, error: patErr } = await db
      .from("patients")
      .select("name, conditions, plan_id")
      .eq("id", ctx.patientId)
      .single();
    if (patErr || !patRow) throw new Error(`could not load patient: ${patErr?.message ?? "not found"}`);

    const rx: PrescriptionFacts = {
      drug: rxRow.drug,
      dose: rxRow.dose ?? null,
      frequency: rxRow.frequency ?? null,
      indication: rxRow.indication ?? null,
      program: rxRow.program ?? null,
    };
    const patient: PatientFacts = {
      name: patRow.name,
      conditions: patRow.conditions ?? [],
      planId: patRow.plan_id ?? null,
    };
    const plan = getPlan(patient.planId);

    const label = await getJardianceLabel({ preferFixture: opts.appeal });
    const { rationaleMd, citations, source, provider } = await draftRationale(rx, patient, label, { preferTemplate: opts.appeal });
    const date = dateAtDay((await now()).day).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const baseLetter = assembleLetter(rationaleMd, rx, patient, plan, date);
    const letterMd = opts.appeal
      ? `## Appeal\n\nThe prior authorization was denied. The care team requests reconsideration based on the cited FDA label.\n\n${baseLetter}`
      : baseLetter;

    const { data: paRow, error: paErr } = await db
      .from("pa_requests")
      .insert({ rx_id: ctx.rxId, letter_md: letterMd, citations, status: "draft", is_seed: false })
      .select("id")
      .single();
    if (paErr || !paRow) throw new Error(`pa_requests insert failed: ${paErr?.message ?? "no id"}`);

    const draftMs = Date.now() - startedAt;
    const simulated = source === "template" || label.source === "fixture";
    const n = citations.length;
    await step.needsApproval(
      opts.appeal ? "Appeal ready for review" : "PA ready for review",
      `Drafted from the FDA label with ${n} citation${n === 1 ? "" : "s"}.${provider === "gemini" ? " Backup AI: Gemini." : ""}`,
      { action: "submit_pa", paRequestId: (paRow as { id: string }).id, rxId: ctx.rxId, source, provider, draftMs, appeal: Boolean(opts.appeal) },
      { simulated }
    );
  } catch (err) {
    await step.blocked("Could not draft the PA", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * After the doctor approves the post-denial Cash Pay switch, the appeal is no
 * longer the access path. Resolve its pending card to a done step so no open
 * approval remains; the pa_request stays a draft and GET /api/pa still shows it.
 */
export async function settleAppealDraft(ctx: AgentContext): Promise<void> {
  if (!ctx.rxId) return;
  const { data: pending, error } = await db.from("agent_events").select("id,data")
    .eq("rx_id", ctx.rxId).eq("agent", "paDrafter").eq("status", "needs_approval").contains("data", { appeal: true });
  if (error) throw new Error(error.message);
  for (const row of pending ?? []) {
    const title = "Appeal letter drafted (optional)";
    const detail = "The doctor chose Medvantx Cash Pay. The appeal stays saved as a draft for reference.";
    const data = { ...(row.data as Record<string, unknown>), optional: true };
    const { data: changed, error: updateError } = await db.from("agent_events")
      .update({ status: "done", title, detail, data }).eq("id", row.id).eq("status", "needs_approval").select("id");
    if (updateError) throw new Error(updateError.message);
    if (!changed?.length) continue;
    const { error: auditError } = await db.from("audit_log").insert({
      actor: "paDrafter", action: "paDrafter.done",
      payload: { eventId: row.id, rxId: ctx.rxId, patientId: ctx.patientId, title, detail, simulated: false, data },
    });
    if (auditError) console.warn(`[paDrafter] audit_log insert failed: ${auditError.message}`);
  }
}
