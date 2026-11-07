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
| `components/live-stats.tsx` | The only island (`client:visible`): the hero (passed as children), the timeline, the counters, and the stats fetch |
| `components/x-timeline.tsx` | The animated timeline with the Lustre buttons and toast. See [Timeline](#timeline) |
| `components/hooks.ts` | `useMedia`, `usePageVisible`, `useOnScreen` |
| `stats.ts` | `fetchStats`, `displayHandle`, the invented post pool (`SLOP_POSTS`), and the sample data |
| `estimates.ts` | The assumptions behind "Posts and replies hidden per week" and "Hours saved per week". The page does not show them |
| `styles/global.css` | Tailwind and theme imports, focus ring, and the timeline styles and animation |

## Stats data

- `fetchStats` uses `createLustreApi(...).stats()` from `@lustre/api`, so the Zod schema of `GET /v1/stats` validates the answer: `{ accountsBlocked, recent: { maskedHandle, blockedAt }[] }` (see [server](server.md#public-stats)). It runs in the browser only.
- `API_URL` comes from `PUBLIC_API_URL` at build time (also a turbo build `env` key). When it is empty, the request fails, or the answer does not match the schema, the island uses `SAMPLE_STATS` (marked in the code).
- Counters show only with live data. With sample data they show in `astro dev` (`import.meta.env.DEV`) and not at all in a production build: no frame, no note.
- The timeline may use the sample handles in production; it is an illustration. With live data and a non-empty `recent`, it uses the live handles.
- The server stores no names or post texts. Each card pairs a handle with an invented post from `SLOP_POSTS` (display name, text, age, action counts).
- The server sends handles masked and without `@` (first and last three characters, or only the first one below 7 characters). `displayHandle` adds `@` and masks any value without "•••" by the same rule. Never show a full handle on the page.
- The page has no analytics. The stats request is its only request to another origin.

## Timeline

`components/x-timeline.tsx` draws a social timeline as it looks on the web: layout and colors only, never a logo, wordmark, or the network's name.

- Column: at most 600 px, one continuous surface, posts separated only by a 1 px bottom border, 1 px left and right borders. Its own colors, not the Lustre theme (`.x-timeline` in `global.css`): light `#ffffff` with `rgb(239,243,244)` borders, `#0f1419` text and `#536471` grey; dark `#000000`, `rgb(47,51,54)`, `#e7e9ea`, `#71767b`. System font stack, no Cinzel or Jost. Below 640 px the column runs to the screen edges.
- Post: padding 12 px 16 px, a 40 px avatar column and a 12 px gap. Avatars are abstract head-and-shoulders pictures on a gradient whose hue comes from the handle. Header in 15 px: bold name, an 18 px blue rosette badge, the masked handle and age in grey, a "more" icon on the right. Text 15/20 px, at most 3 lines. Action row 12 px below, at most 425 px, space between: reply, repost, like, views with 13 px counts, then bookmark and share. The icons are drawn in the component (outline, round caps), not in the Meandros style.
- Lustre layer: after share, the three extension buttons (pollice, tacita, aversio from `@lustre/icons/react`, 18 px, 34 px round hit area, idle `rgb(113,118,123)`). The Block hover color and the toast copy `src/apps/extension/src/entrypoints/x.content/style.css` and `lib/x/toast.ts` ("Blocked @handle", bronze "Undo"). Update both places together.
- Below 480 px views and bookmark are hidden, so the Lustre buttons fit in the row.
- The server stores no names or post texts. Each post pairs a masked handle with an invented post from `SLOP_POSTS` (name, text, age, counts).

## Animation rules

- Pure CSS and React. No canvas, no WebGL, no animation library.
- One cycle per post, 2.6 s (`PHASES`): the post slides in at the top (600 ms), a pause, the Block button gets its hover state, it is pressed (scale), the post collapses to height 0 while it fades, and the toast shows for about 1.5 s. Five posts stay below the newest one; the panel (30 rem high) clips the ones at the bottom.
- The timeline runs only while it is on screen and the tab is visible. With `prefers-reduced-motion: reduce` it is a static timeline with the Lustre buttons and no toast.
- The server render and the first client render are the static state, so the page is complete without JavaScript. `LiveStats` remounts the timeline with a new `key` when live data arrives.
- The timeline is `aria-hidden`; one visually hidden sentence describes it. Counters animate an `aria-hidden` number and expose the final number to screen readers.

## Visual check

After `build`, run `pnpm --filter @lustre/website preview` and take Playwright screenshots (Chromium from the extension's `playwright` devDependency) at 1280 px and 390 px, light and dark, plus a sequence of timeline frames (entering, Block hover, collapse, toast) and reduced motion. A production build without `PUBLIC_API_URL` shows no counters; check them with `pnpm dev:website`.
