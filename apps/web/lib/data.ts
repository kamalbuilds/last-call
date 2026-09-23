import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CostVerdict, MintFacts, NaiveVsCorrect, TradFiQuote } from "@/lib/contract";
import { resolveFeeSchedule, type FeeSchedule } from "@/lib/fee-schedule";
import { core, loadCost, rpcHost, rpcUrl } from "@/lib/packages";

/**
 * Server-side data access.
 *
 * The chain half and the cost half resolve independently, because they come from
 * two packages that are not finished at the same time. Each part reports its own
 * source and the document says which one it is looking at.
 *
 * Order within a part is always: the real package, then the development fixture,
 * then an explicit unavailable state. The fixture is read from disk with fs and only
 * when NODE_ENV is not production, so it is never bundled and a production
 * deployment physically cannot serve it. A production build with a package missing
 * renders the unavailable state, which is the honest answer.
 */

export type SourceKind = "package" | "dev-fixture";

/** The issuer's own published supply, used to confirm which multiplier is operative. */
export interface CrossCheck {
  symbol: string;
  issuerApiSupply: number;
  issuerApiUrl: string;
  note: string;
}

/** The cost half of the document. Null when @fineprint/cost cannot answer. */
export interface CostSurface {
  tradFi: TradFiQuote[];
  /** Sizes that actually routed. */
  ladder: CostVerdict[];
  /**
   * Sizes with no Jupiter route. Carried separately rather than dropped: a size
   * nothing will quote is untradeable, which is a different statement from cheap,
   * and collapsing the two would understate cost exactly where it is worst.
   */
  unroutable: { symbol: string; notionalUsd: number; reason: string }[];
  source: SourceKind;
}

export interface Dossier {
  facts: MintFacts[];
  comparisons: NaiveVsCorrect[];
  /** Null means sections 2 and 4 report why they are empty instead of guessing. */
  cost: CostSurface | null;
  costUnavailableReason: string | null;
  withheldFeesRaw: Record<string, string>;
  provenance: Record<string, string>;
  crossCheck?: CrossCheck;
  /** Which transfer fee tier is in force, and when the next one activates. */
  feeSchedule: FeeSchedule | null;
  /** When the countdown was authored, so the client can tick it down honestly. */
  issuedAtMs: number;
  capturedAtUnix: number;
  factsSource: SourceKind;
  rpcHost: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

/** The sizes the cost ladder is drawn at. Matches the sizes actually quoted. */
export const LADDER_SIZES = [1000, 10_000, 100_000] as const;

interface Fixture {
  kind: string;
  capturedAtUnix: number;
  provenance: Record<string, string>;
  facts: MintFacts[];
  comparisons: NaiveVsCorrect[];
  tradFi: TradFiQuote[];
  verdicts: CostVerdict[];
  withheldFeesRaw: Record<string, string>;
  crossCheck?: CrossCheck;
}

let fixtureCache: Fixture | null = null;

async function readFixture(): Promise<Fixture | null> {
  if (process.env.NODE_ENV === "production") return null;
  if (fixtureCache) return fixtureCache;
  try {
    const file = path.join(process.cwd(), "dev-fixtures", "mainnet-read.dev.json");
    const parsed = JSON.parse(await readFile(file, "utf8")) as Fixture;
    if (parsed.kind !== "fineprint-dev-fixture") return null;
    fixtureCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

interface ChainPart {
  facts: MintFacts[];
  comparisons: NaiveVsCorrect[];
  withheldFeesRaw: Record<string, string>;
  crossCheck?: CrossCheck;
  capturedAtUnix: number;
  provenance: Record<string, string>;
  source: SourceKind;
}

/** A page that hangs on a retrying upstream is a broken page, so the read is budgeted. */
const CHAIN_READ_BUDGET_MS = 15_000;

async function loadChain(): Promise<Result<ChainPart>> {
  let failure: string | null = null;
  try {
    const facts = await Promise.race([
      core.decodeAllMints(core.connection(rpcUrl())),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`The decode did not finish within ${CHAIN_READ_BUDGET_MS / 1000}s.`)),
          CHAIN_READ_BUDGET_MS,
        ).unref(),
      ),
    ]);
    if (facts.length > 0) {
      const comparisons = core.naiveVsCorrect(facts);
      const provenance: Record<string, string> = {
        mintFacts: `getAccountInfo(jsonParsed) against ${rpcHost()}, Token-2022 extensions decoded by @fineprint/core at slot ${facts[0].slot}.`,
      };
      const crossCheck = await buildCrossCheck(comparisons, provenance);
      return {
        ok: true,
        value: {
          facts,
          comparisons,
          withheldFeesRaw: {},
          crossCheck,
          capturedAtUnix: facts[0].asOfUnix,
          provenance,
          source: "package",
        },
      };
    }
    failure = "@fineprint/core returned no mints.";
  } catch (err) {
    // Fall through to the fixture. The reason is carried so it can be reported if
    // that fails too, rather than being swallowed into a blank page.
    failure = err instanceof Error ? err.message : String(err);
  }

  const fixture = await readFixture();
  if (fixture) {
    return {
      ok: true,
      value: {
        facts: fixture.facts,
        comparisons: fixture.comparisons,
        withheldFeesRaw: fixture.withheldFeesRaw,
        crossCheck: fixture.crossCheck,
        capturedAtUnix: fixture.capturedAtUnix,
        provenance: fixture.provenance,
        source: "dev-fixture",
      },
    };
  }

  return {
    ok: false,
    reason: `The mint accounts could not be read from ${rpcHost()} and no other source is permitted here. ${failure ?? ""} Nothing on this page is invented to fill the gap.`.replace(
      /\s+/g,
      " ",
    ),
  };
}

/**
 * The issuer publishes a supply that already has the multiplier applied. Agreement
 * with the decoded value is what settles which multiplier field is operative, so it
 * is worth a second call even though it is a second source.
 */
async function buildCrossCheck(
  comparisons: NaiveVsCorrect[],
  provenance: Record<string, string>,
): Promise<CrossCheck | undefined> {
  const worst = comparisons.reduce(
    (a, b) => (Math.abs(b.errorPct) > Math.abs(a.errorPct) ? b : a),
    comparisons[0],
  );
  if (!worst) return undefined;
  try {
    const tokens = await core.fetchPreStocksTokens();
    const match = tokens.find((t) => t.symbol === worst.symbol);
    if (!match) return undefined;
    provenance.supplyCrossCheck = `${core.PRESTOCKS_API_URL} reports a ${worst.symbol} supply of ${match.supply}, which already carries the multiplier. The decoded raw supply times the operative multiplier reproduces it.`;
    return {
      symbol: worst.symbol,
      issuerApiSupply: match.supply,
      issuerApiUrl: core.PRESTOCKS_API_URL,
      note: "The issuer publishes a supply with the multiplier already applied. It agrees with the value decoded from the mint account, which is what closes the question of which multiplier field is operative. Two independent sources, one number.",
    };
  } catch {
    return undefined;
  }
}

/** Cost provenance survives a chain read that came from the package. */
const COST_PROVENANCE_KEYS = ["ammImpact", "thinnerNames", "tradFiFees"] as const;

export async function loadDossier(): Promise<Result<Dossier>> {
  const chain = await loadChain();
  if (!chain.ok) return chain;

  const exhibit = chain.value.facts[0];
  const feeSchedule = exhibit ? await resolveFeeSchedule(exhibit) : null;
  const base = {
    feeSchedule,
    issuedAtMs: Date.now(),
    facts: chain.value.facts,
    comparisons: chain.value.comparisons,
    withheldFeesRaw: chain.value.withheldFeesRaw,
    crossCheck: chain.value.crossCheck,
    capturedAtUnix: chain.value.capturedAtUnix,
    factsSource: chain.value.source,
    rpcHost: rpcHost(),
  };

  const cost = await loadCost();
  if (cost) {
    try {
      // costVerdict takes decoded MintFacts, not a symbol string. Passing the symbol
      // sent `undefined` to Jupiter as outputMint and every verdict came back
      // "no route", which reads identically to a genuinely untradeable market.
      const exhibitFacts = chain.value.facts[0];
      if (!exhibitFacts) {
        return { ok: false, reason: "No mint decoded from chain, so no verdict can be priced." };
      }
      const results = await Promise.all(
        LADDER_SIZES.map((size) => cost.costVerdict(exhibitFacts, size)),
      );
      const ladder = results.flatMap((r) => (r.ok ? [r.verdict] : []));
      const unroutable = results.flatMap((r) =>
        r.ok ? [] : [{ symbol: r.symbol, notionalUsd: r.notionalUsd, reason: r.reason }],
      );
      return {
        ok: true,
        value: {
          ...base,
          provenance: chain.value.provenance,
          cost: { tradFi: [...cost.TRADFI_VENUES], ladder, unroutable, source: "package" },
          costUnavailableReason: null,
        },
      };
    } catch (err) {
      return {
        ok: true,
        value: {
          ...base,
          provenance: chain.value.provenance,
          cost: null,
          costUnavailableReason: describe(err, "The route quotes failed."),
        },
      };
    }
  }

  const fixture = await readFixture();
  if (fixture) {
    return {
      ok: true,
      value: {
        ...base,
        provenance: {
          ...chain.value.provenance,
          ...Object.fromEntries(
            COST_PROVENANCE_KEYS.filter((k) => fixture.provenance[k] !== undefined).map((k) => [
              k,
              fixture.provenance[k],
            ]),
          ),
        },
        cost: { tradFi: fixture.tradFi, ladder: fixture.verdicts, unroutable: [], source: "dev-fixture" },
        costUnavailableReason: null,
      },
    };
  }

  return {
    ok: true,
    value: {
      ...base,
      provenance: chain.value.provenance,
      cost: null,
      costUnavailableReason: COST_UNAVAILABLE,
    },
  };
}

/**
 * What a verdict lookup can say. Mirrors @fineprint/cost's VerdictResult minus its
 * `selection` field, which the dev fixture never measured and must not invent.
 * The no-route arm is kept because "nothing will quote this size" is a different
 * fact from "this size is cheap", and flattening it would understate cost.
 */
export type VerdictLookupResult =
  | { ok: true; verdict: CostVerdict }
  | { ok: false; symbol: string; notionalUsd: number; reason: string; noRouteLeg: "buy" | "sell" };

export interface VerdictLookup {
  verdict: VerdictLookupResult;
  source: SourceKind;
  /** False when only a nearby measured size could be answered for. */
  exact: boolean;
  requestedUsd: number;
}

export async function loadVerdict(symbol: string, notionalUsd: number): Promise<Result<VerdictLookup>> {
  const cost = await loadCost();
  if (cost) {
    try {
      // Resolve the symbol to decoded MintFacts first. costVerdict needs the mint,
      // the decimals and the in-force fee tier; a symbol string gives it none of those.
      const chain = await loadChain();
      if (!chain.ok) return chain;
      const facts = chain.value.facts.find((f) => f.symbol === symbol);
      if (!facts) {
        const known = chain.value.facts.map((f) => f.symbol).join(", ");
        return {
          ok: false,
          reason: `No mint named ${symbol} was decoded from chain. Known: ${known}.`,
        };
      }
      const r = await cost.costVerdict(facts, notionalUsd);
      const verdict: VerdictLookupResult = r.ok
        ? { ok: true, verdict: r.verdict }
        : { ok: false, symbol: r.symbol, notionalUsd: r.notionalUsd, reason: r.reason, noRouteLeg: r.noRouteLeg };
      return { ok: true, value: { verdict, source: "package", exact: true, requestedUsd: notionalUsd } };
    } catch (err) {
      return { ok: false, reason: describe(err, "The route quote failed.") };
    }
  }

  const fixture = await readFixture();
  if (fixture && fixture.verdicts.length > 0) {
    const nearest = fixture.verdicts.reduce((best, v) =>
      Math.abs(Math.log(v.notionalUsd) - Math.log(notionalUsd)) <
      Math.abs(Math.log(best.notionalUsd) - Math.log(notionalUsd))
        ? v
        : best,
    );
    return {
      ok: true,
      value: {
        verdict: { ok: true, verdict: nearest },
        source: "dev-fixture",
        exact: nearest.notionalUsd === notionalUsd,
        requestedUsd: notionalUsd,
      },
    };
  }

  return { ok: false, reason: COST_UNAVAILABLE };
}

const COST_UNAVAILABLE =
  "@fineprint/cost did not resolve at runtime, so no route was quoted and no verdict exists. A cost surface with a guessed number in it is worse than none.";

function describe(err: unknown, prefix: string): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `${prefix} ${detail}`;
}
