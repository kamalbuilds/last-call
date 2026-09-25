# LAST CALL

Pre-IPO tokens on Solana have an expiry date that most holders never hear about. LAST CALL shows every PreStocks token's conversion deadline on a departures board and lets a holder convert in one transaction, including holders whose wallet has no SOL for fees.

Live: https://lastcall-sol.vercel.app ([ledger](https://lastcall-sol.vercel.app/ledger), [a real stranded wallet](https://lastcall-sol.vercel.app/?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb))

## What changes at epoch 1043

We read every PreStocks mint's Token-2022 `transferFeeConfig` straight off mainnet, `getAccountInfo` and `getParsedAccountInfo` on each mint through `packages/core`'s `decodeMint`, and checked it against `getEpochInfo`. Seven of the eight PreStocks tokens (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET) carry a second fee tier already written into the mint: it raises the transfer fee from 100bps (1%) to 300bps (3%) once the chain reaches epoch 1043. SPACEX has no pending tier; its fee holds at 100bps.

Read on 2026-09-25 at 01:47:47 UTC, mainnet sat in epoch 1042, about 40.8 hours before the new tier takes effect. None of these tokens announce the change anywhere public. It lives only in each mint's account data as an activation epoch the Token-2022 program will honor automatically, which is also why `decodeMint` has to check the current epoch before reporting a rate: the newer tier is a schedule, not the fee charged today.

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

## Why not just swap in a wallet

Phantom and Jupiter Ultra both offer gasless swaps, so we asked Jupiter Ultra for real orders on 24 September 2026 before relying on the sponsor. For the two conversion routes it returned `Failed to get quotes`, for a wallet with 0 SOL and at every size we tried:

| Route | Jupiter Ultra (gasless) | Jupiter Swap API (what LAST CALL uses) |
|---|---|---|
| XAI to SPACEX | `Failed to get quotes` | routes, 1.30% impact at 10, 30 and 139 XAI |
| SPACEX to SPCXx | `Failed to get quotes` | routes |

Jupiter's documentation says Ultra's gasless mode supports Token-2022 in general; for these specific mints the live API does not. That leaves real holders without a gasless path today:

- of the 99 largest XAI wallets, 34 hold under 0.001 SOL and 33 of those hold no USDC either (341.81 XAI between them, `getTokenAccountsByOwner`);
- 10 of the 95 largest SPACEX wallets hold under 0.001 SOL (Jupiter holders API).

Most unconverted value sits in wallets that could pay a fee and simply have not converted, so the fee sponsor serves a minority of holders. The deadline board and wallet lookup are for everyone else.

## The SpaceX exit is narrow

SPACEX converts 1:1 into SPCXx only through trading, and the route is thin. Jupiter quotes for SPACEX to SPCXx on 24 September 2026:

| Size | Price impact |
|---|---|
| $1,000 | 0.00% |
| $10,000 | 9.36% |
| $50,000 | 15.49% |

`packages/slice` finds the largest slice under a chosen impact threshold from live quotes. We have not shown that slicing saves money: the same quote repeated ten minutes apart moved from 10.05 to 10.14 bps, so the pool did not visibly refill between slices. Without a refill, many small swaps cost about the same as one large one, and LAST CALL does not claim a saving.

## What it does

- `/ledger` is a departures board: one row per PreStocks token with its conversion target, deadline, status and unconverted amount. Below it, the largest unconverted XAI wallets, with 0-SOL wallets flagged.
- The home page takes any wallet address, or a connected wallet, and shows its PreStocks holdings with deadline countdowns and a live Jupiter quote including price impact and the in-force Token-2022 transfer fee. Each holding also shows a terms panel, read live off the mint (fee in force, permanent delegate, pause state, multiplier, freeze authority, the slot it was read at) before the holder ever sees a Convert button; Convert is disabled outright when the mint reports itself paused.
- `/inbox` is a corporate-action inbox across 109 stock tokens (PreStocks, xStock and Ondo), each mint's live Token-2022 extensions decoded into conversion deadlines, dividend or split multiplier changes, fee changes and pauses, sorted action-required first. `/api/inbox.ics` exports the dated ones as a calendar file with reminders 30, 7 and 1 day out.
- Convert builds a Jupiter swap from the expiring token into its conversion target, trying the issuer's own direct pool before a routed quote. When a sponsor wallet is configured, the sponsor is the fee payer and funds the new token account, so the holder needs no SOL. The holder still signs; the sponsor cannot move their tokens.
- `/actions.json` and `/api/actions/convert` expose the same conversion as a Solana Blink: a wallet extension, Dialect, or a client reading a link or a post can render "Convert all" and "Convert 1" and have the wallet sign, without opening the site.

## How the sponsor stays safe

`packages/sponsor` co-signs only when every check holds: the sponsor is the fee payer; every top-level instruction belongs to ComputeBudget, Jupiter v6, the associated token program or the token programs; there is exactly one Jupiter instruction; the System program does not appear. Its test builds a real conversion and three attacks against it (an extra SOL transfer out of the sponsor, a different fee payer, a transaction with the swap removed) and requires all three to be refused.

## The mainnet test buy

On 2026-09-24 at 19:35:39 UTC we bought PreStocks tokens on mainnet with real SOL, routed by Jupiter through a Meteora DLMM pool: [transaction `5fx8hN...gyA8`](https://solscan.io/tx/5fx8hNaFhLUFirjiPYPjA9JSLruHuPkhmKs71XxrVA1QZonrMdTqbWvrwpT2Bs6X8TkLv15L5SLBPMib2Qj9gyA8), finalized at slot 450125049, no error (`getTransaction`, `getSignatureStatus`).

The conversion itself did not land, and the reason is not a bug in the code. Buying created three new Token-2022 accounts and left the paying wallet with 1,884,142 lamports, above Solana's rent-exempt floor for a plain wallet (650,240 lamports for a 0-byte account, `getMinimumBalanceForRentExemption(0)`) but not by much. Converting needs a new destination token account, and the two accounts created in that same purchase cost 1,488,440 and 1,620,520 lamports in rent. Paying that plus a transaction fee out of the wallet's own balance would have pushed it under its own rent-exempt minimum, and the runtime refuses a transfer that would leave an account below that floor. That is the exact situation `packages/sponsor` exists for: the sponsor pays the new account's rent and the transaction fee, so the holder's own balance never has to cover it. The sponsored path is what the `convert-sim` and `sponsor-guard` checks on `/proof` simulate and pass.

## Evidence

Each package has a `check.mjs` that verifies the result independently of the code under test, against mainnet:

| Check | What it proves |
|---|---|
| `packages/convert/check.mjs` | Simulates a real conversion for wallet `CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb` (0 SOL): XAI 139.018 to 138.018, SPACEX received, fee paid by a separate account. Fails if the holder is the payer or the amount exceeds the balance. |
| `packages/ledger/check.mjs` | Recomputes unconverted XAI from the mint and holder data and requires the ledger to match within 2%. |
| `packages/holdings/check.mjs` | Requires the exact on-chain XAI balance for a known holder and a quote into SPACEX in a sane range. |
| `packages/sponsor/check.mjs` | Signs a real conversion, refuses three malicious variants. |
| `packages/slice/check.mjs` | Re-quotes a $10k-equivalent SPACEX conversion and the planned slice independently; the slice must sit under the threshold while the single swap sits above it. |
| `apps/web/check.mjs` | Builds and serves the app; the board, holdings API and convert API answer with live data. |

Not yet verified: a conversion sent and finalized on mainnet through this app (so far all conversions are simulations, see above), a saving from sliced conversions, and behaviour under Jupiter or RPC outages. The Pyth comparison in `packages/pyth` needs a `PYTH_API_KEY` and has not run against live Pyth prices. `/api/gap-history` is live (checked 2026-09-25, 200 OK, daily gap points since the SPACEX IPO). A real-conversions ledger at `/api/conversions` exists in this branch's code but is not yet on the deployed site: it returned a 404 when checked live on 2026-09-25, since the route has not been deployed yet.

## Compared with other Stocklana entries

Holdfill ([github.com/mystiquemide/holdfill](https://github.com/mystiquemide/holdfill)) runs holder-set standing orders, a minimum price, a deadline fallback and a hard stop, that an Anchor program executes automatically through Meteora once the market meets them; LAST CALL has no equivalent to that unattended order. LAST CALL converts against the real PreStocks mints on mainnet, where Holdfill runs on devnet against replica tokens, because devnet Meteora pools reject some Token-2022 extensions without an admin badge.

Cassxbt's `preflight` ([github.com/Cassxbt/preflight](https://github.com/Cassxbt/preflight)) sits between a Jupiter quote and the wallet signature and returns CLEAR, DISCLOSE or HOLD on any PreStocks trade; its own README documents that Jupiter kept routing trades into XAI through Meteora pools holding over $280,000 twelve days past XAI's stated deadline, a live gap LAST CALL's board does not itself check for. LAST CALL goes past a warning and builds, sponsors and can execute the conversion, something `preflight` does not do.

GODGRACE07's `multiplier` ([github.com/GODGRACE07/multiplier](https://github.com/GODGRACE07/multiplier)) is a read-only oracle for xStocks that shows a token's raw balance next to its Scaled-UI-Amount-corrected balance, a side-by-side view LAST CALL does not surface even though its core computes the same multiplier internally. LAST CALL, unlike `multiplier`, moves tokens: it builds and sponsors real conversions rather than only displaying corporate-action data.

## Run it

```
pnpm install
pnpm --filter @lastcall/web dev
```

Optional `.env` in `apps/web`: `SOLANA_RPC_URL`, `SPONSOR_SECRET_KEY` (base58) for fee-sponsored conversions, and `PYTH_API_KEY` for the Pyth price comparison. Use a dedicated low-balance wallet for the sponsor.

Design tokens and rules live in `DESIGN.md`.

## Architecture

The component map, data sources, the three core flows (detection, conversion, Blink) and the sponsor's trust boundary are in [`ARCHITECTURE.md`](ARCHITECTURE.md), with a diagram at [`docs/architecture/last-call-architecture.html`](docs/architecture/last-call-architecture.html) (interactive) and below (static).

![LAST CALL architecture](docs/architecture/last-call-architecture.png)

## Built on

Jupiter Swap API for routing, Token-2022 transfer-fee and scaled-UI-amount decoding carried over from an earlier project of ours, Next.js with Wallet Standard, and public Solana RPC.

PreStocks tokens are not available to US persons. LAST CALL is not affiliated with PreStocks and does not give financial advice.
