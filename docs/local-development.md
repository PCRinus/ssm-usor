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
pnpm seed:admin:local
pnpm supabase:status
```

The first start downloads Docker images. Subsequent starts reuse them and the local data.
The seed creates `admin@ssmusor.test` with password `admin123`. Rerunning it updates the
same seed account. It reads the local secret key into memory from `supabase status`,
ignores hosted environment settings, and refuses non-loopback Supabase URLs.

## Connect the SPA and API

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

Use the same local publishable key in both files. The secret/service-role key belongs only
in server-side administration; neither the SPA nor the Hono API needs it here.
Existing hosted environment files are not automatically rewritten by these commands.
Remove any exported `VITE_*` overrides that point to the hosted project.

Build the shared contracts once:

```bash
pnpm --filter @ssm-usor/contracts build
```

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
| Marketing         | http://localhost:4321  |
| Supabase API/Auth | http://127.0.0.1:54321 |
| Supabase Studio   | http://127.0.0.1:54323 |
| Local email inbox | http://127.0.0.1:54324 |

Postgres listens on `127.0.0.1:54322` (database/user/password: `postgres`).
Studio can inspect local Auth users and future application tables. Storage, Realtime,
Edge Functions, and analytics are disabled until needed.

## Stop or switch back

```bash
pnpm supabase:stop
```

This stops this project's Supabase containers and preserves local data. Stop the foreground
app/API servers with Ctrl+C; `pnpm stop:marketing` stops Astro background servers.
To reconnect to hosted Supabase, restore the hosted URL/key in both environment files and
restart the SPA/API. Local configuration does not change GitHub environments or deployments.

Supabase manages its own Auth tables. Future business tables can be added through checked-in
SQL migrations under `supabase/migrations`; an ORM is not required for this setup.
