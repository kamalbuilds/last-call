import type { Metadata } from "next";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { CountdownFlap } from "@/components/countdown-flap";
import { SolscanLink } from "@/components/solscan-link";
import { SplitFlap } from "@/components/split-flap";
import { Timeline } from "@/components/timeline";
import { daysSince, getLedger, shorten, type LedgerToken } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ledger board | Last call for pre-IPO holders",
};

const FINAL_CALL_MS = 30 * 86_400_000;

type FlightStatus = "BOARDING" | "FINAL CALL" | "GATE CLOSED";

function flightStatus(token: LedgerToken, nowMs: number): FlightStatus {
  if (token.deadline === null) return "BOARDING";
  if (Date.parse(token.deadline) <= nowMs) return "GATE CLOSED";
  if (Date.parse(token.deadline) - nowMs <= FINAL_CALL_MS) return "FINAL CALL";
  return "BOARDING";
}

function statusColor(status: FlightStatus): string {
  if (status === "GATE CLOSED") return "var(--closed)";
  if (status === "FINAL CALL") return "var(--final)";
  return "var(--boarding)";
}

function intoSymbol(token: LedgerToken): string {
  const raw = token.conversion?.intoSymbol;
  if (typeof raw === "string" && raw !== "") return raw;
  return "--";
}

function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export default async function LedgerPage(): Promise<React.ReactNode> {
  let ledger: Awaited<ReturnType<typeof getLedger>> | null = null;
  let loadError: string | null = null;
  try {
    ledger = await getLedger();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (ledger === null) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--closed)]">
          The board did not load: {loadError ?? "unknown error"}. Try again in a minute.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/" className="underline">Back home</Link>
        </p>
      </main>
    );
  }

  if (ledger.tokens.length === 0) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--text-2)]">The board is empty right now. Try again in a minute.</p>
      </main>
    );
  }

  const nowMs = Date.now();
  const xai = ledger.tokens.find((t) => t.symbol === "XAI") ?? null;
  const spacex = ledger.tokens.find((t) => t.symbol === "SPACEX") ?? null;
  if (xai === null || spacex === null) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--closed)]">The board is missing XAI or SPACEX. Try again in a minute.</p>
      </main>
    );
  }

  const withDeadline = ledger.tokens
    .filter((t) => t.deadline !== null)
    .sort((a, b) => Date.parse(a.deadline as string) - Date.parse(b.deadline as string));
  const awaiting = ledger.tokens
    .filter((t) => t.deadline === null)
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));

  const xaiUsd = xai.unconvertedUsd ?? 0;
  const xaiShortK = `$${Math.round(xaiUsd / 1000)}k`;
  const xaiClosedDays = xai.deadline !== null ? daysSince(xai.deadline, nowMs) : 0;
  const topXai = (xai.holders ?? []).slice().sort((a, b) => b.amount - a.amount).slice(0, 20);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] pb-3">
        <span className="text-sm text-[var(--text-2)]">Last call</span>
        <nav className="flex gap-4 text-sm">
          <Link className="underline" href="/">Home</Link>
          <Link className="underline" href="/ledger">Ledger</Link>
        </nav>
      </header>

      <section aria-label="Stranded XAI" className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Departures, pre-IPO conversions</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SplitFlap value="XAI" size="md" />
            <span className="chip" style={{ color: "var(--closed)", borderColor: "var(--closed)" }}>
              GATE CLOSED
            </span>
          </div>
          <div className="mt-4 min-w-0">
            <SplitFlap value={dollars(xaiUsd)} size="lg" />
          </div>
          <p className="num mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-2)]">
            {dollars(xaiUsd)} stranded in {xai.holderCount.toLocaleString("en-US")} wallets. Gate closed{" "}
            {xaiClosedDays} days ago (about {xaiShortK}).
          </p>
        </div>
        <aside aria-label="Next departure" className="h-fit rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
          <p className="text-sm text-[var(--text-3)]">Next departure</p>
          <p className="mt-1 text-lg font-bold text-[var(--text)]">SPACEX</p>
          <div className="mt-3">
            <CountdownFlap deadline={spacex.deadline as string} size="sm" />
          </div>
          <p className="num mt-3 text-sm text-[var(--text-2)]">
            {spacex.holderCount.toLocaleString("en-US")} holders
          </p>
          <p className="num mt-1 text-sm text-[var(--text-3)]">
            Deadline {(spacex.deadline as string).slice(0, 10)}
          </p>
        </aside>
      </section>

      <section aria-label="Timelines" className="mt-10 grid gap-6">
        <div className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
          <p className="num text-sm text-[var(--text-2)]">XAI to SPACEX</p>
          <div className="mt-1 overflow-x-auto">
            <Timeline variant="xai" nowMs={nowMs} />
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
          <p className="num text-sm text-[var(--text-2)]">SPACEX to public stock</p>
          <div className="mt-1 overflow-x-auto">
            <Timeline variant="spacex" nowMs={nowMs} />
          </div>
        </div>
      </section>

      <section aria-label="Board" className="mt-10">
        <h2 className="num text-lg font-bold text-[var(--text)]">Board</h2>
        <div className="num mt-4 hidden grid-cols-[1fr_1fr_1.5fr_1fr_1fr_1fr] gap-4 border-b border-[var(--line)] pb-2 text-xs text-[var(--text-3)] sm:grid">
          <span>Token</span>
          <span>Converts into</span>
          <span>Deadline</span>
          <span>Status</span>
          <span className="text-right">Unconverted</span>
          <span className="text-right">Holders</span>
        </div>
        <div className="flex flex-col gap-3 sm:gap-0">
          {withDeadline.map((token) => {
            const status = flightStatus(token, nowMs);
            const color = statusColor(status);
            return (
              <div
                key={token.mint}
                className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-[1fr_1fr_1.5fr_1fr_1fr_1fr] sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0 sm:py-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Token</p>
                  <p className="font-bold text-[var(--text)]">{token.symbol}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Converts into</p>
                  <p className="num text-sm text-[var(--text-2)]">{intoSymbol(token)}</p>
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Deadline</p>
                  <p className="num text-sm text-[var(--text-2)]">
                    {token.deadline !== null && (
                      <>
                        {token.deadline.slice(0, 10)} (<Countdown deadline={token.deadline} />)
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Status</p>
                  <span className="chip" style={{ color, borderColor: color }}>
                    {status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Unconverted</p>
                  <p className="num text-sm text-[var(--text)] sm:text-right">
                    {Math.round(token.unconvertedInWallets).toLocaleString("en-US")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-3)] sm:hidden">Holders</p>
                  <p className="num text-sm text-[var(--text)] sm:text-right">
                    {token.holderCount.toLocaleString("en-US")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="num mt-8 text-sm text-[var(--text-2)]">Awaiting IPO</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {awaiting.map((token) => (
            <span
              key={token.mint}
              className="num rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs"
              style={{ color: "var(--awaiting)" }}
            >
              {token.symbol} {token.holderCount.toLocaleString("en-US")} holders
            </span>
          ))}
        </div>
      </section>

      <section aria-label="Unconverted XAI wallets" className="mt-10">
        <h2 className="num text-lg font-bold text-[var(--text)]">Unconverted XAI wallets</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
          Most of these wallets can still convert; they just have not. Wallets tagged no SOL for fees cannot pay the network fee, so LAST CALL can sponsor it.
        </p>
        {topXai.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-2)]">No unconverted wallets found right now.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {topXai.map((holder) => {
              const needsSponsor = holder.solBalance < 0.001;
              return (
                <div
                  key={holder.address}
                  className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 text-sm text-[var(--text)]">
                      <SolscanLink address={holder.address} short={shorten(holder.address)} />
                    </span>
                    {needsSponsor && (
                      <span className="chip" style={{ color: "var(--text-2)", borderColor: "var(--line)" }}>
                        no SOL for fees
                      </span>
                    )}
                    <Link href={`/?wallet=${holder.address}`} className="ml-auto text-sm underline">
                      Look up
                    </Link>
                  </div>
                  <dl className="num mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-[var(--text-3)]">XAI</dt>
                      <dd className="text-[var(--text)]">{holder.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-[var(--text-3)]">USD</dt>
                      <dd className="text-[var(--text)]">${Math.round(holder.usd ?? 0).toLocaleString("en-US")}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-[var(--text-3)]">SOL</dt>
                      <dd className="text-[var(--text)]">{holder.solBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer className="mt-10 border-t border-[var(--line)] pt-3">
        <p className="num text-xs text-[var(--text-3)]">
          Read from Solana mainnet and Jupiter at {ledger.generatedAt} UTC.
        </p>
      </footer>
    </main>
  );
}
