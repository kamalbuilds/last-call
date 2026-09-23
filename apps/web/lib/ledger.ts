import { buildLedger } from "@lastcall/ledger";

export interface LedgerHolder {
  address: string;
  amount: number;
  usd: number | null;
  solBalance: number;
  lastActive: string | null;
}

export interface LedgerConversion {
  intoMint: string;
  intoSymbol?: string;
  kind?: string;
  note?: string;
}

export interface LedgerToken {
  symbol: string;
  mint: string;
  status: string;
  deadline: string | null;
  conversion: LedgerConversion | null;
  priceUsd?: number | null;
  supply?: number;
  poolHeld?: number;
  unconvertedInWallets: number;
  unconvertedUsd?: number | null;
  holderCount: number;
  holders?: LedgerHolder[];
}

export interface LedgerFile {
  generatedAt: string;
  tokens: LedgerToken[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { value: LedgerFile; at: number } | null = null;

export async function getLedger(): Promise<LedgerFile> {
  const now = Date.now();
  if (cache !== null && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const fresh = (await buildLedger()) as unknown as LedgerFile;
  cache = { value: fresh, at: now };
  return fresh;
}

export function shorten(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function daysSince(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / 86_400_000);
}
