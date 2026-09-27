"use client";

import { LoaderCircle, MessageCircleQuestion, Send } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ask } from "@/lib/api/client";
import type { Language } from "@/lib/db/types";

const T = {
  en: {
    title: (p: string) => `Ask about ${p}'s medicine`,
    suggestions: ["When will her medicine arrive?", "Why did her plan change?"],
    placeholder: "Type a question",
    ask: "Ask",
    label: "Your question",
    you: "You asked",
    powered: "Powered by Backboard memory · answers only from Relay's updates, never medical advice",
    failed: "Relay can't answer right now — the care team will follow up.",
  },
  es: {
    title: (p: string) => `Pregunte sobre la medicina de ${p}`,
    suggestions: ["¿Cuándo llegará su medicina?", "¿Por qué cambió su plan?"],
    placeholder: "Escriba una pregunta",
    ask: "Preguntar",
    label: "Su pregunta",
    you: "Usted preguntó",
    powered: "Con la memoria de Backboard · solo responde con las novedades de Relay, nunca da consejos médicos",
    failed: "Relay no puede responder ahora; el equipo de atención le dará seguimiento.",
  },
} as const;

/** Care-circle Q&A for a family member (Ana's view), answered from the patient's Backboard memories. */
export function AskBox({
  patientId,
  memberId,
  patientFirstName,
  lang,
}: {
  patientId: string;
  memberId: string;
  patientFirstName: string;
  lang: Language;
}) {
  const t = T[lang];
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  async function submit(q: string) {
    const clean = q.trim();
    if (!clean || pending) return;
    setPending(true);
    setAsked(clean);
    setAnswer(null);
    try {
      const res = await ask({ patientId, memberId, question: clean });
      setAnswer(res.answer);
      setQuestion("");
    } catch {
      setAnswer(t.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="ask-box">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <MessageCircleQuestion aria-hidden className="size-5 text-primary" />
        {t.title(patientFirstName)}
      </h3>

      <div className="flex flex-wrap gap-2">
        {t.suggestions.map((s, i) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-10 rounded-full px-4 text-base whitespace-normal"
            disabled={pending}
            onClick={() => void submit(s)}
            data-testid={`ask-suggestion-${i + 1}`}
          >
            {s}
          </Button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t.label}
        </label>
        <Input
          id={inputId}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t.placeholder}
          maxLength={500}
          disabled={pending}
          className="h-12 flex-1 text-base"
          data-testid="ask-input"
        />
        <Button type="submit" size="lg" className="h-12" disabled={pending || !question.trim()} data-testid="ask-submit">
          {pending ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden />}
          {t.ask}
        </Button>
      </form>

      <div aria-live="polite">
        {asked && (
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="text-sm text-muted-foreground">
              {t.you}: “{asked}”
            </p>
            {pending ? (
              <LoaderCircle aria-hidden className="mt-2 size-5 animate-spin text-primary motion-reduce:animate-none" />
            ) : (
              answer && (
                <p className="mt-1 text-base" data-testid="ask-answer">
                  {answer}
                </p>
              )
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="ask-powered-by">
        {t.powered}
      </p>
    </div>
  );
}
