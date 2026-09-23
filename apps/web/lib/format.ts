/** Grouped quantity. */
export function fmtQty(n: number, maxFrac?: number): string {
  if (!Number.isFinite(n)) return "—";
  const raw = maxFrac ?? 6;
  if (!Number.isFinite(raw)) return "—";
  const m = Math.max(0, Math.min(20, Math.floor(raw)));
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: m }).format(n);
}
/** Grouped fixed quantity. */
export function fmtQtyFixed(n: number, frac: number): string {
  if (!Number.isFinite(n)) return "—";
  if (!Number.isFinite(frac)) return "—";
  const f = Math.max(0, Math.min(20, Math.floor(frac)));
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: f, maximumFractionDigits: f }).format(n);
}
/** Grouped USD. */
export function fmtUsd(n: number, frac?: number): string {
  if (!Number.isFinite(n)) return "—";
  let f: number;
  if (frac !== undefined) {
    if (!Number.isFinite(frac)) return "—";
    f = Math.max(0, Math.min(20, Math.floor(frac)));
  } else {
    f = Math.abs(n) >= 1000 ? 0 : 2;
  }
  const body = new Intl.NumberFormat("en-US", { minimumFractionDigits: f, maximumFractionDigits: f }).format(Math.abs(n));
  return (n < 0 ? "-$" : "$") + body;
}
/** Signed percent. */
export function fmtPct(n: number, frac?: number): string {
  if (!Number.isFinite(n)) return "—";
  const raw = frac ?? 2;
  if (!Number.isFinite(raw)) return "—";
  const f = Math.max(0, Math.min(20, Math.floor(raw)));
  const body = new Intl.NumberFormat("en-US", { minimumFractionDigits: f, maximumFractionDigits: f }).format(Math.abs(n));
  return (n < 0 ? "-" : "+") + body + "%";
}
/** Plain percent. */
export function fmtPctPlain(n: number, frac?: number): string {
  if (!Number.isFinite(n)) return "—";
  const raw = frac ?? 2;
  if (!Number.isFinite(raw)) return "—";
  const f = Math.max(0, Math.min(20, Math.floor(raw)));
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: f, maximumFractionDigits: f }).format(n) + "%";
}
/** Basis points. */
export function fmtBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  return new Intl.NumberFormat("en-US").format(bps) + " bps";
}
/** Convert bps to percent. */
export function bpsToPct(bps: number): number {
  return bps / 100;
}
/** Compact multiplier. */
export function fmtMultiplier(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(m);
}
/** Shorten key. */
export function shortKey(key: string, head?: number, tail?: number): string {
  const h = head ?? 4;
  const t = tail ?? 4;
  const hn = Number.isFinite(h) ? Math.max(0, Math.floor(h)) : 4;
  const tn = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 4;
  if (key.length < hn + tn + 3) return key;
  return key.slice(0, hn) + "..." + key.slice(key.length - tn);
}
/** Format unix as UTC datetime. */
export function fmtUnixUtc(unix: number): string {
  if (!Number.isFinite(unix)) return "—";
  const d = new Date(unix * 1000);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return y + "-" + mo + "-" + da + " " + hh + ":" + mi + ":" + ss + " UTC";
}
/** Format unix as UTC date. */
export function fmtUnixDateUtc(unix: number): string {
  if (!Number.isFinite(unix)) return "—";
  const d = new Date(unix * 1000);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + mo + "-" + da;
}
/** Grouped slot. */
export function fmtSlot(slot: number): string {
  if (!Number.isFinite(slot)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(slot);
}
/** Format settlement duration. */
export function fmtSettlement(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 90) return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.floor(seconds)) + " s";
  if (seconds < 172800) {
    if (seconds === 86400) return "1 day";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.floor(seconds / 3600)) + " h";
  }
  const days = Math.floor(seconds / 86400);
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(days);
  return days === 1 ? "1 day" : body + " days";
}

/** Compact USD for a dense axis: 500, 1k, 10k, 100k, 1M. */
export function fmtUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "$" + fmtQty(n / 1_000_000, 1) + "M";
  if (abs >= 1000) return "$" + fmtQty(n / 1000, 1) + "k";
  return "$" + fmtQty(n, 0);
}

/** Display name for a venue key from the cost package. */
export function venueLabel(venue: string): string {
  const names: Record<string, string> = { forge: "Forge", equityzen: "EquityZen", hiive: "Hiive" };
  return names[venue] ?? venue;
}

/** A signed difference in percentage points, e.g. "+2.421 points". */
export function fmtPoints(n: number, frac = 3): string {
  if (!Number.isFinite(n)) return "—";
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(Math.abs(n));
  return (n < 0 ? "-" : "+") + body + " points";
}
