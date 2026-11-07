# Repository memory

Read the entry for the affected area. Paths inside each note point to the source of current behavior.
The notes describe repository state on 2026-11-07 (v0.1, X only).

| Task | Read |
| --- | --- |
| Find packages, contexts, and data flow | [Architecture](architecture.md) |
| Change manifest, content scripts, storage, or browser support | [Extension runtime](extension-runtime.md) |
| Change anything that calls x.com or reads its DOM | [X platform](x-platform.md) |
| Change UI, injected styles, privacy, or naming | [Conventions](conventions.md) |
| Select and run tests | [Testing](testing.md) |
| Change the landing page | [Website](website.md) |
| Select models or configure coding agents | [Agent workflow](agent-workflow.md) |

Planned work stays in [docs/plans](../../docs/plans/roadmap.md) and GitHub issues.

Update the owning note when behavior changes. Keep the current decision, its reason, source paths, and relevant commit or issue.
Remove superseded statements. Do not append task logs, copied code, or unverified backlog items.
Use Git history for old implementation details and issues for work status.
