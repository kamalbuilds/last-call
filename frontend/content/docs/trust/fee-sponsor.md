# Fee sponsor

The sponsor is a server-held Solana keypair, loaded from the `SPONSOR_SECRET_KEY` environment variable (base58) by `loadSponsor()` in `frontend/app/api/actions/convert/convert.ts`. When set, it pays the network fee and new token account rent for conversions, so the holder needs no SOL. It only ever signs through `cosign()` in `packages/sponsor/src/index.ts`.

## How a sponsored conversion is built

`buildSponsoredConversion()` in `packages/convert/src/sponsored.ts`:

1. Refuses if the owner and fee payer are the same key, or the amount is not positive.
2. Gets a Jupiter quote with `onlyDirectRoutes: true` and 300 bps slippage; if that fails, a routed quote.
3. Asks Jupiter's `swap-instructions` endpoint for instructions with `payer` set to the sponsor. If Jupiter rejects that, it asks again without `payer`.
4. Rewrites the funder (first account) of every Associated Token Program instruction from the owner to the sponsor, so the sponsor pays any new account's rent even if Jupiter billed the owner.
5. Compiles an unsigned v0 transaction with the sponsor as `payerKey`, using Jupiter's address lookup tables.

## What cosign checks

In this order; any failure throws and nothing is signed:

1. **Fee payer.** The first static account key must be the sponsor, and after resolving lookup tables the decompiled `payerKey` must also be the sponsor.
2. **Program allowlist.** Every top-level instruction must call one of:
   - `ComputeBudget111111111111111111111111111111` (Compute Budget)
   - `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` (Jupiter v6)
   - `ATokenGPvbdGVxr1b2hvZbsiqW5xWJ25efTNsLJA8knL` (Associated Token)
   - `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (Token)
   - `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022)

   The System program is not on the list, so a direct SOL transfer out of the sponsor is refused.
3. **One swap.** Exactly one Jupiter instruction, no more and no less.
4. **Signer placement.** The sponsor may appear as a signer only as the fee payer, or as the funder (first account) of an Associated Token Program `create` (data byte 0) or `createIdempotent` (data byte 1). Anywhere else, refused.

Only then does it add its signature. Lookup tables are resolved through `SOLANA_RPC_URL`, or `https://solana-rpc.publicnode.com` when unset.

`packages/sponsor/check.mjs` builds a real XAI to SPACEX conversion for a known 0-SOL wallet with a throwaway sponsor key, requires `cosign` to sign it, and requires three attacks to be refused: an extra SOL transfer out of the sponsor, a different fee payer, and the swap removed. Run on 2026-10-01 against mainnet, it printed `ok: valid conversion co-signed; 3 malicious variants rejected`.

## What the sponsor's signature authorizes

**Pays:** the transaction fee and the rent for new associated token accounts in that transaction.

**Never:** moves the holder's tokens. The swap needs the holder's signature as token owner, which only the holder's wallet can give. The sponsor's signature authorizes paying, nothing else.

## What the checks cover

- Every check runs on the top-level instructions, which is where the sponsor's signature authority lives. A Token or Token-2022 instruction is admitted only when the sponsor is not a signer on it, so the sponsor key never authorizes a token movement.
- The sponsor signs one specific recent blockhash. An unsent sponsored transaction expires with its blockhash.
- Run the sponsor from a dedicated wallet, as `README.md` advises. The sponsor key is read from the server environment and used only inside `cosign()`.

## Without a sponsor key

`buildConversionTransaction()` builds the same conversion as a plain Jupiter swap from `@fineprint/exec` (`getQuote` and `getSwapTransaction`, 300 bps slippage, routed) with the owner as fee payer, and returns `sponsored: false` with the owner as `feePayer`. A sponsor key that is set but cannot be decoded fails both convert routes with `sponsor misconfigured` instead of silently switching modes.
