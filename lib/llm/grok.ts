// Grok client (xAI, OpenAI-compatible chat completions).
//
// - Model names come only from env (GROK_FAST_MODEL / GROK_REASONING_MODEL),
//   never hardcoded (CLAUDE.md stack rule).
// - jsonCall validates with zod, retries once, then throws a typed LlmError so
//   callers can fall back deterministically (the demo must never hang).
// - Every call logs model + latency (console.info).
// - DEMO_MODE=true or a missing XAI_API_KEY switches to read-only fixtures from
//   lib/data/fixtures/ (Person C's folder — we only READ). No fixture -> LlmError.
//
// NOTE: intentionally NOT `import "server-only"`. This module is imported by the
// standalone test script (tsx) as well as server code; it holds no secrets at
// module scope (the client is built lazily, reading env per call), and the key
// is a non-public env var so it never reaches a browser bundle.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import OpenAI from "openai";
import type { z } from "zod";

export type ModelTier = "fast" | "reasoning";

export type LlmErrorCode =
  | "no_key"
  | "no_model"
  | "timeout"
  | "api_error"
  | "parse_failed"
  | "no_fixture";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
  }
}

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface JsonCallOpts {
  model: ModelTier;
  timeoutMs?: number;
  fixtureKey?: string;
  attempts?: number;
}

export interface TextCallOpts {
  model: ModelTier;
  timeoutMs?: number;
  fixtureKey?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const FIXTURE_DIR = join(process.cwd(), "lib", "data", "fixtures");

function inFixtureMode(): boolean {
  return process.env.DEMO_MODE === "true" || !process.env.XAI_API_KEY;
}

function resolveModel(tier: ModelTier): string {
  const envName = tier === "fast" ? "GROK_FAST_MODEL" : "GROK_REASONING_MODEL";
  const id = process.env[envName];
  if (!id) {
    throw new LlmError("no_model", `Missing env ${envName}`);
  }
  return id;
}

function makeClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new LlmError("no_key", "Missing XAI_API_KEY");
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    maxRetries: 0,
  });
}

function isTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    /abort|timed? ?out/i.test(err.message)
  );
}

function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : t).trim();
}

function loadJsonFixture<T>(fixtureKey: string | undefined, schema: z.ZodType<T>): T {
  if (!fixtureKey) {
    throw new LlmError("no_fixture", "Fixture mode active but no fixtureKey was provided");
  }
  const file = join(FIXTURE_DIR, `${fixtureKey}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new LlmError("no_fixture", `No fixture at lib/data/fixtures/${fixtureKey}.json`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError("parse_failed", `Fixture ${fixtureKey}.json is not valid JSON`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError("parse_failed", `Fixture ${fixtureKey}.json failed schema: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Structured JSON call: validates the model output against `schema`, retries
 * once on any failure, then throws LlmError. In fixture mode, returns a matching
 * read-only fixture (or throws LlmError("no_fixture")).
 */
export async function jsonCall<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts: JsonCallOpts
): Promise<T> {
  if (inFixtureMode()) {
    return loadJsonFixture(opts.fixtureKey, schema);
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const modelId = resolveModel(opts.model);
  const client = makeClient();

  let lastError: LlmError = new LlmError("api_error", "Grok call failed");

  for (let attempt = 1; attempt <= (opts.attempts ?? 2); attempt++) {
    const started = Date.now();
    try {
      const completion = await client.chat.completions.create(
        {
          model: modelId,
          messages,
          response_format: { type: "json_object" },
          temperature: 0,
        },
        { signal: AbortSignal.timeout(timeoutMs) }
      );
      const ms = Date.now() - started;
      const content = completion.choices[0]?.message?.content ?? "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch {
        console.info(`[grok] model=${modelId} latency=${ms}ms ok=false reason=json_parse attempt=${attempt}`);
        lastError = new LlmError("parse_failed", "Model output was not valid JSON");
        continue;
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        console.info(`[grok] model=${modelId} latency=${ms}ms ok=false reason=schema attempt=${attempt}`);
        lastError = new LlmError("parse_failed", `Model output failed schema: ${result.error.message}`);
        continue;
      }

      console.info(`[grok] model=${modelId} latency=${ms}ms ok=true attempt=${attempt}`);
      return result.data;
    } catch (err) {
      const ms = Date.now() - started;
      const timedOut = isTimeout(err);
      console.info(
        `[grok] model=${modelId} latency=${ms}ms ok=false reason=${timedOut ? "timeout" : "api_error"} attempt=${attempt}`
      );
      lastError = timedOut
        ? new LlmError("timeout", `Grok call timed out after ${timeoutMs}ms`)
        : new LlmError("api_error", err instanceof Error ? err.message : String(err));
    }
  }

  throw lastError;
}

/**
 * Free-text call. In fixture mode, reads lib/data/fixtures/{fixtureKey}.txt.
 * Does not retry (callers that need structure should use jsonCall).
 */
export async function textCall(messages: ChatMessage[], opts: TextCallOpts): Promise<string> {
  if (inFixtureMode()) {
    if (!opts.fixtureKey) {
      throw new LlmError("no_fixture", "Fixture mode active but no fixtureKey was provided");
    }
    const file = join(FIXTURE_DIR, `${opts.fixtureKey}.txt`);
    try {
      return readFileSync(file, "utf8");
    } catch {
      throw new LlmError("no_fixture", `No fixture at lib/data/fixtures/${opts.fixtureKey}.txt`);
    }
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const modelId = resolveModel(opts.model);
  const client = makeClient();
  const started = Date.now();

  try {
    const completion = await client.chat.completions.create(
      { model: modelId, messages, temperature: 0.2 },
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    const ms = Date.now() - started;
    console.info(`[grok] model=${modelId} latency=${ms}ms ok=true kind=text`);
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = isTimeout(err);
    console.info(
      `[grok] model=${modelId} latency=${ms}ms ok=false kind=text reason=${timedOut ? "timeout" : "api_error"}`
    );
    throw timedOut
      ? new LlmError("timeout", `Grok call timed out after ${timeoutMs}ms`)
      : new LlmError("api_error", err instanceof Error ? err.message : String(err));
  }
}
