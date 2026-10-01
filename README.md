# LAST CALL

Pre-IPO tokens on Solana expire, and almost no holder is told when. LAST CALL puts every PreStocks conversion deadline on a departures board, reads each token's Token-2022 terms live off mainnet, and turns the conversion into one transaction the holder signs.

Live: https://lastcall-sol.vercel.app ([ledger](https://lastcall-sol.vercel.app/ledger), [a real XAI wallet with 0 SOL](https://lastcall-sol.vercel.app/?wallet=CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb), [inbox](https://lastcall-sol.vercel.app/inbox), [proof](https://lastcall-sol.vercel.app/proof), [pitch deck](https://lastcall-sol.vercel.app/pitch), [docs](https://lastcall-sol.vercel.app/docs)).

Documentation for holders, integrators and auditors: [docs/README.md](docs/README.md).

## The problem

PreStocks tokens give economic exposure to private companies. When a company goes public, its token becomes convertible into the tokenized public stock inside a window, and after the window PreStocks says the tokens "expire worthless and will no longer be supported" ([PreStocks on X, 2026-06-07](https://x.com/PreStocks/status/2063623768535363940)). The deadline lives in a post. The mint carries a permanent delegate, so the issuer can remove expired tokens from any wallet, which is why converting before the deadline matters.

The first deadline was xAI's: 11:59pm UTC on 12 September 2026, converting at 0.1433 SPACEX per XAI (0.7165 after SpaceX's 5-for-1 split). Read from mainnet on 23 September 2026:

| Read | Value | Source |
|---|---|---|
| XAI supply still outstanding | 2,078.52 | mint account `PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx` |
| Held by the XAI/SPACEX pool | 599.78 | Jupiter holders API, pool-tagged account |
| Still in holders' wallets | 1,478.75 XAI, about $121k at the pool price | supply minus pool |
| Holders | 1,473 | Jupiter token API |
| Largest wallets with 0 SOL | 4 of the top 10, holding up to 139 XAI each | Jupiter holders API |

Re-read from the live ledger on 2026-10-01 (`/api/ledger`, `generatedAt` 2026-10-01T05:31:30Z): 1,463.14 XAI, $115.7k, across 1,462 holders. LAST CALL tracks the number as it moves.

The next deadline is SpaceX's own: 12 March 2027, for 9,936 holders (live ledger, 2026-10-01).

## What changes at epoch 1043

LAST CALL read every PreStocks mint's Token-2022 `transferFeeConfig` straight off mainnet, `getAccountInfo` and `getParsedAccountInfo` on each mint through `packages/core`'s `decodeMint`, and checked it against `getEpochInfo`. Seven of the nine PreStocks tokens (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET) carried a second fee tier already written into the mint: it raises the transfer fee from 100bps (1%) to 300bps (3%) once the chain reaches epoch 1043. XAI's second tier drops its fee to 0bps. SPACEX holds at 100bps.

Read on 2026-09-25 at 01:47:47 UTC, mainnet sat in epoch 1042, about 40.8 hours before the new tier took effect. No listing announces the change; it is an activation epoch in each mint's account data that the Token-2022 program honors automatically, which is why `decodeMint` checks the current epoch before reporting a rate: the newer tier is a schedule until the chain reaches it.

The schedule played out as read. On 2026-10-01 (epoch 1046, `getEpochInfo` slot 452193419) `/api/terms` reports 300bps in force on all seven mints, 0bps on XAI and 100bps on SPACEX.

## What it does

- `/ledger` is a departures board: one row per PreStocks token with its conversion target, deadline, status and unconverted amount. Below it, a holder-level ledger of the largest unconverted XAI wallets with 0-SOL wallets flagged, a daily SPACEX to SPCXx gap chart, and the latest real XAI to SPACEX conversions from the pool.
- The home page takes any wallet address, or a connected wallet, and shows its PreStocks holdings with deadline countdowns and a live Jupiter quote including price impact and the in-force Token-2022 transfer fee.
- Every holding carries a live terms panel read off the mint: fee in force plus any pending tier and its epoch, permanent delegate, freeze authority, pause state, scaled-UI multiplier and the slot it was read at. Convert is disabled outright when the mint reports itself paused.
- Convert builds one Jupiter swap from the expiring token into its conversion target, trying the issuer's own direct pool before a routed quote. With a sponsor key set, the sponsor is the fee payer and funds the new token account, so a holder with 0 SOL converts. The holder signs; the sponsor's signature only pays.
- `/actions.json` and `/api/actions/convert` expose the same conversion as a Solana Action (Blink): a wallet extension, Dialect, or a client reading a link or a post renders "Convert all" and "Convert 1" and has the wallet sign, without opening the site.
- `/inbox` is a corporate-action inbox across 109 stock tokens (PreStocks, xStock and Ondo), each mint's live Token-2022 extensions decoded into four event types (conversion deadlines, dividend or split multiplier changes, fee changes, pauses), sorted action-required first. `/api/inbox.ics` exports the dated ones as a calendar file with reminders 30, 7 and 1 day out. A true-balance panel shows a holder's raw amount, the multiplier in force and the balance after dividends or splits.
- `/compliance` decodes every tracked mint's issuer controls (freeze authority, permanent delegate, pause switch, transfer hook, default account state, mint authority) and sorts the most powerful first. `/inbox` sets Pyth Hermes prices for QQQx, TSLAx and VOOx beside Jupiter's on-chain price.

## Why a plain swap is not enough

Phantom and Jupiter Ultra both offer gasless swaps, so we asked Jupiter Ultra for real orders on 24 September 2026. For the two conversion routes it returned `Failed to get quotes`, for a wallet with 0 SOL and at every size we tried. The Jupiter Swap API, which LAST CALL builds on, routes both:

| Route | Jupiter Ultra (gasless) | Jupiter Swap API (what LAST CALL uses) |
|---|---|---|
| XAI to SPACEX | `Failed to get quotes` | routes, 1.30% impact at 10, 30 and 139 XAI |
| SPACEX to SPCXx | `Failed to get quotes` | routes |

Jupiter's documentation says Ultra's gasless mode supports Token-2022 in general; for these specific mints the live API returns no quote. The sponsor covers that gap:

- of the 99 largest XAI wallets, 34 hold under 0.001 SOL and 33 of those hold no USDC either (341.81 XAI between them, `getTokenAccountsByOwner`);
- 10 of the 95 largest SPACEX wallets hold under 0.001 SOL (Jupiter holders API).

The board and the wallet lookup serve every holder; the sponsor serves the wallets that hold no SOL.

## The SpaceX exit route

SPACEX converts 1:1 into SPCXx through trading, and LAST CALL prices the route before the holder signs. Jupiter quotes for SPACEX to SPCXx on 24 September 2026:

| Size | Price impact |
|---|---|
| $1,000 | 0.00% |
| $10,000 | 9.36% |
| $50,000 | 15.49% |

`packages/slice` finds the largest slice under a chosen impact threshold from live quotes, in at most 8 binary-search quotes. Its check re-quotes independently: a $10k-equivalent single swap prices at 10.55 bps against a 5 bps threshold, and the planned slice at 1.87 bps (`/proof`, 2026-09-24).

## How the sponsor stays safe

`packages/sponsor` co-signs only when every check holds: the sponsor is the fee payer; every top-level instruction belongs to ComputeBudget, Jupiter v6, the associated token program or the token programs; there is exactly one Jupiter instruction; the System program does not appear; the sponsor signs nowhere except as fee payer or as the rent funder of an associated-token-account create. Its test builds a real conversion and three attacks against it (an extra SOL transfer out of the sponsor, a different fee payer, a transaction with the swap removed) and requires all three to be refused. Re-run on 2026-10-01 against mainnet: `ok: valid conversion co-signed; 3 malicious variants rejected`.

## Evidence

Each package has a `check.mjs` that verifies the result independently of the code under test, against mainnet.

| Check | What it proves |
|---|---|
| `packages/convert/check.mjs` | Simulates a real conversion for wallet `CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb` (0 SOL): XAI 139.018 to 138.018, SPACEX received, fee paid by a separate account. Fails if the holder is the payer or the amount exceeds the balance. |
| `packages/ledger/check.mjs` | Recomputes unconverted XAI from the mint and holder data and requires the ledger to match within 2%. Re-run 2026-10-01: 1,473.08 against an independent 1,463.14. |
| `packages/holdings/check.mjs` | Requires the exact on-chain XAI balance for a known holder and a quote into SPACEX in a sane range. |
| `packages/sponsor/check.mjs` | Signs a real conversion, refuses three malicious variants. |
| `packages/slice/check.mjs` | Re-quotes a $10k-equivalent SPACEX conversion and the planned slice independently; the slice must sit under the threshold while the single swap sits above it. |
| `frontend/check-blink.mjs` | Serves the app, requires `actions.json` and CORS, and simulates the Blink's POST transaction on mainnet. |
| `frontend/check.mjs` | Builds and serves the app; the board, holdings API and convert API answer with live data. |

Live reads, all from mainnet or the production site:

- A real mainnet buy of PreStocks tokens, routed by Jupiter through a Meteora DLMM pool, finalized with no error: [transaction `5fx8hN...gyA8`](https://solscan.io/tx/5fx8hNaFhLUFirjiPYPjA9JSLruHuPkhmKs71XxrVA1QZonrMdTqbWvrwpT2Bs6X8TkLv15L5SLBPMib2Qj9gyA8), 2026-09-24 19:35:39 UTC, slot 450125049 (`getTransaction`, `getSignatureStatus`).
- `/api/conversions` lists real XAI to SPACEX conversions read from the Meteora pool, each with its signature, realized ratio and shortfall against the stated 0.7165 rate. On 2026-10-01 the latest, at 05:20:32 UTC, realized 0.71651 SPACEX per XAI.
- `/api/gap-history` serves daily SPACEX to SPCXx gap points since the SPACEX IPO (200 OK, 2026-10-01).
- `/proof` runs five of the checks (`convert-sim`, `sponsor-guard`, `ledger-recount`, `slice-plan`, `events`) as real subprocesses and shows each command, result and timestamp.

That buy also shows why the sponsor exists. It created three new Token-2022 accounts and left the paying wallet with 1,884,142 lamports, above Solana's rent-exempt floor for a plain wallet (650,240 lamports for a 0-byte account, `getMinimumBalanceForRentExemption(0)`). The next conversion needs a new destination token account, and the two accounts created in that same purchase cost 1,488,440 and 1,620,520 lamports in rent. The runtime refuses a transfer that would leave a wallet under its rent-exempt minimum, so the sponsor pays the new account's rent and the transaction fee and the holder's balance never has to cover it. The sponsored path is what the `convert-sim` and `sponsor-guard` checks on `/proof` simulate and pass.

## How it works

The component map, data sources, the three core flows (detection, conversion, Blink) and the sponsor's trust boundary are in [`ARCHITECTURE.md`](ARCHITECTURE.md), with a diagram at [`docs/architecture/last-call-architecture.html`](docs/architecture/last-call-architecture.html) (interactive) and below (static).

![LAST CALL architecture](docs/architecture/last-call-architecture.png)

## Run it

```
pnpm install
pnpm --filter @lastcall/web dev
```

Optional `.env` in `frontend/`: `SOLANA_RPC_URL`, `SPONSOR_SECRET_KEY` (base58) for fee-sponsored conversions, and `PYTH_API_KEY` for the Pyth price comparison. Fund the sponsor from a dedicated wallet. `pnpm proof` runs the proof checks and writes `frontend/public/proof.json`.

Design tokens and rules live in `DESIGN.md`.

## Built on and where it sits

Jupiter Swap API for routing, Token-2022 transfer-fee and scaled-UI-amount decoding carried over from an earlier project of ours, Next.js with Wallet Standard, Solana Actions, Pyth Hermes and public Solana RPC. Built for Stocklana.

Next to the other Stocklana entries, LAST CALL is the one that takes a holder from the deadline to a signed conversion on the real mainnet mints:

- Holdfill ([github.com/mystiquemide/holdfill](https://github.com/mystiquemide/holdfill)) runs holder-set standing orders through an Anchor program on devnet against replica tokens, because devnet Meteora pools reject some Token-2022 extensions without an admin badge. LAST CALL converts the real PreStocks mints on mainnet.
- Cassxbt's `preflight` ([github.com/Cassxbt/preflight](https://github.com/Cassxbt/preflight)) returns CLEAR, DISCLOSE or HOLD between a Jupiter quote and the wallet signature. LAST CALL goes from the warning to the transaction: it builds, sponsors and hands the holder the conversion to sign.
- GODGRACE07's `multiplier` ([github.com/GODGRACE07/multiplier](https://github.com/GODGRACE07/multiplier)) is a read-only oracle for xStocks. LAST CALL computes the same multiplier in its core and moves tokens with it: it builds the conversion and shows the true balance after dividends and splits.

LAST CALL is an independent tool for PreStocks holders.
