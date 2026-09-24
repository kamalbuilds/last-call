import { withApp, text } from "./serve.mjs";
const SPX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", SPC = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const p = await (await fetch(`https://lite-api.jup.ag/price/v3?ids=${SPX},${SPC}`)).json();
const liveGap = (1 - p[SPX].usdPrice / p[SPC].usdPrice) * 100;
await withApp("@lastcall/web", 3152, async (get) => {
  const h = await (await get("/api/gap-history")).json();
  const pts = h.points ?? [];
  if (pts.length < 60) throw new Error(`need >= 60 daily points since IPO, got ${pts.length}`);
  if (!pts.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(x.gapPct))) throw new Error("points must be {date:YYYY-MM-DD, gapPct:number}");
  if (!(pts[0].date >= "2026-06-12")) throw new Error("history must start at or after IPO 2026-06-12");
  if (Math.abs(h.currentGapPct - liveGap) > 3) throw new Error(`currentGapPct ${h.currentGapPct} vs independent ${liveGap.toFixed(2)}`);
  const page = await (await get("/ledger")).text();
  if (!/data-gap-chart/.test(page) || !/Convert now|Wait/i.test(text(page))) throw new Error("ledger needs a gap chart (data-gap-chart) and a convert-now-or-wait signal");
  console.log(`ok: ${pts.length} daily points, current gap ${h.currentGapPct.toFixed(2)}% vs independent ${liveGap.toFixed(2)}%`);
});
