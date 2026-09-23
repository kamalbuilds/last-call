import lifecycleData from "./lifecycle.json" with { type: "json" };

const PRESTOCKS_API_URL = "https://prestocks.com/api/prestocks";
const JUP_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const JUP_HOLDERS_URL = "https://datapi.jup.ag/v1/holders";
const JUP_SEARCH_URL = "https://lite-api.jup.ag/tokens/v2/search";
const DEFAULT_RPC_URL = "https://solana-rpc.publicnode.com";
const FALLBACK_RPC_URLS = ["https://api.mainnet-beta.solana.com"];

const RETRIES = 6;
const BASE_BACKOFF_MS = 1000;
const BETWEEN_TOKENS_MS = 400;

export interface LifecycleEntry {
  symbol: string;
  mint: string;
  deadline: string | null;
  conversion: Record<string, unknown> | null;
  source: string;
  note: string;
}

export interface LedgerHolder {
  address: string;
  amount: number;
  usd: number | null;
  solBalance: number;
  lastActive: string | null;
}

export interface LedgerToken {
  symbol: string;
  mint: string;
  status: string;
  deadline: string | null;
  conversion: Record<string, unknown> | null;
  priceUsd: number | null;
  supply: number;
  poolHeld: number;
  unconvertedInWallets: number;
  unconvertedUsd: number | null;
  holderCount: number;
  holders: LedgerHolder[];
}

export interface LedgerFile {
  generatedAt: string;
  tokens: LedgerToken[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function retryDelayMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get("retry-after") ?? null;
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, 30_000);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { accept: "application/json", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      lastError = new Error(`request failed for ${url}: ${String(cause)}`);
      await sleep(retryDelayMs(null, attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`GET ${url} returned HTTP ${res.status}`);
      if (attempt < RETRIES) {
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) {
      throw new Error(`GET ${url} returned HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  }
  throw lastError ?? new Error(`exhausted retries for ${url}`);
}

function rpcEndpoints(): string[] {
  const primary = process.env["SOLANA_RPC_URL"] ?? DEFAULT_RPC_URL;
  return [...new Set([primary, ...FALLBACK_RPC_URLS])];
}

async function getTokenSupply(mint: string): Promise<number> {
  let lastError: Error | null = null;
  for (const endpoint of rpcEndpoints()) {
    for (let attempt = 0; attempt <= 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (cause) {
        lastError = new Error(`RPC ${endpoint} request failed: ${String(cause)}`);
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`RPC ${endpoint} returned HTTP ${res.status}`);
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`RPC ${endpoint} returned HTTP ${res.status}`);
        break;
      }
      const payload = (await res.json()) as {
        result?: { value?: { uiAmount?: unknown } };
        error?: { code?: unknown; message?: unknown };
      };
      if (payload.error !== undefined && payload.error !== null) {
        lastError = new Error(`RPC ${endpoint} error: ${JSON.stringify(payload.error)}`);
        break;
      }
      const uiAmount = payload.result?.value?.uiAmount;
      if (typeof uiAmount !== "number" || !Number.isFinite(uiAmount)) {
        throw new Error(`RPC ${endpoint} returned a non-numeric supply for ${mint}`);
      }
      return uiAmount;
    }
  }
  throw lastError ?? new Error(`could not read supply for ${mint}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function isPoolRow(row: Record<string, unknown>): boolean {
  const tags = row["tags"];
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => asRecord(tag)?.["id"] === "Pool");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const LIFECYCLE = lifecycleData as Record<string, LifecycleEntry>;

function loadLifecycle(): Record<string, LifecycleEntry> {
  return LIFECYCLE;
}

export async function buildLedger(): Promise<LedgerFile> {
  const lifecycle = loadLifecycle();

  const apiPayload = await fetchJson(PRESTOCKS_API_URL);
  if (!Array.isArray(apiPayload) || apiPayload.length === 0) {
    throw new Error("PreStocks API returned an unexpected payload");
  }
  const liveTokens: { symbol: string; mint: string }[] = apiPayload.map((row) => {
    const record = asRecord(row);
    const symbol = record?.["symbol"];
    const mint = record?.["contract_address"];
    if (typeof symbol !== "string" || symbol === "" || typeof mint !== "string" || mint === "") {
      throw new Error("PreStocks API returned a row without symbol/contract_address");
    }
    return { symbol, mint };
  });

  const byMint = new Map(liveTokens.map((t) => [t.mint, t]));
  for (const entry of Object.values(lifecycle)) {
    if (!byMint.has(entry.mint)) {
      byMint.set(entry.mint, { symbol: entry.symbol, mint: entry.mint });
    }
  }
  const tokens = [...byMint.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

  const pricePayload = asRecord(
    await fetchJson(`${JUP_PRICE_URL}?ids=${tokens.map((t) => t.mint).join(",")}`),
  );
  if (pricePayload === null) {
    throw new Error("Jupiter price API returned an unexpected payload");
  }
  const prices = new Map<string, number | null>();
  for (const token of tokens) {
    const row = asRecord(pricePayload[token.mint]);
    prices.set(token.mint, row === null ? null : toFiniteNumber(row["usdPrice"]));
  }

  const generatedAt = new Date().toISOString();
  const nowMs = Date.parse(generatedAt);

  const out: LedgerToken[] = [];
  for (const [index, token] of tokens.entries()) {
    if (index > 0) {
      await sleep(BETWEEN_TOKENS_MS);
    }
    const lifecycleEntry = Object.values(lifecycle).find((entry) => entry.mint === token.mint) ?? null;
    const deadline = lifecycleEntry?.deadline ?? null;
    const status =
      deadline === null ? "private" : Date.parse(deadline) <= nowMs ? "expired" : "converting";

    const priceUsd = prices.get(token.mint) ?? null;
    const supply = await getTokenSupply(token.mint);

    const holdersPayload = asRecord(await fetchJson(`${JUP_HOLDERS_URL}/${token.mint}`));
    const holderRows = holdersPayload?.["holders"];
    if (!Array.isArray(holderRows)) {
      throw new Error(`Jupiter holders API returned an unexpected payload for ${token.mint}`);
    }

    let poolHeld = 0;
    const holders: LedgerHolder[] = [];
    for (const row of holderRows) {
      const record = asRecord(row);
      if (record === null) continue;
      const address = record["address"];
      const amount = toFiniteNumber(record["amount"]);
      if (typeof address !== "string" || amount === null) continue;
      if (isPoolRow(record)) {
        poolHeld += amount;
        continue;
      }
      const solBalance =
        toFiniteNumber(record["solBalanceDisplay"]) ??
        (toFiniteNumber(record["solBalance"]) !== null
          ? (toFiniteNumber(record["solBalance"]) as number) / 1_000_000_000
          : 0);
      const lastActive = record["lastActiveTime"];
      holders.push({
        address,
        amount,
        usd: priceUsd === null ? null : amount * priceUsd,
        solBalance,
        lastActive: typeof lastActive === "string" ? lastActive : null,
      });
    }

    let holderCount: number | null = null;
    const searchPayload = await fetchJson(`${JUP_SEARCH_URL}?query=${token.mint}`);
    if (Array.isArray(searchPayload)) {
      const exact = searchPayload.map(asRecord).find((row) => row?.["id"] === token.mint);
      holderCount = exact === undefined || exact === null ? null : toFiniteNumber(exact["holderCount"]);
    }
    if (holderCount === null) {
      const count = holdersPayload?.["count"];
      holderCount = toFiniteNumber(count);
    }
    if (holderCount === null) {
      throw new Error(`could not determine holderCount for ${token.mint}`);
    }

    const unconvertedInWallets = supply - poolHeld;
    out.push({
      symbol: token.symbol,
      mint: token.mint,
      status,
      deadline,
      conversion: lifecycleEntry?.conversion ?? null,
      priceUsd,
      supply,
      poolHeld,
      unconvertedInWallets,
      unconvertedUsd: priceUsd === null ? null : unconvertedInWallets * priceUsd,
      holderCount,
      holders,
    });
  }

  return { generatedAt, tokens: out };
}
