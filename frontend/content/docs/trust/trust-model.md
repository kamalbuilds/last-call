# Trust model

What each part of LAST CALL guarantees, and where the guarantee is enforced.

## The chain is the source

Every figure that decides a fee, a multiplier or an issuer power is decoded from the mint account at request time, and the page carries the slot it was read at. `decodeMint` cross-checks the jsonParsed view against the raw account bytes and throws if they disagree, so a rate is never picked from one view alone. Method: [Reading Token-2022](../methodology/token-2022-reading.md).

## The terms panel shows the issuer's controls

All nine PreStocks mints carry the same issuer address (`WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc`, read at slot 450272212 on 2026-09-25) as permanent delegate and freeze authority, and each carries a pause authority. LAST CALL surfaces every one of them on the holding, before the Convert button:

- **Permanent delegate.** It can move or burn tokens in any wallet without a signature. After a deadline this is how expired tokens are removed, which is why converting inside the window matters. The panel says so in plain words.
- **Pause and freeze.** While a mint is paused no transfer can happen. The panel reads the pause state live and the Convert button turns into "Convert paused by issuer" the moment the mint reports it.
- **Fee schedule.** The transfer fee authority can schedule a new rate that starts at a set epoch. The panel shows the rate in force and the pending tier with its activation epoch, which is how the 1% to 3% change on seven mints was visible 40.8 hours before epoch 1043.

`/compliance` shows the same decode for every tracked mint, broadest controls first.

## The deadline file cites its source

Deadlines and conversion targets live in `packages/ledger/src/lifecycle.json`, each entry citing the PreStocks post it came from. The board, the Blink description, the inbox and the calendar all read that one file, so a date changes in one place.

## The conversion is priced before you sign

The quote on the holding shows what you receive, the price impact and the transfer fee. The transaction carries a 3% slippage bound: a fill worse than that fails instead of landing. The price is the pool's price, the same one `/api/conversions` compares against the published 0.7165 rate trade by trade.

## The holder's signature moves tokens

The sponsor's signature pays and nothing else. The swap needs the holder's signature as token owner, which only the holder's wallet gives. LAST CALL never sees a private key. What the sponsor co-signs is enforced in `packages/sponsor`: [Fee sponsor](fee-sponsor.md).

## Data freshness is on the page

The board and the inbox cache for five minutes and say when they were read. Upstream reads retry with exponential backoff and honor `Retry-After`. A conversion page shows the signature your wallet returned with a Solscan link, so the transaction is one click from its finalized state.
