import type { Metadata } from "next";
import { Suspense } from "react";
import { getConversions, type ConversionsResponse } from "@/app/api/conversions/data";
import { GapHistory, GapHistoryFallback } from "@/components/gap-history";
import { getLedger, type LedgerToken } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics | Last call for pre-IPO holders",
};

const STATED_RATIO = 0.7165;

function Card({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div className="card min-w-0 p-4 sm:p-6">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="min-w-0 text-sm font-bold text-[var(--text)] sm:text-base">{title}</h2>
        {meta !== undefined && <span className="num shrink-0 text-xs text-[var(--text-3)]">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/** Realized SPACEX per XAI for every on-chain conversion, against the stated 0.7165 line. */
function RatioChart({ data }: { data: ConversionsResponse }): React.ReactNode {
  const W = 720, H = 220, L = 52, R = 12, T = 12, B = 30;
  const pts = data.trades.map((t) => ({ x: Date.parse(t.time), y: t.realizedRatio })).sort((a, b) => a.x - b.x);
  const ys = [...pts.map((p) => p.y), STATED_RATIO];
  const lo = Math.min(...ys) * 0.95, hi = Math.max(...ys) * 1.05;
  const x0 = pts[0].x, x1 = Math.max(pts[pts.length - 1].x, x0 + 1);
  const sx = (x: number): number => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y: number): number => T + ((hi - y) / (hi - lo)) * (H - T - B);
  return (
    <svg data-ratio-chart="" viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label="Realized conversion ratio per trade versus the stated 0.7165">
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line)" />
          <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="num" fontSize="11" fill="var(--text-3)">{v.toFixed(3)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={sy(STATED_RATIO)} y2={sy(STATED_RATIO)} stroke="var(--text-2)" strokeDasharray="4 4" />
      <text x={W - R} y={sy(STATED_RATIO) - 6} textAnchor="end" fontSize="11" fill="var(--text-2)" className="num">stated 0.7165</text>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={p.y < STATED_RATIO ? "var(--closed)" : "var(--boarding)"} />
      ))}
      <text x={L} y={H - 8} fontSize="11" fill="var(--text-3)" className="num">{new Date(x0).toISOString().slice(0, 10)}</text>
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="11" fill="var(--text-3)" className="num">{new Date(x1).toISOString().slice(0, 10)}</text>
    </svg>
  );
}

async function Conversions(): Promise<React.ReactNode> {
  let data: ConversionsResponse;
  try {
    data = await getConversions("XAI");
  } catch (err) {
    return <Card title="XAI to SPACEX conversions"><p className="mt-3 text-sm text-[var(--closed)]">Unavailable: {err instanceof Error ? err.message : String(err)}</p></Card>;
  }
  if (data.trades.length === 0) {
    return <Card title="XAI to SPACEX conversions"><p className="mt-3 text-sm text-[var(--text-2)]">No conversions in the latest read. {data.source}</p></Card>;
  }
  const xai = data.trades.reduce((s, t) => s + t.xaiIn, 0);
  const spx = data.trades.reduce((s, t) => s + t.spacexOut, 0);
  const below = data.trades.filter((t) => t.realizedRatio < STATED_RATIO).length;
  return (
    <Card title="XAI to SPACEX conversions: realized vs stated ratio" meta={`${data.trades.length} trades`}>
      <RatioChart data={data} />
      <dl className="num mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-[var(--text-3)]">Volume-weighted ratio</dt><dd data-weighted-ratio={(spx / xai).toFixed(4)} className="text-[var(--text)]">{(spx / xai).toFixed(4)}</dd></div>
        <div><dt className="text-xs text-[var(--text-3)]">Median shortfall</dt><dd data-median-shortfall={data.medianShortfallPct?.toFixed(2) ?? ""} className="text-[var(--text)]">{data.medianShortfallPct === null ? "n/a" : `${data.medianShortfallPct.toFixed(2)}%`}</dd></div>
        <div><dt className="text-xs text-[var(--text-3)]">Below 0.7165</dt><dd className="text-[var(--text)]">{below} of {data.trades.length}</dd></div>
        <div><dt className="text-xs text-[var(--text-3)]">XAI converted</dt><dd className="text-[var(--text)]">{xai.toLocaleString("en-US", { maximumFractionDigits: 2 })}</dd></div>
      </dl>
      <p className="num mt-3 break-words text-xs text-[var(--text-3)]">Source: {data.source}</p>
    </Card>
  );
}

/** Horizontal bars, one per token, largest first. */
function Bars({ rows, format, attr }: { rows: { label: string; value: number }[]; format: (v: number) => string; attr: string }): React.ReactNode {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="mt-4 flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} data-bar={attr} data-label={r.label} data-value={r.value} className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
          <span className="num truncate text-xs text-[var(--text)]">{r.label}</span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden="true">
            <rect width="100" height="8" fill="var(--panel-2)" />
            <rect width={(r.value / max) * 100} height="8" fill="var(--text-2)" />
          </svg>
          <span className="num text-xs text-[var(--text-2)]">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

async function LedgerCharts(): Promise<React.ReactNode> {
  let tokens: LedgerToken[];
  let generatedAt: string;
  try {
    const l = await getLedger();
    tokens = l.tokens;
    generatedAt = l.generatedAt;
  } catch (err) {
    return <Card title="Unconverted value and holders"><p className="mt-3 text-sm text-[var(--closed)]">Unavailable: {err instanceof Error ? err.message : String(err)}</p></Card>;
  }
  const value = tokens
    .filter((t) => typeof t.unconvertedUsd === "number" && t.unconvertedUsd > 0)
    .map((t) => ({ label: t.symbol, value: t.unconvertedUsd as number }))
    .sort((a, b) => b.value - a.value);
  const holders = tokens.map((t) => ({ label: t.symbol, value: t.holderCount })).sort((a, b) => b.value - a.value);
  const priced = tokens.length - value.length;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Unconverted value per token" meta={`$${Math.round(value.reduce((s, r) => s + r.value, 0)).toLocaleString("en-US")}`}>
        <Bars rows={value} attr="unconverted" format={(v) => `$${Math.round(v).toLocaleString("en-US")}`} />
        {priced > 0 && <p className="mt-3 text-xs text-[var(--text-3)]">{priced} tokens have no live price, so no USD value is shown for them.</p>}
      </Card>
      <Card title="Holder wallets per token" meta={`${holders.reduce((s, r) => s + r.value, 0).toLocaleString("en-US")} wallets`}>
        <Bars rows={holders} attr="holders" format={(v) => v.toLocaleString("en-US")} />
        <p className="num mt-3 text-xs text-[var(--text-3)]">Ledger generated {generatedAt.slice(0, 19).replace("T", " ")} UTC.</p>
      </Card>
    </div>
  );
}

export default function AnalyticsPage(): React.ReactNode {
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
      <section className="mt-8 min-w-0">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Analytics</p>
        <h1 className="mt-2 max-w-2xl text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[40px]">How the conversion is actually going.</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-2)]">
          The XAI to SPACEX price gap over time, what real conversions paid against the stated 0.7165, and how much value and how
          many wallets are still unconverted. Every chart is drawn from the same live reads as /api/gap-history, /api/conversions and /api/ledger.
        </p>
      </section>
      <section aria-label="Gap history" className="mt-10">
        <Suspense fallback={<GapHistoryFallback />}>
          <GapHistory />
        </Suspense>
      </section>
      <section aria-label="Conversions" className="mt-6">
        <Suspense fallback={<p className="num text-sm text-[var(--text-2)]">Reading conversions...</p>}>
          <Conversions />
        </Suspense>
      </section>
      <section aria-label="Unconverted value and holders" className="mt-6">
        <Suspense fallback={<p className="num text-sm text-[var(--text-2)]">Reading the ledger...</p>}>
          <LedgerCharts />
        </Suspense>
      </section>
    </main>
  );
}
