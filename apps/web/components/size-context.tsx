"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { CostVerdict } from "@/lib/contract";
import type { SourceKind } from "@/lib/data";

export interface VerdictPayload {
  verdict: CostVerdict;
  source: SourceKind;
  /** False when the quote could only be answered at a nearby measured size. */
  exact: boolean;
  requestedUsd: number;
}

interface SizeState {
  notionalUsd: number;
  setNotionalUsd: (n: number) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  /** Section 2 resolves the verdict; section 4 is gated on it. One quote, not two. */
  verdict: VerdictPayload;
  setVerdict: (v: VerdictPayload) => void;
}

const SizeCtx = createContext<SizeState | null>(null);

/** Section 2 sets the size, section 4 spends it. One number, one owner. */
export function SizeProvider({
  children,
  defaultSymbol,
  initialVerdict,
}: {
  children: ReactNode;
  defaultSymbol: string;
  initialVerdict: VerdictPayload;
}) {
  const [notionalUsd, setNotionalUsd] = useState(initialVerdict.requestedUsd);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [verdict, setVerdict] = useState<VerdictPayload>(initialVerdict);
  const value = useMemo(
    () => ({ notionalUsd, setNotionalUsd, symbol, setSymbol, verdict, setVerdict }),
    [notionalUsd, symbol, verdict],
  );
  return <SizeCtx.Provider value={value}>{children}</SizeCtx.Provider>;
}

export function useSize(): SizeState {
  const ctx = useContext(SizeCtx);
  if (!ctx) throw new Error("useSize used outside SizeProvider");
  return ctx;
}

export const MIN_USD = 500;
export const MAX_USD = 1_000_000;
const LOG_MIN = Math.log10(MIN_USD);
const LOG_MAX = Math.log10(MAX_USD);

/** The dial is logarithmic because the interesting behaviour spans three decades. */
export function dialToUsd(position: number): number {
  const usd = 10 ** (LOG_MIN + (position / 1000) * (LOG_MAX - LOG_MIN));
  if (usd >= 100_000) return Math.round(usd / 5000) * 5000;
  if (usd >= 10_000) return Math.round(usd / 500) * 500;
  if (usd >= 1000) return Math.round(usd / 100) * 100;
  return Math.round(usd / 50) * 50;
}

export function usdToDial(usd: number): number {
  const clamped = Math.min(MAX_USD, Math.max(MIN_USD, usd));
  return Math.round(((Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
}
