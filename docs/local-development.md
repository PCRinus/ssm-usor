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
| Legislation cron  | http://localhost:8792  |
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

## Legislation check

The daily check of the watched acts ([deployment](deployment.md#legislation-worker)) runs
against the local stack in two ways. Both read the real Portal Legislativ, one act every few
seconds, so a full run takes about four minutes, and both log the run in `legal_check_runs`.
The tables come from the migrations, so a stack started before them needs
`supabase migration up --local` first.

The script, from Node:

```bash
pnpm legislation:check:local
pnpm legislation:check:local --acts packages/legislation/fixtures/legal-acts.json
```

`--acts` takes another act list in the shape of the engine's `legal-acts.json`; the fixture
above holds three acts and runs in seconds. `pnpm legislation:check` does the same against
the hosted project, from `SUPABASE_URL` in `apps/api/.env.seed`.

The deployed Worker reads the portal through a relay
([deployment](deployment.md#legislation-worker)), but a laptop reaches the portal directly, so
the script and the local cron skip the relay by default. To test the relay from a laptop, give
the script its address and the Access service token from the homelab Terraform outputs:

```bash
LEGISLATION_RELAY_ORIGIN=https://legislation-relay.home-server.me \
LEGISLATION_RELAY_CLIENT_ID="$(terraform output -raw legislation_relay_client_id)" \
LEGISLATION_RELAY_CLIENT_SECRET="$(terraform output -raw legislation_relay_client_secret)" \
pnpm legislation:check:local --acts packages/legislation/fixtures/legal-acts.json
```

Run the `terraform output` commands in the homelab repository, or paste the values. The last
line of the output names the relay the run went through. A missing or wrong token makes the
relay answer with Access's redirect or `403`, and every act fails.

The Worker's cron, in `wrangler dev`: copy `apps/legislation/.dev.vars.example` to `.dev.vars`
and put in the local secret key from `pnpm supabase:status`, build the packages it imports, and
start it with scheduled events exposed over HTTP. The example's `LEGISLATION_RELAY_ORIGIN` overrides the
relay in `wrangler.jsonc` with the portal itself; to test the relay, delete that line and fill
in the two `LEGISLATION_RELAY_CLIENT_*` values:

```bash
pnpm --filter @ssm-usor/document-engine --filter @ssm-usor/legislation-check build
pnpm legislation:cron
curl "http://localhost:8792/__scheduled?cron=17+3+*+*+*"
```

`pnpm legislation:cron` runs `wrangler dev --test-scheduled` on port 8792. The `curl` returns
when the run ends; the Worker's terminal prints a line per act and the run's outcome, and a
failed run answers `500`, as Cloudflare marks the invocation failed. It is not part of
`pnpm dev`. Never put the hosted secret key in `.dev.vars`.

The local Worker serves `POST /run` too, the [run by hand](deployment.md#running-the-check-by-hand)
of the deployed one. Uncomment `LEGISLATION_RUN_SECRET` in `.dev.vars` (any value; without it
`/run` answers `404`), restart `pnpm legislation:cron`, and send the same value:

```bash
curl -sS -N -X POST http://localhost:8792/run -H "Authorization: Bearer local-run-secret"
```

The run's lines arrive as it goes, ending with `Run <id> succeeded.` or `Run <id> failed.`.
Wrangler restarts the Worker when a file under `apps/legislation` changes, which cuts a run
short and leaves its row `running`; a second run is refused with `409` for fifteen minutes,
unless that row is deleted in Studio.

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
