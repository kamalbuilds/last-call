import { withApp, text } from "./serve.mjs";
await withApp("@lastcall/web", 3156, async (get) => {
  const r = await (await get("/api/conversions?token=XAI")).json();
  const trades = r.trades ?? [];
  if (trades.length < 5) throw new Error(`need >= 5 real XAI->SPACEX conversion trades, got ${trades.length}`);
  const sample = trades[0];
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(sample.signature)) throw new Error("each trade needs a real tx signature");
  const tx = await (await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sample.signature, { maxSupportedTransactionVersion: 0 }] }) })).json();
  if (!tx.result) throw new Error(`signature ${sample.signature} not found on mainnet`);
  if (!trades.every((t) => Number.isFinite(t.realizedRatio) && Number.isFinite(t.shortfallPct) && t.wallet)) throw new Error("trades need wallet, realizedRatio, shortfallPct vs the 0.7165 conversion ratio");
  const page = text(await (await get("/ledger")).text());
  if (!/real conversions/i.test(page) || !page.includes(sample.signature.slice(0, 8))) throw new Error("ledger must show the real conversions section with Solscan-linked signatures");
  console.log(`ok: ${trades.length} real XAI conversions, first ${sample.signature.slice(0, 10)} verified on mainnet, median shortfall ${r.medianShortfallPct}%`);
});
