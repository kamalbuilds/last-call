// Independent check, round 4 (redesign). Owned by the orchestrator. Needs bhn deepsurge running (CDP port env CDP_PORT, default 9396).
import { spawn, execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const APP = new URL(".", import.meta.url).pathname;
const PORT = 3110, CDP = process.env.CDP_PORT ?? "9396", W = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";
execSync("pnpm --filter @lastcall/web build", { stdio: "ignore" });
const srv = spawn("pnpm", ["--filter", "@lastcall/web", "exec", "next", "start", "--port", String(PORT)], { stdio: "ignore", detached: true });
const page = async (p) => { for (let i = 0; i < 60; i++) { try { return await (await fetch(`http://127.0.0.1:${PORT}${p}`)).text(); } catch { await new Promise((r) => setTimeout(r, 1000)); } } throw new Error(`no answer ${p}`); };
const txt = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function overflowAt(url, width) {
  const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: true });
  await send("Page.reload"); await new Promise((r) => setTimeout(r, 4000));
  const r = await send("Runtime.evaluate", { expression: "document.documentElement.scrollWidth", returnByValue: true });
  ws.close(); await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`);
  return r.result.result.value;
}
try {
  const L = JSON.parse(await page("/api/ledger")); const xai = L.tokens.find((t) => t.symbol === "XAI");
  const k = `$${Math.round(xai.unconvertedUsd / 1000)}k`;
  const ledger = txt(await page("/ledger")); const home = await page(`/?wallet=${W}`); const homeT = txt(home);
  if (!ledger.includes(k) || !/stranded/i.test(ledger)) throw new Error(`ledger headline must state "${k}" stranded`);
  if (!/awaiting IPO/i.test(ledger)) throw new Error('private tokens must collapse into an "awaiting IPO" group');
  if ((homeT.match(/No live quote right now/g) ?? []).length > 0) throw new Error("repeated 'No live quote right now' boilerplate");
  if (!/<button[^>]*>[^<]*(Convert|CONVERT)/.test(home) && !/Convert[^<]{0,40}<\/button>/.test(home)) throw new Error("XAI card has no Convert button");
  if (!home.includes("phantom.app/ul/browse/")) throw new Error("no Phantom mobile deep link in connect area");
  for (const [p, w] of [["/ledger", 375], [`/?wallet=${W}`, 375]]) {
    const sw = await overflowAt(`http://127.0.0.1:${PORT}${p}`, w);
    if (sw > w + 1) throw new Error(`${p} overflows at ${w}px: scrollWidth ${sw}`);
  }
  const src = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (["node_modules", ".next"].includes(f)) continue; statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && src.push(readFileSync(p, "utf8")); } };
  walk(join(APP, "app")); walk(join(APP, "components"));
  const all = src.join("\n");
  if (/@keyframes|animation:|motion\//.test(all) && !/prefers-reduced-motion/.test(all)) throw new Error("animation without prefers-reduced-motion");
  if (!/flip|flap/i.test(all)) throw new Error("no split-flap countdown found");
  execSync("uicraft gate --cwd " + APP, { stdio: "ignore" });
  console.log(`ok: headline ${k} stranded, awaiting-IPO group, Convert button, Phantom deep link, no overflow at 375, reduced-motion, gate clean`);
} finally { try { process.kill(-srv.pid); } catch {} }
