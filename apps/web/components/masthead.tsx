import Link from "next/link";
import type { ReactNode } from "react";

import { Column, Datum } from "@/components/doc";
import { FeeCountdown } from "@/components/fee-clock";
import type { FeeSchedule } from "@/lib/fee-schedule";
import { fmtMultiplier, fmtPct, fmtSlot, fmtUnixUtc } from "@/lib/format";
import type { SourceKind } from "@/lib/data";

export function InstrumentBand({
  rpcHost,
  slot,
  capturedAtUnix,
  factsSource,
  costSource,
}: {
  rpcHost: string;
  slot: number | null;
  capturedAtUnix: number;
  factsSource: SourceKind;
  costSource: SourceKind;
}) {
  const fixtures = [
    factsSource === "dev-fixture" ? "chain" : null,
    costSource === "dev-fixture" ? "cost" : null,
  ].filter((p): p is string => p !== null);
  return (
    <div className="sticky top-0 z-30 border-b border-rule bg-ink/95 backdrop-blur-[2px]">
      <Column className="flex h-9 items-center gap-4 overflow-hidden sm:gap-6">
        <Link href="/" className="label label-strong shrink-0 hover:text-paper">
          FINEPRINT
        </Link>
        <span className="hidden sm:block">
          <Datum k="rpc" v={rpcHost} />
        </span>
        {slot !== null ? (
          <span className="hidden md:block">
            <Datum k="slot" v={fmtSlot(slot)} />
          </span>
        ) : null}
        <span className="hidden lg:block">
          <Datum k="read" v={fmtUnixUtc(capturedAtUnix)} />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-4">
          {fixtures.length > 0 ? (
            <Datum k="dev fixture" v={fixtures.join(" + ")} tone="warn" />
          ) : null}
          <Link href="/evidence" className="label hover:text-paper">
            Evidence
          </Link>
        </span>
      </Column>
    </div>
  );
}

interface ContentRow {
  mark: string;
  href: string;
  title: string;
  figure: string;
  tone?: "errata" | "plain";
}

export function Masthead({
  worstSymbol,
  worstErrorPct,
  operativeMultiplier,
  scaledCount,
  authorityCount,
  mintCount,
  feeSchedule,
  issuedAtMs,
}: {
  worstSymbol: string;
  worstErrorPct: number;
  operativeMultiplier: number;
  scaledCount: number;
  authorityCount: number;
  mintCount: number;
  feeSchedule: FeeSchedule | null;
  issuedAtMs: number;
}) {
  const record: { k: string; v: ReactNode; tone?: "errata" | "caution" }[] = [
    { k: "mints decoded", v: `${scaledCount} scaled of ${mintCount}` },
    { k: `${worstSymbol} operative multiplier`, v: fmtMultiplier(operativeMultiplier) },
    { k: `${worstSymbol} error if read naively`, v: fmtPct(worstErrorPct, 4), tone: "errata" },
    {
      k: "issuer fee per transfer",
      v: feeSchedule
        ? feeSchedule.pendingBps !== null
          ? `${feeSchedule.inForceBps} now, ${feeSchedule.pendingBps} pending`
          : `${feeSchedule.inForceBps} bps`
        : "not resolved",
    },
    ...(feeSchedule && feeSchedule.pendingBps !== null
      ? [
          {
            k: `fee ${feeSchedule.pendingBps === feeSchedule.inForceBps * 2 ? "doubles" : "changes"} in`,
            v: <FeeCountdown schedule={feeSchedule} issuedAtMs={issuedAtMs} />,
            tone: "caution" as const,
          },
        ]
      : [{ k: "authorities on one key", v: `${authorityCount} of ${authorityCount}` }]),
  ];

  const rows: ContentRow[] = [
    {
      mark: "§ 1",
      href: "#price",
      title: "What the quantity really is",
      figure: `${fmtPct(worstErrorPct, 4)} display error on ${worstSymbol}`,
      tone: "errata",
    },
    {
      mark: "§ 2",
      href: "#cost",
      title: "What it really costs at your size",
      figure: feeSchedule
        ? `${feeSchedule.inForceBps} bps issuer fee now, ${feeSchedule.pendingBps ?? feeSchedule.inForceBps} pending`
        : "issuer fee, uncapped",
    },
    {
      mark: "§ 3",
      href: "#control",
      title: "What the issuer can do to you",
      figure: `${authorityCount} of ${authorityCount} authorities, one key`,
    },
    {
      mark: "§ 4",
      href: "#execute",
      title: "Execute, or be told not to",
      figure: "non-custodial, verdict gated",
    },
  ];

  return (
    <header className="pt-8 pb-8 sm:pt-12 sm:pb-10">
      <Column>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-[4.5rem_1fr]">
          <span className="label label-strong pt-2">Doc 1</span>
          <div className="mt-3 sm:mt-0">
            <h1 className="max-w-[26ch] text-[1.95rem] leading-[1.08] font-normal tracking-[-0.01em] text-paper sm:text-[2.55rem]">
              Four things about tokenized pre-IPO stock that no buy flow tells you.
            </h1>
            <p className="mt-5 max-w-[62ch] text-[1.02rem] leading-[1.6] text-paper-dim">
              Read from mainnet, not from a website. FINEPRINT decodes the Token-2022 extensions on the
              PreStocks mints, prices your size against Forge, EquityZen and Hiive, and declines to
              execute when the measured number is against you.
            </p>

            <dl className="mt-7 grid auto-rows-fr grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-5 [&>*:last-child]:max-sm:col-span-2">
              {record.map((item) => (
                <div key={item.k} className="flex h-full flex-col bg-ink px-3 py-2.5">
                  <dt className="label leading-[1.4]">{item.k}</dt>
                  <dd
                    className={`num mt-auto pt-2 text-[0.9rem] leading-none ${
                      item.tone === "errata"
                        ? "text-errata"
                        : item.tone === "caution"
                          ? "text-caution"
                          : "text-paper"
                    }`}
                  >
                    {item.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <nav aria-label="Contents" className="mt-10 sm:mt-12">
          <div className="label mb-1">Contents</div>
          <ul>
            {rows.map((row) => (
              <li key={row.mark} className="border-t border-rule last:border-b">
                <a
                  href={row.href}
                  className="group grid grid-cols-[3rem_1fr] items-baseline gap-x-4 py-2.5 transition-colors hover:bg-ink-panel sm:grid-cols-[4.5rem_1fr_auto] sm:gap-x-6"
                >
                  <span className="label group-hover:text-paper-dim">{row.mark}</span>
                  <span className="leader max-sm:bg-none text-[1.02rem] text-paper">
                    <span className="bg-ink pr-2 transition-colors group-hover:bg-ink-panel">
                      {row.title}
                    </span>
                  </span>
                  <span
                    className={`num col-span-2 text-[0.72rem] sm:col-span-1 sm:text-right ${
                      row.tone === "errata" ? "text-errata" : "text-paper-faint"
                    }`}
                  >
                    {row.figure}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Column>
    </header>
  );
}
