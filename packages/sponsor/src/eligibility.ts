import { Connection, PublicKey } from "@solana/web3.js";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export interface SponsorEligibilityRequest {
  owner: string;
  fromMint: string;
  toMint: string;
  amountRaw: string;
}

export interface AllowedPair {
  from: string;
  to: string;
}

export type SponsorEligibility = { ok: true } | { ok: false; reason: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/403|forbidden|blocked|persona/i.test(msg)) return false;
  return /429|rate.?limit|5\d\d|timeout|timed out|fetch failed|econnreset|enotfound|eai_again|network/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === 5) throw err;
      await sleep(Math.min(500 * 2 ** attempt, 8000));
    }
  }
  throw lastError;
}
async function rawBalanceForProgram(
  connection: Connection,
  owner: PublicKey,
  mint: string,
  programId: PublicKey,
): Promise<bigint> {
  const accounts = await withRetry(() => connection.getParsedTokenAccountsByOwner(owner, { programId }));
  let total = 0n;
  for (const entry of accounts.value) {
    const data = entry.account.data as unknown as {
      parsed?: { info?: { mint?: unknown; tokenAmount?: { amount?: unknown } } };
    };
    const info = data.parsed?.info;
    if (info?.mint !== mint) continue;
    if (typeof info.tokenAmount?.amount !== "string") continue;
    try {
      total += BigInt(info.tokenAmount.amount);
    } catch {
      continue;
    }
  }
  return total;
}

// Full raw balance of a mint: every token account of the owner for that
// mint, summed across the classic Token and Token-2022 programs.
async function fullRawBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const mintString = mint.toBase58();
  let total = 0n;
  total += await rawBalanceForProgram(connection, owner, mintString, TOKEN_PROGRAM);
  total += await rawBalanceForProgram(connection, owner, mintString, TOKEN_2022_PROGRAM);
  return total;
}

export async function checkSponsorEligibility(
  connection: Connection,
  req: SponsorEligibilityRequest,
  allowedPairs: AllowedPair[],
): Promise<SponsorEligibility> {
  const pairOk = allowedPairs.some((p) => p.from === req.fromMint && p.to === req.toMint);
  if (!pairOk) {
    return { ok: false, reason: "conversion pair is not eligible for sponsorship" };
  }

  let ownerKey: PublicKey;
  let mintKey: PublicKey;
  try {
    ownerKey = new PublicKey(req.owner);
    mintKey = new PublicKey(req.fromMint);
    new PublicKey(req.toMint);
  } catch {
    return { ok: false, reason: "invalid owner or mint address" };
  }

  const lamports = await withRetry(() => connection.getBalance(ownerKey, "confirmed"));
  const rentExempt = await withRetry(() => connection.getMinimumBalanceForRentExemption(165));
  if (lamports >= rentExempt + 10_000) {
    return { ok: false, reason: "owner holds enough SOL to pay its own fee" };
  }

  let amount: bigint;
  try {
    amount = BigInt(req.amountRaw);
  } catch {
    return { ok: false, reason: "invalid amountRaw" };
  }

  const full = await fullRawBalance(connection, ownerKey, mintKey);
  if (full <= 0n) {
    return { ok: false, reason: "owner holds no balance of the input mint" };
  }
  if (amount !== full) {
    return { ok: false, reason: "sponsorship covers the full token balance only" };
  }
  return { ok: true };
}
