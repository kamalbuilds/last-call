import { withApp, text } from "./serve.mjs";
const SPX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
await withApp("@lastcall/web", 3155, async (get) => {
  const t = await (await get(`/api/terms?mint=${SPX}`)).json();
  if (t.transferFeeBps !== 100 || t.feeInForce !== true) throw new Error(`fee must be read live: 100 bps in force; got ${JSON.stringify(t).slice(0, 200)}`);
  if (t.permanentDelegate !== "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc" || t.paused !== false) throw new Error("permanentDelegate and paused must come from the mint");
  if (!(t.multiplier > 1) || !t.readAtSlot) throw new Error("multiplier and readAtSlot required");
  const page = text(await (await get("/?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb")).text());
  if (!/Permanent delegate/i.test(page) || !/(100 bps|1% transfer fee)/i.test(page) || !/read on-chain/i.test(page)) throw new Error("holding card must show the live terms panel (permanent delegate, fee, 'read on-chain')");
  console.log(`ok: terms read at slot ${t.readAtSlot}: fee ${t.transferFeeBps} bps, delegate, paused=${t.paused}, multiplier ${t.multiplier}`);
});
