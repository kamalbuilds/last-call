import { Connection } from "@solana/web3.js";
import { buildSponsoredConversion } from "@lastcall/convert/src/sponsored.js";
import { getQuote, getSwapTransaction } from "@fineprint/exec";
import { readLedger } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

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
    const ledger = readLedger();
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
  const sponsor = process.env.SPONSOR_PUBKEY ?? "";
  const feePayer = ADDRESS_PATTERN.test(sponsor) ? sponsor : owner;

  // Sponsored path: the sponsor pays fees and ATA rent, the owner signs as the
  // token authority. buildSponsoredConversion refuses owner===feePayer, so an
  // unsponsored request falls through to a normal owner-paid Jupiter swap.
  if (feePayer !== owner) {
    try {
      const tx = await buildSponsoredConversion({
        connection,
        owner,
        feePayer,
        fromMint,
        toMint,
        amountRaw: amount.toString(),
      });
      return Response.json({
        txBase64: Buffer.from(tx.serialize()).toString("base64"),
        feePayer,
        sponsored: true,
      });
    } catch (err) {
      return Response.json({ error: errorMessage(err) }, { status: 502 });
    }
  }

  try {
    const quote = await getQuote({
      inputMint: fromMint,
      outputMint: toMint,
      amount,
      slippageBps: 300,
    });
    const swap = await getSwapTransaction({ quote, userPublicKey: owner });
    return Response.json({
      txBase64: swap.swapTransaction,
      feePayer: owner,
      sponsored: false,
    });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
