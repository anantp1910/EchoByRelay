import { CountUpInView, Reveal } from "./motion";

const SPONSORS = ["Impiricus", "Medvantx", "Visa", "xAI Grok", "Meta", "Aramco"];

/** Why it matters: the 29% stat and the honesty line (verbatim). */
export function Closing() {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-8 border-t border-line pt-[clamp(6rem,14vh,10rem)] pb-16">
      <h2 id="why-title" className="text-[0.8rem] font-medium tracking-[0.08em] uppercase">
        Why it matters
      </h2>
      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <Reveal>
          <p className="text-[clamp(6rem,17vw,15rem)] leading-[0.85] font-normal tracking-[-0.06em] tabular">
            <CountUpInView to={29} suffix="%" />
          </p>
          <p className="mt-6 max-w-md text-xl leading-snug">Almost a third of new branded prescriptions never reach the patient.</p>
        </Reveal>
        <div className="flex flex-col gap-6 text-sm text-muted-foreground">
          <p className="max-w-xl leading-relaxed" data-testid="honesty-line">
            The insurer and Medvantx are simulated with shapes that mirror the real systems. All patient data is synthetic.
            Clinical content comes only from the FDA drug label.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs tracking-[0.12em] uppercase" aria-label="Sponsors">
            {SPONSORS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
