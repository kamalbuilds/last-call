import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LookupSection } from "@/components/lookup-section";
import { SplitFlap } from "@/components/split-flap";
import { getLedger } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Last call for pre-IPO holders",
};

const STRANDED_WALLET = "CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb";

interface PageProps {
  searchParams?: Promise<{ wallet?: string | string[] }>;
}

export default async function HomePage({ searchParams }: PageProps): Promise<React.ReactNode> {
  const resolved = searchParams !== undefined ? await searchParams : undefined;
  const rawWallet = resolved?.wallet;
  const wallet = Array.isArray(rawWallet) ? (rawWallet[0] ?? "") : (rawWallet ?? "");
  const lookupRequested = wallet !== "";

  let strandedShort: string | null = null;
  let strandedFull: string | null = null;
  try {
    const ledger = await getLedger();
    const xai = ledger.tokens.find((t) => t.symbol === "XAI") ?? null;
    if (xai !== null && xai.unconvertedUsd !== null && xai.unconvertedUsd !== undefined) {
      strandedShort = `$${Math.round(xai.unconvertedUsd / 1000)}k`;
      strandedFull = `$${Math.round(xai.unconvertedUsd).toLocaleString("en-US")}`;
    }
  } catch {
    strandedShort = null;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
      <section
        aria-label="Look up a wallet"
        className={`grid content-start gap-8 pt-8 sm:pt-12 lg:grid-cols-[1fr_320px] ${lookupRequested ? "" : "min-h-[calc(100dvh-56px)]"}`}
      >
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Pre-IPO conversion window</p>
          <h1 className="mt-2 max-w-xl text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[40px]">
            Your pre-IPO tokens have a deadline.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-2)]">
            PreStocks tokens convert into the public stock after an IPO. Miss the window and they expire worthless.
          </p>
          <form method="get" action="/" className="mt-6 flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              name="wallet"
              placeholder="Paste a Solana wallet address"
              defaultValue={wallet}
              spellCheck={false}
              autoComplete="off"
              className="num min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus-visible:border-[var(--text-2)]"
            />
            <button type="submit" className="btn-primary px-6 py-3 text-sm">
              Look up
            </button>
          </form>
          <p className="mt-3 text-sm text-[var(--text-2)]">
            <Link className="underline" href={`/?wallet=${STRANDED_WALLET}`}>
              Try a real stranded wallet
            </Link>
          </p>
        </div>
        <aside aria-label="Stranded value" className="card h-fit min-w-0 p-4 sm:p-6">
          <p className="text-sm text-[var(--text-3)]">Stranded XAI right now</p>
          {strandedShort !== null ? (
            <Link href="/ledger" className="mt-3 inline-block" aria-label={`See the ledger board, ${strandedFull ?? strandedShort} stranded`}>
              <SplitFlap value={strandedShort} size="md" label={`${strandedShort} stranded, see the ledger`} />
            </Link>
          ) : (
            <p className="num mt-3 text-sm text-[var(--text-2)]">Board unavailable right now.</p>
          )}
          <p className="mt-3 text-sm text-[var(--text-2)]">
            <Link href="/ledger" className="underline">See the board</Link>
          </p>
        </aside>
      </section>

      {lookupRequested && (
        <Suspense fallback={<p className="num mt-8 text-sm text-[var(--text-2)]">Reading wallet...</p>}>
          <LookupSection wallet={wallet} />
        </Suspense>
      )}
    </main>
  );
}
