import { loadVerdict } from "@/lib/data";
import { loadExec } from "@/lib/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^[A-Z]{2,16}$/;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface SwapBody {
  symbol?: unknown;
  mint?: unknown;
  notionalUsd?: unknown;
  userPublicKey?: unknown;
  slippageBps?: unknown;
}

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
  const body = parsed as SwapBody;

  if (typeof body.symbol !== "string") {
    return Response.json(
      { ok: false, reason: "Symbol must be a string of 2 to 16 letters." },
      { status: 400 },
    );
  }
  const symbol = body.symbol.toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json(
      { ok: false, reason: "Symbol must be 2 to 16 uppercase letters A through Z." },
      { status: 400 },
    );
  }

  if (typeof body.mint !== "string" || !ADDRESS_PATTERN.test(body.mint)) {
    return Response.json(
      { ok: false, reason: "Mint must be a base58 address of 32 to 44 characters." },
      { status: 400 },
    );
  }
  const mint = body.mint;

  if (
    typeof body.notionalUsd !== "number" ||
    !Number.isFinite(body.notionalUsd) ||
    body.notionalUsd < 100 ||
    body.notionalUsd > 5_000_000
  ) {
    return Response.json(
      { ok: false, reason: "NotionalUsd must be a number between 100 and 5000000." },
      { status: 400 },
    );
  }
  const notionalUsd: number = body.notionalUsd;

  if (typeof body.userPublicKey !== "string" || !ADDRESS_PATTERN.test(body.userPublicKey)) {
    return Response.json(
      { ok: false, reason: "UserPublicKey must be a base58 address of 32 to 44 characters." },
      { status: 400 },
    );
  }
  const userPublicKey = body.userPublicKey;

  if (
    typeof body.slippageBps !== "number" ||
    !Number.isInteger(body.slippageBps) ||
    body.slippageBps < 1 ||
    body.slippageBps > 500
  ) {
    return Response.json(
      { ok: false, reason: "SlippageBps must be an integer between 1 and 500." },
      { status: 400 },
    );
  }
  const slippageBps: number = body.slippageBps;

  const verdictResult = await loadVerdict(symbol, notionalUsd);
  if (!verdictResult.ok) {
    return Response.json({ ok: false, reason: verdictResult.reason }, { status: 503 });
  }
  const lookup = verdictResult.value.verdict;
  if (!lookup.ok) {
    // No route at this size. Refusing is the correct answer: an unquotable market
    // is untradeable, and building a transaction against it would invent a price.
    return Response.json(
      { ok: false, refused: true, reason: lookup.reason, verdict: lookup },
      { status: 409 },
    );
  }
  const verdict = lookup.verdict;
  if (verdict.useOnChain === false) {
    return Response.json(
      { ok: false, refused: true, reason: verdict.reason, verdict },
      { status: 409 },
    );
  }

  const exec = await loadExec();
  if (exec === null) {
    return Response.json(
      { ok: false, reason: "@fineprint/exec did not resolve at runtime, so no transaction was built." },
      { status: 503 },
    );
  }

  try {
    const unsigned = await exec.buildSwap({
      symbol,
      mint,
      notionalUsd,
      userPublicKey,
      slippageBps,
    });
    return Response.json({ ok: true, unsigned, verdict });
  } catch (err) {
    return Response.json(
      { ok: false, reason: `The swap build failed. ${errorMessage(err)}` },
      { status: 502 },
    );
  }
}
