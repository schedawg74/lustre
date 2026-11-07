# Conventions

## Privacy

- Lustre has no server, analytics, or error reporting. Do not add any.
- Session data (cookies, `ct0`, bearer) stays in the x.com tab. Never store it in extension storage and never send it to another origin.
- Stored data is limited to settings, the block queue (user id, handle, display name, status), tracked lists, and runner state.
- A future AI feature sends only the items it must score (titles, channel names, the owner's interest prompt) to the provider the owner configured, and stores the provider credential only in `storage.local`.

## Injected UI on a site

- Prefix every class name with `lustre-`. Styles live in `entrypoints/x.content/style.css`.
- Match the site's look: x.com's grey `rgb(113, 118, 123)` for idle icons, red for block, yellow for mute, blue for not interested.
- Every button has a `title`, an `aria-label` with the target handle, and a visible focus outline.
- Stop the click from reaching the post (`preventDefault` and `stopPropagation`): the post is a link.
- Show results in one toast (`lib/x/toast.ts`). Offer Undo when the site has an inverse call.

## Popup

- Plain CSS with tokens on `:root` and a `prefers-color-scheme: dark` override. Width 380 px.
- Settings take effect at once through storage watchers; there is no Save button.
- New settings get a default in `DEFAULT_SETTINGS`.

## Site text

- Menu entries are matched by text in `MENU_ENTRIES` (`lib/x/menu.ts`). Keep English and German; add a language when the owner uses it.
- Prefer an entry that contains `@` when two entries match (for example "Mute @user" and "Mute this conversation").

## Naming

- Package scope `@lustre/`. Storage keys in lower camel case. Message types as `<area>/<action>`.
