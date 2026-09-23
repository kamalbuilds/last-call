# LAST CALL

Pre-IPO tokens on Solana have an expiry date that most holders never hear about. LAST CALL shows every PreStocks token's conversion deadline on a departures board and lets a holder convert in one transaction, including holders whose wallet has no SOL for fees.

## The problem, measured

PreStocks tokens give economic exposure to private companies. When a company goes public, its token becomes convertible into the tokenized public stock, and holders get a window to do it. After the window, PreStocks says the tokens "expire worthless and will no longer be supported" ([PreStocks on X, 2026-06-07](https://x.com/PreStocks/status/2063623768535363940)).

The first deadline was xAI's: 11:59pm UTC on 12 September 2026, converting at 0.1433 SPACEX per XAI (0.7165 after SpaceX's 5-for-1 split). Read from mainnet on 23 September 2026:

| Read | Value | Source |
|---|---|---|
| XAI supply still outstanding | 2,078.52 | mint account `PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx` |
| Held by the XAI/SPACEX pool | 599.78 | Jupiter holders API, pool-tagged account |
| Still in holders' wallets | 1,478.75 XAI, about $121k at the pool price | supply minus pool |
| Holders | 1,473 | Jupiter token API |
| Largest wallets with 0 SOL | 4 of the top 10, holding up to 139 XAI each | Jupiter holders API |

A wallet with 0 SOL cannot pay a transaction fee, so it cannot convert even if its owner knows the deadline. The mint carries a permanent delegate, which means the issuer can remove expired tokens at any time.

The next deadline is SpaceX's own: 12 March 2027, for 10,043 holders.

## What it does

- `/ledger` is a departures board: one row per PreStocks token with its conversion target, deadline, status and unconverted amount. Below it, the largest unconverted XAI wallets, with 0-SOL wallets flagged.
- The home page takes any wallet address, or a connected wallet, and shows its PreStocks holdings with deadline countdowns and a live Jupiter quote including price impact and the 1% Token-2022 transfer fee.
- Convert builds a Jupiter swap from the expiring token into its conversion target. When a sponsor wallet is configured, the sponsor is the fee payer and funds the new token account, so the holder needs no SOL. The holder still signs; the sponsor cannot move their tokens.

## How the sponsor stays safe

`packages/sponsor` co-signs only when every check holds: the sponsor is the fee payer; every top-level instruction belongs to ComputeBudget, Jupiter v6, the associated token program or the token programs; there is exactly one Jupiter instruction; the System program does not appear. Its test builds a real conversion and three attacks against it (an extra SOL transfer out of the sponsor, a different fee payer, a transaction with the swap removed) and requires all three to be refused.

## Evidence

Each package has a `check.mjs` that verifies the result independently of the code under test, against mainnet:

| Check | What it proves |
|---|---|
| `packages/convert/check.mjs` | Simulates a real conversion for wallet `CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb` (0 SOL): XAI 139.018 to 138.018, SPACEX received, fee paid by a separate account. Fails if the holder is the payer or the amount exceeds the balance. |
| `packages/ledger/check.mjs` | Recomputes unconverted XAI from the mint and holder data and requires the ledger to match within 2%. |
| `packages/holdings/check.mjs` | Requires the exact on-chain XAI balance for a known holder and a quote into SPACEX in a sane range. |
| `packages/sponsor/check.mjs` | Signs a real conversion, refuses three malicious variants. |
| `apps/web/check.mjs` | Builds and serves the app; the board, holdings API and convert API answer with live data. |

Not yet verified: a conversion sent and finalized on mainnet (so far all conversions are simulations), and behaviour under Jupiter or RPC outages.

## Run it

```
pnpm install
pnpm --filter @lastcall/web dev
```

Optional `.env` in `apps/web`: `SOLANA_RPC_URL`, and `SPONSOR_SECRET_KEY` (base58) for fee-sponsored conversions. Use a dedicated low-balance wallet for the sponsor.

## Built on

Jupiter Swap API for routing, Token-2022 transfer-fee and scaled-UI-amount decoding carried over from an earlier project of ours, Next.js with Wallet Standard, and public Solana RPC.

PreStocks tokens are not available to US persons. LAST CALL is not affiliated with PreStocks and does not give financial advice.
