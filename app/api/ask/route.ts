// Ask route — care-circle Q&A ("Ask about Maria's medicine").
//
// POST /api/ask  { patientId, memberId, question } -> { answer, source, answeredBy }
//
// 400 validation_error; 404 if the patient is unknown or the member is not in
// that patient's care circle. Otherwise always 200: answers come only from the
// patient's Backboard thread; clinical/dosing questions are declined; if
// Backboard or the AI is unavailable the answer is a friendly "the care team
// will follow up" (20 s budget). Every Q&A is written to audit_log.

import type { NextRequest } from "next/server";

import { AskReqSchema, AskResSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import type { Language } from "@/lib/db/types";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }
  const parsed = AskReqSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("validation_error", parsed.error.message);
  const { patientId, memberId, question } = parsed.data;

  const { db } = await import("@/lib/db/server");
  const { data: patient, error: patientError } = await db.from("patients").select("name, language").eq("id", patientId).maybeSingle();
  if (patientError) return errorResponse("internal", patientError.message);
  if (!patient) return errorResponse("not_found", "Patient not found");

  let askerName = String(patient.name).split(" ")[0];
  let lang = (patient.language as Language) ?? "en";
  if (memberId) {
    const { data: member, error: memberError } = await db.from("care_circle").select("name, lang")
      .eq("id", memberId).eq("patient_id", patientId).maybeSingle();
    if (memberError) return errorResponse("internal", memberError.message);
    if (!member) return errorResponse("not_found", "Not a member of this patient's care circle");
    askerName = String(member.name).split(" ")[0];
    lang = (member.lang as Language) ?? "en";
  }

  const started = Date.now();
  const { askAboutPatient } = await import("@/lib/memory/backboard");
  const result = await askAboutPatient(patientId, askerName, lang, question);
  const ms = Date.now() - started;
  console.info(`[ask] answeredBy=${result.answeredBy} notes=${result.notes} latency=${ms}ms`);

  const { error: auditError } = await db.from("audit_log").insert({
    actor: memberId ? `care_circle:${askerName}` : "patient",
    action: "ask.answered",
    payload: { patientId, memberId, question, answer: result.answer, answeredBy: result.answeredBy, notes: result.notes, ms },
  });
  if (auditError) console.warn(`[ask] audit_log insert failed: ${auditError.message}`);

  return jsonResponse(AskResSchema.parse({ answer: result.answer, source: "backboard", answeredBy: result.answeredBy }));
}
