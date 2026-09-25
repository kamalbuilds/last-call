"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CaretDown, List, X } from "@phosphor-icons/react";
import { useWallet } from "@/lib/use-wallet";

const FALLBACK_BROWSE = "https://phantom.app/ul/browse/";

const LINKS = [
  { href: "/ledger", label: "Board" },
  { href: "/inbox", label: "Inbox" },
  { href: "/inbox#pyth", label: "Pyth" },
  { href: "/compliance", label: "Compliance" },
  { href: "/analytics", label: "Analytics" },
  { href: "/proof", label: "Proof" },
  { href: "/pitch", label: "Pitch" },
  { href: "/docs", label: "Docs" },
];

function short(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** Compact wallet control: connect menu before, address + actions after. */
function WalletControl(): React.ReactNode {
  const { wallets, connected, connecting, error, connect, disconnect } = useWallet();
  const [browseHref, setBrowseHref] = useState<string>(FALLBACK_BROWSE);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const url = window.location.href;
    const origin = window.location.origin;
    setBrowseHref(`https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`);
  }, []);

  const hint = useMemo(() => {
    if (connected !== null) return null;
    if (wallets.length > 0) return "Pick a wallet to connect.";
    return "No wallet extension found here. Open this page inside Phantom to connect on mobile.";
  }, [connected, wallets]);

  return (
    <details id="connect" className="group relative">
      <summary
        className="btn-ghost flex list-none items-center gap-2 px-3 py-2 text-sm font-bold [&::-webkit-details-marker]:hidden"
      >
        {connected !== null ? (
          <span className="num text-[var(--text)]">{short(connected.address)}</span>
        ) : (
          <span>{connecting || loading ? "Connecting" : "Connect wallet"}</span>
        )}
        <CaretDown size={12} weight="bold" aria-hidden="true" className="text-[var(--text-3)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="card absolute right-0 top-full z-50 mt-2 w-72 p-4">
        {connected === null ? (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">Connect wallet</p>
            <div className="mt-3 flex flex-col gap-2">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void connect(w).finally(() => setLoading(false));
                  }}
                  disabled={connecting || loading}
                  className="btn-ghost px-3 py-2 text-left text-sm font-bold disabled:opacity-50"
                >
                  {connecting || loading ? "Connecting" : `Connect ${w.name}`}
                </button>
              ))}
              <a href={browseHref} className="btn-ghost px-3 py-2 text-sm font-bold">
                Open in Phantom
              </a>
            </div>
            {hint !== null && <p className="mt-3 text-xs leading-relaxed text-[var(--text-3)]">{hint}</p>}
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{connected.name}</p>
            <p className="num mt-1 break-all text-sm text-[var(--text)]">{connected.address}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Link href={`/inbox?wallet=${connected.address}`} className="btn-ghost px-3 py-2 text-sm font-bold">
                View my inbox
              </Link>
              <button type="button" onClick={() => void disconnect()} className="btn-ghost px-3 py-2 text-sm font-bold">
                Disconnect
              </button>
            </div>
          </>
        )}
        {error !== null && <p className="mt-3 text-xs text-[var(--closed)]">{error}</p>}
      </div>
    </details>
  );
}

/** Sticky top navbar: wordmark, primary links, wallet control. */
export function Navbar(): React.ReactNode {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="num shrink-0 text-sm font-bold tracking-[0.08em] text-[var(--text)]">
          LAST CALL
        </Link>

        <nav className="hidden flex-1 items-center gap-6 text-sm lg:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-[var(--text-2)] hover:text-[var(--text)]">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
            className="btn-ghost p-2 lg:hidden"
          >
            {menuOpen ? <X size={16} weight="bold" /> : <List size={16} weight="bold" />}
          </button>
          <WalletControl />
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-[var(--line)] px-4 py-3 lg:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
