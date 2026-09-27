"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, LoaderCircle, Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/components/brand";
import { transcribe } from "@/lib/api/client";
import { TRANSCRIBE_MAX_MS } from "@/lib/api/contracts";
import { DEMO_PHRASE } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

// Minimal Web Speech API types (not in TypeScript's DOM lib).
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

// Support is a browser fact: false on the server, real value after hydration.
const noopSubscribe = () => () => {};
const useSpeechSupported = () =>
  useSyncExternalStore(noopSubscribe, () => getRecognition() !== null, () => false);
const useRecorderSupported = () => useSyncExternalStore(noopSubscribe, canRecord, () => false);

const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type Phase = "idle" | "listening" | "recording" | "transcribing" | "processing";

interface VoiceButtonProps {
  /** Final transcript (spoken or typed). May return a promise; the button shows "processing" meanwhile. */
  onTranscript: (text: string) => Promise<void> | void;
  lang?: string;
  disabled?: boolean;
  /** Pre-fills the typed fallback. Defaults to the demo sentence. */
  suggestion?: string;
  /** sm = compact hold-to-talk mic for drawers: no text fallback, hidden when speech is unsupported. */
  size?: "lg" | "sm";
  /** Idle hint under the mic. */
  hint?: string;
  className?: string;
}

/**
 * lg (doctor dictation): click to record, click to stop; ElevenLabs transcribes
 * into the text box for review and the presenter presses Send (never auto-sent).
 * Falls back to the browser's speech recognition (also filled for review), then
 * typing. sm: hold-to-talk browser speech that sends on release (e.g. "approve").
 */
export function VoiceButton({
  onTranscript,
  lang = "en-US",
  disabled = false,
  suggestion = DEMO_PHRASE,
  size = "lg",
  hint,
  className,
}: VoiceButtonProps) {
  const supported = useSpeechSupported();
  const recorderSupported = useRecorderSupported();
  const compact = size === "sm";
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(suggestion);
  const [micError, setMicError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [elevenFailed, setElevenFailed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const media = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number } | null>(null);
  const inputId = useId();

  // lg records with ElevenLabs unless it is unsupported or failed this session.
  const useEleven = !compact && recorderSupported && !elevenFailed;
  const voiceAvailable = useEleven || supported;
  const showTextBox = !compact && (typing || !voiceAvailable);

  const submit = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) {
        setPhase("idle");
        return;
      }
      setPhase("processing");
      try {
        await onTranscript(clean);
      } finally {
        setPhase("idle");
      }
    },
    [onTranscript]
  );

  /** lg: put spoken text in the box for review instead of sending it. */
  const review = useCallback((text: string, by: string) => {
    const clean = text.trim();
    setPhase("idle");
    if (!clean) {
      setMicError("Didn't catch that. Try again or type it.");
      return;
    }
    setTyped(clean);
    setTyping(true);
    setNote(by);
  }, []);

  // ---- Browser speech (sm always; lg fallback) ----
  const start = useCallback(() => {
    if (disabled || phase !== "idle") return;
    const Ctor = getRecognition();
    if (!Ctor) return;
    setMicError(null);
    setNote(null);
    setTranscript("");
    finalText.current = "";
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((finalText.current + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone blocked. Type the order instead.");
        setTyping(true);
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setMicError("Didn't catch that. Try again or type it.");
      }
    };
    r.onend = () => {
      rec.current = null;
      if (compact) void submit(finalText.current);
      else review(finalText.current, "Transcribed by your browser");
    };
    rec.current = r;
    try {
      r.start();
      setPhase("listening");
    } catch {
      rec.current = null;
    }
  }, [disabled, phase, lang, submit, review, compact]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  // ---- ElevenLabs recording (lg) ----
  const finishRecording = useCallback(
    async (blob: Blob, durationMs: number) => {
      setPhase("transcribing");
      try {
        const { text } = await transcribe(blob, durationMs);
        review(text, "Transcribed by ElevenLabs");
      } catch (e) {
        setElevenFailed(true);
        setPhase("idle");
        const reason = e instanceof Error ? e.message : "Transcription is unavailable right now.";
        if (getRecognition()) {
          setMicError(`${reason} Hold the mic to use the browser's dictation instead.`);
          setTyping(false);
        } else {
          setMicError(`${reason} Type the order instead.`);
          setTyping(true);
        }
      }
    },
    [review]
  );

  const startRecording = useCallback(async () => {
    if (disabled || phase !== "idle") return;
    setMicError(null);
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setMicError(denied ? "Microphone blocked. Type the order instead." : "No microphone found. Type the order instead.");
      setTyping(true);
      return;
    }
    const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setElevenFailed(true);
      setMicError("Recording isn't supported here. Hold the mic to use the browser's dictation, or type it.");
      return;
    }
    const chunks: Blob[] = [];
    const started = performance.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      media.current = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      void finishRecording(blob, performance.now() - started);
    };
    media.current = { recorder, stream, started };
    recorder.start();
    setSeconds(0);
    setPhase("recording");
  }, [disabled, phase, finishRecording]);

  const stopRecording = useCallback(() => {
    if (media.current?.recorder.state === "recording") media.current.recorder.stop();
  }, []);

  // Seconds counter; stops itself at the 60 s cap.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const started = media.current?.started;
      if (started === undefined) return;
      const elapsed = performance.now() - started;
      setSeconds(Math.floor(elapsed / 1000));
      if (elapsed >= TRANSCRIBE_MAX_MS) stopRecording();
    }, 250);
    return () => clearInterval(id);
  }, [phase, stopRecording]);

  useEffect(
    () => () => {
      rec.current?.abort();
      const m = media.current;
      if (m) {
        m.recorder.onstop = null;
        if (m.recorder.state === "recording") m.recorder.stop();
        m.stream.getTracks().forEach((t) => t.stop());
      }
    },
    []
  );

  const listening = phase === "listening";
  const recording = phase === "recording";
  const transcribing = phase === "transcribing";
  const processing = phase === "processing";
  const busy = processing || transcribing;

  if (compact && !supported) return null;

  const idleHint = hint ?? (useEleven ? "Click to record · click again to stop" : "Hold to talk · Space or Enter works too");
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-1.5" : "gap-3", className)}>
      {!showTextBox && (
        <>
          {useEleven ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => (recording ? stopRecording() : void startRecording())}
              aria-pressed={recording}
              aria-label={recording ? "Recording. Click to stop." : "Click to record the prescription"}
              data-testid="voice-button"
              data-mode="elevenlabs"
              className={cn(
                "relative grid place-items-center rounded-full text-primary-foreground shadow-lg transition-transform duration-150 select-none",
                "size-24 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-60",
                recording ? "scale-105 bg-block" : "bg-primary"
              )}
            >
              {recording && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-block"
                  initial={{ opacity: 0.35, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              {transcribing ? (
                <LoaderCircle aria-hidden className="size-9 animate-spin motion-reduce:animate-none" />
              ) : recording ? (
                <Square aria-hidden className="size-8 fill-current" />
              ) : (
                <Mic aria-hidden className="size-9" />
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                start();
              }}
              onPointerUp={stop}
              onPointerCancel={stop}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  start();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") stop();
              }}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={listening}
              aria-label={listening ? (compact ? "Listening. Release to send." : "Listening. Release to review.") : "Hold to talk"}
              data-testid="voice-button"
              data-mode="browser"
              className={cn(
                "relative grid touch-none place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 select-none",
                compact ? "size-12" : "size-24",
                "focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-60",
                listening && "scale-105"
              )}
            >
              {listening && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-primary"
                  initial={{ opacity: 0.35, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              {processing ? (
                <LoaderCircle aria-hidden className={cn(compact ? "size-5" : "size-9", "animate-spin motion-reduce:animate-none")} />
              ) : (
                <Mic aria-hidden className={compact ? "size-5" : "size-9"} />
              )}
            </button>
          )}

          <div className="flex h-6 items-center" aria-live="polite">
            {recording ? (
              <span className="flex items-center gap-2 text-sm font-medium" data-testid="voice-recording">
                <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-block motion-reduce:animate-none" />
                Recording <span className="tabular">{clock}</span>
                <span className="text-muted-foreground">· click to stop</span>
              </span>
            ) : listening ? (
              <span className="relay-wave flex h-6 items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className="block h-6 w-1 rounded-full bg-primary"
                    style={{ animationDelay: `${i * 110}ms` }}
                  />
                ))}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {transcribing ? "Transcribing with ElevenLabs…" : processing ? `Sending to ${BRAND.name}…` : idleHint}
              </span>
            )}
          </div>
        </>
      )}

      <AnimatePresence initial={false}>
        {!showTextBox && (listening || transcript) && (
          <motion.p
            key="transcript"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            aria-live="polite"
            className={cn("min-h-6 max-w-md text-center text-foreground", compact ? "text-sm" : "text-base")}
          >
            {transcript ? `“${transcript}”` : <span className="text-muted-foreground">Listening…</span>}
          </motion.p>
        )}
      </AnimatePresence>

      {micError && (
        <p role="status" className="max-w-md text-center text-sm text-block-strong" data-testid="voice-error">
          {micError}
        </p>
      )}

      {showTextBox ? (
        <form
          className="flex w-full max-w-lg flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(typed);
          }}
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              Prescription order
            </label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={suggestion}
              disabled={disabled || processing}
              className="h-10 flex-1 text-base"
              data-testid="voice-text-input"
            />
            <Button
              type="submit"
              size="lg"
              className="h-10"
              disabled={disabled || processing || !typed.trim()}
              data-testid="voice-send"
            >
              {processing ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden />}
              Send
            </Button>
          </div>
          {note && (
            <p className="text-xs text-muted-foreground" data-testid="voice-transcribed-note">
              {note} · check it, then press Send.
            </p>
          )}
        </form>
      ) : null}

      {voiceAvailable && !compact && (
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setTyping((t) => !t);
            setNote(null);
          }}
          className="text-muted-foreground"
        >
          {typing ? (
            <>
              <Mic aria-hidden /> Use voice
            </>
          ) : (
            <>
              <Keyboard aria-hidden /> Type instead
            </>
          )}
        </Button>
      )}
      {!voiceAvailable && !compact && (
        <p className="text-xs text-muted-foreground">Voice isn&apos;t available in this browser, so type the order.</p>
      )}
    </div>
  );
}
