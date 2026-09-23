import type { TradFiQuote, Venue } from "@fineprint/core";

/**
 * Published fee schedules for the three pre-IPO secondary venues this engine
 * compares against. Every number below was read from the venue's own page or
 * its own Form CRS on 2026-09-20. Nothing here is an estimate or an average of
 * competing sources.
 *
 * Bias control, and it points AGAINST the on-chain path on purpose:
 * where a venue publishes a band, this file carries the CHEAPEST end of that
 * band as the headline fee. The full band is preserved in `feeBandNote`. A
 * $100k trade on Forge therefore has to be beaten at Forge's 2% rate, not at
 * its 4% rate, before the engine will say on-chain is cheaper. Quoting the top
 * of every band would hand the on-chain path a win it did not earn.
 */
export interface TradFiVenueFacts extends TradFiQuote {
  /**
   * Smallest transaction the venue itself says it will take, in USD.
   * Below this the venue is not an option at all, whatever its fee says.
   */
  minimumUsd: number;
  minimumSourceUrl: string;
  /** The published range this quote's headline number was taken from. */
  feeBandNote: string;
}

/**
 * Forge Global.
 *
 * Fees, first-party, both sides published as a 2-4% band:
 *   Buyer  "fees for buyers start at approximately 2% to 4% of the total
 *          transaction size"
 *          https://forgeglobal.com/insights/private-market-education/how-to-buy-private-shares-on-forge-a-complete-guide/
 *   Seller "seller fees range from approximately 2% to 4% of the total
 *          transaction size"
 *          https://forgeglobal.com/insights/private-market-education/how-to-sell-private-shares-on-forge-a-complete-guide/
 *
 * SETTLEMENT CONFLICT. Two first-party Forge numbers disagree and this file
 * carries both rather than splitting them, because they describe different
 * intervals and only Forge knows which one a given trade lands on.
 */
export const FORGE: TradFiVenueFacts = {
  venue: "forge",
  buyFeePct: 2.0,
  sellFeePct: 2.0,
  daysToCloseLow: 42,
  daysToCloseHigh: 60,
  sourceUrl:
    "https://forgeglobal.com/insights/private-market-education/how-to-buy-private-shares-on-forge-a-complete-guide/",
  sourceNote:
    "Fees: Forge's own buyer and seller guides both publish 2-4% per side; the 2% low end is used here. " +
    "Settlement, two first-party Forge figures that do not reconcile, carried separately and not averaged: " +
    "(a) 42 days, reported as Forge's FY2024 average time to close a direct secondary, attributed to the " +
    "FY2024 Form 10-K; this build did not re-read the filing itself, so it is the weaker of the two. " +
    "(b) 45-60 calendar days after trade terms are agreed, stated on Forge's own buyer guide, which also " +
    "says the ROFR step alone runs 30-45 days and that a board has 30-45 BUSINESS days to exercise ROFR. " +
    "45 business days is about 63 calendar days, so Forge's own page is internally inconsistent: the ROFR " +
    "leg alone can exceed the 45-60 day total it quotes for the whole process. Treat 42 as a best case and " +
    "60+ as the realistic case. A separate Forge fund/SPV path settles faster and charges 1-2% one time, " +
    "but buys fund units rather than shares, so it is not the like-for-like comparison this engine makes.",
  minimumUsd: 100_000,
  minimumSourceUrl:
    "https://forgeglobal.com/insights/private-market-education/how-to-buy-private-shares-on-forge-a-complete-guide/",
  feeBandNote: "2-4% buyer and 2-4% seller, per Forge's own buyer and seller guides. Low end used.",
};

/**
 * EquityZen, a Morgan Stanley subsidiary since January 2026.
 *
 * "The lower fees take effect immediately with buy and sell side fees reduced
 *  to 2.5% down from 5% for most transactions [...] The industry-lowest
 *  minimums of $5,000 will continue."
 *  https://www.morganstanley.com/press-releases/mswm-reduces-fees-on-private-shares-marketplace-equityzen
 *
 * Seller side confirmed independently on EquityZen's own help centre:
 * "EquityZen charges sellers a 2.5% fee when the transaction closes."
 *  https://help.equityzen.com/en/articles/8233688-express-deals
 *
 * The 2.0% buyer rate quoted elsewhere is a size tier, not a retail rate:
 * "Transactions up to $10 million incur a 2.5% fee; deals between $10 million
 *  and $20 million are subject to a 2% fee."
 *  https://help.equityzen.com/en/articles/8233717-direct-share-acquisitions-dsa
 * At every size this engine models, the rate is 2.5%.
 */
export const EQUITYZEN: TradFiVenueFacts = {
  venue: "equityzen",
  buyFeePct: 2.5,
  sellFeePct: 2.5,
  daysToCloseLow: 3,
  daysToCloseHigh: 3,
  sourceUrl:
    "https://www.morganstanley.com/press-releases/mswm-reduces-fees-on-private-shares-marketplace-equityzen",
  sourceNote:
    "Fees: 2.5% buy side and 2.5% sell side post the Feb 2026 Morgan Stanley reduction, down from 5%. " +
    "A $50,000 buy therefore wires $51,250. The 2.0% rate only applies to $10-20m transactions. " +
    "Settlement: 3 days is EquityZen's own figure for Express Deals, which resell an existing fund " +
    "interest and 'do not require third-party approvals to close'; buyers get 3 days to wire. " +
    "EquityZen publishes no close-time figure for Standard Deals, which do need issuer approval and take " +
    "materially longer, so 3 days is carried as the floor for the fastest product rather than invented for " +
    "the slow one. Holding the tradfi settlement number at its most flattering is deliberate: the on-chain " +
    "speed claim has to beat the best case, not a straw man.",
  minimumUsd: 5_000,
  minimumSourceUrl:
    "https://www.morganstanley.com/press-releases/mswm-reduces-fees-on-private-shares-marketplace-equityzen",
  feeBandNote: "2.5% per side flat below $10m. Express Deals seller fee confirmed at 2.5% on help.equityzen.com.",
};

/**
 * Hiive Markets Limited, from its own Form CRS dated June 1 2026,
 * served from hiive.com/form-crs which redirects to
 * https://files.brokercheck.finra.org/crs_316580.pdf
 *
 * "The highest commission rate for sellers is 5.75%, which decreases for
 *  transactions over $500,000. [...] The highest commission rate for buyers is
 *  4.85%, which decreases for transactions over $250,000."
 * "Our standard minimum transaction is $25,000."
 */
export const HIIVE: TradFiVenueFacts = {
  venue: "hiive",
  buyFeePct: 4.85,
  sellFeePct: 5.75,
  daysToCloseLow: 30,
  daysToCloseHigh: 60,
  sourceUrl: "https://files.brokercheck.finra.org/crs_316580.pdf",
  sourceNote:
    "Fees quoted verbatim from Hiive's Form CRS dated 2026-06-01: highest seller commission 5.75%, " +
    "decreasing above $500,000; highest buyer commission 4.85%, decreasing above $250,000. Unlike Forge " +
    "and EquityZen these are maxima rather than a low end, so Hiive is the one venue this file quotes at " +
    "its worst; the tiered schedule itself is Platform-only and not public, so the discount above $250k " +
    "cannot be modelled. Hiive publishes no close-time figure; the 30-60 day range carried here is the " +
    "industry ROFR-plus-settlement window and is the weakest-sourced field in this file. It is used only " +
    "for the settlement sentence, never for the cost verdict.",
  minimumUsd: 25_000,
  minimumSourceUrl: "https://files.brokercheck.finra.org/crs_316580.pdf",
  feeBandNote: "Published maxima. Seller tier breaks above $500k, buyer tier above $250k, schedule not public.",
};

export const TRADFI_VENUES: readonly TradFiVenueFacts[] = [FORGE, EQUITYZEN, HIIVE];

/** Round-trip cost of a venue in basis points: enter, then exit. */
export function tradFiRoundTripBps(q: TradFiQuote): number {
  return (q.buyFeePct + q.sellFeePct) * 100;
}

export interface TradFiSelection {
  /** Cheapest venue that will actually accept a ticket of this size. */
  best: TradFiVenueFacts;
  /** False when the notional is below every venue's published minimum. */
  anyVenueAccepts: boolean;
  /** Venues whose published minimum is at or below this notional. */
  eligible: readonly TradFiVenueFacts[];
  /** Venues priced out of the comparison by their own minimum. */
  excludedForMinimum: readonly TradFiVenueFacts[];
}

/**
 * Pick the venue a buyer of this size would actually use.
 *
 * A venue that will not take a $10,000 ticket is not a cheaper alternative to
 * anything, so it is excluded from the comparison rather than quoted as the
 * benchmark. Forge's 2% is the cheapest schedule in the file and would win
 * every comparison if minimums were ignored, but Forge's own guides put the
 * direct-secondary minimum at $100,000.
 */
export function selectTradFi(notionalUsd: number): TradFiSelection {
  const eligible = TRADFI_VENUES.filter((v) => notionalUsd >= v.minimumUsd);
  const excludedForMinimum = TRADFI_VENUES.filter((v) => notionalUsd < v.minimumUsd);
  const pool = eligible.length > 0 ? eligible : TRADFI_VENUES;
  const best = pool.reduce((a, b) => (tradFiRoundTripBps(b) < tradFiRoundTripBps(a) ? b : a));
  return {
    best,
    anyVenueAccepts: eligible.length > 0,
    eligible,
    excludedForMinimum,
  };
}

export function venueLabel(v: Venue): string {
  switch (v) {
    case "forge":
      return "Forge Global";
    case "equityzen":
      return "EquityZen";
    case "hiive":
      return "Hiive";
    case "onchain":
      return "on-chain";
  }
}
