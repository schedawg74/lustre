# Website

`src/apps/website` (`@lustre/website`) is the one-page landing site. It is static: `astro build` writes `src/apps/website/dist/`, and Caddy on the Hetzner host serves that folder (hosting config lives with the infrastructure, not here).

## Stack

- Astro 7 with `output: "static"` (`astro.config.ts`). React islands through `@astrojs/react`.
- Tailwind CSS 4 through `@tailwindcss/vite`, with the shared theme `@lustre/tailwind-config/theme.css` (`src/styles/global.css`). Fonts come from `@fontsource-variable` through the theme; never from a CDN. Follow [conventions](conventions.md#theme) for tokens and contrast.
- Icons: `@lustre/icons/svg` in `.astro` files, `@lustre/icons/react` in islands. The favicon is `@lustre/icons/brand/icon.svg`.
- `pnpm --filter @lustre/website dev | build | preview | typecheck` (or `pnpm dev:website`). `typecheck` is `astro check`.
- `astro check` needs the TypeScript JavaScript API, which TypeScript 7 does not have. The website therefore pins `typescript` 6 in its own devDependencies; the rest of the repository uses the catalog version 7.
- Biome extends `ultracite/biome/astro`. `noUnknownAttribute` is off for `.astro` files, because their templates use HTML attributes (`class`, `set:html`), not React props.

## Structure

| Path under `src/apps/website/src/` | Content |
| --- | --- |
| `site.ts` | `SITE_URL` (placeholder domain), `REPO_URL`, `INSTALL_URL` (the target of every "Add to Chrome" button: the README install section until the store listing exists), `API_URL` |
| `pages/index.astro` | The page: head and SEO tags, hero, features, how it works, privacy, footer |
| `components/live-stats.tsx` | The only island (`client:visible`): the hero text (passed as children), the feed of blocked accounts, and the counters |
| `stats.ts` | Stats types, `fetchStats`, `maskHandle`, the bundled excerpt pool, and the sample data |
| `estimates.ts` | The assumptions behind the estimated counters. The page footnote reads them from here |
| `styles/global.css` | Tailwind and theme imports, focus ring, and the feed card animation |

## Stats data

- `fetchStats` calls `GET ${API_URL}/v1/stats` in the browser only. It expects `{ accountsBlocked: number, recent: { maskedHandle: string, blockedAt: string }[] }`.
- `API_URL` comes from `PUBLIC_API_URL` at build time (also a turbo build `env` key). When it is empty, the request fails, or the answer has another shape, the page uses `SAMPLE_STATS` and says "Sample data" under the counters. Do not set `PUBLIC_API_URL` before the server serves that endpoint.
- The server stores no post texts. The page pairs each block with an invented excerpt from `EXCERPTS`.
- Handles arrive masked. `maskHandle` keeps a value that contains "•••" and masks any other value (at most the first and last three characters, less for short handles). Never show a full handle on the page.
- The page has no analytics. The stats request is its only request to another origin.

## Animation rules

- Pure CSS and React. No canvas, no WebGL, no animation library.
- Feed cycle: every 1.3 s the island either adds a card at the top (thumb up) or turns the newest card's thumb down and chisels out its handle and excerpt (pollice verso, damnatio memoriae). Four cards stay; the fifth slides away. Only `data-state="arriving"` cards play the entry animation.
- The feed runs only while it is on screen and the tab is visible. With `prefers-reduced-motion: reduce` it shows a static list of blocked cards and the counters show their final values.
- The server render and the first client render are the static state (feed blocked, counters final), so the page is complete without JavaScript.
- The feed is `aria-hidden`; a visually hidden sentence describes it. Counters animate an `aria-hidden` number and expose the final number to screen readers.
- Terracotta (`danger`) text is below 4.5:1 on `surface` in light mode. In cards, terracotta is used only for the thumb and the strike line (non-text, at least 3:1); the "Blocked" label is `muted`.

## Visual check

After `build`, run `pnpm --filter @lustre/website preview` and take Playwright screenshots (Chromium from the extension's `playwright` devDependency) at 1280 px and 390 px, light and dark, plus reduced motion and JavaScript off.
