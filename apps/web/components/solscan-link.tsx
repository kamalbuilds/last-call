"use client";
import { ArrowSquareOut } from "@phosphor-icons/react";

/** Shortened address linking out to Solscan, with the full address as title. */
export function SolscanLink({ address, short }: { address: string; short: string }): React.ReactNode {
  return (
    <a
      href={`https://solscan.io/account/${address}`}
      title={address}
      target="_blank"
      rel="noreferrer"
      className="num inline-flex min-w-0 items-center gap-1 break-all underline"
    >
      {short}
      <ArrowSquareOut size={13} weight="regular" aria-hidden="true" className="shrink-0" />
    </a>
  );
}
