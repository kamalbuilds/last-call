"use client";

import { useEffect, useState } from "react";

import { Exhibit, Note } from "@/components/doc";
import type { FeeSchedule } from "@/lib/fee-schedule";
import { fmtBps, fmtPctPlain, fmtSlot, fmtUsd } from "@/lib/format";

/**
 * The fee tier that has not activated yet, and how long is left.
 *
 * The clock is authored server-side from the chain's own epoch position and then
 * ticks locally, so a page left open does not quietly show a stale remaining time.
 */

function remainingSeconds(schedule: FeeSchedule, issuedAtMs: number): number | null {
  if (schedule.secondsUntilActivation === null) return null;
  const elapsed = (Date.now() - issuedAtMs) / 1000;
  return Math.max(0, schedule.secondsUntilActivation - elapsed);
}

function split(total: number): { h: number; m: number; s: number } {
  const whole = Math.floor(total);
  return {
    h: Math.floor(whole / 3600),
    m: Math.floor((whole % 3600) / 60),
    s: whole % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function FeeCountdown({
  schedule,
  issuedAtMs,
}: {
  schedule: FeeSchedule;
  issuedAtMs: number;
}) {
  // The first render on both sides must agree, so it uses the value as issued by the
  // server with no elapsed time subtracted. Ticking starts after hydration.
  const [left, setLeft] = useState<number | null>(schedule.secondsUntilActivation);

  useEffect(() => {
    setLeft(remainingSeconds(schedule, issuedAtMs));
    const id = window.setInterval(() => setLeft(remainingSeconds(schedule, issuedAtMs)), 1000);
    return () => window.clearInterval(id);
  }, [schedule, issuedAtMs]);

  if (left === null) return <span className="num">timing unavailable</span>;
  if (left <= 0) return <span className="num text-errata">activated, reload to re-read</span>;
  const { h, m, s } = split(left);
  return (
    <span className="num tabular-nums">
      {h}h {pad(m)}m {pad(s)}s
    </span>
  );
}

export function FeeClockPanel({
  schedule,
  issuedAtMs,
  symbol,
  quotedNotionalUsd,
  quotedTotalPct,
  quotedTransferFeeBps,
}: {
  schedule: FeeSchedule;
  issuedAtMs: number;
  symbol: string;
  quotedNotionalUsd: number;
  quotedTotalPct: number;
  quotedTransferFeeBps: number;
}) {
  const pending = schedule.pendingBps;
  if (pending === null || schedule.pendingRoundTripBps === null) return null;

  const deltaRoundTripBps = schedule.pendingRoundTripBps - schedule.inForceRoundTripBps;
  const afterPct = quotedTotalPct + deltaRoundTripBps / 100;
  const multiple = schedule.inForceBps === 0 ? null : pending / schedule.inForceBps;
  const mismatch = quotedTransferFeeBps !== schedule.inForceRoundTripBps;

  return (
    <Exhibit className="border-caution/50">
      <div className="grid grid-cols-1 divide-y divide-rule lg:grid-cols-[1.15fr_1fr_1fr] lg:divide-x lg:divide-y-0">
        <div className="p-6 sm:p-7">
          <div className="label">
            {multiple === 2 ? "The issuer fee doubles in" : "The issuer fee changes in"}
          </div>
          <div className="mt-3 text-[1.9rem] leading-none tracking-[-0.02em] text-caution sm:text-[2.4rem]">
            <FeeCountdown schedule={schedule} issuedAtMs={issuedAtMs} />
          </div>
          <div className="num mt-3 text-[0.7rem] leading-[1.7] text-paper-faint">
            at epoch {schedule.pendingActivationEpoch}
            {schedule.currentEpoch !== null ? `, chain is in ${schedule.currentEpoch}` : ""}
            {schedule.slotsUntilActivation !== null
              ? `, ${fmtSlot(Math.round(schedule.slotsUntilActivation))} slots away`
              : ""}
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <div className="label">Per transfer, now and after</div>
          <div className="num mt-3 flex items-baseline gap-3 text-[1.5rem] leading-none sm:text-[1.8rem]">
            <span className="text-paper">{schedule.inForceBps}</span>
            <span className="text-paper-faint text-[1rem]">→</span>
            <span className="text-errata">{pending}</span>
            <span className="label">bps</span>
          </div>
          <div className="num mt-3 text-[0.7rem] leading-[1.7] text-paper-faint">
            round trip {fmtBps(schedule.inForceRoundTripBps)} → {fmtBps(schedule.pendingRoundTripBps)}
            {schedule.uncapped ? ", uncapped at any size" : ""}
            <br />
            tier in force since epoch {schedule.inForceEpoch}
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <div className="label">Your {fmtUsd(quotedNotionalUsd, 0)} round trip</div>
          <div className="num mt-3 flex items-baseline gap-3 text-[1.5rem] leading-none sm:text-[1.8rem]">
            <span className="text-paper">{fmtPctPlain(quotedTotalPct, 3)}</span>
            <span className="text-paper-faint text-[1rem]">→</span>
            <span className="text-errata">{fmtPctPlain(afterPct, 3)}</span>
          </div>
          <div className="num mt-3 text-[0.7rem] leading-[1.7] text-paper-faint">
            {fmtUsd((quotedTotalPct / 100) * quotedNotionalUsd, 0)} →{" "}
            {fmtUsd((afterPct / 100) * quotedNotionalUsd, 0)} on the same route. The route is
            unchanged; only the issuer fee moves, so the difference is exact rather than forecast.
          </div>
        </div>
      </div>

      <div className="border-t border-rule px-6 py-4 sm:px-7">
        <Note>
          Both tiers are on the mint now and both parse. {symbol} is charged the tier whose epoch the
          chain has actually reached, which is why a reader that takes{" "}
          <span className="text-paper-dim">newerTransferFee</span> as current reports a fee nobody is
          paying yet. Timing read{" "}
          {schedule.source === "core"
            ? "from @fineprint/core."
            : "from getEpochInfo against the same endpoint as the mint decode."}{" "}
          Slot time is the nominal 400ms, so the clock drifts with real block production.
        </Note>
        {mismatch ? (
          <Note tone="warn">
            The cost surface quoted {fmtBps(quotedTransferFeeBps)} of issuer fee on the round trip
            while the mint is charging {fmtBps(schedule.inForceRoundTripBps)} today. The mint account
            is the stronger source for what is charged; the quote is the stronger source for the route.
            Both are shown rather than one being silently preferred.
          </Note>
        ) : null}
      </div>
    </Exhibit>
  );
}
