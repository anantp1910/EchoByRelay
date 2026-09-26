import { ArrowRight, BarChart3, HeartHandshake, Stethoscope, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { RelayMark, ThemeToggle } from "@/components/AppHeader";
import { MARIA_ID } from "@/lib/demo/constants";

const PORTALS: { href: string; title: string; who: string; body: string; icon: LucideIcon }[] = [
  {
    href: "/doctor",
    title: "Doctor",
    who: "Prescribers and staff",
    body: "Say one sentence. Watch coverage, routing, and the prior authorization happen live, and approve with a word.",
    icon: Stethoscope,
  },
  {
    href: `/patient/${MARIA_ID}`,
    title: "Patient",
    who: "Patients and their care circle",
    body: "The plan in your own language, where your medicine is, and a family member who can help pay.",
    icon: HeartHandshake,
  },
  {
    href: "/pharma",
    title: "Pharma",
    who: "Manufacturer teams",
    body: "Scripts rescued, days to therapy, reach into rural ZIP codes, and a full audit trail.",
    icon: BarChart3,
  },
];

const SPONSORS = ["Impiricus", "Medvantx", "Visa", "xAI Grok", "Meta", "Aramco"];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
        <RelayMark />
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 lg:px-8">
        <section className="grid items-end gap-10 py-12 lg:grid-cols-[1.4fr_1fr] lg:py-20">
          <div>
            <p className="mb-4 text-sm font-bold tracking-widest text-primary uppercase">Access router</p>
            <h1 className="text-4xl leading-[1.05] font-bold text-balance sm:text-6xl">
              Relay doesn&apos;t take notes. It gets the medicine to the patient.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Relay carries every prescription from the doctor&apos;s decision to the patient&apos;s hands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/doctor"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open the doctor portal <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href={`/patient/${MARIA_ID}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-5 font-medium hover:bg-muted"
              >
                See Maria&apos;s phone
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card p-6 lg:p-8">
            <p className="font-heading text-7xl font-bold text-primary tabular sm:text-8xl">29%</p>
            <p className="mt-3 text-lg">Almost a third of new branded prescriptions never reach the patient.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Most drop between the doctor&apos;s decision and the pharmacy counter: prior auth, copay shock,
              and nobody watching the handoff.
            </p>
          </div>
        </section>

        <section aria-labelledby="portals" className="pb-16">
          <h2 id="portals" className="sr-only">
            Portals
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {PORTALS.map(({ href, title, who, body, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-full flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-primary/50"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="mt-4 font-heading text-xl font-bold">{title}</span>
                  <span className="text-sm text-muted-foreground">{who}</span>
                  <span className="mt-3 flex-1 text-[0.95rem]">{body}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p className="max-w-2xl" data-testid="honesty-line">
            The insurer and Medvantx are simulated with shapes that mirror the real systems. All patient data is
            synthetic. Clinical content comes only from the FDA drug label.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 font-medium" aria-label="Sponsors">
            {SPONSORS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
