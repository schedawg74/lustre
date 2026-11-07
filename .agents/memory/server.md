# Blocklist server

The shared blocklist. Extension installs report the X accounts that they blocked or muted. Other installs download the accounts that enough installs reported.
The extension does not call the server yet. `@lustre/api/client` is the client it will use.

## Packages

| Path under `src/` | Responsibility |
| --- | --- |
| `packages/api/src/v1.ts` | Zod 4 schemas and types of every request and response, `API_PATHS`, batch and page limits |
| `packages/api/src/client.ts` | `createLustreApi({ baseUrl, fetch, token })`. Validates every response; throws `LustreApiError` with the server's error code |
| `packages/db/` | Drizzle schema (`src/schema.ts`), migrations (`migrations/`), `openDatabase`, `runMigrations`, and `createTestDatabase` (`@lustre/db/testing`) |
| `apps/server/src/routers/` | Express routers. Parse input with the `@lustre/api` schemas, call services, send JSON |
| `apps/server/src/services/` | All database access (Drizzle queries) |
| `apps/server/src/middleware/` | Bearer authentication, rate limits, error responses |

Biome enforces the layers: files in `routers/` and `middleware/` must not import `@lustre/db`, `drizzle-orm`, or `better-sqlite3` (`biome.json` overrides).

## API (v1)

All bodies are JSON. Errors are `{ error: { code, message, issues? } }`.

| Route | Auth | Does |
| --- | --- | --- |
| `GET /health` | none | `{ status: "ok" }` |
| `POST /v1/installs` | none | Creates an anonymous install. Returns `{ installId, token }` (201). The token is 32 random bytes in base64url. The server keeps only its SHA-256 hash, so a lost token cannot be shown again |
| `POST /v1/reports` | Bearer token | Takes `{ reports: [...] }`, 1 to 500 items of `{ userId, screenName, name, action, source, reportedAt }`. Upserts the accounts and inserts each report once. Returns `{ received, recorded, duplicates }` |
| `GET /v1/blocklist` | Bearer token | Accounts with the count of distinct reporting installs (`reporters`). Query: `minReporters` (default 1), `since` (ISO time; accounts with a report at or after it), `limit` (1 to 1000, default 500), `cursor` (the previous page's `nextCursor`) |

- `action` is `block` or `mute`. `source` is `list:<list id>` or `post`; the schema rejects free text.
- A report is unique per install, account, and action. A retried batch records nothing new and counts every item as a duplicate.
- A `reportedAt` later than the server time is stored as the server time. The newest report decides an account's `screenName` and `name`.
- The blocklist pages by user id (keyset). `since` filters on `last_reported_at`, so an account that gets a new reporter appears again in an incremental download.
- The blocklist is open to every valid install token for now. Payment gating (a planned 1 USD purchase) comes later and is not built.

Status codes: 400 `INVALID_REQUEST` (Zod issues with paths) or `BAD_REQUEST` (invalid JSON), 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 413 `PAYLOAD_TOO_LARGE` (body above 256 kB), 429 `RATE_LIMITED`, 500 `INTERNAL`.

## Limits and HTTP hardening (`apps/server/src/app.ts`)

- Rate limits in memory (`middleware/rate-limit.ts`): 120 requests per minute per IP on `/v1`, 10 new installs per hour per IP, 60 requests per minute per install token. A restart resets them. They need a shared store if the server ever runs more than one process.
- `TRUST_PROXY_HOPS=1` behind Caddy, so the per-IP limit sees the client address from `X-Forwarded-For`.
- `helmet` with `default-src 'none'`. CORS allows only `chrome-extension://` and `moz-extension://` origins. The extension's background worker has host permissions and does not need CORS; extension pages do.
- Request logs (pino, `pino-http`) have method, path, status, and duration only. They do not have IP addresses or headers. The `authorization` header is redacted in any other log.

## Configuration (`apps/server/src/config.ts`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_PATH` | required | SQLite file. The image sets `/data/lustre.db` |
| `MIGRATIONS_FOLDER` | `migrations` | Drizzle migrations, applied at startup. The image sets `/app/migrations` |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `info` | pino level |
| `TRUST_PROXY_HOPS` | `0` | Proxies in front of the server |

## Data model (`packages/db/src/schema.ts`)

Timestamps are epoch milliseconds (`integer`, Drizzle `timestamp_ms`). There are no boolean columns.

- `accounts`: `id` (X user id, text primary key), `screen_name`, `name`, `first_reported_at`, `last_reported_at` (indexed), `created_at`, `updated_at`.
- `installs`: `id` (random UUID), `token_hash` (SHA-256 hex, unique), `created_at`, `last_seen_at` (written at most once per hour).
- `reports`: `id`, `install_id` -> `installs`, `account_id` -> `accounts` (indexed), `action` (`block` | `mute`, CHECK), `source`, `reported_at`, `created_at`. Unique on (`install_id`, `account_id`, `action`).

SQLite runs in WAL mode with `synchronous = NORMAL`, `foreign_keys = ON`, and `busy_timeout = 5000`. WAL lets Litestream stream every change (see [infrastructure](infrastructure.md)).

Change the schema, then run `pnpm --filter @lustre/db generate --name <change>` and commit the new SQL file and snapshot. The server applies new migrations at startup.

## Privacy decisions

- Sharing is opt-in in the extension (not built yet). A report has only the blocked or muted account's public data (user id, handle, display name), the action, the source, the time, and the anonymous install id.
- The server never receives the reporter's X user id, handle, cookies, CSRF token, or bearer. The schemas drop unknown fields, so extra data is not stored.
- `installs` holds no X identity, IP address, or user agent. The server and Caddy do not log client IP addresses. The rate limiter keeps IP addresses in memory for its window only.
- One install's reports are linkable to each other through the install id. The blocklist response shows only counts, never install ids.
- Any install can report any account, and creating installs is cheap. `minReporters` is the only defense against false reports today. See the open questions in the PR before the blocklist is sold.

## Run locally

```sh
pnpm dev:server                 # tsx watch, SQLite in src/apps/server/.data/
docker compose up --build       # the production image on http://127.0.0.1:3000
```
