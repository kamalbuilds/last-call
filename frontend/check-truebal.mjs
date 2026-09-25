import { withApp, text } from "./serve.mjs";
const OWNER = "DrAR2ZNC5KYZps7NJyYHfzeZTaqbMUaGM3CBUWfpbCUs";
await withApp("@lastcall/web", 3157, async (get) => {
  const r = await (await get(`/api/true-balance?owner=${OWNER}`)).json();
  const spy = r.holdings?.find((h) => h.symbol === "SPYx");
  if (!spy || !(spy.raw > 0) || !(spy.multiplier > 1) || Math.abs(spy.trueBalance - spy.raw * spy.multiplier) > 1e-6 * spy.trueBalance) throw new Error(`SPYx true balance must be raw x in-force multiplier: ${JSON.stringify(spy)}`);
  if (!(spy.gainFromDividendsPct > 0)) throw new Error("must show cumulative gain from reinvested dividends");
  const page = text(await (await get(`/inbox?wallet=${OWNER}`)).text());
  if (!/true balance/i.test(page) || !/SPYx/.test(page)) throw new Error("inbox must show the true balance panel for the wallet's xStocks");
  console.log(`ok: SPYx raw ${spy.raw}, multiplier ${spy.multiplier}, true ${spy.trueBalance}, +${spy.gainFromDividendsPct}% from dividends`);
});
