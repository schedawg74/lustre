# Testing

Read the affected package's manifest before selecting a command.

## Commands

| Area | Command | Prerequisites / limits |
| --- | --- | --- |
| Unit | `pnpm test` | Vitest over `src/**/*.test.ts` (root `vitest.config.ts`). Packages only; `fetch` is mocked |
| Types | `pnpm typecheck` | Turborepo. The extension runs `wxt prepare` first to generate `.wxt/` types |
| Lint | `pnpm lint` | Read-only Biome check. `pnpm format` applies fixes |
| Build | `pnpm build` | Chrome MV3 and Firefox MV3 into `src/apps/extension/.output/` |
| End to end | `pnpm test:e2e` | Needs `pnpm build` first and Playwright Chromium (`pnpm --filter @lustre/extension exec playwright install chromium`). Headless |

CI (`.github/workflows/ci.yml`) runs all five on every push to `main` and every PR.

## What the end-to-end test covers

`src/apps/extension/e2e/smoke.ts` loads the built Chrome extension and answers every x.com request itself; it never contacts x.com.
It checks: list import through the popup (a followed account is skipped), the block runner (two `blocks/create.json` calls by user id with the bearer captured by the bridge), the three post buttons (none on the owner's post), Mute with Undo, Not interested through the menu, and the popup counts.

The fake pages copy only the selectors in `SELECTORS`. A pass shows that the extension logic works; it does not show that x.com still uses those selectors and endpoints. After x.com changes, check by hand on x.com and update [the platform note](x-platform.md).

Tabs that the extension opens with `browser.tabs.create` can load before Playwright's route applies to them. The test loads such a tab again.

## Adding tests

- Pure logic goes in a package with a `*.test.ts` file next to it.
- New x.com behavior gets a case in the end-to-end test, with the fake page extended to the selectors it uses.
