"use client";
import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import type { HoldingRow } from "@lastcall/holdings";
import { Countdown } from "@/components/countdown";
import { useWallet } from "@/lib/use-wallet";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

interface ConvertResult {
  signature: string;
  sponsored: boolean;
  feePayer: string;
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

function HoldingCard({
  row,
  owner,
  signAndSend,
}: {
  row: HoldingRow;
  owner: string;
  signAndSend: (transactionBase64: string) => Promise<string>;
}): React.ReactNode {
  const [converting, setConverting] = useState<boolean>(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const convert = useCallback(async (): Promise<void> => {
    if (row.convertsInto === null) return;
    setConverting(true);
    setResult(null);
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
        feePayer?: unknown;
        sponsored?: unknown;
        error?: unknown;
      };
      if (!res.ok || typeof payload.txBase64 !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "convert failed");
      }
      const signature = await signAndSend(payload.txBase64);
      setResult({
        signature,
        sponsored: payload.sponsored === true,
        feePayer: typeof payload.feePayer === "string" ? payload.feePayer : owner,
      });
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setConverting(false);
    }
  }, [owner, row.mint, row.convertsInto, signAndSend]);

  return (
    <article className="border border-[#ffb000]/25 bg-[#12100c] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">
          {row.symbol} <span className="num text-sm font-normal">× {row.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
        </h3>
        <span className="text-xs tracking-[0.2em] text-[#8a6100]">
          {row.status === "expired" ? "GATE CLOSED" : row.status === "converting" ? "BOARDING" : "NOT SCHEDULED"}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#ffb000]/80">
        {row.deadline === null ? (
          "No conversion deadline scheduled."
        ) : (
          <>
            Deadline <span className="num">{row.deadline.slice(0, 10)}</span> (
            <Countdown deadline={row.deadline} />)
          </>
        )}
      </p>
      {row.convertsInto !== null && (
        <p className="mt-1 text-sm text-[#ffb000]/80">Converts into {row.convertsInto.slice(0, 4)}...{row.convertsInto.slice(-4)}</p>
      )}
      {row.quote !== null ? (
        <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">YOU RECEIVE</dt>
            <dd>{row.quote.outAmountUi.toLocaleString("en-US", { maximumFractionDigits: 4 })}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">PRICE IMPACT</dt>
            <dd>{row.quote.priceImpactPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.2em] text-[#8a6100]">TRANSFER FEE</dt>
            <dd>{(row.quote.transferFeeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[#8a6100]">No live quote right now.</p>
      )}
      {row.convertsInto !== null && (
        <button
          type="button"
          onClick={convert}
          disabled={converting}
          className="mt-4 border border-[#ffb000] px-4 py-2 text-sm font-bold tracking-[0.15em] disabled:opacity-50"
        >
          {converting ? "CONVERTING..." : "CONVERT"}
        </button>
      )}
      {failure !== null && <p className="mt-3 text-sm text-[#ff3b30]">{failure}</p>}
      {result !== null && (
        <div className="mt-3 text-sm">
          {!result.sponsored && (
            <p className="text-[#ffb000]">
              Not sponsored: your wallet paid the network fee (fee payer {result.feePayer.slice(0, 4)}...{result.feePayer.slice(-4)}).
            </p>
          )}
          <p className="num mt-1 break-all">
            Confirmed:{" "}
            <a
              className="underline underline-offset-4"
              href={`https://solscan.io/tx/${result.signature}`}
              target="_blank"
              rel="noreferrer"
            >
              {result.signature}
            </a>
          </p>
        </div>
      )}
    </article>
  );
}

export function HomeClient(): React.ReactNode {
  const { wallets, connected, connecting, error, connect, disconnect, signAndSend } = useWallet();
  const [holdings, setHoldings] = useState<HoldingRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async (owner: string): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/holdings?owner=${encodeURIComponent(owner)}`);
      const payload = (await res.json()) as unknown;
      if (!res.ok) {
        const reason =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "holdings request failed";
        throw new Error(reason);
      }
      setHoldings(payload as HoldingRow[]);
    } catch (err) {
      setHoldings(null);
      setFailure(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected !== null) {
      void load(connected.address);
    } else {
      setHoldings(null);
    }
  }, [connected, load]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <section className="mt-8 border border-[#ffb000]/25 bg-[#12100c] p-4">
        <h2 className="text-sm tracking-[0.3em] text-[#8a6100]">Connect wallet</h2>
        {connected === null ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button
                key={w.name}
                type="button"
                onClick={() => void connect(w)}
                disabled={connecting}
                className="border border-[#ffb000] px-4 py-2 text-sm font-bold tracking-[0.15em] disabled:opacity-50"
              >
                {connecting ? "CONNECTING..." : `CONNECT ${w.name.toUpperCase()}`}
              </button>
            ))}
            {wallets.length === 0 && (
              <p className="text-sm text-[#ffb000]/80">
                No Solana wallet detected in this browser yet. Install one, then connect.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="num text-sm">
              {connected.name}: {connected.address.slice(0, 4)}...{connected.address.slice(-4)}
            </span>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="border border-[#8a6100] px-3 py-1.5 text-xs tracking-[0.15em]"
            >
              DISCONNECT
            </button>
            <button
              type="button"
              onClick={() => void load(connected.address)}
              disabled={loading}
              className="border border-[#8a6100] px-3 py-1.5 text-xs tracking-[0.15em] disabled:opacity-50"
            >
              {loading ? "LOADING..." : "REFRESH"}
            </button>
          </div>
        )}
        {error !== null && <p className="mt-3 text-sm text-[#ff3b30]">{error}</p>}
      </section>

      {connected !== null && (
        <section className="mt-8">
          <h2 className="text-sm tracking-[0.3em] text-[#8a6100]">YOUR FLIGHTS</h2>
          {loading && <p className="mt-3 text-sm">Reading your wallet...</p>}
          {failure !== null && <p className="mt-3 text-sm text-[#ff3b30]">{failure}</p>}
          {holdings !== null && holdings.length === 0 && (
            <p className="mt-3 text-sm text-[#ffb000]/80">No PreStocks holdings in this wallet.</p>
          )}
          {holdings !== null && holdings.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {holdings.map((row) => (
                <HoldingCard key={row.mint} row={row} owner={connected.address} signAndSend={signAndSend} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
