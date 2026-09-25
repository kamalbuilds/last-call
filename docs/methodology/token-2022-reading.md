# Reading Token-2022

LAST CALL reads three things from each mint that change what a holder gets: the transfer fee, the scaled-UI multiplier, and the issuer's powers (permanent delegate, pause, freeze).

## Three decoders

| Where | Used by | How |
|---|---|---|
| `decodeMint()`, `packages/core/src/decode.ts` | `/api/terms`, the terms panel, `packages/holdings` | `getParsedAccountInfo` (jsonParsed) plus `getAccountInfo` (raw bytes). Requires a Token-2022 owner and a `transferFeeConfig` extension, otherwise throws |
| `batchDecodeMints()`, `packages/events/src/index.ts` | `/inbox`, `/api/inbox.ics` | `getMultipleAccountsInfo` in chunks of 100, unpacked with `@solana/spl-token` (`getTransferFeeConfig`, `getScaledUiAmountConfig`, `getPausableConfig`). Missing extensions are skipped, not errors |
| `readScaledFacts()`, `frontend/app/api/true-balance/data.ts`, and `getOutputUiParams()`, `packages/holdings/src/index.ts` | true balance, quote output amounts | jsonParsed, `scaledUiAmountConfig` only. Exists because some xStocks have no transfer fee and `decodeMint` would throw on them |

All three feed the same selection functions from `packages/core`, so the in-force rule is the same everywhere.

## Transfer fee: two tiers and an epoch

A `transferFeeConfig` stores two tiers, `olderTransferFee` and `newerTransferFee`, each with an activation epoch, a basis-point rate and a maximum fee. The newer tier is a schedule. The token program keeps charging the older tier until the chain reaches the newer tier's epoch.

`inForceTier()` in `packages/core/src/fee.ts`:

```
currentEpoch <  older.epoch  -> throw (not a state it can answer)
currentEpoch >= newer.epoch  -> newer
otherwise                    -> older
```

`buildTransferFee()` then fills `MintFacts.transferFee`:

| Field | Meaning |
|---|---|
| `current` | the **newer** tier as stored. A naming trap: not necessarily the rate charged now |
| `previous` | the older tier, or null when both tiers are identical |
| `currentBps` | the in-force rate. Use this one |
| `roundTripBps` | `currentBps * 2` |
| `uncapped` | in-force `maximumFee` equals u64 max |
| `pendingBps`, `pendingActivationEpoch` | the scheduled tier if not yet active |
| `slotsUntilActivation`, `secondsUntilActivation` | countdown to that epoch; seconds at the 0.4 s target slot time, so an estimate |

`packages/exec/src/fee.ts` applies the same rule on the execution side, with `transferFeeOf()` rounding the fee up and capping it at `maximumFee`.

### Live example

Read from `https://api.mainnet-beta.solana.com` on 2026-09-25: `getEpochInfo` returned epoch 1042 (slot 450270994), and the XAI mint's `transferFeeConfig` at slot 450270997 held:

| Tier | Epoch | Rate |
|---|---|---|
| older | 1039 | 100 bps |
| newer | 1043 | 0 bps |

So XAI charges 100 bps now, with 0 bps scheduled from epoch 1043.

All nine PreStocks mints, read with `getMultipleAccounts` (jsonParsed) at slot 450272212 the same day:

| Mints | Older tier | Newer tier | In force at epoch 1042 |
|---|---|---|---|
| ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET | 100 bps from 1039 | 300 bps from 1043 | 100 bps, 300 pending |
| SPACEX | 50 bps from 1032 | 100 bps from 1039 | 100 bps |
| XAI | 100 bps from 1039 | 0 bps from 1043 | 100 bps, 0 pending |

This matches the 100 to 300 bps change `README.md` describes for the seven tokens.

## Raw TLV cross-check

`decodeMint` does not trust the jsonParsed view alone. `readTransferFeeConfigExact()` in `packages/core/src/tlv.ts` walks the raw account bytes:

- extensions start at byte offset 166, each entry a u16 type, u16 length, then data;
- `transferFeeConfig` is type 1 and at least 108 bytes long;
- the older tier sits at data offset 72, the newer at 90; each tier is epoch (u64), maximum fee (u64), basis points (u16).

If the raw epochs or rates disagree with jsonParsed, `decodeMint` throws rather than pick one. The raw read also keeps `maximumFee` exact, since u64 max overflows a JavaScript number (jsonParsed showed it as 18446744073709552000 in the read above).

## Scaled-UI multiplier: the `multiplier` vs `newMultiplier` trap

`scaledUiAmountConfig` has `multiplier`, `newMultiplier` and `newMultiplierEffectiveTimestamp`. After a split or dividend, `multiplier` keeps the old value; `newMultiplier` takes over once the timestamp passes. Reading `multiplier` alone gets SPACEX wrong by 5x (comment in `packages/core/src/types.ts`).

`operativeMultiplier()` in `packages/core/src/multiplier.ts`:

```
asOfUnix >= newMultiplierEffectiveTimestamp ? newMultiplier : multiplier
```

It throws on blank or non-numeric values rather than return 0. SPACEX read 5 through `/api/terms` on 2026-09-25 (slot 450270848). Displayed amount = raw / 10^decimals * operative multiplier.

`/api/gap-history` reads the multiplier from Jupiter's `scaledUiConfig` instead (`newMultiplier`, else `multiplier`, no timestamp check), then only uses it if it reconciles GeckoTerminal's price with Jupiter's within 35%. `/api/conversions` applies the timestamp check to Jupiter's data.

## Issuer powers

From `decodeMint`, returned as `MintFacts.powers`:

| Field | Extension | Meaning |
|---|---|---|
| `permanentDelegate` | `permanentDelegate.delegate` | can move or burn any holder's tokens |
| `pausableAuthority`, `paused` | `pausableConfig` | can halt all transfers; `paused` is the current state |
| `transferFeeAuthority`, `withdrawWithheldAuthority` | `transferFeeConfig` | can change the fee; can collect withheld fees |
| `transferHookAuthority`, `transferHookProgramId` | `transferHook` | can attach a program to every transfer |
| `scaledUiAmountAuthority` | `scaledUiAmountConfig` | can change the multiplier |
| `defaultAccountState` | `defaultAccountState` | `frozen` would mean new accounts start frozen |
| `singleKeyControlsAll` | derived | one key holds every one of the above |

Freeze authority is a base mint field, not an extension. `readTerms()` reads it from the jsonParsed account (`freezeAuthorityFromParsed()` in `frontend/lib/terms.ts`), and `frontend/check-terms.mjs` asserts the live value. All nine PreStocks mints had freeze authority `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` at slot 450272212.

In the 2026-09-25 XAI read, one address, `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc`, held the permanent delegate, pause, transfer fee, withdraw-withheld, transfer hook and scaled-UI authorities, with no transfer hook program set.

## Inbox events from the decode

`buildEventsForMint()` in `packages/events/src/index.ts`:

- `fee_change` whenever the two tiers differ, including changes that took effect long ago. `inForce` is `currentBps === newer.transferFeeBasisPoints`.
- `dividend_or_split` whenever `multiplier` and `newMultiplier` differ by more than 1e-12, with `pending` true until the timestamp.
- `paused` when `pausableConfig.paused` is true.
