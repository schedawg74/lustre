# X platform

x.com has no public API for personal moderation that fits this use. Lustre
uses the web app's own private endpoints and DOM. This file lists every such
dependency, so a breakage can be traced quickly.

## API endpoints

| Use | Endpoint | Notes |
| --- | --- | --- |
| Block | `POST /i/api/1.1/blocks/create.json` | Form body `user_id=` or `screen_name=` |
| Unblock (Undo) | `POST /i/api/1.1/blocks/destroy.json` | |
| Mute | `POST /i/api/1.1/mutes/users/create.json` | |
| Unmute (Undo) | `POST /i/api/1.1/mutes/users/destroy.json` | |
| List members | `GET /i/api/graphql/<queryId>/ListMembers` | Read only, never called by Lustre itself (see below) |

Request headers (`src/packages/x-client/src/client.ts`):

- `authorization`: the bearer x.com sends. The page bridge captures it from
  x.com's own requests. Until one is seen, the bearer from x.com's web bundle
  is used (`WEB_APP_BEARER`).
- `x-csrf-token`: the value of the `ct0` cookie.
- `x-twitter-auth-type: OAuth2Session`, `x-twitter-active-user: yes`.

Errors are mapped in `toError`:

| Response | Lustre does |
| --- | --- |
| 429 or error code 88 | Waits until `x-rate-limit-reset` (+5 s); 15 min when the header is missing |
| Error codes 17, 34, 50, 63, or 404 | Marks the account "skipped: unavailable" |
| 401 or codes 32, 89, 215, 326, 353 | Pauses the queue and shows the error (log in again) |
| 5xx, network error | Retries the account up to 3 times |
| Other 4xx | Marks the account failed; **Retry failed** in the popup re-queues |

## How list import pages through a list

GraphQL query ids change with every x.com deploy, the `features` parameter
must match what the server expects, and some operations need an
`x-client-transaction-id` header that only x.com's own code can generate.
So Lustre never builds a ListMembers request from scratch:

1. The members page (opened in a background tab) makes x.com load the first
   page itself. The page bridge (`x-bridge.content.ts`) forwards that
   response and the headers of its request. It patches `XMLHttpRequest` and
   `fetch` in the page world but never changes a request or a response.
2. The content script repeats exactly that request with the next page's
   `cursor` (the "Bottom" cursor entry) until a page has no members
   (`session.fetchMembersPage`, `withGraphqlVariables`). This works in a
   background tab, where x.com would not load more members on its own.
3. If x.com refuses a repeated request (for example because the reused
   transaction id is rejected), the import falls back to scrolling the
   members list, which needs the tab in front; the panel says so. The
   fallback finishes after an empty page or 12 s without new members.

Not verified against live x.com: whether x.com accepts the repeated request
with the reused headers. The e2e test proves the paging logic with a fake.

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
