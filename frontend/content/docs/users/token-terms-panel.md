# Token terms panel

Every convertible holding on the home page carries a panel titled "Token terms, read on-chain". The data comes from `readTerms()` in `frontend/lib/terms.ts`, which decodes the mint live with `decodeMint()` from `packages/core`. The same data is available at [`GET /api/terms?mint=`](../integrators/http-api.md#get-apiterms).

| Field | What it is | What it means for you |
|---|---|---|
| Transfer fee | The fee rate charged on a transfer right now, in basis points (100 bps = 1%) | Every transfer of this token, including the one inside a conversion, loses this share. The label next to it shows any pending tier, see [Transfer fee: now and scheduled](#transfer-fee-now-and-scheduled) |
| Permanent delegate | An address that can move or burn tokens in any wallet, or None | If set, the panel adds "The issuer can move or burn these tokens." This is how expired tokens are removed after a deadline, which is why converting before it matters |
| Paused | yes or no | If yes, nothing can transfer, so the Convert button is disabled |
| Multiplier | The scaled-UI multiplier in force now | Your displayed balance is the raw amount times this. SPACEX read 5 on 2026-09-25, from its 5-for-1 split |
| Freeze authority | An address that can freeze token accounts, or None | If set, the issuer can freeze individual accounts. All nine PreStocks mints read `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` on 2026-09-25, the same address as the permanent delegate |
| read at slot | The Solana slot the mint was read at | Proof of when the panel was read. Compare with a block explorer |

The panel never shows stale values: if the mint cannot be read it says "Could not read token terms".

## Transfer fee: now and scheduled

The number shown is the rate charged on a transfer now (`transferFee.currentBps`, the in-force tier). When the mint also carries a newer tier that has not activated yet, the label adds it: for XAI on 2026-09-25, "100 bps, in force, 0 bps from epoch 1043" (`frontend/lib/terms.ts`, `frontend/components/terms-panel.tsx`). With no pending tier the label reads "in force".

How tiers are selected: [Reading Token-2022](../methodology/token-2022-reading.md).

