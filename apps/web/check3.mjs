// Independent check, round 3 (holdings presentation). Owned by the orchestrator.
import { spawn, execSync } from "node:child_process";
execSync("pnpm --filter @lastcall/web build", { stdio: "ignore" });
const srv = spawn("pnpm", ["--filter", "@lastcall/web", "exec", "next", "start", "--port", "3109"], { stdio: "ignore", detached: true });
try {
  let html;
  for (let i = 0; i < 60 && !html; i++) { try { html = await (await fetch("http://127.0.0.1:3109/?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb")).text(); } catch { await new Promise((r) => setTimeout(r, 1000)); } }
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const iX = text.indexOf("XAI"), iA = text.indexOf("ANDURIL");
  if (!(iX >= 0 && iA >= 0 && iX < iA)) throw new Error("expired XAI must be listed before private tokens");
  if (/Converts into Pre[A-Za-z0-9]{2}\.\.\./.test(text) || /Converts into Xs3o/.test(text)) throw new Error("conversion target shown as a mint address, not a symbol");
  if (!/Converts into SPACEX/.test(text)) throw new Error("XAI row must say Converts into SPACEX");
  if (!/97\.\d+\s*SPACEX/.test(text)) throw new Error("receive amount must carry its unit, e.g. 97.63 SPACEX");
  if (/SPACEX\s*×\s*0\.00\b/.test(text)) throw new Error("dust balance shown as 0.00");
  console.log("ok: urgent-first ordering, symbols not mints, units on amounts, no 0.00 dust rows");
} finally { try { process.kill(-srv.pid); } catch {} }
