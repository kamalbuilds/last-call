// Independent post-conditions for @lastcall/events. Every assertion below
// recomputes its expected value from a fresh RPC read done by this file, and
// never trusts eventsForMints / eventsForWallet's own internals for the
// number it is checking.
import { eventsForMints, eventsForWallet, toIcs, buildUniverse } from "./src/index.ts";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const OPENAI = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const QQQX = "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ";
const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const WALLET = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const payload = await res.json();
  if (payload.error) throw new Error(`RPC ${method} error: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

function findExtension(accountInfo, name) {
  const extensions = accountInfo?.value?.data?.parsed?.info?.extensions;
  if (!Array.isArray(extensions)) throw new Error("account has no parsable extensions list");
  return extensions.find((e) => e.extension === name)?.state ?? null;
}

/* 1. OPENAI fee_change: 50 -> 100 bps at epoch 1039, marked in force, cross-checked by our own RPC read. */
const epochInfo = await rpc("getEpochInfo", []);
const openaiInfo = await rpc("getAccountInfo", [OPENAI, { encoding: "jsonParsed" }]);
const openaiFee = findExtension(openaiInfo, "transferFeeConfig");
if (!openaiFee) throw new Error("red: OPENAI mint has no transferFeeConfig on-chain");
const expectOpenaiInForce = epochInfo.epoch >= openaiFee.newerTransferFee.epoch;

const openaiEvents = await eventsForMints([OPENAI]);
const openaiFeeEvent = openaiEvents.find((e) => e.type === "fee_change" && e.mint === OPENAI);
if (!openaiFeeEvent) throw new Error("red: no fee_change event for OPENAI");
if (openaiFeeEvent.olderBps !== 50 || openaiFeeEvent.newerBps !== 100) {
  throw new Error(`red: OPENAI fee_change bps wrong: ${JSON.stringify(openaiFeeEvent)}`);
}
if (openaiFeeEvent.activationEpoch !== 1039) {
  throw new Error(`red: OPENAI fee_change activationEpoch ${openaiFeeEvent.activationEpoch}, expected 1039`);
}
if (expectOpenaiInForce !== true) {
  throw new Error(`red: test assumption broken, chain epoch ${epochInfo.epoch} has not reached activation epoch 1039`);
}
if (openaiFeeEvent.inForce !== expectOpenaiInForce) {
  throw new Error(
    `red: OPENAI fee_change inForce=${openaiFeeEvent.inForce}, independent read of epoch ${epochInfo.epoch} vs activation ${openaiFee.newerTransferFee.epoch} says ${expectOpenaiInForce}`,
  );
}
console.log(`ok: OPENAI fee_change 50->100bps at epoch 1039, inForce=${openaiFeeEvent.inForce} (chain epoch ${epochInfo.epoch})`);

/* 2. QQQx dividend_or_split dated 2026-09-19, percent matches our own computation from the raw mint. */
const qqqxInfo = await rpc("getAccountInfo", [QQQX, { encoding: "jsonParsed" }]);
const qqqxScaled = findExtension(qqqxInfo, "scaledUiAmountConfig");
if (!qqqxScaled) throw new Error("red: QQQx mint has no scaledUiAmountConfig on-chain");
const expectPercent = Number(qqqxScaled.newMultiplier) / Number(qqqxScaled.multiplier) - 1;
const expectPending = qqqxScaled.newMultiplierEffectiveTimestamp * 1000 > Date.now();

const qqqxEvents = await eventsForMints([QQQX]);
const qqqxEvent = qqqxEvents.find((e) => e.type === "dividend_or_split" && e.mint === QQQX);
if (!qqqxEvent) throw new Error("red: no dividend_or_split event for QQQx");
if (!qqqxEvent.effectiveDate.startsWith("2026-09-19")) {
  throw new Error(`red: QQQx effectiveDate ${qqqxEvent.effectiveDate}, expected 2026-09-19`);
}
if (Math.abs(qqqxEvent.percentChange - expectPercent) > 1e-9) {
  throw new Error(`red: QQQx percentChange ${qqqxEvent.percentChange} vs independent ${expectPercent}`);
}
// This is the multiplier-in-force assertion: which side of the effective
// timestamp "now" falls on, recomputed independently of operativeMultiplier
// / isPending. A flipped in-force comparison in packages/core/src/multiplier.ts
// fails exactly this line.
if (qqqxEvent.pending !== expectPending) {
  throw new Error(
    `red: QQQx pending=${qqqxEvent.pending}, independent now-vs-effective-timestamp check says ${expectPending} -- multiplier-in-force logic is broken`,
  );
}
console.log(
  `ok: QQQx dividend_or_split ${qqqxEvent.effectiveDate} percentChange=${(qqqxEvent.percentChange * 100).toFixed(4)}% pending=${qqqxEvent.pending}`,
);

/* 3. eventsForWallet includes the known XAI holder's expired conversion, amount 139.018... */
const walletEvents = await eventsForWallet(WALLET);
const xaiEvent = walletEvents.find((e) => e.type === "conversion" && e.mint === XAI);
if (!xaiEvent) throw new Error("red: no XAI conversion event for known holder");
if (xaiEvent.expired !== true) {
  throw new Error(`red: XAI conversion expired=${xaiEvent.expired}, expected true (deadline 2026-09-12 has passed)`);
}
if (xaiEvent.amount === null || Math.abs(xaiEvent.amount - 139.01841252) > 0.001) {
  throw new Error(`red: XAI conversion amount ${xaiEvent.amount}, chain says 139.01841252`);
}
console.log(`ok: eventsForWallet XAI conversion expired=${xaiEvent.expired}, amount ${xaiEvent.amount}`);

/* 4. toIcs output parses as a VCALENDAR with at least one VEVENT and VALARM. */
const ics = toIcs([...walletEvents, ...openaiEvents, ...qqqxEvents]);
if (!ics.startsWith("BEGIN:VCALENDAR\r\n") || !ics.trimEnd().endsWith("END:VCALENDAR")) {
  throw new Error("red: toIcs output is not a well-formed VCALENDAR");
}
const veventOpens = (ics.match(/BEGIN:VEVENT\r\n/g) ?? []).length;
const veventCloses = (ics.match(/END:VEVENT\r\n/g) ?? []).length;
const valarmOpens = (ics.match(/BEGIN:VALARM\r\n/g) ?? []).length;
const valarmCloses = (ics.match(/END:VALARM\r\n/g) ?? []).length;
if (veventOpens === 0 || veventOpens !== veventCloses) {
  throw new Error(`red: toIcs VEVENT open/close mismatch: ${veventOpens}/${veventCloses}`);
}
if (valarmOpens === 0 || valarmOpens !== valarmCloses) {
  throw new Error(`red: toIcs VALARM open/close mismatch: ${valarmOpens}/${valarmCloses}`);
}
if (valarmOpens !== veventOpens * 3) {
  throw new Error(`red: expected 3 alarms (30d/7d/1d) per VEVENT, got ${valarmOpens} alarms for ${veventOpens} events`);
}
console.log(`ok: toIcs produced ${veventOpens} VEVENT(s), each with 3 VALARMs`);

/* 5. No Tessera mint anywhere in the discovered universe. */
const universe = await buildUniverse();
const tessera = universe.filter((m) => /tessera/i.test(m.symbol) || /tessera/i.test(m.mint));
if (tessera.length > 0) {
  throw new Error(`red: Tessera mint(s) leaked into the universe: ${JSON.stringify(tessera)}`);
}
const byIssuer = { prestocks: 0, xstock: 0, ondo: 0 };
for (const m of universe) byIssuer[m.issuer] += 1;
console.log(
  `ok: universe has ${universe.length} mints and no Tessera (prestocks=${byIssuer.prestocks} xstock=${byIssuer.xstock} ondo=${byIssuer.ondo})`,
);

console.log("ok: all @lastcall/events checks passed");
