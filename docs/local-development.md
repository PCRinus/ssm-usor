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
pnpm --filter @ssm-usor/contracts --filter @ssm-usor/document-engine --filter @ssm-usor/import build
```

### With `pnpm dev:local`

```bash
pnpm dev:local
pnpm dev:local --app-port 5175 --api-port 8788
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
- The mail and SMS Workers: when port 8790 (mail) or 8793 (SMS) is free it starts one; when a
  `pnpm dev` already runs it, the API uses that one through Wrangler's dev registry.
- It does not seed. An empty database needs `pnpm seed:local` and
  `pnpm templates:register:local`.
- The local Auth still sends its emails (signup, password reset) and texted codes to port 8797, where the flow
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
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
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
| Portal            | http://localhost:5174  |
| Hono API          | http://localhost:8787  |
| Mail Worker       | http://localhost:8790  |
| SMS Worker        | http://localhost:8793  |
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

The local stack's Auth hands its emails (signup confirmation, password reset, the portal's
code) to `http://host.docker.internal:8797/hooks/supabase/send-email`, and the portal's texted
codes to `…/hooks/supabase/send-sms`: the API that the browser flow tests start, which keeps
both in memory. Outside those tests nothing listens there, and
signing up or asking for a reset against the local stack fails.

To receive them from your own `pnpm dev` instead, point the `uri` in `supabase/config.toml`
at port 8787, restart the stack (`pnpm supabase:stop`, `pnpm supabase:start`), and give the API
the `SUPABASE_AUTH_HOOK_SECRET` from `apps/api/.dev.vars.example`. The mail Worker then logs
the email, or sends it when it holds a Resend key. The same goes for the Send SMS hook, with
`SUPABASE_AUTH_SMS_HOOK_SECRET` and the SMS Worker. Do not commit that change.

## Signing locally

Signing ([ADR 023](architecture/adr-023-advanced-electronic-signature.md)) needs three things
beside the local stack: the PDF converter, the signer, and a signing authority of your own.
`compose.yaml` runs the first two from the same images the deployment builds:

```bash
pnpm dev:pdf                               # Gotenberg on port 3300, the signer on 3301
pnpm --filter @ssm-usor/api signing:ca     # prints the three SIGNING_* lines
```

`pnpm dev` runs `pnpm dev:pdf` first and only warns when Docker is not up. Put these lines in
`apps/api/.dev.vars`, the last three as `signing:ca` printed them, each PEM on one line with
`\n` for its line breaks:

```
GOTENBERG_URL=http://localhost:3300
SIGNER_URL=http://localhost:3301
SIGNING_CA_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
SIGNING_CA_CERT="-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"
SIGNING_KEY_ENCRYPTION_KEY=…
```

Then restart `pnpm dev`; `pnpm dev:local` reads the same lines. The data comes from
`pnpm seed:local` and `pnpm templates:register:local`: the sheets, the agreement and the annex
are templates like the rest. Without the converter a sheet or an agreement has no PDF; without
the signer or the three values, signing answers `503` (`signer_unavailable`,
`signing_unavailable`) and neither signs nor sends a code. The codes go through the mail and SMS
Workers that `pnpm dev` starts, which print each message, the code included, while they hold no
Resend key or Twilio settings. A new authority made later
makes every local identity reissue at its next signature, which is harmless.

Two scripts run the whole of it against the local stack, with an authority of their own, so they
need neither the three values nor `pnpm dev`:

```bash
GOTENBERG_URL=http://localhost:3300 SIGNER_URL=http://localhost:3301 \
  pnpm --filter @ssm-usor/api signed-sheet:check:local -- --out /tmp/signed-sheets
GOTENBERG_URL=http://localhost:3300 SIGNER_URL=http://localhost:3301 \
  pnpm --filter @ssm-usor/api signing:check:local
```

`signed-sheet:check:local` records trainings for a seeded employee, places, signs, voids and
continues the sheet, validates every signature and writes the PDFs to the folder.
`signing:check:local` signs a training as a member, the agreement and the trainee's slot as the
employee in the portal and the agreement for the employer as the client administrator, over
HTTP, then validates the stored sheet and agreement and prints the evidence. Both need:

- the local stack running and the Supabase CLI on the PATH: they read its address and keys from
  `supabase status`, and refuse any other;
- `pnpm seed:local` and `pnpm templates:register:local` done, and a seeded employee with no
  training records (and, for `signing:check:local`, no participant);
- `pnpm dev:pdf` up, with the two URLs above exported.

`signed-sheet:check:local` also needs `openssl` on the PATH, which makes its throwaway authority.
`signing:check:local` starts the API from `scripts/e2e-server.ts` on port 8797, which must be
free, so not while the browser flows run; and it removes the evidence at the end as the
database's superuser, through `docker exec` into the `supabase_db_<project_id>` container. Both
remove everything they made. CI runs neither.

The browser flows that sign, `apps/app/e2e/flows/signatures.spec.ts` and
`apps/portal/e2e/flows/signing.spec.ts`, need `GOTENBERG_URL`, `SIGNER_URL` and the three
`SIGNING_*` values exported in the shell that runs them, since the API they start reads its
environment and not `.dev.vars`; without them the app's flow is skipped and the portal's stops
before asking for a code ([app](app.md), [portal](portal.md#browser-flows)).

## Payments locally

Billing ([ADR 029](architecture/adr-029-billing-plans-and-trials.md)) runs locally against the
Stripe sandbox, never the live account. Put the sandbox's keys in the two local files:

```
# apps/api/.dev.vars
STRIPE_SECRET_KEY=sk_test_…
OBLIO_CLIENT_ID=…
OBLIO_CLIENT_SECRET=…
OBLIO_DOCUMENTS=proforma

# apps/app/.env.local
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…
```

Stripe cannot reach `localhost`, so its events (a payment, a new card, a refund) need a listener
that holds a connection open to Stripe and passes each one to the local API:

```bash
pnpm dev:stripe            # the Stripe CLI from Stripe's Docker image, in the background
pnpm dev:stripe --stop
```

It needs only Docker and the key above: no Stripe CLI install and no `stripe login`. It refuses a
key that is not a sandbox key, writes the listener's signing secret to `STRIPE_WEBHOOK_SECRET` in
`apps/api/.dev.vars` the first time (restart the API then), and forwards the events the deployed
endpoints get. `pnpm dev` runs it first, says nothing without a key, and only warns when it cannot
start. `docker logs -f ssm-usor-stripe` shows each event and the API's answer.

The listener gets every event of the sandbox, the non-prod API's too; the API leaves alone those
for an organization its database does not have. Pay with Stripe's
[test cards](https://docs.stripe.com/testing), such as `4242 4242 4242 4242`, or
`4000 0027 6000 3184` for one that asks for 3D Secure.

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
