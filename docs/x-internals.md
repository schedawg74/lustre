# X internals Feedwarden depends on

x.com has no public API for personal moderation that fits this use. Feedwarden
uses the web app's own private endpoints and DOM. This file lists every such
dependency, so a breakage can be traced quickly.

## API endpoints

| Use | Endpoint | Notes |
| --- | --- | --- |
| Block | `POST /i/api/1.1/blocks/create.json` | Form body `user_id=` or `screen_name=` |
| Unblock (Undo) | `POST /i/api/1.1/blocks/destroy.json` | |
| Mute | `POST /i/api/1.1/mutes/users/create.json` | |
| Unmute (Undo) | `POST /i/api/1.1/mutes/users/destroy.json` | |
| List members | `GET /i/api/graphql/<queryId>/ListMembers` | Read only, never called by Feedwarden itself (see below) |

Request headers (`src/packages/x-client/src/client.ts`):

- `authorization`: the bearer x.com sends. The page bridge captures it from
  x.com's own requests. Until one is seen, the bearer from x.com's web bundle
  is used (`WEB_APP_BEARER`).
- `x-csrf-token`: the value of the `ct0` cookie.
- `x-twitter-auth-type: OAuth2Session`, `x-twitter-active-user: yes`.

Errors are mapped in `toError`:

| Response | Feedwarden does |
| --- | --- |
| 429 or error code 88 | Waits until `x-rate-limit-reset` (+5 s); 15 min when the header is missing |
| Error codes 17, 34, 50, 63, or 404 | Marks the account "skipped: unavailable" |
| 401 or codes 32, 89, 215, 326, 353 | Pauses the queue and shows the error (log in again) |
| 5xx, network error | Retries the account up to 3 times |
| Other 4xx | Marks the account failed; **Retry failed** in the popup re-queues |

## Why list import scrolls instead of calling ListMembers

GraphQL query ids change with every x.com deploy, the `features` parameter
must match what the server expects, and some operations need an
`x-client-transaction-id` header that only x.com's own code can generate.
Scrolling the members page lets x.com make those requests itself. The page
bridge (`x-bridge.content.ts`) reads the responses as they arrive. It patches
`XMLHttpRequest` and `fetch` in the page world but never changes a request or
a response.

The import finishes when a page comes back with no members, or when no new
members arrive for 12 seconds.

## DOM selectors

All selectors live in `SELECTORS` in `src/apps/extension/src/lib/x/dom.ts`.

| Selector | Used for |
| --- | --- |
| `article[data-testid="tweet"]` | A post |
| `[data-testid="cellInnerDiv"]` | The timeline cell that is hidden after an action |
| `[data-testid="User-Name"] a[href]` | The author's handle |
| `[role="group"]` containing `[data-testid="reply"]` | The action bar the buttons go into |
| `[data-testid="caret"]` | The post's "⋯" menu |
| `[role="menu"] [role="menuitem"]` | Menu entries, matched by text |
| `[data-testid="confirmationSheetConfirm"]` | Block confirmation (menu fallback) |
| `a[data-testid="AppTabBar_Profile_Link"]` | Your own handle (no buttons on your posts) |
| `[data-testid="UserCell"]` | Rows on the list members page (scrolling) |

Menu entries are matched by text (`MENU_ENTRIES` in `menu.ts`), in English and
German plus a few other languages. If you use X in another language and "Not
interested" fails, add the wording there.
