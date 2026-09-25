const XAI_MINT = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const SPACEX_MINT = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const POOL_ADDRESS = "8rFjXknJvC225QZqKZtohSnwpL3ZeocNiVDs8tpfUiR8";
const GECKO_TRADES_URL = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${POOL_ADDRESS}/trades`;
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const PUBLISHED_CONVERSION_RATIO = 0.7165;
const CACHE_TTL_MS = 10 * 60 * 1000;
const TRADE_LIMIT = 10;
const UNIT_MATCH_TOLERANCE = 0.2;
const MAX_FETCH_ATTEMPTS = 5;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type JsonRecord = Record<string, unknown>;

type CacheEntry = {
  value: ConversionsResponse;
  at: number;
};

type ConversionsCacheGlobal = typeof globalThis & {
  __lastCallConversionsCache?: CacheEntry | null;
};

const globalCache = globalThis as ConversionsCacheGlobal;

export interface ConversionTrade {
  signature: string;
  wallet: string;
  time: string;
  xaiIn: number;
  spacexOut: number;
  realizedRatio: number;
  shortfallPct: number;
}

export interface ConversionsResponse {
  trades: ConversionTrade[];
  medianShortfallPct: number | null;
  source: string;
}

interface RawTrade {
  signature: string;
  wallet: string;
  time: string;
  timeMs: number;
  blockNumber: number;
  xaiIn: number;
  geckoSpacexAmount: number;
}

interface JupiterMetadata {
  xaiDecimals: number;
  spacexDecimals: number;
  xaiMultiplier: number;
  spacexMultiplier: number;
}

interface JupiterQuoteEvidence {
  rawRatio: number;
  displayRatio: number;
  poolMatched: boolean;
}

interface UnitScale {
  multiplier: number;
  sourceMode: "raw" | "display";
  error: number;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  }
  return Math.min(500 * 2 ** attempt, 10_000);
}

async function fetchJson(url: string): Promise<unknown> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return response.json();

    lastStatus = response.status;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_FETCH_ATTEMPTS - 1) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw new Error(`upstream returned HTTP ${lastStatus}`);
}

function activeMultiplier(record: JsonRecord | null, nowMs: number): number {
  const config = asRecord(record?.["scaledUiConfig"]);
  if (config === null) return 1;
  const current = asNumber(config["multiplier"]);
  const next = asNumber(config["newMultiplier"]);
  const effectiveAt = asString(config["newMultiplierEffectiveAt"]);
  if (next !== null && next > 0 && (effectiveAt === null || Date.parse(effectiveAt) <= nowMs)) return next;
  if (current !== null && current > 0) return current;
  return next !== null && next > 0 ? next : 1;
}

async function readJupiterMetadata(): Promise<JupiterMetadata> {
  const url = `${JUPITER_PRICE_URL}?ids=${XAI_MINT},${SPACEX_MINT}`;
  const payload = asRecord(await fetchJson(url));
  const xai = asRecord(payload?.[XAI_MINT]);
  const spacex = asRecord(payload?.[SPACEX_MINT]);
  const xaiDecimals = asPositiveInteger(xai?.["decimals"]);
  const spacexDecimals = asPositiveInteger(spacex?.["decimals"]);
  if (xaiDecimals === null || spacexDecimals === null) {
    throw new Error("Jupiter did not return token decimals");
  }
  return {
    xaiDecimals,
    spacexDecimals,
    xaiMultiplier: activeMultiplier(xai, Date.now()),
    spacexMultiplier: activeMultiplier(spacex, Date.now()),
  };
}

async function readJupiterQuote(metadata: JupiterMetadata): Promise<JupiterQuoteEvidence> {
  const inputAmount = 10 ** metadata.xaiDecimals;
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set("inputMint", XAI_MINT);
  url.searchParams.set("outputMint", SPACEX_MINT);
  url.searchParams.set("amount", String(inputAmount));
  url.searchParams.set("slippageBps", "300");
  const payload = asRecord(await fetchJson(url.toString()));
  const quotedInput = asNumber(payload?.["inAmount"]);
  const quotedOutput = asNumber(payload?.["outAmount"]);
  if (quotedInput === null || quotedOutput === null || quotedInput <= 0 || quotedOutput <= 0) {
    throw new Error("Jupiter did not return a usable quote");
  }

  const routePlan = payload?.["routePlan"];
  let poolMatched = false;
  if (Array.isArray(routePlan) && routePlan.length > 0) {
    for (const route of routePlan) {
      const routeRecord = asRecord(route);
      const swapInfo = asRecord(routeRecord?.["swapInfo"]);
      if (swapInfo?.["ammKey"] === POOL_ADDRESS) {
        poolMatched = true;
        break;
      }
    }
    if (!poolMatched) throw new Error("Jupiter quote did not use the requested Meteora pool");
  }

  const inputDisplay = (quotedInput / 10 ** metadata.xaiDecimals) * metadata.xaiMultiplier;
  const outputRaw = quotedOutput / 10 ** metadata.spacexDecimals;
  const outputDisplay = outputRaw * metadata.spacexMultiplier;
  return {
    rawRatio: outputRaw / inputDisplay,
    displayRatio: outputDisplay / inputDisplay,
    poolMatched,
  };
}

function parseTrades(payload: unknown): RawTrade[] {
  const root = asRecord(payload);
  const data = root?.["data"];
  if (!Array.isArray(data)) throw new Error("GeckoTerminal returned an unexpected trades payload");

  const seen = new Set<string>();
  const trades: RawTrade[] = [];
  for (const item of data) {
    const record = asRecord(item);
    const attributes = asRecord(record?.["attributes"]);
    if (attributes === null) continue;
    if (attributes["from_token_address"] !== XAI_MINT || attributes["to_token_address"] !== SPACEX_MINT) continue;

    const signature = asString(attributes["tx_hash"]);
    const wallet = asString(attributes["tx_from_address"]);
    const time = asString(attributes["block_timestamp"]);
    const xaiIn = asNumber(attributes["from_token_amount"]);
    const geckoSpacexAmount = asNumber(attributes["to_token_amount"]);
    const blockNumber = asNumber(attributes["block_number"]) ?? 0;
    if (
      signature === null ||
      !SIGNATURE_PATTERN.test(signature) ||
      wallet === null ||
      !WALLET_PATTERN.test(wallet) ||
      time === null ||
      !Number.isFinite(Date.parse(time)) ||
      xaiIn === null ||
      xaiIn <= 0 ||
      geckoSpacexAmount === null ||
      geckoSpacexAmount <= 0 ||
      seen.has(signature)
    ) {
      continue;
    }

    seen.add(signature);
    trades.push({
      signature,
      wallet,
      time,
      timeMs: Date.parse(time),
      blockNumber,
      xaiIn,
      geckoSpacexAmount,
    });
  }

  trades.sort((a, b) => b.timeMs - a.timeMs || b.blockNumber - a.blockNumber);
  return trades.slice(0, TRADE_LIMIT);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function relativeError(observed: number, expected: number): number {
  return Math.abs(observed - expected) / Math.abs(expected);
}

function inferUnitScale(trades: RawTrade[], quote: JupiterQuoteEvidence, multiplier: number): UnitScale {
  const observedRatios = trades.map((trade) => trade.geckoSpacexAmount / trade.xaiIn);
  const observed = median(observedRatios);
  if (observed === null || quote.rawRatio <= 0 || quote.displayRatio <= 0) {
    throw new Error("could not compare trade units with Jupiter");
  }
  const rawError = relativeError(observed, quote.rawRatio);
  const displayError = relativeError(observed, quote.displayRatio);
  if (rawError <= UNIT_MATCH_TOLERANCE && rawError <= displayError) {
    return { multiplier, sourceMode: "raw", error: rawError };
  }
  if (displayError <= UNIT_MATCH_TOLERANCE) {
    return { multiplier: 1, sourceMode: "display", error: displayError };
  }
  throw new Error("GeckoTerminal trade units do not match the Jupiter quote");
}

function buildResponse(
  rawTrades: RawTrade[],
  metadata: JupiterMetadata,
  quote: JupiterQuoteEvidence,
): ConversionsResponse {
  const unitScale = inferUnitScale(rawTrades, quote, metadata.spacexMultiplier);
  const trades = rawTrades.map((trade) => {
    const spacexOut = trade.geckoSpacexAmount * unitScale.multiplier;
    const realizedRatio = spacexOut / trade.xaiIn;
    const shortfallPct = (1 - realizedRatio / PUBLISHED_CONVERSION_RATIO) * 100;
    return {
      signature: trade.signature,
      wallet: trade.wallet,
      time: trade.time,
      xaiIn: trade.xaiIn,
      spacexOut,
      realizedRatio,
      shortfallPct,
    };
  });
  const medianShortfallPct = median(trades.map((trade) => trade.shortfallPct));
  const unitText = unitScale.sourceMode === "raw"
    ? `GeckoTerminal raw output normalized to SPACEX display units with ${unitScale.multiplier}x`
    : "GeckoTerminal output already matched Jupiter SPACEX display units";
  const source = `GeckoTerminal Meteora DLMM pool ${POOL_ADDRESS}; Jupiter quote unit check ${unitText}; published conversion ratio ${PUBLISHED_CONVERSION_RATIO}`;
  return { trades, medianShortfallPct, source };
}

async function loadConversions(): Promise<ConversionsResponse> {
  const [payload, metadata] = await Promise.all([fetchJson(GECKO_TRADES_URL), readJupiterMetadata()]);
  const rawTrades = parseTrades(payload);
  if (rawTrades.length === 0) {
    return {
      trades: [],
      medianShortfallPct: null,
      source: `GeckoTerminal Meteora DLMM pool ${POOL_ADDRESS}; no XAI sells for SPACEX in the latest read`,
    };
  }
  const quote = await readJupiterQuote(metadata);
  return buildResponse(rawTrades, metadata, quote);
}

export async function getConversions(token: string): Promise<ConversionsResponse> {
  if (token !== "XAI") throw new Error("unsupported token, use ?token=XAI");
  const now = Date.now();
  const cached = globalCache.__lastCallConversionsCache ?? null;
  if (cached !== null && now - cached.at < CACHE_TTL_MS) return cached.value;
  const value = await loadConversions();
  globalCache.__lastCallConversionsCache = { value, at: Date.now() };
  return value;
}
