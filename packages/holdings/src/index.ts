import { LIFECYCLE } from "@lastcall/ledger";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID as SPL_TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { decodeMint, operativeMultiplier, readEpochPosition } from "@fineprint/core";

// Lifecycle terms come from @lastcall/ledger; Token-2022 decoding from packages/core.
interface LifecycleConversion {
  intoMint: string;
  intoSymbol?: string;
}

interface LifecycleEntry {
  symbol: string;
  mint: string;
  deadline: string | null;
  conversion: LifecycleConversion | null;
}

function loadLifecycle(): Map<string, LifecycleEntry> {
  const raw = LIFECYCLE as unknown as Record<string, LifecycleEntry>;
  const byMint = new Map<string, LifecycleEntry>();
  for (const entry of Object.values(raw)) {
    byMint.set(entry.mint, entry);
  }
  return byMint;
}

export interface HoldingQuote {
  outAmountRaw: string;
  outAmountUi: number;
  priceImpactPct: number;
  transferFeeBps: number;
}

export interface HoldingRow {
  symbol: string;
  mint: string;
  amount: number;
  status: "private" | "converting" | "expired";
  deadline: string | null;
  convertsInto: string | null;
  usd: number | null;
  quote: HoldingQuote | null;
}

const TOKEN_2022_PROGRAM_ID = SPL_TOKEN_2022_PROGRAM_ID.toBase58();
const PRESTOCKS_API_URL = "https://prestocks.com/api/prestocks";
const XAI_MINT = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const XAI_SYMBOL = "XAI";
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
}

function rpcEndpoints(): string[] {
  return [...new Set([rpcUrl(), DEFAULT_RPC_URL])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get("retry-after") ?? null;
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

function isRetryableRpcError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // 403 (e.g. a provider refusing indexed methods) is endpoint-fatal, not
  // retryable: the caller falls through to the next RPC endpoint instead.
  if (/403|forbidden|indexed requests require/i.test(msg)) return false;
  return /429|rate.?limit|502|503|500|timeout|timed out|econnreset|enotfound|eai_again/i.test(msg);
}

function isEndpointFatal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /403|forbidden|indexed requests require/i.test(msg);
}

async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableRpcError(err) || attempt === retries) throw err;
      await sleep(Math.min(800 * 2 ** attempt, 30_000));
    }
  }
  throw lastError;
}

async function fetchJsonWithRetry(url: string, retries = 6): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch (cause) {
      lastError = new Error(`GET ${url} failed: ${String(cause)}`);
      await sleep(retryAfterMs(null, attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`GET ${url} returned HTTP ${res.status}`);
      if (attempt < retries) {
        await sleep(retryAfterMs(res, attempt));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) {
      throw new Error(`GET ${url} returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as unknown;
  }
  throw lastError ?? new Error(`exhausted retries for ${url}`);
}

async function fetchPreStocksUniverse(): Promise<Map<string, string>> {
  const byMint = new Map<string, string>();
  try {
    const payload = (await fetchJsonWithRetry(PRESTOCKS_API_URL)) as unknown;
    if (Array.isArray(payload)) {
      for (const row of payload) {
        const record = row as Record<string, unknown>;
        const symbol = record["symbol"];
        const mint = record["contract_address"];
        if (typeof symbol === "string" && symbol !== "" && typeof mint === "string" && mint !== "") {
          byMint.set(mint, symbol);
        }
      }
    }
  } catch {
    // Fall through to the lifecycle fallback below; the API rate-limits hard.
  }
  if (byMint.size === 0) {
    for (const entry of loadLifecycle().values()) {
      byMint.set(entry.mint, entry.symbol);
    }
  }
  if (!byMint.has(XAI_MINT)) {
    byMint.set(XAI_MINT, XAI_SYMBOL);
  }
  return byMint;
}

interface QuoteResponse {
  outAmount: string;
  priceImpactPct: string;
  routePlan?: unknown[];
}

async function fetchJupiterQuote(inputMint: string, outputMint: string, amountRaw: string): Promise<QuoteResponse | null> {
  const params = new URLSearchParams({ inputMint, outputMint, amount: amountRaw, slippageBps: "300" });
  const url = `${JUPITER_QUOTE_URL}?${params.toString()}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch (cause) {
      lastError = new Error(`Jupiter quote failed: ${String(cause)}`);
      await sleep(retryAfterMs(null, attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`Jupiter quote returned HTTP ${res.status}`);
      if (attempt < 5) {
        await sleep(retryAfterMs(res, attempt));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) {
      // 400 NO_ROUTES_FOUND and friends mean this size does not route (e.g. dust).
      return null;
    }
    const data = (await res.json()) as QuoteResponse;
    if (!data.routePlan || data.routePlan.length === 0 || data.outAmount === "0") {
      return null;
    }
    return data;
  }
  throw lastError ?? new Error("exhausted Jupiter quote retries");
}

async function fetchPrices(mints: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (mints.length === 0) return out;
  try {
    const payload = (await fetchJsonWithRetry(`${JUPITER_PRICE_URL}?ids=${mints.join(",")}`)) as Record<string, unknown>;
    for (const mint of mints) {
      const row = payload[mint] as Record<string, unknown> | undefined;
      const price = row?.["usdPrice"];
      out.set(mint, typeof price === "number" && Number.isFinite(price) ? price : null);
    }
  } catch {
    for (const mint of mints) out.set(mint, null);
  }
  return out;
}

async function getOutputUiParams(conn: Connection, mint: string): Promise<{ decimals: number; multiplier: number }> {
  const info = await rpcWithRetry(() => conn.getParsedAccountInfo(new PublicKey(mint), "confirmed"));
  const value = info.value;
  if (value === null) throw new Error(`Mint account not found: ${mint}`);
  const data = value.data as unknown;
  const record = (typeof data === "object" && data !== null ? data : null) as Record<string, unknown> | null;
  const parsed = record?.["parsed"] as Record<string, unknown> | undefined;
  const mintInfo = parsed?.["info"] as Record<string, unknown> | undefined;
  const decimals = mintInfo?.["decimals"];
  if (typeof decimals !== "number" || !Number.isFinite(decimals)) {
    throw new Error(`Mint ${mint} account data is missing decimals`);
  }
  const extensions = mintInfo !== undefined && Array.isArray(mintInfo["extensions"]) ? (mintInfo["extensions"] as Array<Record<string, unknown>>) : [];
  const scaled = extensions.find((e) => e["extension"] === "scaledUiAmountConfig")?.["state"] as
    | Record<string, unknown>
    | undefined;
  if (!scaled || typeof scaled["multiplier"] !== "string" || typeof scaled["newMultiplier"] !== "string" || typeof scaled["newMultiplierEffectiveTimestamp"] !== "number") {
    return { decimals, multiplier: 1 };
  }
  const asOfUnix = Math.floor(Date.now() / 1000);
  return {
    decimals,
    multiplier: operativeMultiplier(
      scaled["multiplier"] as string,
      scaled["newMultiplier"] as string,
      scaled["newMultiplierEffectiveTimestamp"] as number,
      asOfUnix,
    ),
  };
}

export async function getHoldings(owner: string): Promise<HoldingRow[]> {
  const ownerKey = new PublicKey(owner);
  const programId = new PublicKey(TOKEN_2022_PROGRAM_ID);

  const [universe, lifecycle] = await Promise.all([
    fetchPreStocksUniverse(),
    Promise.resolve(loadLifecycle()),
  ]);

  // Resolve a working RPC endpoint (SOLANA_RPC_URL first, then the default).
  // A provider that refuses indexed methods (403) fails the endpoint, not the call.
  let conn: Connection | null = null;
  let tokenAccounts: Awaited<ReturnType<Connection["getParsedTokenAccountsByOwner"]>> | null = null;
  let lastErr: unknown = null;
  for (const endpoint of rpcEndpoints()) {
    const candidate = new Connection(endpoint, "confirmed");
    try {
      const [ownerInfo, accounts] = await Promise.all([
        rpcWithRetry(() => candidate.getAccountInfo(ownerKey, "confirmed")),
        rpcWithRetry(() => candidate.getParsedTokenAccountsByOwner(ownerKey, { programId })),
      ]);
      // Programs cannot sign Token-2022 transfers, so a balance in a program's
      // ATA is permanently locked, not an actionable wallet holding. Observed
      // on-chain: the system program's SPACEX ATA
      // (CkK3vkjKevyYZVgf8Cymj5PiFUGyXGGQXVvB3mx8Q6h2, opened 2026-06-12) holds
      // 4272417 raw units, which would otherwise read as a holding.
      if (ownerInfo?.executable === true) return [];
      conn = candidate;
      tokenAccounts = accounts;
      break;
    } catch (err) {
      lastErr = err;
      if (isEndpointFatal(err)) continue;
      throw err;
    }
  }
  if (conn === null || tokenAccounts === null) {
    throw lastErr instanceof Error ? lastErr : new Error("no working RPC endpoint");
  }

  const balances = new Map<string, { raw: bigint; decimals: number }>();
  for (const entry of tokenAccounts.value) {
    const parsed = (entry.account.data as { parsed?: { info?: Record<string, unknown> } }).parsed;
    const info = parsed?.info;
    if (!info) continue;
    const mint = info["mint"];
    const tokenAmount = info["tokenAmount"] as Record<string, unknown> | undefined;
    const amountStr = tokenAmount?.["amount"];
    const decimals = tokenAmount?.["decimals"];
    if (typeof mint !== "string" || typeof amountStr !== "string" || typeof decimals !== "number") continue;
    if (!universe.has(mint)) continue;
    let raw: bigint;
    try {
      raw = BigInt(amountStr);
    } catch {
      continue;
    }
    if (raw === 0n) continue;
    const prev = balances.get(mint);
    balances.set(mint, { raw: (prev?.raw ?? 0n) + raw, decimals });
  }

  if (balances.size === 0) return [];

  const heldMints = [...balances.keys()];
  const prices = await fetchPrices(heldMints);
  const epoch = await rpcWithRetry(() => readEpochPosition(conn));
  const nowMs = Date.now();

  const rows: HoldingRow[] = [];
  for (const mint of heldMints) {
    const held = balances.get(mint);
    if (!held) continue;
    const symbol = universe.get(mint) ?? lifecycle.get(mint)?.symbol ?? "UNKNOWN";
    const rawStr = held.raw.toString();

    // Scaled UI amount + transfer fee come from the core Token-2022 decode
    // (packages/core/src/decode.ts): raw / 10^decimals * operativeMultiplier,
    // and transferFeeBps is the in-force transferFeeConfig tier, not a literal.
    const facts = await rpcWithRetry(() => decodeMint(mint, symbol, conn, undefined, epoch));
    const multiplier = facts.scaledUiAmount?.operativeMultiplier ?? 1;
    const amount = (Number(held.raw.toString()) / 10 ** facts.decimals) * multiplier;
    const transferFeeBps = facts.transferFee.currentBps;

    const entry = lifecycle.get(mint) ?? null;
    const deadline = entry?.deadline ?? null;
    const status: HoldingRow["status"] =
      deadline === null ? "private" : Date.parse(deadline) <= nowMs ? "expired" : "converting";
    const convertsInto = entry?.conversion?.intoMint ?? null;

    const price = prices.get(mint) ?? null;
    const usd = price === null ? null : amount * price;

    let quote: HoldingQuote | null = null;
    if (convertsInto !== null) {
      const q = await fetchJupiterQuote(mint, convertsInto, rawStr);
      if (q !== null) {
        const outParams = await getOutputUiParams(conn, convertsInto);
        const outAmountUi = (Number(q.outAmount) / 10 ** outParams.decimals) * outParams.multiplier;
        const priceImpactPct = Number(q.priceImpactPct);
        if (!Number.isFinite(priceImpactPct)) {
          throw new Error(`Unparseable priceImpactPct ${JSON.stringify(q.priceImpactPct)}`);
        }
        quote = { outAmountRaw: q.outAmount, outAmountUi, priceImpactPct, transferFeeBps };
      }
    }

    rows.push({ symbol, mint, amount, status, deadline, convertsInto, usd, quote });
  }

  rows.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return rows;
}
