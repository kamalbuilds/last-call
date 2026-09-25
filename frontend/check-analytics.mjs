// Independent check: /analytics holder bars must equal a direct RPC count of non-zero Token-2022 accounts,
// and the conversion chart must plot every /api/conversions trade with a median shortfall recomputed here.
import { withApp } from "./serve.mjs";
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const MINTS = { XAI: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx", SPACEX: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh" };
async function holders(mint) {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getProgramAccounts", params: ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", { encoding: "base64", dataSlice: { offset: 64, length: 8 }, filters: [{ memcmp: { offset: 0, bytes: mint } }] }] }) })).json();
  if (r.error) throw new Error(`RPC ${JSON.stringify(r.error)}`);
  return r.result.filter((a) => Buffer.from(a.account.data[0], "base64").readBigUInt64LE(0) > 0n).length;
}
await withApp("@lastcall/web", 3163, async (get) => {
  const html = await (await get("/analytics")).text();
  if (!/data-gap-chart/.test(html) || !/<svg[\s\S]*?<polyline/.test(html)) throw new Error("gap history chart missing");
  for (const [sym, mint] of Object.entries(MINTS)) {
    const m = html.match(new RegExp(`data-bar="holders" data-label="${sym}" data-value="(\\d+)"`));
    if (!m) throw new Error(`no holder bar for ${sym}`);
    const rpc = await holders(mint), page = Number(m[1]);
    if (Math.abs(page - rpc) / rpc > 0.01) throw new Error(`${sym} holders: page ${page} vs RPC ${rpc}`);
    console.log(`  ${sym} holders: page ${page}, RPC non-zero accounts ${rpc}`);
  }
  const c = await (await get("/api/conversions?token=XAI")).json();
  const dots = (html.match(/data-ratio-chart[\s\S]*?<\/svg>/)?.[0].match(/<circle/g) ?? []).length;
  if (c.trades.length === 0 || dots !== c.trades.length) throw new Error(`chart plots ${dots} trades, API has ${c.trades.length}`);
  const s = c.trades.map((t) => (1 - t.spacexOut / t.xaiIn / 0.7165) * 100).sort((a, b) => a - b), h = s.length >> 1;
  const med = s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  const shown = Number(html.match(/data-median-shortfall="([^"]+)"/)?.[1]);
  if (!(Math.abs(shown - med) < 0.01)) throw new Error(`median shortfall on page ${shown} vs recomputed ${med.toFixed(2)}`);
  console.log(`ok: holder bars match RPC, ${dots} conversions plotted, median shortfall ${shown}% recomputed from raw amounts`);
});
