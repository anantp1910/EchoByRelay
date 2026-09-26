"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, HeartHandshake, Inbox, Pill, RotateCcw, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FixtureBadge, RelayMark } from "@/components/AppHeader";
import { PROGRAM, isRouterProgram } from "@/components/labels";
import { LocalTime } from "@/components/LocalTime";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RouterProgramLabel } from "@/lib/api/contracts";
import type {
  CareCircleMember,
  Enrollment,
  Language,
  Message,
  Order,
  PaymentMandate,
  Prescription,
  PrescriptionStatus,
} from "@/lib/db/types";
import { ANA_ID, DEMO_DRUG } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { CheckoutSheet } from "./CheckoutSheet";
import { usePatientData } from "./usePatientData";

// UI copy only. Message bodies come from patientComms in the recipient's
// language and are never translated here.
const T = {
  en: {
    hello: (n: string) => `Hi, ${n}`,
    helloFor: (n: string, p: string) => `Hi, ${n}. Here's ${p}'s medicine.`,
    sub: "Here's where your medicine is.",
    medicine: "Your medicine",
    medicineFor: (p: string) => `${p}'s medicine`,
    what: "What it is",
    why: "What it's for",
    how: "How to take it",
    path: "How it's covered",
    noRx: "No prescription yet. Updates appear here as soon as the doctor sends one.",
    progress: "Progress",
    steps: ["Prescribed", "Path approved", "Shipping", "Delivered", "Refill"],
    refillOn: "Automatic refill is on",
    now: "Now",
    day: (d: number) => `Day ${d}`,
    circle: "Care circle",
    viewingAs: "Viewing as",
    joined: (name: string, rel: string | null) => `${name}${rel ? ` (${rel})` : ""} joined the care circle`,
    noMessages: "No updates yet.",
    pay: "Payment",
    nothingToPay: "Nothing to pay. This program is free.",
    toPay: (amount: string) => `${amount} for this month's supply from Medvantx.`,
    paidShipped: "Paid. The medicine is on its way.",
    approvePay: "Approve payment",
    notFound: "We couldn't find this patient.",
    notFoundHint: "Check the link from your care team.",
    loadError: "We couldn't load your updates.",
    retry: "Try again",
    home: "Go to Relay home",
    program: {
      bridge: "Free bridge supply",
      quick_start: "Free Quick Start supply",
      pap: "Patient Assistance Program (free)",
      cash_pay: "Medvantx Cash Pay",
      retail_copay_card: "Pharmacy with a copay card",
      retail: "Your pharmacy",
      escalate: "Your doctor is reviewing options",
    } satisfies Record<RouterProgramLabel, string>,
    status: {
      new: "New",
      routing: "Finding the best path",
      bridge: "Free bridge supply",
      pa_pending: "Waiting on insurance",
      on_therapy: "On treatment",
      at_risk: "Needs attention",
      abandoned: "Stopped",
    } satisfies Record<PrescriptionStatus, string>,
  },
  es: {
    hello: (n: string) => `Hola, ${n}`,
    helloFor: (n: string, p: string) => `Hola, ${n}. Esta es la medicina de ${p}.`,
    sub: "Aquí puede ver dónde está su medicina.",
    medicine: "Su medicina",
    medicineFor: (p: string) => `La medicina de ${p}`,
    what: "Qué es",
    why: "Para qué es",
    how: "Cómo tomarla",
    path: "Cómo se cubre",
    noRx: "Aún no hay receta. Las novedades aparecerán aquí en cuanto su doctora la envíe.",
    progress: "Progreso",
    steps: ["Recetada", "Plan aprobado", "En camino", "Entregada", "Resurtido"],
    refillOn: "El resurtido automático está activo",
    now: "Ahora",
    day: (d: number) => `Día ${d}`,
    circle: "Círculo de cuidado",
    viewingAs: "Viendo como",
    joined: (name: string, rel: string | null) => `${name}${rel ? ` (${rel})` : ""} se unió al círculo de cuidado`,
    noMessages: "Aún no hay novedades.",
    pay: "Pago",
    nothingToPay: "No hay nada que pagar. Este programa es gratis.",
    toPay: (amount: string) => `${amount} por el suministro de este mes de Medvantx.`,
    paidShipped: "Pagado. La medicina va en camino.",
    approvePay: "Aprobar pago",
    notFound: "No encontramos a este paciente.",
    notFoundHint: "Revise el enlace de su equipo médico.",
    loadError: "No pudimos cargar sus novedades.",
    retry: "Intentar de nuevo",
    home: "Ir a Relay",
    program: {
      bridge: "Suministro puente gratis",
      quick_start: "Suministro de inicio rápido gratis",
      pap: "Programa de asistencia al paciente (gratis)",
      cash_pay: "Pago directo Medvantx",
      retail_copay_card: "Farmacia con tarjeta de copago",
      retail: "Su farmacia",
      escalate: "Su doctora está revisando opciones",
    } satisfies Record<RouterProgramLabel, string>,
    status: {
      new: "Nueva",
      routing: "Buscando el mejor camino",
      bridge: "Suministro puente gratis",
      pa_pending: "Esperando al seguro",
      on_therapy: "En tratamiento",
      at_risk: "Necesita atención",
      abandoned: "Suspendida",
    } satisfies Record<PrescriptionStatus, string>,
  },
} satisfies Record<Language, unknown>;

type Copy = (typeof T)[Language];

const RELATION: Record<Language, Record<string, string>> = {
  en: {},
  es: { daughter: "hija", son: "hijo", wife: "esposa", husband: "esposo", mother: "madre", father: "padre", sister: "hermana", brother: "hermano" },
};

// Rx-field translations for the demo drug (not clinical claims).
const RX_ES: Record<string, string> = {
  "once daily": "una vez al día",
  "type 2 diabetes with heart failure": "diabetes tipo 2 con insuficiencia cardíaca",
};
const rxText = (lang: Language, s: string) => (lang === "es" ? (RX_ES[s] ?? s) : s);

const FREE_PROGRAMS = new Set(["bridge", "quick_start", "pap"]);

/**
 * Index of the current step (0-4), or 5 when all are done. Steps complete in
 * order: Prescribed → Path approved → Shipping → Delivered → Refill. "Shipping"
 * stays current while the medicine is in transit and completes together with
 * "Delivered" when it arrives (free supply: demo day reaches expected_delivery_day).
 */
function progressStep(
  rx: Prescription | null,
  enrollment: Enrollment | null,
  order: Order | null,
  mandate: PaymentMandate | null,
  day: number | null
): number {
  const free = rx?.program ? FREE_PROGRAMS.has(rx.program) : false;
  const arrived = order
    ? order.status === "delivered"
    : free &&
      enrollment !== null &&
      day !== null &&
      rx?.expected_delivery_day != null &&
      day >= rx.expected_delivery_day;
  const done = [rx !== null, Boolean(rx?.program) || enrollment !== null, arrived, arrived, mandate?.recurring === true];
  const i = done.findIndex((d) => !d);
  return i === -1 ? done.length : i;
}

type Viewer = "patient" | "member";

export function PatientPortal({ patientId }: { patientId: string }) {
  const data = usePatientData(patientId);
  const { patient, circle, rx, order } = data;

  // Viewer: the patient, or a care-circle member (Ana by default).
  const [viewer, setViewer] = useState<Viewer>("patient");
  const member = circle.find((m) => m.id === ANA_ID) ?? circle[0] ?? null;
  const viewerLang: Language = viewer === "member" && member ? member.lang : (patient?.language ?? "es");
  // Language follows the viewer until someone taps the toggle.
  const [langChoice, setLangChoice] = useState<{ viewer: Viewer; lang: Language } | null>(null);
  const lang = langChoice?.viewer === viewer ? langChoice.lang : viewerLang;
  const t = T[lang];
  const [payOpen, setPayOpen] = useState(false);

  const first = (name: string) => name.split(" ")[0];
  const program = rx?.program ?? null;
  const step = progressStep(rx, data.enrollment, order, data.mandate, data.day);
  const payable = order !== null && order.status === "created" && data.orderProgram === "cash_pay";
  const money = (n: number) =>
    new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" }).format(n);

  // Current prescription only. messages has no prescription_id, so scope by
  // time: updates sent since the latest Rx was created. No Rx, no updates.
  const rxStart = rx ? Date.parse(rx.created_at) : null;
  const feed = rxStart !== null
    ? data.messages.filter(
        (m) =>
          Date.parse(m.created_at) >= rxStart &&
          (viewer === "member" ? m.recipient_member_id === member?.id : m.recipient_member_id === null)
      )
    : [];

  return (
    <div className="min-h-full flex-1 bg-background text-lg">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-center gap-2 px-4">
          <RelayMark />
          <FixtureBadge />
          <LangToggle lang={lang} onChange={(l) => setLangChoice({ viewer, lang: l })} />
        </div>
      </header>

      {data.state === "loading" ? (
        <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
      ) : data.state === "error" ? (
        <main className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-20 text-center" role="alert">
          <h1 className="text-2xl font-bold">{t.loadError}</h1>
          {data.error && <p className="text-muted-foreground">{data.error}</p>}
          <Button size="lg" variant="outline" className="h-12 text-base" onClick={data.retry}>
            <RotateCcw aria-hidden /> {t.retry}
          </Button>
        </main>
      ) : data.state === "not_found" || !patient ? (
        <main className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-20 text-center">
          <SearchX aria-hidden className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t.notFound}</h1>
          <p className="text-muted-foreground">{t.notFoundHint}</p>
          <Link href="/" className="mt-2 rounded font-medium text-primary underline underline-offset-4">
            {t.home}
          </Link>
        </main>
      ) : (
        <main lang={lang} className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 pb-16">
          {member && (
            <ViewerSwitch
              label={t.viewingAs}
              viewer={viewer}
              onChange={setViewer}
              names={{ patient: first(patient.name), member: first(member.name) }}
            />
          )}

          <section>
            <h1 className="text-3xl font-bold sm:text-4xl">
              {viewer === "member" && member
                ? t.helloFor(first(member.name), first(patient.name))
                : t.hello(first(patient.name))}
            </h1>
            {viewer === "patient" && <p className="mt-1 text-muted-foreground">{t.sub}</p>}
            {rx && (
              <StatusPill status={rx.status} label={t.status[rx.status]} size="lg" className="mt-3" />
            )}
          </section>

          <Card>
            <CardTitle icon={Pill}>{viewer === "member" ? t.medicineFor(first(patient.name)) : t.medicine}</CardTitle>
            {rx ? (
              <dl className="mt-4 grid gap-4">
                <Row term={t.what}>
                  <span className="font-bold">{DEMO_DRUG.name}</span>{" "}
                  <span className="text-muted-foreground">({DEMO_DRUG.genericName})</span>
                </Row>
                <Row term={t.why}>{rxText(lang, DEMO_DRUG.indication)}</Row>
                <Row term={t.how}>
                  <span className="font-mono">{DEMO_DRUG.dose}</span> · {rxText(lang, DEMO_DRUG.frequency)}
                </Row>
                {program && isRouterProgram(program) && (
                  <Row term={t.path}>
                    <span className="font-medium" data-testid="rx-program">
                      {t.program[program]}
                    </span>
                    <span className="block text-base text-muted-foreground">{PROGRAM[program].label}</span>
                  </Row>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-muted-foreground">{t.noRx}</p>
            )}
          </Card>

          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle>{t.progress}</CardTitle>
              {data.day !== null && <span className="font-mono text-base text-muted-foreground">{t.day(data.day)}</span>}
            </div>
            <ProgressTracker steps={t.steps} current={step} nowLabel={t.now} />
            {data.mandate?.recurring && <p className="mt-3 text-base text-ok-strong">{t.refillOn}</p>}
          </Card>

          {viewer === "member" && member?.can_pay && (
            <Card>
              <CardTitle icon={CreditCard}>{t.pay}</CardTitle>
              {payable && order ? (
                <>
                  <p className="mt-2">{t.toPay(money(Number(order.amount_usd ?? 0)))}</p>
                  <Button
                    size="lg"
                    className="mt-4 h-14 w-full text-lg"
                    onClick={() => setPayOpen(true)}
                    data-testid="approve-payment"
                  >
                    {t.approvePay}
                  </Button>
                </>
              ) : order && data.orderProgram === "cash_pay" && order.status !== "created" ? (
                <p className="mt-2 flex items-center gap-2 font-medium text-ok-strong">
                  <Check aria-hidden className="size-5" /> {t.paidShipped}
                </p>
              ) : (
                <p className="mt-2 text-muted-foreground">{t.nothingToPay}</p>
              )}
            </Card>
          )}

          <Card>
            <CardTitle icon={HeartHandshake}>{t.circle}</CardTitle>
            <Feed messages={feed} circle={circle} lang={lang} t={t} />
          </Card>
        </main>
      )}

      {payable && order && member && (
        <CheckoutSheet
          key={order.id}
          open={payOpen}
          onOpenChange={setPayOpen}
          orderId={order.id}
          amountUsd={Number(order.amount_usd ?? 0)}
          payerMemberId={member.id}
          lang={lang}
        />
      )}
    </div>
  );
}

function ViewerSwitch({
  label,
  viewer,
  onChange,
  names,
}: {
  label: string;
  viewer: Viewer;
  onChange: (v: Viewer) => void;
  names: Record<Viewer, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-base">
      <span className="text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="inline-flex rounded-xl border border-line bg-card p-1">
        {(["patient", "member"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={viewer === v}
            onClick={() => onChange(v)}
            data-testid={`viewer-${v}`}
            className={cn(
              "h-10 min-w-20 rounded-lg px-4 font-medium",
              viewer === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {names[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

type FeedItem =
  | { kind: "message"; id: string; at: string; message: Message }
  | { kind: "joined"; id: string; at: string; member: CareCircleMember };

function Feed({
  messages,
  circle,
  lang,
  t,
}: {
  messages: Message[];
  circle: CareCircleMember[];
  lang: Language;
  t: Copy;
}) {
  const items: FeedItem[] = [
    ...circle.map((m): FeedItem => ({ kind: "joined", id: `joined-${m.id}`, at: m.created_at, member: m })),
    ...messages.map((m): FeedItem => ({ kind: "message", id: m.id, at: m.created_at, message: m })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (items.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
        <Inbox aria-hidden className="size-6" />
        <p>{t.noMessages}</p>
      </div>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-3" aria-live="polite" data-testid="care-feed">
      <AnimatePresence initial={false}>
        {items.map((item) =>
          item.kind === "joined" ? (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-1 text-base text-muted-foreground"
            >
              <UserPlus aria-hidden className="size-4 shrink-0" />
              {t.joined(item.member.name.split(" ")[0], item.member.relation ? (RELATION[lang][item.member.relation] ?? item.member.relation) : null)}
            </motion.li>
          ) : (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl rounded-tl-sm bg-accent px-4 py-3 text-accent-foreground"
              data-testid="care-message"
            >
              <p lang={item.message.lang}>{item.message.body}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Relay</span>
                <span className="rounded border border-line px-1 font-mono uppercase">{item.message.lang}</span>
                <LocalTime iso={item.message.created_at} />
              </p>
            </motion.li>
          )
        )}
      </AnimatePresence>
    </ul>
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
          data-testid={`lang-${l}`}
          className={cn(
            "h-10 min-w-12 rounded-full px-3 text-base font-bold",
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
    <ol className="mt-4 flex flex-col" data-testid="progress" data-current={current}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0" aria-current={active ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 transition-colors duration-300",
                  done ? "bg-ok" : "bg-line"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 font-mono text-sm font-bold transition-colors duration-300",
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
