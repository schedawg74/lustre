# Roadmap

## 1. X: blocking and quick actions (done in v0.1)

- Bulk-block the members of X lists, with a reviewable queue, rate-limit
  handling, and safety skips (accounts you follow, an allowlist).
- Block, Mute and Not interested buttons on every post.

Next steps on X:

- Auto-hide posts from accounts that are still in the queue, before they are
  blocked.
- Keyword and pattern rules ("10 AI tools that…" threads, engagement bait) that queue
  the author for review.
- Export and import the queue and allowlist as JSON.

## Shared blocklist (server built, not deployed)

The server, its database, and the Hetzner program exist (`src/apps/server`,
`src/packages/db`, `src/packages/api`, `src/packages/infra`). Open steps:

- Deploy: domain, Hetzner project, buckets, Tailscale keys, first `pulumi up`.
- Extension: an opt-in setting, a stored install token, and batched reports
  through `createLustreApi` from the background worker after each block or mute.
- Download: import the shared blocklist into the block queue, with a minimum
  reporter count.
- Payment gating for the download (planned: 1 USD).

## 2. YouTube: hide Shorts

A content script for `youtube.com` that removes the Shorts shelf
(`ytd-rich-shelf-renderer[is-shorts]`, `ytd-reel-shelf-renderer`), Shorts in
search and subscriptions, and the Shorts entry in the side menu. Optionally it
redirects `/shorts/<id>` to `/watch?v=<id>`. Each surface gets its own toggle.

## 3. YouTube: Not interested button

A button on every video tile (home, sidebar, search) that runs YouTube's
"Not interested" and "Don't recommend channel" menu entries, the same way the
X button uses the post's "⋯" menu.

## 4. YouTube: AI curator

Uses your own AI subscription (ChatGPT/Codex, Claude) to steer YouTube's
recommendations:

- Read the watch history (`/feed/history`) and the home feed.
- Score each home-feed video against your stated interests. Hide the ones that
  score low and send "Not interested" for them, so YouTube learns.
- **Quick modes:** one-click topics ("politics", "AI research", named
  creators). A mode filters the home feed to that topic and runs searches to
  seed new suggestions.

Open questions to settle before building it:

- How to use the subscription: a sign-in flow with the provider (OAuth) or a
  local bridge to an installed CLI (Codex CLI, Claude Code) through native
  messaging. API keys work as a fallback.
- Where the scoring runs: in the extension, or in a small local companion
  service under `src/apps/`.
- How many "Not interested" signals per day YouTube tolerates before it
  rate-limits or flags the account.
