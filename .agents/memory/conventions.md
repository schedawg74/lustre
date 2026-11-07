# Conventions

## Privacy

- Lustre has no server, analytics, or error reporting. Do not add any.
- Session data (cookies, `ct0`, bearer) stays in the x.com tab. Never store it in extension storage and never send it to another origin.
- Stored data is limited to settings, the block queue (user id, handle, display name, status), tracked lists, and runner state.
- A future AI feature sends only the items it must score (titles, channel names, the owner's interest prompt) to the provider the owner configured, and stores the provider credential only in `storage.local`.

## Injected UI on a site

- Prefix every class name with `lustre-`.
- Icons come from `@lustre/icons` (Meandros style: straight lines on a 24-unit grid, square caps, miter joins; a test enforces it). Use `@lustre/icons/react` in React, `@lustre/icons/dom` on x.com (no innerHTML), `@lustre/icons/svg` for static HTML. Each icon carries its Latin or Greek meaning. The toolbar icon is `brand/icon.svg` and `brand/icon-small.svg` (16 and 32 px, edges on the pixel grid), rendered with `pnpm --filter @lustre/extension icons`.
- Styles live in `entrypoints/x.content/style.css`.
- Match the site's look: x.com's grey `rgb(113, 118, 123)` for idle icons; on hover terracotta for block, ochre for mute, Aegean blue for not interested.
- Every button has a `title`, an `aria-label` with the target handle, and a visible focus outline.
- Stop the click from reaching the post (`preventDefault` and `stopPropagation`): the post is a link.
- Show results in one toast (`lib/x/toast.ts`). Offer Undo when the site has an inverse call.

## Theme

- The theme is modern Greek architecture: marble and travertine surfaces, ink text, gilded bronze as the only accent, and temple pigments as signal colors (terracotta = danger/block, ochre = warn/mute, Aegean = info/not interested, olive = success). Dark mode is basalt with marble text.
- Tokens live in `src/tooling/tailwind/theme.css` (`@lustre/tailwind-config`). Components use the semantic colors (`bg-canvas`, `bg-surface`, `border-line`, `border-control`, `text-text`, `text-muted`, `text-accent`, `text-danger`, ...), never raw hex values or palette steps. `line` is decoration only; edges of fields and controls use `control` (at least 3:1). Text colors reach 4.5:1 on canvas in both modes; check new pairs before you add them.
- Fonts: Cinzel (`font-display`, uppercase with wide tracking: wordmark, section titles, numbers) and Jost (`font-sans`, body and controls). Both are bundled from `@fontsource-variable`; never load fonts from a CDN.
- Shapes are cut stone: `rounded-stone` (3 px), not pills. Section titles use the `inscription` utility and a Roman numeral in bronze. Motifs: `fluted` (column flutes) and `meander` (Greek key band). Use them sparingly, once per surface.

## Popup

- Tailwind CSS 4 through `@tailwindcss/vite`. Shared building blocks are in `entrypoints/popup/ui.tsx` (`Section`, `Button`, `Toggle`, `Stat`, `Notice`, `Hint`, `fieldClass`). Width 380 px.
- It follows the system light or dark setting through the theme's `prefers-color-scheme` override.
- Settings take effect at once through storage watchers; there is no Save button.
- New settings get a default in `DEFAULT_SETTINGS`.

## Styles on x.com

- `entrypoints/x.content/style.css` is plain CSS, not Tailwind: Tailwind's base styles would change x.com's own elements. It copies the theme's color values and uses system fonts, because x.com does not load the bundled fonts.
- Post buttons keep x.com's grey idle color and take the theme's pigments on hover.
- The toast is ink in both modes; the import panel follows `prefers-color-scheme`.

## Site text

- Menu entries are matched by text in `MENU_ENTRIES` (`lib/x/menu.ts`). Keep English and German; add a language when the owner uses it.
- Prefer an entry that contains `@` when two entries match (for example "Mute @user" and "Mute this conversation").

## Naming

- Package scope `@lustre/`. Storage keys in lower camel case. Message types as `<area>/<action>`.
