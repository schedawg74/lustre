# Feedwarden agent guide

Personal browser extension that controls what its owner sees on X and YouTube.
Read `README.md` for setup and `docs/x-internals.md` before touching anything
that talks to x.com.

## Layout

- `src/apps/extension` — WXT extension. `src/entrypoints` holds the manifest
  entry points (background, popup, content scripts); `src/lib` holds the code
  they share. `src/lib/x` is everything that runs on x.com.
- `src/packages/x-client` — X API calls and GraphQL parsing. No browser
  extension APIs, so it is unit-tested with a mocked `fetch`.
- `src/packages/block-queue` — Pure queue functions. Unit-tested.
- `src/tooling/typescript` — Shared tsconfig.

Packages export source files directly (`"./*": "./src/*.ts"`); there is no
build step for them. Import them by subpath, for example
`@feedwarden/x-client/client`.

## Rules

- Every write to the block queue, the runner state and the import request goes
  through the background worker (`src/lib/messages.ts`). Do not write those
  storage items from a content script or the popup.
- Clear optional storage fields with `null`, not `undefined`: runtime messages
  drop keys whose value is `undefined`.
- Keep x.com selectors in `SELECTORS` (`src/lib/x/dom.ts`) and menu texts in
  `MENU_ENTRIES` (`src/lib/x/menu.ts`), and update `docs/x-internals.md` when
  either changes.
- Build DOM with `createElement`, never `innerHTML`: x.com enforces Trusted
  Types.
- Logic that does not need the DOM or extension APIs belongs in a package with
  tests.

## Commands

```sh
pnpm lint        # Biome (Ultracite preset); pnpm format fixes
pnpm typecheck
pnpm test
pnpm build       # Chrome MV3 + Firefox MV3 into src/apps/extension/.output
```

Run all four before you commit. Husky runs Biome on staged files.

## Code standards

Ultracite (Biome) enforces formatting and most style rules. Beyond what it
checks:

- Prefer `type` over `interface`, early returns over nesting, and
  `unknown` over `any`.
- Throw `Error` subclasses with a clear message; map x.com failures to the
  error classes in `x-client/client.ts`.
- No `console.log` in committed code.
