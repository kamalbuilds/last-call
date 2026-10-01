# Blinks (Solana Actions)

LAST CALL exposes the conversion as a Solana Action, so any Blink client can render "Convert all" and "Convert 1" and have the holder's wallet sign, without opening the site. Spec: https://solana.com/docs/advanced/actions.

Code: `frontend/app/actions.json/route.ts` and `frontend/app/api/actions/convert/route.ts`. Both send these headers on every response, including errors and `OPTIONS` (204):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Content-Encoding, Accept-Encoding
X-Action-Version: 1
X-Blockchain-Ids: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
```

## actions.json

`GET /actions.json` returns one rule:

| pathPattern | apiPath |
|---|---|
| `/api/actions/**` | `/api/actions/**` |

Point clients at `/api/actions/convert?token=...`.

## GET: metadata

`GET /api/actions/convert?token=XAI` (or `SPACEX`). Live response on 2026-09-25:

```json
{
  "type": "action",
  "icon": "https://lastcall-sol.vercel.app/blink-icon.svg",
  "title": "Convert your XAI before it expires",
  "description": "Convert XAI into SPACEX before 2026-09-12. After the deadline unconverted tokens expire worthless.",
  "label": "Convert",
  "links": {
    "actions": [
      { "label": "Convert all", "href": "/api/actions/convert?token=XAI&amount=all" },
      { "label": "Convert 1", "href": "/api/actions/convert?token=XAI&amount=1" }
    ]
  }
}
```

The icon URL is built from the request's host. The description is built from the symbols and the deadline date in `packages/ledger/src/lifecycle.json`.

## POST: transaction

`POST /api/actions/convert?token=XAI&amount=all` with body `{ "account": "<holder address>" }`.

- `amount=all` converts the holder's full on-chain balance; a zero balance returns 400 `no balance left to convert`.
- `amount=1` converts one whole token.

Live response on 2026-09-25 for `amount=1`:

```json
{ "type": "transaction", "transaction": "<base64 v0 transaction>", "message": "Convert 1 XAI into SPACEX" }
```

The transaction comes from the same `buildConversionTransaction()` the site uses (`frontend/app/api/actions/convert/convert.ts`). With a sponsor configured and an eligible holder (a wallet that cannot pay its own fee, converting its full balance of the source mint) it is already signed by the sponsor as fee payer and needs only the holder's signature; for any other holder, and when no sponsor is set, the holder is the fee payer and the transaction is an owner-paid swap. The reason a holder was not sponsored is the `sponsorRefusal` field of [`POST /api/convert`](http-api.md#post-apiconvert). The response has no `links.next`, so there is no follow-up step after signing. The client sends the transaction; LAST CALL never receives it signed.

Errors: 400 or 502 with `{ "message": string }`, listed in [HTTP API](http-api.md#post-apiactionsconvert).

## Example blink URL

The site builds share links in this form (`frontend/components/blink-share-link.tsx`):

```
https://dial.to/?action=solana-action:https://lastcall-sol.vercel.app/api/actions/convert?token=XAI
```

The home page renders a preview of the same action from the GET endpoint on its own host (`frontend/components/home-convert-blink.tsx`), defaulting to `https://lastcall-sol.vercel.app`.
