import { buildUniverse, eventsForMints, eventsForWallet, toIcs } from "@lastcall/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet") ?? "";
  try {
    if (wallet !== "" && !ADDRESS_PATTERN.test(wallet)) {
      return new Response("Not a Solana wallet address.", { status: 400 });
    }
    const events =
      wallet !== ""
        ? await eventsForWallet(wallet)
        : await eventsForMints((await buildUniverse()).map((m) => m.mint));
    return new Response(toIcs(events), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="lastcall-inbox.ics"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Could not build the calendar right now: ${message}`, { status: 500 });
  }
}
