"use client";
import { CheckCircle, XCircle } from "@phosphor-icons/react";

export interface ProofCheck {
  name: string;
  command: string;
  ok: boolean;
  output: string;
  ranAt: string;
}

const PROOF_LINES: Record<string, string> = {
  "convert-sim": "Builds the sponsored XAI to SPACEX transaction for the stranded holder and simulates it on Solana mainnet.",
  "sponsor-guard": "Checks the sponsor co-signs a valid conversion and rejects three malicious variants.",
  "ledger-recount": "Recomputes XAI stranded totals from chain reads plus Jupiter and matches the published board.",
  "slice-plan": "Requotes the SPACEX slice plan against live Jupiter prices instead of trusting its own math.",
  events: "Recomputes token and wallet events from fresh RPC reads and matches the events API.",
};

function short(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ProofCheckRow({ check }: { check: ProofCheck }): React.ReactNode {
  const color = check.ok ? "var(--boarding)" : "var(--closed)";
  const StatusIcon = check.ok ? CheckCircle : XCircle;
  return (
    <article className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="num text-base font-bold text-[var(--text)]">{check.name}</h2>
        <span className="chip" style={{ color, borderColor: color }}>
          <span className="inline-flex items-center gap-1.5">
            <StatusIcon size={14} weight="bold" aria-hidden="true" />
            {check.ok ? "PASS" : "FAIL"}
          </span>
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
        {PROOF_LINES[check.name] ?? "Reruns an independent check from the repo root and records the result."}
      </p>
      <p className="num mt-3 min-w-0 break-all text-sm leading-relaxed text-[var(--text)]">
        {check.output}
      </p>
      <dl className="num mt-3 flex min-w-0 flex-col gap-1 text-xs text-[var(--text-3)]">
        <div className="flex min-w-0 flex-wrap gap-x-2">
          <dt className="shrink-0">Ran at</dt>
          <dd className="min-w-0 break-all">{check.ranAt}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-2">
          <dt className="shrink-0">Command</dt>
          <dd className="min-w-0 break-all">{check.command}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ProofAccountRow({
  label,
  address,
}: {
  label: string;
  address: string;
}): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <span className="text-sm text-[var(--text-3)]">{label}</span>
      <a
        href={`https://solscan.io/account/${address}`}
        title={address}
        target="_blank"
        rel="noreferrer"
        className="num min-w-0 break-all text-sm text-[var(--text)] underline"
      >
        {short(address)}
      </a>
    </div>
  );
}
