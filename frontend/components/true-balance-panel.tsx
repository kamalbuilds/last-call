import { SolscanLink } from "@/components/solscan-link";
import { shorten } from "@/lib/ledger";
import { getTrueBalances, type TrueBalanceHolding } from "@/app/api/true-balance/data";

function formatNum(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function HoldingRow({ holding }: { holding: TrueBalanceHolding }): React.ReactNode {
  const gained = holding.gainFromDividendsPct > 0;
  return (
    <div className="min-w-0 border-t border-[var(--line)] py-3 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="num text-sm font-bold text-[var(--text)]">{holding.symbol}</p>
        <p className="num text-xs text-[var(--text-3)]">
          <SolscanLink address={holding.mint} short={shorten(holding.mint)} />
        </p>
        {gained && (
          <span className="chip num ml-auto" style={{ color: "var(--boarding)", borderColor: "var(--boarding)" }}>
            +{formatNum(holding.gainFromDividendsPct)}% FROM DIVIDENDS
          </span>
        )}
      </div>
      <dl className="num mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-[var(--text-3)]">Raw</dt>
          <dd className="text-[var(--text-2)]">{formatNum(holding.raw)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--text-3)]">Multiplier</dt>
          <dd className="text-[var(--text)]">{formatNum(holding.multiplier)}x</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--text-3)]">True balance</dt>
          <dd className="font-bold text-[var(--text)]">{formatNum(holding.trueBalance)}</dd>
        </div>
        {holding.lastChange !== null && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-3)]">Last change</dt>
            <dd className="text-[var(--text-2)]">{holding.lastChange.slice(0, 10)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * A wallet's xStock and PreStocks holdings corrected for the in-force
 * Token-2022 scaledUiAmountConfig multiplier, so a dividend or split shows up
 * as gain instead of vanishing into a stale raw number.
 */
export async function TrueBalancePanel({ wallet }: { wallet: string }): Promise<React.ReactNode> {
  try {
    const holdings = await getTrueBalances(wallet);
    if (holdings.length === 0) return null;
    return (
      <section aria-label="True balance" className="card mt-6 min-w-0 p-4 sm:p-6">
        <h2 className="text-[20px] font-bold text-[var(--text)]">True balance</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
          Raw balance times the multiplier in force right now, for every dividend and split.
          Wallets and explorers that ignore the multiplier show the raw number below, not this one.
        </p>
        <div className="mt-2">
          {holdings.map((holding) => (
            <HoldingRow key={holding.mint} holding={holding} />
          ))}
        </div>
      </section>
    );
  } catch (err) {
    return (
      <section aria-label="True balance" className="card mt-6 min-w-0 p-4 sm:p-6">
        <h2 className="text-[20px] font-bold text-[var(--text)]">True balance</h2>
        <p className="mt-2 text-sm text-[var(--closed)]">
          Could not read true balances right now: {err instanceof Error ? err.message : String(err)}
        </p>
      </section>
    );
  }
}
