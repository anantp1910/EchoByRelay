"use client";

import { motion } from "framer-motion";
import { Check, CreditCard, HeartHandshake, Pill, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FixtureBadge, RelayMark } from "@/components/AppHeader";
import { FIXTURE_ANA, FIXTURE_MARIA, FIXTURE_MESSAGES } from "@/components/fixtures";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import type { Language, PrescriptionStatus } from "@/lib/db/types";
import { DEMO_DRUG, MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

// UI copy only. Clinical wording (what/why/how) comes from the FDA label via
// patientComms in Phase 5; until then we show just the Rx fields.
const T = {
  en: {
    hello: (n: string) => `Hi, ${n}`,
    sub: "Here's where your medicine is.",
    medicine: "Your medicine",
    what: "What it is",
    why: "What it's for",
    how: "How to take it",
    labelSoon: "A plain-language explanation from the FDA label will appear here.",
    progress: "Progress",
    steps: ["Prescribed", "Path approved", "Shipping", "Delivered", "Refill"],
    now: "Now",
    circle: "Care circle",
    viewingAs: "Viewing as",
    pay: "Payment",
    nothingToPay: "Nothing to pay. The bridge supply is free.",
    approvePay: "Approve payment",
    status: { bridge: "Free bridge supply" } as Partial<Record<PrescriptionStatus, string>>,
    notFound: "We couldn't find this patient.",
    notFoundHint: "Check the link from your care team.",
    home: "Go to Relay home",
  },
  es: {
    hello: (n: string) => `Hola, ${n}`,
    sub: "Aquí puede ver dónde está su medicina.",
    medicine: "Su medicina",
    what: "Qué es",
    why: "Para qué es",
    how: "Cómo tomarla",
    labelSoon: "Aquí aparecerá una explicación sencilla basada en la etiqueta de la FDA.",
    progress: "Progreso",
    steps: ["Recetada", "Plan aprobado", "En camino", "Entregada", "Resurtido"],
    now: "Ahora",
    circle: "Círculo de cuidado",
    viewingAs: "Viendo como",
    pay: "Pago",
    nothingToPay: "No hay nada que pagar. El suministro puente es gratis.",
    approvePay: "Aprobar pago",
    status: { bridge: "Suministro puente gratis" } as Partial<Record<PrescriptionStatus, string>>,
    notFound: "No encontramos a este paciente.",
    notFoundHint: "Revise el enlace de su equipo médico.",
    home: "Ir a Relay",
  },
} satisfies Record<Language, unknown>;

// Rx-field translations for the demo drug (not clinical claims).
const RX_ES: Record<string, string> = {
  "once daily": "una vez al día",
  "type 2 diabetes with heart failure": "diabetes tipo 2 con insuficiencia cardíaca",
};
const rx = (lang: Language, s: string) => (lang === "es" ? (RX_ES[s] ?? s) : s);

type Viewer = "patient" | "ana";

export function PatientPortal({ patientId }: { patientId: string }) {
  const patient = patientId === MARIA_ID ? FIXTURE_MARIA : null;
  const [lang, setLang] = useState<Language>(patient?.language ?? "en");
  const [viewer, setViewer] = useState<Viewer>("patient");
  const t = T[lang];

  // Demo state until Realtime is wired: Maria is on the free bridge, shipping.
  const status: PrescriptionStatus = "bridge";
  const currentStep = 2;

  return (
    <div className="min-h-full flex-1 bg-background text-[1.0625rem] sm:text-lg">
      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-center gap-2 px-4">
          <RelayMark />
          <FixtureBadge />
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      {!patient ? (
        <main className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-20 text-center">
          <SearchX aria-hidden className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t.notFound}</h1>
          <p className="text-muted-foreground">{t.notFoundHint}</p>
          <Link href="/" className="mt-2 font-medium text-primary underline underline-offset-4">
            {t.home}
          </Link>
        </main>
      ) : (
        <main lang={lang} className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 pb-16">
          <section>
            <h1 className="text-3xl font-bold sm:text-4xl">{t.hello(patient.name.split(" ")[0])}</h1>
            <p className="mt-1 text-muted-foreground">{t.sub}</p>
            <StatusPill status={status} label={t.status[status]} size="lg" className="mt-3" />
          </section>

          <Card>
            <CardTitle icon={Pill}>{t.medicine}</CardTitle>
            <dl className="mt-4 grid gap-4">
              <Row term={t.what}>
                <span className="font-bold">{DEMO_DRUG.name}</span>{" "}
                <span className="text-muted-foreground">({DEMO_DRUG.genericName})</span>
              </Row>
              <Row term={t.why}>{rx(lang, DEMO_DRUG.indication)}</Row>
              <Row term={t.how}>
                <span className="font-mono">{DEMO_DRUG.dose}</span> · {rx(lang, DEMO_DRUG.frequency)}
              </Row>
            </dl>
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t.labelSoon}</p>
          </Card>

          <Card>
            <CardTitle>{t.progress}</CardTitle>
            <ProgressTracker steps={t.steps} current={currentStep} nowLabel={t.now} />
          </Card>

          <Card>
            <CardTitle icon={HeartHandshake}>{t.circle}</CardTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t.viewingAs}</span>
              <div role="group" aria-label={t.viewingAs} className="inline-flex rounded-lg border border-line p-0.5">
                {(
                  [
                    ["patient", patient.name.split(" ")[0]],
                    ["ana", FIXTURE_ANA.name.split(" ")[0]],
                  ] as const
                ).map(([v, name]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={viewer === v}
                    onClick={() => setViewer(v)}
                    className={cn(
                      "rounded-md px-3 py-1 font-medium",
                      viewer === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-3">
              {FIXTURE_MESSAGES.map((m) => (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl rounded-tl-sm bg-accent px-4 py-3"
                >
                  <p lang={m.lang}>{m.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.sender} · <span className="font-mono uppercase">{m.lang}</span>
                  </p>
                </motion.li>
              ))}
            </ul>

            {viewer === "ana" && FIXTURE_ANA.can_pay && (
              <div className="mt-4 rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 font-bold">
                  <CreditCard aria-hidden className="size-5 text-primary" /> {t.pay}
                </p>
                <p className="mt-1 text-muted-foreground">{t.nothingToPay}</p>
                {/* Enabled only for cash_pay / remaining copay (Phase 6). Free programs never touch Visa. */}
                <Button size="lg" className="mt-3 h-12 w-full text-base" disabled>
                  {t.approvePay}
                </Button>
              </div>
            )}
          </Card>
        </main>
      )}
    </div>
  );
}

function LangToggle({ lang, onChange }: { lang: Language; onChange: (l: Language) => void }) {
  return (
    <div role="group" aria-label="Language / Idioma" className="ml-auto inline-flex rounded-full border border-line bg-card p-1">
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={cn(
            "h-9 min-w-12 rounded-full px-3 text-base font-bold",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {l === "es" ? "ES" : "EN"}
        </button>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">{children}</section>;
}

function CardTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: typeof Pill }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
      {Icon && <Icon aria-hidden className="size-6 text-primary" />}
      {children}
    </h2>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ProgressTracker({ steps, current, nowLabel }: { steps: string[]; current: number; nowLabel: string }) {
  return (
    <ol className="mt-4 flex flex-col">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0" aria-current={active ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden className={cn("absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2", done ? "bg-ok" : "bg-line")} />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 font-mono text-sm font-bold",
                done && "border-ok bg-ok text-white dark:text-[#062326]",
                active && "border-primary bg-card text-primary",
                !done && !active && "border-line bg-card text-muted-foreground"
              )}
            >
              {done ? <Check aria-hidden className="size-4" /> : i + 1}
            </span>
            <span className={cn("pt-0.5", active ? "font-bold" : done ? "" : "text-muted-foreground")}>
              {step}
              {active && (
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-sm font-medium text-accent-foreground">
                  {nowLabel}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
