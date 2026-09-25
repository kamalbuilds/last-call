# Ledger methodology

How every number on `/ledger` and in `GET /api/ledger` is produced. Code: `buildLedger()` in `packages/ledger/src/index.ts`, wrapped by a five-minute in-process cache in `frontend/lib/ledger.ts`.

## Sources, in the order they are read

| Step | Source | Field used |
|---|---|---|
| 1. Token list | PreStocks API, `https://prestocks.com/api/prestocks` | `symbol`, `contract_address` |
| 2. Add retired tokens | `packages/ledger/src/lifecycle.json` | any entry whose mint the API did not list (today: XAI) |
| 3. Deadline and target | `lifecycle.json` | `deadline`, `conversion` |
| 4. Price | Jupiter Price v3, `https://lite-api.jup.ag/price/v3?ids=...` | `usdPrice` |
| 5. Supply | Solana RPC `getTokenSupply` | `result.value.uiAmount` |
| 6. Holders and pools | Jupiter holders, `https://datapi.jup.ag/v1/holders/<mint>` | `address`, `amount`, `tags`, `solBalanceDisplay` or `solBalance` |
| 7. Holder count | Jupiter token search, `https://lite-api.jup.ag/tokens/v2/search?query=<mint>` | `holderCount` of the exact mint match; else `count` from step 6 |

Tokens are read one at a time, 400 ms apart. Every HTTP read retries up to six times on 429 and 5xx with exponential backoff capped at 30 s, honoring `Retry-After`.

## Derived fields

```
status               = "private"    if deadline is null
                       "expired"    if deadline <= generatedAt
                       "converting" otherwise
poolHeld             = sum of amount over holder rows tagged { id: "Pool" }
unconvertedInWallets = supply - poolHeld
unconvertedUsd       = unconvertedInWallets * priceUsd   (null if no price)
holder.usd           = holder.amount * priceUsd
```

On the page (`frontend/app/ledger/page.tsx`):

- the XAI dollar header is `unconvertedUsd` for XAI;
- "need a fee sponsor" counts XAI holder rows with `solBalance < 0.001`;
- the wallet grid shows the 20 largest non-pool XAI rows.

## Supply includes the scaled-UI multiplier

`getTokenSupply`'s `uiAmount` already applies the mint's scaled-UI multiplier. Read on 2026-09-25 from `https://api.mainnet-beta.solana.com` at slot 450270995 for SPACEX: `amount` 8742505859139, `decimals` 9, `uiAmount` 43712.529295695, which is 5 times the raw amount over 10^9. So supply and holder amounts are both in displayed units. If an RPC ever returned an unscaled `uiAmount`, SPACEX supply would read five times too low; the code does not check for that.

## RPC endpoint

`getTokenSupply` goes to `SOLANA_RPC_URL`, or `https://solana-rpc.publicnode.com` when unset, then falls back to `https://api.mainnet-beta.solana.com`. On 2026-09-25 publicnode answered `getTokenSupply` with "Indexed requests require a personal token", so without `SOLANA_RPC_URL` the supply comes from the fallback.

## Fallbacks and failure

- If the PreStocks API still fails after its retries, `buildLedger()` throws. `/api/ledger` returns 500 and `/ledger` shows "The board did not load". There is no fallback to `lifecycle.json` for the token list here. (`ARCHITECTURE.md` says the ledger falls back; the code does not. `packages/holdings` does fall back: when its PreStocks read fails or comes back empty, it uses the `lifecycle.json` mints instead.)
- `lifecycle.json` is always merged in, so XAI appears even though the API no longer lists it.
- A missing price gives `priceUsd: null` and `unconvertedUsd: null`; the page then shows $0 for XAI.
- No holder count from either Jupiter source throws for the whole board.

## What a row proves

- The token's supply at the time of the read, from the chain.
- How much of that supply sat in accounts Jupiter tags as pools, among the holder rows Jupiter returned.
- The deadline and target LAST CALL is using, and the file they came from.

## What a row does not prove

- **That the remainder sits in personal wallets.** `unconvertedInWallets` is supply minus pools only. Exchange, issuer, program-owned or untagged pool accounts all count as "in wallets".
- **That every pool was subtracted.** Only pool rows inside the holder list are subtracted. On 2026-09-25 that list held 87 to 99 non-pool rows per token (live `/api/ledger`, `generatedAt` 2026-09-25T06:24:40.888Z), so a pool outside the largest holders is missed.
- **A redemption value.** USD figures use Jupiter's market price, not a conversion rate or anything PreStocks will pay.
- **That the deadline is on chain.** Deadlines are hand-entered in `lifecycle.json` from a PreStocks post. Nothing on the mint records them.
- **That tokens are still redeemable** after a deadline. For expired tokens, "unconverted" only means not yet swapped.
- **Holder count precision.** `holderCount` is Jupiter's figure and may count accounts rather than people.

## Worked example

XAI from the live `/api/ledger` read at 2026-09-25T06:24:40.888Z: supply 2078.524264422, `poolHeld` 605.448191486, `unconvertedInWallets` 1473.076072936, `holderCount` 1470, status `expired`.

## Independent check

`packages/ledger/check.mjs` recomputes unconverted XAI from the mint and holder data and requires the ledger to agree within 2% (per `README.md`; not rerun for this page).
