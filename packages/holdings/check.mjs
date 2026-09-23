// Independent check for wallet holdings lookup. Owned by the orchestrator.
const { getHoldings } = await import("./src/index.ts");
const OWNER = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";
const h = await getHoldings(OWNER);
const x = h.find((r) => r.mint === "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx");
if (!x) throw new Error("XAI holding not found for known holder");
if (Math.abs(x.amount - 139.01841252) > 0.001) throw new Error(`amount ${x.amount}, chain says 139.01841252`);
if (x.status !== "expired") throw new Error(`status ${x.status}`);
if (!(x.quote?.outAmountUi > 50 && x.quote.outAmountUi < 100.5)) throw new Error(`quote for full balance into SPACEX looks wrong: ${JSON.stringify(x.quote)}`);
if (!(x.quote.priceImpactPct >= 0) || !(x.quote.transferFeeBps === 100)) throw new Error(`quote must carry priceImpactPct and transferFeeBps=100: ${JSON.stringify(x.quote)}`);
const empty = await getHoldings("11111111111111111111111111111111");
if (empty.length !== 0) throw new Error("system program should hold no PreStocks");
console.log(`ok: XAI ${x.amount} ${x.status}; converts to ${x.quote.outAmountUi} SPACEX, impact ${x.quote.priceImpactPct}%`);
