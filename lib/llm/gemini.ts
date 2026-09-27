// Gemini client (backup AI). Called once, only after Grok has failed.
//
// - Native REST endpoint (generateContent) with the key in the x-goog-api-key
//   header: the newer "AQ." Google AI Studio keys work there, but not as a
//   Bearer token on the OpenAI-compatible endpoint.
// - Model name comes only from env (GEMINI_MODEL), never hardcoded.
// - JSON calls ask for application/json with the zod schema as JSON Schema,
//   then validate with zod anyway. No retry: the caller's deterministic path
//   is next.
// - The key is never logged; logs carry model + latency only.
//
// Like grok.ts, intentionally NOT `import "server-only"` (tsx test scripts
// import it); the key is read per call from a non-public env var.

import { z } from "zod";

import { LlmError, type ChatMessage } from "./grok";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
}

type Part = { text: string };
type Content = { role: "user" | "model"; parts: Part[] };

function text(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
}

/** OpenAI-style messages -> Gemini systemInstruction + contents. */
function toGemini(messages: ChatMessage[]): { systemInstruction?: { parts: Part[] }; contents: Content[] } {
  const system = messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => text(m.content));
  const contents: Content[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: text(m.content) }] }));
  return {
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    contents,
  };
}

/** zod -> JSON Schema for responseJsonSchema (drops the $schema marker). */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
    void _ignored;
    return rest;
  } catch {
    return undefined; // still ask for JSON; zod validates below
  }
}

async function generate(body: Record<string, unknown>, timeoutMs: number, kind: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!key) throw new LlmError("no_key", "Missing GEMINI_API_KEY");
  if (!model) throw new LlmError("no_model", "Missing env GEMINI_MODEL");

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.info(`[gemini] model=${model} latency=${ms}ms ok=false kind=${kind} reason=${timedOut ? "timeout" : "network"}`);
    throw timedOut
      ? new LlmError("timeout", `Gemini call timed out after ${timeoutMs}ms`)
      : new LlmError("api_error", err instanceof Error ? err.message : String(err));
  }
  const ms = Date.now() - started;
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: Part[] } }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    console.info(`[gemini] model=${model} latency=${ms}ms ok=false kind=${kind} reason=http_${res.status}`);
    throw new LlmError("api_error", `Gemini HTTP ${res.status}: ${json?.error?.message ?? "request failed"}`);
  }
  const out = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  console.info(`[gemini] model=${model} latency=${ms}ms ok=${Boolean(out)} kind=${kind}`);
  if (!out) throw new LlmError("api_error", "Gemini returned no text");
  return out;
}

/** One structured JSON call, validated with zod. Throws LlmError on any failure. */
export async function geminiJson<T>(schema: z.ZodType<T>, messages: ChatMessage[], timeoutMs: number): Promise<T> {
  const responseJsonSchema = jsonSchemaFor(schema);
  const raw = await generate(
    {
      ...toGemini(messages),
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        ...(responseJsonSchema ? { responseJsonSchema } : {}),
      },
    },
    timeoutMs,
    "json"
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch {
    throw new LlmError("parse_failed", "Gemini output was not valid JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new LlmError("parse_failed", `Gemini output failed schema: ${result.error.message}`);
  return result.data;
}

/** One free-text call. Throws LlmError on any failure. */
export async function geminiText(messages: ChatMessage[], timeoutMs: number): Promise<string> {
  return generate({ ...toGemini(messages), generationConfig: { temperature: 0.2 } }, timeoutMs, "text");
}
