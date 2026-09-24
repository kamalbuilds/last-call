"use client";

interface SplitFlapProps {
  value: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<SplitFlapProps["size"]>, string> = {
  sm: "h-7 min-w-7 px-1 text-sm",
  md: "h-10 min-w-10 px-1.5 text-xl",
  lg: "h-14 min-w-12 px-2 text-3xl sm:h-16 sm:min-w-14 sm:text-4xl",
};

/** Airport flap board: each character in its own tile with a hinge line. */
export function SplitFlap({ value, label, size = "md", className = "" }: SplitFlapProps): React.ReactNode {
  const chars = [...value];
  return (
    <span
      role={label !== undefined ? "img" : undefined}
      aria-label={label ?? value}
      className={`flap-row inline-flex flex-wrap items-stretch gap-1 ${className}`}
    >
      {chars.map((ch, i) =>
        ch === " " ? (
          <span key={`sp-${i}`} aria-hidden="true" className="inline-block w-2 sm:w-3" />
        ) : (
          <span
            key={`${i}-${ch}`}
            aria-hidden="true"
            style={{ animationDelay: `${i * 30}ms` }}
            className={`flap-tile ${SIZES[size]}`}
          >
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
