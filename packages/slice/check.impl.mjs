// Independent check for planSlices(). Owned by the orchestrator.
// Re-implements the Jupiter calls itself instead of trusting planSlices's own
// internal quotes, so a bug that always reports "under threshold" cannot pass silently.
import { Connection } from "@solana/web3.js";
import { getQuote } from "@fineprint/exec";
import { planSlices } from "./src/index.ts";

const RPC = process.env.SOLANA_RPC_URL ?? "https://solana-rpc.publicnode.com";
const connection = new Connection(RPC, "confirmed");

const SPACEX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh"; // Token-2022, 9 decimals
const SPCXX = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function pctToBps(pct) {
  return Number.parseFloat(pct) * 100;
}

// 1. Derive a $10k-equivalent SPACEX raw amount from a live price read (SPACEX -> USDC).
const priceProbeRaw = 10_000_000_000n; // 10 SPACEX, enough to price without itself being a $10k trade
const priceQuote = await getQuote({ inputMint: SPACEX, outputMint: USDC, amount: priceProbeRaw, slippageBps: 300 });
const usdcPerSpacex = Number(priceQuote.outAmount) / 1_000_000 / (Number(priceProbeRaw) / 1e9);
const amount10kRaw = BigInt(Math.round((10_000 / usdcPerSpacex) * 1e9));
console.log(`spot: 1 SPACEX ~= $${usdcPerSpacex.toFixed(2)}; $10k ~= ${amount10kRaw} raw`);

// 2. (a) Independent full-size quote for the $10k-equivalent amount, SPACEX -> SPCXx.
const fullQuote = await getQuote({ inputMint: SPACEX, outputMint: SPCXX, amount: amount10kRaw, slippageBps: 300 });
const fullImpactBps = pctToBps(fullQuote.priceImpactPct);
console.log(`full $10k-equivalent single-shot impact: ${fullImpactBps.toFixed(4)} bps`);

// Threshold set below what a $10k single shot actually costs today, so the slice
// is forced to do real work; not hardcoded to a stale measurement from a prior run.
const maxImpactBps = Math.max(1, Math.floor(fullImpactBps / 2));

const plan = await planSlices({
  fromMint: SPACEX,
  toMint: SPCXX,
  amountRaw: amount10kRaw,
  maxImpactBps,
  connection,
});

if (plan.sliceRaw === 0n) {
  throw new Error(
    `red: no valid slice at maxImpactBps=${maxImpactBps}, but the full amount's impact (${fullImpactBps.toFixed(4)} bps) was supposed to make one findable`,
  );
}

// 2. (b) Independent quote at the planned slice size, re-fetched here rather than trusted from the plan.
const sliceQuote = await getQuote({ inputMint: SPACEX, outputMint: SPCXX, amount: plan.sliceRaw, slippageBps: 300 });
const sliceImpactBps = pctToBps(sliceQuote.priceImpactPct);
console.log(`green: plan slice ${plan.sliceRaw} raw x${plan.count}, independently re-quoted impact ${sliceImpactBps.toFixed(4)} bps (threshold ${maxImpactBps} bps)`);

if (!(sliceImpactBps <= maxImpactBps)) {
  throw new Error(`slice impact ${sliceImpactBps} bps exceeds threshold ${maxImpactBps} bps`);
}
if (!(fullImpactBps > maxImpactBps)) {
  throw new Error(`single-shot impact ${fullImpactBps} bps is not above threshold ${maxImpactBps} bps; test is not meaningful`);
}

// 3. maxImpactBps = 0 must be unsatisfiable: real AMM trades never quote exactly 0 impact.
const zeroPlan = await planSlices({
  fromMint: SPACEX,
  toMint: SPCXX,
  amountRaw: amount10kRaw,
  maxImpactBps: 0,
  connection,
});
if (zeroPlan.sliceRaw !== 0n || zeroPlan.count !== 0) {
  throw new Error(`red: expected no valid slice at maxImpactBps=0, got sliceRaw=${zeroPlan.sliceRaw} count=${zeroPlan.count}`);
}
console.log(`red: maxImpactBps=0 correctly finds no valid slice (quotedImpactBps=${zeroPlan.quotedImpactBps})`);

// Prove the check itself can fail: a threshold above the single-shot impact must NOT force slicing.
const trivialPlan = await planSlices({
  fromMint: SPACEX,
  toMint: SPCXX,
  amountRaw: amount10kRaw,
  maxImpactBps: Math.ceil(fullImpactBps) + 1000,
  connection,
});
if (trivialPlan.count !== 1 || trivialPlan.sliceRaw !== amount10kRaw) {
  throw new Error(`a threshold above single-shot impact should return the whole amount as one slice, got count=${trivialPlan.count}`);
}

console.log(
  `ok: $10k-equiv single-shot ${fullImpactBps.toFixed(4)} bps > threshold ${maxImpactBps} bps > slice ${sliceImpactBps.toFixed(4)} bps; ${plan.count} slices of ${plan.sliceRaw} raw; minGapMs=${plan.minGapMs}; estimatedSavingUi=${plan.estimatedSavingUi.toFixed(6)} SPCXx (optimistic, assumes pool refill between slices)`,
);
