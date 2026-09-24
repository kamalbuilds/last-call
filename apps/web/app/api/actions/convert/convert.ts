import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { buildSponsoredConversion } from "@lastcall/convert";
import { cosign } from "@lastcall/sponsor";
import { getQuote, getSwapTransaction } from "@fineprint/exec";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

export function loadSponsor(): Keypair | null {
  const encoded = process.env["SPONSOR_SECRET_KEY"];
  if (encoded === undefined || encoded === "") return null;
  const secret = (bs58 as unknown as { decode: (s: string) => Uint8Array }).decode(encoded.trim());
  return Keypair.fromSecretKey(secret);
}

export interface ConversionBuild {
  txBase64: string;
  feePayer: string;
  sponsored: boolean;
}

// Shared by app/api/convert and app/api/actions/convert: sponsor pays and
// co-signs when SPONSOR_SECRET_KEY is set, otherwise the owner pays.
export async function buildConversionTransaction(params: {
  connection: Connection;
  owner: string;
  fromMint: string;
  toMint: string;
  amountRaw: bigint;
}): Promise<ConversionBuild> {
  const { connection, owner, fromMint, toMint, amountRaw } = params;
  let sponsor: Keypair | null;
  try {
    sponsor = loadSponsor();
  } catch {
    throw new Error("sponsor misconfigured");
  }
  if (sponsor !== null) {
    const feePayer = sponsor.publicKey.toBase58();
    const tx = await buildSponsoredConversion({
      connection,
      owner,
      feePayer,
      fromMint,
      toMint,
      amountRaw: amountRaw.toString(),
    });
    const unsignedBase64 = Buffer.from(tx.serialize()).toString("base64");
    const signedBase64 = await cosign(unsignedBase64, sponsor);
    return { txBase64: signedBase64, feePayer, sponsored: true };
  }
  const quote = await getQuote({
    inputMint: fromMint,
    outputMint: toMint,
    amount: amountRaw,
    slippageBps: 300,
  });
  const swap = await getSwapTransaction({ quote, userPublicKey: owner });
  return { txBase64: swap.swapTransaction, feePayer: owner, sponsored: false };
}

async function rawBalanceForProgram(
  connection: Connection,
  owner: PublicKey,
  mint: string,
  programId: PublicKey,
): Promise<bigint> {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { programId });
  let total = 0n;
  for (const entry of accounts.value) {
    const parsed = entry.account.data as unknown as {
      parsed?: { info?: { mint?: unknown; tokenAmount?: { amount?: unknown } } };
    };
    const info = parsed.parsed?.info;
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

// Full wallet balance for a mint across the Token-2022 and classic programs.
export async function readTokenBalanceRaw(
  connection: Connection,
  owner: string,
  mint: string,
): Promise<bigint> {
  const ownerKey = new PublicKey(owner);
  const programs = [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID];
  let total = 0n;
  for (const program of programs) {
    total += await rawBalanceForProgram(connection, ownerKey, mint, new PublicKey(program));
  }
  return total;
}

export async function readMintDecimals(connection: Connection, mint: string): Promise<number> {
  const info = await connection.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const data = info.value?.data as unknown as {
    parsed?: { info?: { decimals?: unknown } };
  } | null;
  const decimals = data?.parsed?.info?.decimals;
  if (typeof decimals !== "number" || !Number.isFinite(decimals)) {
    throw new Error(`mint ${mint} account data is missing decimals`);
  }
  return decimals;
}
