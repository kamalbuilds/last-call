# Convert your tokens

## Steps

1. Open the home page and paste your wallet address, or follow a link like `/?wallet=<address>`. The page lists your PreStocks holdings (`frontend/components/lookup-section.tsx`).
2. Each token that has a conversion shows a card with your balance, the deadline, what it converts into, a live Jupiter quote (what you receive, price impact, transfer fee) and the [token terms panel](token-terms-panel.md).
3. Connect a wallet. It must be the **same** wallet you looked up. If it is not, the button reads "Connect this wallet to convert" (`frontend/components/wallet-lookup.tsx`).
4. Press **Convert**. The page reads your full balance of that token from chain and asks the server to build the conversion for all of it. There is no partial amount on the site; the [Blink](../integrators/blinks.md) offers "Convert 1".
5. Your wallet shows the transaction. Approve it. Your wallet signs and sends it to Solana mainnet.
6. The card shows the transaction signature with a Solscan link. Check it there. The page shows the signature your wallet returned; it does not itself wait for finalization.

If the issuer has paused the token, the button reads "Convert paused by issuer" and does nothing.

## What the transaction does

The server builds one Jupiter swap from your token into its conversion target, for example XAI into SPACEX. With a sponsor, it asks Jupiter for the direct pool route first and only falls back to a routed quote if that fails (`packages/convert/src/sponsored.ts`). Slippage is capped at 3% (`slippageBps: 300`). Because it is a swap, you get the pool's price, not a fixed conversion rate. The quote on your card shows the expected amount and price impact before you sign.

## What you sign

You sign as the owner of the tokens being swapped. Your signature is the only thing that authorizes moving your tokens. You sign with your own wallet; LAST CALL never sees your private key.

## What the sponsor pays

When the server has a sponsor key set (`SPONSOR_SECRET_KEY`), the sponsor:

- is the fee payer, so it pays the network fee;
- pays the rent for any new token account the swap needs, such as your first SPACEX account.

The sponsor signs before you do, and only after its own checks pass. It cannot move your tokens. Details: [Fee sponsor](../trust/fee-sponsor.md).

## If you hold 0 SOL

- **Sponsor configured:** you can convert with 0 SOL. The sponsor covers the fee and rent.
- **No sponsor configured:** the transaction is a plain Jupiter swap and **you** are the fee payer (`frontend/app/api/actions/convert/convert.ts`). With 0 SOL it will fail.

On 2026-09-25 at 06:24 UTC, a `POST /api/convert` to the live site `https://lastcall-sol.vercel.app` returned `"sponsored": false` with the owner as `feePayer`. So at that time the live deployment did **not** sponsor fees, and a 0-SOL wallet could not convert there.

## When it fails

The card shows the server's error message. Common ones, from `frontend/app/api/convert/route.ts`:

| Message | Meaning |
|---|---|
| `no conversion destination in the ledger lifecycle for fromMint` | This token has no conversion yet |
| `no balance left to convert` | The wallet holds none of this token |
| `sponsor misconfigured` | The server's sponsor key could not be read |
| anything else | Usually Jupiter found no route or the RPC failed; try again |
