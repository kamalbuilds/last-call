import { withApp, text } from "./serve.mjs";
import { readFileSync } from "node:fs";
const proof = JSON.parse(readFileSync(new URL("./public/proof.json", import.meta.url)));
if (!(proof.checks?.length >= 5) || !proof.checks.every((c) => c.ok && c.output && c.ranAt)) throw new Error("public/proof.json must hold >= 5 checks, each ok with output and ranAt");
await withApp("@lastcall/web", 3153, async (get) => {
  const t = text(await (await get("/proof")).text());
  for (const c of proof.checks) if (!t.includes(c.name)) throw new Error(`/proof missing ${c.name}`);
  if (!/solscan\.io|explorer\.solana\.com/.test(await (await get("/proof")).text())) throw new Error("/proof needs explorer links for the accounts involved");
  console.log(`ok: /proof renders ${proof.checks.length} checks`);
});
