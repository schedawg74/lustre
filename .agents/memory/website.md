# Website

`src/apps/website` (`@lustre/website`) is the one-page landing site. It is static: `astro build` writes `src/apps/website/dist/`, and Caddy on the Hetzner host serves that folder (hosting config lives with the infrastructure, not here).

## Stack

- Astro 7 with `output: "static"` (`astro.config.ts`). React islands through `@astrojs/react`.
- Tailwind CSS 4 through `@tailwindcss/vite`, with the shared theme `@lustre/tailwind-config/theme.css` (`src/styles/global.css`). Fonts come from `@fontsource-variable` through the theme; never from a CDN. Follow [conventions](conventions.md#theme) for tokens and contrast.
- Icons: `@lustre/icons/svg` in `.astro` files, `@lustre/icons/react` in islands. The favicon is `@lustre/icons/brand/icon.svg`.
- `pnpm --filter @lustre/website dev | build | preview | typecheck` (or `pnpm dev:website`). `typecheck` is `astro check`.
- `astro check` needs the TypeScript JavaScript API, which TypeScript 7 does not have. The website therefore pins `typescript` 6 in its own devDependencies; the rest of the repository uses the catalog version 7.
- Biome extends `ultracite/biome/astro`. `noUnknownAttribute` is off for `.astro` files, because their templates use HTML attributes (`class`, `set:html`), not React props.
- Hoisting (`nodeLinker: hoisted`) puts other workspaces' versions at the root. Two pins keep the website working: `@emnapi/runtime` 1.11.3 in its devDependencies (the peer of `@astrojs/astro2tsx`, which `astro check` runs; it must match `@emnapi/core` 1.11.3, while rolldown's WebAssembly binding pins 2.0.0-beta.2), and `cookie` in `vite.environments.prerender.resolve.noExternal` (the root has the server's `cookie` 0.7; Astro needs its nested 2.x).

## Structure

| Path under `src/apps/website/src/` | Content |
| --- | --- |
| `site.ts` | `SITE_URL` (placeholder domain), `REPO_URL`, `INSTALL_URL` (the target of every "Add to Chrome" button: the README install section until the store listing exists), `API_URL` |
| `pages/index.astro` | The page: head and SEO tags, hero (headline and two buttons only), features, how it works, privacy, footer |
| `components/live-stats.tsx` | The only island (`client:visible`): the hero (passed as children), the feed of blocked accounts, and the counters |
| `stats.ts` | `fetchStats`, `displayHandle`, the invented post pool (`SLOP_POSTS`), and the sample data |
| `estimates.ts` | The assumptions behind "Posts and replies hidden per week" and "Hours saved per week". The page does not show them |
| `styles/global.css` | Tailwind and theme imports, focus ring, and the feed card animation |

## Stats data

- `fetchStats` uses `createLustreApi(...).stats()` from `@lustre/api`, so the Zod schema of `GET /v1/stats` validates the answer: `{ accountsBlocked, recent: { maskedHandle, blockedAt }[] }` (see [server](server.md#public-stats)). It runs in the browser only.
- `API_URL` comes from `PUBLIC_API_URL` at build time (also a turbo build `env` key). When it is empty, the request fails, or the answer does not match the schema, the island uses `SAMPLE_STATS` (marked in the code).
- Counters show only with live data. With sample data they show in `astro dev` (`import.meta.env.DEV`) and not at all in a production build: no frame, no note.
- The feed may use the sample handles in production; it is an illustration. With live data and a non-empty `recent`, the feed uses the live handles.
- The server stores no names or post texts. Each card pairs a handle with an invented post from `SLOP_POSTS` (display name, text, age, action counts).
- The server sends handles masked and without `@` (first and last three characters, or only the first one below 7 characters). `displayHandle` adds `@` and masks any value without "•••" by the same rule. Never show a full handle on the page.
- The page has no analytics. The stats request is its only request to another origin.

## Feed cards

- A card looks like a post in a feed (look and layout only; no X logo or branding): a round avatar with the initials of the invented name (`text` on `line`; `muted` on `line` is 4.49:1 in light mode), the name in bold, the masked handle and the age in `muted`, the text, and an action row (reply, repost, like, views) with icons drawn in the Meandros style in `live-stats.tsx`.
- The pollice icon sits where a post has its menu. Execution: the thumb turns from up to down, the card dims (`surface` to `canvas`, text to `muted`), name, handle and text get a terracotta strike (damnatio memoriae), and "Blocked by Lustre" replaces the action row. Later the card slides away.
- Terracotta (`danger`) text is below 4.5:1 on `surface` in light mode. It is used only for the thumb and the strike (non-text, at least 3:1); the label is `muted`.

## Animation rules

- Pure CSS and React. No canvas, no WebGL, no animation library.
- Every 1.3 s the island either adds a post at the top or executes the newest one. Four cards stay; the fifth slides away. Only `data-state="arriving"` cards play the entry animation.
- The feed runs only while it is on screen and the tab is visible. With `prefers-reduced-motion: reduce` it shows a static list of blocked cards, and the counters show their final values.
- The server render and the first client render are the static state, so the page is complete without JavaScript.
- The feed is `aria-hidden`; one visually hidden sentence describes it. Counters animate an `aria-hidden` number and expose the final number to screen readers.

## Visual check

After `build`, run `pnpm --filter @lustre/website preview` and take Playwright screenshots (Chromium from the extension's `playwright` devDependency) at 1280 px and 390 px, light and dark, plus a mid-animation frame, reduced motion, and JavaScript off. A production build without `PUBLIC_API_URL` shows no counters; check them with `pnpm dev:website`.
