# App foundation

The `@ssm-usor/app` workspace is a client-only React/Vite SPA with TanStack Router, TanStack Query, and Supabase
email/password authentication. Cloudflare serves the static build with SPA fallback routing.

## Local configuration

Copy `apps/app/.env.example` to `apps/app/.env.local` and set the project's URL and
publishable key:

```dotenv
VITE_API_URL=http://localhost:8787
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

Open `http://localhost:5173/`. An existing Supabase email/password user can sign in.
The [development admin guide](development-admin.md) documents the seeded account and how to
rerun the seed. Registration is not exposed. Missing configuration produces an unavailable
screen instead of a broken form.

For deployment, supply the same public variables when **building** the SPA. Setting Worker
runtime variables alone cannot change an already-built static bundle. Turbo includes the public
variables and Vite production env files in the build cache key. A build without configuration
is allowed for CI and renders the unavailable screen until rebuilt with configuration.

## Build tooling

`vite.config.ts` runs three plugins in order: the TanStack Router plugin (file routes and the
generated route tree, with automatic per-route code splitting), Tailwind, and the React plugin
with the **React Compiler** babel plugin. The compiler memoizes components and hooks
automatically, so manual `useMemo`, `useCallback`, and `memo` are not needed for performance;
the `react-hooks` lint rules enforce the constraints the compiler relies on.

The **TanStack devtools** (router and query panels) load lazily from the root route only when
Vite runs in development mode. The check is a build-time constant, so production bundles and
tests contain no devtools code. Open them from the floating trigger in the bottom-right corner of
`pnpm dev:app`.

## Cloudflare deployment

`apps/app/wrangler.jsonc` defines the `ssm-usor-app` Worker, serves `dist`, and declares
`app.ssmusor.ro` as a custom domain. SPA fallback serves the app entry point for direct visits
to routes such as `/dashboard`. `html_handling: none` leaves URL handling to TanStack Router.

The custom domain takes effect on deployment; committing the config does not publish the app.
Cloudflare provisions its DNS record and certificate when the Worker is deployed to the account
with the active `ssmusor.ro` zone. Any existing conflicting DNS record must be resolved first.

The **CI** workflow automatically deploys affected applications on pushes to `main`. When
both API and SPA change, the API at `api.ssmusor.ro` is deployed and checked before the SPA.
SPA-only changes leave the API deployment untouched. The SPA build and API bindings use the
same public Supabase configuration. See the [application deployment guide](app-deployment.md) for the required
GitHub environment values, release steps, smoke checks, and recovery guidance.

For packaging validation without publishing, run `pnpm --filter @ssm-usor/app build` followed
by `pnpm --filter @ssm-usor/app deploy:dry-run`.

## Form conventions

Use React Hook Form with `@hookform/resolvers/zod` for forms. Zod schemas define validation and
inferred TypeScript values; React Hook Form owns registration, errors, focus, and submission state.
The login schema lives in `src/auth/login-schema.ts`, and `use-login-form.ts` keeps submission
behavior out of the page component. Validation errors are displayed next to their fields.
The client form follows the same split: `src/clients/client-form-schema.ts` validates string
form values in Romanian and converts them to the API request, and `use-client-form.ts` owns the
ANAF lookup, the create mutation, list invalidation, and the mapping of API errors (409 to the
CUI field, 400 issues to their fields, everything else to a form-level message).

Email is trimmed and validated. Passwords are required but preserved verbatim; login must not
apply new-account password-strength rules to existing credentials. Supabase still validates the
credentials on the server. UI-only schemas stay local; reusable API payload schemas belong in
`packages/contracts`, and Hono must independently validate incoming API requests. The SPA depends
on `@ssm-usor/contracts` for shared value helpers such as the county list and CUI checksum, not
for transport types, which come from the generated client.

## Routes and providers

Routes are file-based under `src/routes`; the TanStack Router Vite plugin generates
`src/routeTree.gen.ts` from them (also via `pnpm generate:routes`, which CI checks like the
API client). `src/router.ts` builds the router from that tree with the injected context.

| File                                                          | Route                        | Behavior                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/index.tsx`                                            | `/`                          | Redirects to `/dashboard`, which checks the session.                                                                                   |
| `routes/login.tsx`                                            | `/login`                     | Email/password form; an existing session redirects to `/dashboard`.                                                                    |
| `routes/_authenticated.tsx`                                   | pathless                     | Session guard and the app shell for every protected page.                                                                              |
| `routes/_authenticated/dashboard.tsx`                         | `/dashboard`                 | Protected landing page with the account email and logout.                                                                              |
| `routes/_authenticated/clients.tsx`                           | pathless                     | Clients section layout carrying the breadcrumb title.                                                                                  |
| `routes/_authenticated/clients/index.tsx`                     | `/clients`                   | Protected list of the organization's active clients.                                                                                   |
| `routes/_authenticated/clients/new.tsx`                       | `/clients/new`               | Protected form that creates a client, with ANAF prefill by CUI.                                                                        |
| `routes/_authenticated/clients/$clientId.tsx`                 | `/clients/:id`               | Client layout: loads the client from the cached list, shows its header and section tabs, returns the breadcrumb label from its loader. |
| `routes/_authenticated/clients/$clientId/index.tsx`           | `/clients/:id`               | Redirects to the employees section until a client overview exists.                                                                     |
| `routes/_authenticated/clients/$clientId/employees.tsx`       | pathless                     | Employees section layout carrying the breadcrumb title.                                                                                |
| `routes/_authenticated/clients/$clientId/employees/index.tsx` | `/clients/:id/employees`     | The client's employees with a status filter in the search params.                                                                      |
| `routes/_authenticated/clients/$clientId/employees/new.tsx`   | `/clients/:id/employees/new` | Form that adds an employee to the client.                                                                                              |
| `routes/__root.tsx`                                           | other paths                  | Not-found screen with a link back to the start; route error screen.                                                                    |

A route whose breadcrumb label depends on data (the client name) returns `crumb` from its
loader instead of `staticData.title`; the shell reads either.

Each route file exports `Route` with its guard, loader, and component. A route sets
`staticData.title` to appear in the shell breadcrumb; nested sections add a layout file such
as `clients.tsx` so the parent crumb links back. New protected pages go under
`routes/_authenticated`; the guard there awaits initial session restoration, avoiding a
premature redirect on browser refresh. The app also handles loading and session-initialization
errors. Login always navigates to `/dashboard`; arbitrary redirect query parameters are not used.

`src/app-runtime.ts` creates one QueryClient, auth store, and router per app instance. The query
client is both a React provider and typed router context, available for generated Orval query options
in route loaders. The dashboard uses the generated `useGetMe` hook with request configuration
from the router context. See the [API client guide](api-client.md) for generation and error handling.

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
being signed in does not itself make a user an administrator. The dashboard loads the verified account identity through the generated client.
Business data and application roles will be added in later steps.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm deploy:dry-run
```

Playwright deployment tests live in `e2e/` and run separately with `pnpm --filter @ssm-usor/app test:e2e`.
See the [deployment guide](app-deployment.md#playwright-deployment-tests) for server setup and credentials.

Vitest and Testing Library exercise real route transitions and form interactions against a mocked
Supabase auth boundary. Tests cover restored sessions, invalid credentials, successful login and
logout, remote sign-out, failed logout, account/cache isolation, cancellation, initialization races,
missing configuration, and not-found routes. They do not create remote users. The [development admin guide](development-admin.md) records
the separate live login, API, session-restoration, and logout checks.

## Workspace layout

Authenticated routes share `src/components/app-shell.tsx`. A full-width sticky header
keeps the logo and sidebar toggle visible independently of sidebar collapse. The
account menu sits at the bottom of the sidebar and remains accessible as an avatar
when collapsed. Breadcrumbs sit above the page content, and a small footer follows the content.
The sidebar collapses to icons on desktop and uses a Sheet on mobile; selecting a
mobile navigation link closes the Sheet.

- `/dashboard`: overview and existing account/API status.
- `/clients`: the organization's active clients from `GET /clients`, with loading, empty,
  and error states (a missing membership is explained; other failures offer a retry).
- `/clients/new`: the creation form, laid out as full-width sections with their purpose on
  the left and fields on the right. Entering a CUI and pressing **Caută la ANAF** calls `GET /companies/lookup` and prefills the
  name, VAT status, CAEN code, trade register number, and registered office; a missing record
  or an ANAF outage leaves manual entry available. The CAEN field is a searchable combobox
  over the full CAEN Rev. 3 class list from `packages/contracts` (code prefix or words from
  the activity name, diacritics optional); a four-digit code outside the list can still be
  used. Saving posts to `POST /clients`, invalidates the list, and returns to `/clients`.
  Search, editing, archiving, and row actions are not implemented yet. The company name
  opens the client.
- `/clients/:id/employees`: the client's employees from `GET /clients/{clientId}/employees`,
  under a client summary card (name, CUI, main activity, registered office, declared headcount) and section tabs. The list shows
  name and internal number, job title, contact, and hire date (plus the leave date for former
  employees); **Angajați actuali** (the default) and **Foști angajați** (`?status=terminated`)
  switch between the two groups through the search params. The
  CNP is never part of the list. The client itself comes from the cached clients list, since
  the API has no single-client read yet; an unknown id shows a not-found screen.
  Each row has an actions menu: **Marchează plecarea…** opens a dialog asking for the leave
  date (today by default, not before the hire date) and calls `PATCH …/status`; on the former
  employees tab **Reactivează…** clears it, for undoing a mistake, since a rehire after a gap
  is a new employee. The list is invalidated so the row moves between the two tabs.
- `/clients/:id/employees/new`: the creation form, rendered without the client summary and
  tabs (`staticData.fullPage`); a disabled first field names the client. Sections: employer, identity
  (name, optional CNP and internal number), employment (job title, hire date), contact, and
  the training-sheet fields (birth date, birth place, address, blood group, Rh, notes). A valid
  CNP prefills the birth date on blur, and a contradicting birth date is rejected before the
  request, mirroring the API rule. Saving posts to `POST /clients/{clientId}/employees`,
  invalidates every filtered variant of the list, and returns to it; a duplicate CNP or
  number is shown on its field and an archived client on the form.

Sign-out is available from the sidebar account menu on every authenticated route.
Failed sign-out keeps the session and displays a retry action in the shared layout.
