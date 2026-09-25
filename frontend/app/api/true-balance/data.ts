import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, connection as coreConnection, operativeMultiplier } from "@fineprint/core";
import { buildUniverse } from "@lastcall/events";

const RATE_LIMIT_DELAY_MS = 150;
const UNIVERSE_CACHE_TTL_MS = 60_000;

export interface TrueBalanceHolding {
  symbol: string;
  mint: string;
  /** raw on-chain amount / 10^decimals, before any multiplier. */
  raw: number;
  /** scaledUiAmountConfig multiplier in force right now: newMultiplier once its
   * effective timestamp has passed, otherwise multiplier. 1 when the mint has
   * no scaledUiAmountConfig extension. */
  multiplier: number;
  /** raw * multiplier -- the number a holder actually owns. */
  trueBalance: number;
  /** (multiplier - 1) * 100 -- cumulative gain from reinvested dividends/splits. */
  gainFromDividendsPct: number;
  /** ISO timestamp the in-force multiplier took effect. Null when the mint has
   * never had a scaledUiAmountConfig change. */
  lastChange: string | null;
}

interface UniverseCacheEntry {
  at: number;
  byMint: Map<string, string>;
}

let universeCache: UniverseCacheEntry | null = null;

/** Every xStock and PreStocks mint LAST CALL tracks, keyed by mint. Ondo is
 * excluded: the true-balance panel is scoped to xStocks and PreStocks only. */
async function xstockAndPreStocksUniverse(): Promise<Map<string, string>> {
  const now = Date.now();
  if (universeCache !== null && now - universeCache.at < UNIVERSE_CACHE_TTL_MS) {
    return universeCache.byMint;
  }
  const universe = await buildUniverse();
  const byMint = new Map<string, string>();
  for (const entry of universe) {
    if (entry.issuer === "prestocks" || entry.issuer === "xstock") {
      byMint.set(entry.mint, entry.symbol);
    }
  }
  universeCache = { at: now, byMint };
  return byMint;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ScaledFacts {
  decimals: number;
  /** The in-force multiplier: newMultiplier once its effective timestamp has
   * passed, otherwise multiplier. 1 when the mint has no
   * scaledUiAmountConfig extension (holds true for some xStocks). */
  multiplier: number;
  /** ISO timestamp of newMultiplierEffectiveTimestamp, or null when the mint
   * has no scaledUiAmountConfig extension. */
  lastChangeIso: string | null;
}

/**
 * Reads decimals and the scaledUiAmountConfig extension for one mint.
 * packages/core's decodeMint also requires a transferFeeConfig extension --
 * correct for PreStocks tokens, which all charge a transfer fee, but several
 * xStocks have no transfer fee at all, so decodeMint throws on them. The
 * multiplier math (operativeMultiplier) is still packages/core's; only the
 * account-parsing shape here is narrowed to what a true balance needs,
 * mirroring @lastcall/holdings' own getOutputUiParams for the same reason.
 */
async function readScaledFacts(conn: Connection, mint: string, asOfUnix: number): Promise<ScaledFacts> {
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const value = info.value;
  if (value === null) {
    throw new Error(`Mint account not found: ${mint}`);
  }
  const data = value.data as unknown;
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  const parsed = record?.["parsed"] as Record<string, unknown> | undefined;
  const mintInfo = parsed?.["info"] as Record<string, unknown> | undefined;
  const decimals = mintInfo?.["decimals"];
  if (typeof decimals !== "number" || !Number.isFinite(decimals)) {
    throw new Error(`Mint ${mint} account data is missing decimals`);
  }
  const extensions = Array.isArray(mintInfo?.["extensions"])
    ? (mintInfo["extensions"] as Array<Record<string, unknown>>)
    : [];
  const scaled = extensions.find((entry) => entry["extension"] === "scaledUiAmountConfig")?.["state"] as
    | Record<string, unknown>
    | undefined;
  if (
    scaled === undefined ||
    typeof scaled["multiplier"] !== "string" ||
    typeof scaled["newMultiplier"] !== "string" ||
    typeof scaled["newMultiplierEffectiveTimestamp"] !== "number"
  ) {
    return { decimals, multiplier: 1, lastChangeIso: null };
  }
  const timestamp = scaled["newMultiplierEffectiveTimestamp"];
  return {
    decimals,
    multiplier: operativeMultiplier(
      scaled["multiplier"] as string,
      scaled["newMultiplier"] as string,
      timestamp,
      asOfUnix,
    ),
    lastChangeIso: new Date(timestamp * 1000).toISOString(),
  };
}

/**
 * A wallet's xStock and PreStocks holdings with the in-force Token-2022
 * scaledUiAmountConfig multiplier applied, so a dividend or split shows up as
 * the true balance instead of the raw number a naive wallet or explorer
 * displays. Token accounts come from getParsedTokenAccountsByOwner; the
 * multiplier math comes from packages/core's operativeMultiplier, never from
 * an issuer website.
 */
export async function getTrueBalances(owner: string): Promise<TrueBalanceHolding[]> {
  const ownerKey = new PublicKey(owner);
  const programId = new PublicKey(TOKEN_2022_PROGRAM_ID);
  const conn: Connection = coreConnection();

  const [universe, tokenAccounts] = await Promise.all([
    xstockAndPreStocksUniverse(),
    conn.getParsedTokenAccountsByOwner(ownerKey, { programId }),
  ]);

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

  const asOfUnix = Math.floor(Date.now() / 1000);
  const mints = [...balances.keys()];

  const holdings: TrueBalanceHolding[] = [];
  for (const [index, mint] of mints.entries()) {
    if (index > 0) await delay(RATE_LIMIT_DELAY_MS);
    const held = balances.get(mint);
    if (held === undefined) continue;
    const symbol = universe.get(mint) ?? "UNKNOWN";
    const facts = await readScaledFacts(conn, mint, asOfUnix);
    const raw = Number(held.raw) / 10 ** facts.decimals;
    holdings.push({
      symbol,
      mint,
      raw,
      multiplier: facts.multiplier,
      trueBalance: raw * facts.multiplier,
      gainFromDividendsPct: (facts.multiplier - 1) * 100,
      lastChange: facts.lastChangeIso,
    });
  }

  holdings.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return holdings;
}
