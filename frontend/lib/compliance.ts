import { Connection, PublicKey } from "@solana/web3.js";
import type { UniverseMint } from "@lastcall/events";
import { getUniverse } from "@/lib/universe";
import { termsRpcUrl } from "@/lib/terms";

const TTL_MS = 5 * 60 * 1000;

export interface ComplianceRow {
  symbol: string;
  mint: string;
  issuer: UniverseMint["issuer"];
  mintAuthority: string | null;
  freezeAuthority: string | null;
  permanentDelegate: string | null;
  pausableAuthority: string | null;
  /** null when the mint has no pausable extension. */
  paused: boolean | null;
  transferHookAuthority: string | null;
  transferHookProgram: string | null;
  /** "initialized", "frozen", or null without the extension. */
  defaultAccountState: string | null;
  /** Higher means more issuer control over a holder's tokens. Paused dominates. */
  riskScore: number;
  flags: string[];
}

export interface ComplianceReport {
  readAtSlot: number;
  readAt: string;
  rows: ComplianceRow[];
  /** Mints in the universe that the RPC returned no Token-2022 account for. */
  missing: string[];
}

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function ext(extensions: unknown, name: string): Json | null {
  if (!Array.isArray(extensions)) return null;
  const hit = extensions.find((e) => (e as Json)?.["extension"] === name) as Json | undefined;
  return hit === undefined ? null : ((hit["state"] as Json | undefined) ?? {});
}

function score(r: Omit<ComplianceRow, "riskScore" | "flags">): { riskScore: number; flags: string[] } {
  const flags: string[] = [];
  let s = 0;
  if (r.paused === true) { s += 100; flags.push("PAUSED"); }
  if (r.defaultAccountState === "frozen") { s += 25; flags.push("NEW ACCOUNTS FROZEN"); }
  if (r.permanentDelegate !== null) { s += 30; flags.push("PERMANENT DELEGATE"); }
  if (r.freezeAuthority !== null) { s += 20; flags.push("FREEZE"); }
  if (r.transferHookProgram !== null) { s += 20; flags.push("TRANSFER HOOK"); }
  else if (r.transferHookAuthority !== null) { s += 5; flags.push("HOOK SETTABLE"); }
  if (r.pausableAuthority !== null) { s += 10; flags.push("PAUSABLE"); }
  if (r.mintAuthority !== null) { s += 10; flags.push("MINTABLE"); }
  const keys = [r.mintAuthority, r.freezeAuthority, r.permanentDelegate, r.pausableAuthority, r.transferHookAuthority];
  const held = keys.filter((k) => k !== null);
  if (held.length >= 3 && new Set(held).size === 1) { s += 15; flags.unshift("ONE KEY HOLDS ALL"); }
  return { riskScore: s, flags };
}

let cache: { at: number; value: ComplianceReport } | null = null;

/** Decodes issuer controls for every tracked mint straight from the live Token-2022 account. */
export async function getCompliance(): Promise<ComplianceReport> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.value;
  const universe = await getUniverse();
  const conn = new Connection(termsRpcUrl(), "confirmed");
  const rows: ComplianceRow[] = [];
  const missing: string[] = [];
  let slot = 0;
  for (let i = 0; i < universe.length; i += 100) {
    const group = universe.slice(i, i + 100);
    const res = await conn.getMultipleParsedAccounts(group.map((m) => new PublicKey(m.mint)), { commitment: "confirmed" });
    slot = Math.max(slot, res.context.slot);
    group.forEach((m, j) => {
      const data = res.value[j]?.data;
      const parsed = data !== undefined && !Buffer.isBuffer(data) ? (data as { program?: string; parsed?: Json }) : null;
      const info = parsed?.program === "spl-token-2022" ? (parsed.parsed?.["info"] as Json | undefined) : undefined;
      if (info === undefined) { missing.push(m.mint); return; }
      const extensions = info["extensions"];
      const pausable = ext(extensions, "pausableConfig");
      const hook = ext(extensions, "transferHook");
      const base = {
        symbol: m.symbol,
        mint: m.mint,
        issuer: m.issuer,
        mintAuthority: str(info["mintAuthority"]),
        freezeAuthority: str(info["freezeAuthority"]),
        permanentDelegate: str(ext(extensions, "permanentDelegate")?.["delegate"]),
        pausableAuthority: str(pausable?.["authority"]),
        paused: pausable === null ? null : pausable["paused"] === true,
        transferHookAuthority: str(hook?.["authority"]),
        transferHookProgram: str(hook?.["programId"]),
        defaultAccountState: str(ext(extensions, "defaultAccountState")?.["accountState"]),
      };
      rows.push({ ...base, ...score(base) });
    });
  }
  rows.sort((a, b) => b.riskScore - a.riskScore || a.symbol.localeCompare(b.symbol));
  const value: ComplianceReport = { readAtSlot: slot, readAt: new Date().toISOString(), rows, missing };
  cache = { at: Date.now(), value };
  return value;
}
