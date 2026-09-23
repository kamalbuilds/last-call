import type { Metadata } from "next";

import { Column, Exhibit, Note, Section, TableFrame, Td, Th } from "@/components/doc";
import { Footer } from "@/components/footer";
import { InstrumentBand } from "@/components/masthead";
import { Unavailable } from "@/components/unavailable";
import { loadDossier, type Dossier } from "@/lib/data";
import { fmtPctPlain, fmtSlot, fmtUnixUtc } from "@/lib/format";
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
  title: "FINEPRINT evidence ledger: where every figure came from",
  description:
    "The call that produced each number on FINEPRINT, the slot it was read at, the venue filings behind the fee schedules, and the blind spots that remain.",
};

const PROVENANCE_TITLES: Record<string, string> = {
  mintFacts: "Mint accounts",
  supplyCrossCheck: "Supply cross-check",
  ammImpact: "Route impact",
  thinnerNames: "Route depth",
  tradFiFees: "Venue fee schedules",
  transferFee: "Transfer fee tiers",
  withheldFees: "Withheld fees",
};

const BLIND_SPOTS = [
  "Three mints are decoded here, not the full set the issuer lists. The extension set and the authority key are identical across all three, which is evidence about these three and an inference about the rest.",
  "Route impact was measured on one route at one moment and was not resampled. It is a quote, not a fill.",
  "That route is a liquid tokenized public equity. The PreStocks pre-IPO names are far thinner: a NEURALINK round trip was measured at 59.12% in the same pass. The cost ladder shown on the front page is therefore a floor, and the size at which the on-chain path stops being cheaper is lower for these names than the ladder suggests.",
  "The scaled UI amount semantics come from the extension's documented behaviour plus the issuer supply cross-check. The Token-2022 program branch that selects between multiplier and newMultiplier was not stepped in a debugger.",
  "Forge is quoted at the 2% lower bound of its published 2% to 4% per-side range, so the on-chain path has to beat the traditional venue at its best rather than its worst. The other two venues are quoted at the upper bound of each published range, because the published ranges are what the venue commits to rather than what any individual pays. A negotiated rate would be lower.",
  "Days to close is a Forge-reported average for Forge and an industry-wide range for the other two, which are different classes of source and are labelled as such at the point of use.",
  "No swap has been executed through this app yet. Until one has, the settlement-speed claim rests on protocol finality rather than on a measured fill.",
];

export default async function EvidencePage() {
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
  const provenance = Object.entries(d.provenance);

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
        <Column className="pt-10 pb-12 sm:pt-16">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-[4.5rem_1fr]">
            <span className="label label-strong pt-2">Doc 1 A</span>
            <div className="mt-3 sm:mt-0">
              <h1 className="max-w-[18ch] text-[2rem] leading-[1.08] font-normal text-paper sm:text-[2.7rem]">
                Where every figure on the front page came from.
              </h1>
              <p className="mt-5 max-w-[64ch] text-[1.02rem] leading-[1.62] text-paper-dim">
                A number with no origin is a rumour with good posture. Each block below names the call
                that produced the figures, the slot they were read at, and what the reading cannot tell
                you.
              </p>
            </div>
          </div>
        </Column>

        <div className="flex flex-col gap-14 sm:gap-20">
          <Column>
            <Section id="calls" mark="§ A" title="The calls behind the numbers">
              <dl className="border-t border-rule">
                {provenance.map(([key, text]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-rule py-5 sm:grid-cols-[14rem_1fr]"
                  >
                    <dt className="num text-[0.78rem] text-paper">
                      {PROVENANCE_TITLES[key] ?? key}
                    </dt>
                    <dd className="max-w-[72ch] text-[0.96rem] leading-[1.62] text-paper-dim">{text}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </Column>

          <Column>
            <Section id="accounts" mark="§ B" title="The accounts that were read">
              <TableFrame>
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr>
                      <Th>Symbol</Th>
                      <Th>Mint</Th>
                      <Th>Owner program</Th>
                      <Th align="right">Decimals</Th>
                      <Th align="right">Raw supply</Th>
                      <Th align="right">Slot</Th>
                      <Th>Read at</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.facts.map((f) => (
                      <tr key={f.mint} className="border-t border-rule">
                        <Td className="!text-paper">{f.symbol}</Td>
                        <Td tone="dim">{f.mint}</Td>
                        <Td tone="dim">{f.ownerProgram}</Td>
                        <Td align="right">{f.decimals}</Td>
                        <Td align="right">{f.rawSupply}</Td>
                        <Td align="right">{f.slot > 0 ? fmtSlot(f.slot) : "not recorded"}</Td>
                        <Td tone="dim">{fmtUnixUtc(f.asOfUnix)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
              <Note>
                Extensions present on every mint above: {d.facts[0]?.extensionsPresent.join(", ")}.
              </Note>
            </Section>
          </Column>

          <Column>
            <Section
              id="venues"
              mark="§ C"
              title="The venue schedules, and who published them"
              standfirst="Fee percentages are quoted from each firm's own Form CRS. Firm identity and CRD number were confirmed against the SEC adviserinfo firm search rather than taken from a marketing page."
            >
              <dl className="border-t border-rule">
                {(d.cost?.tradFi ?? []).map((q) => (
                  <div
                    key={q.venue}
                    className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-rule py-5 sm:grid-cols-[14rem_1fr]"
                  >
                    <dt>
                      <div className="num text-[0.78rem] text-paper capitalize">{q.venue}</div>
                      <div className="num mt-1.5 text-[0.7rem] text-paper-faint">
                        {fmtPctPlain(q.buyFeePct, 2)} buy / {fmtPctPlain(q.sellFeePct, 2)} sell
                      </div>
                    </dt>
                    <dd>
                      <p className="max-w-[72ch] text-[0.96rem] leading-[1.62] text-paper-dim">
                        {q.sourceNote}
                      </p>
                      <a
                        href={q.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="num mt-2 inline-block text-[0.7rem] text-paper-faint underline decoration-rule-strong underline-offset-4 hover:text-paper"
                      >
                        {q.sourceUrl}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </Column>

          <Column>
            <Section
              id="blind-spots"
              mark="§ D"
              title="What this reading cannot tell you"
              standfirst="Stated rather than papered over, because a measurement without its limits is a claim."
            >
              <Exhibit>
                <ol className="divide-y divide-rule">
                  {BLIND_SPOTS.map((spot, i) => (
                    <li key={spot} className="grid grid-cols-[2.5rem_1fr] gap-x-4 px-6 py-5 sm:px-7">
                      <span className="label pt-1">{String(i + 1).padStart(2, "0")}</span>
                      <p className="max-w-[72ch] text-[0.98rem] leading-[1.62] text-paper-dim">{spot}</p>
                    </li>
                  ))}
                </ol>
              </Exhibit>
            </Section>
          </Column>
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
