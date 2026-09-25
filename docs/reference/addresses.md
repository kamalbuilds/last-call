# Addresses

All mainnet. "Live read" means read by the doc author on 2026-09-25 from `https://api.mainnet-beta.solana.com` or the live site.

## PreStocks mints

Source for all: `packages/ledger/src/lifecycle.json`, whose entries cite `https://prestocks.com/api/prestocks` (and a PreStocks post on X for XAI and SPACEX).

| Symbol | Mint | Deadline |
|---|---|---|
| XAI | `PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx` | 2026-09-12 23:59 UTC, converts into SPACEX |
| SPACEX | `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` | 2027-03-12 23:59 UTC, converts into SPCXx |
| ANDURIL | `PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB` | none |
| ANTHROPIC | `Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw` | none |
| FIGUREAI | `PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd` | none |
| KALSHI | `PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua` | none |
| NEURALINK | `PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S` | none |
| OPENAI | `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF` | none |
| POLYMARKET | `Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP` | none |

The app's live token list comes from the PreStocks API at run time, so a new listing appears without a change to this table.

## Conversion target

| Symbol | Mint | Source |
|---|---|---|
| SPCXx | `Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8` | `lifecycle.json` (SPACEX `conversion.intoMint`); also `frontend/app/api/gap-history/data.ts` |

## Issuer authority

| Role | Address | Source |
|---|---|---|
| Permanent delegate and freeze authority on all nine PreStocks mints | `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` | live read, `getMultipleAccounts` jsonParsed, slot 450272212 |
| Permanent delegate and every other authority on XAI | `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` | live read, XAI mint `getAccountInfo` jsonParsed, slot 450270997 |
| Permanent delegate on SPACEX | `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` | live `/api/terms`, slot 450270848 |
| xStocks issuer (`dev` in Jupiter metadata) | `S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS` | `packages/events/src/index.ts` |

## Pools

| Pool | Address | Source |
|---|---|---|
| XAI/SPACEX Meteora DLMM | `8rFjXknJvC225QZqKZtohSnwpL3ZeocNiVDs8tpfUiR8` | `frontend/app/api/conversions/data.ts` |

## Programs

| Program | Address | Source |
|---|---|---|
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | `packages/core/src/constants.ts`, `packages/sponsor/src/index.ts` |
| Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | `packages/sponsor/src/index.ts` |
| Associated Token | `ATokenGPvbdGVxr1b2hvZbsiqW5xWJ25efTNsLJA8knL` | `packages/sponsor/src/index.ts` |
| Compute Budget | `ComputeBudget111111111111111111111111111111` | `packages/sponsor/src/index.ts` |
| Jupiter v6 | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | `packages/sponsor/src/index.ts` |

## Chain

| Item | Value | Source |
|---|---|---|
| Solana mainnet CAIP-2 id (Actions) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `frontend/app/actions.json/route.ts` |
| Wallet signing chain | `solana:mainnet` | `frontend/lib/use-wallet.ts` |

## Example wallet

`CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb`, an XAI holder with 0 SOL used as the home page's "real stranded wallet" (`frontend/app/page.tsx`) and by `packages/convert/check.mjs`.
