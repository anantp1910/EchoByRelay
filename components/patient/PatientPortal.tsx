"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, HeartHandshake, Inbox, Pill, RotateCcw, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { DashboardShell, DashCard } from "@/components/shell/DashboardShell";
import { BRAND } from "@/components/brand";
import { CheckInCard, CheckInHistory, CheckInNudge } from "@/components/checkins/CheckInCard";
import { CheckInPanel, CheckInTab } from "@/components/checkins/CheckInPanel";
import { useCheckIns } from "@/components/checkins/useCheckIns";
import { PROGRAM, isRouterProgram } from "@/components/labels";
import { LocalTime } from "@/components/LocalTime";
import { SimulatedBadge } from "@/components/SimulatedBadge";
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
    home: `Go to ${BRAND.name} home`,
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
    home: `Ir a ${BRAND.name}`,
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
  const checkins = useCheckIns(patientId);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const checkinTab = useRef<HTMLElement | null>(null);
  const openCheckin = useCallback((tab: HTMLButtonElement) => {
    checkinTab.current = tab;
    setCheckinOpen(true);
  }, []);
  const closeCheckin = useCallback(() => setCheckinOpen(false), []);

  const first = (name: string) => name.split(" ")[0];
  const nameFor = (memberId: string | null) =>
    memberId === null
      ? first(patient?.name ?? "")
      : first(circle.find((m) => m.id === memberId)?.name ?? (lang === "es" ? "Familiar" : "Family member"));
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

  const title = !patient
    ? t.home
    : viewer === "member" && member
      ? t.helloFor(first(member.name), first(patient.name))
      : t.hello(first(patient.name));

  return (
    <DashboardShell
      portal="patient"
      lang={lang}
      title={title}
      subtitle={patient && viewer === "patient" ? t.sub : undefined}
      railItems={
        patient && rx ? (
          <CheckInTab onOpen={openCheckin} due={Boolean(checkins.due)} overdue={Boolean(checkins.due?.overdue)} lang={lang} />
        ) : undefined
      }
      mobileBar={
        patient && rx ? (
          <CheckInTab
            compact
            onOpen={openCheckin}
            due={Boolean(checkins.due)}
            overdue={Boolean(checkins.due?.overdue)}
            lang={lang}
          />
        ) : undefined
      }
      actions={
        <>
          {patient && member && (
            <ViewerSwitch
              label={t.viewingAs}
              viewer={viewer}
              onChange={setViewer}
              names={{ patient: first(patient.name), member: first(member.name) }}
            />
          )}
          <LangToggle lang={lang} onChange={(l) => setLangChoice({ viewer, lang: l })} />
        </>
      }
    >
      <div className="text-lg">
      {data.state === "loading" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      ) : data.state === "error" ? (
        <div className="flex max-w-xl flex-col items-start gap-3 py-10" role="alert">
          <p className="text-2xl">{t.loadError}</p>
          {data.error && <p className="text-muted-foreground">{data.error}</p>}
          <Button size="lg" variant="outline" className="h-12 text-base" onClick={data.retry}>
            <RotateCcw aria-hidden /> {t.retry}
          </Button>
        </div>
      ) : data.state === "not_found" || !patient ? (
        <div className="flex max-w-xl flex-col items-start gap-3 py-10">
          <SearchX aria-hidden className="size-10 text-muted-foreground" />
          <p className="text-2xl">{t.notFound}</p>
          <p className="text-muted-foreground">{t.notFoundHint}</p>
          <Link href="/" className="mt-2 inline-flex min-h-11 items-center rounded font-medium text-[var(--echo-accent)] underline underline-offset-4">
            {t.home}
          </Link>
        </div>
      ) : (
        <div lang={lang} className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {/* Feature card: where the medicine is, in one line. */}
          <DashCard feature id="status" className="lg:col-span-2 xl:col-span-1">
            <div className="flex min-h-[13rem] flex-col">
              <div className="flex items-start justify-between gap-3">
                {rx ? <StatusPill status={rx.status} label={t.status[rx.status]} size="lg" /> : <span />}
                {data.day !== null && <span className="font-mono text-base text-muted-foreground">{t.day(data.day)}</span>}
              </div>
              <p className="mt-auto font-[family-name:var(--font-figtree)] text-[clamp(1.9rem,3vw,2.6rem)] leading-tight font-light">
                {rx ? t.steps[Math.min(step, t.steps.length - 1)] : t.noRx}
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                {DEMO_DRUG.name} {DEMO_DRUG.dose}
              </p>
            </div>
          </DashCard>

          <Card id="medicine">
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
                    <span className="flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                      {PROGRAM[program].label}
                      <SimulatedBadge />
                    </span>
                  </Row>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-muted-foreground">{t.noRx}</p>
            )}
          </Card>

          <Card id="progress">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle>{t.progress}</CardTitle>
              {data.day !== null && <span className="font-mono text-base text-muted-foreground">{t.day(data.day)}</span>}
            </div>
            <ProgressTracker steps={t.steps} current={step} nowLabel={t.now} />
            {data.mandate?.recurring && <p className="mt-3 text-base text-ok-strong">{t.refillOn}</p>}
          </Card>

          {viewer === "member" && member?.can_pay && (
            <Card id="payment">
              <div className="flex items-center justify-between gap-2">
                <CardTitle icon={CreditCard}>{t.pay}</CardTitle>
                <SimulatedBadge label="Simulated Visa" />
              </div>
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

          <Card id="circle" className="lg:col-span-2 xl:col-span-3">
            <CardTitle icon={HeartHandshake}>{t.circle}</CardTitle>
            <Feed messages={feed} circle={circle} lang={lang} t={t} />
          </Card>

        </div>
      )}
      </div>

      {patient && rx && (
        <CheckInPanel open={checkinOpen} onClose={closeCheckin} lang={lang} returnFocus={checkinTab}>
          <div className="flex flex-col gap-5">
            {checkins.due ? (
              <>
                {viewer === "member" && (
                  <CheckInNudge due={checkins.due} lang={lang} patientFirstName={first(patient.name)} />
                )}
                <CheckInCard
                  key={`${checkins.due.day}-${viewer}`}
                  due={checkins.due}
                  lang={lang}
                  patientId={patient.id}
                  patientFirstName={first(patient.name)}
                  prescriptionId={rx.id}
                  proxyMemberId={viewer === "member" && member ? member.id : null}
                  onSubmit={checkins.submit}
                />
              </>
            ) : (
              <p className="rounded-2xl border border-line bg-card p-5 text-muted-foreground" data-testid="checkin-none">
                {lang === "es" ? "No hay registro pendiente hoy." : "No check-in is due today."}
              </p>
            )}
            <CheckInHistory checkIns={checkins.checkIns} lang={lang} nameFor={nameFor} />
          </div>
        </CheckInPanel>
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
    </DashboardShell>
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
              "h-11 min-w-20 rounded-lg px-4 font-medium",
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

/**
 * Display wording for engine-written messages: say "Maria", never "your
 * mother Maria"; name the caregiver role instead of the family relation.
 * (The source text lives in lib/agents/patientComms.ts, owned by the engine.)
 */
function plainNames(body: string): string {
  const out = body
    .replace(/\b(your|tu|su)\s+(mother|mom|madre)\s+/gi, "")
    .replace(/\b(mother|mom|madre)\b/gi, "Maria")
    .replace(/\b(daughter|son|hija|hijo)\b/gi, (m) => (/^h/i.test(m) ? "cuidadora" : "caregiver"));
  return out.charAt(0).toUpperCase() + out.slice(1);
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

  const H = lang === "es"
    ? { when: "Cuándo", from: "De", lang: "Idioma", update: "Novedad", circle: "Círculo" }
    : { when: "When", from: "From", lang: "Language", update: "Update", circle: "Care circle" };
  const cell = "px-3 py-3 align-top first:pl-0 last:pr-0 max-sm:p-0";
  // Phones: each row stacks (time · from · language, then the update).
  const row = "border-b border-line text-base last:border-0 max-sm:grid max-sm:grid-cols-[auto_auto_1fr] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3";
  const updateCell = "max-sm:col-span-3";

  return (
    <div className="mt-4 sm:overflow-x-auto">
      <table className="w-full border-collapse text-left max-sm:block sm:min-w-[34rem]" aria-live="polite" data-testid="care-feed">
        <thead className="max-sm:sr-only">
          <tr className="border-b border-line text-sm text-muted-foreground">
            <th scope="col" className={cn(cell, "w-32 font-normal")}>{H.when}</th>
            <th scope="col" className={cn(cell, "w-28 font-normal")}>{H.from}</th>
            <th scope="col" className={cn(cell, "w-24 font-normal")}>{H.lang}</th>
            <th scope="col" className={cn(cell, "font-normal")}>{H.update}</th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          <AnimatePresence initial={false}>
            {items.map((item) =>
              item.kind === "joined" ? (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(row, "text-muted-foreground")}
                >
                  <td className={cell}>
                    <LocalTime iso={item.at} className="text-sm" />
                  </td>
                  <td className={cell}>{H.circle}</td>
                  <td className={cell}>–</td>
                  <td className={cn(cell, updateCell)}>
                    <span className="inline-flex items-center gap-2">
                      <UserPlus aria-hidden className="size-4 shrink-0" />
                      {t.joined(item.member.name.split(" ")[0], lang === "es" ? "cuidadora" : "caregiver")}
                    </span>
                  </td>
                </motion.tr>
              ) : (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={row}
                  data-testid="care-message"
                >
                  <td className={cell}>
                    <LocalTime iso={item.message.created_at} className="text-sm" />
                  </td>
                  <td className={cell}>{BRAND.name}</td>
                  <td className={cell}>
                    <span className="rounded border border-line px-1.5 font-mono text-xs uppercase">{item.message.lang}</span>
                  </td>
                  <td className={cn(cell, updateCell, "leading-relaxed")} lang={item.message.lang}>
                    {plainNames(item.message.body)}
                  </td>
                </motion.tr>
              )
            )}
          </AnimatePresence>
        </tbody>
      </table>
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
          data-testid={`lang-${l}`}
          className={cn(
            "h-11 min-w-12 rounded-full px-3 text-base font-bold",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {l === "es" ? "ES" : "EN"}
        </button>
      ))}
    </div>
  );
}

function Card({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("glow-hover min-w-0 scroll-mt-20 rounded-2xl border border-line bg-card p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

function CardTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: typeof Pill }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
      {Icon && <Icon aria-hidden className="size-6 text-[var(--echo-accent)]" />}
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
                  "absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 transition-colors duration-200",
                  done ? "bg-ok" : "bg-line"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 font-mono text-sm font-bold transition-colors duration-200",
                done && "border-ok bg-ok text-white dark:text-[#062326]",
                active && "border-primary bg-card text-[var(--echo-accent)]",
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
