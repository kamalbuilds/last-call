interface Point {
  title: string;
  body: string;
}

const POINTS: Point[] = [
  {
    title: "Token-2022 extensions, read directly",
    body: "scaledUiAmountConfig, transferFeeConfig and pausableConfig live on the mint account itself. No oracle, no indexer, no issuer API to trust for the numbers that matter.",
  },
  {
    title: "A fee payer separate from the owner",
    body: "Solana lets a transaction's signer and its fee payer be different keys. A sponsor can cover network fees for a wallet that holds tokens but no SOL, without custody of the tokens.",
  },
  {
    title: "Blinks turn a conversion into a link",
    body: "A Solana Action is a URL that builds a real transaction. Paste it into X, Discord or Phantom and the conversion runs there, no visit to this site required.",
  },
];

/** Three concrete, checkable reasons this needs Solana specifically. */
export function HomeWhySolana(): React.ReactNode {
  return (
    <section aria-label="Why Solana" className="mt-12 min-w-0 sm:mt-16">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Why Solana</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {POINTS.map((point) => (
          <div key={point.title} className="min-w-0 border-t border-[var(--line)] pt-3">
            <h3 className="text-base font-bold leading-snug text-[var(--text)]">{point.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
