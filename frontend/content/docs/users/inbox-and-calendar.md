# Inbox and calendar

`/inbox` lists corporate actions on tokenized stocks, each read from the token's own on-chain config or from LAST CALL's deadline file. Without a wallet it shows every tracked token; with `?wallet=<address>` it shows only the tokens that wallet holds (`frontend/app/inbox/page.tsx`).

## Which tokens are tracked

`buildUniverse()` in `packages/events/src/index.ts` collects:

- every token the PreStocks API lists, plus XAI, which the API no longer lists;
- every xStock found by a Jupiter search that is a Token-2022 mint, verified, named "... xStock", and created by the xStocks issuer key;
- every Ondo token that is Token-2022 and verified. Ondo's own code comment notes this currently adds nothing, because Ondo's products are classic SPL tokens.

## The four event types

Sorted with action-required first, then alerts, then information.

| Type | Card label | When it appears | What to do |
|---|---|---|---|
| `conversion` | OPEN or EXPIRED | The token has a deadline and conversion target in `lifecycle.json` | Convert before the deadline. With a wallet, the card has a Convert button that opens the home page |
| `fee_change` | FEE CHANGE | The mint's two transfer fee tiers differ | Note the new fee and the epoch it starts. Every transfer, including a conversion, pays it |
| `paused` | PAUSED | The issuer has paused the mint | Nothing moves until it is unpaused |
| `dividend_or_split` | DIVIDEND, SPLIT or MULTIPLIER UPDATE, by the sign of the change | The mint's scaled-UI multiplier is changing or has changed | Your displayed balance changes by that percentage. No action needed |

Conversion events are ordered expired first (most recent first), then upcoming (soonest first). Multiplier changes are ordered by effective date.

With a wallet, conversion events also show how much you hold and its USD value, and the page adds a "true balance" panel: your raw amount, the multiplier in force, and the balance after dividends or splits (`frontend/app/api/true-balance/data.ts`).

## Calendar file

"Add to calendar" downloads `lastcall-inbox.ics` from `/api/inbox.ics?wallet=<address>`. Without `wallet` it covers every tracked token.

- Only dated events go in: conversion deadlines and multiplier changes. Fee changes and pauses have no calendar date, so they stay in the inbox only (`toIcs()` in `packages/events/src/index.ts`).
- Each event carries three reminders: 30 days, 7 days and 1 day before.
- Expired deadlines are still included, with "(expired)" in the title.

The file is a snapshot. It does not update itself; download it again to pick up new events.

The inbox is cached for five minutes per wallet (`frontend/components/inbox-data.ts`).
