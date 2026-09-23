// Independent check for the LAST CALL web app. Owned by the orchestrator.
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
execSync("pnpm --filter @lastcall/web build", { stdio: "ignore" });
const srv = spawn("pnpm", ["--filter", "@lastcall/web", "exec", "next", "start", "--port", "3107"], { stdio: "ignore", detached: true });
const stop = () => { try { process.kill(-srv.pid); } catch {} };
try {
  let html;
  for (let i = 0; i < 40; i++) { try { html = await (await fetch("http://127.0.0.1:3107/ledger")).text(); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
  if (!html) throw new Error("server never answered /ledger");
  const L = JSON.parse(readFileSync(new URL("../../packages/ledger/out/ledger.json", import.meta.url)));
  const xai = L.tokens.find((t) => t.symbol === "XAI");
  const shown = Math.round(xai.unconvertedInWallets).toLocaleString("en-US");
  for (const needle of ["XAI", "SPACEX", shown]) if (!html.includes(needle)) throw new Error(`/ledger missing "${needle}"`);
  if (!/expired/i.test(html)) throw new Error("/ledger does not show XAI as expired");
  if (/fineprint/i.test(html)) throw new Error("old FINEPRINT branding still rendered");
  const home = await (await fetch("http://127.0.0.1:3107/")).text();
  if (!/connect/i.test(home)) throw new Error("home page has no wallet connect");
  const api = await (await fetch("http://127.0.0.1:3107/api/holdings?owner=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb")).json();
  if (!Array.isArray(api) || !api.some((r) => r.symbol === "XAI")) throw new Error(`/api/holdings wrong: ${JSON.stringify(api).slice(0, 200)}`);
  const conv = await fetch("http://127.0.0.1:3107/api/convert", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner: "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb", fromMint: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx", amountRaw: "1000000000" }) });
  const cj = await conv.json();
  if (!cj.txBase64) throw new Error(`/api/convert returned no transaction: ${JSON.stringify(cj).slice(0, 200)}`);
  console.log(`ok: /ledger shows XAI expired with ${shown} unconverted; holdings and convert APIs answer`);
} finally { stop(); }
