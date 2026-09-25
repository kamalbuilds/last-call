import { headers } from "next/headers";
import { getHoldings } from "@lastcall/holdings";
import { WalletLookup } from "@/components/wallet-lookup";
import { readTerms, type TermsJson } from "@/lib/terms";
import { shorten } from "@/lib/ledger";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Server-fetched holdings for ?wallet=, streamed inside Suspense. */
export async function LookupSection({ wallet }: { wallet: string }): Promise<React.ReactNode> {
  if (!ADDRESS_PATTERN.test(wallet)) {
    return <p className="mt-3 text-sm text-[var(--closed)]">That does not look like a Solana wallet address.</p>;
  }
  try {
    const rows = await getHoldings(wallet);
    const heads = await headers();
    const host = heads.get("x-forwarded-host") ?? heads.get("host") ?? "";
    const proto =
      heads.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    const siteUrl = host === "" ? "" : `${proto}://${host}`;
    const convertible = rows.filter((row) => row.convertsInto !== null);
    const settled = await Promise.all(
      convertible.map(async (row) => {
        try {
          return { mint: row.mint, terms: await readTerms(row.mint) } as {
            mint: string;
            terms: TermsJson;
          };
        } catch {
          return { mint: row.mint, terms: null } as { mint: string; terms: null };
        }
      }),
    );
    const termsByMint: Record<string, TermsJson | null> = {};
    for (const entry of settled) {
      termsByMint[entry.mint] = entry.terms;
    }
    return (
      <>
        <h2 className="num mt-8 text-xl font-bold text-[var(--text)]">
          <a href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer" className="underline">
            Wallet {shorten(wallet)}
          </a>
        </h2>
        <WalletLookup owner={wallet} rows={rows} siteUrl={siteUrl} termsByMint={termsByMint} />
      </>
    );
  } catch (err) {
    return (
      <p className="mt-3 text-sm text-[var(--closed)]">
        Could not read this wallet right now: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }
}
