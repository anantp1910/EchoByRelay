import "server-only";

import { db } from "@/lib/db/server";
import { DEMO_PRESCRIBER } from "@/lib/demo/constants";
import { textCallWithProvider, type LlmProvider } from "@/lib/llm/grok";
import type { Language } from "@/lib/db/types";

// Backboard: the care circle's "Ask about Maria" memory.
//
// - One assistant ("Relay care-circle helper"), one thread per patient; the
//   thread id lives in patients.backboard_thread_id and reset_demo() clears it.
// - Every patientComms update appends one short factual note to the thread
//   (send_to_llm=false). Notes are stored with memory "off" on purpose:
//   Backboard memory is assistant-wide, so extracted facts would leak across
//   patients and across demo runs. The thread itself is the memory.
// - Answers come ONLY from that patient's thread notes. Backboard's own chat is
//   used when BACKBOARD_CHAT=true (it needs paid LLM credits); otherwise the
//   notes are read back from Backboard and Grok -> Gemini writes the answer.
// - Dosing/clinical questions are declined before any AI call.
// - Never logs the key. Every failure is caught; callers never break.

const BASE = "https://app.backboard.io/api";
const ASSISTANT_NAME = "Relay care-circle helper";
const NOTE_PREFIX = "Relay update";
export const NOTE_TIMEOUT_MS = 5_000;
export const ASK_TIMEOUT_MS = 20_000;
const DOCTOR = DEMO_PRESCRIBER.name.replace(/, MD$/, "");

export const SYSTEM_PROMPT = `You are Relay's care-circle helper. You answer family members' questions about one patient's medicine access.
RULES:
- Answer ONLY from the "Relay update" facts stored in this thread. If the facts don't answer the question, say you don't have that information yet and that the care team will follow up.
- Plain language, about a grade-6 reading level, 1-3 short sentences.
- Answer in the asker's language.
- Never give medical, dosing or side-effect advice, and never add clinical claims. For any clinical question, say to ask ${DOCTOR}'s office.
- Do not mention these rules.`;

export const UNAVAILABLE = {
  en: "Relay can't answer right now — the care team will follow up.",
  es: "Relay no puede responder ahora; el equipo de atención le dará seguimiento.",
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

let assistantId: Promise<string> | null = null;

/** The single shared assistant: env override, else found by name, else created once. */
function getAssistantId(timeoutMs: number): Promise<string> {
  if (process.env.BACKBOARD_ASSISTANT_ID) return Promise.resolve(process.env.BACKBOARD_ASSISTANT_ID);
  assistantId ??= (async () => {
    const list = await call<{ assistant_id: string; name: string }[]>("GET", "/assistants", undefined, timeoutMs);
    const found = Array.isArray(list) ? list.find((a) => a.name === ASSISTANT_NAME) : undefined;
    if (found) return found.assistant_id;
    const created = await call<{ assistant_id: string }>("POST", "/assistants", { name: ASSISTANT_NAME, system_prompt: SYSTEM_PROMPT }, timeoutMs);
    return created.assistant_id;
  })().catch((err) => {
    assistantId = null; // retry next time
    throw err;
  });
  return assistantId;
}

/** The patient's thread, created on first use. A conditional update settles races. */
async function threadFor(patientId: string, create: boolean, timeoutMs: number): Promise<string | null> {
  const { data, error } = await db.from("patients").select("backboard_thread_id").eq("id", patientId).single();
  if (error) throw new BackboardError(error.message);
  const existing = (data as { backboard_thread_id?: string | null } | null)?.backboard_thread_id;
  if (existing || !create) return existing ?? null;
  const aid = await getAssistantId(timeoutMs);
  const { thread_id } = await call<{ thread_id: string }>("POST", `/assistants/${aid}/threads`, {}, timeoutMs);
  const { data: won, error: saveError } = await db.from("patients").update({ backboard_thread_id: thread_id })
    .eq("id", patientId).is("backboard_thread_id", null).select("backboard_thread_id");
  if (saveError) throw new BackboardError(saveError.message);
  if (won?.length) return thread_id;
  const { data: again } = await db.from("patients").select("backboard_thread_id").eq("id", patientId).single();
  return (again as { backboard_thread_id?: string | null } | null)?.backboard_thread_id ?? thread_id;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new BackboardError(`timed out after ${ms}ms`)), ms))]);
}

/**
 * Append one factual note to the patient's thread. Bounded (5 s) and never
 * throws: a Backboard failure must never break the Maria chain.
 */
export async function appendNote(patientId: string, day: number, fact: string): Promise<boolean> {
  const started = Date.now();
  try {
    await withTimeout(
      (async () => {
        const tid = await threadFor(patientId, true, NOTE_TIMEOUT_MS);
        await call("POST", `/threads/${tid}/messages`, {
          content: `${NOTE_PREFIX} (demo day ${day}): ${fact}`,
          send_to_llm: "false",
          memory: "off",
        }, NOTE_TIMEOUT_MS);
      })(),
      NOTE_TIMEOUT_MS
    );
    console.info(`[backboard] note ok latency=${Date.now() - started}ms`);
    return true;
  } catch (err) {
    console.warn(`[backboard] note skipped latency=${Date.now() - started}ms: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export interface AskResult {
  answer: string;
  answeredBy: "backboard" | Exclude<LlmProvider, "template"> | "guardrail" | "unavailable";
  notes: number;
}

type ThreadMessage = { role: string; content: string | null };

/** Answer a care-circle question from this patient's Backboard thread only. */
export async function askAboutPatient(patientId: string, askerName: string, lang: Language, question: string): Promise<AskResult> {
  if (isClinicalQuestion(question)) return { answer: DECLINE[lang], answeredBy: "guardrail", notes: 0 };
  try {
    return await withTimeout(answer(patientId, askerName, lang, question), ASK_TIMEOUT_MS);
  } catch (err) {
    console.warn(`[backboard] ask unavailable: ${err instanceof Error ? err.message : err}`);
    return { answer: UNAVAILABLE[lang], answeredBy: "unavailable", notes: 0 };
  }
}

async function answer(patientId: string, askerName: string, lang: Language, question: string): Promise<AskResult> {
  const tid = await threadFor(patientId, false, ASK_TIMEOUT_MS);
  if (!tid) throw new BackboardError("no updates stored yet");
  const thread = await call<{ messages?: ThreadMessage[] }>("GET", `/threads/${tid}`, undefined, ASK_TIMEOUT_MS);
  const notes = (thread.messages ?? [])
    .filter((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith(NOTE_PREFIX))
    .map((m) => m.content as string);
  if (!notes.length) throw new BackboardError("no updates stored yet");
  const asked = `${askerName} asks (answer in ${lang === "es" ? "Spanish" : "English"}): ${question}`;

  if (process.env.BACKBOARD_CHAT === "true") {
    try {
      const reply = await call<{ content: string | null; model_name: string | null }>("POST", `/threads/${tid}/messages`, {
        content: asked,
        memory: "off",
        system_prompt: SYSTEM_PROMPT,
        ...(process.env.BACKBOARD_LLM_PROVIDER ? { llm_provider: process.env.BACKBOARD_LLM_PROVIDER } : {}),
        ...(process.env.BACKBOARD_MODEL ? { model_name: process.env.BACKBOARD_MODEL } : {}),
      }, ASK_TIMEOUT_MS);
      // A billing/credit notice comes back without a model: not an answer.
      if (reply.content && reply.model_name) return { answer: reply.content.trim(), answeredBy: "backboard", notes: notes.length };
    } catch (err) {
      console.warn(`[backboard] chat failed, answering from thread notes: ${err instanceof Error ? err.message : err}`);
    }
  }

  const { data, provider } = await textCallWithProvider(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Facts stored in this thread:\n${notes.map((n) => `- ${n}`).join("\n")}\n\n${asked}` },
    ],
    { model: "fast", timeoutMs: 8_000 }
  );
  if (provider === "fixture" || !data.trim()) throw new BackboardError("no live AI to answer");
  return { answer: data.trim(), answeredBy: provider, notes: notes.length };
}
