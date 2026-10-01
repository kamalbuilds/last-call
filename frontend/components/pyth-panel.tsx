import { getPythBoard, type PythRow } from "@/lib/pyth-board";
import { SPACEX_PRESTOCKS_MINT, SPCXX_MINT } from "@lastcall/pyth";

function usd(v: number | null): string {
  return v === null ? "n/a" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function when(unix: number): string {
  return `${new Date(unix * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

const STATUS_LABEL: Record<PythRow["status"], string> = {
  live: "LIVE",
  not_entitled: "NOT ENTITLED",
  no_feed: "NO FEED",
  no_key: "NO KEY",
  error: "ERROR",
};

function Row({ row }: { row: PythRow }): React.ReactNode {
  const live = row.status === "live";
  return (
    <div
      data-pyth-row={row.symbol}
      data-feed={row.feedSymbol}
      data-status={row.status}
      className="card grid grid-cols-2 gap-x-4 gap-y-2 p-4 sm:grid-cols-[1fr_1.6fr_1fr_1fr_0.8fr_1.2fr] sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0 sm:py-3"
    >
      <div className="min-w-0">
        <p className="num text-sm font-bold text-[var(--text)]">{row.symbol}</p>
        <span className="chip mt-1" style={{ color: live ? "var(--boarding)" : "var(--text-3)", borderColor: live ? "var(--boarding)" : "var(--line)" }}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      <p className="num min-w-0 break-all text-xs text-[var(--text-2)]">{row.feedSymbol}</p>
      <div className="num text-sm">
        <p className="text-xs text-[var(--text-3)] sm:hidden">Pyth</p>
        <p data-pyth-price={row.pythPrice ?? ""} className="text-[var(--text)]">{usd(row.pythPrice)}</p>
        {row.confidence !== null && <p className="text-xs text-[var(--text-3)]">± {row.confidence.toFixed(4)}</p>}
      </div>
      <div className="num text-sm">
        <p className="text-xs text-[var(--text-3)] sm:hidden">Jupiter</p>
        <p className="text-[var(--text)]">{usd(row.marketPrice)}</p>
      </div>
      <div className="num text-sm">
        <p className="text-xs text-[var(--text-3)] sm:hidden">Gap</p>
        <p data-gap-bps={row.gapBps ?? ""} className="text-[var(--text)]">
          {row.gapBps === null ? "n/a" : `${row.gapBps >= 0 ? "+" : ""}${row.gapBps.toFixed(1)} bps`}
        </p>
      </div>
      <div className="col-span-2 min-w-0 text-xs text-[var(--text-3)] sm:col-span-1">
        {row.publishTimeUnix !== null && <p className="num">Published {when(row.publishTimeUnix)}</p>}
        {row.note !== "" && <p className={live ? "mt-1" : "text-[var(--text-2)]"}>{row.note}</p>}
      </div>
    </div>
  );
}

function Header(): React.ReactNode {
  return (
    <div className="num mt-4 hidden grid-cols-[1fr_1.6fr_1fr_1fr_0.8fr_1.2fr] gap-4 border-b border-[var(--line)] pb-2 text-xs text-[var(--text-3)] sm:grid">
      <span>Token</span>
      <span>Pyth feed</span>
      <span>Pyth price</span>
      <span>Jupiter price</span>
      <span>Gap</span>
      <span>Publish time</span>
    </div>
  );
}

/** Pyth oracle cross-check for SPACEX, SPCXx and every xStock, next to Jupiter's on-chain price. */
export async function PythPanel(): Promise<React.ReactNode> {
  let board: Awaited<ReturnType<typeof getPythBoard>>;
  try {
    board = await getPythBoard();
  } catch (err) {
    return (
      <section id="pyth" className="mt-12 card p-4 sm:p-6" role="alert">
        <p className="text-sm text-[var(--closed)]">Could not read Pyth prices right now: {err instanceof Error ? err.message : String(err)}</p>
      </section>
    );
  }
  const focus = board.rows.filter((r) => r.status === "live" || r.mint === SPACEX_PRESTOCKS_MINT || r.mint === SPCXX_MINT);
  const rest = board.rows.filter((r) => !focus.includes(r));
  return (
    <section id="pyth" aria-label="Pyth price cross-check" className="mt-12 min-w-0 scroll-mt-20">
      <h2 className="text-[20px] font-bold text-[var(--text)]">Pyth oracle vs on-chain price</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
        Pyth Hermes prices for each public stock, next to Jupiter&apos;s live price for the token that tracks it. The gap is
        (Jupiter minus Pyth) over Pyth. Each row shows its feed status, and a price appears only when Hermes serves a live one.
      </p>
      <p className="num mt-2 text-xs text-[var(--text-3)]">
        Live feeds: {board.liveFeeds.length > 0 ? board.liveFeeds.join(", ") : "none"}. Read {board.readAt.slice(0, 19).replace("T", " ")} UTC.
      </p>
      <Header />
      <div className="flex flex-col gap-3 sm:gap-0">
        {focus.map((r) => (
          <Row key={`${r.mint}-${r.feedSymbol}`} row={r} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-2)] underline">
            {rest.length} more xStocks, {rest.filter((r) => r.status === "live").length} with a live Pyth price
          </summary>
          <div className="mt-2 flex flex-col gap-3 sm:gap-0">
            {rest.map((r) => (
              <Row key={`${r.mint}-${r.feedSymbol}`} row={r} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
