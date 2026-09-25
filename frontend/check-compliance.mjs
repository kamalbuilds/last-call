// Independent check: re-decode every tracked mint's raw Token-2022 bytes from RPC (no jsonParsed, no app code)
// and require /compliance to show the same freeze authority, permanent delegate and paused state.
import bs58 from "bs58";
import { withApp } from "./serve.mjs";
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const pk = (b) => bs58.encode(b);
const zero = (b) => b.every((x) => x === 0);
function decode(buf) {
  const freeze = buf.readUInt32LE(46) === 1 ? pk(buf.subarray(50, 82)) : "none";
  let delegate = "none", paused = "n/a";
  for (let o = 166; o + 4 <= buf.length; ) {
    const type = buf.readUInt16LE(o), len = buf.readUInt16LE(o + 2), v = buf.subarray(o + 4, o + 4 + len);
    if (type === 0) break;
    if (type === 12 && !zero(v.subarray(0, 32))) delegate = pk(v.subarray(0, 32));
    if (type === 26) paused = String(v[32] === 1);
    o += 4 + len;
  }
  return { freeze, delegate, paused };
}
await withApp("@lastcall/web", 3162, async (get) => {
  const html = await (await get("/compliance")).text();
  const rows = [...html.matchAll(/data-compliance-row="([^"]+)" data-freeze="([^"]+)" data-delegate="([^"]+)" data-paused="([^"]+)"/g)].map((m) => ({ mint: m[1], freeze: m[2], delegate: m[3], paused: m[4] }));
  if (rows.length < 100) throw new Error(`expected every tracked mint (109) on /compliance, got ${rows.length}`);
  let slot = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const group = rows.slice(i, i + 100);
    const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [group.map((g) => g.mint), { encoding: "base64" }] }) })).json();
    slot = r.result.context.slot;
    group.forEach((g, j) => {
      const truth = decode(Buffer.from(r.result.value[j].data[0], "base64"));
      for (const k of ["freeze", "delegate", "paused"]) if (truth[k] !== g[k]) throw new Error(`${g.mint} ${k}: page ${g[k]} vs raw RPC ${truth[k]}`);
    });
  }
  for (const issuer of ["prestocks", "xstock", "ondo"]) if (!html.includes(`data-issuer-terms="${issuer}"`)) throw new Error(`issuer terms for ${issuer} missing`);
  if (!/not a U\.S\. person/.test(html) || !/Non-U\.S Persons/.test(html)) throw new Error("issuer terms must quote the U.S.-person restriction");
  const spx = rows.find((r) => r.mint === "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh");
  console.log(`ok: ${rows.length} mints match raw RPC bytes at slot ${slot} (freeze, permanent delegate, paused); SPACEX freeze ${spx.freeze}; issuer terms quoted`);
});
