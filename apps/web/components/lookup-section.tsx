import { getHoldings } from "@lastcall/holdings";
import { WalletLookup } from "@/components/wallet-lookup";
import { shorten } from "@/lib/ledger";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Server-fetched holdings for ?wallet=, streamed inside Suspense. */
export async function LookupSection({ wallet }: { wallet: string }): Promise<React.ReactNode> {
  if (!ADDRESS_PATTERN.test(wallet)) {
    return <p className="mt-3 text-sm text-[var(--closed)]">That does not look like a Solana wallet address.</p>;
  }
  try {
    const rows = await getHoldings(wallet);
    return (
      <>
        <h2 className="num mt-8 text-lg font-bold text-[var(--text)]">
          <a href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer" className="underline">
            Wallet {shorten(wallet)}
          </a>
        </h2>
        <WalletLookup owner={wallet} rows={rows} />
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
