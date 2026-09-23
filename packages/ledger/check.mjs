// Independent post-condition for the ledger. Recomputes XAI numbers from chain + Jupiter and compares.
import { readFileSync } from "node:fs";
const RPC = process.env.SOLANA_RPC_URL ?? "https://solana-rpc.publicnode.com";
const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const L = JSON.parse(readFileSync(new URL("./out/ledger.json", import.meta.url)));
const x = L.tokens?.find((t) => t.mint === XAI);
if (!x) throw new Error("XAI missing from ledger");
if (x.status !== "expired") throw new Error(`XAI status ${x.status}, expected expired (deadline 2026-09-12T23:59Z passed)`);
if (x.deadline !== "2026-09-12T23:59:00Z") throw new Error(`XAI deadline ${x.deadline}`);
const sp = L.tokens.find((t) => t.mint === "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh");
if (!sp || sp.deadline !== "2027-03-12T23:59:00Z" || sp.status !== "converting") throw new Error(`SPACEX row wrong: ${JSON.stringify(sp)}`);
const sup = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [XAI, { encoding: "jsonParsed" }] }) }).then((r) => r.json());
if (!sup.result?.value) throw new Error(`RPC error reading mint: ${JSON.stringify(sup.error)}`);
const { supply: raw, decimals } = sup.result.value.data.parsed.info;
const supply = Number(raw) / 10 ** decimals;
const h = (await fetch(`https://datapi.jup.ag/v1/holders/${XAI}`).then((r) => r.json())).holders;
const pool = h.filter((a) => a.tags?.some((t) => t.id === "Pool")).reduce((s, a) => s + a.amount, 0);
const expectWallets = supply - pool;
const rel = Math.abs(x.unconvertedInWallets - expectWallets) / expectWallets;
if (!(rel < 0.02)) throw new Error(`unconvertedInWallets ${x.unconvertedInWallets} vs independent ${expectWallets.toFixed(2)}`);
if (!Array.isArray(x.holders) || x.holders.length < 50) throw new Error("XAI holders list too short");
if (x.holders.some((a) => a.address === "8rFjXknJvC225QZqKZtohSnwpL3ZeocNiVDs8tpfUiR8")) throw new Error("pool listed as a holder");
console.log(`ok: XAI unconverted ${x.unconvertedInWallets.toFixed(2)} (independent ${expectWallets.toFixed(2)}), usd ${Math.round(x.unconvertedUsd)}, holders listed ${x.holders.length}`);
