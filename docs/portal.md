# Portal

The `@ssm-usor/portal` workspace is what a participant sees ([ADR 022](architecture/adr-022-participants-and-the-portal.md)):
a client-only React/Vite SPA at `portal.ssmusor.ro`, beside the app at `app.ssmusor.ro`, on the
same stack (TanStack Router with file routes, TanStack Query, Supabase, `@ssm-usor/ui` and the
design tokens) and with nothing of the app's shell. A participant signs in with a one-time code;
the portal has no password.

The scaffold holds one placeholder page; the sign-in page, the layout with its bar and the
participant's places come with the next steps of the ADR.

## Local configuration

Copy `apps/portal/.env.example` to `apps/portal/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_API_URL=http://localhost:8787
```

The same public values as the app's `.env.local`. Every `VITE_*` value is built into the
browser bundle; never supply a secret key. Without the Supabase values the portal shows an
unavailable screen. Development defaults `VITE_API_URL` to `http://localhost:8787`.

```bash
pnpm dev:portal
```

Open `http://localhost:5174/`. The app keeps port 5173; the two keep separate sessions because
browser storage is per origin.

## Structure

The same folders as the app ([SPA folder structure](app.md)): `src/app/` (runtime, router,
providers), `src/routes/` (thin, unexported file routes, with the committed `routeTree.gen.ts`
that `pnpm generate:routes` regenerates for both SPAs), `src/features/`, `src/lib/` and
`src/api/`. The root route lays every page out in one column of at most 480 px with a 16 px
gutter.

`src/api/http.ts` wires the shared adapter `@ssm-usor/api-http` (origin guard, bearer token,
file downloads, `ApiHttpError`) without the app's PostHog reporting. It is the mutator of the
portal's own generated client, which orval writes from the operations tagged `portal` once the
API has some.

## Cloudflare deployment

`apps/portal/wrangler.jsonc` defines the `ssm-usor-portal` Worker, serves `dist` with SPA
fallback, and declares `portal.ssmusor.ro` as a custom domain, which Cloudflare provisions on
the first deployment as it does `app.ssmusor.ro`. The **Deploy** workflow builds the portal
with the same public `VITE_*` values as the app, deploys it in **Deploy portal** after the API
when the API is selected too, and never waits for the app. **Verify deployed portal** then
runs the Playwright smoke checks in `apps/portal/e2e` against production, advisory like the
app's:

```bash
E2E_PORTAL_URL=https://portal.ssmusor.ro pnpm --filter @ssm-usor/portal test:e2e
```

For packaging validation without publishing, run `pnpm --filter @ssm-usor/portal build`
followed by `pnpm --filter @ssm-usor/portal deploy:dry-run`.
