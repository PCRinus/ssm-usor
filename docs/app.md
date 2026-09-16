# App foundation

The `@ssm-usor/app` workspace is a client-only React/Vite SPA with TanStack Router, TanStack Query, and Supabase
email/password authentication. Cloudflare serves the static build with SPA fallback routing.

## Local configuration

Copy `apps/app/.env.example` to `apps/app/.env.local` and set the project's URL and
publishable key:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Find these values in the Supabase project **Connect** dialog (Project URL), and
**Settings → API Keys → Publishable key**. The existing project URL is
`https://xvhiwymggufbvjdfywjg.supabase.co`. The local `.env.local` was populated during initial
setup and moved with the workspace rename; new checkouts should copy the example.

Use a modern `sb_publishable_` key from Supabase's project settings. Every `VITE_*` value is public
and included in the browser bundle; never supply a secret or service-role key. `.env.local` is
ignored by Git. Restart Vite after changing configuration if it has not restarted automatically.

```bash
pnpm dev:app
```

Open `http://localhost:5173/`. An existing Supabase email/password user can sign in. This step
does not create users, expose registration, or grant administrator privileges; the admin seed
is a later step. Missing configuration produces an unavailable screen instead of a broken form.

For deployment, supply the same public variables when **building** the SPA. Setting Worker
runtime variables alone cannot change an already-built static bundle. Turbo includes the public
variables and Vite production env files in the build cache key. A build without configuration
is allowed for CI and renders the unavailable screen until rebuilt with configuration.

## Cloudflare deployment

`apps/app/wrangler.jsonc` defines the `ssm-usor-app` Worker, serves `dist`, and declares
`app.ssmusor.ro` as a custom domain. SPA fallback serves the app entry point for direct visits
to routes such as `/dashboard`. `html_handling: none` leaves URL handling to TanStack Router.

The custom domain takes effect on deployment; committing the config does not publish the app.
Cloudflare provisions its DNS record and certificate when the Worker is deployed to the account
with the active `ssmusor.ro` zone. Any existing conflicting DNS record must be resolved first.

`.github/workflows/deploy-app.yml` adds a **manual** Actions workflow called **Deploy app**,
separate from marketing's automatic post-CI deployment. Configure these repository variables
or variables on the `app-production` GitHub environment:

| Name                            | Kind     | Purpose                                                   |
| ------------------------------- | -------- | --------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Variable | Public Supabase project URL, consumed during build.       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable | Public browser key, consumed during build.                |
| `CLOUDFLARE_ACCOUNT_ID`         | Variable | Account hosting the `ssmusor.ro` zone.                    |
| `CLOUDFLARE_API_TOKEN`          | Secret   | Cloudflare deployment credentials, as used for marketing. |

The workflow checks configuration, runs app type checks and tests, builds, then deploys with
Wrangler. No app deployment has been performed as part of the scaffold. Existing GitHub variables
or secrets scoped only to marketing's environment need to be made available to `app-production`.

For local deployment after Cloudflare authentication, `pnpm deploy:app` builds using the app's
local environment and publishes it. For packaging validation without publishing, run
`pnpm --filter @ssm-usor/app build` followed by `pnpm --filter @ssm-usor/app deploy:dry-run`.

The Hono API's production origin allowlist includes `https://app.ssmusor.ro`. Email/password
login does not require a redirect callback; configure Supabase's Site URL and allowed redirect
URLs for this domain when adding confirmation, password reset, or OAuth flows.

## Form conventions

Use React Hook Form with `@hookform/resolvers/zod` for forms. Zod schemas define validation and
inferred TypeScript values; React Hook Form owns registration, errors, focus, and submission state.
The login schema lives in `src/auth/login-schema.ts`, and `use-login-form.ts` keeps submission
behavior out of the page component. Validation errors are displayed next to their fields.

Email is trimmed and validated. Passwords are required but preserved verbatim; login must not
apply new-account password-strength rules to existing credentials. Supabase still validates the
credentials on the server. UI-only schemas stay local; reusable API payload schemas belong in
`packages/contracts`, and Hono must independently validate incoming API requests.

## Routes and providers

`src/router.ts` defines the initial route tree in code:

| Route        | Behavior                                                            |
| ------------ | ------------------------------------------------------------------- |
| `/`          | Redirects to `/dashboard`, which checks the session.                |
| `/login`     | Email/password form; an existing session redirects to `/dashboard`. |
| `/dashboard` | Protected landing page with the account email and logout.           |
| Other paths  | Not-found screen with a link back to the start.                     |

Future protected pages belong under the `_authenticated` layout. Route guards await initial
session restoration, avoiding a premature redirect on browser refresh. The app also handles
loading and session-initialization errors. Login always navigates to `/dashboard`; arbitrary
redirect query parameters are not used.

`src/app-runtime.ts` creates one QueryClient, auth store, and router per app instance. The query
client is both a React provider and typed router context, ready for generated Orval query options
in route loaders. API fetching and generated hooks arrive with the OpenAPI/Orval step; no temporary
handwritten API client is introduced here.

## Authentication behavior

- The browser Supabase SDK signs in, persists the session, and refreshes tokens. URL token
  detection is disabled because this pass supports email/password only.
- `src/auth/auth-store.ts` subscribes to SDK auth events, including changes from other tabs.
  It avoids overwriting a newer event with an older initialization result.
- Account changes and sign-out clear query and mutation caches. Clearing queries cancels
  in-flight requests when the eventual HTTP adapter consumes their abort signals.
- Token refresh for the same account retains cached query data.
- Auth changes recheck route guards; signed-out users immediately stop seeing protected content.
- Logout uses Supabase's `local` scope to end the current session, leaving other device sessions
  alone. If logout fails, the app reports the failure without pretending the session ended.
- Login credentials are submitted directly through the SDK, not stored as TanStack mutation data.

These browser guards control navigation only. The [Hono API](api.md) independently verifies bearer
tokens for `/me`. Application permissions belong in API handlers as business routes are added;
being signed in does not itself make a user an administrator. The current landing page contains
no API-backed business data; the generated API client arrives in the OpenAPI/Orval step.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm deploy:dry-run
```

Vitest and Testing Library exercise real route transitions and form interactions against a mocked
Supabase auth boundary. Tests cover restored sessions, invalid credentials, successful login and
logout, remote sign-out, failed logout, account/cache isolation, cancellation, initialization races,
missing configuration, and not-found routes. They do not create remote users or prove that a seeded
admin can sign in; that live check belongs with the seed step.
