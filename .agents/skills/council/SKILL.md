---
name: council
description: Trigger this if the user says 'council' (not 'marketing council', which is a different skill).
---

# Council

Adapted from Theo's council skill (github.com/t3dotgg/tstack, skills/council) for two providers.

Before an audit, address outstanding PR comments, fix known issues, and run
relevant checks. Give council the updated implementation; do not defer known
fixes until reviews return. If the user wants to discard the implementation
and explore new ideas, skip fixes to code being replaced.

Bring in two delegates to help with the user's request, usually for review
or feedback. Use one strong model from each of the two providers available
here, Claude and OpenAI, at high reasoning effort. If the user's instructions
name council members, use those. Otherwise pick the latest flagship model from
each provider, for example Claude Opus and GPT Sol.

In T3 Code, use `orchestrator_capabilities` to resolve the models, then
`delegate_task` to start one delegate per model in parallel. Elsewhere, use
the harness's subagent tools. If you cannot reach both providers, or a named
member is unavailable, report it instead of substituting.

Give each delegate the request and relevant context. For review or feedback,
keep their work read-only. Give both the same brief, and do not pass one
delegate's findings to the other within a round. Collect their responses and
summarize the useful findings, disagreements, and recommended next steps.

With two members a disagreement has no majority to settle it. Do not split
the difference: check the code, docs or tests behind each position, say which
side you take and why, and name the point the user should decide if the
evidence does not settle it.

For a code review, ask each delegate for a score out of 10.
Count each full review pass as one round.
A fresh review after fixes starts a new round.

If the work ends in a pull request, put the results in the PR description.
Put this section before the model and harness line at the end:

```markdown
## Council review

Rounds: 2

| Delegate    | Round 1 | Round 2 |
| ----------- | ------- | ------- |
| Claude Opus | 7/10    | 9/10    |
| GPT Sol     | 8/10    | 10/10   |
```

If a delegate gives no score, write `no score`. Do not invent one.
If the PR is open, edit the description. Do not post a comment for this.
If there is no PR, put the same results in the final reply only.

The council does not replace the Copilot review this repository asks for on
every pull request; both run, and Copilot's threads are still closed as
CLAUDE.md describes.

If you agree with their recommendations, make the changes and request a fresh
review after. Continue this process until both delegates are satisfied with
the outcome.

Do not let repeated reviews result in scope creep. It is your job to fight to
keep scope limited.
