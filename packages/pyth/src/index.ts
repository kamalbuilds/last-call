import { USDC_MINT, getQuote } from "@fineprint/exec";

export const HERMES_LATEST_PRICE_URL =
  "https://hermes.pyth.network/v2/updates/price/latest";

/** Crypto.SPCXX/USD */
export const SPCXX_CRYPTO_FEED_ID =
  "e8e2234a06b288fedde43ae9450cb288886ecb3259ad2f41d0067f02244a0101";
/** Equity.US.SPCX/USD */
export const SPCX_EQUITY_FEED_ID =
  "8a593d6edde7a3095213c88116d8840d01e93c2ddeb800bc891772eb8b93bb94";

export const SPACEX_PRESTOCKS_MINT =
  "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
export const SPCXX_MINT = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
export const SPCXX_DECIMALS = 8;

const REQUEST_TIMEOUT_MS = 15_000;

/** Thrown instead of ever fabricating a price. The user places PYTH_API_KEY in .env themselves. */
export class MissingPythKeyError extends Error {
  constructor() {
    super(
      "PYTH_API_KEY is not set. Place it in .env; convertVsSell() will not run without a real Hermes key.",
    );
    this.name = "MissingPythKeyError";
  }
}

export interface PythPrice {
  id: string;
  price: number;
  confidence: number;
  publishTimeUnix: number;
}

interface HermesParsedEntry {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
}

function isHermesParsedEntry(value: unknown): value is HermesParsedEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v["id"] !== "string" || typeof v["price"] !== "object" || v["price"] === null) {
    return false;
  }
  const price = v["price"] as Record<string, unknown>;
  return (
    typeof price["price"] === "string" &&
    typeof price["conf"] === "string" &&
    typeof price["expo"] === "number" &&
    typeof price["publish_time"] === "number"
  );
}

function toPythPrice(entry: HermesParsedEntry): PythPrice {
  const scale = 10 ** entry.price.expo;
  return {
    id: entry.id,
    price: Number(entry.price.price) * scale,
    confidence: Number(entry.price.conf) * scale,
    publishTimeUnix: entry.price.publish_time,
  };
}

/**
 * Reads live prices from Hermes for the given feed ids. Throws MissingPythKeyError
 * if PYTH_API_KEY is absent, and never returns a fabricated or cached price.
 */
export async function fetchHermesPrices(
  ids: readonly string[],
): Promise<Map<string, PythPrice>> {
  const key = process.env["PYTH_API_KEY"];
  if (key === undefined || key === "") {
    throw new MissingPythKeyError();
  }
  const params = new URLSearchParams();
  for (const id of ids) {
    params.append("ids[]", id);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  let bodyText: string;
  let status: number;
  try {
    const res = await fetch(`${HERMES_LATEST_PRICE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    status = res.status;
    bodyText = await res.text();
  } finally {
    clearTimeout(timer);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Hermes error (status ${String(status)}): ${bodyText.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error(`Hermes returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
  const entries =
    typeof parsed === "object" && parsed !== null && "parsed" in parsed
      ? (parsed as { parsed: unknown }).parsed
      : undefined;
  if (!Array.isArray(entries)) {
    throw new Error(`Hermes response missing "parsed" array: ${bodyText.slice(0, 200)}`);
  }
  const out = new Map<string, PythPrice>();
  for (const entry of entries) {
    if (!isHermesParsedEntry(entry)) {
      throw new Error(`Hermes "parsed" entry malformed: ${JSON.stringify(entry).slice(0, 200)}`);
    }
    out.set(entry.id, toPythPrice(entry));
  }
  return out;
}

export interface ConvertVsSellParams {
  /** Raw SPACEX PreStocks amount held (smallest units, 9 decimals). */
  amountRaw: bigint | string | number;
  fromMint?: string;
  spcxxMint?: string;
  slippageBps?: number;
}

export interface ConvertVsSellResult {
  /** UI USDC received if sold now via Jupiter. */
  sellNowUsdc: number;
  /** UI SPCXx received if converted now via Jupiter. */
  convertNowSpcxxUi: number;
  /** convertNowSpcxxUi priced at the live Pyth Crypto.SPCXX/USD feed: what that SPCXx is worth by the oracle, independent of Jupiter's own quote. */
  convertNowReferenceUsdc: number;
  pyth: {
    spcxxUsd: PythPrice;
    equitySpcxUsd: PythPrice;
  };
}

/**
 * For a SPACEX PreStocks holder: compares selling now to USDC against
 * converting now to SPCXx, and prices the converted SPCXx against Pyth's
 * live Crypto.SPCXX/USD feed rather than trusting Jupiter's own quote as
 * the only mark. Every number is a live read (Jupiter quotes, Hermes
 * prices); nothing is cached, modeled, or estimated. Requires PYTH_API_KEY.
 */
export async function convertVsSell(
  p: ConvertVsSellParams,
): Promise<ConvertVsSellResult> {
  const amountRaw = BigInt(p.amountRaw);
  if (amountRaw <= 0n) {
    throw new RangeError(`amountRaw must be positive, received ${String(p.amountRaw)}`);
  }
  const fromMint = p.fromMint ?? SPACEX_PRESTOCKS_MINT;
  const spcxxMint = p.spcxxMint ?? SPCXX_MINT;
  const slippageBps = p.slippageBps ?? 300;

  const [sellQuote, convertQuote, pythPrices] = await Promise.all([
    getQuote({ inputMint: fromMint, outputMint: USDC_MINT, amount: amountRaw, slippageBps }),
    getQuote({ inputMint: fromMint, outputMint: spcxxMint, amount: amountRaw, slippageBps }),
    fetchHermesPrices([SPCXX_CRYPTO_FEED_ID, SPCX_EQUITY_FEED_ID]),
  ]);

  const spcxxUsd = pythPrices.get(SPCXX_CRYPTO_FEED_ID);
  const equitySpcxUsd = pythPrices.get(SPCX_EQUITY_FEED_ID);
  if (spcxxUsd === undefined || equitySpcxUsd === undefined) {
    throw new Error("Hermes response is missing one of the requested SPCX price feeds");
  }

  const sellNowUsdc = Number(sellQuote.outAmount) / 1_000_000;
  const convertNowSpcxxUi = Number(convertQuote.outAmount) / 10 ** SPCXX_DECIMALS;
  const convertNowReferenceUsdc = convertNowSpcxxUi * spcxxUsd.price;

  return {
    sellNowUsdc,
    convertNowSpcxxUi,
    convertNowReferenceUsdc,
    pyth: { spcxxUsd, equitySpcxUsd },
  };
}
