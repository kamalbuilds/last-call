import { getLedger } from "@/lib/ledger";
import { buildUniverse } from "@lastcall/events";

const CACHE_TTL_MS = 5 * 60 * 1000;
let universeCountCache: { at: number; count: number } | null = null;

// buildUniverse() hits PreStocks and Jupiter search live; cache the count
// here so every home-page load doesn't duplicate the fetch getUniverseFeed
// already makes for "What is due" below. ponytail: process-local cache, add
// a shared cache module if a second caller needs the same count.
async function watchedTokenCount(): Promise<number> {
  const now = Date.now();
  if (universeCountCache !== null && now - universeCountCache.at < CACHE_TTL_MS) {
    return universeCountCache.count;
  }
  const universe = await buildUniverse();
  universeCountCache = { at: now, count: universe.length };
  return universe.length;
}

interface Stat {
  value: string;
  label: string;
  source: string;
}

function StatBlock({ stat }: { stat: Stat }): React.ReactNode {
  return (
    <div className="min-w-0 border-t border-[var(--line)] pt-3 sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0 first:border-t-0 first:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <p className="num text-[28px] font-bold leading-none text-[var(--text)] sm:text-[40px]">{stat.value}</p>
      <p className="mt-2 text-sm text-[var(--text-2)]">{stat.label}</p>
      <p className="num mt-1 text-xs text-[var(--text-3)]">{stat.source}</p>
    </div>
  );
}

function ErrorBlock({ label, message }: { label: string; message: string }): React.ReactNode {
  return (
    <div className="min-w-0 border-t border-[var(--line)] pt-3 sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0 first:border-t-0 first:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <p className="num text-[28px] font-bold leading-none text-[var(--text-3)] sm:text-[40px]">n/a</p>
      <p className="mt-2 text-sm text-[var(--text-2)]">{label}</p>
      <p className="num mt-1 text-xs text-[var(--closed)]">{message}</p>
    </div>
  );
}

/** Below-the-fold stat strip: four live figures, each sourced to the read that produced it. */
export async function HomeStatStrip(): Promise<React.ReactNode> {
  let ledgerStats: Stat[] | null = null;
  let ledgerError: string | null = null;
  try {
    const ledger = await getLedger();
    const xai = ledger.tokens.find((t) => t.symbol === "XAI") ?? null;
    const spacex = ledger.tokens.find((t) => t.symbol === "SPACEX") ?? null;
    const expiredHolders = ledger.tokens
      .filter((t) => t.status === "expired")
      .reduce((sum, t) => sum + t.holderCount, 0);

    const strandedUsd =
      xai !== null && typeof xai.unconvertedUsd === "number"
        ? `$${Math.round(xai.unconvertedUsd).toLocaleString("en-US")}`
        : "n/a";
    ledgerStats = [
      {
        value: strandedUsd,
        label: "Stranded XAI, unconverted and still in wallets",
        source: "Source: PreStocks conversion API + Solana token supply + Jupiter Price v3, read live",
      },
      {
        value: expiredHolders.toLocaleString("en-US"),
        label: "Wallets holding a token whose deadline already passed",
        source: "Source: Jupiter holders API against packages/ledger's conversion lifecycle, read live",
      },
      {
        value: spacex !== null ? spacex.holderCount.toLocaleString("en-US") : "n/a",
        label: "SPACEX holders facing the 2027-03-12 deadline",
        source: "Source: Jupiter holders API for the SPACEX mint, read live",
      },
    ];
  } catch (err) {
    ledgerError = err instanceof Error ? err.message : String(err);
  }

  let watchedCount: number | null = null;
  let universeError: string | null = null;
  try {
    watchedCount = await watchedTokenCount();
  } catch (err) {
    universeError = err instanceof Error ? err.message : String(err);
  }

  return (
    <section aria-label="Live stats" className="mt-12 min-w-0 sm:mt-16">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Right now</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-4 sm:gap-0">
        {ledgerStats !== null ? (
          ledgerStats.map((stat) => <StatBlock key={stat.label} stat={stat} />)
        ) : (
          <>
            <ErrorBlock label="Stranded XAI, unconverted and still in wallets" message={`Ledger unavailable: ${ledgerError}`} />
            <ErrorBlock label="Wallets holding a token whose deadline already passed" message="Ledger unavailable right now" />
            <ErrorBlock label="SPACEX holders facing the 2027-03-12 deadline" message="Ledger unavailable right now" />
          </>
        )}
        {watchedCount !== null ? (
          <StatBlock
            stat={{
              value: watchedCount.toLocaleString("en-US"),
              label: "Stock tokens watched: PreStocks, xStocks and Ondo on Token-2022",
              source: "Source: Jupiter token search filtered to the verified Token-2022 issuers, read live",
            }}
          />
        ) : (
          <ErrorBlock label="Stock tokens watched" message={`Universe scan unavailable: ${universeError}`} />
        )}
      </div>
    </section>
  );
}
