# Admin app

The `@ssm-usor/admin` workspace is the platform owner's area ([ADR 038](architecture/adr-038-admin-area.md)):
a client-only React/Vite SPA at `admin.ssmusor.ro` (`admin.non-prod.ssmusor.ro` in non-prod),
served by a Worker of its own, `ssm-usor-admin`. It is built like the portal (TanStack Router
with file routes, TanStack Query, Supabase, `@ssm-usor/ui`) and leaves out what the member apps
carry for members: no PostHog, no Lingui, no help links, no Actualizări block. It is in English.

## Pages

| Route                      | What                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/sign-in`                 | Email and password, with the Turnstile check Supabase Auth's CAPTCHA asks for                                           |
| `/enrol`                   | The first sign-in: the QR code and key of a new authenticator (TOTP), then its first code                               |
| `/verify`                  | Every later sign-in: a code from the authenticator                                                                      |
| `/`                        | "Signed in as …", links to Imports, Members and Legislation; "This account has no admin access" when the API says `403` |
| `/imports`                 | Every organization's imports, newest first, with filters ([below](#the-imports-page))                                   |
| `/imports/$id`             | One import: its row, flags, quality, reports, library parts and its improvement copy ([below](#the-imports-page))       |
| `/members`                 | Every organization's members, to start an impersonation, and the admin's recent ones ([below](#the-members-page))       |
| `/legislation`             | The legal changes of the cited acts, to resolve them ([below](#the-legislation-page))                                   |
| `/legislation/changes/$id` | One change: its passages old → new and how it is resolved ([below](#the-legislation-page))                              |
| `/legislation/acts`        | The watched acts, to record the form each was verified against ([below](#the-legislation-page))                         |
| `/legislation/runs`        | The runs of the daily check ([below](#the-legislation-page))                                                            |

The signed-in pages share a top bar with the logo, **Home**, **Imports**, **Members**,
**Legislation** and **Sign out** (on a phone the logo stands for **Home** and **Sign out** is its
icon alone), and, while an impersonation is active,
the strip [below](#the-active-impersonation-strip).

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
when, removed, or none, with the number of parts' copies, and an **Incomplete** badge when the
import's own copy or one of its parts' kept copies has not finished writing (no `completed_at`: its
writing stopped before `record.json`). Filters for the kind, the status, reported only and with a
copy kept live in the address (`?kind=client&status=failed&reported=true&hasCopy=true&page=2`).
An abandoned or failed import's row goes 14 days after it ends while its copy stays 12 months: such
an import is listed from its copy alone, as **Row deleted**, with no kind, status or counts, at the
time its copy was written; the status filter's **Row deleted** shows only those. A row opens the
import.

**An import** (`/imports/<id>`) shows its kind, status, organization and id; the times, cost,
tokens, reading version with the model of each step, and failure reason; its flags as a readable
list (files by kind, the places of the files that could not be opened or gave nothing, what was
found, the required fields left empty, the checks' flags by code); its quality per section; who
reported it and when; each library part with the same; and the improvement copy: when each copy was
written and until when it is kept, an **Incomplete** badge on a kept copy, the import's own or a
part's, that has not finished writing, with the note that the daily clean-up writes it again (or,
once the import's row is gone, that nothing will), the proposal beside the member's changes as
collapsible trees, the rest of `record.json` (files, times, counts, usage), and every file of the copy with its path,
size and **Open**, which asks the API for a link that lasts 60 seconds and opens it in a new tab.
Once the import's row is gone, the page says so and shows what the copy holds.

**What is recorded.** Opening an import that has a copy kept writes an `import_copy_opened` event to
the audit log, and every file link handed out an `import_copy_file_opened` event with the file's
path ([data model](data-model.md#audit-log)), so the agreement's promise that only those who work on
the import read the copies can be checked. The page loads an import once and does not refetch it
when the window regains focus, so each look is one event. An import without a copy records nothing.

## The Members page

Where the admin starts an impersonation: acting as a member in the member app, with his own
sign-in, for at most two hours ([API](api.md#impersonation)).

**The list** (`/members`) shows every organization's members, 25 to a page: name, email,
organization, role, plan and its status (or none), and the last sign-in. The member being acted
as carries an **Acting** badge beside the name. The search box matches the email, the name or the
organization, ignoring case and diacritics; it waits for typing to pause, then puts the search
in the address with the page (`?search=popescu&page=2`). Every row but the admin's own has
**Act as**.

**Act as** opens a dialog with the member's name, email, organization and role, a required
reason (at most 500 characters), and the notes that the impersonation ends by itself after two
hours, that starting and ending it are recorded in the audit log, and, when one is active, whose
impersonation it replaces. From 400 characters on, a counter under the field counts them, and at
500 it says that the limit is reached and nothing more is taken. A missing reason is said under
the field and clears as soon as one is typed. Starting one ends the active one in the same
request. While it starts, Cancel, Escape and the close button do nothing, so the member app
never opens after the dialog seems closed. A refusal is shown in the dialog: the reason's error
under the field, an account that belongs to no organization or the admin's own in plain words,
and a start already under way (`409`, `reason: 'impersonation_start_in_progress'`, in
`src/features/impersonation/reasons.ts`) as one to wait for. Once started, the dialog closes and
the member app opens in a new tab. However the dialog closes, focus goes back to the **Act as**
button it was opened from. A browser may block that tab (Safari often does, since it opens after
the request); the strip's link is there for that.

**Recent impersonations**, under the list, are the admin's own, newest first, 10 to a page: the
member, the organization (or "No longer a member"), the reason, when it started, and whether it
ended, expired or is active. It expired when it ran past its end with nobody ending it, whether
the row is still open or the API closed it at its expiry, such as at the next start (`endedAt`
equal to `expiresAt`, [API](api.md#impersonation)); it ended only when it was ended before then.

## The Legislation page

[ADR 017](architecture/adr-017-legislation-monitoring.md)'s page for the platform admin, the only
place in the product that writes the legislation data besides the daily check. Three tabs:

**Changes** (`/legislation`) lists every legal change, newest seen first: the act, the form and
the verified one it was compared with, the outcome (**No impact**, **Quote differs**, **Needs
review**, or **Not assessed**) with its number of passages, the amending acts, the resolution with
the note members read, and when it was seen and assessed. Filters for open or resolved and for the
outcome live in the address (`?status=open&outcome=quote_differs`). A row opens the change.

**A change** (`/legislation/changes/<id>`) shows the act with its page on the portal, the forms,
the amending acts (linked to their own pages when the portal's note named them), the amended units
and the reasons to review it, in English. Each passage shows the template file, its type, where the
template quotes or names the unit, and the law's text old → new as one paragraph, the removed
words struck and the added ones marked. While the change is open it can be resolved two ways:

- **Mark as no impact** asks for the note members read under the change, in Romanian, 2 to 500
  characters. The act's verified form moves to the change's, as when the check resolves one
  itself.
- **Resolve by this version** lists the built-in template versions that can answer it: of a type
  its passages name, registered after it was seen, not a layout version and answering no other
  change. Members then read the version's note under the change, and the verified form moves as
  above.

Once resolved, the page shows how, when, by which version, and the note. A change resolved by
mistake cannot be reopened here: resolving moved the act's verified form, which the next
comparison starts from, and the form before it is kept only in the audit log.

**Watched acts** (`/legislation/acts`) lists every act with its page on the portal, its status,
the last form seen with the acts that amended it, the verified form (in amber when older than the
last form seen), when the check last read it, when someone read it by hand, and a badge for its
open changes. Every column sorts (`?sort=verified&order=desc`). **Record** sets the verified form
to a date no later than the last form seen. While a change of the act at or before that date is
open, the dialog lists it with a link and refuses the date: the daily check never assesses a
change at or before the verified form again, so it would stay open for good.

**Runs** (`/legislation/runs`) lists the check's runs, newest first, 25 to a page: when each
started and ended, its status, the acts checked and skipped, the changes found, and its errors,
which open to the act, the kind and the message of each.

Every write goes with the admin's own token to a database function that refuses anyone but a
platform admin past the second factor, and records a `legal_change_resolved` or
`legal_act_verified` event in the audit log ([data model](data-model.md#legislation)).

## The active impersonation strip

While an impersonation is active, every signed-in page shows a strip under the top bar:
"Acting as {name, else email} · {organization} · ends {time} ({minutes} min left)", a link
**Open the member app**, and **End**, which ends it, reads it again and moves focus to the page's
main heading. At the impersonation's end by the browser's clock the strip says "ends now" and
keeps **End**, and the app reads the active impersonation again then and every 15 seconds after
it until the API says none is active; it reads it again whenever the window regains focus too,
so one ended from the member app's banner goes. When the read fails and nothing was read before,
a warning takes the strip's place, "Could not check whether you are acting as a member.", with
**Try again**, so an active impersonation never looks like none.

**Sign out** ends an active impersonation first, waiting at most three seconds and signing out
whether or not that worked.

The member app's address follows the admin app's own: `admin.ssmusor.ro` opens
`https://app.ssmusor.ro` and `admin.non-prod.ssmusor.ro` opens `https://app.non-prod.ssmusor.ro`.
On `localhost` it is `VITE_APP_URL`, else `http://localhost:5173`.

## The three locks

| Lock                                     | Where it is checked                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Access**                    | At Cloudflare's edge, by the Access application on the hostname, and again in the admin Worker before anything else, for every request, the static files included (`run_worker_first`): the `Cf-Access-Jwt-Assertion` header must be an RS256 token signed by one of the team's keys (`https://<team>/cdn-cgi/access/certs`, cached per isolate), issued by `https://<team>`, for the environment's application audience. Otherwise `403`. |
| **Supabase sign-in and the admin claim** | In the API's `Admin` entrypoint: the bearer token is verified with Supabase Auth as on the public API, then `app_metadata.role` must be `admin`.                                                                                                                                                                                                                                                                                           |
| **Multi-factor authentication**          | In the same entrypoint: the token's `aal` claim must be `aal2`, which Supabase gives a session only after a code from the authenticator.                                                                                                                                                                                                                                                                                                   |

A missing or invalid bearer token is `401`; a valid one without the claim or without `aal2` is
`403` (`reason: aal2_required` for the latter).

The claim counts only at `aal2` everywhere else too. `public.is_platform_admin()` asks for the
token's `aal` to be `aal2` as well as for the claim, so an admin signed in with the password
alone can neither start nor end an impersonation through PostgREST, and an active one does not
apply to that session: `effective_user_id()` is the admin's own id. On the public API, the
`platformAdmin` flag behind `adminToolsAllowed` (the import's cost line and deleting an archived
client in production) is the claim on an `aal2` token, and the API tells the audit log the
session passed its second factor (`x-audit-aal`) so that its secret-key writes name the
impersonated member only then ([ADR 033](architecture/adr-033-audit-log.md)). The Worker's own `403` is plain text, so the home
page does not mistake it for the API's.

The team domain and the audiences are in `apps/admin/wrangler.jsonc` as variables, one audience
per environment. They are not secrets: the audience only says which application a token is for.
Without the team domain or the audience the Worker refuses every request.

## Requests to the API

The browser only calls its own origin, and sends its cookies with those calls: Cloudflare Access
checks `/api` like any other path, and without the `CF_Authorization` cookie the edge answers
with a redirect to its sign-in page, which the app's client refuses. The Worker sends `/api/*`
to the service binding `API`, the API Worker's `Admin` entrypoint (`ssm-usor-api`, or
`ssm-usor-api-non-prod`), with `/api` replaced by `/admin`: `GET /api/me` arrives as
`GET /admin/me`. It passes the method, the body, the query string and the `Authorization`,
`Content-Type`, `Accept` and `cf-ray` headers, and nothing else, so cookies and the Access token
stay at the Worker.

The `Admin` entrypoint (`apps/api/src/index.ts`) serves only `createAdminApp()`
(`apps/api/src/admin-app.ts`), a Hono app of its own under `/admin`. The public `fetch` does not
mount it, so `api.ssmusor.ro/admin/me` answers `404`. Its routes:

| Route                           | Answer                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ |
| `GET /admin/me`                 | `{ id, email }` of the signed-in admin                                   |
| `GET /admin/imports`            | A page of every organization's imports ([API](api.md#admin-routes))      |
| `GET /admin/imports/{id}`       | One import with its parts and its improvement copy, recorded when opened |
| `GET /admin/imports/{id}/files` | A 60-second link to one file of the copy, recorded                       |
| `GET /admin/members`            | A page of every organization's members, to choose whom to impersonate    |
| `GET /admin/impersonation`      | The admin's active impersonation, or null                                |
| `POST /admin/impersonation`     | Starts one with a reason, ending the active one first                    |
| `DELETE /admin/impersonation`   | Ends the active one                                                      |
| `GET /admin/impersonations`     | A page of the admin's impersonations, newest first                       |

Starting and ending an impersonation go with the admin's own token, so the database's policies
and the audit log treat them as his acts; the member lists are read with the secret key
([API](api.md#admin-routes)). The member app's banner ends one through the public API's
`DELETE /me/impersonation`.

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

## The member app and the second factor

An account with a verified authenticator gives its code in the member app too. After a sign-in
with a password, with Google or by a confirmation link, every page that uses the session sends
an `aal1` session to `/verificare-cod`, which asks for the code (`mfa.challengeAndVerify`) and
then goes on to the page that was asked for. After a recovery link, the reset page verifies the
link, asks for the code the same way, and comes back for the new password, which has to be
typed again. Changing the password on the profile page signs in again with the current one,
which gives an `aal1` session, so the form asks for the code as well. An account without a
verified factor sees none of this; the member app never enrols one. The portal asks for no code:
its sign-in is the participants', and the admin's power is not used there.

The member app needs this because of two rules of Supabase Auth:

- **Verifying a code ends the account's `aal1` sessions.** Supabase Auth signs out every session
  of the account below `aal2` when a code is verified anywhere, so a password-only session in
  the member app ended each time the admin signed in to the admin app. Sessions at `aal2` stay.
- **An account with a verified factor changes its password or email only at `aal2`.** Supabase
  Auth answers `401 insufficient_aal` otherwise, and a recovery link's session is `aal1`.

## A lost password

The reset email works as for any member, with the code from the authenticator after the link.
Without the authenticator either, set the password with the secret key, from `apps/admin` as
below:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… ADMIN_ID=<user id> \
NEW_PASSWORD='…' node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { error } = await admin.auth.admin.updateUserById(process.env.ADMIN_ID, {
  password: process.env.NEW_PASSWORD,
});
console.log(error ? error.message : "password set");'
```

or delete the factor first (below), after which the reset email needs no code.

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
