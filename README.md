# Lustre

Personal feed control for X and YouTube, as a browser extension.

What works today (X):

- **Bulk-block an X list.** Paste a list link (the default is the
  [AI slop list](https://x.com/i/lists/2116659176894071283)). Lustre opens
  the list's members page, scrolls through it, and adds every member to a block
  queue. You review the queue, then press **Start blocking**. Accounts you
  follow, accounts you already block, and handles on your allowlist are
  skipped.
- **Block, Mute and Not interested on every post.** Three small buttons sit in
  each post's action bar. Block and Mute hide the post and show an Undo toast.
  Not interested uses X's own "Not interested in this post" entry, which X
  offers only on the For you timeline.

Planned (see [docs/plans/roadmap.md](docs/plans/roadmap.md)): a shared
blocklist, hide YouTube Shorts, a Not interested button on YouTube, and an AI
curator that cleans the YouTube home feed using your own AI subscription.

## Shared blocklist server (in progress)

`src/apps/server` is a small API that collects the accounts that Lustre
installs block or mute, and serves them as a shared blocklist. The extension
does not use it yet. When it does, sharing is opt-in. A report contains only
the blocked account's public data (user id, handle, display name), the action,
where it came from (`list:<id>` or `post`), the time, and an anonymous install
id. It never contains your X identity, cookies, or tokens.

```sh
pnpm dev:server             # http://localhost:3000, SQLite in src/apps/server/.data/
docker compose up --build   # the production image on http://127.0.0.1:3000
```

API, data model, and privacy decisions:
[.agents/memory/server.md](.agents/memory/server.md). Hetzner layout, deploy,
backup, and restore: [.agents/memory/infrastructure.md](.agents/memory/infrastructure.md).

## Install (unpacked)

```sh
pnpm install
pnpm build
```

- **Chrome / Edge / Brave:** open `chrome://extensions`, turn on Developer mode,
  click **Load unpacked**, and pick `src/apps/extension/.output/chrome-mv3`.
- **Firefox (128+):** open `about:debugging#/runtime/this-firefox`, click
  **Load Temporary Add-on**, and pick any file in
  `src/apps/extension/.output/firefox-mv3`. Grant the x.com permission when
  Firefox asks.

For development with hot reload: `pnpm dev` (Chrome) or `pnpm dev:firefox`.

## Use

1. Log in to x.com in the same browser.
2. Click the Lustre icon → **Block lists** → **Import**. A tab opens on
   the list and collects the members; a panel in the corner shows progress.
3. Review the queue in the popup (**Review pending accounts**; **Skip** removes
   one), then press **Start blocking**.
4. Keep one x.com tab open while it blocks. The icon badge shows how many
   accounts are left. Blocking pauses on its own when X rate-limits and
   continues when the limit resets.

Re-importing a list later only queues its new members.

## How it works

- `src/apps/extension/src/entrypoints/x-bridge.content.ts` runs in x.com's
  page world. It watches x.com's own API calls and forwards the list-member
  responses and the current auth header to the content script. It never
  changes a request.
- Blocks and mutes call the same endpoints x.com's web app calls
  (`/i/api/1.1/blocks/create.json`, `/i/api/1.1/mutes/users/create.json`) from
  the x.com tab, so they use your logged-in session. No password or token
  leaves your browser.
- If x.com rejects an API call from a post button, Lustre falls back to
  clicking the same entry in the post's "⋯" menu.
- The block queue runs in one x.com tab at a time (a Web Lock). If that tab
  closes, another open x.com tab takes over.

Details and the parts most likely to break when x.com changes:
[.agents/memory/x-platform.md](.agents/memory/x-platform.md).

## Repository layout

Better-T-Stack monorepo (pnpm workspaces + Turborepo + Biome/Ultracite), laid
out like `safina` and `milton-platform`:

```
src/
  apps/
    extension/        WXT browser extension (React popup, content scripts)
    server/           Blocklist API (Express 5, SQLite), Dockerfile
  packages/
    x-client/         X web API calls and GraphQL response parsing
    block-queue/      Block queue logic (no browser APIs, unit-tested)
    api/              Blocklist API schemas (Zod) and typed fetch client
    db/               SQLite schema and migrations (Drizzle, better-sqlite3)
    infra/            Pulumi program for Hetzner Cloud
  tooling/
    typescript/       Shared tsconfig
    tailwind/         Tailwind CSS 4 theme: marble, bronze, Cinzel + Jost
docs/plans/           Planned work
.agents/memory/       Architecture and decisions, for people and coding agents
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | WXT dev mode for Chrome with hot reload |
| `pnpm dev:server` | Blocklist server with reload on change |
| `pnpm build` | Production builds for Chrome (MV3) and Firefox (MV3), and the server bundle |
| `pnpm zip` / `pnpm zip:firefox` | Store-ready zip files |
| `pnpm test` | Vitest unit tests (packages, server against in-memory SQLite, infra config) |
| `pnpm test:e2e` | Chromium smoke test of the built extension against a fake x.com |
| `pnpm typecheck` | TypeScript in every workspace |
| `pnpm lint` / `pnpm format` | Biome (Ultracite preset) |

## Caution

Bulk blocking uses x.com's private web API, which X can change or rate-limit
at any time. The default pace is one block every ~2.5 s. This is a personal
tool; use it on your own account.
