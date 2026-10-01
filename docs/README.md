# LAST CALL documentation

LAST CALL shows every PreStocks pre-IPO token's conversion deadline on a departures board, reads each token's Token-2022 terms straight off Solana mainnet, and builds the conversion as one Jupiter transaction. With a fee sponsor key set on the server, the sponsor pays the network fee and the new token account's rent, so a wallet with 0 SOL can convert.

The app lives in `frontend/` (Next.js, package `@lastcall/web`, see `frontend/package.json`).

## Who these pages are for

**Holders.** You own a PreStocks token and want to know when it expires and how to convert it.

- [Deadlines and the board](users/deadlines-and-the-board.md): what a conversion deadline is, why converting before it matters, how to read `/ledger`.
- [Convert your tokens](users/convert-your-tokens.md): the steps, what you sign, what the sponsor pays, what a 0-SOL wallet does.
- [Inbox and calendar](users/inbox-and-calendar.md): the four event types on `/inbox` and the `.ics` reminders.
- [Token terms panel](users/token-terms-panel.md): every field on the terms panel and what it means for you.

**Integrators.** You want to call the API, embed the Blink, or import a package.

- [HTTP API](integrators/http-api.md): every route under `frontend/app/api` plus `/actions.json`.
- [Blinks](integrators/blinks.md): the Solana Actions contract for the convert action.
- [Packages](integrators/packages.md): public exports of every package.

**Auditors.** You want to know where a number came from and what the sponsor key can do.

- [Ledger methodology](methodology/ledger.md): how `/ledger` numbers are computed and what each row proves.
- [Reading Token-2022](methodology/token-2022-reading.md): fee tier selection by epoch, the multiplier trap, extension decoding.
- [Trust model](trust/trust-model.md): what each component guarantees, including the issuer controls the terms panel surfaces.
- [Fee sponsor](trust/fee-sponsor.md): the co-sign checks and what the sponsor can sign.
- [Addresses](reference/addresses.md): mints, programs and pools, each with its source.

Architecture diagram: [`docs/architecture/last-call-architecture.html`](architecture/last-call-architecture.html).
