import { Connection } from "@solana/web3.js";
import { getLedger } from "@/lib/ledger";
import { buildConversionTransaction, rpcUrl } from "@/app/api/actions/convert/convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ConvertBody {
  owner?: unknown;
  fromMint?: unknown;
  amountRaw?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: ConvertBody;
  try {
    body = (await request.json()) as ConvertBody;
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  const owner = typeof body.owner === "string" ? body.owner : "";
  const fromMint = typeof body.fromMint === "string" ? body.fromMint : "";
  const amountRaw =
    typeof body.amountRaw === "string" || typeof body.amountRaw === "number"
      ? String(body.amountRaw)
      : "";
  if (!ADDRESS_PATTERN.test(owner)) {
    return Response.json({ error: "invalid owner address" }, { status: 400 });
  }
  if (!ADDRESS_PATTERN.test(fromMint)) {
    return Response.json({ error: "invalid fromMint address" }, { status: 400 });
  }
  let amount: bigint;
  try {
    amount = BigInt(amountRaw);
  } catch {
    return Response.json({ error: "invalid amountRaw" }, { status: 400 });
  }
  if (amount <= 0n) {
    return Response.json({ error: "amountRaw must be positive" }, { status: 400 });
  }

  let toMint: string | null = null;
  try {
    const ledger = await getLedger();
    const token = ledger.tokens.find((t) => t.mint === fromMint) ?? null;
    toMint = token?.conversion?.intoMint ?? null;
  } catch (err) {
    return Response.json({ error: `ledger unreadable: ${errorMessage(err)}` }, { status: 500 });
  }
  if (toMint === null) {
    return Response.json(
      { error: "no conversion destination in the ledger lifecycle for fromMint" },
      { status: 400 },
    );
  }

  const connection = new Connection(rpcUrl(), "confirmed");

  try {
    const built = await buildConversionTransaction({
      connection,
      owner,
      fromMint,
      toMint,
      amountRaw: amount,
    });
    return Response.json(built);
  } catch (err) {
    const message = errorMessage(err);
    if (message === "sponsor misconfigured") {
      return Response.json({ error: message }, { status: 500 });
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
