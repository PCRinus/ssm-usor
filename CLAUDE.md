## Code comments

Default to no comment. The code says how; write a comment only for a why the code cannot carry: a constraint from outside the code, a trap, a rejected alternative, a security reason, a meaning the types cannot express. Never describe what the next lines do, what a named thing is, the steps of a test, or what changed. Before finishing a task, reread the comments you added and delete the ones that fail this. Full rule and examples: `docs/agents/comments.md`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `PCRinus/ssm-usor`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root, ADRs in `docs/architecture/`. See `docs/agents/domain.md`.
