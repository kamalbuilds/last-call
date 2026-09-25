# Token terms panel

Every convertible holding on the home page carries a panel titled "Token terms, read on-chain". The data comes from `readTerms()` in `frontend/lib/terms.ts`, which decodes the mint live with `decodeMint()` from `packages/core`. The same data is available at [`GET /api/terms?mint=`](../integrators/http-api.md#get-apiterms).

| Field | What it is | What it means for you |
|---|---|---|
| Transfer fee | The fee rate charged on a transfer right now, in basis points (100 bps = 1%) | Every transfer of this token, including the one inside a conversion, loses this share. See the caution below about the label next to it |
| Permanent delegate | An address that can move or burn tokens in any wallet, or None | If set, the panel adds "The issuer can move or burn these tokens." This is how expired tokens can be removed after a deadline |
| Paused | yes or no | If yes, nothing can transfer, so the Convert button is disabled |
| Multiplier | The scaled-UI multiplier in force now | Your displayed balance is the raw amount times this. SPACEX read 5 on 2026-09-25, from its 5-for-1 split |
| Freeze authority | An address that can freeze token accounts, or None | If set, the issuer can freeze individual accounts. Currently always shows None; see the second caution below |
| read at slot | The Solana slot the mint was read at | Proof of when the panel was read. Compare with a block explorer |

If the mint cannot be read, the panel says "Could not read token terms" instead of showing stale values.

## Caution: the "in force" label on the transfer fee

The number shown is always the rate charged now (`transferFee.currentBps`, the in-force tier). The label next to it comes from a different field, `feeInForce`, which is `true` only once the chain has reached the **newer** tier's epoch (`frontend/lib/terms.ts`).

So when a fee change is scheduled but not yet active, the panel shows the current rate labelled "scheduled, not yet in force". Read live on 2026-09-25: XAI's `/api/terms` returned `transferFeeBps: 100` with `feeInForce: false`, while mainnet was at epoch 1042 and the XAI mint's newer tier (0 bps) starts at epoch 1043. The 100 bps shown is the rate you pay today; the label wrongly suggests it is the future one. The upcoming rate itself is not on the panel. It is on the `/inbox` FEE CHANGE card.

How tiers are selected: [Reading Token-2022](../methodology/token-2022-reading.md).

## Caution: freeze authority always reads None

The panel's freeze authority comes from `freezeAuthorityFromParsed()` in `frontend/lib/terms.ts`, which looks one level too deep into the account data and so always returns null. Live `/api/terms` for XAI and SPACEX on 2026-09-25 returned `freezeAuthority: null`, while a direct `getMultipleAccounts` read at slot 450272212 showed all nine PreStocks mints with freeze authority `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc`, the same address as the permanent delegate. Treat "None" on this row as unknown, and assume the issuer can freeze accounts.
