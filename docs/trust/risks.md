# Risks

**The issuer can take your tokens.** All nine PreStocks mints had a permanent delegate when read on 2026-09-25 (slot 450272212). It can move or burn tokens in any wallet without your signature. After a deadline, this is how expired tokens can be removed. LAST CALL cannot stop or reverse it.

**The issuer can freeze all transfers or single accounts.** All nine PreStocks mints carry a pause authority and a freeze authority (same read). While paused, no transfer or conversion can happen; the Convert button is disabled when the terms panel reads the mint as paused. A pause can start between the moment you load the page and the moment you sign.

**The fee can change.** The transfer fee authority can schedule a new rate, which starts at a set epoch. The quote shows the rate in force when it was read. See [Reading Token-2022](../methodology/token-2022-reading.md).

**Conversion is a swap, not a redemption.** You receive what the pool pays, not a guaranteed rate. Thin pools mean price impact grows with size. `README.md` records Jupiter quotes for SPACEX to SPCXx on 2026-09-24 of 0.00% impact at $1,000, 9.36% at $10,000 and 15.49% at $50,000 (not re-read for this page). Recent XAI trades in the conversion pool are compared with the published rate at `/api/conversions`. Slippage is capped at 3%; beyond that the transaction fails rather than fill worse.

**Data can be late or missing.** The PreStocks API rate-limits hard. The code retries with backoff (up to 7 attempts in `packages/core/src/prestocks.ts`, 6 retries in `packages/ledger`), and the board fails rather than show a partial list. Jupiter and RPC outages have the same effect. Board and inbox data can be up to five minutes old from caching. Behaviour under a sustained outage has not been tested (`README.md`).

**Deadlines are entered by hand.** They live in `packages/ledger/src/lifecycle.json`, copied from a PreStocks post. If PreStocks changes a date, LAST CALL is wrong until that file changes.

**The site does not confirm finality.** After you sign, the page shows the signature your wallet returned. Check the transaction on Solscan.

**Sponsorship may be off.** See [Fee sponsor](fee-sponsor.md) for how to tell and what it means.

LAST CALL is not affiliated with PreStocks. PreStocks tokens are not available to US persons. Nothing here is financial or legal advice.
