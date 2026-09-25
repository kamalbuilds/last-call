import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { docHref, docSourcePath, getDoc, getGroups, getOrder } from "@/lib/docs";

const pad = (n: number): string => String(n).padStart(2, "0");

/** One rendered docs page: eyebrow, markdown body, prev/next, and an in-page contents column. */
export function DocView({ slug }: { slug: string }): React.ReactNode {
  const doc = getDoc(slug)!;
  const order = getOrder();
  const i = order.findIndex((d) => d.slug === slug);
  const prev = order[i - 1];
  const next = order[i + 1];
  const group = getGroups().find((g) => g.pages.some((p) => p.slug === slug))?.name;

  return (
    <div className="grid gap-10 pb-24 pt-8 lg:pt-12 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0 max-w-[760px]">
        <p className="num text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">
          Docs {pad(i)}
          {group ? ` / ${group}` : ""}
        </p>
        <div className="docs-prose mt-3" dangerouslySetInnerHTML={{ __html: doc.html }} />

        <p className="mt-12 border-t border-[var(--line)] pt-4 text-xs text-[var(--text-3)]">
          Source <span className="num text-[var(--text-2)]">{docSourcePath(slug)}</span>
        </p>

        <nav aria-label="Pager" className="mt-6 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={docHref(prev.slug)} rel="prev" className="card flex flex-col gap-1 px-4 py-3 hover:border-[var(--text-3)]">
              <span className="flex items-center gap-2 text-xs text-[var(--text-3)]">
                <ArrowLeft size={12} weight="bold" aria-hidden="true" /> Previous
              </span>
              <span className="text-sm text-[var(--text)]">
                <span className="num pr-2 text-[var(--text-3)]">{pad(i - 1)}</span>
                {prev.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <Link href={docHref(next.slug)} rel="next" className="card flex flex-col items-end gap-1 px-4 py-3 text-right hover:border-[var(--text-3)]">
              <span className="flex items-center gap-2 text-xs text-[var(--text-3)]">
                Next <ArrowRight size={12} weight="bold" aria-hidden="true" />
              </span>
              <span className="text-sm text-[var(--text)]">
                <span className="num pr-2 text-[var(--text-3)]">{pad(i + 1)}</span>
                {next.title}
              </span>
            </Link>
          )}
        </nav>
      </article>

      {doc.headings.length > 0 && (
        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-26 max-h-[calc(100vh-128px)] overflow-y-auto">
            <p className="pb-3 text-xs font-semibold text-[var(--text-3)]">On this page</p>
            <ul className="flex flex-col gap-2 border-l border-[var(--line)] text-sm">
              {doc.headings.map((h) => (
                <li key={h.id} className={h.depth === 3 ? "pl-7" : "pl-4"}>
                  <a href={`#${h.id}`} className="block text-[var(--text-2)] hover:text-[var(--text)]">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
