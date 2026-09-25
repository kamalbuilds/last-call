import type { Metadata } from "next";
import { SolscanLink } from "@/components/solscan-link";
import { getCompliance, type ComplianceRow } from "@/lib/compliance";
import { ISSUER_TERMS } from "@/lib/issuer-terms";
import { shorten } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compliance | Last call for pre-IPO holders",
};

const ISSUER_LABEL: Record<ComplianceRow["issuer"], string> = { prestocks: "PreStocks", xstock: "xStocks", ondo: "Ondo" };

function flagColor(flag: string): { color: string; border: string } {
  if (flag === "PAUSED" || flag === "NEW ACCOUNTS FROZEN" || flag === "ONE KEY HOLDS ALL") return { color: "var(--closed)", border: "var(--closed)" };
  if (flag === "PERMANENT DELEGATE" || flag === "FREEZE" || flag === "TRANSFER HOOK") return { color: "var(--text)", border: "var(--text-2)" };
  return { color: "var(--text-3)", border: "var(--line)" };
}

function Addr({ value, label }: { value: string | null; label: string }): React.ReactNode {
  return (
    <div className="min-w-0 text-xs">
      <p className="text-[var(--text-3)] lg:hidden">{label}</p>
      {value === null ? <p className="num text-[var(--text-3)]">none</p> : <SolscanLink address={value} short={shorten(value)} />}
    </div>
  );
}

function Row({ r }: { r: ComplianceRow }): React.ReactNode {
  return (
    <div
      data-compliance-row={r.mint}
      data-freeze={r.freezeAuthority ?? "none"}
      data-delegate={r.permanentDelegate ?? "none"}
      data-paused={r.paused === null ? "n/a" : String(r.paused)}
      className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 lg:grid-cols-[1.1fr_1.8fr_1fr_1fr_1fr_1fr_0.8fr_1fr] lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:p-0 lg:py-3"
    >
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className="num text-sm font-bold text-[var(--text)]">{r.symbol}</p>
        <p className="text-xs text-[var(--text-3)]">
          {ISSUER_LABEL[r.issuer]} <SolscanLink address={r.mint} short={shorten(r.mint)} />
        </p>
      </div>
      <div className="col-span-2 flex min-w-0 flex-wrap gap-1 lg:col-span-1">
        {r.flags.length === 0 ? (
          <span className="text-xs text-[var(--text-3)]">No issuer controls</span>
        ) : (
          r.flags.map((f) => {
            const c = flagColor(f);
            return (
              <span key={f} className="chip text-[11px]" style={{ color: c.color, borderColor: c.border }}>
                {f}
              </span>
            );
          })
        )}
      </div>
      <Addr value={r.freezeAuthority} label="Freeze authority" />
      <Addr value={r.permanentDelegate} label="Permanent delegate" />
      <div className="min-w-0 text-xs">
        <p className="text-[var(--text-3)] lg:hidden">Pausable</p>
        {r.pausableAuthority === null ? (
          <p className="num text-[var(--text-3)]">none</p>
        ) : (
          <>
            <p className="num" style={{ color: r.paused === true ? "var(--closed)" : "var(--text-2)" }}>{r.paused === true ? "PAUSED" : "not paused"}</p>
            <SolscanLink address={r.pausableAuthority} short={shorten(r.pausableAuthority)} />
          </>
        )}
      </div>
      <div className="min-w-0 text-xs">
        <p className="text-[var(--text-3)] lg:hidden">Transfer hook</p>
        {r.transferHookProgram !== null ? (
          <SolscanLink address={r.transferHookProgram} short={shorten(r.transferHookProgram)} />
        ) : r.transferHookAuthority !== null ? (
          <p className="text-[var(--text-2)]">no program, settable by <SolscanLink address={r.transferHookAuthority} short={shorten(r.transferHookAuthority)} /></p>
        ) : (
          <p className="num text-[var(--text-3)]">none</p>
        )}
      </div>
      <div className="min-w-0 text-xs">
        <p className="text-[var(--text-3)] lg:hidden">Default state</p>
        <p className="num" style={{ color: r.defaultAccountState === "frozen" ? "var(--closed)" : "var(--text-2)" }}>{r.defaultAccountState ?? "none"}</p>
      </div>
      <Addr value={r.mintAuthority} label="Mint authority" />
    </div>
  );
}

export default async function CompliancePage(): Promise<React.ReactNode> {
  let report: Awaited<ReturnType<typeof getCompliance>>;
  try {
    report = await getCompliance();
  } catch (err) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--closed)]">Could not read the mints right now: {err instanceof Error ? err.message : String(err)}</p>
      </main>
    );
  }
  const n = report.rows.length;
  const count = (f: (r: ComplianceRow) => boolean): number => report.rows.filter(f).length;
  const stats: [string, number][] = [
    ["paused right now", count((r) => r.paused === true)],
    ["have a permanent delegate that can move any holder's tokens", count((r) => r.permanentDelegate !== null)],
    ["have a freeze authority", count((r) => r.freezeAuthority !== null)],
    ["can be paused by the issuer", count((r) => r.pausableAuthority !== null)],
    ["put every control on one key", count((r) => r.flags.includes("ONE KEY HOLDS ALL"))],
  ];
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
      <section className="mt-8 min-w-0">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">Compliance</p>
        <h1 className="mt-2 max-w-2xl text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[40px]">What the issuer can do to your tokens.</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-2)]">
          Every tracked mint, decoded from its live Token-2022 account: freeze authority, permanent delegate, pause switch,
          transfer hook, default account state and mint authority. Riskiest controls first. <a href="#eligibility" className="underline">Issuer eligibility terms</a> are quoted below.
        </p>
        <div className="num mt-8 grid grid-cols-1 gap-4 sm:grid-cols-5">
          {stats.map(([label, v]) => (
            <div key={label} className="min-w-0 border-t border-[var(--line)] pt-3">
              <p className="text-2xl font-bold text-[var(--text)]">
                {v}
                <span className="text-sm text-[var(--text-3)]"> / {n}</span>
              </p>
              <p className="mt-1 font-sans text-sm leading-snug text-[var(--text-2)]">{label}</p>
            </div>
          ))}
        </div>
        <p className="num mt-4 text-xs text-[var(--text-3)]">
          {n} mints read at slot {report.readAtSlot} ({report.readAt.slice(0, 19).replace("T", " ")} UTC)
          {report.missing.length > 0 ? `; ${report.missing.length} not found as Token-2022 mints` : ""}.
        </p>
      </section>

      <section aria-label="Issuer controls per mint" className="mt-10 min-w-0">
        <div className="num hidden grid-cols-[1.1fr_1.8fr_1fr_1fr_1fr_1fr_0.8fr_1fr] gap-4 border-b border-[var(--line)] pb-2 text-xs text-[var(--text-3)] lg:grid">
          <span>Token</span>
          <span>Controls</span>
          <span>Freeze authority</span>
          <span>Permanent delegate</span>
          <span>Pausable</span>
          <span>Transfer hook</span>
          <span>Default state</span>
          <span>Mint authority</span>
        </div>
        <div className="flex flex-col gap-3 lg:gap-0">
          {report.rows.map((r) => (
            <Row key={r.mint} r={r} />
          ))}
        </div>
      </section>

      <section id="eligibility" aria-label="Issuer eligibility terms" className="mt-12 min-w-0">
        <h2 className="text-[20px] font-bold text-[var(--text)]">Who may hold these tokens</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)]">
          Quoted from each issuer&apos;s own terms, read on 2026-09-25. On-chain transfers are permissionless, so these terms are
          the only eligibility gate; the controls above are how an issuer enforces them.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {ISSUER_TERMS.map((t) => (
            <article key={t.issuer} data-issuer-terms={t.issuer} className="card min-w-0 p-4">
              <p className="text-base font-bold text-[var(--text)]">{t.name}</p>
              <p className="num mt-1 text-xs text-[var(--text-3)]">
                {report.rows.filter((r) => r.issuer === t.issuer).length} tracked mints
              </p>
              <p className="mt-2 text-sm text-[var(--text-2)]">{t.summary}</p>
              {t.quotes.map((q) => (
                <blockquote key={q.text} className="mt-3 border-l border-[var(--line)] pl-3 text-sm leading-relaxed text-[var(--text)]">
                  &ldquo;{q.text}&rdquo;
                  <a href={q.source} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-[var(--text-3)] underline">
                    {q.source}
                  </a>
                </blockquote>
              ))}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
