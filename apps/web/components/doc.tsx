import type { ReactNode } from "react";

/** The one container width the whole document is set in. */
export function Column({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1180px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

/**
 * A numbered clause header, set the way a filing sets one: the section mark in the
 * gutter, the rule above it, the heading and standfirst in the text column.
 */
export function Section({
  mark,
  title,
  standfirst,
  id,
  children,
}: {
  mark: string;
  title: string;
  standfirst?: ReactNode;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-12 border-t border-rule-strong pt-6 sm:pt-8">
      <header className="grid grid-cols-1 gap-x-8 sm:grid-cols-[4.5rem_1fr]">
        <span className="label label-strong pt-2">{mark}</span>
        <div className="mt-2 sm:mt-0">
          <h2 className="max-w-[25ch] text-[1.7rem] leading-[1.12] font-normal text-paper sm:text-[2.05rem]">
            {title}
          </h2>
          {standfirst ? (
            <p className="mt-3 max-w-[66ch] text-[1.02rem] leading-[1.6] text-paper-dim">{standfirst}</p>
          ) : null}
        </div>
      </header>
      <div className="mt-7 sm:mt-9">{children}</div>
    </section>
  );
}

/** A mono caption under an exhibit. Carries the origin of the numbers above it. */
export function Note({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" }) {
  return (
    <p
      className={`mt-3 max-w-[92ch] font-mono text-[0.7rem] leading-[1.75] [overflow-wrap:anywhere] ${
        tone === "warn" ? "text-caution" : "text-paper-faint"
      }`}
    >
      {children}
    </p>
  );
}

/** Bordered exhibit frame. Square corners; this is a document, not a dashboard. */
export function Exhibit({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-rule bg-ink-panel ${className}`}>{children}</div>;
}

/** Key/value line used in the instrument band and the record block. */
export function Datum({ k, v, tone = "plain" }: { k: string; v: ReactNode; tone?: "plain" | "warn" }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="label shrink-0">{k}</span>
      <span
        className={`num text-[0.72rem] leading-[1.5] ${tone === "warn" ? "text-caution" : "text-paper-dim"}`}
      >
        {v}
      </span>
    </div>
  );
}

/** A figure set large enough to be the argument rather than a decoration. */
export function Figure({
  label,
  value,
  sub,
  tone = "plain",
  size = "sm",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "plain" | "dim" | "errata" | "assent";
  size?: "sm" | "lg";
}) {
  const colour =
    tone === "errata"
      ? "text-errata"
      : tone === "assent"
        ? "text-assent"
        : tone === "dim"
          ? "text-paper-dim"
          : "text-paper";
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={`num mt-3 tracking-[-0.03em] ${colour} ${
          size === "lg" ? "text-figure" : "text-figure-sm"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-3 font-mono text-[0.7rem] leading-[1.6] text-paper-faint">{sub}</div> : null}
    </div>
  );
}

/** Horizontally scrollable wrapper for the dense tables. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="scroll-x -mx-5 border-y border-rule px-5 sm:mx-0 sm:border sm:px-0">
        {children}
      </div>
      <p className="label mt-2 md:hidden">Scroll the table sideways for the remaining columns</p>
    </>
  );
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`label whitespace-nowrap border-b border-rule px-3 py-2.5 font-normal ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  tone = "plain",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  tone?: "plain" | "dim" | "errata" | "assent";
  className?: string;
}) {
  const colour =
    tone === "errata"
      ? "text-errata"
      : tone === "assent"
        ? "text-assent"
        : tone === "dim"
          ? "text-paper-faint"
          : "text-paper-dim";
  return (
    <td
      className={`num whitespace-nowrap px-3 py-2.5 text-[0.78rem] ${colour} ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}
