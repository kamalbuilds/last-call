import Link from "next/link";
import type { LastCallEvent } from "@lastcall/events";
import { SolscanLink } from "@/components/solscan-link";
import { shorten } from "@/lib/ledger";
import { dayOf, formatAmount, formatUsd } from "@/components/inbox-data";

function Chip({ color, border, children }: { color: string; border?: string; children: React.ReactNode }): React.ReactNode {
  return (
    <span className="chip" style={{ color, borderColor: border ?? color }}>
      {children}
    </span>
  );
}

function EventCard({ event, wallet }: { event: LastCallEvent; wallet: string | null }): React.ReactNode {
  if (event.type === "conversion") {
    const expired = event.expired;
    return (
      <article className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="num text-base font-bold text-[var(--text)]">{event.symbol}</p>
          {expired ? (
            <Chip color="var(--closed)">EXPIRED</Chip>
          ) : (
            <Chip color="var(--boarding)">OPEN</Chip>
          )}
          <p className="num ml-auto text-sm text-[var(--text-3)]">{dayOf(event.deadline)}</p>
        </div>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          Conversion deadline{expired ? ", now expired" : ""}. Converts into {event.convertsIntoSymbol ?? "its public stock"}.
        </p>
        <dl className="num mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          {event.amount !== null && (
            <div className="flex gap-2">
              <dt className="text-[var(--text-3)]">Held</dt>
              <dd className="text-[var(--text)]">
                {formatAmount(event.amount)} {event.symbol}
              </dd>
            </div>
          )}
          {event.usdValue !== null && (
            <div className="flex gap-2">
              <dt className="text-[var(--text-3)]">Value</dt>
              <dd className="text-[var(--text)]">{formatUsd(event.usdValue)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Mint <SolscanLink address={event.mint} short={shorten(event.mint)} />
        </p>
        {wallet !== null && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/?wallet=${wallet}`} className="btn-primary px-4 py-2 text-sm">
              Convert
            </Link>
          </div>
        )}
      </article>
    );
  }

  if (event.type === "fee_change") {
    return (
      <article className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="num text-base font-bold text-[var(--text)]">{event.symbol}</p>
          <Chip color="var(--text-2)" border="var(--line)">
            FEE CHANGE
          </Chip>
          <p className="num ml-auto text-sm text-[var(--text-3)]">epoch {event.currentEpoch}</p>
        </div>
        <p className="mt-2 text-sm text-[var(--text-2)]">Transfer fee change.</p>
        <p className="num mt-2 text-sm text-[var(--text)]">
          {event.olderBps} bps → {event.newerBps} bps{event.inForce ? ", in force now" : `, from epoch ${event.activationEpoch}`}
        </p>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Mint <SolscanLink address={event.mint} short={shorten(event.mint)} />
        </p>
      </article>
    );
  }

  if (event.type === "paused") {
    return (
      <article className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="num text-base font-bold text-[var(--text)]">{event.symbol}</p>
          <Chip color="var(--closed)">PAUSED</Chip>
        </div>
        <p className="mt-2 text-sm text-[var(--text-2)]">Transfers paused by the issuer.</p>
        {event.pausableAuthority !== null && (
          <p className="mt-2 text-sm text-[var(--text-3)]">
            Authority <SolscanLink address={event.pausableAuthority} short={shorten(event.pausableAuthority)} />
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Mint <SolscanLink address={event.mint} short={shorten(event.mint)} />
        </p>
      </article>
    );
  }

  const label = event.percentChange > 0 ? "DIVIDEND" : event.percentChange < 0 ? "SPLIT" : "MULTIPLIER UPDATE";
  const plain = event.percentChange > 0 ? "Dividend" : event.percentChange < 0 ? "Split" : "Multiplier update";
  return (
    <article className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="num text-base font-bold text-[var(--text)]">{event.symbol}</p>
        <Chip color="var(--text-2)" border="var(--line)">
          {label}
        </Chip>
        <p className="num ml-auto text-sm text-[var(--text-3)]">{dayOf(event.effectiveDate)}</p>
      </div>
      <p className="mt-2 text-sm text-[var(--text-2)]">
        {plain}{event.pending ? ", pending" : ""}. Multiplier {event.multiplier} → {event.newMultiplier} (
        {(event.percentChange * 100).toFixed(4)}%).
      </p>
      <p className="mt-2 text-sm text-[var(--text-3)]">
        Mint <SolscanLink address={event.mint} short={shorten(event.mint)} />
      </p>
    </article>
  );
}

export function InboxList({ events, wallet }: { events: LastCallEvent[]; wallet: string | null }): React.ReactNode {
  if (events.length === 0) {
    return <p className="mt-4 text-sm text-[var(--text-2)]">No corporate-action events right now. Try again in a minute.</p>;
  }
  return (
    <div className="mt-4 flex flex-col gap-3">
      {events.map((event) => (
        <EventCard key={`${event.mint}-${event.type}`} event={event} wallet={wallet} />
      ))}
    </div>
  );
}
