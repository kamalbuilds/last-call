import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { buildSponsoredConversion } from "@lastcall/convert/src/sponsored.js";
import { cosign } from "@lastcall/sponsor";
import { getQuote, getSwapTransaction } from "@fineprint/exec";
import { getLedger } from "@/lib/ledger";

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

function loadSponsor(): Keypair | null {
  const encoded = process.env["SPONSOR_SECRET_KEY"];
  if (encoded === undefined || encoded === "") return null;
  const secret = (bs58 as unknown as { decode: (s: string) => Uint8Array }).decode(encoded.trim());
  return Keypair.fromSecretKey(secret);
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

  let sponsor: Keypair | null = null;
  try {
    sponsor = loadSponsor();
  } catch {
    return Response.json({ error: "sponsor misconfigured" }, { status: 500 });
  }

  if (sponsor !== null) {
    const feePayer = sponsor.publicKey.toBase58();
    try {
      const tx = await buildSponsoredConversion({
        connection,
        owner,
        feePayer,
        fromMint,
        toMint,
        amountRaw: amount.toString(),
      });
      const unsignedBase64 = Buffer.from(tx.serialize()).toString("base64");
      const signedBase64 = await cosign(unsignedBase64, sponsor);
      return Response.json({
        txBase64: signedBase64,
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
