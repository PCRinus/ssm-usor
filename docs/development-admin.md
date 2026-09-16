# Development admin account

A confirmed email/password account is available in the existing development Supabase project:

| Setting  | Value                  |
| -------- | ---------------------- |
| Project  | `xvhiwymggufbvjdfywjg` |
| Email    | `admin@ssmusor.test`   |
| Password | `admin123`             |

Supabase rejected the requested five-character `admin` password because the project requires
at least six characters. The seed uses `admin123` without changing the project's password policy.
The login form requires an email address, so enter the full email above rather than `admin`.
These are development credentials; the seed is not part of application startup, CI, or deployment.

## Repeatable seed

Use Node.js 24 (`nvm use` from the repository root). The existing local `apps/api/.env.seed`
was populated during setup and is ignored by Git. On another checkout:

```bash
cp apps/api/.env.example apps/api/.env.seed
```

Edit that file:

```dotenv
SUPABASE_URL=https://xvhiwymggufbvjdfywjg.supabase.co
SEED_ADMIN_EMAIL=admin@ssmusor.test
SEED_ADMIN_PASSWORD=admin123
```

Then, from the repository root:

```bash
supabase login
pnpm seed:admin
```

The script reads the configured hosted project's secret key through the authenticated Supabase
CLI. It captures the key in memory without printing or saving it. Alternatively, set
`SUPABASE_SECRET_KEY` in the script's environment or ignored `.env.seed` file. Find that key in
Supabase **Settings → API Keys → Secret keys**. Local/custom Supabase URLs require an explicit
server key; a local instance's legacy service-role key is accepted too.

Keep this server key out of `VITE_*` variables and the Worker configuration. The SPA and Worker
continue to use publishable keys. `.env.seed` is loaded only by the seed command; Wrangler uses
`.dev.vars`, and Vite uses `apps/app/.env.local`. The seed refuses `NODE_ENV=production`.

## What it changes

The script uses Supabase's Auth Admin API to:

- Find the configured email across all user-list pages.
- Create it with a confirmed email and the configured password if absent.
- Set trusted `app_metadata.role` to `admin` and `app_metadata.seed` to
  `ssm-usor-development-admin`.
- On rerun, update the same marked account's password, confirmation, and seed metadata,
  preserving its user ID and other app metadata.
- Refuse to overwrite an existing account without that trusted seed marker. Choose a different
  seed email if it conflicts with an unrelated account.

No invitation/confirmation email is sent, and no ORM or database migration is needed. Supabase
owns the authentication tables. The `admin` metadata is a server-managed marker for future
permission checks; it does not introduce an authorization model or make `/me` admin-only.
User-editable `user_metadata` is not used to grant privileges.

Changing `SEED_ADMIN_PASSWORD` and rerunning the script resets this development account's
password. Changing the email creates a separate account; it does not rename or delete the old one.
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
