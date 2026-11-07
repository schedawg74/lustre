# Architecture

Lustre is a WXT browser extension in a Better-T-Stack monorepo (pnpm workspaces, Turborepo, Biome with Ultracite). A small blocklist server collects the accounts that installs block and serves them as a shared blocklist (see [server](server.md)). The extension does not call it yet.
Use manifests and lockfiles for dependency versions.

## Code map

| Path under `src/` | Responsibility |
| --- | --- |
| `apps/extension/` | WXT extension for Chrome and Firefox (MV3). React popup, background worker, content scripts |
| `apps/extension/src/entrypoints/` | Manifest entry points only. Each file connects code from `src/lib/` |
| `apps/extension/src/lib/storage.ts` | Every `storage.local` item, its type, and its default |
| `apps/extension/src/lib/messages.ts` | The message types that the background worker accepts |
| `apps/extension/src/lib/x/` | Everything that runs on x.com: session, page bridge protocol, post buttons, list import, block runner, DOM selectors |
| `apps/extension/e2e/` | Playwright smoke test against a fake x.com |
| `packages/x-client/` | X web API calls (`client.ts`) and GraphQL parsing (`users.ts`). No extension or DOM APIs; `fetch` is injected |
| `packages/block-queue/` | Pure functions over the block queue: add, next, record outcome, skip, retry, summary, delay |
| `apps/server/` | Express 5 blocklist server: routers, services, middleware. Bundled by tsdown into `dist/index.mjs`; Docker image in `Dockerfile` |
| `packages/api/` | Zod schemas and types of the server API (`v1.ts`) and the typed fetch client (`client.ts`) |
| `packages/db/` | SQLite through Drizzle ORM and better-sqlite3: schema, migrations, `openDatabase`, `runMigrations` |
| `packages/infra/` | Pulumi program for Hetzner Cloud (`platform/`) and the host runtime files (`host/`). See [infrastructure](infrastructure.md) |
| `tooling/typescript/` | Shared `tsconfig` base |
| `tooling/tailwind/` | Tailwind CSS 4 theme (`theme.css`): colors, fonts, motifs. See [conventions](conventions.md#theme) |

Packages have no build step. They export source files by subpath (`"./*": "./src/*.ts"`), for example `@lustre/x-client/client`. The server bundles the `@lustre/*` packages it imports; its other dependencies stay external and `pnpm deploy` installs them in the image.

## Runtime contexts

| Context | File | Role |
| --- | --- | --- |
| Page world on x.com | `entrypoints/x-bridge.content.ts` | Patches `XMLHttpRequest` and `fetch` to read x.com's own traffic. Posts the bearer header and `ListMembers` responses to the content script with `window.postMessage`. Changes no request |
| Content script on x.com | `entrypoints/x.content/index.ts` | Creates the X session, starts the block runner, adds post buttons, runs a list import |
| Background worker | `entrypoints/background.ts` | Applies all queue, runner, and import writes one at a time. Opens the import tab. Sets the badge |
| Popup | `entrypoints/popup/` | Shows the queue and settings. Writes settings directly; sends messages for everything else |

The x.com API calls run in the content script, not in the background worker: there they are same-origin requests with the user's cookies, and the `ct0` cookie is readable for the CSRF header.

## Boundaries

- `src/packages/*` import no extension, DOM, or WXT module. Logic that can be pure goes there, with tests.
- Only the background worker writes `blockQueue`, `runner`, `lists`, and `pendingImport`. Only the popup writes `settings`. Only the tab that holds the runner lock writes `runnerHeartbeat`.
- Site code stays in `src/lib/<site>/`. YouTube code goes in `src/lib/youtube/` with its own content script.
- Server layers: routers -> services -> `@lustre/db`. Routers and middleware do not import `@lustre/db`, `drizzle-orm`, or `better-sqlite3` (Biome `noRestrictedImports`). `@lustre/infra` imports no workspace package.
- The extension and the server share only `@lustre/api`. The extension must not import `@lustre/db` or server code.

## Data flow

List import:

1. Popup sends `import/start`. The background stores `pendingImport` and opens `https://x.com/i/lists/<id>/members`.
2. The content script sees the matching path and request, shows a panel, and scrolls the last `UserCell` into view every 1.2 s.
3. x.com loads the next members page; the bridge forwards the response; `session.ts` extracts users and keys them by the `listId` in the request variables.
4. After an empty page, or 12 s without new members, the content script sends `import/finish`. The background adds the members to the queue with `addCandidates` and returns the counts.

Bulk blocking:

1. `runner.status` becomes `running` (popup, import panel, or auto-start setting).
2. Every x.com tab calls `startBlockRunner`; a Web Lock (`lustre-block-runner`) lets one tab work.
3. Each step takes `nextPending`, calls `blocks/create.json` by user id, and sends `queue/outcome`. Then it waits `jitteredDelay(blockDelayMs)`, or less when the runner state changes.
4. A 429 stores `rateLimitedUntil`. A session error pauses the runner with `lastError`. When the queue is empty the runner returns to `idle`.

Post buttons call the API by `screen_name` and fall back to the post's "⋯" menu when the API call fails for a reason other than the rate limit.
