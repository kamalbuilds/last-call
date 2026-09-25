import type { TermsJson } from "@/lib/terms";
import { shorten } from "@/lib/ledger";

/** Live Token-2022 terms for one holding, read on-chain. Data arrives as props so the server parent pays for one decode per mint. */
export function TermsPanel({
  mint,
  terms,
}: {
  mint: string;
  terms: TermsJson | null;
}): React.ReactNode {
  if (terms === null) {
    return (
      <section
        aria-label="Token terms"
        className="mt-4 min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-2)] p-3"
      >
        <h4 className="text-sm font-bold text-[var(--text)]">Token terms, read on-chain</h4>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Could not read token terms for {shorten(mint)} right now.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-label="Token terms"
      className="mt-4 min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-2)] p-3"
    >
      <h4 className="text-sm font-bold text-[var(--text)]">Token terms, read on-chain</h4>
      <dl className="mt-2 flex min-w-0 flex-col gap-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-[var(--text-3)]">Transfer fee</dt>
          <dd className="num min-w-0 text-right text-[var(--text)]">
            {terms.transferFeeBps} bps
            <span className="ml-2 text-xs text-[var(--text-2)]">
              {terms.pendingBps === null
                ? "in force"
                : `in force, ${terms.pendingBps} bps from epoch ${terms.pendingActivationEpoch}`}
            </span>
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-[var(--text-3)]">Permanent delegate</dt>
          <dd className="min-w-0 text-right text-[var(--text)]">
            {terms.permanentDelegate === null ? (
              <span className="num text-[var(--text-2)]">None</span>
            ) : (
              <a
                href={`https://solscan.io/account/${terms.permanentDelegate}`}
                title={terms.permanentDelegate}
                target="_blank"
                rel="noreferrer"
                className="num break-all underline"
              >
                {shorten(terms.permanentDelegate)}
              </a>
            )}
          </dd>
        </div>
        {terms.permanentDelegate !== null && (
          <p className="text-xs leading-relaxed text-[var(--text-2)]">
            The issuer can move or burn these tokens.
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-[var(--text-3)]">Paused</dt>
          <dd className="num text-[var(--text)]">{terms.paused ? "yes" : "no"}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-[var(--text-3)]">Multiplier</dt>
          <dd className="num text-[var(--text)]">{terms.multiplier}x</dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-[var(--text-3)]">Freeze authority</dt>
          <dd className="min-w-0 text-right">
            {terms.freezeAuthority === null ? (
              <span className="num text-[var(--text-2)]">None</span>
            ) : (
              <a
                href={`https://solscan.io/account/${terms.freezeAuthority}`}
                title={terms.freezeAuthority}
                target="_blank"
                rel="noreferrer"
                className="num break-all text-[var(--text)] underline"
              >
                {shorten(terms.freezeAuthority)}
              </a>
            )}
          </dd>
        </div>
        <p className="num text-xs text-[var(--text-3)]">read at slot {terms.readAtSlot}</p>
      </dl>
    </section>
  );
}
