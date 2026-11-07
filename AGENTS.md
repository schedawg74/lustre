# Repository instructions

Lustre is a personal browser extension. It removes unwanted content from X, and later from YouTube, for one owner. See [architecture](.agents/memory/architecture.md) for the stack.

## Start here

- Read complete files before you change them. Avoid in-file searches.
- Never use emojis: not in code, UI copy, docs, commit messages, PR or issue text, or replies. Strip them from third-party text before it is shown in Lustre's UI.
- Report to the user in ASD-STE100 Simplified Technical English. Use short, active sentences. Keep technical names exact. This rule does not apply to product copy.
- Read [the memory index](.agents/memory/README.md), then load the files needed for the task. Source code, manifests, and tests define current behavior.
- Use [README.md](README.md) for local setup and commands. Use [docs/plans](docs/plans/roadmap.md) for planned work.
- Preserve the user's staged and unstaged changes. Use Conventional Commits. Push task branches to their own remote branch.

## Implementation rules

- Build the smallest complete solution. Keep concerns separate. Use existing dependencies and check their types and documentation. Remove obsolete paths. Do not add compatibility layers, speculative abstractions, or temporary implementations.
- Keep the layers of [architecture](.agents/memory/architecture.md#boundaries): packages under `src/packages/` use no extension or DOM APIs; `src/apps/extension/src/lib/<site>/` holds the code for one site; entry points only connect them.
- The background worker owns every write to the block queue, the runner state, and the import request. Content scripts and the popup send messages (`src/lib/messages.ts`). They do not write those storage items.
- Clear an optional stored field with `null`, not `undefined`: runtime messages drop keys whose value is `undefined`.
- Keep site selectors and menu texts in one place per site, and update [the platform note](.agents/memory/x-platform.md) when they change.
- Call only the site's own web endpoints, from a tab of that site, with the user's session. Never call them faster than the configured delay. Never send the session cookie, CSRF token, or bearer to any other origin.

## Code and UI

- Annotate types. Do not use `any`, TypeScript enums, non-null assertions, `console`, `debugger`, or `var`.
- Use type-only imports and exports, arrow functions, `for...of`, and early returns. Avoid nested ternaries and unnecessary comments or docstrings.
- Do not add wrappers that only forward a value, await a call, or read a property.
- Build page DOM with `createElement` and `createElementNS`, never `innerHTML`: x.com enforces Trusted Types. Prefix every injected class name with `lustre-`.
- Call hooks at the top level. Give iterators stable keys. Calculate derived state during render; use `useMemo` for expensive work. Do not derive state in `useEffect`.
- No data leaves the browser. There is no server and no analytics. A future AI feature sends only the content it must score, and only to the provider the owner configured. See [conventions](.agents/memory/conventions.md).

## Checks

Run checks for the affected behavior. See [testing](.agents/memory/testing.md).
`pnpm lint` checks without fixes; `pnpm format` changes files. Do not mix unrelated formatting into a task.
Follow [agent workflow preferences](.agents/memory/agent-workflow.md). Pick models by the roles in [model roles](.agents/memory/agent-workflow.md#model-roles). Only the Implementer and the Fixer write code.

Keep durable decisions and source links in `.agents/memory/`. Keep task status in the PR or issue.
Do not commit generated plans or review transcripts.

Review once, then verify and fix accepted findings. A second review is optional and final.
