// Relay API contract — the single source of truth for request/response shapes
// between the browser (Person B) and the route handlers (Person A). Person C's
// smoke test validates the live routes against these same schemas.
//
// Contract file — CLAUDE.md hard rule #11: fields here change only with a
// team-chat heads-up; never rename or remove a field without one.
//
// This module is import-safe in client components: it depends only on `zod`
// and pure helpers. The response helpers use the Web `Response` global (also
// present in browsers), so no server-only code leaks into the client bundle.
//
// ---------------------------------------------------------------------------
// DB status  ->  API word mapping (see lib/db/types.ts for DB enums)
// ---------------------------------------------------------------------------
//   payments.status      "succeeded"     -> checkout res status "paid"
//                        "failed"        -> checkout res status "declined"
//                        "created"       -> (in-flight; not returned to client)
//   pa_requests.status   passed through unchanged: draft|submitted|approved|denied
//   orders.status        exposed as-is where needed: created|paid|shipped|delivered
//   prescriptions.status exposed as-is: new|routing|bridge|pa_pending|...|abandoned
//   demo_state.day       -> demo res `day` (integer)
// ---------------------------------------------------------------------------

import { z } from "zod";

import { ENROLLMENT_PROGRAMS, PA_STATUSES } from "@/lib/db/types";

// Router output space, for display/labeling by Person B. The router can also
// return "retail" and "escalate", which are NOT enrollable programs (no
// enrollments row is created for them). Addition to the contract, not a change.
export const ROUTER_PROGRAMS = [...ENROLLMENT_PROGRAMS, "retail", "escalate"] as const;
export type RouterProgramLabel = (typeof ROUTER_PROGRAMS)[number];

// UUID validation. NOTE: zod 4's z.uuid() enforces RFC 9562 (version + variant
// bits). The fixed demo IDs in lib/demo/constants.ts (e.g. 1111...-1111-...) are
// NOT RFC-9562-compliant, and B/C already depend on them, so we validate with
// z.guid() (any 8-4-4-4-12 hex string). Do not "fix" the constants.
export const Uuid = z.guid();

// ---------------------------------------------------------------------------
// Shared error shape + status codes
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  "validation_error", // 400
  "not_found", // 404
  "conflict", // 409
  "internal", // 500
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
};

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** Build the shared error body (pure; no framework dependency). */
export function apiError(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** A Web `Response` carrying the shared error shape with the right status. */
export function errorResponse(code: ApiErrorCode, message: string): Response {
  return Response.json(apiError(code, message), { status: STATUS_FOR_CODE[code] });
}

/** A Web `Response` carrying a JSON body (default 200). */
export function jsonResponse<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

// ---------------------------------------------------------------------------
// POST /api/intake
// ---------------------------------------------------------------------------

export const IntakeReqSchema = z.object({
  patientId: Uuid,
  transcript: z.string().min(1),
});
export type IntakeReq = z.infer<typeof IntakeReqSchema>;

export const IntakeResSchema = z.object({
  rxId: Uuid,
});
export type IntakeRes = z.infer<typeof IntakeResSchema>;

// ---------------------------------------------------------------------------
// POST /api/approve
// ---------------------------------------------------------------------------

export const APPROVE_DECISIONS = ["approve", "reject"] as const;
export type ApproveDecision = (typeof APPROVE_DECISIONS)[number];

export const APPROVE_ACTORS = ["doctor", "patient", "caregiver"] as const;
export type ApproveActor = (typeof APPROVE_ACTORS)[number];

export const APPROVE_VIA = ["click", "voice"] as const;
export type ApproveVia = (typeof APPROVE_VIA)[number];

export const ApproveReqSchema = z.object({
  eventId: Uuid,
  decision: z.enum(APPROVE_DECISIONS),
  actor: z.enum(APPROVE_ACTORS),
  via: z.enum(APPROVE_VIA),
});
export type ApproveReq = z.infer<typeof ApproveReqSchema>;

export const ApproveResSchema = z.object({
  ok: z.literal(true),
});
export type ApproveRes = z.infer<typeof ApproveResSchema>;

// ---------------------------------------------------------------------------
// GET /api/pa/[rxId]
// ---------------------------------------------------------------------------

export const CitationSchema = z.object({
  n: z.number().int(),
  section: z.string(),
  quote: z.string(),
  url: z.url(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const PaResSchema = z.object({
  status: z.enum(PA_STATUSES),
  letterMd: z.string(),
  citations: z.array(CitationSchema),
});
export type PaRes = z.infer<typeof PaResSchema>;

// PATCH /api/pa/[rxId] — doctor edits the letter body of the latest draft.
export const PaEditReqSchema = z.object({ letterMd: z.string().min(1) });
export type PaEditReq = z.infer<typeof PaEditReqSchema>;

// Generic { ok: true } response (alerts resolve, etc.).
export const OkResSchema = z.object({ ok: z.literal(true) });
export type OkRes = z.infer<typeof OkResSchema>;

// ---------------------------------------------------------------------------
// POST /api/checkout
// ---------------------------------------------------------------------------

export const CHECKOUT_STATUSES = ["paid", "declined"] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export const CheckoutReqSchema = z.object({
  orderId: Uuid,
  payerMemberId: Uuid,
  capUsd: z.number().nonnegative(),
  recurring: z.boolean(),
  passkeyConfirmed: z.boolean(),
});
export type CheckoutReq = z.infer<typeof CheckoutReqSchema>;

export const CheckoutStepSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  simulated: z.boolean(),
});
export type CheckoutStep = z.infer<typeof CheckoutStepSchema>;

export const CheckoutResSchema = z.object({
  status: z.enum(CHECKOUT_STATUSES),
  visaRef: z.string().nullable(),
  reason: z.string().nullable(),
  steps: z.array(CheckoutStepSchema),
});
export type CheckoutRes = z.infer<typeof CheckoutResSchema>;

// ---------------------------------------------------------------------------
// POST /api/demo
// ---------------------------------------------------------------------------

export const DEMO_ACTIONS = [
  "reset",
  "advance",
  "jump",
  "deny_pa",
  "approve_pa",
  "no_pickup",
] as const;
export type DemoAction = (typeof DEMO_ACTIONS)[number];

export const DemoReqSchema = z
  .object({
    action: z.enum(DEMO_ACTIONS),
    day: z.number().int().optional(),
  })
  .refine((v) => v.action !== "jump" || typeof v.day === "number", {
    message: "day is required when action is 'jump'",
    path: ["day"],
  });
export type DemoReq = z.infer<typeof DemoReqSchema>;

export const DemoResSchema = z.object({
  day: z.number().int(),
});
export type DemoRes = z.infer<typeof DemoResSchema>;

// ---------------------------------------------------------------------------
// GET /api/pharma/metrics
// ---------------------------------------------------------------------------

export const PharmaMetricsResSchema = z.object({
  scriptsRescued: z.number(),
  medianDaysToTherapy: z.number(),
  bridgeCliffsCaught: z.number(),
  pctUnderserved: z.number(),
  rescuedSeries: z.array(z.object({ day: z.number().int(), count: z.number().int() })),
  programMix: z.array(z.object({ program: z.string(), count: z.number().int() })),
});
export type PharmaMetricsRes = z.infer<typeof PharmaMetricsResSchema>;
