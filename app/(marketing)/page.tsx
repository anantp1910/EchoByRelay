import { RelayMark, ThemeToggle } from "@/components/AppHeader";
import { DemoSignIn } from "@/components/landing/DemoSignIn";
import { Hero } from "@/components/landing/Hero";
import { Journey } from "@/components/landing/Journey";

const SPONSORS = ["Impiricus", "Medvantx", "Visa", "xAI Grok", "Meta", "Aramco"];

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <RelayMark />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col">
        <Hero />
        <Journey />
        <DemoSignIn />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-16 lg:px-8">
          <div>
            <p className="font-heading text-[clamp(4.5rem,11vw,9rem)] leading-none font-bold text-primary tabular">29%</p>
            <p className="mt-3 max-w-sm text-lg">Almost a third of new branded prescriptions never reach the patient.</p>
          </div>
          <div className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p className="max-w-2xl" data-testid="honesty-line">
              The insurer and Medvantx are simulated with shapes that mirror the real systems. All patient data is
              synthetic. Clinical content comes only from the FDA drug label.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tracking-[0.14em] uppercase" aria-label="Sponsors">
              {SPONSORS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
