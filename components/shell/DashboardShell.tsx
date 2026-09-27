"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FixtureBadge, ThemeToggle } from "@/components/AppHeader";
import { BRAND } from "@/components/brand";
import { SpinningPill } from "@/components/landing/pill/SpinningPill";
import { useDemoRole, type DemoRole } from "@/components/role";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Dashboard shell for the three portals (reference: a quiet left rail with
// grouped plain-text navigation, a title with an inline muted subtitle, and a
// grid of hairline cards). Echo palette and type; visual only.

export type Portal = "doctor" | "patient" | "pharma";
export type ShellSection = { id: string; label: string };

const ROLE_INITIAL: Record<DemoRole, string> = { doctor: "D", patient: "P", pharma: "Ph" };

type Lang = "en" | "es";
const L = {
  en: {
    onPage: "On this page",
    synthetic: "Synthetic data",
    honesty: "Synthetic patients. The insurer, Medvantx and Visa are simulated.",
    home: "Home",
    open: "Open navigation",
    close: "Close navigation",
    nav: "Navigation",
  },
  es: {
    onPage: "En esta página",
    synthetic: "Datos sintéticos",
    honesty: "Pacientes sintéticos. El seguro, Medvantx y Visa son simulados.",
    home: "Inicio",
    open: "Abrir navegación",
    close: "Cerrar navegación",
    nav: "Navegación",
  },
} satisfies Record<Lang, unknown>;

function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVG mark */}
      <img src="/echo-pill.svg" alt="" aria-hidden className="size-8" draggable={false} />
      <span className="font-wordmark text-2xl leading-none tracking-wide">{BRAND.name.toUpperCase()}</span>
      <span className="sr-only"> by {BRAND.maker}, home</span>
    </Link>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 text-[0.95rem] text-muted-foreground">{label}</p>
      <ul className="mt-1.5 flex flex-col">{children}</ul>
    </div>
  );
}

const itemCls =
  "flex min-h-10 items-center gap-2 rounded-lg px-1 text-[1.05rem] transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

function Rail({
  sections,
  items,
  lang,
  onNavigate,
}: {
  sections: ShellSection[];
  /** Extra rail entries (e.g. the patient's Check-in tab). */
  items?: React.ReactNode;
  lang: Lang;
  onNavigate?: () => void;
}) {
  const role = useDemoRole();
  const t = L[lang];
  return (
    <div className="flex h-full flex-col gap-9 px-5 py-6">
      <div className="flex items-center justify-between gap-2">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="size-10 rounded-full bg-muted" />
          {role && (
            <span
              title={`Signed in as ${role}`}
              className="grid size-10 place-items-center rounded-full bg-[var(--echo-accent)] text-sm font-medium text-white dark:text-[#0e131a]"
            >
              {ROLE_INITIAL[role]}
              <span className="sr-only"> (signed in as {role})</span>
            </span>
          )}
        </div>
      </div>

      <nav aria-label="On this page" className="flex flex-col gap-8">
        {items && <div className="flex flex-col">{items}</div>}
        {sections.length > 0 && (
          <NavGroup label={t.onPage}>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={onNavigate} className={cn(itemCls, "text-foreground/75")}>
                  <span aria-hidden className="size-1.5" />
                  {s.label}
                </a>
              </li>
            ))}
          </NavGroup>
        )}
      </nav>

      {/* The empty stretch of the rail: an interactive, always-spinning pill. */}
      <div className="flex min-h-[15rem] flex-1 items-center justify-center">
        <SpinningPill glow big className="aspect-square w-full max-w-[17rem]" />
      </div>

      <div className="flex flex-col gap-5">
        {/* "Sponsored"-style slot: our honesty note. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVG mark */}
              <img src="/echo-pill.svg" alt="" aria-hidden className="size-8" draggable={false} />
            </span>
            <span className="leading-tight">
              <span className="block text-[0.95rem]">{BRAND.full}</span>
              <span className="block text-sm text-muted-foreground">{t.synthetic}</span>
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.honesty}</p>
          <FixtureBadge />
        </div>
        <div className="flex items-center justify-between border-t border-line pt-4 text-sm text-muted-foreground">
          <span>© 2026</span>
          <span className="flex gap-4">
            <Link href="/" className="inline-flex min-h-10 items-center rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
              {t.home}
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  portal,
  lang = "en",
  title,
  subtitle,
  sections = [],
  railItems,
  mobileBar,
  actions,
  children,
}: {
  portal: Portal;
  /** Rail language (the patient portal is bilingual). */
  lang?: Lang;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  sections?: ShellSection[];
  /** Extra rail entries (desktop rail and phone menu). */
  railItems?: React.ReactNode;
  /** Extra control beside the phone menu button. */
  mobileBar?: React.ReactNode;
  /** Right side of the title row (toggles, badges). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div lang={lang} data-portal={portal} className="flex min-h-full flex-1 bg-background">
      {/* Rail (desktop) */}
      <aside aria-label="Echo navigation" className="sticky top-0 hidden h-svh w-[19rem] shrink-0 overflow-y-auto lg:block">
        <Rail sections={sections} items={railItems} lang={lang} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (phones/tablets) */}
        <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex items-center justify-between gap-2 border-b border-line bg-background/90 px-4 py-2 backdrop-blur-md lg:hidden">
          <Wordmark />
          <div className="ml-auto flex items-center gap-2">{mobileBar}</div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label={L[lang].open}
              className="grid size-11 place-items-center rounded-full bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <Menu aria-hidden className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-[19rem] p-0 data-[side=left]:w-[19rem]">
              <SheetTitle className="sr-only">{L[lang].nav}</SheetTitle>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={L[lang].close}
                className="absolute top-4 right-3 z-10 grid size-11 place-items-center rounded-full bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <X aria-hidden className="size-5" />
              </button>
              <Rail sections={sections} items={railItems} lang={lang} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>

        <main className="flex min-w-0 flex-1 flex-col px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[1.6rem] font-medium tracking-[-0.01em]">{title}</span>
              {subtitle && <span className="text-[1.05rem] font-normal text-muted-foreground">{subtitle}</span>}
            </h1>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <div className="mt-6 flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Card in the dashboard grid: rounded, hairline, quiet. `feature` makes the
 * dark showcase card (the reference's glowing tile), scoped to dark tokens.
 */
export function DashCard({
  id,
  title,
  meta,
  feature = false,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title?: React.ReactNode;
  /** Right side of the card head: counts, badges, circular actions. */
  meta?: React.ReactNode;
  feature?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "glow-hover relative min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border",
        feature
          ? "dark border-transparent bg-[#0b0f14] text-foreground shadow-[0_30px_80px_-40px_rgba(14,19,26,0.8)]"
          : "border-line bg-card",
        className
      )}
    >
      {feature && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[var(--echo-accent)] opacity-25 blur-3xl"
        />
      )}
      {(title || meta) && (
        <div className="relative flex items-center justify-between gap-3 px-5 pt-5">
          {title && <h2 className="text-[1.05rem] font-normal">{title}</h2>}
          {meta && <div className="flex items-center gap-2">{meta}</div>}
        </div>
      )}
      <div className={cn("relative p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
