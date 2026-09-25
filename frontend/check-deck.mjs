// Independent check for the /pitch deck. Owned by the orchestrator.
import { withApp, text } from "./serve.mjs";
await withApp("@lastcall/web", 3158, async (get) => {
  const html = await (await get("/pitch")).text();
  const slides = (html.match(/data-slide=/g) ?? []).length;
  if (slides < 8) throw new Error(`need >= 8 slides marked data-slide, got ${slides}`);
  if (!/ArrowRight|keydown/.test(html) && !/data-deck-nav/.test(html)) throw new Error("deck needs keyboard navigation (ArrowRight/keydown) or data-deck-nav");
  if (/—|&mdash;/.test(html)) throw new Error("em dash in deck");
  const live = await (await get("/api/terms?mint=PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh")).json();
  const v = String(live.transferFeeBps + " bps");
  if (!text(html).includes(v)) throw new Error(`deck must show the live figure ${v} from /api/terms?mint=PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh`);
  console.log(`ok: ${slides} slides, keyboard nav, live figure ${v}`);
});
