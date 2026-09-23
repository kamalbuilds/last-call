import type { MintFacts, TransferFeeTier } from "@fineprint/core";
import { buildTransferFee, type EpochPosition } from "../../core/src/fee.js";

/**
 * Test fixture loader.
 *
 * These tests refuse to hardcode a transfer fee. The whole point of the engine
 * is that `roundTripBps` is read from the mint, because the PreStocks issuer
 * already doubled it once (50 -> 100 bps per transfer, epoch 1032 -> 1039) and
 * holds the authority to do it again. A fixture with 200 baked in would keep
 * passing after the issuer moves it, which makes it a check that cannot fail.
 *
 * So the fixture is decoded live from mainnet with getAccountInfo(jsonParsed),
 * public RPC, no key. It builds only the fields this package consumes; the full
 * decoder, including scaled-UI-amount semantics and issuer powers, is owned by
 * @fineprint/core.
 *
 * EPOCH AWARENESS. `newerTransferFee` is a schedule, not the live rate. The
 * token program keeps charging `olderTransferFee` until the chain reaches the
 * newer tier's epoch, so the fixture reads getEpochInfo and hands the decision
 * to @fineprint/core's `buildTransferFee`. Selecting the tier here in a second
 * implementation is how the two packages would drift apart again.
 */

export const RPC_URL = "https://api.mainnet-beta.solana.com";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const U64_MAX = "18446744073709551615";

/** The PreStocks slate, mint addresses resolved from Jupiter's token registry. */
export const PRESTOCKS: Readonly<Record<string, string>> = {
  SPACEX: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
  OPENAI: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
  ANTHROPIC: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
  NEURALINK: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",
  ANDURIL: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
  POLYMARKET: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
  KALSHI: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
  FIGUREAI: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",
  XAI: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx",
};

interface ParsedFeeTier {
  epoch: number;
  maximumFee: number | string;
  transferFeeBasisPoints: number;
}

interface ParsedExtension {
  extension: string;
  state?: Record<string, unknown>;
}

/**
 * u64 max as an IEEE double. `jsonParsed` hands maximumFee back as a JSON
 * number, and 18446744073709551615 does not survive the round trip through a
 * double: it comes back as 18446744073709552000. Stringifying that gives a
 * value that will never equal the u64-max literal, which is why the core types
 * insist this field stays a string. Comparing against the double is the only
 * comparison that is actually true, and the exact literal is restored once the
 * match is confirmed.
 */
const U64_MAX_AS_DOUBLE = 18446744073709551615;

function isUncapped(maximumFee: number | string): boolean {
  return Number(maximumFee) >= U64_MAX_AS_DOUBLE;
}

function asTier(raw: ParsedFeeTier | undefined): TransferFeeTier | null {
  if (!raw) return null;
  return {
    epoch: Number(raw.epoch),
    transferFeeBasisPoints: Number(raw.transferFeeBasisPoints),
    maximumFee: isUncapped(raw.maximumFee) ? U64_MAX : String(raw.maximumFee),
  };
}

/**
 * Where the chain sits in the epoch schedule. This is what decides which fee
 * tier is being charged, so it is read from mainnet and never assumed.
 */
export async function fetchEpochPosition(): Promise<EpochPosition> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEpochInfo", params: [] }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status} calling getEpochInfo`);
  const body = (await res.json()) as {
    result?: { epoch: number; slotIndex: number; slotsInEpoch: number };
    error?: { message: string };
  };
  if (body.error) throw new Error(`RPC error from getEpochInfo: ${body.error.message}`);
  const r = body.result;
  if (!r) throw new Error("getEpochInfo returned no result");
  return { epoch: r.epoch, slotIndex: r.slotIndex, slotsInEpoch: r.slotsInEpoch };
}

let epochOnce: Promise<EpochPosition> | null = null;
/** Cached so a sweep across nine mints reads the epoch once. */
export function epochPosition(): Promise<EpochPosition> {
  epochOnce ??= fetchEpochPosition();
  return epochOnce;
}

export async function loadMintFacts(
  symbol: string,
  mint: string,
  epochAt?: EpochPosition,
): Promise<MintFacts> {
  const epoch = epochAt ?? (await epochPosition());
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mint, { encoding: "jsonParsed" }],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status} reading mint ${mint}`);
  const body = (await res.json()) as {
    result?: { context: { slot: number }; value: { owner: string; data: { parsed: { info: Record<string, unknown> } } } | null };
    error?: { message: string };
  };
  if (body.error) throw new Error(`RPC error reading mint ${mint}: ${body.error.message}`);
  const value = body.result?.value;
  if (!value) throw new Error(`Mint ${mint} not found on mainnet`);

  const info = value.data.parsed.info;
  const extensions = (info["extensions"] as ParsedExtension[] | undefined) ?? [];
  const feeExt = extensions.find((e) => e.extension === "transferFeeConfig");
  if (!feeExt?.state) {
    throw new Error(`Mint ${mint} carries no transferFeeConfig extension; this fixture expects Token-2022 with a fee`);
  }
  const newer = asTier(feeExt.state["newerTransferFee"] as ParsedFeeTier | undefined);
  if (!newer) throw new Error(`Mint ${mint} transferFeeConfig has no newerTransferFee`);
  const older = asTier(feeExt.state["olderTransferFee"] as ParsedFeeTier | undefined) ?? newer;

  const decimals = Number(info["decimals"]);
  const rawSupply = String(info["supply"]);

  return {
    symbol,
    mint,
    ownerProgram: value.owner,
    decimals,
    rawSupply,
    effectiveSupply: Number(rawSupply) / 10 ** decimals,
    // currentBps / roundTripBps come back as the tier the chain's epoch has
    // actually activated. A round trip is two transfers: buy is one, sell is
    // the other. The uncapped flag is an exact-string compare against u64 max,
    // safe because asTier() restored the literal jsonParsed had mangled.
    transferFee: buildTransferFee(older, newer, epoch, U64_MAX),
    scaledUiAmount: null,
    powers: {
      permanentDelegate: null,
      pausableAuthority: null,
      paused: false,
      transferFeeAuthority: (feeExt.state["transferFeeConfigAuthority"] as string | null) ?? null,
      withdrawWithheldAuthority: (feeExt.state["withdrawWithheldAuthority"] as string | null) ?? null,
      transferHookAuthority: null,
      transferHookProgramId: null,
      scaledUiAmountAuthority: null,
      defaultAccountState: null,
      singleKeyControlsAll: false,
      distinctAuthorities: [],
    },
    extensionsPresent: extensions.map((e) => e.extension),
    asOfUnix: Math.floor(Date.now() / 1000),
    slot: body.result?.context.slot ?? 0,
  };
}

const cache = new Map<string, Promise<MintFacts>>();

/** Cached so a sweep across many sizes hits the RPC once per mint. */
export function mintFacts(symbol: string): Promise<MintFacts> {
  const mint = PRESTOCKS[symbol];
  if (!mint) throw new Error(`Unknown PreStocks symbol ${symbol}`);
  let p = cache.get(symbol);
  if (!p) {
    p = loadMintFacts(symbol, mint);
    cache.set(symbol, p);
  }
  return p;
}
