# CI and selective deployment

One workflow, `.github/workflows/ci.yml`, validates pull requests and pushes to `main`.
Only pushes to `main` deploy. The old standalone/manual deployment workflows are removed.
A separate manual **Seed database** workflow seeds the hosted project on demand; see the
[application deployment guide](app-deployment.md#seed-the-hosted-project).

## Change selection

`dorny/paths-filter` reads `.github/filters.yml`. For PRs it uses GitHub's changed-file list;
for pushes it compares the pre-push commit with the pushed revision, including every commit
in that push. The workflow itself is not path-filtered, so **Validate repository** remains
available as a required PR check, including on documentation-only changes.

| Changed files                                                                                                                             | Build/deployment targets                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/marketing/**`                                                                                                                       | Marketing                                      |
| `apps/app/**`                                                                                                                             | SPA                                            |
| `apps/api/**` (except the shared contract below)                                                                                          | API                                            |
| `apps/mail/**`                                                                                                                            | Mail Worker                                    |
| `packages/ui/**`, `packages/design-tokens/**`                                                                                             | SPA and marketing                              |
| `packages/contracts/**`                                                                                                                   | API, SPA, and mail Worker                      |
| `apps/api/openapi.json`                                                                                                                   | API and SPA                                    |
| `orval.config.ts`                                                                                                                         | SPA                                            |
| `supabase/config.toml`, `supabase/migrations/**`, workflow/action/filter files                                                            | Database (hosted migrations and configuration) |
| Root package/lockfile/workspace configuration, Node version, shared TypeScript/Turbo configuration, patches, workflow/action/filter files | All four                                       |
| Root documentation, lint/format configuration, other files not matched by the filters                                                     | No deployment; validation still runs           |

Rules are intentionally conservative: an application-local test or configuration change also
selects that application. A lockfile change selects all four; we do not maintain custom
lockfile dependency analysis. Add shared build inputs to both the filters and Turbo's cache
inputs when introducing them. Generated API files must still be committed and pass
`pnpm check:generated`.

## Validation, builds, and artifacts

Generated-code checks, lint, type checks, and unit/integration tests run repository-wide once
per revision. When the database or API is selected, validation also starts a local Supabase
database in Docker, applies every migration from scratch, runs the pgTAP policy tests, and
fails if `apps/api/src/database.types.ts` no longer matches the schema. On PRs, selected applications are also built and packaged with Wrangler's dry
run, without production environment access or publishing.

On `main`, a production build matrix runs after validation, with one job per selected
application. It uses the existing `production` environment's public configuration. The SPA's
three `VITE_*` variables and the commit SHA embedded in both frontend footers are part of their
Turbo build hashes. Turbo builds workspace dependencies before the selected application; the
dry-run task depends on that build.

Each production build uploads a `release-<application>-<commit>` artifact, retained for seven
days. The artifact includes the Wrangler bundle and, for the frontends, the static `dist`
assets. Deployment jobs download their matching artifact. API, mail, and marketing upload the
already-bundled Worker with `--no-bundle`; SPA uploads the built static assets. No deployment
job runs lint, tests, application builds, or code generation again before publishing.

Database migrations deploy first when selected, from the `production` environment's Supabase
credentials. Mail and marketing deploy independently; the API waits for the mail Worker when
both are selected, because its service binding needs that Worker to exist. The mail deployment uploads
`RESEND_API_KEY` when the `production` environment has it and warns when it does not. SPA-only changes skip API deployment. If API and
SPA both change, API deployment and its HTTP smoke tests must succeed before SPA deployment.

When `supabase/config.toml` or a migration changes, a last job applies the file to the hosted
project with `supabase config push`, after the API, because the Send Email hook it declares
must not point at an endpoint that is not deployed yet. Only properties the file declares are
written; `[remotes.production]` holds the values that differ from the local stack. The push
does not ask for confirmation in CI, so the job prints `supabase config diff` first and
refuses to run when the file has no `[remotes]` block for the project. It needs
`SUPABASE_AUTH_HOOK_SECRET`, which the API deployment uploads too.

Selection compares a push with the commit before it, so a deployment that failed is not
retried by a later push that leaves its files alone. The database and configuration
deployments do nothing when there is nothing to apply, which is why workflow files select
them: the commit that fixes a broken workflow retries them. A job that waits for the API
treats a skipped API deployment as fine only when the API was not selected; selected and
skipped means something before it failed.
Browser tests run after SPA deployment and remain advisory; API smoke-test failures block
an accompanying SPA release. There is no check of the old live release before deployment.

## Caching

`.github/actions/setup/action.yml` centralizes pnpm/Node setup and frozen-lockfile installation.
The existing pnpm dependency cache is retained. Validation and build jobs also use
`actions/cache` for `.turbo`; deployment jobs need only the dependency cache and artifacts.

Cache keys separate operating system, Node major, lockfile, job scope, run, and retry attempt.
Restore prefixes permit reuse from earlier runs and other build jobs with the same lockfile.
Turbo decides which restored task results are valid using its own input hashes. The root
TypeScript configuration and Node version file are global hash inputs. A missing or evicted
cache only costs execution time; deployment artifacts are required and cannot be substituted
with arbitrary cached files.

## Concurrency and recovery

Main workflow runs share a concurrency group with `queue: max` and cancellation disabled.
This queues the entire validation/build/deployment sequence, rather than allowing a newer
run to cancel an outstanding application's release. GitHub permits up to 100 pending runs;
overflow, manual cancellation, and workflow failures still require attention. PR validation
jobs cancel superseded checks without canceling production work.

There is no custom tracking of the last deployed commit. A failed API release is not
implicitly retried by a later marketing-only push. Resolve deployment failures explicitly:

1. Fix the underlying problem and rerun the failed deployment job while its artifact is
   available. Successful jobs need not be rerun.
2. Check that the original commit is still the intended release: GitHub reruns use the
   original SHA, and rerunning an older deployment can overwrite a newer release.
3. If the artifact expired, rerun the whole workflow only when that commit is still intended;
   otherwise push a fix affecting the application so CI builds and deploys the current revision.
4. To roll back, use a known-good Worker version in Cloudflare. Keep API/SPA compatibility
   in mind when rolling back either independently.

GitHub processes queued runs by when they enter the queue, not by Git ancestry. Avoid
replaying old runs after newer releases. Monitor failed or canceled main runs rather than
assuming a later unrelated push has recovered them.
