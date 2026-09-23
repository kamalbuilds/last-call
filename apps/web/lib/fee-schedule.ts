import type { MintFacts } from "@/lib/contract";
import { rpcUrl } from "@/lib/packages";

/**
 * Which transfer fee tier is actually in force, and when the next one activates.
 *
 * A Token-2022 mint carries two tiers, each stamped with the epoch it takes effect
 * in. Reading the newer one as "current" is the same class of mistake as reading the
 * stale scaled UI multiplier: the field is there, it parses, and it is not yet true.
 * On these mints the newer tier is 100bps at epoch 1039 while the chain is still in
 * 1038, so the fee being charged today is the older 50bps tier.
 *
 * @fineprint/core exposes currentBps as the in-force tier plus pendingBps,
 * pendingActivationEpoch, currentEpoch, slotsUntilActivation and
 * secondsUntilActivation. Those are used whenever present. The fallback below covers
 * a core build that predates them: it resolves the same answer from one getEpochInfo
 * call, which reads the chain's own clock rather than decoding the fee extension a
 * second time. Delete the fallback once no such build is in circulation.
 */

export interface FeeSchedule {
  inForceBps: number;
  inForceRoundTripBps: number;
  inForceEpoch: number;
  pendingBps: number | null;
  pendingRoundTripBps: number | null;
  pendingActivationEpoch: number | null;
  currentEpoch: number | null;
  slotsUntilActivation: number | null;
  secondsUntilActivation: number | null;
  uncapped: boolean;
  /** Where the activation timing came from, so the document can say. */
  source: "core" | "epoch-read";
}

/** The fields @fineprint/core is adding. Read defensively until they exist. */
interface CoreFeeExtras {
  pendingBps?: unknown;
  pendingActivationEpoch?: unknown;
  currentEpoch?: unknown;
  slotsUntilActivation?: unknown;
  secondsUntilActivation?: unknown;
}

const SLOT_SECONDS = 0.4;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function resolveFeeSchedule(facts: MintFacts): Promise<FeeSchedule | null> {
  const fee = facts.transferFee;
  if (!fee) return null;

  const extras = fee as unknown as CoreFeeExtras;
  const pendingBps = num(extras.pendingBps);
  const pendingActivationEpoch = num(extras.pendingActivationEpoch);
  const slotsFromCore = num(extras.slotsUntilActivation);
  const secondsFromCore = num(extras.secondsUntilActivation);

  const currentEpochFromCore = num((fee as unknown as CoreFeeExtras).currentEpoch);

  if (pendingBps !== null && pendingActivationEpoch !== null) {
    // core.currentBps is documented as the in-force tier, selected by epoch. Use it
    // rather than re-deriving; only the tier's own epoch has to be located here.
    const inForceTier = [fee.current, fee.previous]
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .filter((t) => t.transferFeeBasisPoints === fee.currentBps)
      .sort((a, b) => b.epoch - a.epoch)[0];
    return {
      inForceBps: fee.currentBps,
      inForceRoundTripBps: fee.roundTripBps,
      inForceEpoch: inForceTier?.epoch ?? pendingActivationEpoch - 1,
      pendingBps,
      pendingRoundTripBps: pendingBps * 2,
      pendingActivationEpoch,
      currentEpoch: currentEpochFromCore ?? pendingActivationEpoch - 1,
      slotsUntilActivation: slotsFromCore,
      secondsUntilActivation:
        secondsFromCore ?? (slotsFromCore === null ? null : slotsFromCore * SLOT_SECONDS),
      uncapped: fee.uncapped,
      source: "core",
    };
  }

  const tiers = [fee.current, fee.previous].filter((t): t is NonNullable<typeof t> => t !== null);
  if (tiers.length === 0) return null;

  const epoch = await readEpoch();
  if (!epoch) {
    // No clock, so no claim about which tier is in force. The panel says so.
    return null;
  }

  const active = tiers
    .filter((t) => t.epoch <= epoch.epoch)
    .sort((a, b) => b.epoch - a.epoch)[0];
  const upcoming = tiers.filter((t) => t.epoch > epoch.epoch).sort((a, b) => a.epoch - b.epoch)[0];
  if (!active) return null;

  const slotsLeft = epoch.slotsInEpoch - epoch.slotIndex;
  const epochsAway = upcoming ? upcoming.epoch - epoch.epoch : 0;
  const slotsUntilActivation = upcoming
    ? slotsLeft + (epochsAway - 1) * epoch.slotsInEpoch
    : null;

  return {
    inForceBps: active.transferFeeBasisPoints,
    inForceRoundTripBps: active.transferFeeBasisPoints * 2,
    inForceEpoch: active.epoch,
    pendingBps: upcoming ? upcoming.transferFeeBasisPoints : null,
    pendingRoundTripBps: upcoming ? upcoming.transferFeeBasisPoints * 2 : null,
    pendingActivationEpoch: upcoming ? upcoming.epoch : null,
    currentEpoch: epoch.epoch,
    slotsUntilActivation,
    secondsUntilActivation: slotsUntilActivation === null ? null : slotsUntilActivation * SLOT_SECONDS,
    uncapped: fee.uncapped,
    source: "epoch-read",
  };
}

interface EpochInfo {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
}

async function readEpoch(): Promise<EpochInfo | null> {
  try {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getEpochInfo",
        params: [{ commitment: "confirmed" }],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: Partial<EpochInfo> };
    const r = body.result;
    if (
      !r ||
      typeof r.epoch !== "number" ||
      typeof r.slotIndex !== "number" ||
      typeof r.slotsInEpoch !== "number"
    ) {
      return null;
    }
    return { epoch: r.epoch, slotIndex: r.slotIndex, slotsInEpoch: r.slotsInEpoch };
  } catch {
    return null;
  }
}
