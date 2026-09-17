# Development admin account

For an isolated Docker instance, use `pnpm supabase:start` and `pnpm seed:local`.
See [local Supabase development](local-development.md) for the app/API environment settings.
The instructions below describe the existing hosted development project.

The seed creates a confirmed email/password account in the existing development Supabase
project (`xvhiwymggufbvjdfywjg`). The email and password come from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` in the ignored `apps/api/.env.seed`; the defaults are `admin@ssmusor.test`
and `admin123`, and the password only applies when the account is first created. The login form
requires an email address. These are development credentials; the seed is not part of
application startup, CI, or deployment.

Password rules are enforced by Supabase Auth, not by the app: set the minimum length and the
"password requirements" option under **Authentication → Sign In / Providers → Email** on the
hosted project, and keep `supabase/config.toml` in step for the local stack. Client-side checks
only give earlier feedback.

## Repeatable seed

Use Node.js 24 (`nvm use` from the repository root). The existing local `apps/api/.env.seed`
was populated during setup and is ignored by Git. On another checkout:

```bash
cp apps/api/.env.example apps/api/.env.seed
```

Edit that file:

```dotenv
SUPABASE_URL=https://xvhiwymggufbvjdfywjg.supabase.co
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=choose-a-password
```

`pnpm seed:local` reads the same file for the account settings and ignores the URL.

Then, from the repository root:

```bash
supabase login
pnpm seed
```

This seeds the admin user and its organization only. Add `-- --fake` to also upsert fake
clients (`-- --clients 50 --seed 7` to vary them). The same script runs from GitHub as the
manual **Seed database** workflow, which needs no local CLI login; see the
[application deployment guide](app-deployment.md#seed-the-hosted-project). The hosted project currently doubles as
the development environment, so fake data there is acceptable until a separate production
project exists. Set `SEED_ORGANIZATION_NAME` in `.env.seed` to rename the organization.

The script reads the configured hosted project's secret key through the authenticated Supabase
CLI. It captures the key in memory without printing or saving it. Alternatively, set
`SUPABASE_SECRET_KEY` in the script's environment or ignored `.env.seed` file. Find that key in
Supabase **Settings → API Keys → Secret keys**. Local/custom Supabase URLs require an explicit
server key; a local instance's legacy service-role key is accepted too.

Keep this server key out of `VITE_*` variables and the Worker configuration. The SPA and Worker
continue to use publishable keys. `.env.seed` is loaded only by the seed command; Wrangler uses
`.dev.vars`, and Vite uses `apps/app/.env.local`. The seed refuses `NODE_ENV=production`.

## What it changes

The script uses Supabase's Auth Admin API and, with the same secret key, PostgREST to:

- Find the configured email across all user-list pages.
- Create it with a confirmed email and the configured password if absent.
- Set trusted `app_metadata.role` to `admin` and `app_metadata.seed` to
  `ssm-usor-development-admin`.
- On rerun, update the same marked account's confirmation and seed metadata, preserving its
  user ID, password, and other app metadata.
- Refuse to overwrite an existing account without that trusted seed marker. Choose a different
  seed email if it conflicts with an unrelated account.
- Upsert the organization on a fixed identifier and make the seeded user its `owner`.
- With `--fake` (always on for `seed:local`), upsert deterministic fake clients keyed on
  organization and CUI.

No invitation/confirmation email is sent. Supabase owns the authentication tables; the
organization and client rows come from the checked-in migrations, which must already be applied.
The `admin` metadata marks a platform admin: it does not bypass row-level security, it only
allows impersonating a user for support, as described in the [data model](data-model.md).
User-editable `user_metadata` is not used to grant privileges.

`SEED_ADMIN_PASSWORD` applies when the account is created; rerunning the script leaves an
existing account's password alone unless you pass `-- --reset-password`. Quote values that
contain `#` in `.env.seed`, otherwise the rest of the line is read as a comment. Changing the email creates a separate account; it does
not rename or delete the old one.
Password-policy errors are reported without automatically changing credentials or policy.

## Local login

Start the API and SPA in separate terminals:

```bash
pnpm --filter @ssm-usor/contracts build
pnpm dev:api
pnpm dev:app
```

Open `http://localhost:5173/login` and enter the credentials above. The dashboard's **Contul tău**
section loads the verified identity from Hono `/me` through the generated Orval client.

Live verification during setup covered seed creation/rerun with the same user ID, browser login,
a direct dashboard revisit restoring the session, API-backed identity display, token refresh,
invalid-token rejection, and logout returning to the protected-route login screen. Verification
sessions were signed out afterward. Automated tests mock Supabase HTTP responses and never
create remote users.
