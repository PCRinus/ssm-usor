# Admin app

The `@ssm-usor/admin` workspace is the platform owner's area ([ADR 038](architecture/adr-038-admin-area.md)):
a client-only React/Vite SPA at `admin.ssmusor.ro` (`admin.non-prod.ssmusor.ro` in non-prod),
served by a Worker of its own, `ssm-usor-admin`. It is built like the portal (TanStack Router
with file routes, TanStack Query, Supabase, `@ssm-usor/ui`) and leaves out what the member apps
carry for members: no PostHog, no Lingui, no help links, no Actualizări block. It is in English.

## Pages

| Route      | What                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| `/sign-in` | Email and password, with the Turnstile check Supabase Auth's CAPTCHA asks for             |
| `/enrol`   | The first sign-in: the QR code and key of a new authenticator (TOTP), then its first code |
| `/verify`  | Every later sign-in: a code from the authenticator                                        |
| `/`        | "Signed in as …" and Sign out; "This account has no admin access" when the API says `403` |

Each route sends the session where it stands: no session to `/sign-in`, a session whose token is
`aal1` to `/enrol` when the account has no verified factor and to `/verify` when it has one, and
only an `aal2` session to `/`. The pages read the level from the token for that choice alone;
the API decides.

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

| Route           | Answer                                 |
| --------------- | -------------------------------------- |
| `GET /admin/me` | `{ id, email }` of the signed-in admin |

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
laptop has an Access token. Git ignores the file, and a test fails if `wrangler.jsonc` ever sets
the variable. Any other value, or none, keeps the check on.

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
