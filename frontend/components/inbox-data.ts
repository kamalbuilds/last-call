import { buildUniverse, eventsForMints, eventsForWallet, type LastCallEvent } from "@lastcall/events";

const CACHE_TTL_MS = 5 * 60 * 1000;

let feedCache: { at: number; events: LastCallEvent[] } | null = null;
const walletCache = new Map<string, { at: number; events: LastCallEvent[] }>();

/** Latest on-chain events across every tracked mint, cached for five minutes. */
export async function getUniverseFeed(): Promise<LastCallEvent[]> {
  const now = Date.now();
  if (feedCache !== null && now - feedCache.at < CACHE_TTL_MS) {
    return feedCache.events;
  }
  const universe = await buildUniverse();
  const events = await eventsForMints(universe.map((m) => m.mint));
  feedCache = { at: now, events };
  return events;
}

/** One wallet's corporate-action inbox, cached per wallet for five minutes. */
export async function getWalletEvents(owner: string): Promise<LastCallEvent[]> {
  const now = Date.now();
  const cached = walletCache.get(owner);
  if (cached !== undefined && now - cached.at < CACHE_TTL_MS) {
    return cached.events;
  }
  const events = await eventsForWallet(owner);
  walletCache.set(owner, { at: now, events });
  return events;
}

/** YYYY-MM-DD for wall-clock dates shown on cards and in the feed. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Full-precision token amount, always with a decimal point so dust stays visible. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 9 });
}

export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
