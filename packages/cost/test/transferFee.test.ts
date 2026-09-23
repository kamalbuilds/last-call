import { beforeAll, describe, expect, it } from "vitest";
import type { MintFacts } from "@fineprint/core";
import type { RoutedRoundTrip } from "../src/index.js";
import {
  buildOnChainQuote,
  decide,
  decideNowAndAfter,
  factsAtPendingTier,
  quoteRoundTrip,
  selectTradFi,
} from "../src/index.js";
import { epochPosition, mintFacts, TOKEN_2022_PROGRAM } from "./mintFacts.js";

/**
 * The negative case.
 *
 * Every other test here would still pass if the transfer fee term were silently
 * dropped on a token whose AMM cost already clears the tradfi bar. These tests
 * exist to prove the fee term is load-bearing: doctor the MintFacts, and the
 * answer has to move. If it does not, the fee is not being applied and the rest
 * of the suite is decoration.
 */

function doctor(facts: MintFacts, roundTripBps: number): MintFacts {
  return {
    ...facts,
    transferFee: { ...facts.transferFee, roundTripBps, currentBps: roundTripBps / 2 },
  };
}

/**
 * A control point where the transfer fee is decisive: AMM cost alone sits under
 * the tradfi bar, so with the fee zeroed the answer is yes and with the real fee
 * applied it can be no. Assuming such a point exists at a fixed symbol and size
 * is how this test failed the first time it ran: ANTHROPIC at $100k costs more
 * than Forge on AMM cost alone, so no fee value could ever flip it to yes.
 * It is searched for against live quotes instead.
 */
interface ControlPoint {
  facts: MintFacts;
  notionalUsd: number;
  rt: RoutedRoundTrip;
  tradFiBps: number;
}

const CANDIDATES: ReadonlyArray<readonly [string, number]> = [
  ["ANTHROPIC", 10_000],
  ["ANTHROPIC", 50_000],
  ["OPENAI", 10_000],
  ["POLYMARKET", 10_000],
  ["KALSHI", 10_000],
  ["ANTHROPIC", 100_000],
];

let control: ControlPoint | null = null;
const searchLog: string[] = [];

beforeAll(async () => {
  for (const [symbol, notionalUsd] of CANDIDATES) {
    const facts = await mintFacts(symbol);
    const rt = await quoteRoundTrip({ symbol: facts.symbol, mint: facts.mint, notionalUsd });
    if (!rt.ok) {
      searchLog.push(`${symbol} @ $${notionalUsd.toLocaleString("en-US")}: no route (${rt.leg} leg)`);
      continue;
    }
    const sel = selectTradFi(notionalUsd);
    const tradFiBps = (sel.best.buyFeePct + sel.best.sellFeePct) * 100;
    searchLog.push(
      `${symbol} @ $${notionalUsd.toLocaleString("en-US")}: AMM ${rt.ammRoundTripBps.toFixed(1)}bps vs ` +
        `${sel.best.venue} bar ${tradFiBps.toFixed(0)}bps` +
        (rt.ammRoundTripBps < tradFiBps ? "  <- usable control" : ""),
    );
    if (rt.ammRoundTripBps < tradFiBps && control === null) {
      control = { facts, notionalUsd, rt, tradFiBps };
    }
  }
  console.log(`\ncontrol-point search\n  ${searchLog.join("\n  ")}\n`);
}, 180_000);

function requireControl(): ControlPoint {
  if (control === null) {
    throw new Error(
      `No candidate had AMM cost below its tradfi bar, so the fee cannot be shown to be decisive at ` +
        `any of them. That is itself a finding, not a flaky test: on today's books the AMM leg alone ` +
        `already loses everywhere tried. Search log:\n  ${searchLog.join("\n  ")}`,
    );
  }
  return control;
}

describe("the Token-2022 fee is decoded, not assumed", () => {
  it("reads roundTripBps off the mint rather than from a constant", async () => {
    const facts = await mintFacts("NEURALINK");
    expect(facts.ownerProgram).toBe(TOKEN_2022_PROGRAM);
    expect(facts.extensionsPresent).toContain("transferFeeConfig");
    // Two transfers per round trip. Whatever the issuer has set today.
    expect(facts.transferFee.roundTripBps).toBe(facts.transferFee.currentBps * 2);
    // The fee is uncapped, which is what makes it bite at size.
    expect(facts.transferFee.uncapped).toBe(true);
    // It has already moved once. Assert the historical tier is present so a
    // future change is visible rather than silently absorbed.
    expect(facts.transferFee.previous).not.toBeNull();
    console.log(
      `\nNEURALINK mint ${facts.mint}\n  in force ${facts.transferFee.currentBps}bps/transfer ` +
        `at epoch ${String(facts.transferFee.currentEpoch)}, round trip ${facts.transferFee.roundTripBps}bps\n` +
        `  tiers on the mint: older ${facts.transferFee.previous?.transferFeeBasisPoints}bps ` +
        `(epoch ${facts.transferFee.previous?.epoch}), newer ${facts.transferFee.current.transferFeeBasisPoints}bps ` +
        `(epoch ${facts.transferFee.current.epoch})\n` +
        `  pending ${String(facts.transferFee.pendingBps)}bps at epoch ` +
        `${String(facts.transferFee.pendingActivationEpoch)}, ` +
        `${((facts.transferFee.secondsUntilActivation ?? 0) / 3600).toFixed(2)}h away\n` +
        `  uncapped=${facts.transferFee.uncapped}, read at slot ${facts.slot}\n`,
    );
  });

  /**
   * The fee being priced has to be the one the chain is charging, not the one
   * the issuer has queued. The two differ right now: the newer tier is stamped
   * with an epoch the chain has not reached, so quoting it overstates every
   * number in the sweep by the difference.
   *
   * The expected value is recomputed here straight from the live epoch and the
   * two raw tiers, so a decoder that went back to taking the newer tier
   * unconditionally fails this outright rather than drifting quietly.
   */
  it("prices the tier the current epoch has activated, not the scheduled one", async () => {
    const epoch = await epochPosition();
    const facts = await mintFacts("NEURALINK");
    const newer = facts.transferFee.current;
    const older = facts.transferFee.previous ?? newer;
    const expectedBps =
      epoch.epoch >= newer.epoch ? newer.transferFeeBasisPoints : older.transferFeeBasisPoints;

    expect(facts.transferFee.currentEpoch).toBe(epoch.epoch);
    expect(facts.transferFee.currentBps).toBe(expectedBps);
    expect(facts.transferFee.roundTripBps).toBe(expectedBps * 2);

    if (epoch.epoch < newer.epoch) {
      // The window this fix exists for. The scheduled tier must NOT be charged.
      expect(facts.transferFee.currentBps).toBe(older.transferFeeBasisPoints);
      expect(facts.transferFee.currentBps).not.toBe(newer.transferFeeBasisPoints);
      expect(facts.transferFee.pendingBps).toBe(newer.transferFeeBasisPoints);
      expect(facts.transferFee.pendingActivationEpoch).toBe(newer.epoch);
      const slots = facts.transferFee.slotsUntilActivation;
      expect(slots).toBeGreaterThan(0);
      expect(slots).toBeLessThanOrEqual((newer.epoch - epoch.epoch) * epoch.slotsInEpoch);
      expect(facts.transferFee.secondsUntilActivation).toBeCloseTo(slots! * 0.4, 6);
    } else {
      expect(facts.transferFee.currentBps).toBe(newer.transferFeeBasisPoints);
      expect(facts.transferFee.pendingBps).toBeNull();
      expect(facts.transferFee.slotsUntilActivation).toBeNull();
    }
  });

  /**
   * The time-bounded answer, which is the finding worth shipping: the same
   * round trip, priced on both sides of an increase that is already signed on
   * the mint and only waiting on the clock. One quote is used for both so the
   * entire difference is the issuer fee.
   */
  it("prices the same round trip on both sides of the scheduled fee change", async () => {
    const { facts, notionalUsd, rt } = requireControl();
    const t = decideNowAndAfter(facts, notionalUsd, rt);
    if (!t.now.ok) throw new Error("decide() returned no-route on an ok round trip");

    if (t.change === null) {
      expect(t.afterActivation).toBeNull();
      expect(factsAtPendingTier(facts)).toBeNull();
      console.log("\nno fee tier pending: today's verdict has no expiry\n");
      return;
    }

    expect(t.afterActivation).not.toBeNull();
    if (!t.afterActivation!.ok) throw new Error("post-activation verdict came back no-route");
    const now = t.now.verdict;
    const after = t.afterActivation!.verdict;

    console.log(
      `\nscheduled fee change, ${facts.symbol} @ $${notionalUsd.toLocaleString("en-US")}, one quote both sides\n` +
        `  now                    ${now.onChain.transferFeeBps}bps fee -> ` +
        `${now.onChain.totalRoundTripBps.toFixed(1)}bps total, useOnChain=${now.useOnChain}\n` +
        `  after epoch ${t.change.activationEpoch}       ${after.onChain.transferFeeBps}bps fee -> ` +
        `${after.onChain.totalRoundTripBps.toFixed(1)}bps total, useOnChain=${after.useOnChain}\n` +
        `  activation is ${String(t.change.slotsUntil)} slots away ` +
        `(${((t.change.secondsUntil ?? 0) / 3600).toFixed(2)}h)\n`,
    );

    expect(t.change.toBps).toBeGreaterThan(t.change.fromBps);
    expect(now.onChain.transferFeeBps).toBe(t.change.fromBps * 2);
    expect(after.onChain.transferFeeBps).toBe(t.change.toBps * 2);
    // Same quote, so the AMM leg is identical and the whole delta is the fee.
    expect(after.onChain.buyImpactBps).toBe(now.onChain.buyImpactBps);
    expect(after.onChain.totalRoundTripBps - now.onChain.totalRoundTripBps).toBeCloseTo(
      (t.change.toBps - t.change.fromBps) * 2,
      6,
    );
    expect(after.advantagePct).toBeLessThan(now.advantagePct);
    // A higher fee can never make on-chain the better answer.
    if (!now.useOnChain) expect(after.useOnChain).toBe(false);
    // The post-activation facts carry no countdown, because it has landed.
    const post = factsAtPendingTier(facts)!;
    expect(post.transferFee.pendingBps).toBeNull();
    expect(post.transferFee.currentEpoch).toBe(t.change.activationEpoch);
  });

  it("changes the verdict when the fee is doctored to zero", () => {
    // One live round trip, reused for both verdicts, so the ONLY difference
    // between them is the transfer fee. Re-quoting would let AMM drift explain
    // the delta and the test would prove nothing.
    const { facts, notionalUsd, rt } = requireControl();

    const withFee = decide(facts, notionalUsd, rt);
    const withoutFee = decide(doctor(facts, 0), notionalUsd, rt);
    if (!withFee.ok || !withoutFee.ok) throw new Error("decide() returned no-route on an ok round trip");

    const a = withFee.verdict;
    const b = withoutFee.verdict;

    console.log(
      `\ndoctored-fee control, ${facts.symbol} @ $${notionalUsd.toLocaleString("en-US")}, same quote both sides\n` +
        `  real fee ${a.onChain.transferFeeBps}bps -> total ${a.onChain.totalRoundTripBps.toFixed(1)}bps, ` +
        `useOnChain=${a.useOnChain}\n` +
        `  fee 0bps        -> total ${b.onChain.totalRoundTripBps.toFixed(1)}bps, useOnChain=${b.useOnChain}\n`,
    );

    expect(a.onChain.transferFeeBps).toBeGreaterThan(0);
    expect(b.onChain.transferFeeBps).toBe(0);
    // The fee has to show up in the total, one for one.
    expect(a.onChain.totalRoundTripBps - b.onChain.totalRoundTripBps).toBeCloseTo(
      facts.transferFee.roundTripBps,
      6,
    );
    expect(a.onChainTotalPct).toBeGreaterThan(b.onChainTotalPct);
    expect(a.advantagePct).toBeLessThan(b.advantagePct);
    expect(a.reason).not.toBe(b.reason);
    // Zeroing the fee must remove it from the sentence the user reads.
    expect(b.reason).toContain("0.0bps");
  });

  it("flips useOnChain outright at a fee large enough to matter", () => {
    const { facts, notionalUsd, rt, tradFiBps } = requireControl();

    const zeroFee = decide(doctor(facts, 0), notionalUsd, rt);
    // A fee that is unambiguously past the tradfi bar given this AMM cost.
    const killerFee = tradFiBps - rt.ammRoundTripBps + 100;
    const heavyFee = decide(doctor(facts, killerFee), notionalUsd, rt);
    if (!zeroFee.ok || !heavyFee.ok) throw new Error("unexpected no-route");

    console.log(
      `\nfee sensitivity, ${facts.symbol} @ $${notionalUsd.toLocaleString("en-US")} ` +
        `against a ${tradFiBps.toFixed(0)}bps tradfi bar, AMM ${rt.ammRoundTripBps.toFixed(1)}bps\n` +
        `  fee    0bps -> useOnChain=${zeroFee.verdict.useOnChain}\n` +
        `  fee ${killerFee.toFixed(0).padStart(4)}bps -> useOnChain=${heavyFee.verdict.useOnChain}\n`,
    );

    expect(zeroFee.verdict.useOnChain).toBe(true);
    expect(heavyFee.verdict.useOnChain).toBe(false);
    expect(heavyFee.verdict.reason).toContain("Do not use on-chain at this size");
  });

  it("refuses a MintFacts whose fee is missing or nonsense", () => {
    const { facts, rt } = requireControl();
    expect(() => buildOnChainQuote(doctor(facts, Number.NaN), rt)).toThrow(/not a usable fee/);
    expect(() => buildOnChainQuote(doctor(facts, -50), rt)).toThrow(/not a usable fee/);
  });
});

describe("settlement is reported honestly", () => {
  it("keeps the speed claim even when the cost verdict is a refusal", () => {
    const { facts, notionalUsd, rt, tradFiBps } = requireControl();
    const killerFee = tradFiBps - rt.ammRoundTripBps + 100;
    const refusal = decide(doctor(facts, killerFee), notionalUsd, rt);
    if (!refusal.ok) throw new Error("unexpected no-route");

    expect(refusal.verdict.useOnChain).toBe(false);
    expect(refusal.verdict.settlementAdvantage).toContain("seconds on-chain");
    expect(refusal.verdict.settlementAdvantage).toContain("Speed is the only thing on-chain wins here");
    expect(refusal.verdict.onChain.settlementSeconds).toBeLessThan(120);
  });

  it("carries both of Forge's conflicting close times instead of averaging them", () => {
    const sel = selectTradFi(100_000);
    expect(sel.best.venue).toBe("forge");
    expect(sel.best.daysToCloseLow).toBe(42);
    expect(sel.best.daysToCloseHigh).toBe(60);
    // 51 would be the average. The engine must not have invented it.
    expect(sel.best.daysToCloseLow).not.toBe(51);
    expect(sel.best.sourceNote).toContain("42");
    expect(sel.best.sourceNote).toContain("45-60");
    expect(sel.best.sourceNote).toContain("not averaged");
  });
});
