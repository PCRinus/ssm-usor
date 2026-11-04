# Admin app

The `@ssm-usor/admin` workspace is the platform owner's area ([ADR 038](architecture/adr-038-admin-area.md)):
a client-only React/Vite SPA at `admin.ssmusor.ro` (`admin.non-prod.ssmusor.ro` in non-prod),
served by a Worker of its own, `ssm-usor-admin`. It is built like the portal (TanStack Router
with file routes, TanStack Query, Supabase, `@ssm-usor/ui`) and leaves out what the member apps
carry for members: no PostHog, no Lingui, no help links, no Actualizări block. It is in English.

## Pages

| Route          | What                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/sign-in`     | Email and password, with the Turnstile check Supabase Auth's CAPTCHA asks for                                     |
| `/enrol`       | The first sign-in: the QR code and key of a new authenticator (TOTP), then its first code                         |
| `/verify`      | Every later sign-in: a code from the authenticator                                                                |
| `/`            | "Signed in as …", a link to Imports; "This account has no admin access" when the API says `403`                   |
| `/imports`     | Every organization's imports, newest first, with filters ([below](#the-imports-page))                             |
| `/imports/$id` | One import: its row, flags, quality, reports, library parts and its improvement copy ([below](#the-imports-page)) |

The signed-in pages share a top bar with the logo, **Home**, **Imports** and **Sign out**.

Each route sends the session where it stands: no session to `/sign-in`, a session whose token is
`aal1` to `/enrol` when the account has no verified factor and to `/verify` when it has one, and
only an `aal2` session to `/`. The pages read the level from the token for that choice alone;
the API decides.

## The Imports page

[ADR 037](architecture/adr-037-import-quality-and-alerts.md)'s place where support reads how
imports went, and the only place the improvement copies are read.

**The list** (`/imports`) shows every organization's imports, newest first, 25 to a page: the kind,
when it was created, the first characters of its id, the organization, the status, a **Reported**
badge when the member reported the import or one of its parts, the reading flags as small counts
(files that could not be opened, files sorted but giving nothing, required fields left empty, the
checks' flags), the share of proposed values the member changed or unticked, the cost with its
parts, the reading version (the first 8 characters of the prompts' hash), and the copy: kept until
when, removed, or none, with the number of parts' copies. Filters for the kind, the status, reported
only and with a copy kept live in the address (`?kind=client&status=failed&reported=true&hasCopy=true&page=2`).
An abandoned or failed import's row goes 14 days after it ends while its copy stays 12 months: such
an import is listed from its copy alone, as **Row deleted**, with no kind, status or counts, at the
time its copy was written; the status filter's **Row deleted** shows only those. A row opens the
import.

**An import** (`/imports/<id>`) shows its kind, status, organization and id; the times, cost,
tokens, reading version with the model of each step, and failure reason; its flags as a readable
list (files by kind, the places of the files that could not be opened or gave nothing, what was
found, the required fields left empty, the checks' flags by code); its quality per section; who
reported it and when; each library part with the same; and the improvement copy: when each copy was
written and until when it is kept, the proposal beside the member's changes as collapsible trees,
the rest of `record.json` (files, times, counts, usage), and every file of the copy with its path,
size and **Open**, which asks the API for a link that lasts 60 seconds and opens it in a new tab.
Once the import's row is gone, the page says so and shows what the copy holds.

**What is recorded.** Opening an import that has a copy kept writes an `import_copy_opened` event to
the audit log, and every file link handed out an `import_copy_file_opened` event with the file's
path ([data model](data-model.md#audit-log)), so the agreement's promise that only those who work on
the import read the copies can be checked. The page loads an import once and does not refetch it
when the window regains focus, so each look is one event. An import without a copy records nothing.

## The three locks

| Lock                                     | Where it is checked                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Access**                    | At Cloudflare's edge, by the Access application on the hostname, and again in the admin Worker before anything else, for every request, the static files included (`run_worker_first`): the `Cf-Access-Jwt-Assertion` header must be an RS256 token signed by one of the team's keys (`https://<team>/cdn-cgi/access/certs`, cached per isolate), issued by `https://<team>`, for the environment's application audience. Otherwise `403`. |
| **Supabase sign-in and the admin claim** | In the API's `Admin` entrypoint: the bearer token is verified with Supabase Auth as on the public API, then `app_metadata.role` must be `admin`.                                                                                                                                                                                                                                                                                           |
| **Multi-factor authentication**          | In the same entrypoint: the token's `aal` claim must be `aal2`, which Supabase gives a session only after a code from the authenticator.                                                                                                                                                                                                                                                                                                   |

A missing or invalid bearer token is `401`; a valid one without the claim or without `aal2` is
`403` (`reason: aal2_required` for the latter). The Worker's own `403` is plain text, so the home
page does not mistake it for the API's.

The team domain and the audiences are in `apps/admin/wrangler.jsonc` as variables, one audience
per environment. They are not secrets: the audience only says which application a token is for.
Without the team domain or the audience the Worker refuses every request.

## Requests to the API

The browser only calls its own origin. The Worker sends `/api/*` to the service binding `API`,
the API Worker's `Admin` entrypoint (`ssm-usor-api`, or `ssm-usor-api-non-prod`), with `/api`
replaced by `/admin`: `GET /api/me` arrives as `GET /admin/me`. It passes the method, the body,
the query string and the `Authorization`, `Content-Type`, `Accept` and `cf-ray` headers, and
nothing else, so cookies and the Access token stay at the Worker.

The `Admin` entrypoint (`apps/api/src/index.ts`) serves only `createAdminApp()`
(`apps/api/src/admin-app.ts`), a Hono app of its own under `/admin`. The public `fetch` does not
mount it, so `api.ssmusor.ro/admin/me` answers `404`. Its routes:

| Route                           | Answer                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ |
| `GET /admin/me`                 | `{ id, email }` of the signed-in admin                                   |
| `GET /admin/imports`            | A page of every organization's imports ([API](api.md#admin-routes))      |
| `GET /admin/imports/{id}`       | One import with its parts and its improvement copy, recorded when opened |
| `GET /admin/imports/{id}/files` | A 60-second link to one file of the copy, recorded                       |

## Configuration and deployment

The build reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_TURNSTILE_SITE_KEY`,
the same project and keys as the SPA and the portal; the deploy workflow passes the
environment's values. The Turnstile widget's domains, `ssmusor.ro` and `non-prod.ssmusor.ro`,
cover the admin hostnames. **Deploy admin app** runs after **Deploy API**, since the binding to
the `Admin` entrypoint cannot deploy before the API exports it ([CI/CD](ci-cd.md)).

`workers_dev` and `preview_urls` are off: neither address would be behind Access.

## Local development

```bash
cp apps/admin/.env.example apps/admin/.env.local   # the local stack's URL and publishable key
cp apps/admin/.dev.vars.example apps/admin/.dev.vars
pnpm dev:admin
```

`.dev.vars` holds `ACCESS_CHECK=off`, the only way past the Access check, since nothing on a
laptop has an Access token. The Worker honours it only for a request to `localhost` or
`127.0.0.1`, so `pnpm dev:admin` starts `wrangler dev` with `--local-upstream`: without it,
Wrangler hands the Worker the route's host. Git ignores the file, and a test fails if
`wrangler.jsonc` ever sets the variable. Any other value, or none, keeps the check on, and on a
deployed Worker even `off` does.

`pnpm dev:admin` starts Vite on http://localhost:5176 for the pages and the Worker under
`wrangler dev` on port 8794, and Vite sends `/api` on to the Worker. The Worker finds the API
through Wrangler's local registry, so the API has to run under `wrangler dev` too (`pnpm dev:api`,
or `pnpm dev`); otherwise `/api` answers `503` "Worker "ssm-usor-api" not found".

The local Auth must allow authenticator factors: `[auth.mfa.totp]` with `enroll_enabled` and
`verify_enabled` in `supabase/config.toml`, then `pnpm supabase:stop && pnpm supabase:start`.

To make a local account an admin, in Studio's SQL editor or `psql`:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'admin@ssmusor.test';
```

The claim reaches the token at the next sign-in or refresh. The same statement in the hosted
project's SQL editor grants it there; the app never grants it.

## A lost authenticator

Delete the account's factors with the secret key; the next sign-in then asks for a new
authenticator, as the first did. From `apps/admin`, which has `@supabase/supabase-js`:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… ADMIN_ID=<user id> \
node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const userId = process.env.ADMIN_ID;
const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
if (error) throw error;
for (const factor of data.factors) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
  console.log(factor.id, factor.factor_type, error ? error.message : "deleted");
}'
```

The user id is in the dashboard under **Authentication → Users**. Sessions that already reached
`aal2` keep it until they end; sign out everywhere from the dashboard as well when the device was
lost rather than reset.
