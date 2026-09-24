import assert from "node:assert/strict";
import test from "node:test";
import { gapSignal } from "./gap-signal";

type GapPoint = { date: string; gapPct: number };

const points: GapPoint[] = [
  { date: "2026-08-01", gapPct: 0 },
  { date: "2026-08-25", gapPct: 1 },
  { date: "2026-09-01", gapPct: 10 },
  { date: "2026-09-20", gapPct: 12 },
  { date: "2026-09-23", gapPct: 11.5 },
];

test("uses the last 30 days relative to today for the convert signal", () => {
  const signal = gapSignal(11.5, points, "2026-09-24");
  assert.match(signal, /^Convert now/);
  assert.match(signal, /11\.5%/);
  assert.match(signal, /10\.0%/);
});

test("includes the boundary day in the 30-day window", () => {
  const boundaryPoints: GapPoint[] = [
    { date: "2026-08-26", gapPct: 0 },
    { date: "2026-09-23", gapPct: 8 },
  ];
  const signal = gapSignal(9, boundaryPoints, "2026-09-24");
  assert.equal(signal, "Wait: today's gap is 9.0 points above its 30-day low (9.0% today, 0.0% low).");
});

test("shows the point distance above today's 30-day low when waiting", () => {
  const signal = gapSignal(15, points, "2026-09-24");
  assert.equal(signal, "Wait: today's gap is 5.0 points above its 30-day low (15.0% today, 10.0% low).");
});
