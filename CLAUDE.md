## Code comments

Default to no comment. The code says how; write a comment only for a why the code cannot carry: a constraint from outside the code, a trap, a rejected alternative, a security reason, a meaning the types cannot express. Never describe what the next lines do, what a named thing is, the steps of a test, or what changed. Before finishing a task, reread the comments you added and delete the ones that fail this. Full rule and examples: `docs/agents/comments.md`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `PCRinus/ssm-usor`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root, ADRs in `docs/architecture/`. See `docs/agents/domain.md`.

## Pull requests

A pull request that changes what people see carries screenshots of the changed elements in its description, under Evidence: before and after where there is a before, at phone width and at desktop width when the change reaches both. Take them on the branch's own code, with real-looking data. Host them on the orphan branch `pr-screenshots`, in a folder named after the feature branch (`git worktree add /tmp/pr-screenshots pr-screenshots`, copy the PNGs into `<branch-name>/`, commit, push), and link them with `https://raw.githubusercontent.com/PCRinus/ssm-usor/pr-screenshots/<branch-name>/<file>.png`. Never commit screenshots to a feature branch or to `main`.

A pull request that changes what members see carries its lines for the release's update under a heading `## Actualizări`, in Romanian, written for the specialist who uses the app: what they can now do, or what no longer goes wrong. New features go under `## Ce e nou`, each a `### Title` with a paragraph, an optional `Unde o găsești: …` line and an optional `Pictogramă: <lucide icon name>` line; improvements and fixes are `- ` items under `## Îmbunătățiri` and `## Remedieri`. The block ends at the next other `##` heading, such as `## Evidence`, and holds no `#` headline or lead, which belong to the release. Never say how it was built, and name no files, endpoints, tables or libraries. In a stack, only the pull request that completes the feature carries the block; internal pull requests (dependencies, CI, docs, refactors) carry none. Deploy production assembles the blocks into the release's update, which Mircea reviews before it is published, and a broken block stops the release. The dialect is in ADR 026 (`docs/architecture/adr-026-updates-and-release-review.md`).

## Help articles

A pull request that changes a behaviour a help article describes (`apps/help/src/content/docs`) updates the article in the same pull request. An article's front matter lists the topics the app links to (`topics`: an `area.slug` id and the heading it sits under) and the ADRs and code paths it describes (`sources`, each matching a tracked file); neither is ever rendered. A heading a topic names is an ATX heading (`## …`), unique in its article. After changing topics or headings, run `pnpm generate:help-topics` and commit `packages/help-topics/src/topics.ts`; CI fails on a stale one and warns when a source changes without its article. Articles are written in Romanian for the specialist, name no files, endpoints, tables or libraries, and name the act and article behind a legal rule, which the pull request lists for Mircea to check. The design is in ADR 028 (`docs/architecture/adr-028-help-site.md`).
