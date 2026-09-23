import type { Metadata } from "next";

import { ControlSection } from "@/components/control-section";
import { CostSection } from "@/components/cost-section";
import { ExecuteSection } from "@/components/execute-section";
import { Footer } from "@/components/footer";
import { InstrumentBand, Masthead } from "@/components/masthead";
import { PriceSection } from "@/components/price-section";
import { SectionUnavailable } from "@/components/section-unavailable";
import { SizeProvider } from "@/components/size-context";
import { Unavailable } from "@/components/unavailable";
import type { MintFacts } from "@/lib/contract";
import { loadDossier, loadVerdict, type Dossier } from "@/lib/data";
import { rpcHost } from "@/lib/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which halves of the document are standing on the development fixture. */
function fixtureParts(d: Dossier): string[] {
  return [
    d.factsSource === "dev-fixture" ? "the chain reading" : null,
    d.cost?.source === "dev-fixture" ? "the cost surface" : null,
  ].filter((p): p is string => p !== null);
}


export const metadata: Metadata = {
  title: "FINEPRINT: what tokenized pre-IPO stock really costs at your size",
};

const DEFAULT_SIZE_USD = 10_000;

/** How many of the six Token-2022 levers this mint actually exposes. */
function authorityCount(facts: MintFacts | undefined): number {
  if (!facts) return 0;
  const p = facts.powers;
  return [
    p.permanentDelegate,
    p.pausableAuthority,
    p.transferFeeAuthority,
    p.withdrawWithheldAuthority,
    p.transferHookAuthority,
    p.scaledUiAmountAuthority,
  ].filter((a) => a !== null).length;
}

export default async function DocumentPage() {
  const dossier = await loadDossier();
  if (!dossier.ok) {
    return (
      <>
        <InstrumentBand
          rpcHost={rpcHost()}
          slot={null}
          capturedAtUnix={0}
          factsSource="package"
          costSource="package"
        />
        <main>
          <Unavailable reason={dossier.reason} rpcHost={rpcHost()} />
        </main>
      </>
    );
  }

  const d = dossier.value;
  // The mint whose naive reading is furthest from the truth anchors every section, so
  // sections 1, 3 and 4 all talk about the same exhibit instead of three different ones.
  const worst = d.comparisons.reduce(
    (a, b) => (Math.abs(b.errorPct) > Math.abs(a.errorPct) ? b : a),
    d.comparisons[0],
  );
  const exhibit = d.facts.find((f) => f.symbol === worst.symbol) ?? d.facts[0];
  const defaultSymbol = exhibit?.symbol ?? "SPACEX";
  const quote = d.cost ? await loadVerdict(defaultSymbol, DEFAULT_SIZE_USD) : null;
  const cost = d.cost;
  const costReason =
    d.costUnavailableReason ??
    (quote && !quote.ok ? quote.reason : null) ??
    "No route was quoted, so no verdict exists.";

  return (
    <>
      <InstrumentBand
        rpcHost={d.rpcHost}
        slot={d.facts[0]?.slot ?? null}
        capturedAtUnix={d.capturedAtUnix}
        factsSource={d.factsSource}
        costSource={d.cost?.source ?? "package"}
      />
      <main>
        <Masthead
          worstSymbol={worst.symbol}
          worstErrorPct={worst.errorPct}
          operativeMultiplier={exhibit?.scaledUiAmount?.operativeMultiplier ?? 1}
          scaledCount={d.comparisons.filter((c) => c.errorPct !== 0).length}
          authorityCount={authorityCount(exhibit)}
          mintCount={d.facts.length}
          feeSchedule={d.feeSchedule}
          issuedAtMs={d.issuedAtMs}
        />
        <div className="flex flex-col gap-14 sm:gap-20">
          {cost && quote && quote.ok && quote.value.verdict.ok ? (
          <SizeProvider
            defaultSymbol={defaultSymbol}
            initialVerdict={{
              verdict: quote.value.verdict.verdict,
              source: quote.value.source,
              exact: quote.value.exact,
              requestedUsd: DEFAULT_SIZE_USD,
            }}
          >
            <PriceSection facts={d.facts} comparisons={d.comparisons} crossCheck={d.crossCheck} />
            <CostSection
              tradFi={cost.tradFi}
              ladder={cost.ladder}
              feeSchedule={d.feeSchedule}
              issuedAtMs={d.issuedAtMs}
              exhibitSymbol={defaultSymbol}
            />
            <ControlSection
              facts={d.facts}
              exhibitSymbol={defaultSymbol}
              withheldFeesRaw={d.withheldFeesRaw}
              feeSchedule={d.feeSchedule}
            />
            <ExecuteSection
              mints={d.facts.map((f) => ({ symbol: f.symbol, mint: f.mint }))}
              ladder={cost.ladder}
            />
          </SizeProvider>
          ) : (
            <>
              <PriceSection facts={d.facts} comparisons={d.comparisons} crossCheck={d.crossCheck} />
              <SectionUnavailable
                id="cost"
                mark="§ 2"
                title="The cost at your size could not be quoted."
                reason={costReason}
              />
              <ControlSection
                facts={d.facts}
                exhibitSymbol={defaultSymbol}
                withheldFeesRaw={d.withheldFeesRaw}
                feeSchedule={d.feeSchedule}
              />
              <SectionUnavailable
                id="execute"
                mark="§ 4"
                title="Execution stays closed without a cost verdict."
                reason={`${costReason} A swap is only offered once the measured cost at your size has been compared against the published alternatives, so with no comparison there is nothing to offer.`}
              />
            </>
          )}
        </div>
      </main>
      <Footer
        rpcHost={d.rpcHost}
        capturedAtUnix={d.capturedAtUnix}
        fixtureParts={fixtureParts(d)}
      />
    </>
  );
}
