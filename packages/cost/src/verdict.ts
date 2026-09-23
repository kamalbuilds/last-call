import type { CostVerdict, MintFacts, OnChainQuote } from "@fineprint/core";
import type { RoundTrip } from "./jupiter.js";
import { quoteRoundTrip } from "./jupiter.js";
import type { TradFiSelection } from "./tradfi.js";
import { selectTradFi, venueLabel } from "./tradfi.js";

/**
 * A buy and a sell, each confirmed, not one optimistic slot. Solana slot time is
 * about 400ms; 30s is a realistic confirmed-round-trip number that still leaves
 * the speed comparison lopsided in on-chain's favour by four orders of magnitude.
 */
export const ONCHAIN_SETTLEMENT_SECONDS = 30;

export type VerdictResult =
  | { ok: true; verdict: CostVerdict; selection: TradFiSelection }
  | { ok: false; symbol: string; notionalUsd: number; reason: string; noRouteLeg: "buy" | "sell" };

export type RoutedRoundTrip = Extract<RoundTrip, { ok: true }>;

const usdFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = (n: number): string => usdFmt.format(n);
const pct = (n: number): string => `${n.toFixed(2)}%`;
const pp = (n: number): string => `${n.toFixed(2)}pp`;
const bps = (n: number): string => `${n.toFixed(1)}bps`;

/**
 * Assemble the on-chain side of the comparison.
 *
 * The two cost terms are additive and are NOT double counted. Jupiter quotes the
 * AMM's gross amounts; the Token-2022 transfer fee is withheld by the token
 * program on each transfer, outside anything Jupiter sees. Checked against live
 * data on 2026-09-20: ANTHROPIC's measured Jupiter round trip came back at
 * 37.5bps, below the 200bps floor a fee-inclusive quote would have to clear, so
 * the quote is demonstrably gross of the issuer fee.
 */
export function buildOnChainQuote(facts: MintFacts, rt: RoutedRoundTrip): OnChainQuote {
  const transferFeeBps = facts.transferFee.roundTripBps;
  if (!Number.isFinite(transferFeeBps) || transferFeeBps < 0) {
    throw new Error(
      `${facts.symbol}: MintFacts.transferFee.roundTripBps is ${String(transferFeeBps)}, which is not a usable fee. ` +
        `This value must come from the decoded mint, never from a constant: the PreStocks issuer already raised it ` +
        `from 50 to 100bps per transfer and still holds the authority to do it again.`,
    );
  }

  return {
    symbol: facts.symbol,
    notionalUsd: rt.notionalUsd,
    buyImpactBps: rt.buy.priceImpactBps,
    sellImpactBps: rt.sell.priceImpactBps,
    transferFeeBps,
    totalRoundTripBps: rt.ammRoundTripBps + transferFeeBps,
    settlementSeconds: ONCHAIN_SETTLEMENT_SECONDS,
    route: `${rt.buy.route} -> ${rt.sell.route}`,
    quotedAtUnix: Math.floor(Date.now() / 1000),
  };
}

function settlementSentence(sel: TradFiSelection, costWins: boolean): string {
  const v = sel.best;
  const days =
    v.daysToCloseLow === v.daysToCloseHigh
      ? `${v.daysToCloseLow} days`
      : `${v.daysToCloseLow}-${v.daysToCloseHigh} days`;
  const base =
    `Settlement: ~${ONCHAIN_SETTLEMENT_SECONDS} seconds on-chain against ${days} at ${venueLabel(v.venue)}. ` +
    `The speed advantage holds at every size; the cost advantage does not.`;
  return costWins ? base : `${base} Speed is the only thing on-chain wins here.`;
}

/**
 * Turn a measured round trip into the answer.
 *
 * `useOnChain: false` is the expected output at size and the engine is built to
 * emit it. The one case where it says yes without a cost win is when no venue
 * will accept the ticket at all, and the reason string says so in those words
 * rather than dressing access up as savings.
 */
export function decide(facts: MintFacts, notionalUsd: number, rt: RoundTrip): VerdictResult {
  if (!rt.ok) {
    return {
      ok: false,
      symbol: rt.symbol,
      notionalUsd: rt.notionalUsd,
      noRouteLeg: rt.leg,
      reason:
        `No Jupiter route for ${rt.symbol} at $${usd(rt.notionalUsd)} on the ${rt.leg} leg: ${rt.reason}. ` +
        `That is a missing market, not a free one. On-chain cost here is unknown and this size is untradeable.`,
    };
  }

  const onChain = buildOnChainQuote(facts, rt);
  const selection = selectTradFi(notionalUsd);
  const best = selection.best;

  const onChainTotalPct = onChain.totalRoundTripBps / 100;
  const tradFiTotalPct = best.buyFeePct + best.sellFeePct;
  const advantagePct = tradFiTotalPct - onChainTotalPct;
  const cheaper = advantagePct > 0;
  const useOnChain = cheaper || !selection.anyVenueAccepts;

  const size = `$${usd(notionalUsd)}`;
  const label = venueLabel(best.venue);
  let reason: string;

  if (!selection.anyVenueAccepts) {
    const cheapestMinimum = selection.excludedForMinimum.reduce((a, b) =>
      b.minimumUsd < a.minimumUsd ? b : a,
    );
    reason =
      `No listed venue accepts a ${size} ticket (lowest published minimum is $${usd(cheapestMinimum.minimumUsd)} ` +
      `at ${venueLabel(cheapestMinimum.venue)}), so on-chain is the only route, not the cheap one: it costs ` +
      `${pct(onChainTotalPct)} against a ${pct(tradFiTotalPct)} schedule you cannot access.`;
    if (!cheaper) reason += ` On cost alone it loses by ${pp(-advantagePct)}.`;
  } else if (cheaper) {
    reason =
      `On-chain costs ${pct(onChainTotalPct)} round trip against ${pct(tradFiTotalPct)} at ${label}, ` +
      `so it is ${pp(advantagePct)} cheaper at ${size}. ${bps(onChain.transferFeeBps)} of the on-chain number is ` +
      `the Token-2022 issuer transfer fee, which is uncapped and scales with size.`;
  } else {
    reason =
      `Do not use on-chain at this size. On-chain costs ${pct(onChainTotalPct)} round trip against ` +
      `${pct(tradFiTotalPct)} at ${label}, so it is ${pp(-advantagePct)} MORE expensive at ${size}. ` +
      `${bps(onChain.transferFeeBps)} of that is the Token-2022 transfer fee charged on every transfer regardless ` +
      `of size, and ${bps(rt.ammRoundTripBps)} is AMM cost that grows with the ticket.`;
  }

  const verdict: CostVerdict = {
    symbol: facts.symbol,
    notionalUsd,
    onChain,
    bestTradFi: {
      venue: best.venue,
      buyFeePct: best.buyFeePct,
      sellFeePct: best.sellFeePct,
      daysToCloseLow: best.daysToCloseLow,
      daysToCloseHigh: best.daysToCloseHigh,
      sourceUrl: best.sourceUrl,
      sourceNote: best.sourceNote,
    },
    onChainTotalPct,
    tradFiTotalPct,
    advantagePct,
    useOnChain,
    reason,
    settlementAdvantage: settlementSentence(selection, cheaper),
  };

  return { ok: true, verdict, selection };
}

/* ------------------------------------------------------------------ */
/* The scheduled fee increase                                          */
/* ------------------------------------------------------------------ */

/**
 * The same mint facts as they will read once the scheduled fee tier activates.
 *
 * Token-2022 carries the next fee tier on the mint with the epoch it starts
 * being charged, so the increase is not a forecast: it is already signed and
 * sitting in the account, and the only unknown is the clock. Returning the
 * post-activation facts lets the engine price the identical round trip on both
 * sides of that boundary without re-quoting, so any difference in the verdict
 * is the fee change and nothing else.
 *
 * Null when no tier is pending, which is the normal steady state.
 */
export function factsAtPendingTier(facts: MintFacts): MintFacts | null {
  const pendingBps = facts.transferFee.pendingBps ?? null;
  const activationEpoch = facts.transferFee.pendingActivationEpoch ?? null;
  if (pendingBps === null || activationEpoch === null) return null;
  return {
    ...facts,
    transferFee: {
      ...facts.transferFee,
      currentBps: pendingBps,
      roundTripBps: pendingBps * 2,
      pendingBps: null,
      pendingActivationEpoch: null,
      currentEpoch: activationEpoch,
      slotsUntilActivation: null,
      secondsUntilActivation: null,
    },
  };
}

export interface ScheduledFeeChange {
  fromBps: number;
  toBps: number;
  activationEpoch: number;
  slotsUntil: number | null;
  secondsUntil: number | null;
}

/** The pending fee change as a self-contained record, or null if none is scheduled. */
export function scheduledFeeChange(facts: MintFacts): ScheduledFeeChange | null {
  const toBps = facts.transferFee.pendingBps ?? null;
  const activationEpoch = facts.transferFee.pendingActivationEpoch ?? null;
  if (toBps === null || activationEpoch === null) return null;
  return {
    fromBps: facts.transferFee.currentBps,
    toBps,
    activationEpoch,
    slotsUntil: facts.transferFee.slotsUntilActivation ?? null,
    secondsUntil: facts.transferFee.secondsUntilActivation ?? null,
  };
}

/**
 * Both sides of the scheduled fee boundary, priced off ONE round trip.
 *
 * `afterActivation` is null when nothing is pending. It is not a projection of
 * where the market goes; the AMM leg is held fixed on purpose so the delta is
 * attributable to the issuer fee alone.
 */
export interface TimeBoundedVerdict {
  now: VerdictResult;
  afterActivation: VerdictResult | null;
  change: ScheduledFeeChange | null;
}

export function decideNowAndAfter(
  facts: MintFacts,
  notionalUsd: number,
  rt: RoundTrip,
): TimeBoundedVerdict {
  const after = factsAtPendingTier(facts);
  return {
    now: decide(facts, notionalUsd, rt),
    afterActivation: after === null ? null : decide(after, notionalUsd, rt),
    change: scheduledFeeChange(facts),
  };
}

/** Quote Jupiter live for both legs, then decide. */
export async function costVerdict(
  facts: MintFacts,
  notionalUsd: number,
  opts?: { slippageBps?: number; signal?: AbortSignal },
): Promise<VerdictResult> {
  return decide(facts, notionalUsd, await quoteLive(facts, notionalUsd, opts));
}

/** One live quote, priced both before and after the scheduled fee change. */
export async function costVerdictOverTime(
  facts: MintFacts,
  notionalUsd: number,
  opts?: { slippageBps?: number; signal?: AbortSignal },
): Promise<TimeBoundedVerdict> {
  return decideNowAndAfter(facts, notionalUsd, await quoteLive(facts, notionalUsd, opts));
}

function quoteLive(
  facts: MintFacts,
  notionalUsd: number,
  opts?: { slippageBps?: number; signal?: AbortSignal },
): Promise<RoundTrip> {
  return quoteRoundTrip({
    symbol: facts.symbol,
    mint: facts.mint,
    notionalUsd,
    ...(opts?.slippageBps === undefined ? {} : { slippageBps: opts.slippageBps }),
    ...(opts?.signal === undefined ? {} : { signal: opts.signal }),
  });
}
