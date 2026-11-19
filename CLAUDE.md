## Code comments

Default to no comment. The code says how; write a comment only for a why the code cannot carry: a constraint from outside the code, a trap, a rejected alternative, a security reason, a meaning the types cannot express. Never describe what the next lines do, what a named thing is, the steps of a test, or what changed. Before finishing a task, reread the comments you added and delete the ones that fail this. Full rule and examples: `docs/agents/comments.md`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `PCRinus/ssm-usor`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root, ADRs in `docs/architecture/`. See `docs/agents/domain.md`.

### Library skills

TanStack Router and Table ship skills inside their packages, matching the installed version; their v9 Table and current Router APIs differ from what most training data shows. The repository's own TanStack Intent lists and loads them, as the skill loading block in `AGENTS.md` describes. Load the matching one before changing routes, search params, loaders or tables:

@AGENTS.md

## Building with several agents

Before handing a feature of more than one pull request to builder agents, write down which parts depend on which, and start every part whose inputs exist at once, each agent in its own git worktree. Server and screens that meet at an API contract are not a reason to wait: write the contract (`packages/contracts` and the generated client) first, then build both sides side by side against it. Parts stay in sequence only where one truly needs the other's code. The parallel parts share one local Supabase: one agent at a time writes and applies migrations, and only after the busy sessions on this repository agree; nobody resets it. Generated files (`apps/api/src/database.types.ts`, the generated API client, help topics) are regenerated on each branch when the stack is put together, not merged by hand.

## Pull requests

A pull request that changes what people see carries screenshots of the changed elements in its description, under Evidence: before and after where there is a before, at phone width and at desktop width when the change reaches both. Take them on the branch's own code, with real-looking data. Host them on the orphan branch `pr-screenshots`, in a folder named after the feature branch (`git worktree add /tmp/pr-screenshots pr-screenshots`, copy the PNGs into `<branch-name>/`, commit, push), and link them with `https://raw.githubusercontent.com/PCRinus/ssm-usor/pr-screenshots/<branch-name>/<file>.png`. Never commit screenshots to a feature branch or to `main`.

A pull request that changes what members see carries its lines for the release's update under a heading `## Actualizări`, in Romanian, written for the specialist who uses the app: what they can now do, or what no longer goes wrong. New features go under `## Ce e nou`, each a `### Title` with a paragraph, an optional `Unde o găsești: …` line and an optional `Pictogramă: <lucide icon name>` line; improvements and fixes are `- ` items under `## Îmbunătățiri` and `## Remedieri`. The block ends at the next other `##` heading, such as `## Evidence`, and holds no `#` headline or lead, which belong to the release. Never say how it was built, and name no files, endpoints, tables or libraries. Name a button or icon in words, never by a bare symbol: "semnul întrebării de lângă câmp", not "butonul ?". In a stack, only the pull request that completes the feature carries the block; internal pull requests (dependencies, CI, docs, refactors) carry none. Deploy production assembles the blocks into the release's update, which Mircea reviews before it is published, and a broken block stops the release. The dialect is in ADR 026 (`docs/architecture/adr-026-updates-and-release-review.md`).

Merge only on a green run, and never with `gh pr merge --auto`: `main` has no required checks, so it merges at once without waiting for CI. When `main` has moved since that run, rebase and wait for CI again only if `main` gained something the pull request overlaps: migrations, generated files, the root `package.json` or lockfile, workflows, or the same files or package. Otherwise merge right away; the deployment validates and tests the merged commit before it deploys.

## Trying a change on non-prod

Screenshots and sample imports run against non-prod, never production. A local `pnpm dev` API reads `apps/api/.dev.vars`, which points at the non-prod Supabase project; writing recognisably named test data there is fine, and the data is removed afterwards. Sign in as the end-to-end account `e2e@non-prod.ssmusor.ro` (`E2E_EMAIL` in the GitHub `non-prod` environment), which has no second factor: the password form needs a Turnstile token and personal accounts stop at the authenticator code. Make its session with the Auth Admin API, as the deployed browser check does: `POST /auth/v1/admin/generate_link` with `{ type: 'magiclink', email }` and the non-prod secret key, then `POST /auth/v1/verify` with the returned `hashed_token` and the publishable key, and give the browser the session through `localStorage` key `sb-<project ref>-auth-token` (Playwright `context.addInitScript`). The non-prod API accepts browser origins on ports 5173 and 5174 only, and `api.non-prod.ssmusor.ro` refuses a script's default User-Agent with Cloudflare error 1010, so send a curl-like one. Never print the keys or the session, and never use the production secret key without Mircea's word for that run.

## Help articles

A pull request that changes a behaviour a help article describes (`apps/help/src/content/docs`) updates the article in the same pull request. An article's front matter lists the topics the app links to (`topics`: an `area.slug` id and the heading it sits under) and the ADRs and code paths it describes (`sources`, each matching a tracked file); neither is ever rendered. A heading a topic names is an ATX heading (`## …`), unique in its article. After changing topics or headings, run `pnpm generate:help-topics` and commit `packages/help-topics/src/topics.ts`; CI fails on a stale one and warns when a source changes without its article. Articles are written in Romanian for the specialist, name no files, endpoints, tables or libraries, and name the act and article behind a legal rule, which the pull request lists for Mircea to check. The design is in ADR 028 (`docs/architecture/adr-028-help-site.md`).
