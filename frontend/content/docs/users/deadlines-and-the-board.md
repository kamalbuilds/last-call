# Deadlines and the board

## What a conversion deadline is

A PreStocks token tracks a private company. When that company goes public or is merged, the token becomes convertible into something else, and PreStocks gives holders a window to do it. LAST CALL keeps each window in one file, `packages/ledger/src/lifecycle.json`. Today it has two:

| Token | Converts into | Deadline (UTC) | Rate, as written in `lifecycle.json` |
|---|---|---|---|
| XAI | SPACEX | 2026-09-12 23:59 | 0.7165 SPACEX per XAI after SpaceX's 5-for-1 split (0.1433 before it) |
| SPACEX | SPCXx, the tokenized public stock | 2027-03-12 23:59 | 1:1 |

The other seven PreStocks tokens (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET) have no deadline in that file. Their note reads "No IPO announced".

Both deadlines cite the same source, PreStocks on X: https://x.com/PreStocks/status/2063623768535363940.

## Why the deadline matters

PreStocks says unconverted tokens "expire worthless and will no longer be supported" (the post above). LAST CALL reads the power the issuer holds over your tokens straight from the mint, so the stakes are on the page before you decide:

- **Permanent delegate.** All nine PreStocks mints carried one when read on 2026-09-25 (`getMultipleAccounts`, slot 450272212). It lets the issuer move or burn tokens in any wallet without a signature, which is how expired tokens are removed after a deadline. Converting inside the window moves your value out of that reach. The terms panel shows the delegate and says so in plain words (`frontend/components/terms-panel.tsx`).
- **Pause.** The issuer can halt all transfers, and the Convert button reads the pause state live.

An expired token keeps trading in a pool until the issuer acts, and LAST CALL keeps the conversion route open for it. The home page shows on an expired holding: "The gate is closed. These tokens can still be redeemed through LAST CALL before the issuer removes them." `/api/conversions` shows the XAI to SPACEX pool still filling real trades at the 0.7165 rate on 2026-10-01.

## Reading the board at /ledger

The page is `frontend/app/ledger/page.tsx`. From top to bottom:

1. **XAI header.** The dollar value of XAI still in wallets, how many wallets hold it, how many of the listed XAI wallets hold under 0.001 SOL ("need a fee sponsor"), and days since the gate closed.
2. **Conversion signal.** The daily price gap between SPACEX and SPCXx since the SPACEX IPO (from `/api/gap-history`), next to a countdown for the next deadline.
3. **Timelines.** XAI to SPACEX and SPACEX to public stock.
4. **Board.** One row per token that has a deadline, sorted soonest first, with columns Token, Converts into, Deadline (with a live countdown), Status, Unconverted, Holders. Tokens with no deadline are listed below as "Awaiting IPO" chips with their holder count.
5. **Recent XAI conversions.** The latest XAI to SPACEX trades in the conversion pool and how far each fell short of the published 0.7165 rate (from `/api/conversions`).
6. **Unconverted XAI wallets.** The 20 largest XAI wallets. A "no SOL for fees" tag marks wallets with under 0.001 SOL. "Look up" opens that wallet on the home page.
7. **Footer.** The time the board was read, in UTC.

### Board chips

Set by `flightStatus()` in `frontend/app/ledger/page.tsx`:

| Chip | Meaning |
|---|---|
| BOARDING | Deadline more than 30 days away, or no deadline |
| FINAL CALL | Deadline within 30 days |
| GATE CLOSED | Deadline has passed |

The wallet page uses the same three, plus AWAITING IPO for tokens with no conversion (`frontend/components/wallet-lookup.tsx`).

### What "Unconverted" means

Unconverted is the token's on-chain supply minus the amount held by pool accounts in Jupiter's holder list. For tokens with no deadline it is simply supply outside pools, since there is nothing to convert yet. How it is computed and what each row proves: [Ledger methodology](../methodology/ledger.md).

The board refreshes every five minutes (`frontend/lib/ledger.ts`) and the footer shows the time it was read.
