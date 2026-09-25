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

`packages/sponsor/check.mjs` builds a real XAI to SPACEX conversion for a known 0-SOL wallet with a throwaway sponsor key, requires `cosign` to sign it, and requires three attacks to be refused: an extra SOL transfer out of the sponsor, a different fee payer, and the swap removed. Run on 2026-09-25 against mainnet, it printed `ok: valid conversion co-signed; 3 malicious variants rejected`.

## What the sponsor can and cannot do

**Can:** pay the transaction fee; pay rent for new associated token accounts in that transaction.

**Cannot:** move the holder's tokens. The swap needs the holder's signature as token owner, which only the holder's wallet can give. The sponsor's signature authorizes paying, nothing else.

## Limits of the checks

- Checks cover top-level instructions only. What Jupiter's program does internally is trusted, not inspected.
- The allowlist admits any Token or Token-2022 instruction, as long as the sponsor is not a signer on it.
- There is no rate limit or per-wallet cap in `frontend/app/api/convert/route.ts` or `frontend/app/api/actions/convert/route.ts`. Anyone can ask for sponsored transactions for any wallet and any positive amount, and each one that is signed and landed costs the sponsor a fee and possibly rent. The owner of a newly created token account can later close it and reclaim that rent. Run the sponsor from a dedicated low-balance wallet, as `README.md` advises.
- The sponsor signs a specific recent blockhash. An unused sponsored transaction simply expires.

## When no sponsor is configured

`buildConversionTransaction()` falls back to a plain Jupiter swap from `@fineprint/exec` (`getQuote` and `getSwapTransaction`, 300 bps slippage, routed, not direct-only) with the owner as fee payer, and returns `sponsored: false`. A holder with no SOL cannot pay for it.

If `SPONSOR_SECRET_KEY` is set but cannot be decoded, both convert routes fail with `sponsor misconfigured` instead of silently falling back.

State of the live site: on 2026-09-25 at 06:24 UTC, `POST https://lastcall-sol.vercel.app/api/convert` returned `sponsored: false`, so the live deployment was not sponsoring at that time.
