// GET /api/pa/[rxId] -> { status, letterMd, citations[] }  (Phase 4)
//
// Returns the latest pa_request for the prescription, per the contract. 404 if
// no PA has been drafted yet. Next.js 16: dynamic `params` is a Promise.

import { PaEditReqSchema, PaResSchema, Uuid, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rxId: string }> }
): Promise<Response> {
  const { rxId } = await params;

  if (!Uuid.safeParse(rxId).success) {
    return errorResponse("validation_error", "rxId must be a valid UUID");
  }
  if (!hasServerEnv()) {
    return errorResponse("not_found", "No prior authorization for this prescription yet");
  }

  const { db } = await import("@/lib/db/server");
  const { data, error } = await db
    .from("pa_requests")
    .select("status, letter_md, citations")
    .eq("rx_id", rxId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return errorResponse("internal", error.message);
  }
  if (!data) {
    return errorResponse("not_found", "No prior authorization for this prescription yet");
  }

  const body = {
    status: data.status,
    letterMd: data.letter_md ?? "",
    citations: data.citations ?? [],
  };
  const check = PaResSchema.safeParse(body);
  if (!check.success) {
    return errorResponse("internal", `PA row failed the contract: ${check.error.message}`);
  }

  return jsonResponse(check.data);
}

// PATCH /api/pa/[rxId] { letterMd } -> saves the doctor's edit to the latest
// DRAFT pa_request (409 if already submitted). Citations are kept as-is.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ rxId: string }> }
): Promise<Response> {
  const { rxId } = await params;
  if (!Uuid.safeParse(rxId).success) {
    return errorResponse("validation_error", "rxId must be a valid UUID");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }
  const parsed = PaEditReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }

  if (!hasServerEnv()) {
    return errorResponse("not_found", "No prior authorization for this prescription yet");
  }

  const { db } = await import("@/lib/db/server");
  const { data: pa, error } = await db
    .from("pa_requests")
    .select("id, status, citations")
    .eq("rx_id", rxId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return errorResponse("internal", error.message);
  if (!pa) return errorResponse("not_found", "No prior authorization for this prescription yet");
  if (pa.status !== "draft") {
    return errorResponse("conflict", `PA is ${pa.status}; only a draft can be edited`);
  }

  const { data: updated, error: updErr } = await db
    .from("pa_requests")
    .update({ letter_md: parsed.data.letterMd })
    .eq("id", pa.id)
    .eq("status", "draft")
    .select("status, letter_md, citations")
    .maybeSingle();
  if (updErr) return errorResponse("internal", updErr.message);
  if (!updated) return errorResponse("conflict", "PA was submitted while editing; refresh the letter");

  await db.from("audit_log").insert({
    actor: "doctor",
    action: "pa.edited",
    payload: { rxId, paRequestId: pa.id, edited_by: "doctor" },
  });

  const body = { status: "draft" as const, letterMd: parsed.data.letterMd, citations: pa.citations ?? [] };
  const check = PaResSchema.safeParse(body);
  if (!check.success) {
    return errorResponse("internal", `PA row failed the contract: ${check.error.message}`);
  }
  return jsonResponse(check.data);
}
