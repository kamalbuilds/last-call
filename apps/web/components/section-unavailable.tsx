import { Column, Exhibit, Note, Section } from "@/components/doc";

/**
 * A clause that could not be filled.
 *
 * Kept in the document rather than hidden, because a numbered section that silently
 * disappears is indistinguishable from a section that was never written. It states
 * which read failed and refuses to fill the gap with an illustrative figure.
 */
export function SectionUnavailable({
  id,
  mark,
  title,
  reason,
}: {
  id: string;
  mark: string;
  title: string;
  reason: string;
}) {
  return (
    <Column>
      <Section id={id} mark={mark} title={title}>
        <Exhibit className="p-6 sm:p-7">
          <div className="label">Not answerable right now</div>
          <p className="mt-4 max-w-[68ch] text-[1rem] leading-[1.62] text-paper-dim">{reason}</p>
          <Note>
            The other clauses in this document are unaffected: they are decoded from the mint
            accounts, which read independently of any route quote.
          </Note>
        </Exhibit>
      </Section>
    </Column>
  );
}
