import { Connection, PublicKey } from "@solana/web3.js";
import { decodeMint } from "@fineprint/core";

export const TERMS_DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

export function termsRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? TERMS_DEFAULT_RPC_URL;
}

export interface TermsJson {
  mint: string;
  transferFeeBps: number;
  /** A scheduled tier that has not activated yet; null when none is pending. */
  pendingBps: number | null;
  pendingActivationEpoch: number | null;
  permanentDelegate: string | null;
  paused: boolean;
  multiplier: number;
  freezeAuthority: string | null;
  readAtSlot: number;
}

function freezeAuthorityFromParsed(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || Buffer.isBuffer(data)) return null;
  const record = data as Record<string, unknown>;
  const parsed = record["parsed"];
  if (typeof parsed !== "object" || parsed === null) return null;
  const info = (parsed as Record<string, unknown>)["info"];
  if (typeof info !== "object" || info === null) return null;
  const freeze = (info as Record<string, unknown>)["freezeAuthority"];
  return typeof freeze === "string" ? freeze : null;
}

/** Live Token-2022 terms for a mint, decoded with packages/core. */
export async function readTerms(mint: string): Promise<TermsJson> {
  const connection = new Connection(termsRpcUrl(), "confirmed");
  const key = new PublicKey(mint);
  const [facts, parsed] = await Promise.all([
    decodeMint(mint, mint, connection),
    connection.getParsedAccountInfo(key, "confirmed"),
  ]);
  return {
    mint,
    transferFeeBps: facts.transferFee.currentBps,
    pendingBps: facts.transferFee.pendingBps ?? null,
    pendingActivationEpoch: facts.transferFee.pendingActivationEpoch ?? null,
    permanentDelegate: facts.powers.permanentDelegate,
    paused: facts.powers.paused,
    multiplier: facts.scaledUiAmount?.operativeMultiplier ?? 1,
    freezeAuthority: freezeAuthorityFromParsed(parsed.value),
    readAtSlot: facts.slot,
  };
}
