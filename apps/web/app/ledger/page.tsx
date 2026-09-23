import type { Metadata } from "next";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { daysSince, readLedger, shorten, type LedgerToken } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ledger board | Last call for pre-IPO holders",
};

type FlightStatus = "BOARDING" | "FINAL CALL" | "GATE CLOSED" | "NOT SCHEDULED";

const FINAL_CALL_MS = 30 * 86_400_000;

function flightStatus(token: LedgerToken, nowMs: number): FlightStatus {
  if (token.deadline === null) return "NOT SCHEDULED";
  if (Date.parse(token.deadline) <= nowMs) return "GATE CLOSED";
  if (Date.parse(token.deadline) - nowMs <= FINAL_CALL_MS) return "FINAL CALL";
  return "BOARDING";
}

function statusClass(status: FlightStatus): string {
  switch (status) {
    case "GATE CLOSED":
      return "text-[#ff3b30] border-[#ff3b30]";
    case "FINAL CALL":
      return "text-[#ffb000] border-[#ffb000]";
    case "BOARDING":
      return "text-[#ffb000] border-[#ffb000]/60";
    case "NOT SCHEDULED":
      return "text-[#8a6100] border-[#8a6100]/60";
  }
}

function formatDeadline(iso: string): string {
  return iso.slice(0, 10);
}

export default async function LedgerPage(): Promise<React.ReactNode> {
  const ledger = readLedger();
  const nowMs = Date.now();
  const withDeadline = ledger.tokens
    .filter((t) => t.deadline !== null)
    .sort((a, b) => Date.parse(a.deadline as string) - Date.parse(b.deadline as string));
  const withoutDeadline = ledger.tokens
    .filter((t) => t.deadline === null)
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
  const flights = [...withDeadline, ...withoutDeadline];
  const xai = ledger.tokens.find((t) => t.symbol === "XAI") ?? null;
  const topXai = (xai?.holders ?? []).slice().sort((a, b) => b.amount - a.amount).slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
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
        PreStocks pre-IPO tokens must be converted into the public stock token before the deadline
        printed on the board, or they expire worthless.
      </p>

      <div className="mt-8 overflow-x-auto border border-[#ffb000]/25 bg-[#12100c]">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#ffb000]/25 text-[11px] tracking-[0.25em] text-[#8a6100]">
              <th className="px-4 py-3 font-normal">TOKEN</th>
              <th className="px-4 py-3 font-normal">CONVERTS INTO</th>
              <th className="px-4 py-3 font-normal">DEADLINE</th>
              <th className="px-4 py-3 font-normal">STATUS</th>
              <th className="px-4 py-3 text-right font-normal">UNCONVERTED</th>
              <th className="px-4 py-3 text-right font-normal">HOLDERS</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((token) => {
              const status = flightStatus(token, nowMs);
              return (
                <tr key={token.mint} className="board-row">
                  <td className="px-4 py-3 font-bold">{token.symbol}</td>
                  <td className="px-4 py-3">{token.conversion?.intoSymbol ?? "--"}</td>
                  <td className="px-4 py-3">
                    {token.deadline === null ? (
                      <span className="text-[#8a6100]">--</span>
                    ) : (
                      <span className="num">
                        {formatDeadline(token.deadline)}{" "}
                        <span className="text-[#ffb000]/70">
                          (<Countdown deadline={token.deadline} />)
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block border px-2 py-0.5 text-xs ${statusClass(status)}`}>
                      {status}
                    </span>
                    {status === "GATE CLOSED" && token.deadline !== null && (
                      <div className="num mt-1 text-xs text-[#ff3b30]">
                        expired {daysSince(token.deadline, nowMs)} days ago
                      </div>
                    )}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {Math.round(token.unconvertedInWallets).toLocaleString("en-US")}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {token.holderCount.toLocaleString("en-US")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="num mt-2 text-xs text-[#8a6100]">
        Board data: packages/ledger/out/ledger.json, generated {ledger.generatedAt}. Unconverted
        counts are whole tokens still sitting in wallets.
      </p>

      {xai !== null && (
        <section className="mt-12">
          <h2 className="text-sm tracking-[0.3em] text-[#8a6100]">
            TOP UNCONVERTED XAI WALLETS
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#ffb000]/80">
            XAI is GATE CLOSED. Wallets marked 0 SOL hold no SOL to pay fees with, so those
            holders cannot pay for their own conversion transaction.
          </p>
          <div className="mt-4 overflow-x-auto border border-[#ffb000]/25 bg-[#12100c]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#ffb000]/25 text-[11px] tracking-[0.25em] text-[#8a6100]">
                  <th className="px-4 py-3 font-normal">WALLET</th>
                  <th className="px-4 py-3 text-right font-normal">XAI</th>
                  <th className="px-4 py-3 text-right font-normal">USD</th>
                  <th className="px-4 py-3 text-right font-normal">SOL</th>
                </tr>
              </thead>
              <tbody>
                {topXai.map((holder) => (
                  <tr key={holder.address} className="board-row">
                    <td className="px-4 py-2.5" title={holder.address}>
                      {shorten(holder.address)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {holder.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      ${Math.round(holder.usd).toLocaleString("en-US")}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {holder.solBalance === 0 ? (
                        <span className="font-bold text-[#ff3b30]">0 SOL</span>
                      ) : (
                        `${holder.solBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
