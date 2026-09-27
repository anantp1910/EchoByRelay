// Grok client (xAI, OpenAI-compatible chat completions).
//
// - Model names come only from env (GROK_FAST_MODEL / GROK_REASONING_MODEL),
//   never hardcoded (CLAUDE.md stack rule).
// - jsonCall validates with zod, retries once, then throws a typed LlmError so
//   callers can fall back deterministically (the demo must never hang).
// - Every call logs model + latency (console.info).
// - Backup AI: when Grok fails (timeout, API/rate-limit error, or invalid output
//   after its retry), Gemini is called once with the same prompt and schema
//   (lib/llm/gemini.ts). If that fails too, the LlmError reaches the caller,
//   whose deterministic template/parser is the last step.
// - DEMO_MODE=true, or no AI provider configured at all, switches to read-only
//   fixtures from lib/data/fixtures/ (Person C's folder — we only READ). Fixtures
//   are never used after a live failure: they are Maria-specific.
//
// NOTE: intentionally NOT `import "server-only"`. This module is imported by the
// standalone test script (tsx) as well as server code; it holds no secrets at
// module scope (the client is built lazily, reading env per call), and the key
// is a non-public env var so it never reaches a browser bundle.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import OpenAI from "openai";
import type { z } from "zod";

import { geminiConfigured, geminiJson, geminiText } from "./gemini";

export type ModelTier = "fast" | "reasoning";

/** Who produced a result. "template" = a caller's deterministic, non-AI path. */
export type LlmProvider = "grok" | "gemini" | "fixture" | "template";
export type LiveProvider = "grok" | "gemini";

export interface LlmResult<T> {
  data: T;
  provider: Exclude<LlmProvider, "template">;
}

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
  /** Grok attempts before the backup (default 2). */
  attempts?: number;
  /** Live providers to try, in order (default ["grok", "gemini"]). */
  providers?: LiveProvider[];
}

export interface TextCallOpts {
  model: ModelTier;
  timeoutMs?: number;
  fixtureKey?: string;
  providers?: LiveProvider[];
}

const DEFAULT_PROVIDERS: LiveProvider[] = ["grok", "gemini"];

const DEFAULT_TIMEOUT_MS = 10_000;
const FIXTURE_DIR = join(process.cwd(), "lib", "data", "fixtures");

function inFixtureMode(): boolean {
  return process.env.DEMO_MODE === "true" || (!process.env.XAI_API_KEY && !geminiConfigured());
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
 * Structured JSON call with provider: Grok (validated, retried once), then
 * Gemini once, then LlmError. In fixture mode, returns a matching read-only
 * fixture (or throws LlmError("no_fixture")).
 */
export async function jsonCallWithProvider<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts: JsonCallOpts
): Promise<LlmResult<T>> {
  if (inFixtureMode()) {
    return { data: loadJsonFixture(opts.fixtureKey, schema), provider: "fixture" };
  }
  const providers = opts.providers ?? DEFAULT_PROVIDERS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: LlmError = new LlmError("api_error", "No AI provider available");
  for (const provider of providers) {
    try {
      if (provider === "grok") return { data: await grokJson(schema, messages, opts), provider };
      if (!geminiConfigured()) continue;
      const data = await geminiJson(schema, messages, timeoutMs);
      console.info(`[llm] provider=gemini answered after Grok failed (${lastError.code})`);
      return { data, provider };
    } catch (err) {
      lastError = err instanceof LlmError ? err : new LlmError("api_error", String(err));
    }
  }
  throw lastError;
}

/** jsonCall without provider info (same fallback chain). */
export async function jsonCall<T>(schema: z.ZodType<T>, messages: ChatMessage[], opts: JsonCallOpts): Promise<T> {
  return (await jsonCallWithProvider(schema, messages, opts)).data;
}

/** Grok only: validates with zod, retries (opts.attempts, default 2), then throws LlmError. */
async function grokJson<T>(schema: z.ZodType<T>, messages: ChatMessage[], opts: JsonCallOpts): Promise<T> {
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
 * Free-text call with provider: Grok once, then Gemini once, then LlmError. In
 * fixture mode, reads lib/data/fixtures/{fixtureKey}.txt.
 */
export async function textCallWithProvider(messages: ChatMessage[], opts: TextCallOpts): Promise<LlmResult<string>> {
  if (inFixtureMode()) {
    if (!opts.fixtureKey) {
      throw new LlmError("no_fixture", "Fixture mode active but no fixtureKey was provided");
    }
    const file = join(FIXTURE_DIR, `${opts.fixtureKey}.txt`);
    try {
      return { data: readFileSync(file, "utf8"), provider: "fixture" };
    } catch {
      throw new LlmError("no_fixture", `No fixture at lib/data/fixtures/${opts.fixtureKey}.txt`);
    }
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: LlmError = new LlmError("api_error", "No AI provider available");
  for (const provider of opts.providers ?? DEFAULT_PROVIDERS) {
    try {
      if (provider === "grok") return { data: await grokText(messages, opts), provider };
      if (!geminiConfigured()) continue;
      const data = await geminiText(messages, timeoutMs);
      console.info(`[llm] provider=gemini answered after Grok failed (${lastError.code})`);
      return { data, provider };
    } catch (err) {
      lastError = err instanceof LlmError ? err : new LlmError("api_error", String(err));
    }
  }
  throw lastError;
}

/** textCall without provider info (same fallback chain). */
export async function textCall(messages: ChatMessage[], opts: TextCallOpts): Promise<string> {
  return (await textCallWithProvider(messages, opts)).data;
}

/** Grok only, no retry. */
async function grokText(messages: ChatMessage[], opts: TextCallOpts): Promise<string> {
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
