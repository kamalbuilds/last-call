import { buildUniverse, type UniverseMint } from "@lastcall/events";

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; value: UniverseMint[] } | null = null;

/** Every tracked mint (PreStocks, XAI, xStocks, Ondo), the same set /inbox reads events for. */
export async function getUniverse(): Promise<UniverseMint[]> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await buildUniverse();
  cache = { at: Date.now(), value };
  return value;
}
