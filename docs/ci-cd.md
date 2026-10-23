# CI and selective deployment

`.github/workflows/pull-request.yml` is what a pull request has to pass, and deploys nothing.
`.github/workflows/deploy-environment.yml` deploys one environment, `non-prod` or `production`
([ADR 025](architecture/adr-025-non-production-environment.md)): change selection, validation,
the build and every deployment job, with the GitHub environment, the wrangler environment and
the concurrency groups taken from its `environment` input. Two workflows call it.
`.github/workflows/deploy-non-prod.yml` (**Deploy non-prod**) deploys non-prod on every push to
`main` and when started by hand. `.github/workflows/deploy-production.yml` (**Deploy
production**) deploys production when started by hand from `main` (see [Releases](#releases)). The checks the pull request
and the deployment both run live once, in the composite action `.github/actions/validate`, so
they cannot drift apart.

**Minutes decide the shape.** GitHub bills every job rounded up to a whole minute, against a
monthly allowance, so a six-second job costs a minute and five one-minute builds cost up to
ten. Hence: few jobs, the slow starts inside a job overlapped instead of queued, nothing run
that has nothing to do, and no run that a newer run makes pointless. A composite action
shares steps inside one job. The reusable workflow adds no job of its own: its jobs are the
calling run's; only production pays one more, the job that chooses the release.
A separate manual **Seed database** workflow seeds an environment's project on demand; see the
[application deployment guide](app-deployment.md#seed-the-hosted-project).
The daily legislation check is not a workflow: it is the cron trigger of the
`ssm-usor-legislation` Worker (`apps/legislation`), deployed like the mail Worker; non-prod's
copy runs half an hour after production's. A scheduled Action ran it at first and was dropped, because GitHub's scheduler delays
and skips runs where Cloudflare's fires on time.

## Change selection

`dorny/paths-filter` reads `.github/filters.yml`. For PRs it uses GitHub's changed-file list.
A deployment compares its commit with the last commit deployed to the same environment, so
everything since the last complete deployment there is in the comparison: non-prod with the
commit of the last run of `deploy-non-prod.yml` on `main` that succeeded (or, without one, the
push before), production with the release the last successful run of `deploy-production.yml`
deployed (or, without one, everything). A run started by hand skips the comparison and selects
everything (see below). The workflow itself is not path-filtered, so **Validate repository** remains
available as a required PR check, including on documentation-only changes.

| Changed files                                                                                                                             | Build/deployment targets                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/marketing/**`                                                                                                                       | Marketing                                            |
| `apps/app/**`                                                                                                                             | SPA                                                  |
| `apps/portal/**`                                                                                                                          | Portal                                               |
| `packages/api-http/**`                                                                                                                    | SPA and portal                                       |
| `apps/api/**` (except the shared contract below)                                                                                          | API                                                  |
| `apps/mail/**`                                                                                                                            | Mail Worker                                          |
| `apps/sms/**`                                                                                                                             | SMS Worker ([guide](sms.md))                         |
| `apps/pdf/**`, `packages/contracts/src/pdf.ts`                                                                                            | PDF Worker and its container image ([guide](pdf.md)) |
| `apps/legislation/**`, `packages/legislation/**`, `packages/document-engine/**`                                                           | Legislation Worker                                   |
| `packages/ui/**`, `packages/design-tokens/**`                                                                                             | SPA, portal and marketing                            |
| `packages/contracts/**`                                                                                                                   | API, SPA, portal, mail and SMS Workers               |
| `apps/api/openapi.json`                                                                                                                   | API and SPA                                          |
| `orval.config.ts`                                                                                                                         | SPA                                                  |
| `supabase/config.toml`, `supabase/migrations/**`, workflow/action/filter files                                                            | Database (hosted migrations and configuration)       |
| Root package/lockfile/workspace configuration, Node version, shared TypeScript/Turbo configuration, patches, workflow/action/filter files | All of them                                          |
| Root documentation, lint/format configuration, other files not matched by the filters                                                     | No deployment; validation still runs                 |

Rules are intentionally conservative: an application-local test or configuration change also
selects that application. A lockfile change selects all of them; we do not maintain custom
lockfile dependency analysis. Add shared build inputs to both the filters and Turbo's cache
inputs when introducing them. Generated API files must still be committed and pass
`pnpm check:generated`.

## Validation, builds, and artifacts

Generated-code checks, lint, type checks, and unit/integration tests run repository-wide once
per revision, in one job. When the database or API is selected, validation also starts a local
Supabase database in Docker, applies every migration from scratch, runs the pgTAP policy tests,
and fails if `apps/api/src/database.types.ts` no longer matches the schema. The stack starts
in the background at the top of the job and is collected before the database tests, so its
minute and a half of pulling and booting overlaps with the other checks. On PRs, selected
applications are also built and packaged with Wrangler's dry run, without access to any
environment or publishing, once for each environment in `wrangler.jsonc` (production at the
top level, then `non-prod`), so a mistake in either fails before the merge.

A pull request that touches no code (the `code` filter: applications, packages, Supabase,
root configuration, workflow files) only has its formatting and lint checked. In practice
that is documentation. In a deployment, validation runs only when something is selected to deploy.

In a deployment, one build job runs alongside validation and builds every selected
application with a single Turbo invocation, which keeps the builds off the critical path. Every deployment job needs both,
so nothing built is deployed unless validation also succeeds; a build for a commit that
fails validation is wasted work, not a risk. It builds with the environment's public
configuration, because the SPA, the portal and the marketing site carry it in their bundles: a
release builds again and never reuses non-prod's artifacts. The addresses come from the
environment's `API_URL`, `APP_URL`, `PORTAL_URL` and `MARKETING_URL` variables, and the build
fails when one is not an `https://` address, since the marketing site would otherwise fall back
to production's. The `VITE_*` and `PUBLIC_*` values and the commit SHA embedded in the frontend
footers are part of their Turbo build hashes, so one environment's cached build never serves
the other. Turbo builds workspace dependencies before the selected application; the
dry-run task depends on that build.

Each build uploads a `release-<application>-<environment>-<commit>` artifact, retained for seven
days. The artifact includes the Wrangler bundle and, for the frontends, the static `dist`
assets. Deployment jobs download their matching artifact. API, mail, PDF, legislation, and marketing upload the
already-bundled Worker with `--no-bundle`; SPA uploads the built static assets. No deployment
job runs lint, tests, application builds, or code generation again before publishing.

Every job that runs Wrangler gets `CLOUDFLARE_ENV` for the whole workflow: `non-prod`, or empty
for production, which is the top level of each `wrangler.jsonc`. It reaches every Wrangler
call, the `wrangler secret bulk` that `wrangler-action` runs before deploying included; a
`--env` flag in the action's `command` would not, and non-prod's secrets would land on
production's Worker. Deployed with `non-prod`, each Worker is named with a `-non-prod` suffix.

Database migrations deploy first when selected, from the environment's Supabase credentials. Mail, SMS and marketing deploy independently; the API waits for the mail and SMS
Workers when they are selected, because its service bindings need those Workers to exist. The mail deployment uploads
`RESEND_API_KEY` when the environment has it and warns when it does not; the SMS
deployment uploads the `TWILIO_ACCOUNT_SID` and `SMS_FROM` variables and the `TWILIO_AUTH_TOKEN` secret when all three are
there and warns when they are not. SPA-only changes skip API deployment. If API and
SPA both change, API deployment and its HTTP smoke tests must succeed before SPA deployment.
Before uploading, the API job looks up the `ssm-usor-regeneration` queue (`ssm-usor-regeneration-non-prod`
in non-prod) the Worker sends to
and consumes, and creates it when it is missing, because `wrangler deploy` refuses a binding to
a queue that does not exist; the deployment token needs **Queues → Edit** for that
([deployment guide](deployment.md#create-the-cloudflare-api-token)). The step can be repeated:
an existing queue is left as it is.
The legislation Worker deploys after the migrations, since its cron writes to a table they
create, with the environment's `VITE_SUPABASE_URL` as its `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
as a secret, beside `LEGISLATION_RELAY_CLIENT_ID` and `LEGISLATION_RELAY_CLIENT_SECRET`, the Access
service token of the relay it reads the portal through
([deployment guide](deployment.md#legislation-worker)). Unlike the API, it fails when any of
them is missing: without the first two the cron could not even record that it ran, and
without the token the relay turns away every act. `LEGISLATION_RUN_SECRET`, the bearer token of the
[run by hand](deployment.md#running-the-check-by-hand), is uploaded when the environment has it;
without it the job only leaves a notice, and `POST /run` answers `404`.

When `supabase/config.toml` or a migration changes, a last job applies the file to the
environment's project with `supabase config push`, after the API, because the Send Email hook it declares
must not point at an endpoint that is not deployed yet. Only properties the file declares are
written; `[remotes.production]` and `[remotes.non-prod]` hold the values that differ from the
local stack, and the CLI picks the block whose `project_id` is the project's. The push does not
ask for confirmation in CI, so the job prints `supabase config diff` first. It and the
migrations job refuse to run unless `SUPABASE_PROJECT_ID` is the `project_id` of the
`[remotes.<environment>]` block, so a project id set in the wrong GitHub environment cannot
reach the other environment's database. It needs
`SUPABASE_AUTH_HOOK_SECRET` and `SUPABASE_AUTH_SMS_HOOK_SECRET`, which the API deployment uploads
too, and so does the migrations job, whose `supabase link` reads the file. After the push it
sets through the Management API the three sign-in settings the file cannot hold: the texted
code's expiry, phone confirmation, which the CLI pushes inverted
([supabase/cli#6997](https://github.com/supabase/cli/issues/6997)), and the cap of 60 auth
emails an hour, which `config push` leaves unmanaged.

Selection compares with the last run that succeeded, so what a failed, cancelled or
superseded run carried is selected again by the next one, whatever that one touches. The database and configuration
deployments do nothing when there is nothing to apply, which is why workflow files select
them: the commit that fixes a broken workflow retries them. A job that waits for the API
treats a skipped API deployment as fine only when the API was not selected; selected and
skipped means something before it failed.
**Browser flow tests** run beside validation on pull requests only, when the SPA, the portal,
the API, or the database is selected: the SPA's flows unless only the portal is, then the
portal's (`apps/portal/e2e/flows`, a sign-in by code) unless only the SPA is. The two run one
after the other because both serve the API on the port the local stack's auth hooks call. They are not repeated after the merge: no deployment waits for them,
and the pull request has just run them. Their three slow starts, the Supabase containers, the
PDF converter's image and the browser, do not depend on one another, so the first two start in
the background and are collected where they are needed. They use a local Supabase stack, the API served by Node
with an in-memory mailer and SMS sender, and a preview build of the SPA or the portal, so they
can create users and "send" email and codes without touching production. No deployment waits for them.

Browser tests run in their own job, **Verify deployed SPA**, after the SPA deployment has
finished and been reported, and remain advisory. They run against the environment just
deployed with a real account of its own (`E2E_EMAIL`, `E2E_PASSWORD`), so they stay small; flows that create users or send email are tested against a
local stack on pull requests instead. The job caches the Chromium download by Playwright
version and installs only its system packages on a cache hit. API smoke-test failures block
an accompanying SPA release. The portal has the same pair of jobs, **Deploy portal** and
**Verify deployed portal**, with only signed-out smoke checks and no secrets; it waits for the
API like the SPA and never for the SPA. There is no check of the old live release before deployment.

## Releases

Actions → **Deploy production** → "Run workflow" on `main`, with the tag left empty, is a
release. The job **Choose the release** takes the newest commit on `main` that a run of
`deploy-non-prod.yml` succeeded for: production only receives what non-prod has run, and
because each non-prod run deploys whatever the runs before it left undeployed, that run's
success means non-prod held everything up to the commit. Commits merged after it are left for
the next release; the run's summary names the commit, its message, and how many newer commits
on `main` non-prod has not deployed yet. The tag is the date in Bucharest, `2026.10.23`, or
`2026.10.23.2` for a second release that day. A commit that already carries a release tag is
refused: there is nothing new to release, and deploying that release again is a run with its
tag.

The same job then assembles the release's **update**, what members read about it
([ADR 026](architecture/adr-026-updates-and-release-review.md)). It collects the pull requests
merged since the newest release in the commit's history, in merge order, takes the
`## Actualizări` block of each one's description (`CLAUDE.md` says what goes in it), and joins
them into one update with a headline drafted from its first item. A pull request whose block is
broken stops the run with its number and the line at fault: fix the description and run again.
The release body is the update, a horizontal rule, and GitHub's generated list of pull requests
for developers; with no block at all, it is the list alone and the release is **silent**. The
run's summary names the pull requests that contributed and those skipped, and shows the whole
body. The release is created as a **draft**: visible to the repository's writers only, with no
tag yet, so nothing a member or a rollback could see exists.

**Approve the update** then waits on the `release-approval` environment. GitHub notifies
Mircea; he reads the draft release, edits its body in GitHub's release editor where the wording
needs it, and approves under **Review deployments** on the run's page. **Publish the update**
reads the body again, checks its dialect, and fails the run before publishing anything if it is
broken, with each error's line; fix the draft's body and re-run the failed jobs, which reads it
again. Otherwise it publishes the
release, which creates the tag. **Record the update in non-prod** then writes the update to
non-prod's `releases` table, production is deployed with what changed since the release it runs,
and **Record the update in production** writes the same row to production's table once that
deployment has succeeded, so the table's migrations are there and members meet the update when
its release runs. Both write with the environment's `SUPABASE_SECRET_KEY`, by an upsert on the
tag; a silent release writes no row. The release is published with the run's own token, so it
starts no other workflow.

A rejection fails the run, and nothing is published or deployed; re-running its failed jobs
asks for the approval again. The draft stays until the next run, which deletes every draft named
like a release before creating its own from the pull requests, so edits made to a rejected draft
are lost with it. A second run
started while the first waits for approval does the same, so approving the first then fails
with its draft gone; approve the newer run instead.

The `release-approval` environment is configured by hand under Settings → Environments, with
Mircea as its required reviewer and self-review allowed, since he also starts the run. Its
protection is the whole gate: without a required reviewer, **Approve the update** runs at once
and the update is published unread. The `production` environment has no reviewers of its own,
so one approval covers the whole run.

A run started from any other branch or tag is refused before anything happens: a run uses the
workflow files of the ref it was started on, and production only runs `main`'s.

**Rolling back.** Run **Deploy production** with an earlier release's tag in `tag`. It creates
nothing and asks for no approval: it checks that the tag's commit is on `main` and that a run of
`deploy-non-prod.yml` succeeded for exactly that commit, then deploys everything of it to
production. Both record jobs rewrite the release's row from its published body; a body that no
longer parses fails its record job but never holds back the rollback. A release that failed
after publishing already has its tag, so a run without one refuses it; rerun its failed jobs,
or run with its tag. Migrations do not roll back: the database keeps the newer schema, so the
older code has to be compatible with it.

**A typo in a published update** is fixed on GitHub: edit the release's body, then run
**Deploy production** with its tag. That deploys the release again, everything of it, and
rewrites its row in both environments. The table is never edited by hand.

**A fix that cannot wait** is a merge to `main` and, once **Deploy non-prod** has run it, a
release. That release ships everything merged so far. If something merged and unreleased must
not reach production, revert it on `main` first.

Production's change selection compares with the release the last successful run of
`deploy-production.yml` deployed. A run's head commit cannot say which that was, since it is
`main` as it stood when the run was started, so the job that deploys carries the tag in its
name (`Production 2026.10.23 / …`) and the next release reads it from the run's jobs. Without
such a run, or when its tag is gone, everything is deployed.

The two workflows were renamed from `deploy.yml` and `release.yml` on 2026-10-23, and GitHub
keeps a workflow's runs under its file name, so neither finds an earlier run of its own. The
first push to deploy non-prod compares with the push before, the first release deploys
everything, and the first release needs a successful run of **Deploy non-prod**, which the
rename's own merge starts.

## Caching

`.github/actions/setup/action.yml` centralizes pnpm/Node setup and frozen-lockfile installation.
The existing pnpm dependency cache is retained. Validation and build jobs also use
`actions/cache` for `.turbo`, with a build scope per environment; deployment jobs need only the
dependency cache and artifacts.

Cache keys separate operating system, Node major, lockfile, job scope, run, and retry attempt.
Restore prefixes permit reuse from earlier runs and other build jobs with the same lockfile.
Turbo decides which restored task results are valid using its own input hashes. The root
TypeScript configuration and Node version file are global hash inputs. A missing or evicted
cache only costs execution time; deployment artifacts are required and cannot be substituted
with arbitrary cached files.

## Concurrency and recovery

Runs of a deployment do not queue behind one another any more. Every concurrency group
carries the environment's name, so non-prod and production never wait for or cancel each
other. Validation and the
build each have a concurrency group that a newer run cancels: a run still validating has
deployed nothing, and the newer run carries its changes. Every deployment job has a group of
its own that is never cancelled, so nothing is interrupted halfway, the same thing is never
deployed twice at once, and GitHub keeps at most one run waiting per job. Three merges in a
row cost about one run instead of three. A pull request's newer push cancels its older run.

The last commit deployed to non-prod is taken to be the head of the last run of
`deploy-non-prod.yml` on `main` that succeeded, read from the Actions API by the job "Select affected applications";
when there is none, or its commit is gone, the push before is used instead. Merging several pull requests in a row
leaves one run alive, and that run now selects what the others would have deployed. A run
that failed stays the concern of whoever merged: the next push retries what it carried, which
is safe because every deployment here can be repeated, and may not be what is wanted when
the failure was the change itself.

**Deploying everything by hand.** Actions → Deploy non-prod → "Run workflow" on `main` runs the whole
sequence for non-prod with every application, the migrations, the configuration and the
templates selected, whatever changed. It is for an environment that was wiped, a rotated
secret, or a deployment that failed halfway and is easier to repeat whole. On any other
branch it deploys nothing. Actions → Deploy production → "Run workflow" with a release's tag
does the same for production, after the same checks as a release.

Otherwise, resolve deployment failures explicitly:

1. Fix the underlying problem and rerun the failed deployment job while its artifact is
   available. Successful jobs need not be rerun.
2. Check that the original commit is still the intended release: GitHub reruns use the
   original SHA, and rerunning an older deployment can overwrite a newer release.
3. If the artifact expired, rerun the whole workflow only when that commit is still intended;
   otherwise push a fix affecting the application so CI builds and deploys the current revision.
4. To roll back, use a known-good Worker version in Cloudflare. Keep API/SPA compatibility
   in mind when rolling back either independently.

GitHub processes queued runs by when they enter the queue, not by Git ancestry. Avoid
replaying old runs after newer releases. A later push does pick up what a failed or cancelled
run carried; check that it succeeded rather than assume it.
