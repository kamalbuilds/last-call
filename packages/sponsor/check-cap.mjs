// Independent cap check for the sponsor co-signer. Owned by the orchestrator.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../exec/package.json", import.meta.url));
const { Keypair, VersionedTransaction, TransactionMessage, PublicKey, Connection } = require("@solana/web3.js");
const sponsorModule = await import("./src/index.ts").catch(() => import("./dist/index.js"));
const { cosign } = sponsorModule;
const { checkSponsorEligibility } = await import("./src/eligibility.ts");

const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const SPACEX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const COMPUTE_BUDGET = new PublicKey("ComputeBudget111111111111111111111111111111");

const rpc = process.env["SOLANA_RPC_URL"] ?? "https://solana-rpc.publicnode.com";
let conn = new Connection(rpc, "confirmed");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Public RPCs throttle holder-scan bursts: pace every call, retry with
// backoff. A 403 (provider refuses the method) is fatal, not retryable.
let lastCall = 0;
async function rpcCall(fn, what) {
  for (let attempt = 0; ; attempt++) {
    const gap = 500 - (Date.now() - lastCall);
    if (gap > 0) await sleep(gap);
    try {
      const out = await fn();
      lastCall = Date.now();
      return out;
    } catch (err) {
      lastCall = Date.now();
      const msg = err?.message ?? String(err);
      if (/403|blocked/i.test(msg)) throw new Error(`${what} refused: ${msg.slice(0, 120)}`);
      if (attempt >= 8) throw new Error(`${what} failed after retries: ${msg.slice(0, 120)}`);
      await sleep(Math.min(1000 * 2 ** attempt, 15000));
    }
  }
}

const threshold = (await rpcCall(() => conn.getMinimumBalanceForRentExemption(165), "getMinimumBalanceForRentExemption")) + 10_000;

// The eligibility rule sums every token account, which needs owner-index
// queries. If the primary RPC refuses them, fall back to the public mainnet
// endpoint so every balance below is still read live from RPC.
try {
  await conn.getParsedTokenAccountsByOwner(new PublicKey("CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb"), {
    programId: TOKEN_PROGRAM,
  });
} catch (err) {
  if (!/403|blocked/i.test(err?.message ?? "")) throw err;
  conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  console.log("note: primary RPC blocks token-account queries, using https://api.mainnet-beta.solana.com");
}

// Live SOL balances for many owners in as few calls as possible.
async function solMap(addresses) {
  const out = new Map();
  const keys = addresses.map((a) => new PublicKey(a));
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const infos = await rpcCall(() => conn.getMultipleAccountsInfo(batch, "confirmed"), "getMultipleAccountsInfo");
    batch.forEach((key, j) => out.set(key.toBase58(), infos[j]?.lamports ?? 0));
  }
  return out;
}

const res = await fetch(`https://datapi.jup.ag/v1/holders/${XAI}`, {
  headers: { accept: "application/json" },
});
if (!res.ok) throw new Error(`holders API returned HTTP ${res.status}`);
const payload = await res.json();
const holders = payload?.holders;
if (!Array.isArray(holders) || holders.length === 0) {
  throw new Error("holders API returned no holders");
}
const apiAddresses = holders.map((h) => h?.address).filter((a) => typeof a === "string");
const apiSol = await solMap(apiAddresses);

// Every XAI token account on-chain (XAI is a Token-2022 mint), summed per
// owner. Token balances below come from live RPC, never the API numbers.
const mintInfo = await rpcCall(() => conn.getAccountInfo(new PublicKey(XAI), "confirmed"), "getAccountInfo");
if (mintInfo === null) throw new Error("XAI mint account not found");
const tokenAccounts = await rpcCall(
  () =>
    conn.getProgramAccounts(mintInfo.owner, {
      filters: [{ memcmp: { offset: 0, bytes: XAI } }],
      dataSlice: { offset: 32, length: 40 },
      commitment: "confirmed",
    }),
  "getProgramAccounts",
);
const perOwner = new Map();
for (const entry of tokenAccounts) {
  const buf = Buffer.from(entry.account.data);
  if (buf.length < 40) continue;
  const amount = buf.readBigUInt64LE(32);
  if (amount <= 0n) continue;
  const ownerAddress = new PublicKey(buf.subarray(0, 32)).toBase58();
  perOwner.set(ownerAddress, (perOwner.get(ownerAddress) ?? 0n) + amount);
}

// Dust too small for Jupiter to quote cannot exercise the cosign half, so
// candidates need a quotable balance as well as being stranded.
const QUOTABLE = 1_000_000n;

const candidates = [];
for (let i = apiAddresses.length - 1; i >= 0; i--) {
  const address = apiAddresses[i];
  if ((apiSol.get(address) ?? threshold) >= threshold) continue;
  const xai = perOwner.get(address) ?? 0n;
  if (xai < QUOTABLE) continue;
  candidates.push({ address, xai });
}

// The pinned top-100 list currently holds no stranded wallet, so scan the
// on-chain holders smallest-first.
if (candidates.length === 0) {
  console.log("note: no stranded holder in the top-100 API list, scanning on-chain holders smallest-first");
  const ordered = [...perOwner.entries()]
    .filter(([, amount]) => amount >= QUOTABLE)
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const sols = await solMap(ordered.map(([address]) => address));
  for (const [address, xai] of ordered) {
    if ((sols.get(address) ?? threshold) >= threshold) continue;
    candidates.push({ address, xai });
    if (candidates.length >= 8) break;
  }
}

if (candidates.length === 0) throw new Error("no stranded XAI holder found below the SOL threshold");

// A holder from the same API list whose live SOL balance clears the threshold.
let rich = null;
for (const address of apiAddresses) {
  if (candidates.some((c) => c.address === address)) continue;
  if ((apiSol.get(address) ?? 0) < threshold) continue;
  const xai = perOwner.get(address) ?? 0n;
  if (xai <= 0n) continue;
  rich = { address, xai };
  break;
}
if (rich === null) throw new Error("no funded XAI holder found above the SOL threshold");

const pairs = [{ from: XAI, to: SPACEX }];

const assertEligible = async (name, req, pairList, want) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const verdict = await checkSponsorEligibility(conn, req, pairList);
      if ((verdict.ok === true) !== want) {
        throw new Error(`${name}: expected ok=${want}, got ${JSON.stringify(verdict)}`);
      }
      return;
    } catch (err) {
      if (err?.message?.startsWith(name) || attempt >= 3) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
};

// Try stranded candidates largest-first until one builds a quotable swap.
const ordered = [...candidates].sort((a, b) => (a.xai > b.xai ? -1 : a.xai < b.xai ? 1 : 0));
let stranded = null;
for (const candidate of ordered) {
  await assertEligible(
    "stranded full balance",
    { owner: candidate.address, fromMint: XAI, toMint: SPACEX, amountRaw: candidate.xai.toString() },
    pairs,
    true,
  );
  await assertEligible(
    "stranded partial balance",
    { owner: candidate.address, fromMint: XAI, toMint: SPACEX, amountRaw: (candidate.xai - 1n).toString() },
    pairs,
    false,
  );
  try {
    execSync(
      `pnpm --filter @lastcall/convert build-tx ${candidate.address} ${Keypair.generate().publicKey.toBase58()} ${XAI} ${SPACEX} ${candidate.xai.toString()}`,
      { stdio: "ignore" },
    );
  } catch {
    continue;
  }
  stranded = candidate;
  break;
}
if (stranded === null) throw new Error("no stranded candidate with a quotable XAI balance");

await assertEligible(
  "funded holder",
  { owner: rich.address, fromMint: XAI, toMint: SPACEX, amountRaw: rich.xai.toString() },
  pairs,
  false,
);
await assertEligible(
  "reversed pair",
  { owner: stranded.address, fromMint: SPACEX, toMint: XAI, amountRaw: stranded.xai.toString() },
  pairs,
  false,
);

const sponsor = Keypair.generate();
execSync(
  `pnpm --filter @lastcall/convert build-tx ${stranded.address} ${sponsor.publicKey.toBase58()} ${XAI} ${SPACEX} ${stranded.xai.toString()}`,
  { stdio: "ignore" },
);
const good = JSON.parse(readFileSync(new URL("../convert/out/convert.json", import.meta.url))).txBase64;

const signed = VersionedTransaction.deserialize(Buffer.from(await cosign(good, sponsor), "base64"));
if (!signed.signatures[0].some((b) => b !== 0)) throw new Error("valid conversion was not signed by sponsor");

const tx = VersionedTransaction.deserialize(Buffer.from(good, "base64"));
const alts = [];
for (const l of tx.message.addressTableLookups) alts.push((await rpcCall(() => conn.getAddressLookupTable(l.accountKey), "getAddressLookupTable")).value);
const msg = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: alts });

const priceIx = msg.instructions.find(
  (ix) => ix.programId.equals(COMPUTE_BUDGET) && Buffer.from(ix.data)[0] === 3,
);
if (priceIx) {
  const inflated = Buffer.from(priceIx.data);
  inflated.writeBigUInt64LE(10_000_000n, 1);
  priceIx.data = inflated;
} else {
  // No price instruction (zero priority fee): append an over-cap one.
  const { ComputeBudgetProgram } = require("@solana/web3.js");
  msg.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000_000 }));
}
const evilMsg = new TransactionMessage({
  payerKey: sponsor.publicKey,
  recentBlockhash: msg.recentBlockhash,
  instructions: msg.instructions,
}).compileToV0Message(alts);
const evilBase64 = Buffer.from(new VersionedTransaction(evilMsg).serialize()).toString("base64");
try {
  await cosign(evilBase64, sponsor);
} catch {
  console.log(`ok: stranded holder ${stranded.address} full-balance eligible, partial/funded/reversed refused, priority-fee cap enforced`);
  process.exit(0);
}
throw new Error("sponsor signed a conversion that exceeds the priority-fee cap");
