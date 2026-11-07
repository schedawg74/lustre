# Testing

Read the affected package's manifest before selecting a command.

## Commands

| Area | Command | Prerequisites / limits |
| --- | --- | --- |
| Unit | `pnpm test` | Vitest over `src/**/*.test.ts` (root `vitest.config.ts`). Packages, the server, and the infra config; `fetch` is mocked |
| Types | `pnpm typecheck` | Turborepo. The extension runs `wxt prepare` first to generate `.wxt/` types |
| Lint | `pnpm lint` | Read-only Biome check. `pnpm format` applies fixes |
| Build | `pnpm build` | Chrome MV3 and Firefox MV3 into `src/apps/extension/.output/`; the server into `src/apps/server/dist/` |
| Server image | `docker build -f src/apps/server/Dockerfile .` | Docker. Run it with `docker compose up --build` (port 3000) |
| End to end | `pnpm test:e2e` | Needs `pnpm build` first and Playwright Chromium (`pnpm --filter @lustre/extension exec playwright install chromium`). Headless |

CI (`.github/workflows/ci.yml`) runs all of them on every push to `main` and every PR. Its `host` job checks `src/packages/infra/host` (`docker compose config`, `caddy validate` in the Caddy image, `shellcheck`) and runs `actionlint` on the workflows. `deploy-server.yml` and `deploy-website.yml` run CI again before they deploy.

## What the end-to-end test covers

`src/apps/extension/e2e/smoke.ts` loads the built Chrome extension and answers every x.com request itself; it never contacts x.com.
It checks: list import through the popup (a followed account is skipped), the block runner (two `blocks/create.json` calls by user id with the bearer captured by the bridge), the three post buttons (none on the owner's post), Mute with Undo, Not interested through the menu, and the popup counts.

The fake pages copy only the selectors in `SELECTORS`. A pass shows that the extension logic works; it does not show that x.com still uses those selectors and endpoints. After x.com changes, check by hand on x.com and update [the platform note](x-platform.md).

Tabs that the extension opens with `browser.tabs.create` can load before Playwright's route applies to them. The test loads such a tab again.

## Server and infra tests

- `src/apps/server/src/app.test.ts` calls the Express app with supertest against an in-memory SQLite database with all migrations (`createTestDatabase` from `@lustre/db/testing`). It injects the clock and small rate limits. It covers auth, validation, idempotent reports, the blocklist filters and pages, CORS, body and rate limits.
- `src/packages/infra/platform/config.test.ts` reads stack values with Pulumi mocks. `firewall.test.ts` checks the rules with and without `cloudflareProxy`. `host.test.ts` checks the rendered cloud-init (and runs `cloud-init schema` when `cloud-init` is installed) and that `host/` uses only the variables that cloud-init writes. No test calls Hetzner, Tailscale, or Object Storage; `pulumi preview` and the deploy workflows are not tested.

## Adding tests

- Pure logic goes in a package with a `*.test.ts` file next to it.
- A new server route gets cases in `app.test.ts`. A schema change gets a new migration (`pnpm --filter @lustre/db generate --name <change>`); the tests apply it.
- New x.com behavior gets a case in the end-to-end test, with the fake page extended to the selectors it uses.
