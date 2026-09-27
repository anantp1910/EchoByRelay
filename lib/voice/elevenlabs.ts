import "server-only";

// ElevenLabs speech-to-text (server-side only; the key never reaches a browser).
//
// POST https://api.elevenlabs.io/v1/speech-to-text, multipart, key in the
// xi-api-key header. English, and keyterm boosting for the demo's proper nouns
// (sent as repeated `keyterms` fields; a JSON-array string is rejected).
// The model id comes from ELEVENLABS_STT_MODEL (default scribe_v2). The key is
// never logged; logs carry model + latency only.

const URL_STT = "https://api.elevenlabs.io/v1/speech-to-text";
const KEYTERMS = ["Jardiance", "Maria"];
export const TRANSCRIBE_TIMEOUT_MS = 15_000;

export class TranscribeError extends Error {
  constructor(message: string, readonly kind: "config" | "timeout" | "upstream") {
    super(message);
    this.name = "TranscribeError";
  }
}

export async function transcribeAudio(audio: Blob, filename: string): Promise<{ text: string; ms: number }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new TranscribeError("Missing ELEVENLABS_API_KEY", "config");
  const model = process.env.ELEVENLABS_STT_MODEL || "scribe_v2";

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model_id", model);
  form.append("language_code", "en");
  form.append("tag_audio_events", "false");
  for (const term of KEYTERMS) form.append("keyterms", term);

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(URL_STT, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.info(`[elevenlabs] model=${model} latency=${ms}ms ok=false reason=${timedOut ? "timeout" : "network"}`);
    throw new TranscribeError(timedOut ? "Transcription timed out" : "Could not reach ElevenLabs", timedOut ? "timeout" : "upstream");
  }
  const ms = Date.now() - started;
  const json = (await res.json().catch(() => null)) as { text?: string } | null;
  if (!res.ok) {
    console.info(`[elevenlabs] model=${model} latency=${ms}ms ok=false reason=http_${res.status}`);
    throw new TranscribeError(`ElevenLabs returned HTTP ${res.status}`, "upstream");
  }
  const text = (json?.text ?? "").trim();
  console.info(`[elevenlabs] model=${model} latency=${ms}ms ok=true chars=${text.length}`);
  return { text, ms };
}
