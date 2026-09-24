import { withApp, text } from "./serve.mjs";
await withApp("@lastcall/web", 3151, async (get) => {
  const w = text(await (await get("/inbox?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb")).text());
  if (!/XAI/.test(w) || !/expired/i.test(w) || !/139\.0/.test(w)) throw new Error("inbox must show the wallet's expired XAI conversion (139.0x)");
  const feed = text(await (await get("/inbox")).text());
  if (!/QQQx/.test(feed) || !/2026-09-19/.test(feed)) throw new Error("universe feed must show QQQx dividend on 2026-09-19 read from chain");
  if (!/OPENAI/.test(feed) || !/100 ?bps|1(\.0+)?%/.test(feed)) throw new Error("feed must show the OPENAI transfer-fee change to 100 bps / 1%");
  const r = await get("/api/inbox.ics?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb");
  const ics = await r.text();
  if (!/text\/calendar/.test(r.headers.get("content-type") ?? "") || !/BEGIN:VEVENT/.test(ics) || !/BEGIN:VALARM/.test(ics)) throw new Error("ics endpoint must return text/calendar with VEVENT and VALARM");
  console.log("ok: inbox wallet view, universe feed (QQQx 2026-09-19, OPENAI fee), ics export");
});
