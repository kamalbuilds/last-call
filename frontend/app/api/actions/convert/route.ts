import { Connection } from "@solana/web3.js";
import { LIFECYCLE } from "@lastcall/ledger";
import {
  buildConversionTransaction,
  readMintDecimals,
  readTokenBalanceRaw,
  rpcUrl,
} from "./convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKENS = ["XAI", "SPACEX"] as const;
type ActionToken = (typeof TOKENS)[number];

const BLOCKCHAIN_IDS = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function actionHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
    "X-Action-Version": "1",
    "X-Blockchain-Ids": BLOCKCHAIN_IDS,
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: actionHeaders() });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseToken(request: Request): ActionToken | null {
  const token = new URL(request.url).searchParams.get("token");
  return token === "XAI" || token === "SPACEX" ? token : null;
}

function iconUrl(request: Request): string {
  return `https://${new URL(request.url).host}/blink-icon.svg`;
}

interface LifecycleConversion {
  intoMint?: unknown;
  intoSymbol?: unknown;
}

interface LifecycleEntry {
  symbol: string;
  mint: string;
  deadline: string | null;
  conversion: LifecycleConversion | null;
}

function lifecycleEntry(token: ActionToken): LifecycleEntry | null {
  const raw = (LIFECYCLE as unknown as Record<string, LifecycleEntry>)[token] ?? null;
  if (raw === null || raw.mint === undefined) return null;
  return raw;
}

// GET returns ActionGetResponse metadata for ?token=XAI|SPACEX.
export async function GET(request: Request): Promise<Response> {
  const token = parseToken(request);
  if (token === null) {
    return json({ message: "unknown token, use ?token=XAI or ?token=SPACEX" }, 400);
  }
  const entry = lifecycleEntry(token);
  const intoMint = typeof entry?.conversion?.intoMint === "string" ? entry.conversion.intoMint : null;
  const intoSymbol =
    typeof entry?.conversion?.intoSymbol === "string" ? entry.conversion.intoSymbol : "stock";
  if (entry === null || intoMint === null) {
    return json({ message: `no conversion route for ${token}` }, 400);
  }
  const deadline = entry.deadline === null ? "the deadline" : entry.deadline.slice(0, 10);
  return json({
    type: "action",
    icon: iconUrl(request),
    title: `Convert your ${token} before it expires`,
    description: `Convert ${token} into ${intoSymbol} before ${deadline}. After the deadline unconverted tokens expire worthless.`,
    label: "Convert",
    links: {
      actions: [
        { label: "Convert all", href: `/api/actions/convert?token=${token}&amount=all` },
        { label: "Convert 1", href: `/api/actions/convert?token=${token}&amount=1` },
      ],
    },
  });
}

interface ActionBody {
  account?: unknown;
}

// POST returns ActionPostResponse {transaction, message} for {account}.
export async function POST(request: Request): Promise<Response> {
  const token = parseToken(request);
  if (token === null) {
    return json({ message: "unknown token, use ?token=XAI or ?token=SPACEX" }, 400);
  }
  const amount = new URL(request.url).searchParams.get("amount") ?? "all";
  if (amount !== "all" && amount !== "1") {
    return json({ message: "unknown amount, use amount=all or amount=1" }, 400);
  }
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return json({ message: "request body must be valid JSON" }, 400);
  }
  const account = typeof body.account === "string" ? body.account : "";
  if (!ADDRESS_PATTERN.test(account)) {
    return json({ message: "invalid account address" }, 400);
  }

  const entry = lifecycleEntry(token);
  const intoMint = typeof entry?.conversion?.intoMint === "string" ? entry.conversion.intoMint : null;
  const intoSymbol =
    typeof entry?.conversion?.intoSymbol === "string" ? entry.conversion.intoSymbol : "stock";
  if (entry === null || intoMint === null) {
    return json({ message: `no conversion route for ${token}` }, 400);
  }

  const connection = new Connection(rpcUrl(), "confirmed");
  let amountRaw: bigint;
  try {
    if (amount === "all") {
      amountRaw = await readTokenBalanceRaw(connection, account, entry.mint);
      if (amountRaw <= 0n) {
        return json({ message: "no balance left to convert" }, 400);
      }
    } else {
      const decimals = await readMintDecimals(connection, entry.mint);
      amountRaw = 10n ** BigInt(decimals);
    }
  } catch (err) {
    return json({ message: errorMessage(err) }, 502);
  }

  try {
    const built = await buildConversionTransaction({
      connection,
      owner: account,
      fromMint: entry.mint,
      toMint: intoMint,
      amountRaw,
    });
    const scope = amount === "all" ? "your full balance of" : "1";
    return json({
      type: "transaction",
      transaction: built.txBase64,
      message: `Convert ${scope} ${token} into ${intoSymbol}`,
    });
  } catch (err) {
    return json({ message: errorMessage(err) }, 502);
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: actionHeaders() });
}
