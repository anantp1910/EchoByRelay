"use client";

import { AlertTriangle, Check, CreditCard, Fingerprint, Mic, Package, Repeat, ShieldCheck } from "lucide-react";

import { BRAND } from "@/components/brand";
import { DEMO_DRUG } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { CountUpInView } from "./motion";

// The landing names no one: roles only. (DEMO_PHRASE contains the patient's
// name, so the spoken line is rebuilt from the drug fields.)
const SPOKEN = `Continue her on ${DEMO_DRUG.name}, ${DEMO_DRUG.dose} daily`;

// Presentational mini-mockups for the storyboard and portal tiles. Synthetic
// content from lib/demo/constants; mock-backed steps carry "Simulated".

const card = "rounded-2xl border border-line bg-card p-5 shadow-[0_24px_60px_-30px_rgba(40,48,64,0.35)]";
const label = "text-[0.7rem] font-medium tracking-[0.12em] text-muted-foreground uppercase";

function Sim() {
  return <span className="rounded border border-line px-1.5 text-[0.65rem] leading-5 text-muted-foreground">Simulated</span>;
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="grid size-5 place-items-center rounded-full bg-[var(--echo-accent)] text-white dark:text-[#0e131a]">
        <Check aria-hidden className="size-3.5" />
      </span>
      {children}
    </li>
  );
}

export function DoctorMock() {
  return (
    <div className={cn(card, "w-full max-w-sm")}>
      <p className={label}>The doctor</p>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <Mic aria-hidden className="size-5" />
        </span>
        <p className="text-base leading-snug">“{SPOKEN}.”</p>
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        <Tick>Understood: {DEMO_DRUG.name} {DEMO_DRUG.dose}</Tick>
      </ul>
    </div>
  );
}

export function WallMock() {
  return (
    <div className={cn(card, "w-full max-w-sm")}>
      <div className="flex items-center justify-between">
        <p className={label}>Coverage check</p>
        <Sim />
      </div>
      <p className="mt-4 flex items-center gap-2 text-lg font-medium">
        <ShieldCheck aria-hidden className="size-5 text-muted-foreground" /> Prior authorization required
      </p>
      <p className="mt-3 font-[family-name:var(--font-figtree)] text-6xl font-light tracking-tight">
        $480<span className="text-xl text-muted-foreground">/month</span>
      </p>
    </div>
  );
}

export function PathMock() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className={cn(card, "flex items-center gap-3")}>
        <Package aria-hidden className="size-6 text-[var(--echo-accent)]" />
        <div className="flex-1">
          <p className="font-medium">Medvantx Bridge</p>
          <p className="text-sm text-muted-foreground">Free 30-day supply, shipping</p>
        </div>
        <Sim />
      </div>
      <div className={card}>
        <p className={label}>Prior authorization · draft</p>
        {/* Placeholder lines: no clinical wording outside the real, cited letter. */}
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          {[92, 78, 86, 60].map((w, i) => (
            <p key={i} className="flex items-center gap-1.5">
              <span className="h-2 rounded-full bg-muted" style={{ width: `${w}%` }} />
              {i < 3 && <sup className="font-mono text-xs text-[var(--echo-accent)]">[{i + 1}]</sup>}
            </p>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Every claim cited to the FDA label</p>
      </div>
    </div>
  );
}

export function PhoneMock() {
  return (
    <div className="w-[15.5rem] rounded-[2.4rem] border-[6px] border-foreground/85 bg-card p-4 shadow-[0_30px_70px_-30px_rgba(40,48,64,0.45)]" lang="es">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-foreground/15" />
      <p className={label}>Hola</p>
      <p className="mt-2 font-[family-name:var(--font-figtree)] text-2xl leading-tight font-light">Su medicina está en camino</p>
      <ol className="mt-4 flex flex-col gap-2 text-sm">
        {["Recetada", "Plan aprobado", "En camino"].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", i < 2 ? "bg-[var(--echo-accent)]" : "ring-2 ring-[var(--echo-accent)]")} />
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-snug">
        Le enviamos un suministro gratis de 30 días mientras su seguro lo revisa.
      </p>
    </div>
  );
}

export function CliffMock() {
  return (
    <div className={cn(card, "w-full max-w-sm border-risk/50")}>
      <p className="flex items-center gap-2 font-medium text-risk-strong">
        <AlertTriangle aria-hidden className="size-5" /> Day 24 · Watchdog
      </p>
      <p className="mt-3 text-xl leading-snug font-medium">PA denied. The bridge ends in 6 days.</p>
      <p className="mt-2 text-sm text-muted-foreground">New path found: Medvantx Cash Pay</p>
    </div>
  );
}

export function PayMock() {
  return (
    <div className={cn(card, "w-full max-w-sm")}>
      <div className="flex items-center justify-between">
        <p className={cn(label, "flex items-center gap-1.5")}>
          <CreditCard aria-hidden className="size-3.5" /> Her daughter · approve payment
        </p>
        <Sim />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Medvantx Cash Pay · spending cap</p>
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div className="h-full w-2/3 rounded-full bg-foreground" />
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm">
        <Repeat aria-hidden className="size-4 text-muted-foreground" /> Refill every month
      </p>
      <p className="mt-4 flex items-center justify-center gap-2 rounded-full bg-foreground py-3 text-sm font-medium text-background">
        <Fingerprint aria-hidden className="size-4" /> Simulated passkey
      </p>
    </div>
  );
}

export function KeptMock() {
  return (
    <div className={cn(card, "w-full max-w-sm")}>
      <p className={label}>Pharma · scripts rescued</p>
      <p className="mt-2 font-[family-name:var(--font-figtree)] text-8xl leading-none font-light tracking-tight text-[var(--echo-accent)]">
        <CountUpInView to={1} prefix="+" />
      </p>
      <p className="mt-3 text-sm text-muted-foreground">One more patient kept on therapy · illustrative</p>
    </div>
  );
}

export const SCENE_MOCKS = [DoctorMock, WallMock, PathMock, PhoneMock, CliffMock, PayMock, KeptMock];

/** Tiny portal previews for the portal tiles. */
export function PortalPreview({ kind }: { kind: "doctor" | "patient" | "pharma" }) {
  if (kind === "doctor")
    return (
      <div className="flex flex-col gap-2">
        {["Coverage checked", "Bridge found", "PA drafted · 3 citations"].map((s) => (
          <p key={s} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm shadow-sm">
            <span className="size-2 rounded-full bg-[var(--echo-accent)]" /> {s}
          </p>
        ))}
        <p className="mt-1 rounded-lg border border-[var(--echo-accent)]/50 bg-card px-3 py-2 text-sm font-medium">Waiting on your approval</p>
      </div>
    );
  if (kind === "patient")
    return (
      <div className="mx-auto w-40 rounded-[1.6rem] border-4 border-foreground/80 bg-card p-3 text-left" lang="es">
        <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Hola</p>
        <p className="mt-1 font-[family-name:var(--font-figtree)] text-base leading-tight font-light">Su medicina está en camino</p>
        <div className="mt-2 flex gap-1">
          {[1, 1, 0].map((on, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", on ? "bg-[var(--echo-accent)]" : "bg-muted")} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="text-left">
      <p className="text-[0.65rem] tracking-widest text-[#b3bdcc] uppercase">Prescriptions rescued</p>
      <p className="font-[family-name:var(--font-figtree)] text-6xl leading-none font-light text-[#5fe6da]">42</p>
      <svg viewBox="0 0 200 50" className="mt-3 w-full" aria-hidden>
        <path d="M0 45 C 40 42, 70 36, 100 28 S 160 10, 200 4" fill="none" stroke="#5fe6da" strokeWidth="2" />
      </svg>
      <p className="mt-1 text-[0.6rem] tracking-widest text-[#b3bdcc] uppercase">Sample data · {BRAND.name}</p>
    </div>
  );
}
