// Run: npm run test:transcribe  (dev server running for the HTTP cases)
// 1. Success over HTTP: tests/fixtures/maria-dictation.wav (synthetic speech of
//    the demo sentence) -> ElevenLabs -> { text } containing Maria + Jardiance.
// 2. Validation over HTTP: no audio, empty file, > 2 MB, > 60 s, JSON body -> 400.
// 3. Upstream failure in-process: invalid ElevenLabs key -> 500 with a friendly
//    message in the shared error shape. Never prints key values.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { ApiErrorSchema, TRANSCRIBE_MAX_BYTES, TranscribeResSchema } from "../lib/api/contracts";

config({ path: ".env.local", quiet: true });
const BASE = process.env.LIVE_BASE_URL ?? "http://localhost:3000";
const wav = readFileSync("tests/fixtures/maria-dictation.wav");

function form(audio: Blob | null, durationMs?: number): FormData {
  const f = new FormData();
  if (audio) f.append("audio", audio, "dictation.wav");
  if (durationMs !== undefined) f.append("durationMs", String(durationMs));
  return f;
}

async function post(body: FormData | string, headers: Record<string, string> = {}) {
  const t = performance.now();
  const res = await fetch(`${BASE}/api/transcribe`, { method: "POST", body, headers, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, json: await res.json(), ms: Math.round(performance.now() - t) };
}

async function main() {
  const ok = await post(form(new Blob([wav], { type: "audio/wav" }), 4200));
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const { text } = TranscribeResSchema.parse(ok.json);
  assert.match(text, /maria/i);
  assert.match(text, /jardiance/i);
  console.log(`PASS success: HTTP 200 in ${ok.ms}ms -> "${text}"`);

  const cases: [string, FormData | string, Record<string, string>?][] = [
    ["no audio", form(null)],
    ["empty file", form(new Blob([], { type: "audio/wav" }))],
    ["over 2 MB", form(new Blob([new Uint8Array(TRANSCRIBE_MAX_BYTES + 1)], { type: "audio/webm" }))],
    ["over 60 s", form(new Blob([wav], { type: "audio/wav" }), 61_000)],
    ["JSON body", JSON.stringify({ audio: "x" }), { "content-type": "application/json" }],
  ];
  for (const [label, body, headers] of cases) {
    const r = await post(body, headers);
    assert.equal(r.status, 400, `${label}: ${JSON.stringify(r.json)}`);
    const err = ApiErrorSchema.parse(r.json);
    assert.equal(err.error.code, "validation_error");
    console.log(`PASS ${label}: 400 validation_error "${err.error.message}"`);
  }

  // Upstream failure, in-process: the real route handler with an invalid key.
  process.env.ELEVENLABS_API_KEY = "invalid-test-key";
  const { POST } = await import("../app/api/transcribe/route");
  const req = new Request("http://localhost/api/transcribe", { method: "POST", body: form(new Blob([wav], { type: "audio/wav" }), 4200) });
  const res = await POST(req as Parameters<typeof POST>[0]);
  const err = ApiErrorSchema.parse(await res.json());
  assert.equal(res.status, 500);
  assert.equal(err.error.code, "internal");
  assert.match(err.error.message, /type the sentence/i);
  console.log(`PASS upstream failure: 500 internal "${err.error.message}"`);
  console.log("ALL PASS: transcribe route");
}
main().catch((e) => { console.error("FAIL", e); process.exitCode = 1; });
