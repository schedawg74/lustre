# Coding agent setup

`AGENTS.md` is the shared instruction entry point. `CLAUDE.md` points to it.
`.agents/memory/` holds repository knowledge. `.claude/memory` links to it.
These notes copy the model roles and review rules of the `safina` repository (`.agents/memory/agent-workflow.md` there). Keep both in step when the owner changes a role.

Keep local tool permissions and machine paths in ignored local settings. Do not commit session permission histories.
Husky runs `lint-staged` (Biome on staged files) before each commit. CI has its own configuration in `.github/workflows/ci.yml`.
Preserve the user's index state. An explicit request to commit or open a PR authorizes staging the task's changes, not unrelated work.

Lustre uses only Claude and Codex models.

## Model roles

Skills and prompts name a role, not a model. To move to a new model, change this table and the `model` and `effort` fields of the agents in `.claude/agents/`.
The owner picks the models. Follow an explicit model override for the current task. Otherwise use this table.

| Role | Model | Effort | Runs as |
| --- | --- | --- | --- |
| Implementer | Claude Opus 5.5 (`claude-opus-5-5`) | `high`; `xhigh` for complex changes | Native Claude subagent `opus-high` or `opus-xhigh`, else [delegation](#delegation) |
| Fixer | Claude Opus 5.5 (`claude-opus-5-5`) | `high` | Native Claude subagent `opus-high`, else [delegation](#delegation) |
| Triager | Claude Opus 5.5 (`claude-opus-5-5`) | `high` | The parent session when it runs this model, else [delegation](#delegation) |
| Code reviewer | Claude Opus 5.5 (`claude-opus-5-5`) | `high` | Native Claude subagent `opus-high` with a read-only prompt, else [delegation](#delegation) |
| Deep reviewer (Codex) | Codex Sol 6.1 (`gpt-6.1-sol`); Codex Astra (`gpt-6-astra`) only for a complex or critical review | `high`. Never `xhigh` or above for Codex. | [Delegation](#delegation) with a read-only prompt |
| Deep reviewer (Claude) | Claude Opus 5.5 (`claude-opus-5-5`) | `xhigh` | Native Claude subagent `opus-xhigh` with a read-only prompt, else [delegation](#delegation) |

- The Implementer and the Fixer write all code. Reviewers do not edit files.
- The Code reviewer handles routine code reviews at light and standard depths.
- Both Deep reviewers review code, plans, and architecture as equal peers at deep depth. The Claude Deep reviewer also handles plan sparring.
- Sol 6.1 at `high` is the default Codex reviewer and is sufficient for most reviews. Use Astra at `high` only for a complex or critical review (cross-package, money, auth, concurrency, data migration). Never run a Codex model at `xhigh`, `max`, or `ultra` (owner decision, 2026-11-06).
- Codex reviews and spars. Use it for implementation or fixes only when the owner explicitly overrides the role for the task.
- Claude Fable 5.1 (`claude-fable-5-1`) is not the default model for any role, review depth, or plan sparring. Use it only when the owner names it for the current task. It then reviews read-only at `high`, unless the owner gives a different effort.
- Do not use Haiku. Raise effort before you change the model.
- When a role's model is not available, stop and ask the owner. Do not pick a substitute model.
- A Codex session that needs a Claude role uses cross-provider delegation when available.

## Review limits

Default to one review, verified triage, scoped fixes, and affected tests. A second review is optional and final. Do not run it merely because fixes exist or the first review found a P1. Keep the review record in the PR so new sessions and CI wakes retain the same budget. Plan sparring also defaults to one pass, with at most one justified final pass.

Defer low-impact cleanup and speculative edge cases. Do not turn them into automatic fix tasks. Batch accepted findings and give each agent only the relevant diff, evidence, decisions, and test results. Avoid repeated full-repository reads or full transcript copies.

## Delegation

1. Check the native subagent tools and the T3 `orchestrator_capabilities` catalog. Select the exact provider, model ID, and effort option for the role.
2. Prefer a native subagent for work on the same provider when its tool supports the chosen model and effort. Otherwise use T3 `delegate_task`. This includes cross-provider work and models absent from the native tool.
3. Give each task the worktree, commit or plan, full brief, scope, relevant context, and output format. T3 does not copy the parent conversation. Reviewers must have a read-only scope.
4. Use `mode: async` for long tasks. Record the returned `taskId`. Completion sends a notification to the parent. Continue independent work, then end the turn when only the result is pending. Do not add polling or a watcher. Use `task_status` only when the result is needed during a turn.
5. Set a finite review deadline, normally 30 minutes. A `mode: wait` timeout only ends the parent's wait; it does not stop the child. If the deadline has passed when control returns, inspect the task once and cancel it through the available task cancellation tool if it is still active. Report an incomplete review. Do not start a duplicate while the old task runs.
6. Check the review budget before any launch. Start a fresh task only for a permitted review round. Supply the original brief, current commit or plan, prior findings, responses, and unresolved objections. Give each round a new `clientRequestId`, stable across retries of that round. Keep its `taskId`. Do not use the backing `childThreadId` with `t3_thread_send` to start another round.

## Local execution fallback

Use the host CLI only when native and T3 delegation are unavailable for the selected model. Keep the active harness permissions. A CLI fallback does not authorize a sandbox bypass.

### Claude review on the code host

Use the authenticated host CLI with the model and effort from the selected reviewer role: Code reviewer for light or standard reviews, or Deep reviewer (Claude) for deep reviews or plan sparring.

```bash
claude -p --model <role-model-id> --effort <role-effort> \
  --tools Read,Glob,Grep --permission-mode dontAsk \
  --add-dir /tmp/<unique-task>/round-<n>/attempt-<id> --no-session-persistence \
  < /tmp/<unique-task>/round-<n>/attempt-<id>/review-prompt.md > /tmp/<unique-task>/round-<n>/attempt-<id>/claude-result.md
```

Copy the exact model ID and effort from the role table; do not use a model alias. Do not use `--bare` with the stored Claude login. That mode can report `Not logged in` even when `claude auth status` confirms an active subscription. Check authentication and the local model catalog before reporting that Claude is unavailable. Keep review prompts and results outside the repository. If the reviewer must read other files outside the worktree, add their directory with `--add-dir`; stdin access does not grant file access. For a prompt passed as an argument, close stdin with `</dev/null`.

### Codex review on the code host

Use the model and effort from the Deep reviewer (Codex) role:

```bash
codex exec -m <role-model-id> -c model_reasoning_effort="<role-effort>" \
  -C <worktree> --ephemeral \
  -o /tmp/<unique-task>/round-<n>/attempt-<id>/codex-result.md - < /tmp/<unique-task>/round-<n>/attempt-<id>/review-prompt.md
```

Use `high`. Do not use `xhigh` or above for Codex, also not at deep depth. Keep the read-only scope in the prompt. If the sandbox fails, report the launch error and use an available authorized runtime. Codex has web search, so give vendor-documentation checks to the Codex Deep reviewer.

### Long review runs

A deep review can take 15 minutes or more. Use native or T3 completion notifications first. For the CLI fallback, bound both execution and waiting:

1. Use a unique task directory, a round directory, and a fresh attempt directory for every launch. Never reuse result files or completion markers from an earlier attempt. Write the CLI command into `/tmp/<unique-task>/round-<n>/attempt-<id>/review-<reviewer>.sh`. Save stdout and stderr in that directory. Include the materialized diff path in the prompt. For Claude, grant the directory with `--add-dir`.
2. Write `/tmp/<unique-task>/round-<n>/attempt-<id>/run-<reviewer>.sh` with this body, after replacing the placeholders. Do not add `set -e`; the exit marker must also be written on failure:

   ```bash
   timeout --signal=TERM --kill-after=30s 1800s bash /tmp/<unique-task>/round-<n>/attempt-<id>/review-<reviewer>.sh
   review_status=$?
   printf 'EXIT=%s\n' "$review_status" >> /tmp/<unique-task>/round-<n>/attempt-<id>/<reviewer>.err
   exit "$review_status"
   ```

3. If the harness permits detached processes, start the script with `setsid nohup bash /tmp/<unique-task>/round-<n>/attempt-<id>/run-<reviewer>.sh > /tmp/<unique-task>/round-<n>/attempt-<id>/<reviewer>.launch.log 2>&1 </dev/null &`. Save the PID. The explicit `bash` does not need an executable script. Keep the launch log; it contains errors that occur before an exit marker can be written. Otherwise use the harness background-task tool.
4. Wait through the background-task tool with a finite deadline. If only a shell wait is available, run one bounded command: `timeout 1860s bash -c 'until grep -q "^EXIT=" /tmp/<unique-task>/round-<n>/attempt-<id>/<reviewer>.err; do sleep 15; done'`. Do not poll in model turns.
5. Read the exit marker and all logs. On timeout or a missing marker, stop any remaining task process and report the failure. Do not treat a partial result as a completed review.

The local Codex CLI default comes from `~/.codex/config.toml`. Pass `-m` with the role's model.
State the read-only or write scope in delegated prompts and close stdin when no prompt input is expected.
These are local execution constraints, not permission to exceed the user's task or the active harness rules.
