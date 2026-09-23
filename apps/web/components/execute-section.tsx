"use client";

import Image from "next/image";
import { useState } from "react";

import { Column, Exhibit, Note, Section } from "@/components/doc";
import { useSize } from "@/components/size-context";
import type { CostVerdict, SwapRequest, SwapResult } from "@/lib/contract";
import { fmtPoints, fmtQty, fmtSlot, fmtUsd, venueLabel } from "@/lib/format";
import { useWallet, type DetectedWallet } from "@/lib/use-wallet";

interface UnsignedSwap {
  transactionBase64: string;
  lastValidBlockHeight: number;
  expectedNetDelta: number;
}

type BuildResponse =
  | { ok: true; unsigned: UnsignedSwap; verdict: CostVerdict }
  | { ok: false; refused?: boolean; reason: string };

type ConfirmResponse = { ok: true; result: SwapResult } | { ok: false; reason: string };

type Stage = "idle" | "building" | "signing" | "confirming" | "settled";

export function ExecuteSection({
  mints,
  ladder,
}: {
  mints: { symbol: string; mint: string }[];
  ladder: CostVerdict[];
}) {
  const { symbol, setSymbol, notionalUsd, setNotionalUsd, verdict: payload } = useSize();
  const wallet = useWallet();
  const [slippageBps, setSlippageBps] = useState(50);
  const [stage, setStage] = useState<Stage>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);

  const mint = mints.find((m) => m.symbol === symbol)?.mint ?? mints[0]?.mint ?? "";
  const allowed = payload.verdict.useOnChain;
  const largestWinning = [...ladder].filter((l) => l.useOnChain).sort((a, b) => b.notionalUsd - a.notionalUsd)[0];
  const busy = stage === "building" || stage === "signing" || stage === "confirming";

  async function execute() {
    setProblem(null);
    setRefusal(null);
    setResult(null);
    if (!wallet.connected) {
      setProblem("Connect a wallet first.");
      return;
    }
    const request: SwapRequest = {
      symbol,
      mint,
      notionalUsd,
      userPublicKey: wallet.connected.address,
      slippageBps,
    };
    try {
      setStage("building");
      const buildRes = await fetch("/api/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const build = (await buildRes.json()) as BuildResponse;
      if (!build.ok) {
        setStage("idle");
        if (build.refused) setRefusal(build.reason);
        else setProblem(build.reason);
        return;
      }

      setStage("signing");
      const signature = await wallet.signAndSend(build.unsigned.transactionBase64);

      setStage("confirming");
      const confirmRes = await fetch("/api/swap/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signature,
          request,
          expectedNetDelta: build.unsigned.expectedNetDelta,
        }),
      });
      const confirmed = (await confirmRes.json()) as ConfirmResponse;
      if (!confirmed.ok) {
        setStage("idle");
        setProblem(confirmed.reason);
        return;
      }
      setResult(confirmed.result);
      setStage("settled");
    } catch (err) {
      setStage("idle");
      setProblem(err instanceof Error ? err.message : "The swap did not complete.");
    }
  }

  return (
    <Column>
      <Section
        id="execute"
        mark="§ 4"
        title="Execute, or be told not to."
        standfirst={
          <>
            The order below is built unsigned on the server and signed in your own wallet. When the
            measured cost at your size is worse than the cheapest published alternative, the build is
            refused before a transaction exists, which is the entire reason this section is last rather
            than first.
          </>
        }
      >
        <Exhibit>
          <div className="border-b border-rule px-6 py-5 sm:px-7">
            <div className="label mb-3">Wallet</div>
            {wallet.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="num text-[0.8rem] [overflow-wrap:anywhere] text-paper">
                  {wallet.connected.name}
                  <span className="px-2 text-paper-faint">/</span>
                  {wallet.connected.address}
                </div>
                <button
                  type="button"
                  onClick={() => void wallet.disconnect()}
                  className="label border border-rule px-3 py-1.5 transition-colors hover:border-rule-strong hover:text-paper"
                >
                  Disconnect
                </button>
              </div>
            ) : wallet.wallets.length > 0 ? (
              <ul className="divide-y divide-rule border-y border-rule">
                {wallet.wallets.map((w: DetectedWallet) => (
                  <li key={w.name}>
                    <button
                      type="button"
                      disabled={wallet.connecting}
                      onClick={() => void wallet.connect(w)}
                      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-ink-raised disabled:opacity-50"
                    >
                      <Image src={w.icon} alt="" width={18} height={18} unoptimized />
                      <span className="num text-[0.8rem] text-paper">{w.name}</span>
                      <span className="label ml-auto">
                        {wallet.connecting ? "connecting" : "connect"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="max-w-[60ch] text-[0.95rem] leading-[1.6] text-paper-dim">
                No Wallet Standard wallet has registered itself in this browser. Install Phantom,
                Solflare or any wallet that publishes the{" "}
                <code className="font-mono text-[0.9em]">solana:signAndSendTransaction</code> feature,
                then reload. Sections 1 to 3 need no wallet at all.
              </p>
            )}
            {wallet.error ? <Note tone="warn">{wallet.error}</Note> : null}
          </div>

          <div className="grid grid-cols-1 divide-y divide-rule md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="px-6 py-5 sm:px-7">
              <div className="label mb-3">Token</div>
              <div className="flex flex-wrap gap-2">
                {mints.map((m) => (
                  <button
                    key={m.mint}
                    type="button"
                    onClick={() => setSymbol(m.symbol)}
                    className={`num border px-2.5 py-1.5 text-[0.72rem] transition-colors ${
                      m.symbol === symbol
                        ? "border-paper-dim text-paper"
                        : "border-rule text-paper-faint hover:border-rule-strong hover:text-paper-dim"
                    }`}
                  >
                    {m.symbol}
                  </button>
                ))}
              </div>
              <div className="num mt-3 text-[0.65rem] [overflow-wrap:anywhere] text-paper-faint">{mint}</div>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <div className="label mb-3">Size</div>
              <div className="num text-[1.4rem] leading-none text-paper">{fmtUsd(notionalUsd, 0)}</div>
              <a href="#cost" className="label mt-3 inline-block hover:text-paper">
                Set in section 2
              </a>
              <div
                className={`num mt-4 text-[0.7rem] leading-[1.6] ${allowed ? "text-assent" : "text-errata"}`}
              >
                {allowed ? "cost verdict clears" : "cost verdict blocks"}:{" "}
                {fmtPoints(payload.verdict.advantagePct)} against{" "}
                {venueLabel(payload.verdict.bestTradFi.venue)}
              </div>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <label htmlFor="slippage" className="label mb-3 block">
                Slippage tolerance
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  id="slippage"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={slippageBps}
                  onChange={(e) =>
                    setSlippageBps(Math.min(500, Math.max(1, Math.round(Number(e.target.value)))))
                  }
                  className="num w-24 border border-rule bg-ink px-2 py-1.5 text-[0.85rem] text-paper focus:border-rule-strong focus:outline-none"
                />
                <span className="label">bps</span>
              </div>
              <div className="num mt-3 text-[0.65rem] text-paper-faint">
                separate from the {payload.verdict.onChain.transferFeeBps} bps issuer fee, which is not
                slippage and cannot be tolerated away
              </div>
            </div>
          </div>

          <div className="border-t border-rule px-6 py-6 sm:px-7">
            {allowed ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <button
                  type="button"
                  disabled={busy || !wallet.connected}
                  onClick={() => void execute()}
                  className="num w-full border border-paper bg-paper px-5 py-3.5 text-[0.82rem] tracking-[0.08em] text-ink uppercase transition-colors hover:bg-paper-dim disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-paper-faint sm:w-auto"
                >
                  {stage === "building"
                    ? "Building unsigned transaction"
                    : stage === "signing"
                      ? "Waiting for your wallet"
                      : stage === "confirming"
                        ? "Polling to finalized"
                        : `Buy ${fmtUsd(notionalUsd, 0)} of ${symbol}`}
                </button>
                {!wallet.connected ? (
                  <span className="label">connect a wallet above to enable</span>
                ) : null}
              </div>
            ) : (
              <div className="border border-errata bg-errata-wash p-5">
                <div className="num text-[1rem] tracking-[0.04em] text-errata uppercase">
                  Execution withheld
                </div>
                <p className="mt-3 max-w-[64ch] text-[0.98rem] leading-[1.6] text-paper-dim">
                  {payload.verdict.reason}
                </p>
                {largestWinning ? (
                  <button
                    type="button"
                    onClick={() => setNotionalUsd(largestWinning.notionalUsd)}
                    className="label mt-4 border border-rule-strong px-3 py-2 transition-colors hover:text-paper"
                  >
                    Resize to {fmtUsd(largestWinning.notionalUsd, 0)}, the largest quoted size that wins
                  </button>
                ) : null}
              </div>
            )}

            {refusal ? <Note tone="warn">{refusal}</Note> : null}
            {problem ? <Note tone="warn">{problem}</Note> : null}

            {result ? (
              <div className="mt-6 border border-rule">
                <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule px-5 py-4">
                  <span className="label">Post-condition</span>
                  <span
                    className={`num text-[0.95rem] tracking-[0.05em] uppercase ${
                      result.postConditionHeld ? "text-assent" : "text-errata"
                    }`}
                  >
                    {result.postConditionHeld ? "held" : "failed"}
                  </span>
                </div>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 sm:grid-cols-2">
                  <Row k="signature" v={result.signature} wrap />
                  <Row k="confirmed" v={String(result.confirmed)} />
                  <Row k="slot" v={fmtSlot(result.slot)} />
                  <Row k="expected net delta" v={fmtQty(result.expectedNetDelta, 9)} />
                  <Row k="actual net delta" v={fmtQty(result.actualNetDelta, 9)} />
                </dl>
                <div className="border-t border-rule px-5 py-3">
                  <a
                    href={result.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="label hover:text-paper"
                  >
                    Open on the explorer
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </Exhibit>

        <Note>
          FINEPRINT never asks for, receives, stores or displays a private key, secret key or seed
          phrase. The transaction is assembled unsigned on the server, your wallet signs and submits it,
          and the only things that come back here are a signature and the balances read from the chain
          afterwards. A returned signature is not treated as success on its own: the confirmation step
          polls to a terminal state and checks that the destination balance actually moved by the
          expected amount net of the issuer fee.
        </Note>
      </Section>
    </Column>
  );
}

function Row({ k, v, wrap = false }: { k: string; v: string; wrap?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label">{k}</dt>
      <dd className={`num text-[0.75rem] text-paper-dim ${wrap ? "break-all" : ""}`}>{v}</dd>
    </div>
  );
}
