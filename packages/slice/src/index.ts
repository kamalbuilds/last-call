import type { Connection, VersionedTransaction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { JupiterApiError, defaultConnection, getQuote } from "@fineprint/exec";
import { buildSponsoredConversion } from "@lastcall/convert";

/**
 * Slicing only pays off if the pool gets a chance to refill between fills
 * (arbitrage against other venues, new resting liquidity). Fire slices back
 * to back and you just re-walk the same curve for the same total impact as
 * a single trade. This is a floor, not a measured optimum: nothing here
 * observes real refill speed for a given pool, so treat it as "don't go
 * faster than this," not "this is enough."
 */
export const MIN_SLICE_GAP_MS = 60_000;

const MAX_QUOTE_CALLS = 8;

export interface PlanSlicesParams {
  fromMint: string;
  toMint: string;
  amountRaw: bigint | string | number;
  maxImpactBps: number;
  slippageBps?: number;
  /** Only used to read toMint's decimals for estimatedSavingUi. Defaults to a public RPC connection. */
  connection?: Connection;
}

export interface PlanSlicesResult {
  /** Raw size of one slice. 0n when no slice at or under maxImpactBps exists. */
  sliceRaw: bigint;
  /** Number of slices to cover amountRaw. 0 when no valid slice exists. */
  count: number;
  /** Quoted price impact of one slice, in bps. Infinity when no valid slice exists. */
  quotedImpactBps: number;
  /** Quoted price impact of the whole amount in one shot, in bps. */
  singleShotImpactBps: number;
  /**
   * Optimistic, unguaranteed estimate of the output-token saving from slicing
   * over one shot, assuming every slice fills at today's slice-size quote
   * (i.e. the pool fully refills between slices). Real savings depend on
   * MIN_SLICE_GAP_MS being respected and on other flow actually refilling
   * the pool; 0 whenever that comparison is not favorable or no slice exists.
   */
  estimatedSavingUi: number;
  /** Minimum wait between slice executions. See MIN_SLICE_GAP_MS. */
  minGapMs: number;
}

export interface BuildSliceParams {
  connection: Connection;
  owner: string;
  feePayer: string;
  fromMint: string;
  toMint: string;
  sliceRaw: bigint | string | number;
}

function pctStringToBps(pct: string): number {
  return Number.parseFloat(pct) * 100;
}

async function readMintDecimals(
  mint: string,
  connection: Connection | undefined,
): Promise<number> {
  const conn = connection ?? defaultConnection();
  const info = await conn.getParsedAccountInfo(new PublicKey(mint));
  const data = info.value?.data;
  if (data === undefined || data === null || !("parsed" in data)) {
    throw new Error(`could not read decimals for mint ${mint}: account not parsed`);
  }
  const decimals = (data as { parsed: { info: { decimals: unknown } } }).parsed.info
    .decimals;
  if (typeof decimals !== "number") {
    throw new Error(`mint ${mint} parsed account has no numeric decimals field`);
  }
  return decimals;
}

/**
 * Binary-searches the largest slice size whose quoted Jupiter price impact is
 * at or below maxImpactBps, using at most MAX_QUOTE_CALLS real quote calls
 * (including the single-shot baseline). Every number here comes from a live
 * Jupiter quote; nothing is modeled or interpolated.
 */
export async function planSlices(p: PlanSlicesParams): Promise<PlanSlicesResult> {
  const amountRaw = BigInt(p.amountRaw);
  if (amountRaw <= 0n) {
    throw new RangeError(`amountRaw must be positive, received ${String(p.amountRaw)}`);
  }
  const slippageBps = p.slippageBps ?? 300;
  const quoteAt = (amount: bigint) =>
    getQuote({
      inputMint: p.fromMint,
      outputMint: p.toMint,
      amount,
      slippageBps,
    });

  const fullQuote = await quoteAt(amountRaw);
  const singleShotImpactBps = pctStringToBps(fullQuote.priceImpactPct);
  let calls = 1;

  if (singleShotImpactBps <= p.maxImpactBps) {
    return {
      sliceRaw: amountRaw,
      count: 1,
      quotedImpactBps: singleShotImpactBps,
      singleShotImpactBps,
      estimatedSavingUi: 0,
      minGapMs: MIN_SLICE_GAP_MS,
    };
  }

  let loGood = 0n;
  let loGoodOut = 0n;
  let loGoodImpact = Number.POSITIVE_INFINITY;
  let hiBad = amountRaw;

  while (calls < MAX_QUOTE_CALLS && hiBad - loGood > 1n) {
    const mid = loGood + (hiBad - loGood) / 2n;
    calls += 1;
    let impact = Number.POSITIVE_INFINITY;
    let outAmount = 0n;
    try {
      const q = await quoteAt(mid);
      impact = pctStringToBps(q.priceImpactPct);
      outAmount = BigInt(q.outAmount);
    } catch (err) {
      if (!(err instanceof JupiterApiError)) {
        throw err;
      }
      // Too small (or otherwise rejected) counts as "does not qualify".
    }
    if (impact <= p.maxImpactBps) {
      loGood = mid;
      loGoodImpact = impact;
      loGoodOut = outAmount;
    } else {
      hiBad = mid;
    }
  }

  if (loGood === 0n) {
    return {
      sliceRaw: 0n,
      count: 0,
      quotedImpactBps: loGoodImpact,
      singleShotImpactBps,
      estimatedSavingUi: 0,
      minGapMs: MIN_SLICE_GAP_MS,
    };
  }

  const count = Number((amountRaw + loGood - 1n) / loGood);
  const toDecimals = await readMintDecimals(p.toMint, p.connection);
  const naiveTotalOut = loGoodOut * BigInt(count);
  const singleShotOut = BigInt(fullQuote.outAmount);
  const savingRaw = naiveTotalOut > singleShotOut ? naiveTotalOut - singleShotOut : 0n;

  return {
    sliceRaw: loGood,
    count,
    quotedImpactBps: loGoodImpact,
    singleShotImpactBps,
    estimatedSavingUi: Number(savingRaw) / 10 ** toDecimals,
    minGapMs: MIN_SLICE_GAP_MS,
  };
}

/** Builds the next slice's sponsored, unsigned conversion transaction. Thin wrapper over @lastcall/convert. */
export async function buildSlice(p: BuildSliceParams): Promise<VersionedTransaction> {
  return buildSponsoredConversion({
    connection: p.connection,
    owner: p.owner,
    feePayer: p.feePayer,
    fromMint: p.fromMint,
    toMint: p.toMint,
    amountRaw: p.sliceRaw,
  });
}
