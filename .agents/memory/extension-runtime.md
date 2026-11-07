# Extension runtime

## Toolchain

- Node is pinned to 24.22.2 in `.node-version` and `devEngines.runtime` (`onFail: download`). pnpm downloads that Node for scripts when the machine runs another version. 24.22.2 includes every fix in the Node security index up to 2026-11-07 (latest security release: 24.22.1, 2026-10-20). Check `https://github.com/nodejs/security-wg/blob/main/vuln/core/index.json` before you change it.
- pnpm 12 with `minimumReleaseAge: 720` (12 hours) and `nodeLinker: hoisted`. Shared versions live in the `catalog` of `pnpm-workspace.yaml`.
- TypeScript 7 (`tsc` is the native compiler). WXT 0.21 with `@wxt-dev/module-react`. Tailwind CSS 4 through `@tailwindcss/vite` in `wxt.config.ts`; only extension pages (the popup) use it.
- `bts.jsonc` records the Better-T-Stack scaffold. Keep it for `create-better-t-stack add`.

## Manifest

`src/apps/extension/wxt.config.ts` builds the manifest.

- Permissions: `storage`. Host permissions: `https://x.com/*`, `https://twitter.com/*`.
- Firefox builds MV3 (`--mv3` in the scripts). MV2 has no `world: "MAIN"` content scripts. The gecko id is `lustre@schedawg74`, minimum Firefox 128, and `data_collection_permissions.required: ["none"]`.
- `srcDir` is `src`; `publicDir` is `public` (icons in `public/icon/`).

## Content scripts

- `x-bridge.content.ts` runs in the page world at `document_start`, before x.com's scripts. It must stay small and must not import storage or messaging.
- `x.content/index.ts` runs in the isolated world, also at `document_start`, so the bridge's first messages are not lost. DOM work waits for `DOMContentLoaded`.
- x.com is a single-page app. Listen to WXT's `wxt:locationchange` on `ctx` for navigation.
- Use `ctx.setInterval`, `ctx.addEventListener`, and `ctx.onInvalidated`, so a reloaded extension stops old scripts.
- In Firefox, content-script `fetch` runs with the extension's origin; `session.ts` uses `content.fetch` there to send the request as the page.
- Chrome checks a content script's same-origin `fetch` against the page's origin, so x.com receives a normal same-origin request with cookies.

## Storage

- All items are in `src/lib/storage.ts`, defined with WXT `storage.defineItem` in `local:`.
- `readSettings` and `watchSettings` merge stored settings over `DEFAULT_SETTINGS`, so new settings keys get defaults.
- Runtime messages drop keys whose value is `undefined`. Clear `lastError` and `rateLimitedUntil` with `null`.
- The queue is one object keyed by user id. Entries stay after blocking, so a second import of the same list adds only new members.

## Concurrency

- The background worker chains handlers on one promise, so each read-modify-write finishes before the next starts.
- The block runner holds the Web Lock `lustre-block-runner` for the life of its tab. Each wait is at most 30 s, so after an extension reload the old script sees `ctx.isValid === false` and frees the lock.
