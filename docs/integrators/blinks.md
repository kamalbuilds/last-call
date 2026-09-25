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

`GET /actions.json` returns two rules:

| pathPattern | apiPath |
|---|---|
| `/convert/**` | `/api/actions/convert/**` |
| `/api/actions/**` | `/api/actions/**` |

Only the second rule points at a handler that exists. There is no `/convert` page, and no handler below `/api/actions/convert/`: on 2026-09-25 both `/convert` and `/api/actions/convert/x?token=XAI` returned 404 on the live site. Point clients at `/api/actions/convert?token=...` directly.

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

The icon URL is built from the request's host. The description text is fixed apart from the symbols and the deadline date from `packages/ledger/src/lifecycle.json`, so it still says "before" after a deadline has passed, as in the XAI example.

## POST: transaction

`POST /api/actions/convert?token=XAI&amount=all` with body `{ "account": "<holder address>" }`.

- `amount=all` converts the holder's full on-chain balance; a zero balance returns 400 `no balance left to convert`.
- `amount=1` converts one whole token.

Live response on 2026-09-25 for `amount=1`:

```json
{ "type": "transaction", "transaction": "<base64 v0 transaction>", "message": "Convert 1 XAI into SPACEX" }
```

The transaction comes from the same `buildConversionTransaction()` the site uses (`frontend/app/api/actions/convert/convert.ts`). With a sponsor configured it is already signed by the sponsor as fee payer and needs only the holder's signature; without one the holder is the fee payer. The response has no `links.next`, so there is no follow-up step after signing. The client sends the transaction; LAST CALL never receives it signed.

Errors: 400 or 502 with `{ "message": string }`, listed in [HTTP API](http-api.md#post-apiactionsconvert).

## Example blink URL

The site builds share links in this form (`frontend/components/blink-share-link.tsx`):

```
https://dial.to/?action=solana-action:https://lastcall-sol.vercel.app/api/actions/convert?token=XAI
```

The home page renders a preview of the same action by calling the GET endpoint on its own host (`frontend/components/home-convert-blink.tsx`). If it cannot work out its host, it falls back to `https://last-call-fawn.vercel.app`, a different domain from the one in `README.md`.
