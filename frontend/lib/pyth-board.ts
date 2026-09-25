import { fetchHermesPrices, MissingPythKeyError, SPACEX_PRESTOCKS_MINT, SPCXX_MINT } from "@lastcall/pyth";
import type { UniverseMint } from "@lastcall/events";
import { getUniverse } from "@/lib/universe";

const HERMES = "https://hermes.pyth.network";
const JUP_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const CATALOG_TTL_MS = 60 * 60 * 1000;
const ENTITLEMENT_TTL_MS = 60 * 60 * 1000;
const BOARD_TTL_MS = 30 * 1000;
const CONCURRENCY = 8;

export type PythStatus = "live" | "not_entitled" | "no_feed" | "no_key" | "error";

export interface PythRow {
  symbol: string;
  mint: string;
  feedSymbol: string;
  feedId: string | null;
  status: PythStatus;
  /** Hermes aggregate price, confidence and publish time; null unless status is live. */
  pythPrice: number | null;
  confidence: number | null;
  publishTimeUnix: number | null;
  /** Jupiter's live USD price for the on-chain token. */
  marketPrice: number | null;
  /** (market - pyth) / pyth in basis points; null when either side is missing or not comparable. */
  gapBps: number | null;
  note: string;
}

export interface PythBoard {
  readAt: string;
  liveFeeds: string[];
  rows: PythRow[];
}

interface CatalogEntry {
  id: string;
  attributes: { symbol: string };
}

let catalog: { at: number; bySymbol: Map<string, string> } | null = null;
const notEntitled = new Map<string, { at: number; reason: string }>();
let board: { at: number; value: PythBoard } | null = null;

async function feedCatalog(): Promise<Map<string, string>> {
  if (catalog !== null && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.bySymbol;
  const bySymbol = new Map<string, string>();
  for (const type of ["equity", "crypto"]) {
    const res = await fetch(`${HERMES}/v2/price_feeds?asset_type=${type}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Hermes feed catalog returned HTTP ${res.status}`);
    for (const f of (await res.json()) as CatalogEntry[]) bySymbol.set(f.attributes.symbol, f.id);
  }
  catalog = { at: Date.now(), bySymbol };
  return bySymbol;
}

async function jupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < mints.length; i += 50) {
    const ids = mints.slice(i, i + 50);
    const res = await fetch(`${JUP_PRICE_URL}?ids=${ids.join(",")}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Jupiter price returned HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
    for (const id of ids) {
      const p = body[id]?.usdPrice;
      if (typeof p === "number" && Number.isFinite(p) && p > 0) out.set(id, p);
    }
  }
  return out;
}

interface Target {
  symbol: string;
  mint: string;
  feedSymbol: string;
  /** SPACEX PreStocks converts into SPCXx at a ratio, so its price is not 1:1 with the SPCX share. */
  comparable: boolean;
}

function targets(universe: UniverseMint[]): Target[] {
  const out: Target[] = [];
  for (const m of universe) {
    if (m.mint === SPACEX_PRESTOCKS_MINT) {
      out.push({ symbol: m.symbol, mint: m.mint, feedSymbol: "Equity.US.SPCX/USD", comparable: false });
    } else if (m.issuer === "xstock") {
      const ticker = m.symbol.replace(/x$/, "").replace(".", "-");
      out.push({ symbol: m.symbol, mint: m.mint, feedSymbol: `Equity.US.${ticker}/USD`, comparable: true });
      if (m.mint === SPCXX_MINT) {
        out.push({ symbol: m.symbol, mint: m.mint, feedSymbol: "Crypto.SPCXX/USD", comparable: true });
      }
    }
  }
  return out;
}

async function readRow(t: Target, feeds: Map<string, string>, market: Map<string, number>): Promise<PythRow> {
  const marketPrice = market.get(t.mint) ?? null;
  const base = { symbol: t.symbol, mint: t.mint, feedSymbol: t.feedSymbol, marketPrice, pythPrice: null, confidence: null, publishTimeUnix: null, gapBps: null };
  const feedId = feeds.get(t.feedSymbol) ?? null;
  if (feedId === null) return { ...base, feedId, status: "no_feed", note: `Pyth publishes no ${t.feedSymbol} feed.` };
  const cached = notEntitled.get(feedId);
  if (cached !== undefined && Date.now() - cached.at < ENTITLEMENT_TTL_MS) {
    return { ...base, feedId, status: "not_entitled", note: cached.reason };
  }
  try {
    const p = (await fetchHermesPrices([feedId])).get(feedId);
    if (p === undefined) return { ...base, feedId, status: "error", note: "Hermes returned no price for this feed." };
    const gapBps = t.comparable && marketPrice !== null ? ((marketPrice - p.price) / p.price) * 10_000 : null;
    return {
      ...base,
      feedId,
      status: "live",
      pythPrice: p.price,
      confidence: p.confidence,
      publishTimeUnix: p.publishTimeUnix,
      gapBps,
      note: t.comparable ? "" : "SPACEX converts into SPCXx at a ratio, so its price is not compared 1:1 with the SPCX share.",
    };
  } catch (err) {
    if (err instanceof MissingPythKeyError) return { ...base, feedId, status: "no_key", note: "PYTH_API_KEY is not set on this server." };
    const message = err instanceof Error ? err.message : String(err);
    if (/status 403/.test(message) && /Not entitled/i.test(message)) {
      const reason = "Not entitled on the current Pyth plan: Hermes refused this feed for our API key.";
      notEntitled.set(feedId, { at: Date.now(), reason });
      return { ...base, feedId, status: "not_entitled", note: reason };
    }
    return { ...base, feedId, status: "error", note: `Hermes error: ${message.slice(0, 160)}` };
  }
}

const ORDER: Record<PythStatus, number> = { live: 0, error: 1, no_key: 2, not_entitled: 3, no_feed: 4 };

/** Live Pyth price per tracked token that has a public-market feed, next to Jupiter's on-chain price. */
export async function getPythBoard(): Promise<PythBoard> {
  if (board !== null && Date.now() - board.at < BOARD_TTL_MS) return board.value;
  const universe = await getUniverse();
  const list = targets(universe);
  const [feeds, market] = await Promise.all([feedCatalog(), jupiterPrices([...new Set(list.map((t) => t.mint))])]);
  const rows: PythRow[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < list.length) {
        const i = next++;
        rows[i] = await readRow(list[i], feeds, market);
      }
    }),
  );
  const spacexFirst = (r: PythRow): number => (r.mint === SPACEX_PRESTOCKS_MINT || r.mint === SPCXX_MINT ? 0 : 1);
  rows.sort((a, b) => spacexFirst(a) - spacexFirst(b) || ORDER[a.status] - ORDER[b.status] || a.symbol.localeCompare(b.symbol));
  const value: PythBoard = {
    readAt: new Date().toISOString(),
    liveFeeds: rows.filter((r) => r.status === "live").map((r) => r.feedSymbol),
    rows,
  };
  board = { at: Date.now(), value };
  return value;
}
