interface Marker {
  at: number;
  label: string;
  sub?: string;
  color: "text" | "muted" | "closed";
}

const COLORS: Record<Marker["color"], string> = {
  text: "var(--text)",
  muted: "var(--text-3)",
  closed: "var(--closed)",
};

function layout(
  startIso: string,
  endIso: string,
  markers: Marker[],
  nowMs: number,
): { x: (ms: number) => number; nowX: number } {
  const W = 1200;
  const PAD = 8;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const x = (ms: number): number => {
    const t = Math.min(1, Math.max(0, (ms - start) / (end - start)));
    return PAD + t * (W - PAD * 2);
  };
  return { x, nowX: x(nowMs) };
}

/** Horizontal flight timeline drawn as SVG. */
export function Timeline({ variant, nowMs }: { variant: "xai" | "spacex"; nowMs: number }): React.ReactNode {
  const W = 1200;
  const Y = 44;
  if (variant === "spacex") {
    const start = "2026-06-12T00:00:00Z";
    const end = "2027-03-12T23:59:00Z";
    const { x, nowX } = layout(start, end, [], nowMs);
    const x0 = x(Date.parse(start));
    const x1 = x(Date.parse(end));
    const stops: Marker[] = [
      { at: Date.parse("2026-06-12T00:00:00Z"), label: "IPO 2026-06-12", color: "muted" },
      { at: Date.parse("2026-07-12T00:00:00Z"), label: "+1 unlock", color: "muted" },
      { at: Date.parse("2026-09-12T00:00:00Z"), label: "+3 unlock", color: "muted" },
      { at: Date.parse("2026-12-12T00:00:00Z"), label: "+6 unlock", color: "muted" },
      { at: Date.parse("2027-03-12T23:59:00Z"), label: "Deadline 2027-03-12", color: "text" },
    ];
    return (
      <svg viewBox={`0 0 ${W} 110`} className="block h-auto w-full min-w-[560px]" role="img" aria-label="SPACEX timeline from IPO to Deadline">
        <line x1={x0} y1={Y} x2={Math.max(nowX, x0)} y2={Y} stroke="var(--text-2)" strokeWidth={2} />
        <line x1={Math.max(nowX, x0)} y1={Y} x2={x1} y2={Y} stroke="var(--line)" strokeWidth={2} />
        {stops.map((s, i) => (
          <g key={s.label}>
            <line x1={x(s.at)} y1={Y - 8} x2={x(s.at)} y2={Y + 8} stroke={COLORS[s.color]} strokeWidth={1.5} />
            <text
              x={Math.min(Math.max(x(s.at), 60), W - 90)}
              y={i % 2 === 0 ? Y + 28 : Y + 44}
              textAnchor="middle"
              fontSize={12}
              fill={COLORS[s.color]}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {s.label}
            </text>
          </g>
        ))}
        <g>
          <line x1={nowX} y1={Y - 12} x2={nowX} y2={Y + 12} stroke="var(--text)" strokeWidth={1.5} />
          <circle cx={nowX} cy={Y} r={4} fill="var(--text)" />
          <text x={Math.min(Math.max(nowX, 30), W - 30)} y={Y - 18} textAnchor="middle" fontSize={12} fill="var(--text)" fontFamily="var(--font-geist-mono), monospace">
            Today
          </text>
        </g>
      </svg>
    );
  }
  const start = "2026-02-01T00:00:00Z";
  const end = "2026-09-12T23:59:00Z";
  const { x, nowX } = layout(start, end, [], nowMs);
  const x0 = x(Date.parse(start));
  const x1 = x(Date.parse(end));
  return (
    <svg viewBox={`0 0 ${W} 110`} className="block h-auto w-full min-w-[560px]" role="img" aria-label="XAI timeline from Conversion opened to Deadline">
      <line x1={x0} y1={Y} x2={x1} y2={Y} stroke="var(--text-2)" strokeWidth={2} />
      <g>
        <line x1={x0} y1={Y - 8} x2={x0} y2={Y + 8} stroke="var(--text-3)" strokeWidth={1.5} />
        <text x={x0} y={Y + 28} textAnchor="start" fontSize={12} fill="var(--text-3)" fontFamily="var(--font-geist-mono), monospace">
          Conversion opened 2026-02-01
        </text>
      </g>
      <g>
        <line x1={x1} y1={Y - 8} x2={x1} y2={Y + 8} stroke="var(--closed)" strokeWidth={1.5} />
        <text x={x1} y={Y + 28} textAnchor="end" fontSize={12} fill="var(--closed)" fontFamily="var(--font-geist-mono), monospace">
          Deadline 2026-09-12
        </text>
      </g>
      <g>
        <line x1={Math.min(nowX, x1)} y1={Y - 12} x2={Math.min(nowX, x1)} y2={Y + 12} stroke="var(--text)" strokeWidth={1.5} />
        <circle cx={Math.min(nowX, x1)} cy={Y} r={4} fill="var(--text)" />
        <text x={Math.min(Math.max(Math.min(nowX, x1), 30), W - 30)} y={Y - 18} textAnchor="middle" fontSize={12} fill="var(--text)" fontFamily="var(--font-geist-mono), monospace">
          Today
        </text>
      </g>
    </svg>
  );
}
