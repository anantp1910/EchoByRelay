// Transcribe route — ElevenLabs speech-to-text for the doctor's dictation.
//
// POST /api/transcribe  multipart/form-data { audio: File, durationMs?: string }
//   -> { text }
//
// 400 validation_error: no audio, empty, over 2 MB, or over 60 s (durationMs is
// the recorder's own measurement; the size cap is enforced here regardless).
// 500 internal: ElevenLabs missing/unreachable/slow (15 s timeout). The client
// then falls back to the browser's speech recognition, then typing. The text is
// only returned for review; nothing is sent to intake from here.

import type { NextRequest } from "next/server";

import {
  TRANSCRIBE_MAX_BYTES,
  TRANSCRIBE_MAX_MS,
  TranscribeResSchema,
  errorResponse,
  jsonResponse,
} from "@/lib/api/contracts";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("validation_error", "Send the recording as multipart/form-data with an 'audio' file");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return errorResponse("validation_error", "No audio was received. Please record again.");
  }
  if (audio.size > TRANSCRIBE_MAX_BYTES) {
    return errorResponse("validation_error", "The recording is too large (2 MB max). Please keep it under a minute.");
  }
  const durationMs = Number(form.get("durationMs") ?? 0);
  if (Number.isFinite(durationMs) && durationMs > TRANSCRIBE_MAX_MS) {
    return errorResponse("validation_error", "The recording is longer than 60 seconds. Please keep it short.");
  }

  const { transcribeAudio, TranscribeError } = await import("@/lib/voice/elevenlabs");
  try {
    const name = audio instanceof File && audio.name ? audio.name : "dictation.webm";
    const { text } = await transcribeAudio(audio, name);
    if (!text) return errorResponse("validation_error", "No speech was detected. Please try again.");
    return jsonResponse(TranscribeResSchema.parse({ text }));
  } catch (err) {
    if (err instanceof TranscribeError) {
      const message =
        err.kind === "timeout"
          ? "Transcription took too long. Use the browser's dictation or type the sentence."
          : "Transcription is unavailable right now. Use the browser's dictation or type the sentence.";
      return errorResponse("internal", message);
    }
    return errorResponse("internal", "Transcription failed");
  }
}
