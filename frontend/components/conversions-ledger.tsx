import Link from "next/link";
import { Suspense } from "react";
import { getConversions, type ConversionTrade, type ConversionsResponse } from "@/app/api/conversions/data";
import { SolscanLink } from "@/components/solscan-link";
import { shorten } from "@/lib/ledger";

const PUBLISHED_CONVERSION_RATIO = 0.7165;

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 9 });
}

function formatRatio(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function formatTime(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function TradeLinks({ trade }: { trade: ConversionTrade }): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <a
        href={`https://solscan.io/tx/${trade.signature}`}
        title={trade.signature}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open transaction ${trade.signature} on Solscan`}
        className="num whitespace-nowrap underline"
      >
        tx {trade.signature.slice(0, 10)}…
      </a>
      <SolscanLink address={trade.wallet} short={shorten(trade.wallet)} />
    </div>
  );
}

function DesktopConversionsTable({ trades }: { trades: ConversionTrade[] }): React.ReactNode {
  return (
    <div className="mt-4 hidden overflow-x-auto sm:block">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Latest XAI sells for SPACEX on the Meteora DLMM pool</caption>
        <thead>
          <tr className="border-b border-[var(--line)] text-xs text-[var(--text-3)]">
            <th scope="col" className="w-[18%] pb-2 font-normal">Time</th>
            <th scope="col" className="w-[14%] pb-2 text-right font-normal">XAI in</th>
            <th scope="col" className="w-[16%] pb-2 text-right font-normal">SPACEX out</th>
            <th scope="col" className="w-[12%] pb-2 text-right font-normal">Ratio</th>
            <th scope="col" className="w-[14%] pb-2 text-right font-normal">Shortfall</th>
            <th scope="col" className="w-[26%] pb-2 font-normal">Links</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.signature} className="border-b border-[var(--line)] align-top">
              <td className="num py-3 pr-3 text-xs text-[var(--text-2)]">
                <time dateTime={trade.time}>{formatTime(trade.time)}</time>
              </td>
              <td className="num py-3 pr-3 text-right text-xs text-[var(--text)]">{formatAmount(trade.xaiIn)}</td>
              <td className="num py-3 pr-3 text-right text-xs text-[var(--text)]">{formatAmount(trade.spacexOut)}</td>
              <td className="num py-3 pr-3 text-right text-xs text-[var(--text)]">{formatRatio(trade.realizedRatio)}</td>
              <td className="num py-3 pr-3 text-right text-xs text-[var(--text)]">{formatPercent(trade.shortfallPct)}</td>
              <td className="py-3 text-xs"><TradeLinks trade={trade} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileConversionsList({ trades }: { trades: ConversionTrade[] }): React.ReactNode {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:hidden">
      {trades.map((trade) => (
        <article key={trade.signature} className="card min-w-0 p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <time dateTime={trade.time} className="num text-xs text-[var(--text-2)]">{formatTime(trade.time)}</time>
            <TradeLinks trade={trade} />
          </div>
          <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-[var(--text-3)]">XAI in</dt>
              <dd className="mt-1 text-[var(--text)]">{formatAmount(trade.xaiIn)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-3)]">SPACEX out</dt>
              <dd className="mt-1 text-[var(--text)]">{formatAmount(trade.spacexOut)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-3)]">Realized ratio</dt>
              <dd className="mt-1 text-[var(--text)]">{formatRatio(trade.realizedRatio)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-3)]">Shortfall</dt>
              <dd className="mt-1 text-[var(--text)]">{formatPercent(trade.shortfallPct)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function ConversionsLedgerError(): React.ReactNode {
  return (
    <section aria-label="Real conversions on-chain" className="mt-12">
      <h2 className="num text-xl font-semibold text-[var(--text)]">Real conversions on-chain</h2>
      <div className="card mt-4 p-4 sm:p-6" role="status">
        <p className="text-sm text-[var(--closed)]">Live pool data is unavailable right now. Try again in a minute.</p>
        <Link href="/ledger" className="mt-3 inline-block text-sm underline">Reload the board</Link>
      </div>
    </section>
  );
}

function ConversionsLedgerEmpty({ source }: { source: string }): React.ReactNode {
  return (
    <section aria-label="Real conversions on-chain" className="mt-12">
      <h2 className="num text-xl font-semibold text-[var(--text)]">Real conversions on-chain</h2>
      <div className="card mt-4 p-4 sm:p-6">
        <p className="text-sm text-[var(--text-2)]">No XAI sells for SPACEX are indexed in the latest pool read.</p>
        <p className="mt-2 text-sm text-[var(--text-2)]">Check again after the next trade is indexed.</p>
        <Link href="/ledger" className="mt-3 inline-block text-sm underline">Reload the board</Link>
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">{source}</p>
    </section>
  );
}

function ConversionsLedgerView({ data }: { data: ConversionsResponse }): React.ReactNode {
  const trades = data.trades.slice(0, 10);
  if (trades.length === 0) return <ConversionsLedgerEmpty source={data.source} />;

  return (
    <section aria-label="Real conversions on-chain" className="mt-12">
      <h2 className="num text-xl font-semibold text-[var(--text)]">Real conversions on-chain</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
        The latest XAI sells for SPACEX from the Meteora DLMM pool, with each holder&apos;s received amount read from the trade.
      </p>
      <div className="mt-4 border-y border-[var(--line)] py-3">
        <p className="num text-sm text-[var(--text)]">
          Median shortfall: {data.medianShortfallPct === null ? "not available" : formatPercent(data.medianShortfallPct)}
        </p>
        {data.medianShortfallPct !== null && (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
            At the median, a holder received {formatPercent(Math.abs(data.medianShortfallPct))} {data.medianShortfallPct >= 0 ? "less" : "more"} than the {PUBLISHED_CONVERSION_RATIO} SPACEX-per-XAI published split ratio.
          </p>
        )}
      </div>
      <DesktopConversionsTable trades={trades} />
      <MobileConversionsList trades={trades} />
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-3)]">Source: {data.source}</p>
    </section>
  );
}

function ConversionsLedgerFallback(): React.ReactNode {
  return (
    <section aria-label="Real conversions on-chain" className="mt-12" aria-busy="true">
      <h2 className="num text-xl font-semibold text-[var(--text)]">Real conversions on-chain</h2>
      <div className="card mt-4 p-4 sm:p-6" role="status">
        <p className="text-sm text-[var(--text-2)]">Reading recent on-chain trades…</p>
      </div>
    </section>
  );
}

async function ConversionsLedgerContent(): Promise<React.ReactNode> {
  try {
    return <ConversionsLedgerView data={await getConversions("XAI")} />;
  } catch {
    return <ConversionsLedgerError />;
  }
}

export function ConversionsLedger(): React.ReactNode {
  return (
    <Suspense fallback={<ConversionsLedgerFallback />}>
      <ConversionsLedgerContent />
    </Suspense>
  );
}
