import { getHoldings } from "@lastcall/holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner") ?? "";
  if (!ADDRESS_PATTERN.test(owner)) {
    return Response.json({ error: "missing or invalid ?owner=<address>" }, { status: 400 });
  }
  try {
    const rows = await getHoldings(owner);
    return Response.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
