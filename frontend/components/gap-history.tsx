import { getGapHistory } from "@/app/api/gap-history/data";
import { GapChart } from "@/components/gap-chart";
import { gapSignal } from "@/components/gap-signal";

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function GapHistoryFallback(): React.ReactNode {
  return (
    <div data-gap-chart="" aria-busy="true" className="card min-w-0 p-4 sm:p-6">
      <p className="num text-xs text-[var(--text-2)]">Loading conversion-gap history...</p>
    </div>
  );
}

function GapHistoryError(): React.ReactNode {
  return (
    <div data-gap-chart="" role="alert" className="card min-w-0 p-4 sm:p-6">
      <p className="num text-xs text-[var(--text-2)]">Gap history is unavailable. Try again when the price feeds respond.</p>
    </div>
  );
}

export async function GapHistory(): Promise<React.ReactNode> {
  let data: Awaited<ReturnType<typeof getGapHistory>>;
  try {
    data = await getGapHistory();
  } catch {
    return <GapHistoryError />;
  }

  if (data.points.length === 0) {
    return (
      <div data-gap-chart="" className="card min-w-0 p-4 sm:p-6">
        <p className="num text-xs text-[var(--text-2)]">No daily gap points are available yet. Check again after the next daily close.</p>
        <p className="num mt-2 text-xs text-[var(--text-2)]">Current gap: {formatPct(data.currentGapPct)}</p>
      </div>
    );
  }

  return (
    <div data-gap-chart="" className="card min-w-0 p-4 sm:p-6">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="min-w-0 text-sm font-bold text-[var(--text)] sm:text-base">Conversion gap history</h2>
        <span className="num shrink-0 text-xs text-[var(--text-3)]">{data.points.length} days</span>
      </div>
      <GapChart points={data.points} currentGapPct={data.currentGapPct} />
      <div
        className="num mt-4 rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]"
        role="status"
        aria-live="polite"
      >
        {gapSignal(data.currentGapPct, data.points)}
      </div>
      <p className="num mt-3 min-w-0 break-words text-xs leading-relaxed text-[var(--text-3)]">
        Since {data.points[0].date}. Source: {data.source}
      </p>
    </div>
  );
}
