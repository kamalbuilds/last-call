// Independent check, round 5 (rebuild). Owned by the orchestrator. Needs bhn deepsurge running (CDP_PORT default 9396).
import { spawn, execSync } from "node:child_process";
const PORT = 3111, CDP = process.env.CDP_PORT ?? "9396", W = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";
execSync("pnpm --filter @lastcall/web build", { stdio: "ignore" });
const srv = spawn("pnpm", ["--filter", "@lastcall/web", "exec", "next", "start", "--port", String(PORT)], { stdio: "ignore", detached: true });
const page = async (p) => { for (let i = 0; i < 60; i++) { try { return await (await fetch(`http://127.0.0.1:${PORT}${p}`)).text(); } catch { await new Promise((r) => setTimeout(r, 1000)); } } throw new Error(`no answer ${p}`); };
async function inBrowser(url, width, expr) {
  const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
  await send("Page.reload"); await new Promise((r) => setTimeout(r, 5000));
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  ws.close(); await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`);
  return r.result.result.value;
}
const YELLOW = `(() => { let t = 0, y = 0; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue; const m = cs.color.match(/\\d+(\\.\\d+)?/g).map(Number); const [r, g, b] = m; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const s = mx ? (mx - mn) / mx : 0; let h = 0; if (mx !== mn) { if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2); else h = 60 * ((r - g) / (mx - mn) + 4); } if (h < 0) h += 360; t++; if (h >= 30 && h <= 60 && s > 0.35) y++; } return { t, y }; })()`;
try {
  const ledger = await page("/ledger");
  const links = (ledger.match(/https:\/\/solscan\.io\/account\/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []).length;
  if (links < 10) throw new Error(`wallet addresses must link to Solscan; found ${links}`);
  if (/hold no SOL to pay fees with, so those holders\s+cannot pay/i.test(ledger)) throw new Error("blanket 'cannot pay fees' claim still present");
  if (!/<svg[\s\S]{0,4000}?(deadline|Deadline)/.test(ledger)) throw new Error("no deadline timeline SVG on ledger");
  for (const [p, w] of [["/ledger", 1440], ["/ledger", 375], [`/?wallet=${W}`, 1440]]) {
    const { t, y } = await inBrowser(`http://127.0.0.1:${PORT}${p}`, w, YELLOW);
    if (!t) throw new Error(`${p} rendered no text`);
    if (y / t > 0.10) throw new Error(`${p} at ${w}px: ${y}/${t} text elements are yellow/amber (>10%)`);
  }
  const home = await page(`/?wallet=${W}`);
  if (!home.includes(`https://solscan.io/account/${W}`)) throw new Error("looked-up wallet must link to Solscan");
  console.log(`ok: ${links} Solscan wallet links, timeline SVG, yellow text under 10% at 1440 and 375, corrected fee copy`);
} finally { try { process.kill(-srv.pid); } catch {} }
