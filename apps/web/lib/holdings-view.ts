// Presentation helpers for the home page wallet view.
//
// Conversion targets are resolved by symbol using the ledger lifecycle data
// (packages/ledger/src/lifecycle.json):
// - XAI.conversion: intoMint PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh -> intoSymbol SPACEX
// - SPACEX.conversion: intoMint Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8 -> intoSymbol SPCXx
import type { HoldingRow } from "@lastcall/holdings";

export const CONVERSION_TARGET_SYMBOLS: Record<string, string> = {
  PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh: "SPACEX",
  Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8: "SPCXx",
};

export function conversionTargetSymbol(
  convertsInto: string | null,
  rows?: HoldingRow[],
): string | null {
  if (convertsInto === null) return null;
  const known = CONVERSION_TARGET_SYMBOLS[convertsInto];
  if (known !== undefined) return known;
  if (rows !== undefined) {
    const match = rows.find((row) => row.mint === convertsInto);
    if (match !== undefined) return match.symbol;
  }
  return null;
}

function statusRank(status: HoldingRow["status"]): number {
  if (status === "expired") return 0;
  if (status === "converting") return 1;
  return 2;
}

function usdValue(row: HoldingRow): number {
  return row.usd ?? Number.NEGATIVE_INFINITY;
}

// Urgency first: expired, then converting (soonest deadline first), then
// private tokens; within a group by USD value descending.
export function sortHoldings(rows: HoldingRow[]): HoldingRow[] {
  return [...rows].sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    if (a.status === "converting" && b.status === "converting") {
      const deadline = Date.parse(a.deadline as string) - Date.parse(b.deadline as string);
      if (deadline !== 0) return deadline;
    }
    const usd = usdValue(b) - usdValue(a);
    if (usd !== 0 && Number.isFinite(usd)) return usd;
    if (usdValue(b) !== usdValue(a)) return usdValue(b) > usdValue(a) ? 1 : -1;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
}

// Balances below 0.01 never render as 0.00.
export function formatBalance(amount: number): string {
  if (amount > 0 && amount < 0.01) return "<0.01";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Quote receive amount always carries its unit with 2 decimals.
export function formatReceive(outAmountUi: number, targetSymbol: string | null): string {
  const amount = outAmountUi.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return targetSymbol === null ? amount : `${amount} ${targetSymbol}`;
}

// A dust row with no quote stays visible but muted.
export function isDustWithoutQuote(row: HoldingRow): boolean {
  return row.amount > 0 && row.amount < 0.01 && row.quote === null;
}
