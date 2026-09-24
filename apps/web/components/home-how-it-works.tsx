import Link from "next/link";

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "1",
    title: "Reads the token's Token-2022 config on chain",
    body: "Every mint's scaledUiAmountConfig, transferFeeConfig and pausableConfig extensions are decoded directly from the mint account, batched through getMultipleAccountsInfo. The conversion deadline comes from PreStocks' own published lifecycle, never a calendar someone has to remember to update.",
  },
  {
    n: "2",
    title: "One transaction through the issuer's direct conversion pool",
    body: "Conversion is a single versioned transaction against the issuer's own pool, not a swap aggregator route. The holder signs once; there is no multi-step approval flow to abandon halfway through.",
  },
  {
    n: "3",
    title: "A fee sponsor covers wallets with no SOL",
    body: "When a wallet holds tokens but no SOL to pay a network fee, a separate sponsor keypair sets itself as fee payer and co-signs, so the holder still converts without buying SOL first.",
  },
];

/** Three steps, the real mechanism, each pointing at the check that proves it. */
export function HomeHowItWorks(): React.ReactNode {
  return (
    <section aria-label="How it works" className="mt-12 min-w-0 sm:mt-16">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">How it works</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {STEPS.map((step) => (
          <div key={step.n} className="min-w-0">
            <p className="num text-2xl font-bold text-[var(--text-3)]">{step.n}</p>
            <h3 className="mt-2 text-base font-bold leading-snug text-[var(--text)]">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">{step.body}</p>
            <Link href="/proof" className="mt-3 inline-block text-sm underline">
              See the proof
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
