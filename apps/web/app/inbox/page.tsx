import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InboxList } from "@/components/inbox-list";
import { getUniverseFeed, getWalletEvents } from "@/components/inbox-data";
import { shorten } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inbox | Last call for pre-IPO holders",
};

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface PageProps {
  searchParams?: Promise<{ wallet?: string | string[] }>;
}

function readTime(events: { asOfUnix: number }[]): string | null {
  if (events.length === 0) return null;
  const latest = Math.max(...events.map((e) => e.asOfUnix));
  return new Date(latest * 1000).toISOString().slice(0, 10);
}

async function WalletInbox({ wallet }: { wallet: string }): Promise<React.ReactNode> {
  if (!ADDRESS_PATTERN.test(wallet)) {
    return <p className="mt-4 text-sm text-[var(--closed)]">That does not look like a Solana wallet address.</p>;
  }
  try {
    const events = await getWalletEvents(wallet);
    if (events.length === 0) {
      return (
        <p className="mt-4 text-sm text-[var(--text-2)]">
          This wallet holds no tracked tokens with corporate-action events right now.
        </p>
      );
    }
    const read = readTime(events);
    return (
      <>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <p className="num min-w-0 break-all text-sm text-[var(--text-2)]">
            <a
              href={`https://solscan.io/account/${wallet}`}
              title={wallet}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Wallet {shorten(wallet)}
            </a>
          </p>
          <Link href={`/api/inbox.ics?wallet=${wallet}`} className="ml-auto text-sm underline">
            Add to calendar
          </Link>
        </div>
        <InboxList events={events} wallet={wallet} />
        {read !== null && (
          <p className="num mt-6 text-xs text-[var(--text-3)]">Read from Solana mainnet on {read} UTC.</p>
        )}
      </>
    );
  } catch (err) {
    return (
      <p className="mt-4 text-sm text-[var(--closed)]">
        Could not read this inbox right now: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }
}

async function UniverseFeed(): Promise<React.ReactNode> {
  try {
    const events = await getUniverseFeed();
    const read = readTime(events);
    return (
      <>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
          The latest on-chain events across every tracked mint: conversion deadlines first, then fee
          changes and pauses, then dividends and splits.
        </p>
        <InboxList events={events} wallet={null} />
        {read !== null && (
          <p className="num mt-6 text-xs text-[var(--text-3)]">Read from Solana mainnet on {read} UTC.</p>
        )}
      </>
    );
  } catch (err) {
    return (
      <p className="mt-4 text-sm text-[var(--closed)]">
        Could not read the feed right now: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }
}

export default async function InboxPage({ searchParams }: PageProps): Promise<React.ReactNode> {
  const resolved = searchParams !== undefined ? await searchParams : undefined;
  const rawWallet = resolved?.wallet;
  const wallet = Array.isArray(rawWallet) ? (rawWallet[0] ?? "") : (rawWallet ?? "");
  const hasWallet = wallet !== "";

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
      <section aria-label="Corporate-action inbox" className="mt-8 min-w-0">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Corporate-action inbox</p>
        <h1 className="mt-2 max-w-xl text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[40px]">
          {hasWallet ? "Your inbox." : "Every deadline, on chain."}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-2)]">
          {hasWallet
            ? "Conversion deadlines, fee changes and payouts on the tokens this wallet holds."
            : "Conversion deadlines, fee changes and payouts across every tracked mint."}
        </p>
        <form method="get" action="/inbox" className="mt-6 flex min-w-0 max-w-xl flex-col gap-2 sm:flex-row">
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
      </section>

      <Suspense fallback={<p className="num mt-8 text-sm text-[var(--text-2)]">Reading on-chain events...</p>}>
        {hasWallet ? <WalletInbox wallet={wallet} /> : <UniverseFeed />}
      </Suspense>
    </main>
  );
}
