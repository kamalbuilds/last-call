"use client";
import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

function slides(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-slide]")];
}

/** Fixed deck control: ArrowRight/ArrowLeft (and PageDown/PageUp) step between [data-slide] sections. */
export function DeckNav({ count }: { count: number }): React.ReactNode {
  const [index, setIndex] = useState<number>(0);
  const indexRef = useRef<number>(0);

  const go = (delta: number): void => {
    const all = slides();
    const next = Math.min(all.length - 1, Math.max(0, indexRef.current + delta));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    all[next]?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    indexRef.current = next;
    setIndex(next);
  };

  useEffect(() => {
    const all = slides();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = all.indexOf(entry.target as HTMLElement);
          indexRef.current = i;
          setIndex(i);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    all.forEach((s) => observer.observe(s));
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const pad = (n: number): string => String(n).padStart(2, "0");

  return (
    <nav
      data-deck-nav
      aria-label="Slide navigation"
      className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-1"
    >
      <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide" className="btn-ghost p-2 disabled:opacity-40">
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
      </button>
      <span className="num px-1 text-sm text-[var(--text-2)]" aria-live="polite">
        {`${pad(index + 1)} / ${pad(count)}`}
      </span>
      <button type="button" onClick={() => go(1)} disabled={index === count - 1} aria-label="Next slide" className="btn-ghost p-2 disabled:opacity-40">
        <CaretRight size={16} weight="bold" aria-hidden="true" />
      </button>
    </nav>
  );
}
