import Link from "next/link";

import { Column } from "@/components/doc";
import { fmtUnixUtc } from "@/lib/format";

export function Footer({
  rpcHost,
  capturedAtUnix,
  fixtureParts,
}: {
  rpcHost: string;
  capturedAtUnix: number;
  fixtureParts: string[];
}) {
  return (
    <footer className="mt-20 border-t border-rule-strong py-10">
      <Column className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-[4.5rem_1fr]">
        <span className="label label-strong">Colophon</span>
        <div>
          <p className="max-w-[66ch] text-[0.98rem] leading-[1.62] text-paper-dim">
            Every figure in this document carries the call that produced it and the slot it was read at.
            The working is in the{" "}
            <Link href="/evidence" className="text-paper underline decoration-rule-strong underline-offset-4 hover:decoration-paper">
              evidence ledger
            </Link>
            , including the blind spots. Nothing here is read from a price API or an issuer marketing
            page except where it is named as a cross-check.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[0.68rem] text-paper-faint">
            <span>rpc {rpcHost}</span>
            <span>read {fmtUnixUtc(capturedAtUnix)}</span>
            {fixtureParts.length > 0 ? (
              <span className="text-caution">
                development fixture standing in for {fixtureParts.join(" and ")}
              </span>
            ) : null}
          </div>
          <p className="mt-5 max-w-[66ch] font-mono text-[0.68rem] leading-[1.9] text-paper-faint">
            Not investment advice and not an offer. FINEPRINT is unaffiliated with PreStocks, Forge
            Global, EquityZen and Hiive; venue fee schedules are quoted from their own public filings
            and linked at the point of use.
          </p>
        </div>
      </Column>
    </footer>
  );
}
