import { Column, Exhibit, Note } from "@/components/doc";

/**
 * What the document shows when the chain could not be read.
 *
 * Deliberately not a placeholder and deliberately not a retry spinner: an empty
 * reading is a real state, and the only honest thing to render is which read failed
 * and against which endpoint.
 */
export function Unavailable({ reason, rpcHost }: { reason: string; rpcHost: string }) {
  return (
    <Column className="py-16 sm:py-24">
      <Exhibit className="max-w-[72ch] p-7 sm:p-9">
        <div className="label">Reading failed</div>
        <h1 className="mt-4 text-[1.7rem] leading-[1.15] font-normal text-paper sm:text-[2.1rem]">
          Nothing decoded, so nothing is shown.
        </h1>
        <p className="mt-5 text-[1rem] leading-[1.62] text-paper-dim">{reason}</p>
        <Note>
          endpoint {rpcHost}. Every figure in this document comes from a decoded mint account or a
          quoted route. When that read does not return, the document has no contents, and substituting a
          cached or illustrative number here would make every other number on the site unverifiable.
        </Note>
      </Exhibit>
    </Column>
  );
}
