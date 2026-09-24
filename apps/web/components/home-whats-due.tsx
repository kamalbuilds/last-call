import Link from "next/link";
import type { LastCallEvent } from "@lastcall/events";
import { getUniverseFeed, dayOf } from "@/components/inbox-data";

function daysUntil(iso: string, nowMs: number): number {
  return Math.ceil((Date.parse(iso) - nowMs) / 86_400_000);
}

function DeadlineRow({ event, nowMs }: { event: Extract<LastCallEvent, { type: "conversion" }>; nowMs: number }): React.ReactNode {
  const days = daysUntil(event.deadline, nowMs);
  return (
    <Link
      href="/inbox"
      className="flex min-w-0 items-center gap-3 border-t border-[var(--line)] py-3 first:border-t-0"
    >
      <span className="num text-sm font-bold text-[var(--text)]">{event.symbol}</span>
      <span className="min-w-0 flex-1 text-sm text-[var(--text-2)]">
        Converts into {event.convertsIntoSymbol ?? "its public stock"} by {dayOf(event.deadline)}
      </span>
      <span className="num shrink-0 text-sm text-[var(--text-3)]">{days} days left</span>
    </Link>
  );
}

function ActionRow({ event }: { event: LastCallEvent }): React.ReactNode {
  let text: string;
  if (event.type === "fee_change") {
    const pct = (bps: number) => `${bps / 100}%`;
    text = event.inForce
      ? `${event.symbol}: transfer fee now ${pct(event.newerBps)} (was ${pct(event.olderBps)}), in force since epoch ${event.activationEpoch}`
      : `${event.symbol}: transfer fee rises ${pct(event.olderBps)} to ${pct(event.newerBps)} at epoch ${event.activationEpoch} (now ${event.currentEpoch}), scheduled on-chain`;
  } else if (event.type === "paused") {
    text = `${event.symbol}: transfers paused by the issuer`;
  } else if (event.type === "dividend_or_split") {
    const pct = (event.percentChange * 100).toFixed(2);
    text = `${event.symbol}: multiplier ${event.multiplier} to ${event.newMultiplier} (${pct}%)`;
  } else {
    text = `${event.symbol}: conversion deadline ${dayOf(event.deadline)}`;
  }
  return (
    <Link href="/inbox" className="flex min-w-0 items-center gap-3 border-t border-[var(--line)] py-3 first:border-t-0">
      <span className="min-w-0 flex-1 text-sm text-[var(--text-2)]">{text}</span>
      <span className="num shrink-0 text-xs text-[var(--text-3)]">Token-2022 config</span>
    </Link>
  );
}

/** Next deadlines and the most recent corporate actions, read from every tracked mint's own Token-2022 config. */
export async function HomeWhatsDue(): Promise<React.ReactNode> {
  let events: LastCallEvent[] | null = null;
  let error: string | null = null;
  try {
    events = await getUniverseFeed();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error !== null) {
    return (
      <section aria-label="What is due" className="mt-12 min-w-0 sm:mt-16">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">What is due</p>
        <p className="mt-3 max-w-xl text-sm text-[var(--closed)]">Could not read on-chain events right now: {error}</p>
      </section>
    );
  }

  const nowMs = Date.now();
  const upcoming = (events ?? [])
    .filter((e): e is Extract<LastCallEvent, { type: "conversion" }> => e.type === "conversion" && !e.expired)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
    .slice(0, 3);
  const recentActions = (events ?? []).filter((e) => e.type !== "conversion").slice(0, 3);

  return (
    <section aria-label="What is due" className="mt-12 min-w-0 sm:mt-16">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">What is due</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="card min-w-0 p-4 sm:p-6">
          <h2 className="num text-base font-bold text-[var(--text)]">Next deadlines</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-2)]">No open conversion deadlines right now.</p>
          ) : (
            <div className="mt-1 min-w-0">
              {upcoming.map((event) => (
                <DeadlineRow key={`${event.mint}-deadline`} event={event} nowMs={nowMs} />
              ))}
            </div>
          )}
        </div>
        <div className="card min-w-0 p-4 sm:p-6">
          <h2 className="num text-base font-bold text-[var(--text)]">Most recent corporate actions</h2>
          {recentActions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-2)]">No fee changes, pauses or dividends on record right now.</p>
          ) : (
            <div className="mt-1 min-w-0">
              {recentActions.map((event) => (
                <ActionRow key={`${event.mint}-${event.type}`} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
