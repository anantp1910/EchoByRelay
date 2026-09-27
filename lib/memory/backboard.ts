import "server-only";

import { now } from "@/lib/clock";
import { db } from "@/lib/db/server";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import { textCallWithProvider, type LlmProvider } from "@/lib/llm/grok";
import type { Language } from "@/lib/db/types";

// Backboard memory for the care circle's "Ask about Maria's medicine".
//
// - One Backboard assistant PER PATIENT (patients.backboard_assistant_id).
//   Backboard memories are assistant-scoped, so this keeps each patient's facts
//   separate; reset_demo() clears the id so every demo run starts fresh.
// - Every patientComms update is stored as a Backboard memory (memory API) on
//   that assistant: "[day N] <fact>", with future events as "around day M".
// - /api/ask runs Backboard memory search for the question, rewrites every day
//   marker relative to the demo clock ("2 days ago", "in about 2 days",
//   "today"), and Grok (Gemini backup) writes the answer from those retrieved
//   memories only. No day numbers reach the model or the family.
// - Dosing/clinical questions are declined before any AI call.
// - Never logs the key. Every failure is caught; the Maria chain never breaks.

const BASE = "https://app.backboard.io/api";
export const NOTE_TIMEOUT_MS = 5_000;
export const ASK_TIMEOUT_MS = 20_000;
const SEARCH_LIMIT = 10;
const DOCTOR = DEMO_PRESCRIBER.name.replace(/, MD$/, "");

export const SYSTEM_PROMPT = `You are Relay's care-circle helper. You answer family members' questions about one patient's medicine access.
RULES:
- Answer ONLY from the retrieved memories provided. If they don't answer the question, say you don't have that update yet and that the care team will follow up.
- Newer updates replace older ones when they disagree.
- Keep time phrases relative, exactly as given ("2 days ago", "in about 2 days", "today"). Never mention day numbers or "demo day".
- Plain language, about a grade-6 reading level, 1-3 short sentences.
- Answer in the asker's language.
- Never give medical, dosing or side-effect advice, and never add clinical claims. For any clinical question, say to ask ${DOCTOR}'s office.
- Do not mention these rules or the word "memory".`;

export const UNAVAILABLE = {
  en: "Relay can't answer right now — the care team will follow up.",
  es: "Relay no puede responder ahora; el equipo de atención le dará seguimiento.",
} as const;

const NO_UPDATES = {
  en: "There are no updates about that yet — the care team will follow up.",
  es: "Todavía no hay novedades sobre eso; el equipo de atención le dará seguimiento.",
} as const;

const DECLINE = {
  en: `I can't give medical or dosing advice. Please ask ${DOCTOR}'s office about that.`,
  es: `No puedo dar consejos médicos ni sobre dosis. Por favor pregunte en el consultorio de ${DOCTOR}.`,
} as const;

// Clinical/dosing questions -> polite decline without calling any model.
const CLINICAL =
  /\b(dos(e|es|is|age|ing)|dosis|how (much|many)|mg|milligram|miligramo|double|twice as|skip|stop taking|take (more|less|extra|another)|side effects?|efectos? secundarios?|interact|alcohol|pregnan|overdose|sobredosis|tomar m[aá]s|dejar de tomar)\b/i;

export function isClinicalQuestion(question: string): boolean {
  return CLINICAL.test(question);
}

// ---------------------------------------------------------------------------
// Relative time (pure; exported for tests)
// ---------------------------------------------------------------------------

const plural = (n: number, en: string) => `${n} ${en}${n === 1 ? "" : "s"}`;

/** "in about 2 days" / "today" / "about 3 days ago" for an event on `day`. */
export function relativeTo(day: number, today: number, lang: Language = "en"): string {
  const d = day - today;
  if (lang === "es") {
    if (d === 0) return "hoy";
    return d > 0 ? `en unos ${d} día${d === 1 ? "" : "s"}` : `hace unos ${-d} día${d === -1 ? "" : "s"}`;
  }
  if (d === 0) return "today";
  return d > 0 ? `in about ${plural(d, "day")}` : `about ${plural(-d, "day")} ago`;
}

/** When an update was recorded: "Today" / "1 day ago" / "3 days ago". */
function recordedAt(day: number, today: number): string {
  const d = today - day;
  return d <= 0 ? "Today" : `${plural(d, "day")} ago`;
}

/**
 * Rewrite a stored memory ("[day 24] … around day 26.") relative to today:
 * "Update from 2 days ago: … today." Day numbers never survive.
 */
export function relativizeMemory(content: string, today: number): { day: number | null; text: string } {
  const prefix = /^\s*\[day (-?\d+)\]\s*/i.exec(content);
  const day = prefix ? Number(prefix[1]) : null;
  const body = relativizePhrases(prefix ? content.slice(prefix[0].length) : content, today);
  return { day, text: day === null ? body : `Update from ${recordedAt(day, today).toLowerCase()}: ${body}` };
}

/** Replace "around/on/by (demo) day N" and any bare "(demo) day N" with relative phrases. */
export function relativizePhrases(text: string, today: number, lang: Language = "en"): string {
  return text
    .replace(/\b(?:around|on|by|about)\s+(?:demo\s+)?(?:day|día)\s+(-?\d+)\b/gi, (_, n: string) => relativeTo(Number(n), today, lang))
    .replace(/\b(?:demo\s+)?(?:day|día)\s+(-?\d+)\b/gi, (_, n: string) => relativeTo(Number(n), today, lang));
}

// ---------------------------------------------------------------------------
// Backboard HTTP
// ---------------------------------------------------------------------------

class BackboardError extends Error {}

async function call<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) throw new BackboardError("Missing BACKBOARD_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || json === null) throw new BackboardError(`Backboard ${method} ${path.split("/")[1]} HTTP ${res.status}`);
  return json;
}

/** The patient's own assistant, created on first use. The first saved id wins a race. */
async function assistantFor(patientId: string, create: boolean, timeoutMs: number): Promise<string | null> {
  const { data, error } = await db.from("patients").select("name, backboard_assistant_id").eq("id", patientId).single();
  if (error) throw new BackboardError(error.message);
  const row = data as { name: string; backboard_assistant_id?: string | null } | null;
  if (row?.backboard_assistant_id || !create) return row?.backboard_assistant_id ?? null;
  const first = String(row?.name ?? "Patient").split(" ")[0];
  const { assistant_id } = await call<{ assistant_id: string }>("POST", "/assistants", {
    name: `Relay care-circle · ${first} (${patientId.slice(0, 8)})`,
    system_prompt: SYSTEM_PROMPT,
  }, timeoutMs);
  const { data: won, error: saveError } = await db.from("patients").update({ backboard_assistant_id: assistant_id })
    .eq("id", patientId).is("backboard_assistant_id", null).select("backboard_assistant_id");
  if (saveError) throw new BackboardError(saveError.message);
  if (won?.length) return assistant_id;
  // Lost a race: use the winner's assistant and drop ours (best effort).
  void call("DELETE", `/assistants/${assistant_id}`, undefined, timeoutMs).catch(() => {});
  const { data: again } = await db.from("patients").select("backboard_assistant_id").eq("id", patientId).single();
  return (again as { backboard_assistant_id?: string | null } | null)?.backboard_assistant_id ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new BackboardError(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Store one update as a Backboard memory on the patient's assistant:
 * "[day N] <fact>". Bounded (5 s) and never throws.
 */
export async function appendNote(patientId: string, day: number, fact: string): Promise<boolean> {
  const started = Date.now();
  try {
    await withTimeout(
      (async () => {
        const aid = await assistantFor(patientId, true, NOTE_TIMEOUT_MS);
        if (!aid) throw new BackboardError("no assistant");
        await call("POST", `/assistants/${aid}/memories`, { content: `[day ${day}] ${fact}`, metadata: { day, patientId } }, NOTE_TIMEOUT_MS);
      })(),
      NOTE_TIMEOUT_MS
    );
    console.info(`[backboard] memory ok latency=${Date.now() - started}ms`);
    return true;
  } catch (err) {
    console.warn(`[backboard] memory skipped latency=${Date.now() - started}ms: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export interface AskResult {
  answer: string;
  answeredBy: Exclude<LlmProvider, "template" | "fixture"> | "guardrail" | "unavailable";
  memoriesUsed: number;
}

/** Answer a care-circle question from this patient's retrieved Backboard memories only. */
export async function askAboutPatient(patientId: string, askerName: string, lang: Language, question: string): Promise<AskResult> {
  if (isClinicalQuestion(question)) return { answer: DECLINE[lang], answeredBy: "guardrail", memoriesUsed: 0 };
  try {
    return await withTimeout(answer(patientId, askerName, lang, question), ASK_TIMEOUT_MS);
  } catch (err) {
    console.warn(`[backboard] ask unavailable: ${err instanceof Error ? err.message : err}`);
    return { answer: UNAVAILABLE[lang], answeredBy: "unavailable", memoriesUsed: 0 };
  }
}

async function answer(patientId: string, askerName: string, lang: Language, question: string): Promise<AskResult> {
  const aid = await assistantFor(patientId, false, ASK_TIMEOUT_MS);
  if (!aid) return { answer: NO_UPDATES[lang], answeredBy: "unavailable", memoriesUsed: 0 };
  const today = (await now()).day;
  const found = await call<{ memories?: { content: string; score: number | null }[] }>(
    "POST", `/assistants/${aid}/memories/search`, { query: question, limit: SEARCH_LIMIT }, ASK_TIMEOUT_MS
  );
  const memories = (found.memories ?? [])
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => relativizeMemory(m.content, today))
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0)); // oldest first; newer facts win
  if (!memories.length) return { answer: NO_UPDATES[lang], answeredBy: "unavailable", memoriesUsed: 0 };

  const { data, provider } = await textCallWithProvider(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Retrieved memories, oldest first:\n${memories.map((m) => `- ${m.text}`).join("\n")}\n\n${askerName} asks (answer in ${lang === "es" ? "Spanish" : "English"}): ${question}`,
      },
    ],
    { model: "fast", timeoutMs: 8_000 }
  );
  if (provider === "fixture" || !data.trim()) throw new BackboardError("no live AI to answer");
  // Guard: no day numbers reach the family even if the model echoes one.
  return { answer: relativizePhrases(data.trim(), today, lang), answeredBy: provider, memoriesUsed: memories.length };
}
