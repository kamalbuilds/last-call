// Independent check: every live Pyth price on /inbox must match a direct Hermes call within 0.5%,
// and every feed the page calls "not entitled" must really be refused by Hermes for our key.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { withApp } from "./serve.mjs";
const KEY = process.env.PYTH_API_KEY ?? parseEnv(readFileSync(new URL("../.env", import.meta.url), "utf8")).PYTH_API_KEY;
if (!KEY) throw new Error("PYTH_API_KEY missing from env and ../.env");
const hermes = async (id) => {
  const r = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}&parsed=true&encoding=hex`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) return { status: r.status, body: await r.text() };
  const p = (await r.json()).parsed[0].price;
  return { status: 200, price: Number(p.price) * 10 ** p.expo, publish: p.publish_time };
};
await withApp("@lastcall/web", 3161, async (get) => {
  const api = await (await get("/api/pyth")).json();
  const html = await (await get("/inbox")).text();
  const rows = [...html.matchAll(/data-pyth-row="([^"]+)" data-feed="([^"]+)" data-status="([^"]+)"[\s\S]*?data-pyth-price="([^"]*)"/g)].map((m) => ({ symbol: m[1], feed: m[2], status: m[3], price: m[4] === "" ? null : Number(m[4]) }));
  const live = rows.filter((r) => r.status === "live");
  if (live.length === 0) throw new Error("no live Pyth row on /inbox; a check with nothing to compare cannot pass");
  for (const r of live) {
    const id = api.rows.find((a) => a.feedSymbol === r.feed)?.feedId;
    const d = await hermes(id);
    if (d.status !== 200) throw new Error(`${r.feed}: page says live but Hermes returned ${d.status}`);
    const diff = Math.abs(r.price - d.price) / d.price;
    if (!(diff < 0.005)) throw new Error(`${r.symbol} ${r.feed}: page ${r.price} vs Hermes ${d.price} (${(diff * 100).toFixed(3)}%)`);
    console.log(`  ${r.symbol} ${r.feed}: page ${r.price.toFixed(4)} Hermes ${d.price.toFixed(4)} diff ${(diff * 100).toFixed(4)}% published ${new Date(d.publish * 1000).toISOString()}`);
  }
  const spcx = rows.filter((r) => r.feed === "Equity.US.SPCX/USD");
  if (spcx.length === 0) throw new Error("SPACEX/SPCXx row for Equity.US.SPCX/USD missing from /inbox");
  for (const r of spcx) {
    const id = api.rows.find((a) => a.feedSymbol === r.feed).feedId;
    const d = await hermes(id);
    const truth = d.status === 200 ? "live" : /Not entitled/i.test(d.body ?? "") ? "not_entitled" : `http ${d.status}`;
    if (truth !== r.status) throw new Error(`${r.symbol} ${r.feed}: page says ${r.status}, Hermes says ${truth}`);
    if (r.status !== "live" && r.price !== null) throw new Error(`${r.symbol}: price shown for a feed that is not live`);
  }
  if (!/Not entitled on the current Pyth plan/.test(html)) throw new Error("not-entitled rows must say so on the row");
  console.log(`ok: ${live.length} live Pyth feeds match Hermes within 0.5% (${live.map((r) => r.feed).join(", ")}); SPCX rows ${spcx.map((r) => `${r.symbol}=${r.status}`).join(", ")} match Hermes`);
});
