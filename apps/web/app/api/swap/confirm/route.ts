import type { SwapRequest } from "@/lib/contract";
import { loadExec } from "@/lib/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^[A-Z]{2,16}$/;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,96}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json(
      { ok: false, reason: "The request body must be valid JSON." },
      { status: 400 },
    );
  }
  if (!isRecord(parsed)) {
    return Response.json(
      { ok: false, reason: "The request body must be a JSON object." },
      { status: 400 },
    );
  }

  const signature: unknown = parsed["signature"];
  if (typeof signature !== "string" || !SIGNATURE_PATTERN.test(signature)) {
    return Response.json(
      { ok: false, reason: "Signature must be a base58 string of 64 to 96 characters." },
      { status: 400 },
    );
  }

  const expectedNetDelta: unknown = parsed["expectedNetDelta"];
  if (
    typeof expectedNetDelta !== "number" ||
    !Number.isFinite(expectedNetDelta) ||
    expectedNetDelta <= 0
  ) {
    return Response.json(
      { ok: false, reason: "ExpectedNetDelta must be a positive finite number." },
      { status: 400 },
    );
  }

  const nested: unknown = parsed["request"];
  if (!isRecord(nested)) {
    return Response.json(
      { ok: false, reason: "Request must be a swap request object." },
      { status: 400 },
    );
  }

  const nestedSymbol: unknown = nested["symbol"];
  if (typeof nestedSymbol !== "string") {
    return Response.json(
      { ok: false, reason: "Request symbol must be a string of 2 to 16 letters." },
      { status: 400 },
    );
  }
  const symbol = nestedSymbol.toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json(
      { ok: false, reason: "Request symbol must be 2 to 16 uppercase letters A through Z." },
      { status: 400 },
    );
  }

  const mint: unknown = nested["mint"];
  if (typeof mint !== "string" || !ADDRESS_PATTERN.test(mint)) {
    return Response.json(
      { ok: false, reason: "Request mint must be a base58 address of 32 to 44 characters." },
      { status: 400 },
    );
  }

  const notionalUsd: unknown = nested["notionalUsd"];
  if (
    typeof notionalUsd !== "number" ||
    !Number.isFinite(notionalUsd) ||
    notionalUsd < 100 ||
    notionalUsd > 5_000_000
  ) {
    return Response.json(
      { ok: false, reason: "Request notionalUsd must be a number between 100 and 5000000." },
      { status: 400 },
    );
  }

  const userPublicKey: unknown = nested["userPublicKey"];
  if (typeof userPublicKey !== "string" || !ADDRESS_PATTERN.test(userPublicKey)) {
    return Response.json(
      { ok: false, reason: "Request userPublicKey must be a base58 address of 32 to 44 characters." },
      { status: 400 },
    );
  }

  const slippageBps: unknown = nested["slippageBps"];
  if (
    typeof slippageBps !== "number" ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 1 ||
    slippageBps > 500
  ) {
    return Response.json(
      { ok: false, reason: "Request slippageBps must be an integer between 1 and 500." },
      { status: 400 },
    );
  }

  const swapRequest: SwapRequest = {
    symbol,
    mint,
    notionalUsd,
    userPublicKey,
    slippageBps,
  };

  const exec = await loadExec();
  if (exec === null) {
    return Response.json(
      {
        ok: false,
        reason: "@fineprint/exec did not resolve at runtime, so the swap could not be confirmed.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await exec.confirmSwap(signature, swapRequest, expectedNetDelta);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json(
      { ok: false, reason: `Confirmation failed. ${errorMessage(err)}` },
      { status: 502 },
    );
  }
}
