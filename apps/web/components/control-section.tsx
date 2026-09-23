import type { MintFacts } from "@/lib/contract";
import type { FeeSchedule } from "@/lib/fee-schedule";
import { Column, Exhibit, Note, Section } from "@/components/doc";
import { fmtBps, fmtQty, fmtUnixUtc, shortKey } from "@/lib/format";

interface Power {
  name: string;
  consequence: string;
  evidence: string[];
  exercised?: string;
}

function buildPowers(
  f: MintFacts,
  withheldRaw: string | undefined,
  key: (k: string) => string,
  schedule: FeeSchedule | null,
): Power[] {
  const p = f.powers;
  const fee = f.transferFee;
  const scaled = f.scaledUiAmount;
  const powers: Power[] = [];

  if (p.permanentDelegate) {
    powers.push({
      name: "permanentDelegate",
      consequence:
        "Move tokens out of any holder's account without that holder's signature or consent. It is a standing delegation, not a one-time approval, and revoking it is not something a holder can do.",
      evidence: [`extension permanentDelegate`, `delegate ${key(p.permanentDelegate)}`],
    });
  }
  if (p.pausableAuthority) {
    powers.push({
      name: "pausableConfig.authority",
      consequence:
        "Halt every transfer of the mint. While paused, nobody can sell, send or exit, including through any venue, because the halt is enforced by the token program itself.",
      evidence: [`extension pausableConfig`, `paused ${String(p.paused)}`, `authority ${key(p.pausableAuthority)}`],
    });
  }
  if (p.transferFeeAuthority) {
    powers.push({
      name: "transferFeeConfig.authority",
      consequence:
        "Set the fee taken out of every transfer. There is no ceiling in the extension and no holder vote in front of it.",
      evidence: [
        `newerTransferFee ${fee.current.transferFeeBasisPoints} bps at epoch ${fee.current.epoch}`,
        fee.previous
          ? `olderTransferFee ${fee.previous.transferFeeBasisPoints} bps at epoch ${fee.previous.epoch}`
          : "no prior tier recorded",
        `maximumFee ${fee.current.maximumFee}`,
        fee.uncapped ? "which is u64 max, so uncapped" : "capped",
      ],
      exercised:
        schedule && schedule.pendingBps !== null
          ? `Already used, and pending again. ${fmtBps(schedule.inForceBps)} is charged today under the tier from epoch ${schedule.inForceEpoch}; ${fmtBps(schedule.pendingBps)} is scheduled and starts at epoch ${schedule.pendingActivationEpoch}.`
          : fee.previous &&
              fee.previous.transferFeeBasisPoints !== fee.current.transferFeeBasisPoints
            ? `Already used. ${fmtBps(fee.previous.transferFeeBasisPoints)} at epoch ${fee.previous.epoch}, ${fmtBps(fee.current.transferFeeBasisPoints)} from epoch ${fee.current.epoch}.`
            : undefined,
    });
  }
  if (p.withdrawWithheldAuthority) {
    powers.push({
      name: "withdrawWithheldAuthority",
      consequence:
        "Sweep the fees that have already been withheld from transfers and are sitting on the mint and on holder accounts.",
      evidence: [
        `authority ${key(p.withdrawWithheldAuthority)}`,
        withheldRaw
          ? `withheldAmount ${fmtQty(Number(withheldRaw) / 10 ** f.decimals, 9)} ${f.symbol} held on the mint now`
          : "withheldAmount read from transferFeeConfig",
      ],
    });
  }
  if (p.transferHookAuthority) {
    powers.push({
      name: "transferHook.authority",
      consequence:
        "Point every transfer at an arbitrary program that runs before the transfer settles. That program can make transfers fail on conditions the holder never agreed to.",
      evidence: [
        `extension transferHook`,
        `authority ${key(p.transferHookAuthority)}`,
        `programId ${p.transferHookProgramId ? key(p.transferHookProgramId) : "null, no hook attached today"}`,
      ],
    });
  }
  if (p.scaledUiAmountAuthority) {
    powers.push({
      name: "scaledUiAmountConfig.authority",
      consequence:
        "Change the multiplier that decides what every balance of this token displays as, everywhere, at a timestamp of their choosing. Section 1 is what that looks like after it happens.",
      evidence: scaled
        ? [
            `authority ${key(p.scaledUiAmountAuthority)}`,
            `multiplier ${scaled.multiplier} to newMultiplier ${scaled.newMultiplier}`,
            `effective ${scaled.newMultiplierEffectiveTimestamp > 0 ? fmtUnixUtc(scaled.newMultiplierEffectiveTimestamp) : "epoch 0"}`,
          ]
        : [`authority ${key(p.scaledUiAmountAuthority)}`],
      exercised:
        scaled && scaled.operativeMultiplier !== Number(scaled.multiplier)
          ? `Already used. The operative multiplier is ${scaled.operativeMultiplier} while the multiplier field still reads ${scaled.multiplier}.`
          : undefined,
    });
  }
  return powers;
}

export function ControlSection({
  facts,
  exhibitSymbol,
  withheldFeesRaw,
  feeSchedule,
}: {
  facts: MintFacts[];
  exhibitSymbol: string;
  withheldFeesRaw: Record<string, string>;
  feeSchedule: FeeSchedule | null;
}) {
  const exhibit =
    facts.find((f) => f.symbol === exhibitSymbol) ??
    facts.find((f) => f.powers.singleKeyControlsAll) ??
    facts[0];
  const keys = exhibit.powers.distinctAuthorities;
  const soleKey = keys.length === 1 ? keys[0] : null;
  // The sole key is printed in full once, at the top. Repeating it in six evidence
  // blocks only buys six line wraps, so the rows abbreviate back to it.
  const abbreviate = (k: string) => (k === soleKey ? `${shortKey(k, 6, 6)}, the key above` : k);
  const powers = buildPowers(exhibit, withheldFeesRaw[exhibit.symbol], abbreviate, feeSchedule);
  const used = powers.filter((p) => p.exercised).length;

  return (
    <Column>
      <Section
        id="control"
        mark="§ 3"
        title={`${powers.length} levers over your position, and one key holds all of them.`}
        standfirst={
          <>
            None of this is hidden. It is in the mint account of {exhibit.symbol}, readable by anyone
            with an RPC endpoint, and it appears in no buy flow anywhere.{" "}
            {used > 0
              ? `${used} of the ${powers.length} have been exercised, and one of those is queued to fire again.`
              : "None has been used yet."}{" "}
            The rest are simply available, today, to a single signer.
          </>
        }
      >
        <Exhibit>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-b border-rule px-6 py-5 sm:px-7">
            <div>
              <div className="label">
                {soleKey ? "Sole authority across every lever" : "Authorities"}
              </div>
              <div className="num mt-2 text-[0.75rem] [overflow-wrap:anywhere] text-paper sm:text-[0.95rem]">
                {soleKey ?? keys.join(", ")}
              </div>
            </div>
            <div className="text-right">
              <div className="label">Concentration</div>
              <div className="num mt-2 text-[1.5rem] leading-none text-errata">
                {powers.length}/{powers.length}
              </div>
            </div>
          </div>

          <ul>
            {powers.map((power) => (
              <li
                key={power.name}
                className="grid grid-cols-1 gap-x-8 gap-y-3 border-b border-rule px-6 py-6 last:border-b-0 sm:px-7 lg:grid-cols-[14rem_1fr_19rem]"
              >
                <div>
                  <div className="num text-[0.78rem] leading-snug text-paper">{power.name}</div>
                  {power.exercised ? (
                    <div className="label mt-2 inline-block border border-errata px-1.5 py-0.5 text-errata">
                      exercised
                    </div>
                  ) : null}
                </div>
                <p className="max-w-[58ch] text-[0.98rem] leading-[1.6] text-paper-dim">
                  {power.consequence}
                  {power.exercised ? (
                    <span className="mt-2 block text-errata">{power.exercised}</span>
                  ) : null}
                </p>
                <div className="font-mono text-[0.68rem] leading-[1.9] [overflow-wrap:anywhere] text-paper-faint">
                  {power.evidence.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-x-10 gap-y-2 border-t border-rule px-6 py-4 sm:px-7">
            <span className="num text-[0.7rem] text-paper-faint">
              paused <span className="text-paper-dim">{String(exhibit.powers.paused)}</span>
            </span>
            <span className="num text-[0.7rem] text-paper-faint">
              defaultAccountState{" "}
              <span className="text-paper-dim">{exhibit.powers.defaultAccountState ?? "unset"}</span>
            </span>
            <span className="num text-[0.7rem] text-paper-faint">
              distinct authorities <span className="text-paper-dim">{keys.length}</span>
            </span>
            <span className="num text-[0.7rem] text-paper-faint">
              extensions <span className="text-paper-dim">{exhibit.extensionsPresent.length}</span>
            </span>
          </div>
        </Exhibit>

        <p className="mt-6 max-w-[70ch] text-[1.02rem] leading-[1.62] text-paper-dim">
          Nothing here says the issuer will use any of it. Transfers are not paused, accounts are not
          frozen by default, and no hook program is attached. What the mint account establishes is that
          the decision belongs to one key and not to you, and that the fee half of it has already moved
          once in the holder&apos;s direction of loss.
        </p>
        <Note>
          Decoded from the mint account of {exhibit.symbol} ({exhibit.mint}) at slot{" "}
          {exhibit.slot > 0 ? exhibit.slot.toLocaleString("en-US") : "not recorded"}. The other tracked
          mints carry the same authority in every position.
        </Note>
      </Section>
    </Column>
  );
}
