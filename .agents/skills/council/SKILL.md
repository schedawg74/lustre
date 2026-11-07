---
name: council
description: Trigger this if the user says 'council'. Gets a review from one Claude and one Codex delegate and loops until both agree, inside a round budget.
---

# Council

For UI work, give both members screenshots of every affected surface in light
and dark mode, and the source files. Before an audit, address outstanding PR comments, fix known issues, and run
relevant checks. Give council the updated implementation or plan; do not defer
known fixes until reviews return. If the user wants to discard the
implementation and explore new ideas, skip fixes to code being replaced.

## Members

Lustre uses only Claude and Codex. The council has two members, one from
each provider, taken from the [model roles](../../memory/agent-workflow.md#model-roles):

| Member | Role | Effort |
| --- | --- | --- |
| Claude | Deep reviewer (Claude) | `xhigh` |
| Codex | Deep reviewer (Codex): Sol 6.1 (`gpt-6.1-sol`), or Astra (`gpt-6-astra`) for a complex plan or change | `high`, never `xhigh` |

If the user names other council members for this request, use those. Do not
add a model from another provider. If one member is unavailable, report it.
Do not substitute a model.

Start both members in parallel through [delegation](../../memory/agent-workflow.md#delegation):
a native Claude subagent (`opus-xhigh`) or T3 `delegate_task` for Claude, and
T3 `delegate_task` (or the Codex CLI on the code host) for Codex. Members do
not start subagents or further reviews.

## Brief

Give each member the same request, the plan or diff, and the relevant
context. Keep their work read-only. Ask for findings with a severity, evidence,
and a score out of 10.

Severity: `P0` data loss, a security hole, or a broken extension. `P1` wrong
behavior on a normal path. `P2` wrong behavior on an edge case with a concrete
trigger. `P3` maintainability, polish, or taste.

## Rounds

Count each full review pass as one round. A fresh review after fixes starts a
new round.

- Default budget: 3 rounds. Round 1 is full. Later rounds check only the
  changes and the open findings.
- Stop early when both members approve, or when a round returns only `P3`
  findings.
- After round 3, show each remaining dispute in 2 or 3 lines per side. The
  user decides.

An explicit "council" request is an owner instruction. It may open review
rounds beyond the normal one-review budget in `AGENTS.md` for this request
only.

## Triage and fixes

Triage each finding yourself, as the Triager role in
[model roles](../../memory/agent-workflow.md#model-roles): confirm the trigger
and the impact in the code, the plan, or a screenshot. Member agreement is not
proof. Put each finding in one class: Fix (verified, inside scope), Defer
(low impact; list it as a follow-up), Owner decision (changes product scope or
needs a large refactor), or Reject (wrong, already handled, or a Biome style
rule).

If you agree with a recommendation, make the change and request a fresh round.
If you disagree, reply with evidence in the next brief.

Do not let repeated reviews cause scope creep. It is your job to keep scope
limited. Decline findings that the goal does not need, with a one-line reason,
and list them as follow-ups.

## Results

Report each round to the user as it finishes: the scores, the findings with
their class, and the changes made. For UI work, include screenshots.

If the work ends in a pull request, put the results in the PR description,
before the attribution line at the end:

```markdown
## Council review

Rounds: 2

| Member | Round 1 | Round 2 |
| --- | --- | --- |
| Claude (Deep reviewer) | 7/10 | 9/10 |
| Codex (Deep reviewer) | 8/10 | 10/10 |
```

If a member gives no score, write `no score`. Do not invent one. If the PR is
open, edit the description. Do not post a comment for this. For a plan in an
issue, put the same table in the issue comment that holds the updated plan. If
there is no PR or issue, put the results in the final reply only.
