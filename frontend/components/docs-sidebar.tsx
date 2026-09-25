"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { DocGroup } from "@/lib/docs";

type Numbered = Omit<DocGroup, "pages"> & { pages: (DocGroup["pages"][number] & { n: number })[] };

const pad = (n: number): string => String(n).padStart(2, "0");

function List({ groups, active }: { groups: Numbered[]; active: string }): React.ReactNode {
  const item = (href: string, n: string, label: string) => (
    <Link
      href={href}
      aria-current={active === href ? "page" : undefined}
      className="group flex items-baseline gap-3 rounded-md px-2 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--panel)] hover:text-[var(--text)] aria-[current=page]:bg-[var(--panel-2)] aria-[current=page]:text-[var(--text)]"
    >
      <span className="num w-5 shrink-0 text-xs text-[var(--text-3)] group-aria-[current=page]:text-[var(--text-2)]">{n}</span>
      <span>{label}</span>
    </Link>
  );
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      <div>{item("/docs", "00", "Overview")}</div>
      {groups.map((g) => (
        <div key={g.name}>
          <p className="px-2 pb-2 text-xs font-semibold text-[var(--text-3)]">{g.name}</p>
          <div className="flex flex-col gap-0.5 border-l border-[var(--line)] pl-2">
            {g.pages.map((p) => (
              <div key={p.slug}>{item(`/docs/${p.slug}`, pad(p.n), p.title)}</div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Docs page list: a sticky column on desktop, a collapsed disclosure on phones. */
export function DocsSidebar({ groups }: { groups: Numbered[] }): React.ReactNode {
  const active = usePathname() ?? "/docs";
  const mobile = useRef<HTMLDetailsElement>(null);
  const current = groups.flatMap((g) => g.pages).find((p) => `/docs/${p.slug}` === active)?.title ?? "Overview";

  useEffect(() => {
    if (mobile.current) mobile.current.open = false;
  }, [active]);

  return (
    <>
      <details ref={mobile} className="group card lg:hidden">
        <summary className="flex list-none items-center justify-between px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <span className="text-[var(--text-3)]">
            Docs <span className="px-1">/</span> <span className="text-[var(--text)]">{current}</span>
          </span>
          <CaretDown size={12} weight="bold" aria-hidden="true" className="text-[var(--text-3)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--line)] p-3">
          <List groups={groups} active={active} />
        </div>
      </details>
      <aside className="sticky top-14 hidden max-h-[calc(100vh-56px)] overflow-y-auto py-12 pr-4 lg:block">
        <List groups={groups} active={active} />
      </aside>
    </>
  );
}
