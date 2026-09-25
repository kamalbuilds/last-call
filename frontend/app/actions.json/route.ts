export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY = {
  rules: [
    { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
  ],
};

function headers(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
    "X-Action-Version": "1",
    "X-Blockchain-Ids": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  };
}

export async function GET(): Promise<Response> {
  return Response.json(BODY, { headers: headers() });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: headers() });
}
