"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Column, Exhibit, Note, Section, TableFrame, Td, Th } from "@/components/doc";
import { FeeClockPanel } from "@/components/fee-clock";
import {
  MAX_USD,
  MIN_USD,
  dialToUsd,
  usdToDial,
  useSize,
  type VerdictPayload,
} from "@/components/size-context";
import type { CostVerdict, TradFiQuote } from "@/lib/contract";
import type { FeeSchedule } from "@/lib/fee-schedule";
import {
  fmtBps,
  fmtPctPlain,
  fmtPoints,
  fmtSettlement,
  fmtUsd,
  fmtUsdCompact,
  venueLabel,
} from "@/lib/format";

type ApiResponse = ({ ok: true } & VerdictPayload) | { ok: false; reason: string };

export function CostSection({
  tradFi,
  ladder,
  feeSchedule,
  issuedAtMs,
  exhibitSymbol,
}: {
  tradFi: TradFiQuote[];
  ladder: CostVerdict[];
  feeSchedule: FeeSchedule | null;
  issuedAtMs: number;
  exhibitSymbol: string;
}) {
  const { notionalUsd, setNotionalUsd, symbol, verdict: payload, setVerdict } = useSize();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (notionalUsd === payload.requestedUsd) return;
    const id = ++seq.current;
    const controller = new AbortController();
    setPending(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/verdict?symbol=${encodeURIComponent(symbol)}&usd=${notionalUsd}`, {
        signal: controller.signal,
      })
        .then((r) => r.json() as Promise<ApiResponse>)
        .then((body) => {
          if (id !== seq.current) return;
          if (body.ok) {
            setVerdict({
              verdict: body.verdict,
              source: body.source,
              exact: body.exact,
              requestedUsd: body.requestedUsd,
            });
            setError(null);
          } else {
            setError(body.reason);
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || id !== seq.current) return;
          setError(err instanceof Error ? err.message : "The quote request failed.");
        })
        .finally(() => {
          if (id === seq.current) setPending(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [notionalUsd, symbol, payload.requestedUsd, setVerdict]);

  const v = payload.verdict;
  const quotedUsd = v.notionalUsd;
  const rows = useMemo(() => {
    const venueRows = tradFi.map((q) => ({
      key: q.venue,
      name: venueLabel(q.venue),
      basis: `${fmtPctPlain(q.buyFeePct, 2)} buy + ${fmtPctPlain(q.sellFeePct, 2)} sell`,
      totalPct: q.buyFeePct + q.sellFeePct,
      settlement:
        q.daysToCloseLow === q.daysToCloseHigh
          ? `${q.daysToCloseLow} days`
          : `${q.daysToCloseLow} to ${q.daysToCloseHigh} days`,
      onChain: false,
      note: q.sourceNote,
      url: q.sourceUrl,
    }));
    const chain = {
      key: "onchain",
      name: "On-chain",
      basis: `${fmtBps(v.onChain.transferFeeBps)} issuer fee + ${fmtBps(
        Math.round((v.onChain.buyImpactBps + v.onChain.sellImpactBps) * 10) / 10,
      )} route impact`,
      totalPct: v.onChainTotalPct,
      settlement: fmtSettlement(v.onChain.settlementSeconds),
      onChain: true,
      note: v.onChain.route,
      url: null,
    };
    return [chain, ...venueRows].sort((a, b) => a.totalPct - b.totalPct);
  }, [tradFi, v]);

  const maxPct = Math.max(...rows.map((r) => r.totalPct));
  const cheaper = v.useOnChain;
  const crossover = ladder.find((l) => !l.useOnChain);

  return (
    <Column>
      <Section
        id="cost"
        mark="§ 2"
        title="The cost depends on your size, and it can invert."
        standfirst={
          feeSchedule ? (
            <>
              Every transfer of these mints pays an issuer fee of {feeSchedule.inForceBps} bps today,
              and <code className="font-mono text-[0.92em] text-paper">maximumFee</code> is set to u64
              max, so it is uncapped at any size. Route impact grows on top of it, and the fee tier
              itself is about to change. Move the dial and watch the on-chain path pass the venues it
              is supposed to beat.
            </>
          ) : (
            <>
              The issuer fee is charged on every transfer and{" "}
              <code className="font-mono text-[0.92em] text-paper">maximumFee</code> is set to u64 max,
              so it is uncapped at any size. Route impact grows on top of it. Move the dial and watch
              the on-chain path pass the venues it is supposed to beat.
            </>
          )
        }
      >
        {feeSchedule ? (
          <div className="mb-6">
            <FeeClockPanel
              schedule={feeSchedule}
              issuedAtMs={issuedAtMs}
              symbol={exhibitSymbol}
              quotedNotionalUsd={quotedUsd}
              quotedTotalPct={v.onChainTotalPct}
              quotedTransferFeeBps={v.onChain.transferFeeBps}
            />
          </div>
        ) : null}

        <Exhibit>
          <div className="border-b border-rule px-6 pt-6 pb-5 sm:px-7">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <label htmlFor="size-dial" className="label">
                  Trade size
                </label>
                <div className="num mt-2 text-[2rem] leading-none text-paper tabular-nums sm:text-[2.6rem]">
                  {fmtUsd(notionalUsd, 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="label">Quoted at</div>
                <div className="num mt-2 text-[0.85rem] text-paper-dim">
                  {fmtUsd(quotedUsd, 0)}
                  {pending ? <span className="ml-2 text-paper-faint">requoting</span> : null}
                </div>
              </div>
            </div>

            <input
              id="size-dial"
              type="range"
              className="dial mt-5"
              min={0}
              max={1000}
              step={1}
              value={usdToDial(notionalUsd)}
              aria-label="Trade size in US dollars"
              aria-valuetext={fmtUsd(notionalUsd, 0)}
              onChange={(e) => setNotionalUsd(dialToUsd(Number(e.target.value)))}
            />
            <div className="mt-1 flex justify-between gap-1">
              {[MIN_USD, 1000, 10_000, 100_000, MAX_USD].map((tick) => (
                <button
                  key={tick}
                  type="button"
                  onClick={() => setNotionalUsd(tick)}
                  className={`label transition-colors hover:text-paper ${
                    notionalUsd === tick ? "text-paper" : ""
                  }`}
                >
                  {fmtUsdCompact(tick)}
                </button>
              ))}
            </div>

            {!payload.exact ? (
              <Note tone="warn">
                No live route quote is available at {fmtUsd(notionalUsd, 0)}. The figures below are the
                nearest size that was actually measured, {fmtUsd(quotedUsd, 0)}, and every dollar figure
                is computed at that size rather than at the dial. Nothing is interpolated.
              </Note>
            ) : null}
            {error ? <Note tone="warn">{error}</Note> : null}
          </div>

          <TableFrame>
            <table className="w-full min-w-[840px] border-collapse">
              <thead>
                <tr>
                  <Th>Venue</Th>
                  <Th>Fee basis</Th>
                  <Th align="right">Round trip</Th>
                  <Th>Relative</Th>
                  <Th align="right">On {fmtUsd(quotedUsd, 0)}</Th>
                  <Th align="right">Settlement</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className={`border-t border-rule ${r.onChain ? "bg-ink-raised" : ""}`}
                  >
                    <Td className={r.onChain ? "!text-paper" : "!text-paper-dim"}>{r.name}</Td>
                    <Td tone="dim">{r.basis}</Td>
                    <Td align="right">
                      <span className={r.onChain && !cheaper ? "text-errata" : "text-paper"}>
                        {fmtPctPlain(r.totalPct, 3)}
                      </span>
                    </Td>
                    <Td className="w-[11rem] min-w-[7rem]">
                      <span className="block h-[3px] w-full bg-rule" aria-hidden>
                        <span
                          className={`block h-[3px] ${
                            r.onChain ? (cheaper ? "bg-assent" : "bg-errata") : "bg-paper-faint"
                          }`}
                          style={{ width: `${Math.max(2, (r.totalPct / maxPct) * 100)}%` }}
                        />
                      </span>
                    </Td>
                    <Td align="right">{fmtUsd((r.totalPct / 100) * quotedUsd, 0)}</Td>
                    <Td align="right" tone={r.onChain ? "assent" : "dim"}>
                      {r.settlement}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>

          <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-rule px-6 py-4 sm:px-7 lg:grid-cols-[9rem_1fr]">
            <span className="label pt-0.5">Route quoted</span>
            <span className="num text-[0.7rem] leading-[1.7] break-words text-paper-dim">
              {v.onChain.route}
            </span>
          </div>
        </Exhibit>

        <div className="mt-6 grid grid-cols-1 gap-px bg-rule md:grid-cols-2">
          <div className={`p-6 sm:p-7 ${cheaper ? "bg-ink-panel" : "bg-errata-wash"}`}>
            <div className="label">Verdict 1 of 2, cost</div>
            <div
              className={`num mt-3 text-[1.35rem] leading-[1.15] tracking-[-0.01em] sm:text-[1.6rem] ${
                cheaper ? "text-paper" : "text-errata"
              }`}
            >
              {cheaper ? "ON-CHAIN IS CHEAPER HERE" : "DO NOT DO THIS ON-CHAIN"}
            </div>
            <div className="num mt-2 text-[0.8rem] text-paper-dim">
              {fmtPoints(v.advantagePct)} against {venueLabel(v.bestTradFi.venue)}
            </div>
            <p className="mt-4 max-w-[52ch] text-[0.95rem] leading-[1.6] text-paper-dim">{v.reason}</p>
          </div>
          <div className="bg-ink-panel p-6 sm:p-7">
            <div className="label">Verdict 2 of 2, speed</div>
            <div className="num mt-3 text-[1.35rem] leading-[1.15] tracking-[-0.01em] text-assent sm:text-[1.6rem]">
              ON-CHAIN, AT EVERY SIZE
            </div>
            <div className="num mt-2 text-[0.8rem] text-paper-dim">
              {fmtSettlement(v.onChain.settlementSeconds)} against{" "}
              {v.bestTradFi.daysToCloseLow} days or more
            </div>
            <p className="mt-4 max-w-[52ch] text-[0.95rem] leading-[1.6] text-paper-dim">
              {v.settlementAdvantage}
            </p>
          </div>
        </div>
        <Note>
          Two verdicts, never one score. Blending a settlement advantage measured in seconds with a cost
          disadvantage measured in basis points produces a number that means nothing, and it is how every
          comparison of this kind ends up flattering the on-chain path.
        </Note>

        {crossover ? (
          <Note>
            On the route quoted here the advantage inverts by {fmtUsd(crossover.notionalUsd, 0)}: the
            issuer fee is a flat {fmtBps(crossover.onChain.transferFeeBps)} that never shrinks, while route
            impact rose from {fmtBps(ladder[0].onChain.buyImpactBps + ladder[0].onChain.sellImpactBps)} at{" "}
            {fmtUsd(ladder[0].notionalUsd, 0)} to{" "}
            {fmtBps(crossover.onChain.buyImpactBps + crossover.onChain.sellImpactBps)} here. Thinner names
            invert far earlier than this one.
          </Note>
        ) : null}
      </Section>
    </Column>
  );
}
