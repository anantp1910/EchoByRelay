"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, ClipboardCheck, CloudOff, LoaderCircle, Phone } from "lucide-react";
import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { VoiceButton } from "@/components/VoiceButton";
import type { Language } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { FlagPills } from "./CheckInBits";
import {
  FEELINGS,
  flagsFor,
  hasSevere,
  PILLS,
  Q,
  SIDE_EFFECT_NONE,
  SIDE_EFFECT_OTHER,
  SIDE_EFFECTS,
  summarize,
  UI,
  YES_NO,
  type QuestionKey,
} from "./questions";
import type { CheckInDraft } from "./api";
import type { CheckInAnswers, CheckInView } from "./types";
import type { DueCheckIn } from "./useCheckIns";

interface CheckInCardProps {
  due: DueCheckIn;
  lang: Language;
  patientId: string;
  patientFirstName: string;
  prescriptionId: string | null;
  /** Care-circle member answering on the patient's behalf; null = the patient. */
  proxyMemberId: string | null;
  onSubmit: (draft: CheckInDraft) => Promise<boolean>;
}

/** Today's check-in on the patient phone: big choices, optional voice note, submit. */
export function CheckInCard({
  due,
  lang,
  patientId,
  patientFirstName,
  prescriptionId,
  proxyMemberId,
  onSubmit,
}: CheckInCardProps) {
  const t = UI[lang];
  const proxy = proxyMemberId !== null;
  const [answers, setAnswers] = useState<CheckInAnswers>({});
  const [sending, setSending] = useState(false);

  const q = (key: QuestionKey) => (proxy ? Q[key][lang].proxy(patientFirstName) : Q[key][lang].self);
  const complete = due.questions.every((k) =>
    k === "sideEffects" ? (answers.sideEffects?.length ?? 0) > 0 : answers[k] !== undefined
  );
  const severe = hasSevere(answers.sideEffects);

  function set<K extends keyof CheckInAnswers>(key: K, value: CheckInAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function toggleSideEffect(id: string) {
    setAnswers((a) => {
      const cur = a.sideEffects ?? [];
      if (id === SIDE_EFFECT_NONE) return { ...a, sideEffects: cur.includes(id) ? [] : [id] };
      const without = cur.filter((x) => x !== SIDE_EFFECT_NONE);
      return { ...a, sideEffects: without.includes(id) ? without.filter((x) => x !== id) : [...without, id] };
    });
  }

  async function submit() {
    if (!complete || sending) return;
    setSending(true);
    try {
      await onSubmit({
        prescription_id: prescriptionId,
        patient_id: patientId,
        day: due.day,
        answers,
        flags: flagsFor(answers),
        submitted_by_member_id: proxyMemberId,
        lang,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-2 border-primary/40 bg-card p-5 shadow-sm sm:p-6"
      aria-labelledby="checkin-title"
      data-testid="checkin-card"
      data-day={due.day}
    >
      <h2 id="checkin-title" className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <ClipboardCheck aria-hidden className="size-6 text-[var(--echo-accent)]" /> {t.title(due.day)}
      </h2>
      {proxy && <p className="mt-1 text-base text-muted-foreground">{t.forPatient(patientFirstName)}</p>}

      <div className="mt-4 flex flex-col gap-6">
        {due.questions.map((key) => (
          <fieldset key={key} className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-bold">{q(key)}</legend>
            {key === "sideEffects" ? (
              <div className="flex flex-col gap-2">
                {SIDE_EFFECTS.map((s) => (
                  <Choice
                    key={s.id}
                    pressed={answers.sideEffects?.includes(s.id) ?? false}
                    onClick={() => toggleSideEffect(s.id)}
                    testId={`se-${s.id}`}
                  >
                    <span className="flex flex-1 flex-col">
                      {s.text[lang]}
                      <span className="font-mono text-xs font-normal text-muted-foreground">{t.labelRef(s.section)}</span>
                    </span>
                  </Choice>
                ))}
                <Choice pressed={answers.sideEffects?.includes(SIDE_EFFECT_OTHER) ?? false} onClick={() => toggleSideEffect(SIDE_EFFECT_OTHER)} testId="se-other">
                  {t.other}
                </Choice>
                <Choice pressed={answers.sideEffects?.includes(SIDE_EFFECT_NONE) ?? false} onClick={() => toggleSideEffect(SIDE_EFFECT_NONE)} testId="se-none">
                  {t.none}
                </Choice>
              </div>
            ) : (
              <div role="radiogroup" aria-label={q(key)} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(key === "feeling" ? FEELINGS : key === "pillsLeft" ? PILLS : YES_NO).map((c) => (
                  <Choice
                    key={c.value}
                    radio
                    pressed={answers[key] === c.value}
                    onClick={() => set(key, c.value as never)}
                    testId={`${key}-${c.value}`}
                  >
                    {c.text[lang]}
                  </Choice>
                ))}
              </div>
            )}
          </fieldset>
        ))}

        <AnimatePresence initial={false}>
          {severe && (
            <motion.div
              key="call"
              role="alert"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border-2 border-block/50 bg-block-soft p-4 text-block-strong"
              data-testid="call-doctor"
            >
              <p className="flex items-center gap-2 text-xl font-bold">
                <Phone aria-hidden className="size-5" /> {t.callDoctor}
              </p>
              <p className="mt-1 text-base">{t.callDoctorHint}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col items-center gap-1">
          <VoiceButton
            size="sm"
            lang={lang === "es" ? "es-US" : "en-US"}
            hint={t.voiceHint}
            onTranscript={(text) => set("voiceNote", text)}
          />
          {answers.voiceNote && (
            <p className="text-base text-muted-foreground">
              {t.voiceNote}: &ldquo;{answers.voiceNote}&rdquo;
            </p>
          )}
        </div>

        <Button size="lg" className="h-14 w-full text-lg" disabled={!complete || sending} onClick={submit} data-testid="checkin-submit">
          {sending ? <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden className="size-5" />}
          {sending ? t.sending : t.submit}
        </Button>
      </div>
    </section>
  );
}

function Choice({
  pressed,
  onClick,
  radio = false,
  testId,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  radio?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={radio ? "radio" : undefined}
      aria-checked={radio ? pressed : undefined}
      aria-pressed={radio ? undefined : pressed}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg font-medium transition-colors duration-150",
        "focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none",
        pressed ? "border-[var(--echo-accent)] bg-accent text-accent-foreground" : "border-line bg-card hover:bg-muted"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center border-2",
          radio ? "rounded-full" : "rounded-md",
          pressed ? "border-[var(--echo-accent)] bg-[var(--echo-accent)] text-white dark:text-[#0e131a]" : "border-muted-foreground/50"
        )}
      >
        {pressed && <Check className="size-4" />}
      </span>
      {children}
    </button>
  );
}

/** Overdue / due nudge in a caregiver's view. */
export function CheckInNudge({ due, lang, patientFirstName }: { due: DueCheckIn; lang: Language; patientFirstName: string }) {
  const t = UI[lang];
  return (
    <p
      role="status"
      data-testid="checkin-nudge"
      data-overdue={due.overdue}
      className="flex items-start gap-2 rounded-xl border border-risk/40 bg-risk-soft px-4 py-3 text-base text-risk-strong"
    >
      <BellRing aria-hidden className="mt-0.5 size-5 shrink-0" />
      {due.overdue ? t.overdueNudge(patientFirstName, due.day) : t.dueNudge(patientFirstName, due.day)}
    </p>
  );
}

/** Answered check-ins, newest first. */
export function CheckInHistory({
  checkIns,
  lang,
  nameFor,
}: {
  checkIns: CheckInView[];
  lang: Language;
  nameFor: (memberId: string | null) => string;
}) {
  const t = UI[lang];
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6" aria-labelledby="checkin-history">
      <h2 id="checkin-history" className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <ClipboardCheck aria-hidden className="size-6 text-[var(--echo-accent)]" /> {t.history}
      </h2>
      {checkIns.length === 0 ? (
        <p className="mt-3 text-muted-foreground">{t.noHistory}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-testid="checkin-history">
          {checkIns.map((c) => (
            <li key={c.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t.title(c.day)}</span>
                {c.source === "sample" && <SimulatedBadge label={t.sample} />}
                {!c.synced && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-risk-strong" data-testid="not-synced">
                    <CloudOff aria-hidden className="size-4" /> {t.notSynced}
                  </span>
                )}
                {c.source === "session" && c.synced && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-ok-strong">
                    <Check aria-hidden className="size-4" /> {t.sent}
                  </span>
                )}
              </div>
              <p className="mt-1 text-base">{summarize(c.answers, lang)}</p>
              {c.answers.voiceNote && (
                <p className="mt-1 text-base text-muted-foreground">
                  {t.voiceNote}: &ldquo;{c.answers.voiceNote}&rdquo;
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{t.answeredBy(nameFor(c.submitted_by_member_id))}</span>
                <FlagPills flags={c.flags} lang={lang} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
