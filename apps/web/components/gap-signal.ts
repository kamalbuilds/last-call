export interface GapSignalPoint {
  date: string;
  gapPct: number;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function gapSignal(
  currentGapPct: number,
  points: GapSignalPoint[],
  today = new Date().toISOString().slice(0, 10),
): string {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(todayMs)) throw new Error("Invalid signal date");

  const cutoff = todayMs - 29 * 86_400_000;
  const recent = points.filter((point) => {
    const pointMs = Date.parse(`${point.date}T00:00:00Z`);
    return pointMs >= cutoff && pointMs <= todayMs;
  });
  if (recent.length === 0) {
    return `Wait: today's gap is ${formatPct(currentGapPct)} today. A 30-day low is not available yet.`;
  }

  const lowGap = Math.min(...recent.map((point) => point.gapPct));
  const distance = currentGapPct - lowGap;
  if (distance <= 2) {
    return `Convert now. Today's gap is ${formatPct(currentGapPct)}, within 2 points of its 30-day low (${formatPct(lowGap)}).`;
  }
  return `Wait: today's gap is ${distance.toFixed(1)} points above its 30-day low (${formatPct(currentGapPct)} today, ${formatPct(lowGap)} low).`;
}
