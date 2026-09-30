# Local Supabase

Run Auth and Postgres on your machine using Docker and the checked-in
`supabase/config.toml`. This is a separate database from the hosted Supabase project;
it does not download hosted users or data. No Supabase login or project linking is needed.

## Start and seed

Prerequisites: Node 24, pnpm, Docker Desktop running, and the Supabase CLI on your PATH.
This setup was verified with CLI **2.117.0** and uses its publishable/secret keys.
See the [Supabase CLI installation guide](https://supabase.com/docs/guides/local-development/cli/getting-started).

From the repository root:

```bash
pnpm supabase:start
pnpm seed:local
pnpm templates:register:local
pnpm supabase:status
```

`templates:register:local` uploads the built-in Word templates to Storage and registers them,
which document generation needs; see [the document engine](document-engine.md#registering-the-templates).

The first start downloads Docker images. Subsequent starts reuse them and the local data.
Starting applies every migration under `supabase/migrations`. The seed creates the admin
account, the organization "SSM Ușor" with that user as owner, 25 fake clients, and a few fake employees per client, generated
with Faker's Romanian locale from a fixed seed value. The account comes from `SEED_ADMIN_EMAIL`
and `SEED_ADMIN_PASSWORD` in the ignored `apps/api/.env.seed` (defaults: `admin@ssmusor.test`,
`admin123`), so local and hosted seeds create the same login. Local Auth enforces the
password policy in `supabase/config.toml` (eight characters, upper and lower case, digits).
Rerunning it updates the same account and rows. Pass `-- --clients 50` or `-- --seed 7` for
a different dataset. The seed reads the local secret key into memory from `supabase status`,
ignores hosted environment settings, and refuses non-loopback Supabase URLs.

## Connect the SPA and API

Build the packages the API imports once:

```bash
pnpm --filter @ssm-usor/contracts --filter @ssm-usor/document-engine build
```

### With `pnpm dev:local`

```bash
pnpm dev:local
pnpm dev:local --app-port 5174 --api-port 8788
```

It starts the API (`wrangler dev`) and the SPA (Vite) against the local stack, without
changing `apps/app/.env.local` or `apps/api/.dev.vars`, so those can keep the hosted settings.
It reads the local address and keys from `supabase status`, refuses an address that is not
on this machine, and stops with a message when the stack is not running
(`pnpm supabase:start` first; it does not start Docker). Ctrl+C stops both servers.

- The SPA gets the local Supabase URL, publishable key and API address as `VITE_*` process
  variables, which take precedence over `.env.local`.
- The API gets the local Supabase URL and keys, the local stack's Send Email hook secret, and
  origins for the chosen ports as `--var` flags, which take precedence over `.dev.vars`. The
  other settings (Gotenberg, Turnstile, PostHog, the marketing origin) come from `.dev.vars`
  as usual. The local secret key is then visible in the process list; it only opens the local
  stack.
- `--app-port` and `--api-port` (defaults 5173 and 8787) let it run beside a `pnpm dev` that
  points at hosted. A port already in use stops it with a message; nothing is killed.
- The mail Worker: when port 8790 is free it starts one; when a `pnpm dev` already runs it,
  the API uses that one through Wrangler's dev registry.
- It does not seed. An empty database needs `pnpm seed:local` and
  `pnpm templates:register:local`.
- The local Auth still sends its emails (signup, password reset) to port 8797, where the flow
  tests' API listens (see [Emails from the local Auth](#emails-from-the-local-auth)), not to
  this API.

### By editing the environment files

Save your existing hosted settings before switching. Edit these ignored files; do not put
the settings in a root `.env`. Replace `sb_publishable_LOCAL_KEY` below with the
**Publishable** key from `pnpm supabase:status`.

`apps/app/.env.local`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_LOCAL_KEY
VITE_API_URL=http://localhost:8787
```

`apps/api/.dev.vars`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_LOCAL_KEY
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Use the same local publishable key in both files. The SPA never gets the secret key. The API
needs it only for the waitlist; to try that locally, add the commented settings from
`apps/api/.dev.vars.example` (local secret key, Turnstile's test secret, local origins) and
run `pnpm dev:mail` next to `pnpm dev:api`. The mail Worker prints the confirmation email,
link included, to its console.
Existing hosted environment files are not automatically rewritten by these commands.
Remove any exported `VITE_*` overrides that point to the hosted project.

Then use the existing commands in separate terminals:

```bash
pnpm dev:api
pnpm dev:app
pnpm dev:marketing
```

Restart existing servers after changing environment files. Open the SPA login page and
use the seeded credentials. Login and the dashboard's `/me` request now use local Auth.
The marketing site does not need Supabase settings.

| Service           | URL                    |
| ----------------- | ---------------------- |
| React SPA         | http://localhost:5173  |
| Hono API          | http://localhost:8787  |
| Mail Worker       | http://localhost:8790  |
| Marketing         | http://localhost:4321  |
| Supabase API/Auth | http://127.0.0.1:54321 |
| Supabase Studio   | http://127.0.0.1:54323 |
| Local email inbox | http://127.0.0.1:54324 |

Postgres listens on `127.0.0.1:54322` (database/user/password: `postgres`).
Studio can inspect local Auth users and application tables. Storage is on: generated
documents and their templates are files ([ADR 005](architecture/adr-005-document-generation.md)).
Realtime, Edge Functions, and analytics are disabled until needed.

A stack started before Storage was switched on has no `storage.buckets` table, and the
documents migration fails on it. Restart it once with `pnpm supabase:stop` and
`pnpm supabase:start`; a plain stop keeps the local data.

### Emails from the local Auth

The local stack's Auth hands its emails (signup confirmation, password reset) to
`http://host.docker.internal:8797/hooks/supabase/send-email`: the API that the browser flow
tests start, which keeps emails in memory. Outside those tests nothing listens there, and
signing up or asking for a reset against the local stack fails.

To receive them from your own `pnpm dev` instead, point the `uri` in `supabase/config.toml`
at port 8787, restart the stack (`pnpm supabase:stop`, `pnpm supabase:start`), and give the API
the `SUPABASE_AUTH_HOOK_SECRET` from `apps/api/.dev.vars.example`. The mail Worker then logs
the email, or sends it when it holds a Resend key. Do not commit that change.

## Stop or switch back

```bash
pnpm supabase:stop
```

This stops this project's Supabase containers and preserves local data. Stop the foreground
app/API servers with Ctrl+C; `pnpm stop:marketing` stops Astro background servers.
To reconnect to hosted Supabase, restore the hosted URL/key in both environment files and
restart the SPA/API. Local configuration does not change GitHub environments or deployments.

Supabase manages its own Auth tables. Business tables are checked-in SQL migrations under
`supabase/migrations`; there is no ORM. After changing the schema:

```bash
supabase db reset        # rebuild the local database from all migrations
pnpm supabase:test       # pgTAP policy tests in supabase/tests
pnpm generate:db         # refresh apps/api/src/database.types.ts (checked in CI)
pnpm seed:local
pnpm templates:register:local   # a reset also empties the template registry
```

See the [data model](data-model.md) for the tenancy design and the migration workflow.
