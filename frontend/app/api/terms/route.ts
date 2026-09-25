import { readTerms } from "@/lib/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request): Promise<Response> {
  const mint = new URL(request.url).searchParams.get("mint") ?? "";
  if (!ADDRESS_PATTERN.test(mint)) {
    return Response.json({ error: "missing or invalid ?mint=<address>" }, { status: 400 });
  }
  try {
    return Response.json(await readTerms(mint));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
