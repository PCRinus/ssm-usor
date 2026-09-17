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

| Route                   | Access                                | Response                                        |
| ----------------------- | ------------------------------------- | ----------------------------------------------- |
| `GET /openapi.json`     | Public                                | Generated OpenAPI contract                      |
| `GET /health`           | Public                                | `{ "status": "ok", "service": "ssm-usor-api" }` |
| `GET /me`               | Verified, non-anonymous Supabase user | `{ "user": { "id": "…", "email": "…" } }`       |
| `GET /clients`          | Verified user with a membership       | `{ "clients": [ … ] }`, active clients by name  |
| `POST /clients`         | Verified user with a membership       | `201 { "client": { … } }`                       |
| `GET /companies/lookup` | Verified user with a membership       | `{ "company": { … } }` from ANAF, by `?cui=`    |

`/health` checks the Worker, not Supabase connectivity. `/me` returns only the user's ID and
email (nullable); it does not expose Supabase metadata or grant administrator permissions.

Client routes are scoped to the caller's organization. `src/lib/membership.ts` calls the database
helper `current_membership()` and answers `403 forbidden` when the user has no membership.
`POST /clients` validates the body with the Zod schema from `packages/contracts` (CUI checksum,
county list, CAEN format), stores the CUI as digits, and treats an `RO` prefix as VAT
registration. `GET /companies/lookup` proxies ANAF's public VAT registry (no CORS, roughly one
request per second) and maps the record onto the client form fields; the form must work without
it. See the [data model](data-model.md) for the schema and policies.

Data access goes through `src/lib/db.ts`: a per-request supabase-js client that forwards the
user's bearer token to PostgREST, so row-level security runs as that user. Database types in
`src/database.types.ts` are generated from the schema (`pnpm generate:db`) and checked in CI.

`src/lib/auth.ts` uses [Supabase `getUser(token)`](https://supabase.com/docs/reference/javascript/auth-getuser)
to validate the supplied token against the configured project and retrieve the current user.
This makes one Supabase Auth request for each authenticated API request, with a five-second
timeout. No user session, cookie, or refresh token is stored in the Worker. Login, persistence,
refresh, and logout stay in the browser SDK. JWT access tokens can remain usable until expiry
after sign-out; this scaffold does not implement immediate token revocation.

Only a publishable key is needed. A service-role or secret key is neither required nor accepted
by this configuration. Supabase owns its Auth schema; business tables live in SQL migrations
and are protected by row-level security. User-editable `user_metadata` never grants permissions.

New authenticated routes should attach `requireAuth`, and `requireMembership` when they touch
organization data, then read `c.get('user')`, `c.get('membership')`, and `createDataClient(c)`.
Transport schemas live in `packages/contracts`.

## Source layout

```text
src/
  app.ts               cross-cutting: headers, CORS, module mounting, OpenAPI document, errors
  router.ts            createRouter(): an OpenAPIHono with the shared validation error hook
  lib/                 auth, db, env, errors, membership, shared OpenAPI pieces
  modules/<domain>/    routes.ts (OpenAPI route definitions), handlers.ts, index.ts (router), tests
```

Each domain module exports one router built with `createRouter()` and registers its own
routes and handlers; `app.ts` mounts it with `app.route('/', …)`, which also merges its OpenAPI
definitions. Add a new domain by adding a folder under `modules` and one mount line. The [OpenAPI/Orval pipeline](api-client.md)
generates the SPA’s TanStack Query client used by the dashboard to call `/me`.

## Errors and CORS

All responses use `Cache-Control: no-store`. Errors share `{ "error": "…", "message": "…" }`:

| Status | Error                 | Meaning                                                                                         |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `400`  | `validation_error`    | Invalid body or query; `issues` lists field paths and messages.                                 |
| `401`  | `unauthorized`        | Missing, invalid, expired, or rejected bearer token; anonymous users are rejected too.          |
| `403`  | `forbidden`           | The user has no organization membership, or the database policy rejected the write.             |
| `404`  | `not_found`           | No matching route, or no company registered with the CUI.                                       |
| `409`  | `conflict`            | A client with this CUI already exists in the organization.                                      |
| `503`  | `service_unavailable` | Missing/invalid Supabase configuration, timeout, rate limit, or authentication service failure. |
| `500`  | `internal_error`      | Unexpected API failure.                                                                         |

Upstream error details are not returned to callers; database failures are logged by context
only. Authentication failures include `WWW-Authenticate: Bearer`.

`CORS_ORIGINS` is a comma-separated list of exact browser origins. Production defaults to
`https://app.ssmusor.ro`; `.dev.vars` allows the local Vite origins instead. OPTIONS preflight
does not require authentication and allows GET and POST requests with Authorization/Content-Type headers.
Cookie credentials are not enabled. CORS controls browser access to responses; bearer
authentication still applies independently, including to non-browser clients.

## Deployment and verification

`apps/api/wrangler.jsonc` declares the `ssm-usor-api` Worker at `api.ssmusor.ro` and its
production CORS origin. The **CI** workflow supplies the public Supabase bindings and deploys
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
