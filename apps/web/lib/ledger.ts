import { readFileSync } from "node:fs";
import path from "node:path";

export interface LedgerHolder {
  address: string;
  amount: number;
  usd: number;
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
  priceUsd?: number;
  supply?: number;
  poolHeld?: number;
  unconvertedInWallets: number;
  unconvertedUsd?: number;
  holderCount: number;
  holders?: LedgerHolder[];
}

export interface LedgerFile {
  generatedAt: string;
  tokens: LedgerToken[];
}

/** Resolve packages/ledger/out/ledger.json from wherever Next runs us. */
function ledgerPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "../../packages/ledger/out/ledger.json"),
    path.resolve(process.cwd(), "packages/ledger/out/ledger.json"),
    path.resolve(process.cwd(), "../packages/ledger/out/ledger.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      continue;
    }
  }
  return candidates[0] as string;
}

/** Read the ledger file at request time. Always live, never bundled. */
export function readLedger(): LedgerFile {
  const raw = readFileSync(ledgerPath(), "utf8");
  return JSON.parse(raw) as LedgerFile;
}

export function shorten(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function daysSince(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / 86_400_000);
}
