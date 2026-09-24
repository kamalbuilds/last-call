import type { GapPoint } from "@/app/api/gap-history/data";

interface GapChartProps {
  points: GapPoint[];
  currentGapPct: number;
}

const WIDTH = 720;
const HEIGHT = 200;
const LEFT = 48;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 30;

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string): string {
  return value.slice(5);
}

export function GapChart({ points, currentGapPct }: GapChartProps): React.ReactNode {
  if (points.length === 0 || !Number.isFinite(currentGapPct)) return null;

  const values = points.map((point) => point.gapPct);
  const rawMin = Math.min(...values, currentGapPct);
  const rawMax = Math.max(...values, currentGapPct);
  const spread = Math.max(rawMax - rawMin, 1);
  const low = Math.floor((rawMin - spread * 0.12) / 10) * 10;
  const high = Math.ceil((rawMax + spread * 0.12) / 10) * 10;
  const range = Math.max(high - low, 10);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number): number => LEFT + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const y = (value: number): number => TOP + ((high - value) / range) * plotHeight;
  const linePoints = points.map((point, index) => `${x(index).toFixed(2)},${y(point.gapPct).toFixed(2)}`).join(" ");
  const gridValues = [low, low + range / 2, high];
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="num mt-2 block h-auto w-full"
      role="img"
      aria-label={`SPACEX conversion gap history from ${points[0].date} to ${last.date}, current gap ${formatPct(currentGapPct)}`}
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={LEFT}
            y1={y(value)}
            x2={WIDTH - RIGHT}
            y2={y(value)}
            stroke="var(--line)"
            strokeWidth={1}
          />
          <text
            x={LEFT - 8}
            y={y(value) + 4}
            textAnchor="end"
            fontSize={12}
            fill="var(--text-2)"
            fontFamily="var(--font-geist-mono), monospace"
          >
            {formatPct(value)}
          </text>
        </g>
      ))}
      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--text-2)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={LEFT}
        y1={y(currentGapPct)}
        x2={WIDTH - RIGHT}
        y2={y(currentGapPct)}
        stroke="var(--closed)"
        strokeWidth={1}
        strokeDasharray="3 4"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(points.length - 1)} cy={y(last.gapPct)} r={3} fill="var(--text)" />
      <circle cx={WIDTH - RIGHT} cy={y(currentGapPct)} r={3} fill="var(--closed)" />
      <text
        x={WIDTH - RIGHT}
        y={Math.min(Math.max(y(currentGapPct) - 8, TOP + 10), HEIGHT - BOTTOM - 4)}
        textAnchor="end"
        fontSize={12}
        fill="var(--closed)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        Today {formatPct(currentGapPct)}
      </text>
      <text
        x={LEFT}
        y={HEIGHT - 8}
        textAnchor="start"
        fontSize={12}
        fill="var(--text-2)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        {formatDate(points[0].date)}
      </text>
      <text
        x={WIDTH - RIGHT}
        y={HEIGHT - 8}
        textAnchor="end"
        fontSize={12}
        fill="var(--text-2)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        {formatDate(last.date)}
      </text>
    </svg>
  );
}
