// Typed fetch helpers for every Relay route. Person B imports these from pages
// so nobody hand-writes URLs. Each helper parses the response with the contract
// schema and throws a typed `ApiError` on the shared error shape.
//
// Client-safe: imports only zod + contracts (no server-only code). Uses
// relative URLs, which resolve against the current origin in the browser.

import type { z } from "zod";

import {
  ApiErrorSchema,
  ApproveReq,
  AskReq,
  AskRes,
  AskResSchema,
  ApproveRes,
  ApproveResSchema,
  CheckoutReq,
  CheckoutRes,
  CheckoutResSchema,
  DemoReq,
  DemoRes,
  DemoResSchema,
  IntakeReq,
  IntakeRes,
  IntakeResSchema,
  OkRes,
  OkResSchema,
  PaRes,
  PaResSchema,
  PharmaMetricsRes,
  PharmaMetricsResSchema,
  TranscribeRes,
  TranscribeResSchema,
} from "./contracts";

/** Error thrown when a route returns the shared error shape (or an unparseable failure). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit,
  resSchema: z.ZodType<T>
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    // Multipart bodies need the browser's own boundary header.
    headers: init.body instanceof FormData
      ? { ...(init.headers ?? {}) }
      : { "content-type": "application/json", ...(init.headers ?? {}) },
  });

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // leave json undefined; handled below
    }
  }

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
    }
    throw new ApiError("internal", `Request to ${path} failed (${res.status})`, res.status);
  }

  return resSchema.parse(json);
}

export function intake(body: IntakeReq): Promise<IntakeRes> {
  return apiFetch("/api/intake", { method: "POST", body: JSON.stringify(body) }, IntakeResSchema);
}

export function approve(body: ApproveReq): Promise<ApproveRes> {
  return apiFetch("/api/approve", { method: "POST", body: JSON.stringify(body) }, ApproveResSchema);
}

export function getPa(rxId: string): Promise<PaRes> {
  return apiFetch(`/api/pa/${encodeURIComponent(rxId)}`, { method: "GET" }, PaResSchema);
}

export function editPa(rxId: string, letterMd: string): Promise<PaRes> {
  return apiFetch(
    `/api/pa/${encodeURIComponent(rxId)}`,
    { method: "PATCH", body: JSON.stringify({ letterMd }) },
    PaResSchema
  );
}

export function resolveAlert(alertId: string): Promise<OkRes> {
  return apiFetch(
    `/api/alerts/${encodeURIComponent(alertId)}/resolve`,
    { method: "POST" },
    OkResSchema
  );
}

export function checkout(body: CheckoutReq): Promise<CheckoutRes> {
  return apiFetch("/api/checkout", { method: "POST", body: JSON.stringify(body) }, CheckoutResSchema);
}

export function demo(body: DemoReq): Promise<DemoRes> {
  return apiFetch("/api/demo", { method: "POST", body: JSON.stringify(body) }, DemoResSchema);
}

export function pharmaMetrics(): Promise<PharmaMetricsRes> {
  return apiFetch("/api/pharma/metrics", { method: "GET" }, PharmaMetricsResSchema);
}

/** Speech-to-text via ElevenLabs (server-side). Throws ApiError on failure. */
export function transcribe(audio: Blob, durationMs?: number): Promise<TranscribeRes> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : audio.type.includes("wav") ? "wav" : "webm";
  form.append("audio", audio, `dictation.${ext}`);
  if (durationMs !== undefined) form.append("durationMs", String(Math.round(durationMs)));
  return apiFetch("/api/transcribe", { method: "POST", body: form }, TranscribeResSchema);
}

/** Care-circle question about the patient, answered from their Backboard thread. */
export function ask(body: AskReq): Promise<AskRes> {
  return apiFetch("/api/ask", { method: "POST", body: JSON.stringify(body) }, AskResSchema);
}
