"use client";
import { useEffect, useState } from "react";

function parts(deadlineMs: number, nowMs: number): string {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) {
    const days = Math.floor((nowMs - deadlineMs) / 86_400_000);
    return days <= 0 ? "expired today" : `expired ${days} days ago`;
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

/** Live ticking countdown to a deadline, or how long ago it passed. */
export function Countdown({ deadline }: { deadline: string }): React.ReactNode {
  const deadlineMs = Date.parse(deadline);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="num" suppressHydrationWarning>
      {parts(deadlineMs, nowMs)}
    </span>
  );
}
