import { withApp } from "./serve.mjs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../packages/exec/package.json", import.meta.url));
const { VersionedTransaction } = require("@solana/web3.js");
const HOLDER = "7b1HZeYmCch1caRxMN546FC6cN4PE5SE6fLBvhnVXHZz"; // real SPACEX holder with 0 SOL
await withApp("@lastcall/web", 3154, async (get) => {
  const aj = await (await get("/actions.json")).json();
  if (!aj.rules?.some((r) => /api\/actions/.test(r.apiPath ?? r.pathPattern ?? ""))) throw new Error("actions.json must map to /api/actions/*");
  const r = await get("/api/actions/convert?token=XAI");
  if (r.headers.get("access-control-allow-origin") !== "*") throw new Error("Actions endpoints need CORS *");
  const meta = await r.json();
  if (!meta.icon || !meta.title || !meta.label || !meta.links?.actions?.length) throw new Error(`GET must return Solana Action metadata: ${JSON.stringify(meta).slice(0, 200)}`);
  const post = await (await get("/api/actions/convert?token=XAI")).ok;
  const res = await fetch("http://127.0.0.1:3154/api/actions/convert?token=XAI&amount=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "6GJbPKBtovsrMEEMcic5KMi5tswh9qSyT5ZYLMqEwNgt" }) });
  const pj = await res.json();
  if (!pj.transaction) throw new Error(`POST must return {transaction}: ${JSON.stringify(pj).slice(0, 200)}`);
  const tx = VersionedTransaction.deserialize(Buffer.from(pj.transaction, "base64"));
  const sim = await (await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "simulateTransaction", params: [pj.transaction, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true }] }) })).json();
  if (sim.result?.value?.err) throw new Error(`blink conversion simulation failed: ${JSON.stringify(sim.result.value.err)}`);
  if (!sim.result?.value) throw new Error(`simulate RPC error ${JSON.stringify(sim.error)}`);
  console.log(`ok: actions.json, CORS, metadata "${meta.title}", POST tx simulates on mainnet (${sim.result.value.unitsConsumed} CU), payer ${tx.message.staticAccountKeys[0].toBase58().slice(0, 6)}`);
});
