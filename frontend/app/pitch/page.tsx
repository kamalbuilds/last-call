import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Connection } from "@solana/web3.js";
import { decodeMint, readEpochPosition, type MintFacts } from "@fineprint/core";
import { DeckNav } from "@/components/deck-nav";
import { SolscanLink } from "@/components/solscan-link";
import { SplitFlap } from "@/components/split-flap";
import { getLedger, shorten, type LedgerToken } from "@/lib/ledger";
import { readTerms, termsRpcUrl } from "@/lib/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pitch | Last call for pre-IPO holders",
};

const SPACEX_MINT = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const TEST_BUY_SIG =
  "5fx8hNaFhLUFirjiPYPjA9JSLruHuPkhmKs71XxrVA1QZonrMdTqbWvrwpT2Bs6X8TkLv15L5SLBPMib2Qj9gyA8";
const FEE_TIER_MINTS: [string, string][] = [
  ["ANDURIL", "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB"],
  ["ANTHROPIC", "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw"],
  ["FIGUREAI", "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd"],
  ["KALSHI", "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua"],
  ["NEURALINK", "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S"],
  ["OPENAI", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF"],
  ["POLYMARKET", "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP"],
];
const SLIDES = 10;

interface ProofCheck {
  name: string;
  ok: boolean;
  output: string;
  ranAt: string;
}

function readProof(): { generatedAt: string; checks: ProofCheck[] } | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "proof.json"), "utf8")) as {
      generatedAt: string;
      checks: ProofCheck[];
    };
  } catch {
    return null;
  }
}

function utc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function amount(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Slide({
  n,
  label,
  title,
  children,
}: {
  n: number;
  label: string;
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section
      data-slide={n}
      aria-label={label}
      className="flex min-w-0 scroll-mt-14 flex-col justify-center border-b border-[var(--line)] py-12 sm:min-h-[calc(100svh-56px)] sm:py-16"
    >
      <p className="num text-sm text-[var(--text-3)]">
        {String(n).padStart(2, "0")}
        <span className="ml-3 font-sans">{label}</span>
      </p>
      <h2 className="mt-4 max-w-4xl text-[28px] font-semibold leading-tight text-[var(--text)] sm:text-[40px]">{title}</h2>
      <div className="mt-8 min-w-0">{children}</div>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }): React.ReactNode {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 border-t border-[var(--line)] py-3 sm:grid-cols-[1fr_auto] sm:gap-6">
      <div className="min-w-0">
        <p className="text-base text-[var(--text-2)]">{label}</p>
        {note !== undefined && <p className="mt-1 text-xs text-[var(--text-3)]">{note}</p>}
      </div>
      <p className="num min-w-0 break-words text-xl text-[var(--text)] sm:text-right">{value}</p>
    </div>
  );
}

function ReadFailed({ what, err }: { what: string; err: string }): React.ReactNode {
  return (
    <p className="text-sm text-[var(--closed)]">
      Live read of {what} failed at render time: {err}
    </p>
  );
}

export default async function PitchPage(): Promise<React.ReactNode> {
  const connection = new Connection(termsRpcUrl(), "confirmed");
  const [termsR, ledgerR, epochR] = await Promise.allSettled([
    readTerms(SPACEX_MINT),
    getLedger(),
    readEpochPosition(connection),
  ]);
  const feeR: PromiseSettledResult<MintFacts>[] =
    epochR.status === "fulfilled"
      ? await Promise.allSettled(FEE_TIER_MINTS.map(([sym, mint]) => decodeMint(mint, sym, connection, undefined, epochR.value)))
      : FEE_TIER_MINTS.map(() => ({ status: "rejected", reason: epochR.reason }) as PromiseRejectedResult);
  const renderedAt = Date.now();
  const proof = readProof();

  const terms = termsR.status === "fulfilled" ? termsR.value : null;
  const ledger = ledgerR.status === "fulfilled" ? ledgerR.value : null;
  const xai: LedgerToken | undefined = ledger?.tokens.find((t) => t.symbol === "XAI");
  const spacex: LedgerToken | undefined = ledger?.tokens.find((t) => t.symbol === "SPACEX");
  const top10 = [...(xai?.holders ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 10);
  const zeroSolTop10 = top10.filter((h) => h.solBalance === 0);
  const pending = feeR.flatMap((r) => (r.status === "fulfilled" ? [r.value.transferFee] : []));
  const nextEpoch = pending.find((f) => f.pendingActivationEpoch != null);
  const spacexDays =
    spacex?.deadline != null ? Math.max(0, Math.floor((Date.parse(spacex.deadline) - renderedAt) / 86_400_000)) : null;

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
      <Slide n={1} label="LAST CALL" title="Pre-IPO tokens expire. Most of their holders never hear about it.">
        <SplitFlap value="LAST CALL" size="lg" />
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-[var(--text-2)] sm:text-xl">
          A departures board for every PreStocks conversion deadline, and a one-signature conversion that works even
          when the holder&apos;s wallet has no SOL.
        </p>
        <p className="num mt-6 text-sm text-[var(--text-3)]">
          Live figures on these slides were read from Solana mainnet at {utc(renderedAt)}
          {epochR.status === "fulfilled" ? `, epoch ${epochR.value.epoch}` : ""}. Use the arrow keys to move.
        </p>
      </Slide>

      <Slide n={2} label="The problem" title="When the conversion window closes, the token is dead weight.">
        <blockquote className="max-w-3xl border-l border-[var(--line)] pl-4 text-xl leading-relaxed text-[var(--text)] sm:text-[28px]">
          After the window, PreStocks tokens &ldquo;expire worthless and will no longer be supported.&rdquo;
        </blockquote>
        <p className="mt-3 text-sm text-[var(--text-3)]">
          <a href="https://x.com/PreStocks/status/2063623768535363940" target="_blank" rel="noreferrer" className="underline">
            PreStocks on X, 2026-06-07
          </a>
        </p>
        <div className="mt-8 max-w-3xl">
          <Row label="First deadline: xAI" value="2026-09-12 23:59 UTC" />
          <Row label="Conversion rate" value="0.7165 SPACEX per XAI" note="0.1433 before SpaceX's 5-for-1 split" />
          <Row
            label="Status"
            value={<span className="chip num text-[var(--closed)]" style={{ borderColor: "var(--closed)" }}>GATE CLOSED</span>}
          />
          <Row label="Who can pull expired tokens" value="The issuer" note="The XAI mint carries a permanent delegate" />
        </div>
      </Slide>

      <Slide n={3} label="Measured" title="The gate closed with holders still at it.">
        {xai === undefined ? (
          <ReadFailed what="the XAI ledger" err={ledgerR.status === "rejected" ? message(ledgerR.reason) : "XAI missing from ledger"} />
        ) : (
          <div className="max-w-3xl">
            <Row label="XAI supply still outstanding" value={amount(xai.supply ?? 0)} note="XAI mint account" />
            <Row label="Held by the XAI/SPACEX pool" value={amount(xai.poolHeld ?? 0)} note="Jupiter holders API, pool-tagged" />
            <Row
              label="Still in holders' wallets"
              value={`${amount(xai.unconvertedInWallets)} XAI`}
              note={xai.unconvertedUsd != null ? `About $${Math.round(xai.unconvertedUsd).toLocaleString("en-US")} at the pool price` : undefined}
            />
            <Row label="Holders" value={xai.holderCount.toLocaleString("en-US")} note="Jupiter token API" />
            <Row
              label="Top 10 wallets with 0 SOL"
              value={`${zeroSolTop10.length} of ${top10.length}`}
              note={
                zeroSolTop10.length > 0
                  ? `Holding up to ${amount(Math.max(...zeroSolTop10.map((h) => h.amount)))} XAI each`
                  : undefined
              }
            />
            <p className="num mt-4 text-sm text-[var(--text-3)]">Ledger generated {utc(Date.parse(ledger!.generatedAt))}.</p>
          </div>
        )}
      </Slide>

      <Slide n={4} label="Why not just swap" title="A 0-SOL wallet cannot pay the fee, and the gasless swap has no quote.">
        <p className="max-w-3xl text-base leading-relaxed text-[var(--text-2)]">
          We asked Jupiter Ultra, the gasless swap Phantom and Jupiter offer, for real orders on 2026-09-24, from a
          wallet with 0 SOL and at every size we tried.
        </p>
        <div className="mt-6 max-w-3xl">
          <Row label="XAI to SPACEX via Jupiter Ultra" value={<span className="text-[var(--closed)]">Failed to get quotes</span>} />
          <Row label="SPACEX to SPCXx via Jupiter Ultra" value={<span className="text-[var(--closed)]">Failed to get quotes</span>} />
          <Row label="Same routes via Jupiter Swap API, used by LAST CALL" value="routes" note="XAI to SPACEX at 1.30% impact for 10, 30 and 139 XAI" />
        </div>
        <div className="mt-8 max-w-3xl">
          <Row label="Of the 99 largest XAI wallets, under 0.001 SOL" value="34" note="33 of them hold no USDC either: 341.81 XAI between them" />
          <Row label="Of the 95 largest SPACEX wallets, under 0.001 SOL" value="10" note="Jupiter holders API, read 2026-09-24" />
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[var(--text-3)]">
          Most unconverted value sits in wallets that could pay a fee and have not converted. The sponsor serves the
          minority that cannot; the board and wallet lookup serve everyone else.
        </p>
      </Slide>

      <Slide n={5} label="What LAST CALL does" title="See the deadline, check the wallet, convert in one signature.">
        <ol className="max-w-3xl">
          {[
            ["Board", "/ledger", "One row per PreStocks token: conversion target, deadline, status, unconverted amount, and the largest unconverted wallets with 0-SOL wallets flagged."],
            ["Wallet lookup", "/", "Any address or a connected wallet: holdings, countdowns, a live Jupiter quote, and the mint's terms read live before a Convert button appears."],
            ["Sponsored convert", "/", "A Jupiter swap into the conversion target. The sponsor pays the fee and the new token account's rent; the holder still signs."],
            ["Blink", "/actions.json", "The same conversion as a Solana Action, so a wallet or a post can render Convert without opening the site."],
            ["Inbox", "/inbox", "109 stock tokens across PreStocks, xStock and Ondo, their Token-2022 extensions decoded into dated actions, exportable as a calendar."],
          ].map(([name, href, body], i) => (
            <li key={name} className="grid min-w-0 grid-cols-[32px_1fr] gap-3 border-t border-[var(--line)] py-4">
              <span className="num text-sm text-[var(--text-3)]">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="text-xl text-[var(--text)]">
                  {name}
                  <Link href={href} className="num ml-3 text-sm text-[var(--text-3)] underline">{href}</Link>
                </p>
                <p className="mt-1 text-base leading-relaxed text-[var(--text-2)]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Slide>

      <Slide n={6} label="Epoch 1043" title="Seven mints already carry a higher fee, scheduled by epoch.">
        <p className="max-w-3xl text-base leading-relaxed text-[var(--text-2)]">
          Each mint&apos;s Token-2022 transferFeeConfig holds a second tier with an activation epoch. The token program
          applies it automatically. It is announced nowhere public.
        </p>
        {epochR.status === "rejected" ? (
          <div className="mt-6"><ReadFailed what="the epoch" err={message(epochR.reason)} /></div>
        ) : (
          <div className="mt-6 max-w-3xl">
            <div className="hidden grid-cols-[1fr_96px_96px_96px] gap-4 pb-2 text-xs text-[var(--text-3)] sm:grid">
              <span>Mint</span>
              <span className="text-right">In force</span>
              <span className="text-right">Scheduled</span>
              <span className="text-right">At epoch</span>
            </div>
            {FEE_TIER_MINTS.map(([sym, mint], i) => {
              const r = feeR[i]!;
              return (
                <div key={sym} className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--line)] py-3 sm:grid-cols-[1fr_96px_96px_96px]">
                  <span className="col-span-2 min-w-0 text-base text-[var(--text)] sm:col-span-1">
                    {sym} <span className="ml-2 text-sm text-[var(--text-3)]"><SolscanLink address={mint} short={shorten(mint)} /></span>
                  </span>
                  {r.status === "rejected" ? (
                    <span className="col-span-2 text-sm text-[var(--closed)] sm:col-span-3">read failed: {message(r.reason)}</span>
                  ) : (
                    <>
                      <span className="num text-[var(--text)] sm:text-right">{`${r.value.transferFee.currentBps} bps`}</span>
                      <span className="num text-[var(--text-2)] sm:text-right">
                        {r.value.transferFee.pendingBps != null ? `${r.value.transferFee.pendingBps} bps` : "none pending"}
                      </span>
                      <span className="num text-[var(--text-2)] sm:text-right">
                        {r.value.transferFee.pendingActivationEpoch ?? r.value.transferFee.current.epoch}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            <p className="num mt-4 text-sm text-[var(--text-3)]">
              Mainnet in epoch {epochR.value.epoch} at {utc(renderedAt)}
              {nextEpoch?.secondsUntilActivation != null
                ? `, about ${(nextEpoch.secondsUntilActivation / 3600).toFixed(1)} hours before epoch ${nextEpoch.pendingActivationEpoch}`
                : ""}
              .
            </p>
          </div>
        )}
        <div className="mt-8 max-w-3xl">
          {terms === null ? (
            <ReadFailed what="SPACEX terms" err={termsR.status === "rejected" ? message(termsR.reason) : "no terms"} />
          ) : (
            <Row
              label="SPACEX transfer fee in force, no pending tier"
              value={`${terms.transferFeeBps} bps`}
              note={`Read at slot ${terms.readAtSlot.toLocaleString("en-US")}, same read as /api/terms`}
            />
          )}
        </div>
      </Slide>

      <Slide n={7} label="Sponsor safety" title="The sponsor pays the fee and can do nothing else.">
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0">
            <p className="text-base text-[var(--text-2)]">packages/sponsor co-signs only when every check holds:</p>
            <ul className="mt-4">
              {[
                "The sponsor is the fee payer.",
                "Every top-level instruction belongs to ComputeBudget, Jupiter v6, the associated token program or the token programs.",
                "Exactly one Jupiter instruction.",
                "The System program does not appear.",
              ].map((rule) => (
                <li key={rule} className="border-t border-[var(--line)] py-3 text-base leading-relaxed text-[var(--text)]">{rule}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[var(--text-3)]">The holder still signs. The sponsor cannot move their tokens.</p>
          </div>
          <div className="card min-w-0 p-4 sm:p-6">
            <p className="text-base text-[var(--text-2)]">Its test builds a real conversion and three attacks. All three must be refused:</p>
            <ul className="mt-4 space-y-3 text-base text-[var(--text)]">
              <li>An extra SOL transfer out of the sponsor</li>
              <li>A different fee payer</li>
              <li>The swap removed</li>
            </ul>
          </div>
        </div>
      </Slide>

      <Slide n={8} label="Proof" title="A real mainnet buy, and checks that run against mainnet.">
        <div className="max-w-3xl">
          <Row
            label="Test buy of PreStocks tokens with real SOL, via Meteora DLMM"
            value={
              <a href={`https://solscan.io/tx/${TEST_BUY_SIG}`} title={TEST_BUY_SIG} target="_blank" rel="noreferrer" className="underline">
                {shorten(TEST_BUY_SIG)}
              </a>
            }
            note="2026-09-24 19:35:39 UTC, finalized at slot 450125049, no error"
          />
        </div>
        {proof === null ? (
          <p className="mt-6 text-sm text-[var(--closed)]">proof.json could not be read.</p>
        ) : (
          <div className="mt-8 max-w-3xl">
            {proof.checks.map((c) => (
              <div key={c.name} className="min-w-0 border-t border-[var(--line)] py-3">
                <p className="text-base text-[var(--text)]">
                  <span className="num mr-3" style={{ color: c.ok ? "var(--boarding)" : "var(--closed)" }}>{c.ok ? "PASS" : "FAIL"}</span>
                  {c.name}
                </p>
                <p className="num mt-1 break-words text-xs text-[var(--text-3)]">{c.output}</p>
              </div>
            ))}
            <p className="num mt-4 text-sm text-[var(--text-3)]">
              Last proof run {utc(Date.parse(proof.generatedAt))}. Full output at <Link href="/proof" className="underline">/proof</Link>.
            </p>
          </div>
        )}
      </Slide>

      <Slide n={9} label="Not yet verified" title="What we have not shown yet.">
        <ul className="max-w-3xl">
          {[
            "A conversion sent and finalized on mainnet through this app. Every conversion so far is a simulation against a real 0-SOL wallet. The test buy left the wallet too close to its rent-exempt floor to fund a new token account, which is the case the sponsor exists for.",
            "A saving from sliced conversions. The same SPACEX quote ten minutes apart moved from 10.05 to 10.14 bps, so the pool did not visibly refill between slices.",
            "Behaviour under Jupiter or RPC outages.",
            "The Pyth price comparison, which needs an API key and has not run against live prices.",
          ].map((item) => (
            <li key={item} className="border-t border-[var(--line)] py-4 text-base leading-relaxed text-[var(--text-2)]">{item}</li>
          ))}
        </ul>
      </Slide>

      <Slide n={10} label="Next cohort" title="SpaceX's own deadline is next, for over ten thousand holders.">
        {spacex === undefined ? (
          <ReadFailed what="the SPACEX ledger row" err={ledgerR.status === "rejected" ? message(ledgerR.reason) : "SPACEX missing from ledger"} />
        ) : (
          <div className="max-w-3xl">
            <Row label="SPACEX holders" value={spacex.holderCount.toLocaleString("en-US")} note="Jupiter token API, live" />
            <Row label="Converts into" value={spacex.conversion?.intoSymbol ?? "SPCXx"} note="1:1, only through trading on a thin route" />
            <Row label="Deadline" value={spacex.deadline !== null ? utc(Date.parse(spacex.deadline)) : "not set"} />
            {spacexDays !== null && <Row label="Days left" value={String(spacexDays)} />}
          </div>
        )}
        <p className="mt-8 max-w-3xl text-xl leading-relaxed text-[var(--text)]">
          Every issuer that goes public creates the same stranded wallets again. An issuer or a wallet pays us to run
          the exit lane before that happens.
        </p>
        <p className="mt-4 text-base text-[var(--text-2)]">
          <a href="https://lastcall-sol.vercel.app" className="underline">lastcall-sol.vercel.app</a>
        </p>
      </Slide>

      <DeckNav count={SLIDES} />
    </main>
  );
}
