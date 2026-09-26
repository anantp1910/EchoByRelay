"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, CircleX, CreditCard, Fingerprint, LoaderCircle, Repeat, Store, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { BRAND } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HAS_SUPABASE } from "@/components/useLiveEvents";
import { ApiError, checkout } from "@/lib/api/client";
import type { CheckoutRes } from "@/lib/api/contracts";
import type { Language } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const T = {
  en: {
    title: "Approve payment",
    desc: "Pay Medvantx for this month's medicine with your Visa card.",
    merchant: "Merchant",
    merchantName: "Medvantx Pharmacy",
    total: "Total today",
    cap: "Spending cap",
    capHint: `${BRAND.name} can never charge more than this.`,
    capTooLow: "The cap is below the price, so this payment would be declined.",
    recurring: "Refill automatically each month",
    recurringHint: "Uses the same cap. Turn off anytime.",
    passkey: "Confirm with passkey",
    simulated: "Simulated passkey",
    verifying: "Checking passkey…",
    paying: "Paying with Visa…",
    paid: "Payment approved",
    paidHint: "The medicine is on its way.",
    ref: "Visa reference",
    declined: "Payment declined",
    unavailable: "Checkout isn't available yet",
    unavailableHint: "Payments aren't connected in this environment. Nothing was charged.",
    error: "Something went wrong",
    tryAgain: "Try again",
    done: "Done",
    steps: {
      enroll_card: "Card enrolled",
      create_instruction: "Purchase instruction created",
      retrieve_credentials: "One-time credential issued",
      pay: "Paid Medvantx",
      confirm_outcome: "Outcome confirmed",
      authorize: "Authorization",
    } as Record<string, string>,
  },
  es: {
    title: "Aprobar pago",
    desc: "Pague a Medvantx la medicina de este mes con su tarjeta Visa.",
    merchant: "Comercio",
    merchantName: "Farmacia Medvantx",
    total: "Total de hoy",
    cap: "Límite de gasto",
    capHint: `${BRAND.name} nunca puede cobrar más de esto.`,
    capTooLow: "El límite es menor que el precio, así que el pago sería rechazado.",
    recurring: "Resurtir automáticamente cada mes",
    recurringHint: "Usa el mismo límite. Puede apagarlo cuando quiera.",
    passkey: "Confirmar con llave de acceso",
    simulated: "Llave de acceso simulada",
    verifying: "Verificando llave de acceso…",
    paying: "Pagando con Visa…",
    paid: "Pago aprobado",
    paidHint: "La medicina va en camino.",
    ref: "Referencia Visa",
    declined: "Pago rechazado",
    unavailable: "El pago aún no está disponible",
    unavailableHint: "Los pagos no están conectados en este entorno. No se cobró nada.",
    error: "Algo salió mal",
    tryAgain: "Intentar de nuevo",
    done: "Listo",
    steps: {
      enroll_card: "Tarjeta registrada",
      create_instruction: "Instrucción de compra creada",
      retrieve_credentials: "Credencial de un solo uso emitida",
      pay: "Pago a Medvantx",
      confirm_outcome: "Resultado confirmado",
      authorize: "Autorización",
    } as Record<string, string>,
  },
} satisfies Record<Language, unknown>;

type Phase =
  | { kind: "form" }
  | { kind: "verifying" }
  | { kind: "paying" }
  | { kind: "result"; res: CheckoutRes }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const STEP_DELAY = 0.15; // seconds between Visa steps ticking in

/** Rounded up to the next $5, so the default cap always covers the price. */
const capFor = (amount: number) => Math.max(5, Math.ceil(amount / 5) * 5);

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amountUsd: number;
  payerMemberId: string;
  lang: Language;
}

/**
 * Visa checkout for a Cash Pay order: price, merchant, spending cap, recurring
 * refill, and a clearly labeled simulated passkey. Calls POST /api/checkout
 * (idempotent server-side) and plays the returned Visa steps.
 */
export function CheckoutSheet({ open, onOpenChange, orderId, amountUsd, payerMemberId, lang }: CheckoutSheetProps) {
  const t = T[lang];
  const reduce = useReducedMotion();
  const capId = useId();
  const [cap, setCap] = useState(() => capFor(amountUsd));
  const [recurring, setRecurring] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  const money = (n: number) =>
    new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" }).format(n);
  const capMax = Math.max(capFor(amountUsd * 2), 100);
  const capTooLow = cap < amountUsd;
  const busy = phase.kind === "verifying" || phase.kind === "paying";

  async function pay() {
    if (busy || capTooLow) return;
    setPhase({ kind: "verifying" });
    // Simulated passkey: a short, visible beat stands in for WebAuthn.
    await new Promise((r) => setTimeout(r, 700));
    if (!HAS_SUPABASE) {
      setPhase({ kind: "unavailable" });
      return;
    }
    setPhase({ kind: "paying" });
    try {
      const res = await checkout({ orderId, payerMemberId, capUsd: cap, recurring, passkeyConfirmed: true });
      setPhase({ kind: "result", res });
    } catch (e) {
      // A 404/405 without the contract error body means the route itself is missing.
      if (e instanceof ApiError && e.code === "internal" && (e.status === 404 || e.status === 405)) {
        setPhase({ kind: "unavailable" });
      } else {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : t.error });
      }
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // don't dismiss mid-payment
        onOpenChange(next);
        if (!next && phase.kind !== "result") setPhase({ kind: "form" });
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full gap-0 overflow-y-auto rounded-t-2xl p-0 text-lg sm:max-w-lg"
        data-testid="checkout-sheet"
      >
        <SheetHeader className="border-b border-line px-5 pt-5 pr-12">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <CreditCard aria-hidden className="size-5 text-primary" /> {t.title}
          </SheetTitle>
          <SheetDescription className="text-base">{t.desc}</SheetDescription>
        </SheetHeader>

        <div lang={lang} className="flex flex-col gap-5 px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted p-4">
            <div>
              <dt className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{t.merchant}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                <Store aria-hidden className="size-4 text-muted-foreground" /> {t.merchantName}
              </dd>
              <dd className="mt-1">
                <SimulatedBadge />
              </dd>
            </div>
            <div className="text-right">
              <dt className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{t.total}</dt>
              <dd className="mt-0.5 font-mono text-2xl font-bold tabular" data-testid="checkout-amount">
                {money(amountUsd)}
              </dd>
            </div>
          </dl>

          {phase.kind === "result" ? (
            <Result res={phase.res} t={t} reduce={reduce ?? false} onDone={() => onOpenChange(false)} onRetry={() => setPhase({ kind: "form" })} />
          ) : phase.kind === "unavailable" ? (
            <Notice tone="risk" icon={TriangleAlert} title={t.unavailable} body={t.unavailableHint} />
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={capId} className="font-bold">
                    {t.cap}
                  </label>
                  <span className="font-mono text-xl font-bold tabular" aria-hidden>
                    {money(cap)}
                  </span>
                </div>
                <input
                  id={capId}
                  type="range"
                  min={0}
                  max={capMax}
                  step={5}
                  value={cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                  disabled={busy}
                  aria-valuetext={money(cap)}
                  data-testid="checkout-cap"
                  className="mt-3 h-11 w-full cursor-pointer accent-primary"
                />
                <p className={cn("mt-1 text-base", capTooLow ? "font-medium text-block-strong" : "text-muted-foreground")}>
                  {capTooLow ? t.capTooLow : t.capHint}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={recurring}
                onClick={() => setRecurring((v) => !v)}
                disabled={busy}
                data-testid="checkout-recurring"
                className="flex min-h-14 items-center gap-3 rounded-xl border border-line p-3 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Repeat aria-hidden className="size-5 shrink-0 text-primary" />
                <span className="flex-1">
                  <span className="block font-medium">{t.recurring}</span>
                  <span className="block text-base text-muted-foreground">{t.recurringHint}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                    recurring ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform",
                      recurring && "translate-x-5"
                    )}
                  />
                </span>
              </button>

              {phase.kind === "error" && (
                <Notice tone="blocked" icon={CircleX} title={t.error} body={phase.message} />
              )}

              <div className="flex flex-col items-center gap-2">
                <Button
                  size="lg"
                  onClick={pay}
                  disabled={busy || capTooLow}
                  className="h-14 w-full text-lg"
                  data-testid="checkout-passkey"
                >
                  {busy ? (
                    <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Fingerprint aria-hidden className="size-5" />
                  )}
                  {phase.kind === "verifying" ? t.verifying : phase.kind === "paying" ? t.paying : t.passkey}
                </Button>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                  {t.simulated}
                </span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Result({
  res,
  t,
  reduce,
  onDone,
  onRetry,
}: {
  res: CheckoutRes;
  t: (typeof T)[Language];
  reduce: boolean;
  onDone: () => void;
  onRetry: () => void;
}) {
  const paid = res.status === "paid";
  const delay = (i: number) => (reduce ? 0 : i * STEP_DELAY);
  const finalDelay = delay(res.steps.length);

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {res.steps.length > 0 && (
        <ol className="flex flex-col gap-2">
          {res.steps.map((s, i) => (
            <motion.li
              key={s.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay(i), duration: 0.2 }}
              className="flex items-center gap-2 text-base"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-white dark:text-[#062326]",
                  s.ok ? "bg-ok" : "bg-block"
                )}
              >
                {s.ok ? <Check aria-hidden className="size-3.5" /> : <CircleX aria-hidden className="size-3.5" />}
              </span>
              <span className="flex-1">{t.steps[s.name] ?? s.name}</span>
              {s.simulated && <SimulatedBadge />}
            </motion.li>
          ))}
        </ol>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: finalDelay, duration: 0.2, ease: "easeOut" }}
        className="flex flex-col items-center gap-2 py-2 text-center"
        data-testid={paid ? "checkout-success" : "checkout-declined"}
      >
        {paid ? (
          <svg viewBox="0 0 52 52" className="size-16" aria-hidden>
            <circle cx="26" cy="26" r="24" className="fill-ok" />
            <motion.path
              d="M15 27l7 7 15-15"
              fill="none"
              stroke="white"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: finalDelay + 0.1, duration: 0.25 }}
            />
          </svg>
        ) : (
          <CircleX aria-hidden className="size-14 text-block" />
        )}
        <p className="text-xl font-bold">{paid ? t.paid : t.declined}</p>
        <p className="text-base text-muted-foreground">{paid ? t.paidHint : res.reason}</p>
        {paid && res.visaRef && (
          <p className="text-sm text-muted-foreground">
            {t.ref}: <span className="font-mono">{res.visaRef}</span>
          </p>
        )}
        <Button size="lg" variant={paid ? "default" : "outline"} className="mt-2 h-12 w-full text-base" onClick={paid ? onDone : onRetry}>
          {paid ? t.done : t.tryAgain}
        </Button>
      </motion.div>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: "risk" | "blocked";
  icon: typeof TriangleAlert;
  title: string;
  body: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-4",
        tone === "risk" ? "border-risk/40 bg-risk-soft text-risk-strong" : "border-block/40 bg-block-soft text-block-strong"
      )}
    >
      <p className="flex items-center gap-2 font-bold">
        <Icon aria-hidden className="size-5" /> {title}
      </p>
      <p className="mt-1 text-base">{body}</p>
    </div>
  );
}
