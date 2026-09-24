import { getLedger } from "@/lib/ledger";

/** Compact closing line: the repo, and when the numbers above were last read from chain. */
export async function HomeFooter(): Promise<React.ReactNode> {
  let readAt: string | null = null;
  try {
    const ledger = await getLedger();
    readAt = ledger.generatedAt.slice(0, 16).replace("T", " ");
  } catch {
    readAt = null;
  }

  return (
    <footer className="mt-12 min-w-0 border-t border-[var(--line)] pt-4 sm:mt-16">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href="https://github.com/kamalbuilds/last-call"
          target="_blank"
          rel="noreferrer"
          className="num text-xs text-[var(--text-2)] underline underline-offset-4"
        >
          github.com/kamalbuilds/last-call
        </a>
        <p className="num text-xs text-[var(--text-3)]">
          Read from Solana mainnet{readAt !== null ? ` at ${readAt} UTC` : ""}.
        </p>
      </div>
    </footer>
  );
}
