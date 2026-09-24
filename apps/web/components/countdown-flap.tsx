"use client";
import { useEffect, useState } from "react";
import { SplitFlap } from "@/components/split-flap";

function flapValue(deadlineMs: number, nowMs: number): string {
  const diff = Math.max(0, deadlineMs - nowMs);
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${days}D ${pad(hours)}H`;
}

/** Ticking days and hours countdown rendered as flap tiles. */
export function CountdownFlap({ deadline, size = "md" }: { deadline: string; size?: "sm" | "md" | "lg" }): React.ReactNode {
  const deadlineMs = Date.parse(deadline);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return <SplitFlap value={flapValue(deadlineMs, nowMs)} size={size} label={flapValue(deadlineMs, nowMs)} />;
}
