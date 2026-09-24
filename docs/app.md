# App foundation

The `@ssm-usor/app` workspace is a client-only React/Vite SPA with TanStack Router, TanStack Query, and Supabase
email/password authentication. Cloudflare serves the static build with SPA fallback routing.

## Local configuration

PostHog is optional locally. Add `VITE_POSTHOG_PROJECT_TOKEN` from a separate EU development
project to enable analytics, error tracking, session replay, and the Support widget for signed-in
members. Leave it absent to keep all PostHog code dormant. The API also needs
`POSTHOG_SUPPORT_SECRET_KEY` in `apps/api/.dev.vars` to sign the real user ID for Support; the
browser never receives this secret. The report button falls back to email if Support is not
configured or cannot load.

PostHog starts only after the app has loaded an authenticated membership. It identifies the
Supabase user, associates ordinary member events with their organization, captures signed-in
page views and unhandled browser errors, and records all eligible sessions. During impersonation,
it keeps the real administrator as the actor and marks the target member and organization as
context. The replay masks text, input values, and element attributes; network recording includes
URL, method, status, and timing but excludes headers and bodies. The Support widget attaches the
replay link and current URL to a new report. Sign-out clears the PostHog and Support identities.

In each EU PostHog project, enable Error Tracking, Session Replay, and Support. Enable the Support
widget for the app domain and set its greeting, button text, and new-ticket email notification in
the dashboard. Configure replay sampling to 100% for the pilot, and review product retention and
deletion settings before external users join. The floating PostHog launcher is hidden because the
sidebar report button opens the widget. PostHog changes to the widget DOM may require updating
the adapter in `src/observability/posthog.ts`.

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
rerun the seed. Registration exists at `/register` but nothing links to it yet; the login
page shows a link only when built with `VITE_REGISTRATION_LINK=true`. Missing configuration produces an unavailable
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

| File                                                                       | Route                                       | Behavior                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/index.tsx`                                                         | `/`                                         | Redirects to `/dashboard`, which checks the session.                                                                                                              |
| `routes/login.tsx`                                                         | `/login`                                    | Email/password form; an existing session redirects to `/dashboard`.                                                                                               |
| `routes/accept-invitation.tsx`                                             | `/accept-invitation`                        | Public. Where an invitation email lands: create an account, or join with an existing one.                                                                         |
| `routes/forgot-password.tsx`                                               | `/forgot-password`                          | Public. Asks Supabase for a password reset email.                                                                                                                 |
| `routes/reset-password.tsx`                                                | `/reset-password`                           | Public. Where a password reset email lands: choose a new password.                                                                                                |
| `routes/register.tsx`                                                      | `/register`                                 | Public and unlinked. Supabase's signup: email and password.                                                                                                       |
| `routes/confirm-email.tsx`                                                 | `/confirm-email`                            | Public. Where a signup confirmation email lands; confirms on a button press.                                                                                      |
| `routes/onboarding.tsx`                                                    | `/onboarding`                               | Signed in, outside the shell. An account without an organization creates one.                                                                                     |
| `routes/_authenticated.tsx`                                                | pathless                                    | Session guard and the app shell for every protected page.                                                                                                         |
| `routes/_authenticated/dashboard.tsx`                                      | `/dashboard`                                | Protected landing page with the account email and logout.                                                                                                         |
| `routes/_authenticated/organization.tsx`                                   | `/organization`                             | The organization's name, the caller's role, and the row of sections.                                                                                              |
| `routes/_authenticated/organization/index.tsx`                             | `/organization`                             | Redirects to the team.                                                                                                                                            |
| `routes/_authenticated/organization/team.tsx`                              | `/organization/team`                        | The members for everyone; invitations, the invite dialog and the row menus for owners.                                                                            |
| `routes/_authenticated/organization/company.tsx`                           | `/organization/company`                     | "Date firmă": what documents print about the provider as a company. Owners edit.                                                                                  |
| `routes/_authenticated/organization/authorizations.tsx`                    | `/organization/authorizations`              | "Abilitări": the certificate of authorization and the fire-safety technician. Owners edit.                                                                        |
| `routes/_authenticated/profile.tsx`                                        | `/profile`                                  | The user's name and professional title (editable), email, and organization.                                                                                       |
| `routes/_authenticated/clients.tsx`                                        | pathless                                    | Clients section layout carrying the breadcrumb title.                                                                                                             |
| `routes/_authenticated/clients/index.tsx`                                  | `/clients`                                  | Protected, paginated and sortable list of the organization's active clients.                                                                                      |
| `routes/_authenticated/clients/new.tsx`                                    | `/clients/new`                              | Protected form that creates a client, with ANAF prefill by CUI.                                                                                                   |
| `routes/_authenticated/clients/$clientId/edit.tsx`                         | `/clients/$clientId/edit`                   | The same form, filled from the client, without the legal representative. Reached from "Modifică" in the client header and in the list's row menu.                 |
| `routes/_authenticated/clients/$clientId.tsx`                              | `/clients/:id`                              | Client layout: loads the client through `GET /clients/{clientId}`, shows its summary card and section tabs, returns the breadcrumb label from its loader.         |
| `routes/_authenticated/clients/$clientId/index.tsx`                        | `/clients/:id`                              | Redirects to the employees section until a client overview exists.                                                                                                |
| `routes/_authenticated/clients/$clientId/employees.tsx`                    | pathless                                    | Employees section layout carrying the breadcrumb title.                                                                                                           |
| `routes/_authenticated/clients/$clientId/employees/index.tsx`              | `/clients/:id/employees`                    | The client's employees with a status filter in the search params.                                                                                                 |
| `routes/_authenticated/clients/$clientId/employees/new.tsx`                | `/clients/:id/employees/new`                | Form that adds an employee to the client.                                                                                                                         |
| `routes/_authenticated/clients/$clientId/job-positions/index.tsx`          | `/clients/:id/job-positions`                | The client's job positions (ADR 006): the posts it employs people in.                                                                                             |
| `routes/_authenticated/clients/$clientId/job-positions/$jobPositionId.tsx` | `/clients/:id/job-positions/:jobPositionId` | One position with its protective equipment (ADR 011). Full page, read from the client's list of positions.                                                        |
| `routes/_authenticated/clients/$clientId/employees/$employeeId_.edit.tsx`  | `/clients/:id/employees/:employeeId/edit`   | Corrects what was entered about an employee, in the form that adds one (`src/employees/employee-form.tsx`). Full page; returns to the employee page with a toast. |
| `routes/_authenticated/clients/$clientId/document-data.tsx`                | `/clients/:id/document-data`                | What the client's generated documents print: the representative, the training schedule, workplaces, and responsible persons.                                      |
| `routes/_authenticated/clients/$clientId/documents/index.tsx`              | `/clients/:id/documents`                    | The client's generated SSM documentation: generating, downloading, regenerating, issuing.                                                                         |
| `routes/_authenticated/clients/$clientId/documents/$documentId.tsx`        | `/clients/:id/documents/:documentId`        | One document in the in-app Word editor; a full page.                                                                                                              |
| `routes/_authenticated/clients/$clientId/employees/$employeeId.tsx`        | `/clients/:id/employees/:employeeId`        | Employee record, the only page that can reveal the CNP.                                                                                                           |
| `routes/_authenticated/clients/$clientId/contact.tsx`                      | `/clients/:id/contact`                      | The client's contact person for the team, and the owners' notes for an owner.                                                                                     |
| `routes/_authenticated/clients/$clientId/other-documents/index.tsx`        | `/clients/:id/other-documents`              | "Alte documente", for owners: the client's service contract (ADR 007).                                                                                            |
| `routes/_authenticated/clients/$clientId/other-documents/contract.tsx`     | `/clients/:id/other-documents/contract`     | The client's contract in the editor; a full page.                                                                                                                 |
| `routes/_authenticated/leads/$leadId/contract.tsx`                         | `/leads/:id/contract`                       | A lead's contract in the editor.                                                                                                                                  |
| `routes/_authenticated/leads.tsx`                                          | pathless                                    | Leads section layout carrying the breadcrumb title.                                                                                                               |
| `routes/_authenticated/leads/index.tsx`                                    | `/leads`                                    | Owners' list of the organization's leads (ADR 007), active or archived.                                                                                           |
| `routes/_authenticated/leads/new.tsx`                                      | `/leads/new`                                | The client form, adding a lead.                                                                                                                                   |
| `routes/_authenticated/leads/$leadId.tsx`                                  | pathless                                    | Loads the lead through `GET /clients/{clientId}`; a promoted one redirects to its client page.                                                                    |
| `routes/_authenticated/leads/$leadId/index.tsx`                            | `/leads/:id`                                | The lead: contact, the owners' notes, archive, and "Transformă în client".                                                                                        |
| `routes/_authenticated/leads/$leadId/edit.tsx`                             | `/leads/:id/edit`                           | The client form, filled from the lead.                                                                                                                            |
| `routes/__root.tsx`                                                        | other paths                                 | Not-found screen with a link back to the start; route error screen.                                                                                               |

A route whose breadcrumb label depends on data (the client name) returns `crumb` from its
loader instead of `staticData.title`; the shell reads either, and prefers the crumb, so a
route can keep a static title for when its loader has no name to give (the document page).

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

## Registration and onboarding

[ADR 004](architecture/adr-004-registration-and-onboarding.md). `/register` calls Supabase's
`signUp` and shows the same "check your email" for any address. Supabase hands the
confirmation to the API's Send Email hook, which links to `/confirm-email?token_hash=…`. That
page confirms on its button, never on load, which signs the person in and opens `/onboarding`.

An account is not yet a customer. The authenticated layout sends any account whose `/me` says
`membership: null` to `/onboarding`, whether it just registered, was removed from an
organization, or has not accepted its invitation; the shell's pages all need an organization.
The page sits outside the shell and asks for the person's name, the organization's name, and
a checkbox accepting the terms and the data processing agreement on the organization's behalf.
It posts to `POST /organization` with `currentTermsVersion` and then opens the dashboard.
Open invitations for the account's address, from `GET /me/invitations`, are pointed out first,
without an accept button: the emailed link stays the only thing that accepts. The page also
offers to sign out.

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
password, registering through to a new organization, and generating a client's documentation
from the real templates (`pnpm templates:register:local` first), down to the downloaded file's
name, and correcting a draft in the real editor: type, save, reload, and find the text again.
They also cover a lead from the form to a client, with its contract generated, priced in the
editor, issued and emailed. **Run them with a converter before changing anything that touches
documents, Storage or their policies**: without `GOTENBERG_URL` issuing makes no PDF, so the
path that writes one, and everything after it (the PDF download, sending a contract), is
skipped, and CI, which has a converter, is the first to find out.

```sh
pnpm dev:pdf
GOTENBERG_URL=http://localhost:3300 pnpm --filter @ssm-usor/app test:e2e:flows
pnpm stop:pdf
```

`pnpm dev:pdf` starts the converter from `compose.yaml`, the same image the deployment runs
([PDF Worker](pdf.md)). The variable is not needed on the command line when
`apps/api/.dev.vars` already has it.

`playwright.flows.config.ts` starts everything else itself, on ports of its own so
`pnpm dev` can keep running: the API served by Node from `apps/api/scripts/e2e-server.ts`,
pointed at the local Supabase stack, and a preview of a production build of the SPA. That API
refuses any Supabase URL that is not local and keeps emails in memory instead of calling the
mail Worker, so a flow test cannot send email or reach the hosted project; the specs read
the emailed link back from `GET /__e2e/emails`. The local stack's Send Email hook points at
that API too, so registering and asking for a password reset are tested from the form to the
link in the email Supabase asked us to send. Fixtures are created with the local secret
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
  other failures offer a retry). "Activi" and "Arhivați" switch the list through `?status=`.
  A row's menu holds "Modifică" and, for an owner, "Arhivează…", or "Restaurează…" on an
  archived row; one dialog confirms both and says how many documents are still drafts. An
  archived client's page opens read-only under a banner, with "Restaurează…" for an owner.
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

- `/clients/:clientId/job-positions`: the "Posturi de lucru" section of a client, second after
  "Angajați", in `src/job-positions/` ([ADR 006](architecture/adr-006-job-positions.md)). The
  card lists `GET /clients/{clientId}/job-positions`: the name with the activities under it,
  the staff category as a badge ("Execuție", "Tehnic-administrativ", the full wording in its
  title), the work zone, and the current employees counted the Romanian way ("2 angajați",
  "20 de angajați"). The dialog adds or replaces a position; the category defaults to
  execution, the shorter training interval, and the zone's hint says it is a kind of place,
  not an address. A `409` with the reason `job_position_name_taken` goes on the name field
  with the way out: name the two apart. Editing says that contract titles do not follow a
  rename. "Șterge" confirms first, and its button stays off while the position has current
  employees; a `409` with `job_position_held` covers people who joined in the meantime. The
  empty state says positions also come from adding employees. An archived client is
  read-only. The name links to the position's page, as does a click on the row, and an
  "EIP" column says where each post stands with its equipment: "Nedecis" (in amber, since
  it blocks generating), "Nu necesită", or the number of entries.
- `/clients/:clientId/job-positions/:jobPositionId`: a position's page, full page like an
  employee's, in `src/protective-equipment/` ([ADR 011](architecture/adr-011-protective-equipment.md)).
  There is no request for one position: the page reads the client's list, which the section
  already cached, and is not found when the position is not in it. It shows the interval,
  the employee count linking to "Angajați", the activities, "Modifică" opening the same
  dialog, and the "Echipament individual de protecție" card over
  `GET …/job-positions/{id}/equipment`. An undecided post shows why it matters and the
  button "Postul nu necesită echipament" (`PATCH …/protective-equipment` with `false`); a
  post that needs none shows a notice with "Reia decizia" (`null`). Entries are rows of
  risk, item, "2 buc. / 12 luni" (or "/ consum"), and the allocation mode; the row and the
  menu edit, the menu deletes after a confirmation that says when the post falls back to
  undecided. The entry dialog has the risk and the item with `<datalist>` suggestions from
  `GET /equipment-suggestions`, the allocation mode with a hint per value, the quantity, and
  the duration, which a consumable disables. "Copiază de la alt post" lists the client's
  other positions that have entries and calls `POST …/equipment/copy`. Every change also
  refreshes the positions list, whose count and state come from it. Read-only for an
  archived client.
- Employees and their job position: the list's column is "Post de lucru" and sorts by it. The
  new-employee form has a "Post de lucru" picker (`src/job-positions/job-position-combobox.tsx`)
  that lists the client's positions. Under the list, whatever is typed, stays the row "Adaugă
  un post nou…": it opens the dialog of the "Posturi de lucru" section with the typed text as
  the name, so a new post gets its category where it is created, and the position it saves
  becomes the choice. The shared `SearchCombobox` takes such a row as its `action` prop. That
  dialog stops its submit event: it is drawn elsewhere on the page, but React events bubble
  through the component tree, and saving a post must not submit the form behind it.
  "Funcția din contract" follows the
  chosen position while it is empty or still reads what the last choice put there, and keeps
  anything the person typed. The employee page shows the two apart, and "Schimbă…" beside the
  position opens a dialog that moves the person and sends the contract title only when it was
  changed. Creating, moving, marking a leaver and reactivating all refresh the positions list,
  whose counts they change.
- `/clients/:clientId/document-data`: the "Date pentru documente" section of a client, what its
  generated documentation prints beyond the registration data (ADR 005). The first card holds
  the legal representative's name and role, and the periodic training
  schedule: duration, interval for administrative staff and for workers, first month, and the
  days of the month. It previews the resulting months ("Instruiri în: Februarie, August.")
  with `trainingMonths` from the contracts, the same function the documents will use. Workers
  are offered no interval above six months. `PUT /clients/{clientId}/document-details`
  replaces every field, so an emptied input clears what was saved. An archived client is
  shown read-only. The second card lists the registered office and the points of work from
  `GET /clients/{clientId}/workplaces`, the registered office first with a badge. "Adaugă" and
  a row's "Modifică" open one dialog; the API's `409` for a second registered office is
  reported on the checkbox and keeps the dialog open. "Arhivează" asks first, and a `404`
  refreshes the list. An archived client gets the list without add or row actions. The
  registered office keeps an address of its own: when the client's data (what the documents
  print as its seat) has a county, locality or address line that reads differently, the row
  says so and "Folosește această adresă" adopts it, leaving alone what the client lacks.
  The third card lists the people the client designates by decision, with their roles as
  badges, and names the roles nobody holds yet, which is what generating will ask for. Its
  dialog can pick one of the client's current employees, which fills the name (first names
  first, as documents print it) and the job title; both stay editable, and a person who is
  not an employee is typed in by hand. At least one role is required, and roles are sent in
  the order the decisions list them. A `409` means the employee is already listed and a `400`
  on `employeeId` that they belong to another client; both are reported on the employee
  field.
- `/clients/:clientId/documents`: the "Documente" section of a client (ADR 005), in
  `src/documents/`. The card lists `GET /clients/{clientId}/documents` in the order of the
  pack: title, the decision's number, badges for the issued revision and the draft, the
  date the document carries, and "Date modificate" on a draft whose printed data has changed
  since. "Generează documentația" (or "Generează documentele lipsă" when some exist) shows
  while a built-in type from the contracts' `documentTypeKeys` is missing. Its dialog asks
  `GET …/documents/readiness` every time it opens: while data is missing it shows no form but
  what is missing, grouped by the page it is filled in on with a link to each (the
  organization, the profile, the client's document data; a specialist is told that the owner
  fills in the organization's details). When ready it asks for the date and the first
  decision number, filled in from the last generation. A row's menu downloads the draft or
  the issued file, and offers "Generează din nou", "Emite", and "Șterge ciorna", each behind a
  confirmation that says what is lost or locked. An issued document without a draft also has
  "Modifică documentul emis", which asks nothing: it starts a draft from the issued file
  (`POST /documents/{documentId}/draft`) and opens it in the editor. Regenerating such a
  document says that the hand edits of the issued file are not carried over, and names that
  action as the way to keep them. When issuing is refused with the reason
  `unfilled_text`, the same dialog asks a second question, "Documentul mai are text de
  completat", and "Emite oricum" sends `acceptUnfilled`. The five documents the app cannot
  write yet (`uploadedDocumentTypes`) show in their place in the pack as "Neîncărcat" rows
  with an upload button, once the client has any document; every other row's menu has
  "Încarcă un fișier", which asks first when it would replace a draft. One hidden file input
  serves the card and posts the chosen `.docx` to `POST …/documents/{typeKey}/upload`. An issued
  revision with `hasPdf` also offers "Descarcă PDF-ul documentului emis"; the issuing dialog
  says that making the PDF can take a few seconds, and a `503` with `pdf_unavailable` says
  that nothing was issued. An
  uploaded document reads "Încărcat" instead of "Modificat" and has no "Generează din nou".
  A `400` says the file is not a `.docx` or is over 15 MB, and how to get one from a `.doc`. A download fetches the signed link and
  saves a blob, so the file gets the document's name with its diacritics: browsers ignore
  `download` on a link to another origin, and Storage percent-encodes the name in its own
  header. A `404` or `409` reloads the list. An archived client only gets the downloads.

- `/clients/:clientId/documents/:documentId`: one document in the in-app Word editor (ADR 005,
  [the trial](document-editor-trial.md)). The page finds the document in the client's list,
  takes the draft, or the issued revision when there is no draft, fetches its file through
  the signed link, and hands the bytes to `@docx-editor.dev/react`. A draft of an active
  client opens in `edit` mode; an issued revision and anything of an archived client open in
  `view` mode. The editor lives in `src/documents/document-editor.tsx`, loaded with `lazy`,
  so its 0.8 MB (gzipped) and its WebAssembly text shaper are fetched only when a document is
  opened; the menu bar, the rulers and the outline pane are off. The editor bundles no fonts
  and cannot read the machine's: without font bytes it measures text with whatever the
  browser has, so a machine without Arial would break lines and pages differently. It is
  given `packagedFonts({ allow: ['Arial'] })` from `@docx-editor.dev/fonts`: Liberation Sans,
  built to Arial's metrics, served from our own origin, 0.8 MB once per browser. The house
  style sets all text in Arial, so no other family is allowed to load. Its notice about
  unavailable fonts names the families a document's styles fall back to; the templates name
  none since their style defaults were cleaned. The editor ships ten interface languages and
  Romanian is not one: `src/documents/editor-strings.ro.ts` is our catalogue, in Word's own
  Romanian terms, passed as `i18n`; a key it leaves out shows in English, which is what to
  look for after upgrading the editor. Our own controls sit in its
  title bar: the revision badge, "Modificări nesalvate" or "Salvat", "Descarcă", and
  "Salvează", which is also Ctrl+S. While a draft still reads `DE COMPLETAT`, the bar also has
  "N locuri de completat" (`UnfilledNavigator`, over the editor's `useDocumentSearch`): each
  press selects the next one and brings it into view, so what is typed takes its place, and
  the count follows the text. The mark is not coloured in the file on purpose: what is typed
  over coloured text inherits the colour, here and in Word, and would be issued with it. Unsaved means the document's revision differs from the one
  at load or at the last save, because opening a file reports layout changes of its own.
  Saving sends the bytes to `PUT /documents/{documentId}/draft/file`; a `409` says the draft
  is gone and to download the file, and "Descarcă" always gives what is on screen, edits
  included. Leaving with unsaved changes asks first, in the app and when closing the tab. A
  document the editor cannot lay out throws outside React and never reports ready: an error
  on the page before that, or 30 seconds of silence, shows a message with the download
  instead. The list links every title to this page and marks a draft saved from here as
  "Modificat", which "Generează din nou" then names as what would be lost. An issued document
  opens for reading with "Modifică" in the title bar, which starts the same draft in place:
  the page loads the new revision and becomes editable.

- `/leads`: "Clienți potențiali", an entry of the sidebar that only an owner gets. A lead is a
  client in an earlier stage (ADR 007), so the pages reuse the clients' parts over the same
  routes of the API: the list is `GET /clients?stage=lead` on the shared data table, with the
  contact and the day it was added, "Activi" and "Arhivați" in the URL, and a row menu with
  "Modifică", "Transformă în client…" and "Arhivează…". A specialist who types the address is
  told that leads are the owners'; for them `/leads/:id` is the not-found screen, because the
  API answers `404`. `/leads/new` and `/leads/:id/edit` are `ClientForm` with the lead's
  wording, the contact section right after the identification, and the lead's page as where
  they return. The contact section is also on the client form, last.
- `/leads/:id`: the company's summary, the contact (`ContactCard`), and the owners' notes
  (`OwnerNotesCard`: a text area saved with `PUT …/owner-notes`, "Modificări nesalvate" until
  then, read-only for an archived company). "Arhivează…" opens the clients' archive dialog,
  which for a lead speaks of leads and does not look for draft documents. "Transformă în
  client…" opens `PromoteLeadDialog`, which says that the whole team will see the company,
  that the notes stay the owners', and that it cannot be undone; then `POST …/promote`, a
  toast, and the client's page. An archived lead shows a banner with "Restaurează…" and
  neither of the other two. The two addresses of one record lead to each other: the client
  layout redirects a lead to `/leads/:id`, and the lead loader redirects a client to
  `/clients/:id/employees`, so a link kept from before the promotion still works.
- The service contract (`src/service-contracts`): `ServiceContractCard` is on the lead's page
  and, for a client, in "Alte documente", a section only an owner gets (a specialist who types
  the address is told what is there and whose it is, and nothing is asked of the API). It is
  two cards. "Detaliile contractului" keeps what the app reads about the contract: the number,
  which starts from the API's suggestion and says so, the two dates, the duration, the
  renewal, the two services, and who signs for the client, which is saved on the client
  because a lead has no other form for it. Once saved it shows as a summary with "Modifică",
  so that the form does not stand between the owner and the contract on every visit.
  "Contractul" is the document: a sentence on where it stands, its badges, and its actions.
  Until it is issued, a notice says that prices are written by hand over `DE COMPLETAT` and
  how the editor finds them. While something is missing, a warning groups it by where it is
  filled in, with a link to each place: the organization's two sections, the company's own
  form, the details form. "Generează contractul" waits for saved details and for nothing
  missing, and says which in its title;
  over a draft it asks first, because prices written by hand are lost. The contract then
  shows as a document: "Ciornă · rev. N", "Emis · rev. N", "Modificat", and "Date modificate"
  when `draftOutdated`. It opens in the editor, downloads as Word or PDF, is issued behind a
  confirmation that asks a second time while `DE COMPLETAT` is left (where the prices go),
  and its draft can be deleted. An issued contract has "Trimite prin email…"
  (`SendContractDialog`): the address starts as the contact's, a note is optional, and the
  dialog says that the PDF goes out in the owner's name, with replies and a copy to them. The
  card then shows "Trimis" and "Revizia N a fost trimisă la … pe …", and the button reads
  "Trimite din nou…". Without a PDF the button is disabled and says to send the download
  instead. The leads list has a "Contract" column from `serviceContractState`: Fără contract,
  Ciornă, Emis, Trimis, Semnat. Under an issued contract a line offers "Atașează exemplarul
  semnat" (a PDF, from a hidden file input), and once attached says which revision has it,
  with "Descarcă", "Înlocuiește" and "Elimină" behind a confirmation. `PromoteLeadDialog`
  warns, without stopping, when the contract in force has no signed copy; it is told through
  `signed`, left out while the contract is still loading so the warning never flashes for a
  signed one.
- The editor is one view for both kinds of document. `DocumentEditorView` takes a
  `DocumentSource` (the document, the state of its query, how to refetch and invalidate, and
  the way back); `DocumentEditorPage` builds one from the client's list of documents, and
  `ServiceContractEditor` from `GET …/service-contract`, because that list is the
  documentation set only. "Modifică" on an issued contract works as for any document.
- `/clients/:id/contact`: the "Contact" section of a client, with the same two cards. The
  notes card is rendered for an owner only, and the API refuses anyone else.

- `/organization`: the organization's name, the caller's role, and a row of sections as on a
  client's page, each its own route; `/organization` itself redirects to the team, which is
  what the page is opened for day to day.
- `/organization/team` ("Echipă"): the members from `GET /organization/members`. An owner also
  gets the pending invitations with resend and revoke, and the "Invită un membru" dialog with
  a role picker. The API's `reason` on a conflict decides the wording: an address that is
  already a member or was emailed in the last 10 minutes is reported on the email field, the
  20-invitation limit on the form. An owner's members table has a row menu for everyone but
  themselves: switch the role, or remove the member after a confirmation that says what
  stays. Hiding the owner's tools is a courtesy; the API and the database enforce the rule.
- `/organization/company` ("Date firmă"): what generated documents and contracts print about
  the provider as a company (ADR 005, ADR 007), from `GET /organization/company-details`, in
  the sections of the client form: identification, registered office and phone, legal
  representative, bank account. Every member sees it and an owner edits it. "Caută la ANAF"
  prefills it by CUI like the new client form, the VAT checkbox included, which stays
  editable because ANAF's registry lags a fresh registration. `PUT` replaces every field, so
  an emptied input clears what was saved. The IBAN is checked as typed, with or without
  spaces, and shown in groups of four once saved.
- `/organization/authorizations` ("Abilitări"): the certificate of authorization and, in a
  section of its own, the one fire-safety technician (issue #170), from
  `GET /organization/authorizations`, with the same rules. The contract card's notice of
  missing data links to whichever of the two sections holds what is missing.
- `/profile`: a form for the user's name and optional professional title backed by
  `PATCH /me/profile`, with the email read-only. The title is printed next to the person's
  name in generated documents; emptying it sends `null`. Saving refreshes `/me`, so the
  account menu follows.

`src/account/use-me.ts` is the one `/me` query the shell, the dashboard, and these pages
share. The account menu shows the user's name and organization once it has loaded, and falls
back to "Contul meu" and the email.

Actions that leave the user on the same page (invitation sent, resent, revoked, profile
saved, an employee marked as a leaver or reactivated) are confirmed with a Sonner toast,
mounted once in `App.tsx`. So is a save that returns to a list, where the new row may be out
of sight on another page or under another sort: a client or an employee added, by name. Errors and field
validation stay inline with `role="alert"`, next to their cause, so they persist.

Sign-out is available from the sidebar account menu on every authenticated route.
Failed sign-out keeps the session and displays a retry action in the shared layout.
