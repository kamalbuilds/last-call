"use client";
import { useCallback, useEffect, useState } from "react";
import type { HoldingRow } from "@lastcall/holdings";
import { Countdown } from "@/components/countdown";
import { BlinkShareLink } from "@/components/blink-share-link";
import { TermsPanel } from "@/components/terms-panel";
import type { TermsJson } from "@/lib/terms";
import { useWallet } from "@/lib/use-wallet";
import {
  conversionTargetSymbol,
  formatBalance,
  formatReceive,
  isDustWithoutQuote,
  sortHoldings,
} from "@/lib/holdings-view";

const FINAL_CALL_MS = 30 * 86_400_000;


function chipStyle(status: HoldingRow["status"], deadline: string | null): { label: string; color: string } {
  if (status === "expired") return { label: "GATE CLOSED", color: "var(--closed)" };
  if (status === "converting" && deadline !== null && Date.parse(deadline) - Date.now() <= FINAL_CALL_MS) {
    return { label: "FINAL CALL", color: "var(--final)" };
  }
  if (status === "converting") return { label: "BOARDING", color: "var(--boarding)" };
  return { label: "AWAITING IPO", color: "var(--awaiting)" };
}

async function readRawBalance(owner: string, mint: string): Promise<bigint> {
  // Read through our own API: public mainnet RPC rejects browser-origin requests with 403.
  const res = await fetch(`/api/true-balance?owner=${owner}`, { cache: "no-store" });
  const body = (await res.json()) as { holdings?: { mint: string; rawAmount: string }[]; error?: string };
  if (!res.ok || !body.holdings) throw new Error(body.error ?? "balance read failed");
  const held = body.holdings.find((h) => h.mint === mint);
  return held ? BigInt(held.rawAmount) : 0n;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ConvertCard({
  row,
  rows,
  owner,
  siteUrl,
  terms,
}: {
  row: HoldingRow;
  rows: HoldingRow[];
  owner: string;
  siteUrl: string;
  terms: TermsJson | null;
}): React.ReactNode {
  const { connected, signAndSend } = useWallet();
  const [converting, setConverting] = useState<boolean>(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Connection state is client-only. The server render shows the real
  // Convert label; once hydrated without this wallet connected, the
  // button prompts to connect instead.
  const [hydrated, setHydrated] = useState<boolean>(false);
  useEffect(() => setHydrated(true), []);

  const target = conversionTargetSymbol(row.convertsInto, rows);
  const chip = chipStyle(row.status, row.deadline);
  const isOwner = hydrated && connected?.address === owner;
  const showConnectPrompt = hydrated && !isOwner;
  const muted = isDustWithoutQuote(row);
  const pausedByIssuer = terms?.paused === true;

  const convert = useCallback(async (): Promise<void> => {
    if (!isOwner) {
      document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setConverting(true);
    setSignature(null);
    setFailure(null);
    try {
      const raw = await readRawBalance(owner, row.mint);
      if (raw <= 0n) throw new Error("no balance left to convert");
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, fromMint: row.mint, amountRaw: raw.toString() }),
      });
      const payload = (await res.json()) as {
        txBase64?: unknown;
        error?: unknown;
      };
      if (!res.ok || typeof payload.txBase64 !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "convert failed");
      }
      const sig = await signAndSend(payload.txBase64);
      setSignature(sig);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setConverting(false);
    }
  }, [isOwner, owner, row.mint, signAndSend]);

  return (
    <article
      className={`card p-4 sm:p-6${muted ? " opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-bold text-[var(--text)]">
          {row.symbol} <span className="num text-sm font-normal text-[var(--text-2)]">{formatBalance(row.amount)}</span>
        </h3>
        <span className="chip" style={{ color: chip.color, borderColor: chip.color }}>
          {chip.label}
        </span>
      </div>
      {row.deadline !== null && (
        <p className="num mt-1 text-sm text-[var(--text-2)]">
          Deadline {row.deadline.slice(0, 10)} (<Countdown deadline={row.deadline} />)
        </p>
      )}
      {target !== null && (
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Converts into {target}
        </p>
      )}
      {row.quote !== null ? (
        <dl className="num mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--text)]">
          <div>
            <dt className="text-xs text-[var(--text-3)]">You receive</dt>
            <dd>{formatReceive(row.quote.outAmountUi, target)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-3)]">Price impact</dt>
            <dd>{row.quote.priceImpactPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-3)]">Transfer fee</dt>
            <dd>{(row.quote.transferFeeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-2)]">Quote unavailable, try again</p>
      )}
      {row.status === "expired" && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-2)]">
          The gate is closed. These tokens can still be redeemed through LAST CALL before the issuer removes them.
        </p>
      )}
      <TermsPanel mint={row.mint} terms={terms} />
      <button
        type="button"
        onClick={() => void convert()}
        disabled={converting || pausedByIssuer}
        className="btn-primary mt-4 w-full px-4 py-3 text-sm sm:w-auto sm:min-w-64 disabled:opacity-50"
      >
        {pausedByIssuer
          ? "Convert paused by issuer"
          : converting
            ? "Converting"
            : showConnectPrompt
              ? "Connect this wallet to convert"
              : `Convert ${formatBalance(row.amount)} ${row.symbol} to ${target ?? "stock"}`}
      </button>
      {pausedByIssuer && (
        <p className="mt-2 text-sm text-[var(--closed)]">
          This token is paused by the issuer, so conversion is disabled until transfers resume.
        </p>
      )}
      {failure !== null && <p className="mt-3 text-sm text-[var(--closed)]">{failure}</p>}
      <p className="mt-2">
        <BlinkShareLink token={row.symbol} siteUrl={siteUrl} />
      </p>
      {signature !== null && (
        <p className="num mt-3 break-all text-sm text-[var(--text-2)]">
          Confirmed:{" "}
          <a
            className="underline"
            href={`https://solscan.io/tx/${signature}`}
            target="_blank"
            rel="noreferrer"
          >
            {signature}
          </a>
        </p>
      )}
    </article>
  );
}

/** Server-fetched holdings for a looked-up wallet, with per-card convert actions. */
export function WalletLookup({
  owner,
  rows,
  siteUrl,
  termsByMint,
}: {
  owner: string;
  rows: HoldingRow[];
  siteUrl: string;
  termsByMint?: Record<string, TermsJson | null>;
}): React.ReactNode {
  const sorted = sortHoldings(rows);
  const actionable = sorted.filter((r) => r.convertsInto !== null);
  const waiting = sorted.filter((r) => r.convertsInto === null);

  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-2)]">No PreStocks holdings in this wallet.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {actionable.map((row) => (
        <ConvertCard key={row.mint} row={row} rows={rows} owner={owner} siteUrl={siteUrl} terms={termsByMint?.[row.mint] ?? null} />
      ))}
      {waiting.length > 0 && (
        <p className="num card p-4 text-sm leading-relaxed text-[var(--text-2)]">
          Awaiting IPO: {waiting.map((r) => `${r.symbol} ${formatBalance(r.amount)}`).join(", ")}
        </p>
      )}
    </div>
  );
}
