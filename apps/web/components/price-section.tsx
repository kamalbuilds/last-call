import type { MintFacts, NaiveVsCorrect } from "@/lib/contract";
import type { CrossCheck } from "@/lib/data";
import { Column, Exhibit, Figure, Note, Section, TableFrame, Td, Th } from "@/components/doc";
import { fmtMultiplier, fmtPct, fmtPctPlain, fmtQty, fmtQtyFixed, fmtUnixUtc } from "@/lib/format";

function inForce(f: MintFacts): boolean {
  const s = f.scaledUiAmount;
  if (!s) return false;
  return s.newMultiplierEffectiveTimestamp > 0 && s.newMultiplierEffectiveTimestamp <= f.asOfUnix;
}

export function PriceSection({
  facts,
  comparisons,
  crossCheck,
}: {
  facts: MintFacts[];
  comparisons: NaiveVsCorrect[];
  crossCheck?: CrossCheck;
}) {
  const worst = comparisons.reduce((a, b) => (Math.abs(b.errorPct) > Math.abs(a.errorPct) ? b : a));
  const exhibit = facts.find((f) => f.symbol === worst.symbol) ?? facts[0];
  const scaled = exhibit.scaledUiAmount;
  const controls = comparisons.filter((c) => c.errorPct === 0);
  const affected = comparisons
    .filter((c) => c.errorPct !== 0)
    .sort((a, b) => b.errorPct - a.errorPct);
  const scaledCount = affected.length;
  const scaledList = affected.map((c) => `${c.symbol} by ${fmtPct(c.errorPct, 4)}`).join(" and ");

  return (
    <Column>
      <Section
        id="price"
        mark="§ 1"
        title={`${scaledCount} of these ${comparisons.length} tokens are displayed wrong by a naive reader.`}
        standfirst={
          <>
            Not all of them, and that is the point. These mints carry the Token-2022 scaled UI amount
            extension, whose <code className="font-mono text-[0.92em] text-paper">multiplier</code>{" "}
            field goes stale the moment a change lands. The operative value is{" "}
            <code className="font-mono text-[0.92em] text-paper">newMultiplier</code>, and only once
            its effective timestamp has passed. On {scaledCount === 1 ? "one mint" : `${scaledCount} of the ${comparisons.length}`}{" "}
            that has happened, so {scaledList} is what a decimals-only reading is out by. On the other{" "}
            {controls.length} the two fields agree and the naive reading is correct. Nothing errors
            either way.
          </>
        }
      >
        <Exhibit>
          <div className="grid grid-cols-1 divide-y divide-rule md:grid-cols-[1fr_1fr_1.25fr] md:divide-x md:divide-y-0">
            <div className="p-6 sm:p-7">
              <Figure
                label="As read by decimals alone"
                tone="dim"
                value={fmtQtyFixed(worst.naiveSupply, 6)}
                sub={
                  <>
                    rawSupply {exhibit.rawSupply} ÷ 10<sup>{exhibit.decimals}</sup>
                  </>
                }
              />
            </div>
            <div className="p-6 sm:p-7">
              <Figure
                label={`Operative on-chain value, ${exhibit.symbol}`}
                value={fmtQtyFixed(worst.correctSupply, 6)}
                sub={
                  scaled ? (
                    <>
                      × operative multiplier {fmtMultiplier(scaled.operativeMultiplier)}, in force since{" "}
                      {fmtUnixUtc(scaled.newMultiplierEffectiveTimestamp)}
                    </>
                  ) : null
                }
              />
            </div>
            <div className="bg-errata-wash p-6 sm:p-7">
              <Figure
                label="Display error"
                tone="errata"
                size="lg"
                value={fmtPct(worst.errorPct, 4)}
                sub={
                  <span className="text-paper-dim">
                    Everything downstream inherits it: a wallet balance, a position value, a market cap,
                    a TVL figure, a chart.
                  </span>
                }
              />
            </div>
          </div>

          {crossCheck && crossCheck.symbol === exhibit.symbol ? (
            <div className="border-t border-rule px-6 py-5 sm:px-7">
              <div className="label mb-3">Independent cross-check</div>
              <div className="scroll-x">
                <div className="num flex w-max items-baseline gap-3 text-[0.82rem] text-paper">
                  <span>{fmtQty(worst.naiveSupply, 9)}</span>
                  <span className="text-paper-faint">×</span>
                  <span>{scaled ? fmtMultiplier(scaled.operativeMultiplier) : "1"}</span>
                  <span className="text-paper-faint">=</span>
                  <span>{fmtQty(worst.correctSupply, 9)}</span>
                  <span className="pl-4 text-paper-faint">issuer API reports</span>
                  <span>{fmtQty(crossCheck.issuerApiSupply, 9)}</span>
                  <span className="pl-4 text-paper-faint">disagreement</span>
                  <span className="text-assent">
                    {fmtPctPlain(
                      (Math.abs(crossCheck.issuerApiSupply - worst.correctSupply) /
                        crossCheck.issuerApiSupply) *
                        100,
                      6,
                    )}
                  </span>
                </div>
              </div>
              <Note>{crossCheck.note}</Note>
            </div>
          ) : null}
        </Exhibit>

        <h3 className="mt-12 mb-4 text-[1.1rem] text-paper">
          All {comparisons.length} mints decoded: {scaledCount} scaled, {controls.length} unaffected
        </h3>
        <TableFrame>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <Th>Symbol</Th>
                <Th align="right">multiplier</Th>
                <Th align="right">newMultiplier</Th>
                <Th>effective</Th>
                <Th>in force</Th>
                <Th align="right">operative</Th>
                <Th align="right">naive supply</Th>
                <Th align="right">operative supply</Th>
                <Th align="right">error</Th>
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => {
                const c = comparisons.find((x) => x.symbol === f.symbol);
                const s = f.scaledUiAmount;
                const forced = inForce(f);
                const wrong = (c?.errorPct ?? 0) !== 0;
                return (
                  <tr key={f.mint} className="border-t border-rule">
                    <Td className="!text-paper">{f.symbol}</Td>
                    <Td align="right" tone="dim">
                      {s ? s.multiplier : "—"}
                    </Td>
                    <Td align="right" tone={wrong ? "errata" : "plain"}>
                      {s ? s.newMultiplier : "—"}
                    </Td>
                    <Td tone="dim">
                      {s && s.newMultiplierEffectiveTimestamp > 0
                        ? fmtUnixUtc(s.newMultiplierEffectiveTimestamp)
                        : "epoch 0"}
                    </Td>
                    <Td tone={forced ? "plain" : "dim"}>{forced ? "yes" : "n/a"}</Td>
                    <Td align="right">{s ? fmtMultiplier(s.operativeMultiplier) : "—"}</Td>
                    <Td align="right" tone="dim">
                      {fmtQtyFixed(c?.naiveSupply ?? 0, 6)}
                    </Td>
                    <Td align="right">{fmtQtyFixed(c?.correctSupply ?? 0, 6)}</Td>
                    <Td align="right" tone={wrong ? "errata" : "plain"}>
                      {fmtPct(c?.errorPct ?? 0, 4)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
        {controls.length > 0 ? (
          <Note>
            {controls.length === 1 ? `${controls[0].symbol} is` : `${controls.map((c) => c.symbol).join(", ")} are`}{" "}
            the negative control. {controls.length === 1 ? "It carries" : "They carry"} newMultiplier 1
            and an effective timestamp of 0, so {controls.length === 1 ? "it reads" : "they read"}{" "}
            identically either way and {controls.length === 1 ? "its error is" : "their errors are"}{" "}
            exactly {fmtPct(0, 4)}. The same decoder produced every row, so the {worst.symbol} result is
            a property of that mint and not an artifact of the decoder. A decoder that scaled everything
            would have failed on {controls.length === 1 ? "this row" : "these rows"}.
          </Note>
        ) : null}
      </Section>
    </Column>
  );
}
