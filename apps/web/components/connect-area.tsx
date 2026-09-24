"use client";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/use-wallet";

const FALLBACK_BROWSE = "https://phantom.app/ul/browse/";

/** Wallet connect area with detected wallets and a Phantom deep link. */
export function ConnectArea(): React.ReactNode {
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
    <section id="connect" aria-label="Connect wallet" className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <h2 className="num text-sm text-[var(--text-2)]">Connect wallet</h2>
      {connected === null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {wallets.map((w) => (
            <button
              key={w.name}
              type="button"
              onClick={() => {
                setLoading(true);
                void connect(w).finally(() => setLoading(false));
              }}
              disabled={connecting || loading}
              className="btn-ghost px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {connecting || loading ? "Connecting" : `Connect ${w.name}`}
            </button>
          ))}
          <a href={browseHref} className="btn-ghost inline-block px-4 py-2 text-sm font-bold">
            Open in Phantom
          </a>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="num min-w-0 break-all text-sm text-[var(--text)]">
            {connected.name}: {connected.address.slice(0, 4)}...{connected.address.slice(-4)}
          </span>
          <button type="button" onClick={() => void disconnect()} className="btn-ghost px-3 py-1.5 text-xs">
            Disconnect
          </button>
        </div>
      )}
      {hint !== null && <p className="mt-2 text-sm text-[var(--text-3)]">{hint}</p>}
      {error !== null && <p className="mt-2 text-sm text-[var(--closed)]">{error}</p>}
    </section>
  );
}
