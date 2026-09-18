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
rerun the seed. Registration is not exposed; an account is created only by accepting an
invitation. Missing configuration produces an unavailable
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

| File                                                                | Route                                | Behavior                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/index.tsx`                                                  | `/`                                  | Redirects to `/dashboard`, which checks the session.                                                                                                      |
| `routes/login.tsx`                                                  | `/login`                             | Email/password form; an existing session redirects to `/dashboard`.                                                                                       |
| `routes/accept-invitation.tsx`                                      | `/accept-invitation`                 | Public. Where an invitation email lands: create an account, or join with an existing one.                                                                 |
| `routes/forgot-password.tsx`                                        | `/forgot-password`                   | Public. Asks Supabase for a password reset email.                                                                                                         |
| `routes/reset-password.tsx`                                         | `/reset-password`                    | Public. Where a password reset email lands: choose a new password.                                                                                        |
| `routes/_authenticated.tsx`                                         | pathless                             | Session guard and the app shell for every protected page.                                                                                                 |
| `routes/_authenticated/dashboard.tsx`                               | `/dashboard`                         | Protected landing page with the account email and logout.                                                                                                 |
| `routes/_authenticated/organization.tsx`                            | `/organization`                      | The organization's members for everyone; pending invitations and the invite dialog for owners.                                                            |
| `routes/_authenticated/profile.tsx`                                 | `/profile`                           | The user's name (editable), email, and organization.                                                                                                      |
| `routes/_authenticated/clients.tsx`                                 | pathless                             | Clients section layout carrying the breadcrumb title.                                                                                                     |
| `routes/_authenticated/clients/index.tsx`                           | `/clients`                           | Protected, paginated and sortable list of the organization's active clients.                                                                              |
| `routes/_authenticated/clients/new.tsx`                             | `/clients/new`                       | Protected form that creates a client, with ANAF prefill by CUI.                                                                                           |
| `routes/_authenticated/clients/$clientId.tsx`                       | `/clients/:id`                       | Client layout: loads the client through `GET /clients/{clientId}`, shows its summary card and section tabs, returns the breadcrumb label from its loader. |
| `routes/_authenticated/clients/$clientId/index.tsx`                 | `/clients/:id`                       | Redirects to the employees section until a client overview exists.                                                                                        |
| `routes/_authenticated/clients/$clientId/employees.tsx`             | pathless                             | Employees section layout carrying the breadcrumb title.                                                                                                   |
| `routes/_authenticated/clients/$clientId/employees/index.tsx`       | `/clients/:id/employees`             | The client's employees with a status filter in the search params.                                                                                         |
| `routes/_authenticated/clients/$clientId/employees/new.tsx`         | `/clients/:id/employees/new`         | Form that adds an employee to the client.                                                                                                                 |
| `routes/_authenticated/clients/$clientId/employees/$employeeId.tsx` | `/clients/:id/employees/:employeeId` | Employee record, the only page that can reveal the CNP.                                                                                                   |
| `routes/__root.tsx`                                                 | other paths                          | Not-found screen with a link back to the start; route error screen.                                                                                       |

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

## Accepting an invitation

`/accept-invitation?token=…` is the second public route. It posts the token to
`/invitations/lookup`, which changes nothing, and then shows one of:

- a form for the name and a password when the address has no account. Submitting calls
  `/invitations/accept`, signs in with the password just typed, and opens the dashboard; if
  only that sign-in fails, the person lands on the login page with their new account.
- a prompt to sign in when the address has an account. The login page takes the token as
  `?invitation=` and returns here afterwards. It accepts a token only, never a URL, so it
  cannot be used to redirect elsewhere.
- an accept button when the signed-in account has the invited address, with a name field
  only if the account has no profile. It calls `/invitations/join` and opens `/organization`.
- a request to sign out when the signed-in account has another address.
- an explanation for an expired, revoked, already accepted, or unknown link.

The password rules are the shared ones described under Passwords below. The terms are shown as a notice with links, and the
version sent is `currentTermsVersion` from the contracts. The browser's default referrer
policy keeps the query string, and so the token, out of requests to other origins.

## Passwords

Password reset is Supabase Auth's own recovery flow; the app adds no token handling of its
own. `/forgot-password` calls `resetPasswordForEmail` and shows the same confirmation for any
address, so it cannot be used to find out who has an account. Supabase hands the email to
the API's Send Email hook (see the [API guide](api.md#supabase-auth-emails)), which links to
`/reset-password?token_hash=…`.

That page does nothing when opened. On submit it checks the password rules, then calls
`verifyOtp` with the token, which signs the person in, then `updateUser`, then signs other
devices out and opens the dashboard. Verifying only on submit keeps a mail scanner from
using the token up. The token works once, so a password Supabase rejects as too weak is
retried without verifying again. Supabase also refuses the current password; here that
counts as done, because the person is signed in with the password they asked for and a
distinct error would confirm a guess to whoever holds the link. An expired, used, or missing token leads to
a page that offers a new link.

"Profilul meu" changes the password of a signed-in user. It asks for the current password
and checks it with `signInWithPassword` before `updateUser`, so an unlocked screen is not
enough to take over the account. There, a new password equal to the current one is reported
on the field.

The rules live in `src/auth/password-schema.ts` and mirror `newPasswordSchema` in the
contracts and the policy in `supabase/config.toml`. The accept-invitation page uses the same
ones. `AuthClient` in `src/auth/auth-store.ts` lists the Supabase calls the app makes;
`PublicFrame` and `PasswordInput` are shared by the pages outside the shell.

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

Browser flow tests live in `e2e/flows/` and run with `pnpm --filter @ssm-usor/app test:e2e:flows`
after `pnpm supabase:start`. They cover what creates users: inviting, accepting with a new
and with an existing account, changing a role, removing a member, resetting and changing a
password. `playwright.flows.config.ts` starts everything else itself, on ports of its own so
`pnpm dev` can keep running: the API served by Node from `apps/api/scripts/e2e-server.ts`,
pointed at the local Supabase stack, and a preview of a production build of the SPA. That API
refuses any Supabase URL that is not local and keeps emails in memory instead of calling the
mail Worker, so a flow test cannot send email or reach the hosted project; the specs read
the emailed link back from `GET /__e2e/emails`. Fixtures are created with the local secret
key and deleted afterwards.

These tests run the production build, which the Vitest suite does not: Vitest compiles
without the React Compiler. A hook that returned `{ ...form }` from `useForm` worked under
Vitest and froze the login page's errors in production, because the compiler memoized the
copy; return the form itself and read `form.formState` while rendering.

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
- `/clients`: the organization's active clients from `GET /clients` on the shared data table:
  sortable by company, CUI, and declared headcount, paged through `?page=` with the sort in
  `?sort=&order=`, with loading, empty, and error states (a missing membership is explained;
  other failures offer a retry).
- `/clients/new`: the creation form, laid out as full-width sections with their purpose on
  the left and fields on the right. Entering a CUI and pressing **Caută la ANAF** calls `GET /companies/lookup` and prefills the
  name, VAT status, CAEN code, trade register number, and registered office; a missing record
  or an ANAF outage leaves manual entry available. The CAEN field is a searchable combobox
  over the full CAEN Rev. 3 class list from `packages/contracts` (code prefix or words from
  the activity name, diacritics optional); a four-digit code outside the list can still be
  used. Saving posts to `POST /clients`, invalidates the list, and returns to `/clients`.
  Search, editing, archiving, and row actions are not implemented yet. The company name
  opens the client.
- Lists share `src/components/data-table/`: a headless TanStack Table (v9) wrapper for
  server-side tables. Columns come from `createDataTableColumns()`, sortable ones use the API
  sort key as their id, and column `meta` carries class names for header, cell, and skeleton.
  The table renders the header with sortable buttons (`aria-sort` on the column header, one
  sort at a time, never removed), the pending skeleton, the error and empty slots, the rows,
  and the `Pager` footer; the page owns the query and maps the table's sort and page
  callbacks onto its search params.
- `/clients/:id/employees`: the client's employees from `GET /clients/{clientId}/employees`,
  under a client summary card (name, CUI, main activity, registered office, declared headcount) and section tabs. The list shows
  name and internal number, job title, contact, and hire date (plus the leave date for former
  employees); **Angajați actuali** (the default) and **Foști angajați** (`?status=terminated`)
  switch between the two groups through the search params, and so do the page (`?page=`) and
  the sort (`?sort=&order=`, defaults omitted; a sort change goes back to page one);
  the footer shows the bounds and total with previous/next controls. The
  CNP is never part of the list. The client itself comes from `GET /clients/{clientId}`; a
  404 shows the not-found screen.
  Each row has an actions menu: **Marchează plecarea…** opens a dialog asking for the leave
  date (today by default, not before the hire date) and calls `PATCH …/status`; on the former
  employees tab **Reactivează…** clears it, for undoing a mistake, since a rehire after a gap
  is a new employee. The list is invalidated so the row moves between the two tabs.
- Date fields use `src/components/date-picker.tsx`: a text input for typed Romanian dates
  (`dd.mm.yyyy`, also with slashes or dashes) next to a button that opens the shadcn calendar
  (react-day-picker, Romanian locale, month and year dropdowns, optional bounds). The form
  only ever receives ISO dates; helpers live in `src/lib/dates.ts`.
- `/clients/:id/employees/:employeeId`: the employee record from the detail endpoint, opened
  from the name in the list and rendered without the client summary and tabs. Sections mirror
  the form: identity, employment (with the computed tenure and the leave date), contact
  (`mailto:` and `tel:` links), and the training-sheet fields; missing values show a dash. The
  CNP stays masked to its last four digits until **Arată** is pressed and is masked again on
  every visit. The status action opens the same dialog as the list; both invalidate the list
  and the record. The loader warms the query and names the breadcrumb; a 404 shows a not-found
  screen.
- `/clients/:id/employees/new`: the creation form, rendered without the client summary and
  tabs (`staticData.fullPage`); a disabled first field names the client. Sections: employer, identity
  (name, optional CNP and internal number), employment (job title, hire date), contact, and
  the training-sheet fields (birth date, birth place, address, blood group, Rh, notes). A valid
  CNP prefills the birth date on blur, and a contradicting birth date is rejected before the
  request, mirroring the API rule. Saving posts to `POST /clients/{clientId}/employees`,
  invalidates every filtered variant of the list, and returns to it; a duplicate CNP or
  number is shown on its field and an archived client on the form.

- `/organization`: the organization's name, the caller's role, and the members from
  `GET /organization/members`. An owner also gets the pending invitations with resend and
  revoke, and the "Invită un membru" dialog with a role picker. The API's `reason` on a
  conflict decides the wording: an address that is already a member or was emailed in the
  last 10 minutes is reported on the email field, the 20-invitation limit on the form.
  An owner's members table has a row menu for everyone but themselves: switch the role, or
  remove the member after a confirmation that says what stays. Hiding the owner's tools is a
  courtesy; the API and the database enforce the rule. An account without an organization is
  told to ask for an invitation.
- `/profile`: a form for the user's name backed by `PATCH /me/profile`, with the email
  read-only. Saving refreshes `/me`, so the account menu follows.

`src/account/use-me.ts` is the one `/me` query the shell, the dashboard, and these pages
share. The account menu shows the user's name and organization once it has loaded, and falls
back to "Contul meu" and the email.

Actions that leave the user on the same page (invitation sent, resent, revoked, profile
saved) are confirmed with a Sonner toast, mounted once in `App.tsx`. Errors and field
validation stay inline with `role="alert"`, next to their cause, so they persist.

Sign-out is available from the sidebar account menu on every authenticated route.
Failed sign-out keeps the session and displays a retry action in the shared layout.
