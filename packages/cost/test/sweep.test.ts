import { describe, expect, it } from "vitest";
import type { CostVerdict } from "@fineprint/core";
import {
  costVerdictOverTime,
  selectTradFi,
  venueLabel,
  type ScheduledFeeChange,
  type VerdictResult,
} from "../src/index.js";
import { epochPosition, mintFacts, PRESTOCKS } from "./mintFacts.js";

/**
 * Size sweep. Every number printed below is a live Jupiter quote taken at test
 * time plus the transfer fee the chain's CURRENT epoch has actually activated,
 * so the table changes run to run. That is the point: the claim being tested is
 * that the on-chain cost advantage inverts with size, and a frozen fixture
 * could not show it.
 *
 * The second half of each row is the same round trip priced at the fee tier the
 * issuer has already scheduled but the chain has not reached yet. That is not a
 * forecast: the tier and its activation epoch are both sitting on the mint. Any
 * row whose verdict differs between the two halves is a trade whose answer has
 * an expiry date measured in hours.
 */

const SIZES = [1_000, 10_000, 50_000, 100_000] as const;
const SYMBOLS = ["ANTHROPIC", "OPENAI", "SPACEX", "NEURALINK"] as const;

type Side = {
  ammBps: number;
  feeBps: number;
  totalBps: number;
  tradFiPct: number;
  venue: string;
  useOnChain: boolean;
};

type Row = {
  symbol: string;
  size: number;
  now: Side | null;
  after: Side | null;
  note: string;
};

function side(r: VerdictResult): Side | null {
  if (!r.ok) return null;
  const v: CostVerdict = r.verdict;
  return {
    ammBps: v.onChain.totalRoundTripBps - v.onChain.transferFeeBps,
    feeBps: v.onChain.transferFeeBps,
    totalBps: v.onChain.totalRoundTripBps,
    tradFiPct: v.tradFiTotalPct,
    venue: venueLabel(v.bestTradFi.venue),
    useOnChain: v.useOnChain,
  };
}

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const verdictOf = (s: Side | null) => (s === null ? "no route" : s.useOnChain ? "ON-CHAIN" : "DON'T");
const flipped = (r: Row) =>
  r.now !== null && r.after !== null && r.now.useOnChain !== r.after.useOnChain;

function printTable(rows: Row[], change: ScheduledFeeChange | null): void {
  const header = change === null ? "after (no tier pending)" : `after epoch ${change.activationEpoch}`;
  const lines: string[] = [];
  lines.push(
    `${pad("symbol", 11)} ${padL("size", 9)} ${padL("AMM bps", 9)} ${padL("tradfi", 7)} ${pad("venue", 14)}` +
      ` | ${padL("fee", 5)} ${padL("total", 9)} ${pad("verdict", 9)}` +
      ` | ${padL("fee", 5)} ${padL("total", 9)} ${pad("verdict", 9)} ${header}`,
  );
  lines.push("-".repeat(125));
  for (const r of rows) {
    const n = r.now;
    const a = r.after;
    lines.push(
      `${pad(r.symbol, 11)} ${padL(`$${r.size.toLocaleString("en-US")}`, 9)} ` +
        `${padL(n === null ? "-" : n.ammBps.toFixed(1), 9)} ` +
        `${padL(n === null ? "-" : `${n.tradFiPct.toFixed(2)}%`, 7)} ` +
        `${pad(n === null ? "-" : n.venue, 14)}` +
        ` | ${padL(n === null ? "-" : n.feeBps.toFixed(0), 5)} ` +
        `${padL(n === null ? "-" : n.totalBps.toFixed(1), 9)} ${pad(verdictOf(n), 9)}` +
        ` | ${padL(a === null ? "-" : a.feeBps.toFixed(0), 5)} ` +
        `${padL(a === null ? "-" : a.totalBps.toFixed(1), 9)} ${pad(verdictOf(a), 9)} ` +
        `${flipped(r) ? "<= FLIPS" : ""}${r.note}`,
    );
  }
  console.log(`\n${lines.join("\n")}\n`);
}

describe("size sweep across the PreStocks slate", () => {
  const rows: Row[] = [];
  let change: ScheduledFeeChange | null = null;

  it("quotes every size for every symbol and prints the measured table", async () => {
    const epoch = await epochPosition();
    for (const symbol of SYMBOLS) {
      const facts = await mintFacts(symbol);
      expect(facts.transferFee.roundTripBps).toBeGreaterThan(0);
      // The fee priced below is the one the chain is charging today, not the
      // one the issuer has queued up.
      expect(facts.transferFee.currentEpoch).toBe(epoch.epoch);
      for (const size of SIZES) {
        const t = await costVerdictOverTime(facts, size);
        change ??= t.change;
        rows.push({
          symbol,
          size,
          now: side(t.now),
          after: t.afterActivation === null ? null : side(t.afterActivation),
          note: t.now.ok && !t.now.selection.anyVenueAccepts ? "below every venue minimum" : "",
        });
      }
    }
    printTable(rows, change);
    if (change !== null) {
      console.log(
        `scheduled fee change: ${change.fromBps}bps -> ${change.toBps}bps per transfer ` +
          `(${change.fromBps * 2}bps -> ${change.toBps * 2}bps round trip) at epoch ${change.activationEpoch}, ` +
          `${String(change.slotsUntil)} slots away, ` +
          `${((change.secondsUntil ?? 0) / 3600).toFixed(2)}h from the quote above.\n` +
          `rows whose verdict flips when it lands: ${rows.filter(flipped).length}/${rows.length}\n`,
      );
    }
    expect(rows.length).toBe(SYMBOLS.length * SIZES.length);
  });

  /**
   * The second column has to be a real second answer. If nothing is pending it
   * must be absent rather than a copy of the first, and if something is pending
   * the fee must genuinely be higher on every priced row.
   */
  it("prices the scheduled tier as a distinct, higher-fee column", async () => {
    const facts = await mintFacts(SYMBOLS[0]);
    const pending = facts.transferFee.pendingBps ?? null;
    const priced = rows.filter((r) => r.now !== null);
    expect(priced.length).toBeGreaterThan(0);

    if (pending === null) {
      expect(change).toBeNull();
      for (const r of rows) expect(r.after).toBeNull();
      return;
    }

    expect(change).not.toBeNull();
    expect(change!.toBps).toBeGreaterThan(change!.fromBps);
    expect(change!.activationEpoch).toBeGreaterThan(facts.transferFee.currentEpoch!);
    for (const r of priced) {
      expect(r.after, `${r.symbol} @ ${r.size}`).not.toBeNull();
      expect(r.after!.feeBps).toBe(pending * 2);
      expect(r.after!.feeBps).toBeGreaterThan(r.now!.feeBps);
      // Same quote both sides, so the whole delta is the issuer fee.
      expect(r.after!.totalBps - r.now!.totalBps).toBeCloseTo(r.after!.feeBps - r.now!.feeBps, 6);
      expect(r.after!.ammBps).toBeCloseTo(r.now!.ammBps, 6);
    }
  });

  it("produced at least one priced row, so the sweep is not vacuously green", () => {
    const priced = rows.filter((r) => r.now !== null);
    expect(priced.length).toBeGreaterThan(0);
  });

  it("reports missing markets as 'no route' rather than as zero cost", () => {
    for (const r of rows) {
      if (r.now === null) {
        expect(verdictOf(r.now)).toBe("no route");
      } else {
        // A priced row can never look free: the issuer fee alone is a floor.
        expect(r.now.totalBps).toBeGreaterThanOrEqual(r.now.feeBps - 1e-9);
      }
    }
  });

  it("CAN say no: at least one measured row comes back useOnChain false", () => {
    const priced = rows.filter((r): r is Row & { now: Side } => r.now !== null);
    expect(priced.length).toBeGreaterThan(0);
    const refusals = priced.filter((r) => !r.now.useOnChain);
    console.log(
      `\nrefusals: ${refusals.length}/${priced.length} priced rows said DON'T` +
        (refusals.length > 0
          ? `\n  first: ${refusals[0]!.symbol} @ $${refusals[0]!.size.toLocaleString("en-US")} ` +
            `costs ${refusals[0]!.now.totalBps.toFixed(1)}bps against ${refusals[0]!.now.tradFiPct.toFixed(2)}% tradfi`
          : ""),
    );
    expect(refusals.length).toBeGreaterThan(0);
  });

  it("finds the size at which each symbol's verdict flips, and reports symbols that never flip", () => {
    const report: string[] = [];
    for (const symbol of SYMBOLS) {
      const bySize = SIZES.map((s) => rows.find((r) => r.symbol === symbol && r.size === s)).filter(
        (r): r is Row => r !== undefined,
      );
      const priced = bySize.filter((r): r is Row & { now: Side } => r.now !== null);
      if (priced.length === 0) {
        report.push(`${symbol.padEnd(11)} no route at any size`);
        continue;
      }
      const describeFlip = (pick: (r: Row & { now: Side }) => boolean, label: string): string => {
        const flip = priced.find(pick);
        if (!flip) {
          return `never flips up to $${SIZES[SIZES.length - 1]!.toLocaleString("en-US")}${label}`;
        }
        if (flip.size === priced[0]!.size) {
          return `already DON'T at the smallest size tested ($${flip.size.toLocaleString("en-US")})${label}`;
        }
        return `flips to DON'T at $${flip.size.toLocaleString("en-US")}${label}`;
      };
      const now = describeFlip((r) => !r.now.useOnChain, "");
      const hasAfter = priced.some((r) => r.after !== null);
      const after = hasAfter
        ? describeFlip((r) => r.after !== null && !r.after.useOnChain, "")
        : null;
      report.push(
        `${symbol.padEnd(11)} now: ${now}` + (after === null ? "" : `\n${" ".repeat(11)} after the scheduled fee: ${after}`),
      );
    }
    console.log(`\nflip points\n${report.join("\n")}\n`);
    expect(report.length).toBe(SYMBOLS.length);
  });

  /**
   * The headline finding. A verdict that changes at a known epoch boundary is
   * only worth printing if the boundary is close enough to matter, so the
   * countdown is asserted alongside the flip count rather than described.
   */
  it("names every row whose answer expires when the scheduled fee lands", () => {
    if (change === null) {
      console.log("\nno fee tier pending: today's verdicts have no expiry\n");
      expect(rows.every((r) => r.after === null)).toBe(true);
      return;
    }
    const flips = rows.filter(flipped);
    console.log(
      `\nverdicts with an expiry date (epoch ${change.activationEpoch}, ` +
        `${((change.secondsUntil ?? 0) / 3600).toFixed(2)}h away)\n` +
        (flips.length === 0
          ? "  none: the fee doubling changes no verdict in this sweep\n"
          : flips
              .map(
                (r) =>
                  `  ${r.symbol.padEnd(11)} $${r.size.toLocaleString("en-US").padStart(8)}  ` +
                  `${verdictOf(r.now)} at ${r.now!.totalBps.toFixed(1)}bps  ->  ` +
                  `${verdictOf(r.after)} at ${r.after!.totalBps.toFixed(1)}bps`,
              )
              .join("\n") + "\n"),
    );
    expect(change.secondsUntil).toBeGreaterThan(0);
    // A flip is only possible where the fee increase crosses the tradfi bar, so
    // the count is a finding rather than a requirement. The invariant that must
    // hold is one-directional: a higher fee can never turn a DON'T into a yes.
    for (const r of rows) {
      if (r.now === null || r.after === null || r.now.useOnChain) continue;
      expect(r.after.useOnChain, `${r.symbol} @ ${r.size} un-refused itself on a fee increase`).toBe(
        false,
      );
    }
  });
});

describe("the whole slate at $50k, which is the size the thesis is about", () => {
  it("prices or refuses every PreStocks mint and names the ones with no route", async () => {
    const noRoute: string[] = [];
    const priced: Array<{
      symbol: string;
      totalBps: number;
      useOnChain: boolean;
      afterTotalBps: number | null;
      afterUseOnChain: boolean | null;
    }> = [];
    let change: ScheduledFeeChange | null = null;

    for (const [symbol] of Object.entries(PRESTOCKS)) {
      const facts = await mintFacts(symbol);
      const t = await costVerdictOverTime(facts, 50_000);
      change ??= t.change;
      if (!t.now.ok) {
        noRoute.push(`${symbol} (${t.now.noRouteLeg} leg)`);
        continue;
      }
      const after = t.afterActivation;
      priced.push({
        symbol,
        totalBps: t.now.verdict.onChain.totalRoundTripBps,
        useOnChain: t.now.verdict.useOnChain,
        afterTotalBps: after?.ok ? after.verdict.onChain.totalRoundTripBps : null,
        afterUseOnChain: after?.ok ? after.verdict.useOnChain : null,
      });
    }

    console.log(
      `\n$50,000 across the slate` +
        (change === null
          ? " (no fee tier pending)\n"
          : `, now against after epoch ${change.activationEpoch}\n`) +
        priced
          .map(
            (p) =>
              `  ${p.symbol.padEnd(11)} ${p.totalBps.toFixed(1).padStart(9)}bps  ${(p.useOnChain ? "ON-CHAIN" : "DON'T").padEnd(9)}` +
              (p.afterTotalBps === null
                ? ""
                : ` |  ${p.afterTotalBps.toFixed(1).padStart(9)}bps  ${p.afterUseOnChain ? "ON-CHAIN" : "DON'T"}` +
                  (p.useOnChain !== p.afterUseOnChain ? "   <= FLIPS" : "")),
          )
          .join("\n") +
        (noRoute.length > 0 ? `\n  no route: ${noRoute.join(", ")}` : "\n  no route: none") +
        "\n",
    );

    expect(priced.length + noRoute.length).toBe(Object.keys(PRESTOCKS).length);
    // Mixed outcomes are the expected shape. A slate that is unanimously one way
    // would mean the engine is not actually discriminating on liquidity.
    expect(priced.length).toBeGreaterThan(0);
  });
});

describe("venue selection respects published minimums", () => {
  it("excludes venues that will not take the ticket", () => {
    const small = selectTradFi(1_000);
    expect(small.anyVenueAccepts).toBe(false);
    expect(small.eligible).toHaveLength(0);

    const mid = selectTradFi(10_000);
    expect(mid.anyVenueAccepts).toBe(true);
    expect(mid.eligible.map((v) => v.venue)).toEqual(["equityzen"]);

    const large = selectTradFi(100_000);
    expect(large.eligible.map((v) => v.venue).sort()).toEqual(["equityzen", "forge", "hiive"]);
    // Forge publishes the cheapest schedule, so above its own $100k minimum it
    // becomes the benchmark the on-chain path has to beat.
    expect(large.best.venue).toBe("forge");
  });
});
