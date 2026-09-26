"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, LoaderCircle, Mic, Send } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Support is a browser fact: false on the server, real value after hydration.
const noopSubscribe = () => () => {};
const useSpeechSupported = () =>
  useSyncExternalStore(noopSubscribe, () => getRecognition() !== null, () => false);

type Phase = "idle" | "listening" | "processing";

interface VoiceButtonProps {
  /** Final transcript (spoken or typed). May return a promise; the button shows "processing" meanwhile. */
  onTranscript: (text: string) => Promise<void> | void;
  lang?: string;
  disabled?: boolean;
  /** Pre-fills the typed fallback. Defaults to the demo sentence. */
  suggestion?: string;
  /** sm = compact mic for drawers: no text fallback, hidden when speech is unsupported. */
  size?: "lg" | "sm";
  /** Idle hint under the mic. */
  hint?: string;
  className?: string;
}

/** Hold-to-talk mic with live transcript and waveform; falls back to a text box. */
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
  const compact = size === "sm";
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(suggestion);
  const [micError, setMicError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const inputId = useId();

  const showTextBox = !compact && (typing || !supported);

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

  const start = useCallback(() => {
    if (disabled || phase !== "idle") return;
    const Ctor = getRecognition();
    if (!Ctor) return;
    setMicError(null);
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
      void submit(finalText.current);
    };
    rec.current = r;
    try {
      r.start();
      setPhase("listening");
    } catch {
      rec.current = null;
    }
  }, [disabled, phase, lang, submit]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  const listening = phase === "listening";
  const processing = phase === "processing";

  if (compact && !supported) return null;

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-1.5" : "gap-3", className)}>
      {!showTextBox && (
        <>
          <button
            type="button"
            disabled={disabled || processing}
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
            aria-label={listening ? "Listening. Release to send." : "Hold to talk"}
            data-testid="voice-button"
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

          <div className="flex h-6 items-center" aria-hidden>
            {listening ? (
              <span className="relay-wave flex h-6 items-end gap-1">
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
                {processing ? "Sending to Relay…" : (hint ?? "Hold to talk · Space or Enter works too")}
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
        <p role="status" className="text-sm text-block-strong">
          {micError}
        </p>
      )}

      {showTextBox ? (
        <form
          className="flex w-full max-w-lg flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(typed);
          }}
        >
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
          <Button type="submit" size="lg" className="h-10" disabled={disabled || processing || !typed.trim()}>
            {processing ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            Send
          </Button>
        </form>
      ) : null}

      {supported && !compact && (
        <Button variant="link" size="sm" onClick={() => setTyping((t) => !t)} className="text-muted-foreground">
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
      {!supported && !compact && (
        <p className="text-xs text-muted-foreground">Voice isn&apos;t available in this browser, so type the order.</p>
      )}
    </div>
  );
}
