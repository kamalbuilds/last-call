import { getConversions } from "./data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (token !== "XAI") {
    return Response.json({ error: "unknown token, use ?token=XAI" }, { status: 400 });
  }
  try {
    return Response.json(await getConversions(token));
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
