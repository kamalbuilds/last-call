import { getGapHistory } from "@/app/api/gap-history/data";
import { GapChart } from "@/components/gap-chart";
import { gapSignal } from "@/components/gap-signal";

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function GapHistoryFallback(): React.ReactNode {
  return (
    <div
      data-gap-chart=""
      aria-busy="true"
      className="mt-4 min-w-0 border-t border-[var(--line)] pt-3"
    >
      <p className="num text-xs text-[var(--text-2)]">Loading conversion-gap history...</p>
    </div>
  );
}

function GapHistoryError(): React.ReactNode {
  return (
    <div
      data-gap-chart=""
      role="alert"
      className="mt-4 min-w-0 border-t border-[var(--line)] pt-3"
    >
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
      <div
        data-gap-chart=""
        className="mt-4 min-w-0 border-t border-[var(--line)] pt-3"
      >
        <p className="num text-xs text-[var(--text-2)]">No daily gap points are available yet. Check again after the next daily close.</p>
        <p className="num mt-2 text-xs text-[var(--text-2)]">Current gap: {formatPct(data.currentGapPct)}</p>
      </div>
    );
  }

  return (
    <div
      data-gap-chart=""
      className="mt-4 min-w-0 border-t border-[var(--line)] pt-3"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="num min-w-0 text-xs text-[var(--text-2)]">Conversion gap history</h3>
        <span className="num shrink-0 text-xs text-[var(--text-2)]">{data.points.length} days</span>
      </div>
      <GapChart points={data.points} currentGapPct={data.currentGapPct} />
      <p className="num mt-2 min-w-0 break-words text-xs leading-relaxed text-[var(--text-2)]">
        Since {data.points[0].date}. Source: {data.source}
      </p>
      <p
        className="num mt-2 text-xs leading-relaxed text-[var(--text)]"
        role="status"
        aria-live="polite"
      >
        {gapSignal(data.currentGapPct, data.points)}
      </p>
    </div>
  );
}
