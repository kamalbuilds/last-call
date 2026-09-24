/**
 * @lastcall/events -- a wallet's corporate-action inbox for tokenized stocks
 * on Solana. Every event is read from a token's own Token-2022 on-chain
 * config (decoded with @fineprint/core's helpers) or from PreStocks'
 * published conversion lifecycle (@lastcall/ledger), never from a static
 * calendar someone has to remember to update.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  unpackMint,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getPausableConfig,
} from "@solana/spl-token";
import {
  TOKEN_2022_PROGRAM_ID,
  fetchPreStocksTokens,
  operativeMultiplier,
  isPending,
  buildTransferFee,
  readEpochPosition,
  U64_MAX,
} from "@fineprint/core";
import type { EpochPosition, TransferFeeTier } from "@fineprint/core";
import { LIFECYCLE } from "@lastcall/ledger";
import type { LifecycleEntry } from "@lastcall/ledger";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type EventUrgency = "action_required" | "alert" | "informational";

interface BaseEvent {
  mint: string;
  symbol: string;
  /** When this event was computed, unix seconds. */
  asOfUnix: number;
}

/** A PreStocks conversion window, from packages/ledger's lifecycle. */
export interface ConversionEvent extends BaseEvent {
  type: "conversion";
  urgency: "action_required";
  deadline: string;
  expired: boolean;
  convertsIntoMint: string | null;
  convertsIntoSymbol: string | null;
  /** The holder's balance in this mint. Null from eventsForMints, which has no wallet context. */
  amount: number | null;
  /** amount priced in USD via Jupiter. Null when no price is available. */
  usdValue: number | null;
  note: string;
}

/** A scaledUiAmountConfig multiplier change: dividend, split, or rebase. */
export interface DividendOrSplitEvent extends BaseEvent {
  type: "dividend_or_split";
  urgency: "informational";
  /** True when newMultiplierEffectiveTimestamp is still ahead of now. */
  pending: boolean;
  /** ISO timestamp of newMultiplierEffectiveTimestamp. */
  effectiveDate: string;
  multiplier: number;
  newMultiplier: number;
  /** newMultiplier / multiplier - 1. */
  percentChange: number;
}

/** A transferFeeConfig tier change. */
export interface FeeChangeEvent extends BaseEvent {
  type: "fee_change";
  urgency: "alert";
  olderBps: number;
  newerBps: number;
  activationEpoch: number;
  currentEpoch: number;
  /** True when the chain has reached activationEpoch, so newerBps is what gets charged today. */
  inForce: boolean;
}

/** pausableConfig.paused === true: the issuer has halted transfers. */
export interface PausedEvent extends BaseEvent {
  type: "paused";
  urgency: "alert";
  pausableAuthority: string | null;
}

export type LastCallEvent = ConversionEvent | DividendOrSplitEvent | FeeChangeEvent | PausedEvent;

export interface UniverseMint {
  symbol: string;
  mint: string;
  issuer: "prestocks" | "xstock" | "ondo";
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const JUP_SEARCH_URL = "https://lite-api.jup.ag/tokens/v2/search";
const JUP_PRICE_URL = "https://lite-api.jup.ag/price/v3";

// Retired: no longer listed by the live PreStocks API, but still on mainnet
// with a live conversion deadline. Never inferred, always named explicitly.
const XAI_MINT = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const XAI_SYMBOL = "XAI";

// Every xStock mint shares this signer as `dev` in Jupiter's token metadata
// (Backed Finance, the xStocks issuer). Combined with isVerified and the
// Token-2022 program check, this is the "exact issuer" filter the discovery
// step needs so an impostor "xStock"-named memecoin cannot enter the universe.
const XSTOCK_ISSUER = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";

const MAX_ACCOUNTS_PER_CALL = 100; // Solana's getMultipleAccounts hard limit.
const TOKEN_2022_PROGRAM_KEY = new PublicKey(TOKEN_2022_PROGRAM_ID);

/* ------------------------------------------------------------------ */
/* Small shared plumbing                                               */
/* ------------------------------------------------------------------ */

function connection(): Connection {
  return new Connection(process.env["SOLANA_RPC_URL"] ?? DEFAULT_RPC_URL, "confirmed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate.?limit|502|503|500|timeout|timed out|econnreset|enotfound|eai_again/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === retries) throw err;
      await sleep(Math.min(800 * 2 ** attempt, 30_000));
    }
  }
  throw lastErr;
}

async function fetchJsonWithRetry(url: string, retries = 6): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch (cause) {
      lastError = new Error(`GET ${url} failed: ${String(cause)}`);
      await sleep(Math.min(1000 * 2 ** attempt, 30_000));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`GET ${url} returned HTTP ${res.status}`);
      if (attempt < retries) {
        const header = res.headers.get("retry-after");
        const seconds = header === null ? NaN : Number(header);
        await sleep(Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 30_000) : Math.min(1000 * 2 ** attempt, 30_000));
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function lifecycleByMint(): Map<string, LifecycleEntry> {
  const byMint = new Map<string, LifecycleEntry>();
  for (const entry of Object.values(LIFECYCLE)) {
    byMint.set(entry.mint, entry);
  }
  return byMint;
}

/* ------------------------------------------------------------------ */
/* Universe discovery                                                  */
/* ------------------------------------------------------------------ */

interface JupSearchRow {
  id: string;
  symbol: string;
  name: string;
  dev?: string;
  tokenProgram?: string;
  isVerified?: boolean;
}

async function searchJupiter(query: string): Promise<JupSearchRow[]> {
  const url = `${JUP_SEARCH_URL}?query=${encodeURIComponent(query)}&limit=100`;
  const payload = await fetchJsonWithRetry(url);
  if (!Array.isArray(payload)) return [];
  const out: JupSearchRow[] = [];
  for (const row of payload) {
    const record = asRecord(row);
    const id = record?.["id"];
    const symbol = record?.["symbol"];
    const name = record?.["name"];
    if (typeof id !== "string" || typeof symbol !== "string" || typeof name !== "string") continue;
    out.push({
      id,
      symbol,
      name,
      dev: typeof record?.["dev"] === "string" ? (record["dev"] as string) : undefined,
      tokenProgram: typeof record?.["tokenProgram"] === "string" ? (record["tokenProgram"] as string) : undefined,
      isVerified: record?.["isVerified"] === true,
    });
  }
  return out;
}

function isXStock(row: JupSearchRow): boolean {
  return (
    row.tokenProgram === TOKEN_2022_PROGRAM_ID &&
    row.isVerified === true &&
    row.dev === XSTOCK_ISSUER &&
    row.name.endsWith(" xStock")
  );
}

// Ondo's real products (USDY, OUSG) are classic SPL Token today, not
// Token-2022, so this currently contributes nothing to the universe -- a
// correct empty result, not a bug. Written generically so a future
// Token-2022 Ondo listing is picked up without a code change.
function isOndo(row: JupSearchRow): boolean {
  return row.tokenProgram === TOKEN_2022_PROGRAM_ID && row.isVerified === true && /^Ondo\b/.test(row.name);
}

/**
 * The full universe LAST CALL watches: every PreStocks pre-IPO token (plus
 * the retired XAI mint), every xStock, and every Ondo mint that clears the
 * Token-2022 + verified-issuer filter. Tessera or any other pre-IPO platform
 * is never in scope -- disqualifying for the PreStocks bounty -- and is
 * filtered out defensively by name even though none of the three sources
 * above can produce one.
 */
export async function buildUniverse(): Promise<UniverseMint[]> {
  const [preStocks, xstockRows, ondoRows] = await Promise.all([
    fetchPreStocksTokens(),
    searchJupiter("xStock"),
    searchJupiter("Ondo"),
  ]);

  const byMint = new Map<string, UniverseMint>();
  for (const token of preStocks) {
    byMint.set(token.mint, { symbol: token.symbol, mint: token.mint, issuer: "prestocks" });
  }
  if (!byMint.has(XAI_MINT)) {
    byMint.set(XAI_MINT, { symbol: XAI_SYMBOL, mint: XAI_MINT, issuer: "prestocks" });
  }
  for (const row of xstockRows) {
    if (isXStock(row)) byMint.set(row.id, { symbol: row.symbol, mint: row.id, issuer: "xstock" });
  }
  for (const row of ondoRows) {
    if (isOndo(row)) byMint.set(row.id, { symbol: row.symbol, mint: row.id, issuer: "ondo" });
  }

  const universe = [...byMint.values()].filter(
    (m) => !/tessera/i.test(m.symbol) && !/tessera/i.test(m.mint),
  );
  universe.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return universe;
}

/* ------------------------------------------------------------------ */
/* Batched Token-2022 decode                                           */
/* ------------------------------------------------------------------ */

interface RawMintFacts {
  mint: string;
  decimals: number;
  scaledUiAmount: { multiplier: string; newMultiplier: string; newMultiplierEffectiveTimestamp: number } | null;
  transferFee: ReturnType<typeof buildTransferFee> | null;
  paused: boolean;
  pausableAuthority: string | null;
}

/**
 * Decodes every mint's Token-2022 extensions in getMultipleAccounts batches
 * of up to 100 (Solana's hard limit), instead of one getAccountInfo per mint.
 * Reuses @solana/spl-token's extension unpackers (same ones packages/exec
 * uses) so this needs no hand-rolled TLV parsing, and reuses
 * @fineprint/core's buildTransferFee so the in-force fee tier selection is
 * the same rule everywhere in this repo.
 */
export async function batchDecodeMints(
  conn: Connection,
  mints: string[],
  epoch: EpochPosition,
): Promise<Map<string, RawMintFacts>> {
  const out = new Map<string, RawMintFacts>();
  const keys = mints.map((m) => new PublicKey(m));
  for (const group of chunk(keys, MAX_ACCOUNTS_PER_CALL)) {
    const infos = await withRetry(() => conn.getMultipleAccountsInfo(group, "confirmed"));
    for (let i = 0; i < group.length; i++) {
      const mintKey = group[i];
      const info = infos[i];
      if (mintKey === undefined || info === null || info === undefined) continue;
      if (info.owner.toBase58() !== TOKEN_2022_PROGRAM_ID) continue;
      const mint = unpackMint(mintKey, info, TOKEN_2022_PROGRAM_KEY);
      const scaled = getScaledUiAmountConfig(mint);
      const fee = getTransferFeeConfig(mint);
      const pausable = getPausableConfig(mint);

      let transferFee: ReturnType<typeof buildTransferFee> | null = null;
      if (fee !== null) {
        const older: TransferFeeTier = {
          epoch: Number(fee.olderTransferFee.epoch),
          transferFeeBasisPoints: fee.olderTransferFee.transferFeeBasisPoints,
          maximumFee: fee.olderTransferFee.maximumFee.toString(),
        };
        const newer: TransferFeeTier = {
          epoch: Number(fee.newerTransferFee.epoch),
          transferFeeBasisPoints: fee.newerTransferFee.transferFeeBasisPoints,
          maximumFee: fee.newerTransferFee.maximumFee.toString(),
        };
        transferFee = buildTransferFee(older, newer, epoch, U64_MAX);
      }

      out.set(mintKey.toBase58(), {
        mint: mintKey.toBase58(),
        decimals: mint.decimals,
        scaledUiAmount:
          scaled === null
            ? null
            : {
                multiplier: String(scaled.multiplier),
                newMultiplier: String(scaled.newMultiplier),
                newMultiplierEffectiveTimestamp: Number(scaled.newMultiplierEffectiveTimestamp),
              },
        transferFee,
        paused: pausable !== null && pausable.paused === true,
        pausableAuthority: pausable === null ? null : pausable.authority.toBase58(),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Event construction                                                  */
/* ------------------------------------------------------------------ */

function buildEventsForMint(
  info: UniverseMint,
  facts: RawMintFacts,
  lifecycle: Map<string, LifecycleEntry>,
  asOfUnix: number,
  holder?: { amount: number; usd: number | null },
): LastCallEvent[] {
  const events: LastCallEvent[] = [];
  const entry = lifecycle.get(facts.mint) ?? null;

  if (entry !== null && entry.deadline !== null && entry.conversion !== null) {
    const intoMint = entry.conversion["intoMint"];
    const intoSymbol = entry.conversion["intoSymbol"];
    events.push({
      type: "conversion",
      urgency: "action_required",
      mint: facts.mint,
      symbol: info.symbol,
      asOfUnix,
      deadline: entry.deadline,
      expired: Date.parse(entry.deadline) <= asOfUnix * 1000,
      convertsIntoMint: typeof intoMint === "string" ? intoMint : null,
      convertsIntoSymbol: typeof intoSymbol === "string" ? intoSymbol : null,
      amount: holder?.amount ?? null,
      usdValue: holder?.usd ?? null,
      note: entry.note,
    });
  }

  if (facts.scaledUiAmount !== null) {
    const { multiplier, newMultiplier, newMultiplierEffectiveTimestamp } = facts.scaledUiAmount;
    const m = Number(multiplier);
    const n = Number(newMultiplier);
    // A no-op scaledUiAmountConfig (multiplier === newMultiplier, the
    // as-initialized default on most mints) is not a corporate action.
    if (Number.isFinite(m) && Number.isFinite(n) && Math.abs(n - m) > 1e-12) {
      events.push({
        type: "dividend_or_split",
        urgency: "informational",
        mint: facts.mint,
        symbol: info.symbol,
        asOfUnix,
        pending: isPending(newMultiplierEffectiveTimestamp, asOfUnix),
        effectiveDate: new Date(newMultiplierEffectiveTimestamp * 1000).toISOString(),
        multiplier: m,
        newMultiplier: n,
        percentChange: n / m - 1,
      });
    }
  }

  if (facts.transferFee !== null && facts.transferFee.previous !== null) {
    events.push({
      type: "fee_change",
      urgency: "alert",
      mint: facts.mint,
      symbol: info.symbol,
      asOfUnix,
      olderBps: facts.transferFee.previous.transferFeeBasisPoints,
      newerBps: facts.transferFee.current.transferFeeBasisPoints,
      activationEpoch: facts.transferFee.current.epoch,
      currentEpoch: facts.transferFee.currentEpoch ?? -1,
      inForce: facts.transferFee.currentBps === facts.transferFee.current.transferFeeBasisPoints,
    });
  }

  if (facts.paused) {
    events.push({
      type: "paused",
      urgency: "alert",
      mint: facts.mint,
      symbol: info.symbol,
      asOfUnix,
      pausableAuthority: facts.pausableAuthority,
    });
  }

  return events;
}

function urgencyRank(e: LastCallEvent): number {
  // Action required beats alert beats informational -- the order a
  // corporate-action inbox should triage in, not the order the four types
  // happen to be listed in the spec.
  switch (e.type) {
    case "conversion":
      return 0;
    case "fee_change":
    case "paused":
      return 1;
    case "dividend_or_split":
      return 2;
  }
}

function sortEvents(events: LastCallEvent[]): LastCallEvent[] {
  return [...events].sort((a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b);
    if (rank !== 0) return rank;
    if (a.type === "conversion" && b.type === "conversion") {
      if (a.expired !== b.expired) return a.expired ? -1 : 1;
      const da = Date.parse(a.deadline);
      const db = Date.parse(b.deadline);
      return a.expired ? db - da : da - db; // expired: most recent first; upcoming: soonest first
    }
    if (a.type === "dividend_or_split" && b.type === "dividend_or_split") {
      return Date.parse(a.effectiveDate) - Date.parse(b.effectiveDate);
    }
    return 0;
  });
}

async function fetchPrices(mints: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (mints.length === 0) return out;
  try {
    const payload = asRecord(await fetchJsonWithRetry(`${JUP_PRICE_URL}?ids=${mints.join(",")}`));
    for (const mint of mints) {
      const row = asRecord(payload?.[mint]);
      const price = row?.["usdPrice"];
      out.set(mint, typeof price === "number" && Number.isFinite(price) ? price : null);
    }
  } catch {
    for (const mint of mints) out.set(mint, null);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/**
 * Every corporate-action event live on the given mints' own Token-2022
 * config right now. No wallet context, so conversion events carry no
 * amount or value.
 */
export async function eventsForMints(mints: string[]): Promise<LastCallEvent[]> {
  const conn = connection();
  const uniqueMints = [...new Set(mints)];
  if (uniqueMints.length === 0) return [];

  const [universe, epoch] = await Promise.all([buildUniverse(), readEpochPosition(conn)]);
  const byMint = new Map(universe.map((u) => [u.mint, u] as const));
  const lifecycle = lifecycleByMint();
  const asOfUnix = Math.floor(Date.now() / 1000);

  const facts = await batchDecodeMints(conn, uniqueMints, epoch);
  const events: LastCallEvent[] = [];
  for (const mint of uniqueMints) {
    const fact = facts.get(mint);
    if (fact === undefined) continue;
    const info = byMint.get(mint) ?? { symbol: lifecycle.get(mint)?.symbol ?? mint, mint, issuer: "prestocks" as const };
    events.push(...buildEventsForMint(info, fact, lifecycle, asOfUnix));
  }
  return sortEvents(events);
}

/**
 * A wallet's corporate-action inbox: every LAST CALL universe mint the
 * wallet holds a non-zero Token-2022 balance of, each with whatever events
 * its own on-chain config carries right now. Conversion events additionally
 * carry the holder's amount and its USD value.
 */
export async function eventsForWallet(owner: string): Promise<LastCallEvent[]> {
  const conn = connection();
  const ownerKey = new PublicKey(owner);
  const programId = new PublicKey(TOKEN_2022_PROGRAM_ID);

  const [universe, accounts] = await Promise.all([
    buildUniverse(),
    withRetry(() => conn.getParsedTokenAccountsByOwner(ownerKey, { programId })),
  ]);
  const byMint = new Map(universe.map((u) => [u.mint, u] as const));

  const balances = new Map<string, bigint>();
  for (const tokenAccount of accounts.value) {
    const parsed = asRecord(tokenAccount.account.data);
    const info = asRecord(parsed?.["parsed"])?.["info"];
    const infoRecord = asRecord(info);
    const mint = infoRecord?.["mint"];
    const tokenAmount = asRecord(infoRecord?.["tokenAmount"]);
    const amountStr = tokenAmount?.["amount"];
    if (typeof mint !== "string" || typeof amountStr !== "string") continue;
    if (!byMint.has(mint)) continue;
    let raw: bigint;
    try {
      raw = BigInt(amountStr);
    } catch {
      continue;
    }
    if (raw === 0n) continue;
    balances.set(mint, (balances.get(mint) ?? 0n) + raw);
  }
  if (balances.size === 0) return [];

  const heldMints = [...balances.keys()];
  const [epoch, prices] = await Promise.all([readEpochPosition(conn), fetchPrices(heldMints)]);
  const facts = await batchDecodeMints(conn, heldMints, epoch);
  const lifecycle = lifecycleByMint();
  const asOfUnix = Math.floor(Date.now() / 1000);

  const events: LastCallEvent[] = [];
  for (const mint of heldMints) {
    const fact = facts.get(mint);
    if (fact === undefined) continue;
    const info = byMint.get(mint);
    if (info === undefined) continue;
    const raw = balances.get(mint) ?? 0n;
    const multiplier = fact.scaledUiAmount
      ? operativeMultiplier(
          fact.scaledUiAmount.multiplier,
          fact.scaledUiAmount.newMultiplier,
          fact.scaledUiAmount.newMultiplierEffectiveTimestamp,
          asOfUnix,
        )
      : 1;
    const amount = (Number(raw) / 10 ** fact.decimals) * multiplier;
    const price = prices.get(mint) ?? null;
    const usd = price === null ? null : amount * price;
    events.push(...buildEventsForMint(info, fact, lifecycle, asOfUnix, { amount, usd }));
  }
  return sortEvents(events);
}

/* ------------------------------------------------------------------ */
/* iCalendar export                                                     */
/* ------------------------------------------------------------------ */

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDateStamp(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

function icsAlarm(daysBefore: number): string[] {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:LAST CALL reminder", `TRIGGER:-P${daysBefore}D`, "END:VALARM"];
}

/**
 * Renders the dated events (conversion deadlines and dividend/split
 * effective dates) as a VCALENDAR a holder can import. fee_change and
 * paused events have no wall-clock date to peg a VEVENT to, so they are
 * left out of the calendar; they still show up in the inbox arrays above.
 */
export function toIcs(events: LastCallEvent[]): string {
  const dtstamp = icsDateStamp(new Date().toISOString());
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LAST CALL//Corporate Actions//EN", "CALSCALE:GREGORIAN"];

  for (const event of events) {
    let dateIso: string;
    let summary: string;
    let description: string;
    if (event.type === "conversion") {
      dateIso = event.deadline;
      summary = `${event.symbol}: conversion deadline${event.expired ? " (expired)" : ""}`;
      description = icsEscape(
        `${event.symbol} converts into ${event.convertsIntoSymbol ?? "its public stock"}. ${event.note}`,
      );
    } else if (event.type === "dividend_or_split") {
      dateIso = event.effectiveDate;
      const pct = (event.percentChange * 100).toFixed(4);
      summary = `${event.symbol}: multiplier change ${pct}%`;
      description = icsEscape(`Multiplier ${event.multiplier} -> ${event.newMultiplier} (${pct}%).`);
    } else {
      continue;
    }
    const dt = icsDateStamp(dateIso);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.mint}-${event.type}-${dt}@lastcall`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dt}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${description}`,
      ...icsAlarm(30),
      ...icsAlarm(7),
      ...icsAlarm(1),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
