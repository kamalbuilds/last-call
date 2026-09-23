import { loadVerdict } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL_PATTERN = /^[A-Z]{2,16}$/;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const rawSymbol = url.searchParams.get("symbol") ?? "SPACEX";
  const symbol = rawSymbol.toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json(
      { ok: false, reason: "Symbol must be 2 to 16 uppercase letters A through Z." },
      { status: 400 },
    );
  }

  const rawUsd = url.searchParams.get("usd");
  const usd = rawUsd === null ? Number.NaN : Number(rawUsd);
  if (!Number.isFinite(usd) || usd < 100 || usd > 5_000_000) {
    return Response.json(
      { ok: false, reason: "Usd must be a number between 100 and 5000000." },
      { status: 400 },
    );
  }

  try {
    const result = await loadVerdict(symbol, usd);
    if (!result.ok) {
      return Response.json({ ok: false, reason: result.reason }, { status: 503 });
    }
    return Response.json({ ok: true, ...result.value });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, reason: `The verdict request failed. ${detail}` },
      { status: 503 },
    );
  }
}
