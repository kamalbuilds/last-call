"use client";
import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import type { HoldingRow } from "@lastcall/holdings";
import { Countdown } from "@/components/countdown";
import { useWallet } from "@/lib/use-wallet";
import {
  conversionTargetSymbol,
  formatBalance,
  formatReceive,
  isDustWithoutQuote,
  sortHoldings,
} from "@/lib/holdings-view";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const FINAL_CALL_MS = 30 * 86_400_000;

function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

function chipStyle(status: HoldingRow["status"], deadline: string | null): { label: string; color: string } {
  if (status === "expired") return { label: "GATE CLOSED", color: "var(--closed)" };
  if (status === "converting" && deadline !== null && Date.parse(deadline) - Date.now() <= FINAL_CALL_MS) {
    return { label: "FINAL CALL", color: "var(--final)" };
  }
  if (status === "converting") return { label: "BOARDING", color: "var(--boarding)" };
  return { label: "AWAITING IPO", color: "var(--awaiting)" };
}

async function readRawBalance(owner: string, mint: string): Promise<bigint> {
  const connection = new Connection(rpcUrl(), "confirmed");
  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), {
    programId: new PublicKey(TOKEN_2022_PROGRAM_ID),
  });
  let total = 0n;
  for (const entry of accounts.value) {
    const parsed = entry.account.data as unknown as {
      parsed?: { info?: { mint?: unknown; tokenAmount?: { amount?: unknown } } };
    };
    const info = parsed.parsed?.info;
    if (info?.mint !== mint) continue;
    const amount = info.tokenAmount?.amount;
    if (typeof amount !== "string") continue;
    try {
      total += BigInt(amount);
    } catch {
      continue;
    }
  }
  return total;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ConvertCard({
  row,
  rows,
  owner,
}: {
  row: HoldingRow;
  rows: HoldingRow[];
  owner: string;
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
      className={`rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5${muted ? " opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-[var(--text)]">
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
      <button
        type="button"
        onClick={() => void convert()}
        disabled={converting}
        className="btn-primary mt-4 w-full px-4 py-2.5 text-sm sm:w-auto sm:min-w-64 disabled:opacity-50"
      >
        {converting
          ? "Converting"
          : showConnectPrompt
            ? "Connect this wallet to convert"
            : `Convert ${formatBalance(row.amount)} ${row.symbol} to ${target ?? "stock"}`}
      </button>
      {failure !== null && <p className="mt-3 text-sm text-[var(--closed)]">{failure}</p>}
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
export function WalletLookup({ owner, rows }: { owner: string; rows: HoldingRow[] }): React.ReactNode {
  const sorted = sortHoldings(rows);
  const actionable = sorted.filter((r) => r.convertsInto !== null);
  const waiting = sorted.filter((r) => r.convertsInto === null);

  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-2)]">No PreStocks holdings in this wallet.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {actionable.map((row) => (
        <ConvertCard key={row.mint} row={row} rows={rows} owner={owner} />
      ))}
      {waiting.length > 0 && (
        <p className="num rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 text-sm leading-relaxed text-[var(--text-2)]">
          Awaiting IPO: {waiting.map((r) => `${r.symbol} ${formatBalance(r.amount)}`).join(", ")}
        </p>
      )}
    </div>
  );
}
