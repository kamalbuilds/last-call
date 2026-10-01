# Packages

The app in `frontend/` depends on eight workspace packages (`frontend/package.json`). Each exports its TypeScript source directly (`"main": "./src/index.ts"`), so a workspace consumer imports it with no build step.

## Used by the app

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

`types.ts` also exports `CostVerdict`, `TradFiQuote`, `OnChainQuote` and `Venue`, used by `packages/cost`.

### @fineprint/exec (`packages/exec`)

Jupiter swap building and execution. The app imports `getQuote` and `getSwapTransaction` (`frontend/app/api/actions/convert/convert.ts`) and `packages/convert` imports `getQuote` and `JupiterApiError`. Modules re-exported from `packages/exec/src/index.ts`: `connection`, `fee` (`transferFeeOf`, `netAfterTransferFee`, `grossForNet`, `inForceTier`, `roundTripBps`), `mint` (`readExecMintFacts`, `execFactsFromMintFacts`), `jupiter` (`getQuote`, `getSwapTransaction`, `routeLabel`, `QUOTE_URL`, `SWAP_URL`), `build` (`buildUnsignedSwap`, `destinationAtaFor`, `readAtaState`), `execute` (`executeSwap`, `confirmFinalized`, `evaluatePostCondition`), `web` (`buildSwap`, `confirmSwap`, `readFinalizedSwapEvidence`), and `errors` (`ExecError` and subclasses such as `MintPausedError`, `JupiterApiError`, `PostConditionError`). `executeSwap` and its post-condition check serve the CLI and every `check.mjs`; in the browser the holder's wallet sends the transaction.

### @lastcall/convert (`packages/convert`)

`buildSponsoredConversion({ connection, owner, feePayer, fromMint, toMint, amountRaw })` returns an unsigned `VersionedTransaction` with `feePayer` as payer. Also exports `SWAP_INSTRUCTIONS_URL` and the `SponsoredConversionParams` type. Refuses `owner === feePayer` and non-positive amounts. See [Fee sponsor](../trust/fee-sponsor.md).

### @lastcall/sponsor (`packages/sponsor`)

`cosign(txBase64, sponsorKeypair)` returns the transaction with the sponsor's signature added, or throws. It also refuses a priority fee above `SPONSOR_MAX_PRIORITY_LAMPORTS` (default 200,000 lamports). Checks: [Fee sponsor](../trust/fee-sponsor.md).

The package exports a second path, `@lastcall/sponsor/eligibility`: `checkSponsorEligibility(connection, { owner, fromMint, toMint, amountRaw }, allowedPairs)` resolves to `{ ok: true }` or `{ ok: false, reason }`. It is true only for a lifecycle conversion pair, an owner whose lamports are below the rent-exempt minimum for a token account plus 10,000, and an `amountRaw` equal to the owner's full balance of the source mint across Token and Token-2022. Exports the types `SponsorEligibilityRequest`, `AllowedPair` and `SponsorEligibility`.

### @lastcall/ledger (`packages/ledger`)

`LIFECYCLE` (the parsed `lifecycle.json`), `buildLedger()`, and types `LifecycleEntry`, `LedgerFile`, `LedgerToken`, `LedgerHolder`. Method: [Ledger methodology](../methodology/ledger.md).

### @lastcall/holdings (`packages/holdings`)

`getHoldings(owner)` and types `HoldingRow`, `HoldingQuote`. Shape: [HTTP API](http-api.md#get-apiholdings).

### @lastcall/events (`packages/events`)

`buildUniverse()`, `eventsForMints(mints)`, `eventsForWallet(owner)`, `batchDecodeMints(conn, mints, epoch)`, `toIcs(events)`, and types `LastCallEvent`, `ConversionEvent`, `DividendOrSplitEvent`, `FeeChangeEvent`, `PausedEvent`, `EventUrgency`, `UniverseMint`.

### @lastcall/pyth (`packages/pyth`)

Pyth Hermes pricing. Exports the feed ids and mints (`SPCX_EQUITY_FEED_ID`, `SPCXX_CRYPTO_FEED_ID`, `SPACEX_PRESTOCKS_MINT`, `SPCXX_MINT`), `fetchHermesPrices()` and `convertVsSell()`, which prices a SPACEX holding sold now against the same holding converted, with the converted SPCXx marked at a live Hermes feed instead of Jupiter's own quote. `MissingPythKeyError` is thrown instead of ever returning a made-up price. The `/inbox` Pyth panel uses it.

## Standalone packages

| Package | What it does |
|---|---|
| `packages/slice` (`@lastcall/slice`) | `planSlices()` finds the largest trade size under a price-impact ceiling in at most 8 live Jupiter quotes; `buildSlice()` builds one slice as a sponsored conversion. Runs from its own CLI and `check.mjs` |
| `packages/cost` (`@fineprint/cost`) | On-chain versus TradFi (Forge, EquityZen, Hiive) round-trip cost comparison, carried over from the earlier project this repo grew out of |
