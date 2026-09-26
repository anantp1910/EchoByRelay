"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, HeartHandshake, Stethoscope, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { ThemeToggle } from "@/components/AppHeader";
import { BRAND } from "@/components/brand";
import { setDemoRole, type DemoRole } from "@/components/role";
import { DEMO_PRESCRIBER, MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

// Role-only sign-in: no personal names on this page. Emails use the reserved
// .example domain so they can never belong to a real person.
const ROLES: { role: DemoRole; title: string; sub: string; email: string; href: string; icon: LucideIcon }[] = [
  {
    role: "doctor",
    title: "Doctor",
    sub: `${DEMO_PRESCRIBER.specialty} · ${DEMO_PRESCRIBER.clinic}`,
    email: "doctor@clinic.example",
    href: "/doctor",
    icon: Stethoscope,
  },
  {
    role: "patient",
    title: "Patient & caregiver",
    sub: "The patient's phone in Spanish, and the caregiver's view",
    email: "patient@family.example",
    href: `/patient/${MARIA_ID}`,
    icon: HeartHandshake,
  },
  {
    role: "pharma",
    title: "Pharma",
    sub: "Scripts rescued, time to therapy, audit trail",
    email: "insights@pharma.example",
    href: "/pharma",
    icon: BarChart3,
  },
];

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const emailId = useId();
  // Preselect from the landing's top labels (/signin?role=patient, ...).
  const [role, setRole] = useState<DemoRole>(() => {
    const r = params.get("role");
    return r === "patient" || r === "pharma" ? r : "doctor";
  });
  const [going, setGoing] = useState(false);
  const chosen = ROLES.find((r) => r.role === role) ?? ROLES[0];

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setGoing(true);
    setDemoRole(chosen.role); // remembers the chosen role only; not authentication
    router.push(chosen.href);
  }

  return (
    <>
      <header className="flex items-center justify-between px-5 py-4 sm:px-10">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
          <ArrowLeft aria-hidden className="size-4" /> Back to {BRAND.name}
        </Link>
        <ThemeToggle className="size-11 rounded-full" />
      </header>

      <main className="grid flex-1 place-items-center px-5 pb-16">
        <motion.form
          onSubmit={onContinue}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-2xl border border-line bg-card p-7 shadow-[0_30px_80px_-40px_rgba(40,48,64,0.45)] sm:p-9"
          aria-labelledby="signin-title"
        >
          <p className="font-wordmark text-3xl tracking-wide">
            {BRAND.name.toUpperCase()} <span className="font-sans text-sm tracking-normal text-muted-foreground">by {BRAND.maker}</span>
          </p>
          <h1 id="signin-title" className="mt-6 font-[family-name:var(--font-figtree)] text-3xl font-light tracking-[-0.01em]">
            Sign in to {BRAND.name}
          </h1>

          <fieldset className="mt-7">
            <legend className="text-sm font-medium">Continue as</legend>
            <div role="radiogroup" aria-label="Continue as" className="mt-3 flex flex-col gap-2">
              {ROLES.map(({ role: r, title, sub, icon: Icon }) => {
                const on = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setRole(r)}
                    data-testid={`signin-${r}`}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      on ? "border-[var(--echo-accent)] bg-[var(--accent)]" : "border-line hover:bg-muted"
                    )}
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full border", on ? "border-[var(--echo-accent)] text-[var(--echo-accent)]" : "border-line text-muted-foreground")}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{title}</span>
                      <span className="block text-sm text-muted-foreground">{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label htmlFor={emailId} className="mt-6 block text-sm font-medium">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            readOnly
            value={chosen.email}
            data-testid="signin-email"
            className="mt-2 h-12 w-full rounded-xl border border-line bg-muted px-4 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Prefilled address. No password needed.</p>

          <motion.button
            type="submit"
            disabled={going}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            data-testid="signin-continue"
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-base text-background focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-70"
          >
            Continue <ArrowRight aria-hidden className="size-4" />
          </motion.button>
        </motion.form>
      </main>
    </>
  );
}
