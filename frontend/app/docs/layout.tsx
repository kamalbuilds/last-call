import { DocsSidebar } from "@/components/docs-sidebar";
import { getGroups, getOrder } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const order = getOrder().map((d) => d.slug);
  const groups = getGroups().map((g) => ({ ...g, pages: g.pages.map((p) => ({ ...p, n: order.indexOf(p.slug) })) }));
  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 px-4 pt-6 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 lg:pt-0">
      <DocsSidebar groups={groups} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
