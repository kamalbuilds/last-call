# HTTP API

Every route below is a Next.js route handler under `frontend/app`. All run on the Node.js runtime with `dynamic = "force-dynamic"`, so none is statically cached by Next. Some cache in process memory, noted per route. Base URL of the live deployment: `https://lastcall-sol.vercel.app`.

Address parameters are checked against `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` (base58, 32 to 44 characters). That is a shape check, not proof the account exists.

Errors are JSON `{ "error": string }` unless stated. The Actions routes use `{ "message": string }`, as the Actions spec expects, and `/api/inbox.ics` returns plain text.

## GET /actions.json

File: `frontend/app/actions.json/route.ts`. Also answers `OPTIONS` with 204.

```json
{"rules":[{"pathPattern":"/convert/**","apiPath":"/api/actions/convert/**"},{"pathPattern":"/api/actions/**","apiPath":"/api/actions/**"}]}
```

Headers: `Access-Control-Allow-Origin: *`, `X-Action-Version: 1`, `X-Blockchain-Ids: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. See [Blinks](blinks.md).

## GET /api/actions/convert

File: `frontend/app/api/actions/convert/route.ts`. Solana Action metadata for one token.

| Param | Values |
|---|---|
| `token` | `XAI` or `SPACEX` (required) |

200: `{ type: "action", icon, title, description, label: "Convert", links: { actions: [{ label: "Convert all", href }, { label: "Convert 1", href }] } }`. The description carries the deadline date from `lifecycle.json`.

400: unknown token, or no conversion route in `lifecycle.json`.

## POST /api/actions/convert

Same file. Builds the conversion transaction for a Blink client.

| Param | Where | Values |
|---|---|---|
| `token` | query | `XAI` or `SPACEX` |
| `amount` | query | `all` (default) or `1` |
| `account` | JSON body | the holder's address |

`amount=all` reads the wallet's full balance of the mint across both the Token-2022 and classic token programs. `amount=1` is one whole token (10^decimals raw units, decimals read from the mint).

200: `{ type: "transaction", transaction: <base64 v0 transaction>, message: "Convert ... into ..." }`. If a sponsor is configured, the transaction arrives already signed by the sponsor.

| Status | When |
|---|---|
| 400 | unknown token or amount, body not JSON, invalid `account`, no conversion route, `no balance left to convert` |
| 502 | RPC read failed, or the build failed (Jupiter, lookup tables, sponsor refusal) |

The `OPTIONS` handler answers 204 with the Actions CORS headers.

## POST /api/convert

File: `frontend/app/api/convert/route.ts`. The endpoint the site's Convert button calls.

Body:

```json
{ "owner": "<address>", "fromMint": "<address>", "amountRaw": "<integer string or number>" }
```

`amountRaw` is in raw base units and must be positive. The destination mint is looked up from the ledger's lifecycle (`conversion.intoMint`); you cannot choose it.

200:

```json
{ "txBase64": "<base64 v0 transaction>", "feePayer": "<address>", "sponsored": true }
```

`sponsored: false` means no sponsor key is set and `feePayer` is the owner. Live read on 2026-09-25 06:24 UTC returned `sponsored: false`.

| Status | When |
|---|---|
| 400 | body not JSON; invalid `owner`, `fromMint` or `amountRaw`; `amountRaw` not positive; no conversion destination for `fromMint` |
| 500 | `ledger unreadable: ...`, or `sponsor misconfigured` (the key could not be decoded) |
| 502 | any other build error |

Building calls the ledger, which is cached for five minutes (`frontend/lib/ledger.ts`).

## GET /api/holdings

File: `frontend/app/api/holdings/route.ts`, calls `getHoldings()` from `packages/holdings`.

| Param | Values |
|---|---|
| `owner` | wallet address (required) |

200: an array of `HoldingRow`, one per PreStocks mint held with a non-zero balance, sorted by symbol:

```ts
{ symbol: string; mint: string; amount: number;            // UI amount, multiplier applied
  status: "private" | "converting" | "expired";
  deadline: string | null; convertsInto: string | null;     // destination mint
  usd: number | null;
  quote: { outAmountRaw: string; outAmountUi: number; priceImpactPct: number; transferFeeBps: number } | null }
```

`quote` is null when the token has no conversion or Jupiter returns no route for that size. An executable (program) owner returns `[]`.

400: invalid `owner`. 502: upstream failure.

## GET /api/terms

File: `frontend/app/api/terms/route.ts`, calls `readTerms()` in `frontend/lib/terms.ts`.

| Param | Values |
|---|---|
| `mint` | a Token-2022 mint that has a transfer fee config (required) |

200:

```ts
{ mint: string; transferFeeBps: number; feeInForce: boolean; permanentDelegate: string | null;
  paused: boolean; multiplier: number; freezeAuthority: string | null; readAtSlot: number }
```

`transferFeeBps` is the in-force rate. `feeInForce` is `currentEpoch >= newer tier epoch`, so it is `false` while a newer tier is still pending even though `transferFeeBps` is already the rate charged; see [Token terms panel](../users/token-terms-panel.md). Mints without a `transferFeeConfig` extension fail in `decodeMint` and return 502.

400: invalid `mint`. 502: decode or RPC failure.

## GET /api/ledger

File: `frontend/app/api/ledger/route.ts`. Returns the full board built by `buildLedger()` in `packages/ledger`, cached five minutes.

```ts
{ generatedAt: string;
  tokens: Array<{ symbol; mint; status: "private" | "converting" | "expired"; deadline: string | null;
    conversion: object | null; priceUsd: number | null; supply: number; poolHeld: number;
    unconvertedInWallets: number; unconvertedUsd: number | null; holderCount: number;
    holders: Array<{ address; amount; usd: number | null; solBalance: number; lastActive: string | null }> }> }
```

500: `{ error }` when any upstream fails. Method: [Ledger methodology](../methodology/ledger.md).

## GET /api/inbox.ics

File: `frontend/app/api/inbox.ics/route.ts`.

| Param | Values |
|---|---|
| `wallet` | optional wallet address. Omitted: every tracked mint |

200: `text/calendar; charset=utf-8` with `Content-Disposition: attachment; filename="lastcall-inbox.ics"`. One VEVENT per conversion deadline or multiplier change, each with VALARMs at `-P30D`, `-P7D`, `-P1D`.

400 (plain text): `Not a Solana wallet address.` 500 (plain text): `Could not build the calendar right now: ...`.

## GET /api/true-balance

File: `frontend/app/api/true-balance/route.ts`, data in `frontend/app/api/true-balance/data.ts`.

| Param | Values |
|---|---|
| `owner` | wallet address (required) |

200: `{ holdings: Array<{ symbol; mint; raw: number; multiplier: number; trueBalance: number; gainFromDividendsPct: number; lastChange: string | null }> }`. Covers xStock and PreStocks mints only (Ondo excluded). `trueBalance = raw * multiplier`; `gainFromDividendsPct = (multiplier - 1) * 100`.

400: invalid `owner`. 502: upstream failure.

## GET /api/conversions

File: `frontend/app/api/conversions/route.ts`, data in `frontend/app/api/conversions/data.ts`. Recent XAI to SPACEX trades in Meteora DLMM pool `8rFjXknJvC225QZqKZtohSnwpL3ZeocNiVDs8tpfUiR8`, read from GeckoTerminal. Cached ten minutes.

| Param | Values |
|---|---|
| `token` | must be `XAI` |

200:

```ts
{ trades: Array<{ signature; wallet; time; xaiIn: number; spacexOut: number;
    realizedRatio: number; shortfallPct: number }>;   // up to 10, newest first
  medianShortfallPct: number | null; source: string }
```

`shortfallPct = (1 - realizedRatio / 0.7165) * 100`. Before computing it, the handler checks GeckoTerminal's units against a live Jupiter quote and fails rather than guess if they disagree by more than 20%.

400: any other token. 502: upstream failure or unit mismatch.

## GET /api/gap-history

File: `frontend/app/api/gap-history/route.ts`, data in `frontend/app/api/gap-history/data.ts`. Daily gap between SPACEX and SPCXx since 2026-06-12. Cached ten minutes.

200: `{ points: Array<{ date: string; gapPct: number }>; currentGapPct: number; source: string }` where `gapPct = (1 - SPACEX close / SPCXx close) * 100`. Daily closes come from GeckoTerminal OHLCV on each token's main pool; `currentGapPct` comes from Jupiter Price v3. The SPACEX series is rescaled by 1x or the SPACEX multiplier, whichever matches Jupiter's live price within 35%, and the handler fails if neither does.

502: upstream failure or scale mismatch.

## Upstream retries

Most upstream reads retry on HTTP 429 and 5xx with exponential backoff, honoring `Retry-After`. A slow upstream can therefore make a request take tens of seconds before it returns an error.
