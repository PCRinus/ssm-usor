# API foundation

`@ssm-usor/api` runs Hono on a Cloudflare Worker. The SPA signs in directly with Supabase;
the API accepts `Authorization: Bearer <access_token>` and independently verifies it.

## Local configuration

For Auth and Postgres running in Docker, follow [local Supabase development](local-development.md).
The settings below connect the local Worker to hosted Supabase.

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill in:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Use the same Supabase project URL and publishable key as `apps/app/.env.local`, without the
`VITE_` prefixes. Get the URL from Supabase's **Connect** dialog and the publishable key from
**Settings → API Keys**. The existing project is `https://xvhiwymggufbvjdfywjg.supabase.co`.
The local `.dev.vars` was populated during initial setup; it is ignored by Git. New checkouts
need to copy the example. Wrangler reads `.dev.vars` from the API workspace; restart it after
changing these values. Do not put the API configuration in the repository root `.env`.

```bash
pnpm --filter @ssm-usor/contracts build
pnpm dev:api
```

The API is available at `http://localhost:8787`. `pnpm dev` runs the workspaces together.
These checks work without a user account:

```bash
curl -i http://localhost:8787/health
curl -i http://localhost:8787/me
```

They return `200` and `401`, respectively. A successful `/me` request needs a user's Supabase
access token in the Authorization header; the publishable API key is not a user access token.

## Routes and authentication

| Route                                                     | Access                                | Response                                                                                           |
| --------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /openapi.json`                                       | Public                                | Generated OpenAPI contract                                                                         |
| `GET /health`                                             | Public                                | `{ "status": "ok", "service": "ssm-usor-api" }`                                                    |
| `POST /waitlist`                                          | Public, behind Turnstile              | `202 { "status": "confirmation_pending" }` and a confirmation email                                |
| `GET /waitlist/confirm`                                   | Public, by emailed token              | `303` to the marketing site's confirmed or invalid-link page                                       |
| `POST /hooks/supabase/send-email`                         | Supabase Auth, by signature           | `200 {}` after handing the recovery or signup email to the mail Worker                             |
| `GET /me`                                                 | Verified, non-anonymous Supabase user | `{ "user", "profile", "membership" }`; the last two are null when absent                           |
| `PATCH /me/profile`                                       | Verified, non-anonymous Supabase user | The saved profile; creates it when the account has none                                            |
| `GET /me/invitations`                                     | Verified, non-anonymous Supabase user | `{ "items": [ … ] }`, open invitations sent to the caller's address; no id, no token               |
| `POST /organization`                                      | Verified user without a membership    | `201` with the new membership, after creating the organization                                     |
| `GET /organization/members`                               | Verified user with a membership       | `{ "items": [ … ] }` with names, emails, and roles                                                 |
| `PATCH /organization/members/{userId}`                    | Owner                                 | `204` after changing the member's role                                                             |
| `DELETE /organization/members/{userId}`                   | Owner                                 | `204` after removing the membership; the account stays                                             |
| `GET /organization/invitations`                           | Owner                                 | `{ "items": [ … ] }`, open and expired invitations                                                 |
| `POST /organization/invitations`                          | Owner                                 | `201` with the invitation, after emailing the link                                                 |
| `POST /organization/invitations/{invitationId}/resend`    | Owner                                 | The renewed invitation, after emailing a fresh link                                                |
| `POST /organization/invitations/{invitationId}/revoke`    | Owner                                 | `204`                                                                                              |
| `POST /invitations/lookup`                                | Public, by emailed token              | What the accept page shows, including `accountExists`                                              |
| `POST /invitations/accept`                                | Public, by emailed token              | `201` after creating the account and the membership                                                |
| `POST /invitations/join`                                  | Verified user, by emailed token       | The signed-in account joins the organization                                                       |
| `GET /clients`                                            | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`, active clients; `?page=&pageSize=&sort=&order=` |
| `POST /clients`                                           | Verified user with a membership       | `201 { "client": { … } }`                                                                          |
| `GET /clients/{clientId}`                                 | Verified user with a membership       | `{ \"client\": { … } }`, archived or not                                                           |
| `GET /companies/lookup`                                   | Verified user with a membership       | `{ "company": { … } }` from ANAF, by `?cui=`                                                       |
| `GET /clients/{clientId}/employees`                       | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`; `?page=&pageSize=&sort=&order=&status=`         |
| `POST /clients/{clientId}/employees`                      | Verified user with a membership       | `201 { "employee": { … } }`                                                                        |
| `GET /clients/{clientId}/employees/{employeeId}`          | Verified user with a membership       | `{ "employee": { … } }`, the only response carrying the CNP                                        |
| `PATCH /clients/{clientId}/employees/{employeeId}/status` | Verified user with a membership       | `{ "employee": { … } }` after marking a leaver (with `terminatedAt`) or reactivating               |

`/health` checks the Worker, not Supabase connectivity. `/me` returns the user's ID and email
(nullable), their profile, and their organization with their role. It answers an account
without a membership too, with `membership: null`, and never exposes Supabase metadata.
During an impersonation `membership` is the impersonated user's while `user` and `profile`
stay the platform admin's own.

Client routes are scoped to the caller's organization. `src/lib/membership.ts` calls the database
helper `current_membership()` and answers `403 forbidden` when the user has no membership.
`POST /clients` validates the body with the Zod schema from `packages/contracts` (CUI checksum,
county list, CAEN format), stores the CUI as digits, and treats an `RO` prefix as VAT
registration. `GET /companies/lookup` proxies ANAF's public VAT registry (no CORS, roughly one
request per second) and maps the record onto the client form fields; the form must work without
it. See the [data model](data-model.md) for the schema and policies.

Employee routes are nested under the client. The handler first looks the client up as the
caller, so a client of another organization is indistinguishable from a missing one and both
answer `404 not_found`. Adding an employee to an archived client answers `409 conflict`, and
so does a CNP or employee number already used by an active employee of that client. The list
omits the CNP and, without `?status=`, returns current employees; archived rows
are never listed. Lists are paginated with page numbers (`page` from 1, `pageSize` up to 100,
25 by default) and sorted by one whitelisted key at a time (employees:
`sort=name|jobTitle|hiredAt`; clients: `sort=legalName|cui|declaredEmployeeCount`;
`order=asc|desc`), always with the id as a tiebreaker; the shared query and envelope schemas
live in `packages/contracts/src/list.ts`. A page past the end answers an empty page with the
real total. `POST` validates the CNP checksum and calendar date, stores it as digits,
lowercases the email, and rejects a birth date that contradicts the CNP. `PATCH …/status`
takes `{ "status": "terminated", "terminatedAt": "YYYY-MM-DD" }` or `{ "status": "active" }`;
a leave date before the hire date answers `400` with an issue on `terminatedAt`. Reactivating
is for undoing a mistake; a rehire after a gap is a new employee.

Data access goes through `src/lib/db.ts`: a per-request supabase-js client that forwards the
user's bearer token to PostgREST, so row-level security runs as that user. Database types in
`src/database.types.ts` are generated from the schema (`pnpm generate:db`) and checked in CI.

`src/lib/auth.ts` uses [Supabase `getUser(token)`](https://supabase.com/docs/reference/javascript/auth-getuser)
to validate the supplied token against the configured project and retrieve the current user.
This makes one Supabase Auth request for each authenticated API request, with a five-second
timeout. No user session, cookie, or refresh token is stored in the Worker. Login, persistence,
refresh, and logout stay in the browser SDK. JWT access tokens can remain usable until expiry
after sign-out; this scaffold does not implement immediate token revocation.

Routes acting for a signed-in user need only the publishable key. The waitlist acts for nobody
signed in, so it uses `createAdminClient(c)` from `src/lib/admin-db.ts`, which holds
`SUPABASE_SECRET_KEY` and bypasses row-level security. Import that client only in a module
with the same need; never reach for it to work around a policy. The invitations module is the
second, for the three things listed below.
Supabase owns its Auth schema; business tables live in SQL migrations
and are protected by row-level security. User-editable `user_metadata` never grants permissions.

New authenticated routes should attach `requireAuth`, `requireMembership` when they touch
organization data, and `requireOwner` after it for what only an owner may do, then read `c.get('user')`, `c.get('membership')`, and `createDataClient(c)`.
Transport schemas live in `packages/contracts`.

## Waitlist

`POST /waitlist` takes `{ email, consentVersion, turnstileToken }` from the marketing site's
form. It checks the Turnstile token, stores the normalized address in `waitlist_subscribers`
as pending, and asks the [mail Worker](mail.md) over the `MAIL` service binding to send a
confirmation link. The subscription is double opt-in: only following the link sets
`confirmed_at`.

The answer is always `202 { "status": "confirmation_pending" }`, whether the address is new,
pending, or already confirmed, so the endpoint does not reveal who subscribed. A confirmed
address is not emailed again, and a pending one at most once every ten minutes. Each email
carries a fresh random token of which only the SHA-256 hash is stored; sending a new one
invalidates the previous link. If the email cannot be sent the answer is `503` and the sent
time is left alone, so an immediate retry works.

`GET /waitlist/confirm?token=…` is opened in a browser. It redirects to
`/abonare/confirmata/` on the marketing site, also when the link is followed a second time,
and to `/abonare/link-invalid/` for an unknown or missing token.

The route needs `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, and the `MAIL` binding, and
answers `503` while any is missing. `API_ORIGIN` builds the emailed link and
`MARKETING_ORIGIN` is both the redirect target and the only origin CORS allows on `/waitlist`.

## Invitations

[ADR 003](architecture/adr-003-organization-invitations.md) records the design and
[the data model](data-model.md#organization-invitations) the database side.

An owner's `POST /organization/invitations` takes `{ email, role }`. As the owner, it calls
`create_organization_invitation`, which creates or renews the invitation. With the secret
key it then stores the hash of a fresh token, and only after the mail Worker has accepted the
email, the sent time. The link is `APP_ORIGIN/accept-invitation?token=…` and is never
returned. An address emailed in the last 10 minutes is answered with `409`; a failed send
with `503`, leaving the sent time so a retry works. The response is the same whether or not
the address has an account.

The accept page posts the token to `/invitations/lookup`, which changes nothing. A person
without an account then posts `{ token, fullName, password, termsVersion }` to
`/invitations/accept`: the API creates the user through the Auth Admin API with
`email_confirm: true`, calls `accept_invitation_as`, and deletes the user again if that
fails. A person with an account signs in and posts to `/invitations/join`, which runs
`accept_organization_invitation` as that user and needs no secret key.

The admin client is used for exactly three things: storing the token hash and sent time,
the lookup, and the new-account path. Tokens travel in request bodies, never in an API URL.

Invitation errors carry a `reason` so the SPA can word them: `already_member`,
`too_many_open_invitations`, `sent_recently`, `invitation_accepted`, `invitation_revoked`,
`invitation_expired`, `account_exists`, `already_in_organization`, `email_mismatch`
(`403`), and `full_name_required` (`400`).

The owner routes need `SUPABASE_SECRET_KEY` and the `MAIL` binding and answer `503` before
creating anything while either is missing.

## Onboarding

[ADR 004](architecture/adr-004-registration-and-onboarding.md). Registration itself is
Supabase's signup, which the SPA calls directly; the API's part starts once the person is
signed in without a membership.

`POST /organization` takes `{ organizationName, fullName, termsVersion }` and calls
`create_organization` as the caller. It needs no membership, unlike every other organization
route. `409` with `reason: already_in_organization` for an account that has one, `403` with
`reason: email_not_confirmed` otherwise refused. `termsVersion` must be the current one from
the contracts: the checkbox on the page accepts that version and no other.

`GET /me/invitations` lists the open invitations sent to the caller's confirmed address, so
the page can point them out before the person creates an organization of their own. It carries
no id and no token; only the emailed link accepts an invitation.

## Members

An owner changes a member's role with `PATCH /organization/members/{userId}` and removes a
member with `DELETE /organization/members/{userId}`. Both call database functions as the
owner; memberships have no write policy. Nobody acts on their own membership (`409`,
`reason: own_membership`), which is what keeps an organization from ending up without an
owner. Someone who is not a member of the caller's organization is `404`. Removing deletes
the membership only: the account, the profile, and what the person created stay, the person
sees no organization, and can be invited again.

## Supabase Auth emails

Supabase Auth does not send email itself: its Send Email hook posts every email it would send
to `POST /hooks/supabase/send-email` ([ADR 002](architecture/adr-002-transactional-email.md)).
The route is left out of the OpenAPI document, since Supabase is its only caller.

The request is signed as [Standard Webhooks](https://www.standardwebhooks.com) specify. The
handler checks the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers against
`SUPABASE_AUTH_HOOK_SECRET` over the raw body, refuses anything older than five minutes, and
accepts several secrets joined with `|` while one is rotated out. Errors use the shape
Supabase expects, `{ "error": { "http_code", "message" } }`.

Two types are handled. `recovery` links to `APP_ORIGIN/reset-password?token_hash=…` and
`signup` to `APP_ORIGIN/confirm-email?token_hash=…`, ignoring any redirect Supabase was asked
for. The SPA verifies the token when the page's form or button is submitted, so a mail scanner
opening the link cannot use it up. Every other email type is
answered with `422` and logged, so an email nobody implemented fails loudly instead of never
arriving. A failed send answers `500`, which Supabase reports to the caller. The route
answers `503` while the secret or the `MAIL` binding is missing, and must finish within the
hook's five seconds.

The hook itself, the password rules, and closed signup are declared in `supabase/config.toml`
and applied to the hosted project by CI; see [CI/CD](ci-cd.md).

## Source layout

```text
src/
  app.ts               cross-cutting: headers, CORS, module mounting, OpenAPI document, errors
  router.ts            createRouter(): an OpenAPIHono with the shared validation error hook
  lib/                 auth, db, admin-db, tokens, turnstile, env, errors, membership, shared OpenAPI pieces
  modules/<domain>/    routes.ts (OpenAPI route definitions), handlers.ts, index.ts (router), tests
```

Each domain module exports one router built with `createRouter()` and registers its own
routes and handlers; `app.ts` mounts it with `app.route('/', …)`, which also merges its OpenAPI
definitions. Add a new domain by adding a folder under `modules` and one mount line. The [OpenAPI/Orval pipeline](api-client.md)
generates the SPA’s TanStack Query client used by the dashboard to call `/me`.

## Errors and CORS

All responses use `Cache-Control: no-store`. Errors share `{ "error": "…", "message": "…" }`,
with an optional `reason` where one status covers cases the client words differently:

| Status | Error                 | Meaning                                                                                                     |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `400`  | `validation_error`    | Invalid body or query; `issues` lists field paths and messages.                                             |
| `401`  | `unauthorized`        | Missing, invalid, expired, or rejected bearer token; anonymous users are rejected too.                      |
| `403`  | `forbidden`           | No organization membership, not an owner where one is required, or the database policy rejected the write.  |
| `404`  | `not_found`           | No matching route, no company registered with the CUI, or no such client or employee.                       |
| `409`  | `conflict`            | Duplicate CUI, CNP, or employee number, an employee added to an archived client, or an invitation conflict. |
| `503`  | `service_unavailable` | Missing/invalid Supabase configuration, timeout, rate limit, or authentication service failure.             |
| `500`  | `internal_error`      | Unexpected API failure.                                                                                     |

Upstream error details are not returned to callers; database failures are logged by context
only. Authentication failures include `WWW-Authenticate: Bearer`.

`CORS_ORIGINS` is a comma-separated list of exact browser origins for every route except
`/waitlist`, which allows only `MARKETING_ORIGIN`. Production defaults to
`https://app.ssmusor.ro`; `.dev.vars` allows the local Vite origins instead. OPTIONS preflight
does not require authentication and allows GET, POST, PATCH, and DELETE requests with Authorization/Content-Type headers.
Cookie credentials are not enabled. CORS controls browser access to responses; bearer
authentication still applies independently, including to non-browser clients.

## Deployment and verification

`apps/api/wrangler.jsonc` declares the `ssm-usor-api` Worker at `api.ssmusor.ro`, its
production origins, and the service binding to `ssm-usor-mail`, which therefore deploys first. The **CI** workflow supplies the public Supabase bindings and deploys
and checks the API when its inputs change on `main`. If the SPA also changed, its deployment
waits for the API checks; otherwise the SPA is left untouched. `.dev.vars` is local only.
See the [application deployment guide](app-deployment.md) for GitHub configuration and release steps.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @ssm-usor/api deploy:dry-run
```

API tests exercise Hono and the real Supabase SDK with mocked HTTP responses: token forwarding,
identity isolation, response filtering, invalid credentials, anonymous users, configuration
errors, upstream failures, CORS, JSON errors, client listing and creation, membership checks,
PostgREST error mapping, and the ANAF lookup. They do not create Supabase users or rows;
policies are covered by the pgTAP tests in `supabase/tests`. The [development admin guide](development-admin.md) covers
the seed command and completed live login-to-API verification.
