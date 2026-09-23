import type { Metadata } from "next";
import Link from "next/link";
import { getHoldings, type HoldingRow } from "@lastcall/holdings";
import { Countdown } from "@/components/countdown";
import { HomeClient } from "@/components/home-client";
import {
  conversionTargetSymbol,
  formatBalance,
  formatReceive,
  isDustWithoutQuote,
  sortHoldings,
} from "@/lib/holdings-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Last call for pre-IPO holders",
};

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const STRANDED_WALLET = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";

function formatAmount(amount: number): string {
  return formatBalance(amount);
}

function LookupRow({ row, rows }: { row: HoldingRow; rows: HoldingRow[] }): React.ReactNode {
  const target = conversionTargetSymbol(row.convertsInto, rows);
  const muted = isDustWithoutQuote(row);
  return (
    <article className={`border border-[#ffb000]/25 bg-[#12100c] p-4${muted ? " opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">
          {row.symbol}{" "}
          <span className="num text-sm font-normal">× {formatAmount(row.amount)}</span>
        </h3>
        <span className="text-xs tracking-[0.2em] text-[#8a6100]">
          {row.status === "expired"
            ? "GATE CLOSED"
            : row.status === "converting"
              ? "BOARDING"
              : "NOT SCHEDULED"}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#ffb000]/80">
        Status: {row.status}
        {row.deadline === null ? (
          <> · No conversion deadline scheduled.</>
        ) : (
          <>
            {" "}· Deadline <span className="num">{row.deadline.slice(0, 10)}</span> (
            <Countdown deadline={row.deadline} />)
          </>
        )}
      </p>
      {row.convertsInto !== null && target !== null && (
        <p className="num mt-1 text-sm text-[#ffb000]/80">
          Converts into {target}
        </p>
      )}
      {row.quote !== null ? (
        <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">YOU RECEIVE</dt>
            <dd>{formatReceive(row.quote.outAmountUi, target)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">PRICE IMPACT</dt>
            <dd>
              {row.quote.priceImpactPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">TRANSFER FEE</dt>
            <dd>{(row.quote.transferFeeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[#8a6100]">No live quote right now.</p>
      )}
      {row.status === "expired" && (
        <p className="mt-3 text-sm text-[#ffb000]/80">
          Deadline passed. The issuer can remove these tokens at any time; converting now keeps the value.
        </p>
      )}
    </article>
  );
}

interface PageProps {
  searchParams?: Promise<{ wallet?: string | string[] }>;
}

export default async function HomePage({ searchParams }: PageProps): Promise<React.ReactNode> {
  const resolved = searchParams !== undefined ? await searchParams : undefined;
  const rawWallet = resolved?.wallet;
  const wallet = Array.isArray(rawWallet) ? rawWallet[0] ?? "" : (rawWallet ?? "");
  const lookupRequested = wallet !== "";

  let rows: HoldingRow[] | null = null;
  let lookupError: string | null = null;
  if (lookupRequested) {
    if (!ADDRESS_PATTERN.test(wallet)) {
      lookupError = "That does not look like a Solana wallet address.";
    } else {
      try {
        rows = await getHoldings(wallet);
      } catch (err) {
        lookupError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <header className="mb-2 flex items-baseline justify-between border-b border-[#ffb000]/25 pb-3">
          <span className="text-xs tracking-[0.3em]">DEPARTURES / PRE-IPO CONVERSIONS</span>
          <nav className="flex gap-4 text-xs tracking-[0.2em]">
            <Link className="underline underline-offset-4" href="/">
              HOME
            </Link>
            <Link className="underline underline-offset-4" href="/ledger">
              LEDGER
            </Link>
          </nav>
        </header>
        <h1 className="mt-6 text-2xl font-bold tracking-wide sm:text-3xl">
          Last call for pre-IPO holders
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#ffb000]/80">
          PreStocks pre-IPO tokens must be converted into the public stock token before their
          deadline, or they expire worthless. Look up any wallet below, or connect your wallet
          to convert before the gate closes.
        </p>
        <section className="mt-6 border border-[#ffb000]/25 bg-[#12100c] p-4">
          <h2 className="text-sm tracking-[0.3em] text-[#8a6100]">LOOK UP A WALLET</h2>
          <form method="get" action="/" className="mt-3 flex flex-wrap gap-2">
            <input
              name="wallet"
              placeholder="Paste a Solana wallet address"
              defaultValue={wallet}
              spellCheck={false}
              autoComplete="off"
              className="num min-w-0 flex-1 border border-[#8a6100] bg-[#0b0a08] px-3 py-2 text-sm text-[#ffb000] placeholder:text-[#8a6100]"
            />
            <button
              type="submit"
              className="border border-[#ffb000] px-4 py-2 text-sm font-bold tracking-[0.15em]"
            >
              LOOK UP
            </button>
          </form>
          <p className="mt-2 text-xs text-[#8a6100]">
            <Link
              className="underline underline-offset-4"
              href={`/?wallet=${STRANDED_WALLET}`}
            >
              See a real stranded wallet
            </Link>
          </p>
        </section>

        {lookupRequested && (
          <section className="mt-8">
            <h2 className="text-sm tracking-[0.3em] text-[#8a6100]">
              WALLET <span className="num">{wallet.slice(0, 4)}...{wallet.slice(-4)}</span>
            </h2>
            {lookupError !== null && <p className="mt-3 text-sm text-[#ff3b30]">{lookupError}</p>}
            {lookupError === null && rows !== null && rows.length === 0 && (
              <p className="mt-3 text-sm text-[#ffb000]/80">No PreStocks holdings in this wallet.</p>
            )}
            {lookupError === null && rows !== null && rows.length > 0 && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {sortHoldings(rows).map((row) => (
                  <LookupRow key={row.mint} row={row} rows={rows} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <HomeClient />
    </>
  );
}
