/**
 * Live Jupiter quoting. Public lite endpoint, no key, no dependencies.
 *
 * The cost measure here is the REALIZED round trip: buy the notional, then sell
 * the whole position straight back, and count the USD that failed to come home.
 * Jupiter's `priceImpactPct` is not that number and must not be used as one.
 * Measured 2026-09-20: ANDURIL quoted priceImpactPct "0" at $1,000 while its
 * round trip lost 195bps to the orderbook spread, and ANTHROPIC quoted 71.9bps
 * of impact on the buy leg while the full round trip cost 37.5bps. An orderbook
 * venue reports zero impact by construction; the spread is still real money.
 */

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
export const DEFAULT_SLIPPAGE_BPS = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 600;

export class JupiterNoRouteError extends Error {
  constructor(
    message: string,
    public readonly body: string,
  ) {
    super(message);
    this.name = "JupiterNoRouteError";
  }
}

export interface JupiterLeg {
  inAmount: bigint;
  outAmount: bigint;
  /** Informational only. Reads 0 on orderbook routes that still charge a spread. */
  priceImpactBps: number;
  route: string;
  contextSlot: number | null;
}

export type RoundTrip =
  | {
      ok: true;
      symbol: string;
      notionalUsd: number;
      buy: JupiterLeg;
      sell: JupiterLeg;
      tokensBought: bigint;
      usdReturned: number;
      /** (notional - usdReturned) / notional in bps. AMM only, gross of the issuer fee. */
      ammRoundTripBps: number;
    }
  | {
      ok: false;
      symbol: string;
      notionalUsd: number;
      leg: "buy" | "sell";
      reason: string;
    };

interface JupiterRoutePlanItem {
  swapInfo: { label: string; ammKey: string };
  percent: number;
}

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: JupiterRoutePlanItem[];
  contextSlot?: number;
  swapUsdValue?: string;
}

interface JupiterErrorResponse {
  error: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(
  url: string,
  pathname: string,
  signal: AbortSignal | undefined,
): Promise<{ status: number; body: string }> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, { signal: merged });
  } catch (e) {
    throw new Error(`Transport error fetching ${pathname}: ${(e as Error).message}`);
  }
  return { status: response.status, body: await response.text() };
}

async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  slippageBps: number,
  signal?: AbortSignal,
): Promise<JupiterQuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: "false",
    asLegacyTransaction: "false",
  });

  const url = `${JUPITER_QUOTE_URL}?${params.toString()}`;
  const pathname = new URL(url).pathname;

  let status = 0;
  let body = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    ({ status, body } = await fetchOnce(url, pathname, signal));
    // The lite endpoint rate limits with a plain-text body, and a 5xx is a
    // Jupiter outage. Neither is evidence that the token has no market, so
    // neither may be reported as "no route". Back off and ask again.
    const retryable = status === 429 || status >= 500;
    if (!retryable || attempt === MAX_RETRIES) break;
    await sleep(RETRY_BASE_MS * 2 ** attempt);
  }

  let data: unknown;
  try {
    data = JSON.parse(body) as unknown;
  } catch {
    // A non-JSON body from a failing status is an infrastructure problem.
    // Throwing a plain Error keeps it out of the no-route path.
    throw new Error(
      `Jupiter HTTP ${status} from ${pathname} with a non-JSON body: ${body.slice(0, 200)}` +
        (status === 429 ? ` (rate limited after ${MAX_RETRIES + 1} attempts)` : ""),
    );
  }

  if (status !== 200) {
    const errorBody = (data as JupiterErrorResponse).error ?? JSON.stringify(data);
    // A 4xx with a JSON error body is Jupiter saying it cannot route this pair.
    throw new JupiterNoRouteError(`Jupiter HTTP ${status}: ${pathname}`, errorBody);
  }

  const quote = data as JupiterQuoteResponse;

  if (!quote.routePlan || quote.routePlan.length === 0) {
    throw new JupiterNoRouteError(`Empty routePlan from ${pathname}`, JSON.stringify(quote));
  }

  if (quote.outAmount === "0") {
    throw new JupiterNoRouteError(`Zero outAmount from ${pathname}`, JSON.stringify(quote));
  }

  return quote;
}

function parseRoute(plan: JupiterRoutePlanItem[]): string {
  return plan.map((p) => p.swapInfo.label).join(" + ");
}

function parsePriceImpactBps(pct: string): number {
  const value = Number(pct);
  if (!Number.isFinite(value)) {
    // Never coerce an unreadable quote to zero. Zero cost is a claim.
    throw new Error(`Unparseable priceImpactPct "${pct}" from ${JUPITER_QUOTE_URL}`);
  }
  return Math.round(value * 10000 * 10) / 10;
}

export async function quoteLeg(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  opts?: { slippageBps?: number; signal?: AbortSignal },
): Promise<JupiterLeg> {
  const slippageBps = opts?.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const quote = await fetchJupiterQuote(inputMint, outputMint, amount, slippageBps, opts?.signal);

  return {
    inAmount: BigInt(quote.inAmount),
    outAmount: BigInt(quote.outAmount),
    priceImpactBps: parsePriceImpactBps(quote.priceImpactPct),
    route: parseRoute(quote.routePlan),
    contextSlot: quote.contextSlot ?? null,
  };
}

export async function quoteRoundTrip(args: {
  symbol: string;
  mint: string;
  notionalUsd: number;
  slippageBps?: number;
  signal?: AbortSignal;
}): Promise<RoundTrip> {
  const { symbol, mint, notionalUsd, slippageBps = DEFAULT_SLIPPAGE_BPS, signal } = args;
  const legOpts = signal ? { slippageBps, signal } : { slippageBps };

  const buyAmount = BigInt(Math.round(notionalUsd * 10 ** USDC_DECIMALS));

  let buy: JupiterLeg;
  try {
    buy = await quoteLeg(USDC_MINT, mint, buyAmount, legOpts);
  } catch (e) {
    if (e instanceof JupiterNoRouteError) {
      return { ok: false, symbol, notionalUsd, leg: "buy", reason: e.body };
    }
    throw e;
  }

  let sell: JupiterLeg;
  try {
    sell = await quoteLeg(mint, USDC_MINT, buy.outAmount, legOpts);
  } catch (e) {
    if (e instanceof JupiterNoRouteError) {
      return { ok: false, symbol, notionalUsd, leg: "sell", reason: e.body };
    }
    throw e;
  }

  const tokensBought = buy.outAmount;
  const usdReturned = Number(sell.outAmount) / 10 ** USDC_DECIMALS;
  const ammRoundTripBps = ((notionalUsd - usdReturned) / notionalUsd) * 10000;

  return {
    ok: true,
    symbol,
    notionalUsd,
    buy,
    sell,
    tokensBought,
    usdReturned,
    ammRoundTripBps,
  };
}
