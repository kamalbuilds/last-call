// Independent check, round 2. Owned by the orchestrator.
import { spawn, execSync } from "node:child_process";
import { renameSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../packages/exec/package.json", import.meta.url));
const { Keypair, VersionedTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const OUT = new URL("../packages/ledger/out/ledger.json", import.meta.url);
const HID = new URL("../packages/ledger/out/ledger.hidden.json", import.meta.url);
const OWNER = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";
if (existsSync(OUT)) renameSync(OUT, HID);
const sponsor = Keypair.generate();
execSync("pnpm --filter @lastcall/web build", { stdio: "ignore" });
const env = { ...process.env, SPONSOR_SECRET_KEY: (bs58.default ?? bs58).encode(sponsor.secretKey) };
const srv = spawn("pnpm", ["--filter", "@lastcall/web", "exec", "next", "start", "--port", "3108"], { stdio: "ignore", detached: true, env });
const get = async (p) => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:3108${p}`); return r; } catch { await new Promise((r) => setTimeout(r, 1000)); } } throw new Error(`no answer ${p}`); };
try {
  const ledger = await (await get("/ledger")).text();
  if (!ledger.includes("GATE CLOSED") || !ledger.includes("XAI")) throw new Error("ledger not computed live without the out file");
  if (/packages\//.test(ledger)) throw new Error("internal file path shown to users");
  if ((ledger.match(/expired \d+ days? ago/g) ?? []).length > 1) throw new Error("expired text duplicated in XAI row");
  const home = await (await get("/")).text();
  if (!/<input[^>]*(wallet|address)/i.test(home)) throw new Error("home has no wallet address lookup input");
  const w = await (await get(`/?wallet=${OWNER}`)).text();
  if (!w.includes("139.0")) throw new Error("home ?wallet= lookup does not render the holder's XAI balance server-side");
  const cj = await (await fetch("http://127.0.0.1:3108/api/convert", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner: OWNER, fromMint: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx", amountRaw: "1000000000" }) })).json();
  if (!cj.sponsored) throw new Error(`convert not sponsored though SPONSOR_SECRET_KEY set: ${JSON.stringify(cj).slice(0, 200)}`);
  const tx = VersionedTransaction.deserialize(Buffer.from(cj.txBase64, "base64"));
  if (!tx.message.staticAccountKeys[0].equals(sponsor.publicKey)) throw new Error("fee payer is not the sponsor");
  if (!tx.signatures[0].some((b) => b !== 0)) throw new Error("sponsor signature missing");
  console.log("ok: live ledger, wallet lookup, sponsored and co-signed convert");
} finally { try { process.kill(-srv.pid); } catch {} if (existsSync(HID)) renameSync(HID, OUT); }
