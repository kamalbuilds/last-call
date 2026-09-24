const SPACEX_MINT = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const SPCXX_MINT = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const IPO_DATE = "2026-06-12";
const SPACEX_UI_MULTIPLIER = 5;
const MAX_SCALE_ERROR = 0.35;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_FETCH_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 500;
const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/solana";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

type JsonRecord = Record<string, unknown>;

export interface GapPoint {
  date: string;
  gapPct: number;
}

export interface GapHistoryResponse {
  points: GapPoint[];
  currentGapPct: number;
  source: string;
}

interface PoolCandidate {
  address: string;
  createdAt: string;
  hasCounterpart: boolean;
  isBase: boolean;
  reserve: number;
}

interface JupiterSnapshot {
  currentGapPct: number;
  spaceXPrice: number;
  spaceXMultiplier: number;
}

type CacheEntry = { value: GapHistoryResponse; at: number };
type GapCacheGlobal = typeof globalThis & {
  __lastCallGapHistoryCache?: CacheEntry | null;
};

const globalCache = globalThis as GapCacheGlobal;

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

export function verifySpaceXPriceScale(
  geckoPrice: number,
  jupiterPrice: number,
  configuredMultiplier: number,
): number {
  if (!Number.isFinite(geckoPrice) || geckoPrice <= 0 || !Number.isFinite(jupiterPrice) || jupiterPrice <= 0) {
    throw new Error("Jupiter and GeckoTerminal prices must be positive numbers");
  }

  const multiplier = Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
    ? configuredMultiplier
    : SPACEX_UI_MULTIPLIER;
  const candidates = [...new Set([1, multiplier])]
    .map((scale) => ({
      scale,
      error: Math.abs(geckoPrice / scale - jupiterPrice) / jupiterPrice,
    }))
    .sort((a, b) => a.error - b.error);
  const match = candidates[0];
  if (match === undefined || match.error > MAX_SCALE_ERROR) {
    throw new Error(`SPACEX GeckoTerminal price does not match Jupiter at 1x or ${multiplier}x`);
  }
  return match.scale;
}

function roundPct(value: number): number {
  return Number(value.toFixed(6));
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, 10_000);
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
  throw new Error(`price source returned HTTP ${lastStatus}`);
}

function tokenAddress(value: unknown): string {
  const id = asString(value);
  if (id === null) return "";
  const separator = id.indexOf("_");
  return separator === -1 ? id : id.slice(separator + 1);
}

function relationshipAddress(pool: JsonRecord, side: "base_token" | "quote_token"): string {
  const relationships = asRecord(pool["relationships"]);
  const relationship = asRecord(relationships?.[side]);
  const data = asRecord(relationship?.["data"]);
  return tokenAddress(data?.["id"]);
}

function poolAddress(pool: JsonRecord): string {
  const attributes = asRecord(pool["attributes"]);
  const address = asString(attributes?.["address"]);
  if (address !== null) return address;
  const id = asString(pool["id"]);
  if (id === null) return "";
  return id.replace(/^solana_/, "");
}

function poolCandidate(pool: JsonRecord, mint: string, counterpart: string): PoolCandidate | null {
  const base = relationshipAddress(pool, "base_token");
  const quote = relationshipAddress(pool, "quote_token");
  if (base !== mint && quote !== mint) return null;
  const attributes = asRecord(pool["attributes"]);
  const address = poolAddress(pool);
  if (address === "") return null;
  return {
    address,
    createdAt: asString(attributes?.["pool_created_at"]) ?? "",
    hasCounterpart: base === counterpart || quote === counterpart,
    isBase: base === mint,
    reserve: asNumber(attributes?.["reserve_in_usd"]) ?? 0,
  };
}

function comparePools(a: PoolCandidate, b: PoolCandidate): number {
  if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
  if (a.hasCounterpart !== b.hasCounterpart) return a.hasCounterpart ? -1 : 1;
  if (a.reserve !== b.reserve) return b.reserve - a.reserve;
  return a.createdAt.localeCompare(b.createdAt);
}

async function findMainPool(mint: string, counterpart: string): Promise<PoolCandidate> {
  const payload = asRecord(await fetchJson(`${GECKO_BASE}/tokens/${mint}/pools`));
  const data = payload?.["data"];
  if (!Array.isArray(data)) throw new Error(`no pool list returned for ${mint}`);

  const candidates = data
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => item !== null)
    .map((item) => poolCandidate(item, mint, counterpart))
    .filter((item): item is PoolCandidate => item !== null)
    .sort(comparePools);

  const main = candidates[0];
  if (main === undefined) throw new Error(`no usable pool found for ${mint}`);
  return main;
}

function ohlcvCloseSeries(payload: unknown, mint: string, multiplier: number): Map<string, number> {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]);
  const attributes = asRecord(data?.["attributes"]);
  const list = attributes?.["ohlcv_list"];
  if (!Array.isArray(list)) throw new Error(`no daily OHLCV returned for ${mint}`);

  const series = new Map<string, number>();
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const timestamp = asNumber(row[0]);
    const close = asNumber(row[4]);
    if (timestamp === null || close === null || close <= 0) continue;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (date < IPO_DATE) continue;
    series.set(date, close / multiplier);
  }
  return series;
}

function latestSeriesPrice(series: Map<string, number>): number | null {
  let latestDate = "";
  let latestPrice: number | null = null;
  for (const [date, price] of series) {
    if (date > latestDate) {
      latestDate = date;
      latestPrice = price;
    }
  }
  return latestPrice;
}

function scaleSeries(series: Map<string, number>, multiplier: number): Map<string, number> {
  if (multiplier === 1) return series;
  return new Map([...series].map(([date, price]) => [date, price / multiplier]));
}

async function fetchJupiterSnapshot(): Promise<JupiterSnapshot> {
  const payload = asRecord(
    await fetchJson(`${JUPITER_PRICE_URL}?ids=${SPACEX_MINT},${SPCXX_MINT}`),
  );
  const spaceX = asRecord(payload?.[SPACEX_MINT]);
  const spcxx = asRecord(payload?.[SPCXX_MINT]);
  const spaceXPrice = asNumber(spaceX?.["usdPrice"]);
  const spcxxPrice = asNumber(spcxx?.["usdPrice"]);
  if (spaceXPrice === null || spcxxPrice === null || spaceXPrice <= 0 || spcxxPrice <= 0) {
    throw new Error("Jupiter did not return both live prices");
  }

  const scaledConfig = asRecord(spaceX?.["scaledUiConfig"]);
  const configuredMultiplier = asNumber(scaledConfig?.["newMultiplier"]) ?? asNumber(scaledConfig?.["multiplier"]);
  const spaceXMultiplier = configuredMultiplier !== null && configuredMultiplier > 0
    ? configuredMultiplier
    : SPACEX_UI_MULTIPLIER;

  return {
    currentGapPct: roundPct((1 - spaceXPrice / spcxxPrice) * 100),
    spaceXPrice,
    spaceXMultiplier,
  };
}

export async function getGapHistory(): Promise<GapHistoryResponse> {
  const now = Date.now();
  const cached = globalCache.__lastCallGapHistoryCache ?? null;
  if (cached !== null && now - cached.at < CACHE_TTL_MS) return cached.value;

  const [spaceXPools, spcxxPools, jupiter] = await Promise.all([
    findMainPool(SPACEX_MINT, SPCXX_MINT),
    findMainPool(SPCXX_MINT, SPACEX_MINT),
    fetchJupiterSnapshot(),
  ]);
  const [spaceXRawSeries, spcxxSeries] = await Promise.all([
    fetchJson(`${GECKO_BASE}/pools/${encodeURIComponent(spaceXPools.address)}/ohlcv/day?limit=200`).then(
      (payload) => ohlcvCloseSeries(payload, SPACEX_MINT, 1),
    ),
    fetchJson(`${GECKO_BASE}/pools/${encodeURIComponent(spcxxPools.address)}/ohlcv/day?limit=200`).then(
      (payload) => ohlcvCloseSeries(payload, SPCXX_MINT, 1),
    ),
  ]);
  const latestSpaceXPrice = latestSeriesPrice(spaceXRawSeries);
  const spaceXMultiplier = latestSpaceXPrice === null
    ? jupiter.spaceXMultiplier
    : verifySpaceXPriceScale(latestSpaceXPrice, jupiter.spaceXPrice, jupiter.spaceXMultiplier);
  const spaceXSeries = scaleSeries(spaceXRawSeries, spaceXMultiplier);
  const scaleSource = latestSpaceXPrice === null
    ? `${spaceXMultiplier}x configured; no daily close was available to verify`
    : `${spaceXMultiplier}x verified against Jupiter Price v3`;

  const points = [...spaceXSeries.keys()]
    .filter((date) => spcxxSeries.has(date))
    .sort()
    .map((date) => ({
      date,
      gapPct: roundPct((1 - (spaceXSeries.get(date) as number) / (spcxxSeries.get(date) as number)) * 100),
    }));

  const response: GapHistoryResponse = {
    points,
    currentGapPct: jupiter.currentGapPct,
    source: `GeckoTerminal daily OHLCV; current gap from Jupiter Price v3; SPACEX history ${scaleSource}`,
  };
  globalCache.__lastCallGapHistoryCache = { value: response, at: now };
  return response;
}
