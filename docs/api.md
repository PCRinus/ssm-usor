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

| Route               | Access                                | Response                                        |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `GET /openapi.json` | Public                                | Generated OpenAPI contract                      |
| `GET /health`       | Public                                | `{ "status": "ok", "service": "ssm-usor-api" }` |
| `GET /me`           | Verified, non-anonymous Supabase user | `{ "user": { "id": "…", "email": "…" } }`       |

`/health` checks the Worker, not Supabase connectivity. `/me` returns only the user's ID and
email (nullable); it does not expose Supabase metadata or grant administrator permissions.

`src/auth.ts` uses [Supabase `getUser(token)`](https://supabase.com/docs/reference/javascript/auth-getuser)
to validate the supplied token against the configured project and retrieve the current user.
This makes one Supabase Auth request for each authenticated API request, with a five-second
timeout. No user session, cookie, or refresh token is stored in the Worker. Login, persistence,
refresh, and logout stay in the browser SDK. JWT access tokens can remain usable until expiry
after sign-out; this scaffold does not implement immediate token revocation.

Only a publishable key is needed. A service-role or secret key is neither required nor accepted
by this configuration. No ORM or authentication tables are introduced: Supabase owns its Auth
schema. Future business tables and authorization rules are separate work; user-editable
`user_metadata` must not grant permissions.

New authenticated routes should attach `requireAuth` and read the verified identity using
`c.get('user')`. Transport schemas live in `packages/contracts`. The [OpenAPI/Orval pipeline](api-client.md)
generates the SPA’s TanStack Query client used by the dashboard to call `/me`.

## Errors and CORS

All responses use `Cache-Control: no-store`. Errors share `{ "error": "…", "message": "…" }`:

| Status | Error                 | Meaning                                                                                         |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `401`  | `unauthorized`        | Missing, invalid, expired, or rejected bearer token; anonymous users are rejected too.          |
| `404`  | `not_found`           | No matching route.                                                                              |
| `503`  | `service_unavailable` | Missing/invalid Supabase configuration, timeout, rate limit, or authentication service failure. |
| `500`  | `internal_error`      | Unexpected API failure.                                                                         |

Upstream error details are not returned to callers. Authentication failures include
`WWW-Authenticate: Bearer`.

`CORS_ORIGINS` is a comma-separated list of exact browser origins. Production defaults to
`https://app.ssmusor.ro`; `.dev.vars` allows the local Vite origins instead. OPTIONS preflight
does not require authentication and allows GET requests with Authorization/Content-Type headers.
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
errors, upstream failures, CORS, and JSON errors. They do not create Supabase users. The [development admin guide](development-admin.md) covers
the seed command and completed live login-to-API verification.
