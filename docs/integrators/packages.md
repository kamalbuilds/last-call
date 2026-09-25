# Packages

The app in `frontend/` depends on seven workspace packages (`frontend/package.json`). Each exports its TypeScript source directly (`"main": "./src/index.ts"`); there is no build step and nothing is published to npm. The lists below are the public exports as of this commit.

## Wired into the app

### @fineprint/core (`packages/core`)

Token-2022 reading shared by the rest. Exported from `packages/core/src/index.ts`:

| Export | File | What it does |
|---|---|---|
| `TOKEN_2022_PROGRAM_ID`, `DEFAULT_RPC_URL`, `PRESTOCKS_API_URL`, `rpcUrl()`, `connection()` | `constants.ts` | Constants; `rpcUrl()` reads `RPC_URL` (not `SOLANA_RPC_URL`) |
| `fetchPreStocksTokens(options?)`, `clearPreStocksCache()`, `PreStocksToken`, `FetchOptions` | `prestocks.ts` | Live PreStocks token list with a 60 s cache, shared in-flight request, and up to 7 retries on 429/5xx |
| `operativeMultiplier(multiplier, newMultiplier, ts, asOf)`, `isPending(ts, asOf)` | `multiplier.ts` | Scaled-UI multiplier in force at a time |
| `inForceTier`, `pendingTier`, `slotsUntilEpoch`, `buildTransferFee`, `SLOT_SECONDS`, `EpochPosition` | `fee.ts` | Transfer fee tier selection by epoch |
| `parseTlvEntries`, `readTransferFeeConfigExact`, `U64_MAX` | `tlv.ts` | Raw TLV read of the transfer fee config |
| `decodeMint(mint, symbol, conn?, asOfUnix?, epochAt?)`, `decodeAllMints()`, `readEpochPosition()` | `decode.ts` | Full `MintFacts` for one mint or every PreStocks mint |
| `naiveVsCorrect(facts)` | `naive.ts` | Supply with and without the multiplier |
| types `MintFacts`, `TransferFeeTier`, `ScaledUiAmount`, `IssuerPowers`, and others | `types.ts` | Shared shapes |

`types.ts` also exports `CostVerdict`, `TradFiQuote`, `OnChainQuote` and `Venue`, used only by the unwired `packages/cost`.

### @fineprint/exec (`packages/exec`)

Jupiter swap building and execution. The app imports `getQuote` and `getSwapTransaction` (`frontend/app/api/actions/convert/convert.ts`) and `packages/convert` imports `getQuote` and `JupiterApiError`. Modules re-exported from `packages/exec/src/index.ts`: `connection`, `fee` (`transferFeeOf`, `netAfterTransferFee`, `grossForNet`, `inForceTier`, `roundTripBps`), `mint` (`readExecMintFacts`, `execFactsFromMintFacts`), `jupiter` (`getQuote`, `getSwapTransaction`, `routeLabel`, `QUOTE_URL`, `SWAP_URL`), `build` (`buildUnsignedSwap`, `destinationAtaFor`, `readAtaState`), `execute` (`executeSwap`, `confirmFinalized`, `evaluatePostCondition`), `web` (`buildSwap`, `confirmSwap`, `readFinalizedSwapEvidence`), and `errors` (`ExecError` and subclasses such as `MintPausedError`, `JupiterApiError`, `PostConditionError`). `executeSwap` and the post-condition check are not called by any route; the browser sends the transaction through the wallet instead.

### @lastcall/convert (`packages/convert`)

`buildSponsoredConversion({ connection, owner, feePayer, fromMint, toMint, amountRaw })` returns an unsigned `VersionedTransaction` with `feePayer` as payer. Also exports `SWAP_INSTRUCTIONS_URL` and the `SponsoredConversionParams` type. Refuses `owner === feePayer` and non-positive amounts. See [Fee sponsor](../trust/fee-sponsor.md).

### @lastcall/sponsor (`packages/sponsor`)

`cosign(txBase64, sponsorKeypair)` returns the transaction with the sponsor's signature added, or throws. Its only export. Checks: [Fee sponsor](../trust/fee-sponsor.md).

### @lastcall/ledger (`packages/ledger`)

`LIFECYCLE` (the parsed `lifecycle.json`), `buildLedger()`, and types `LifecycleEntry`, `LedgerFile`, `LedgerToken`, `LedgerHolder`. Method: [Ledger methodology](../methodology/ledger.md).

### @lastcall/holdings (`packages/holdings`)

`getHoldings(owner)` and types `HoldingRow`, `HoldingQuote`. Shape: [HTTP API](http-api.md#get-apiholdings).

### @lastcall/events (`packages/events`)

`buildUniverse()`, `eventsForMints(mints)`, `eventsForWallet(owner)`, `batchDecodeMints(conn, mints, epoch)`, `toIcs(events)`, and types `LastCallEvent`, `ConversionEvent`, `DividendOrSplitEvent`, `FeeChangeEvent`, `PausedEvent`, `EventUrgency`, `UniverseMint`.

## Not wired into the app

These live in `packages/` but no file in `frontend/` imports them:

| Package | Status |
|---|---|
| `packages/slice` (`@lastcall/slice`) | Plans conversion slices under a price impact ceiling. Run only from its own CLI and `check.mjs` |
| `packages/pyth` (`@lastcall/pyth`) | Compares selling vs converting SPACEX against a Pyth feed. Needs `PYTH_API_KEY` |
| `packages/cost` (`@fineprint/cost`) | Leftover from an earlier project |
| `packages/atlas`, `packages/guard-client` | Leftover directories with only `test/` and `node_modules/`, no source |
