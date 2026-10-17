# Portal

The `@ssm-usor/portal` workspace is what a participant sees ([ADR 022](architecture/adr-022-participants-and-the-portal.md)):
a client-only React/Vite SPA at `portal.ssmusor.ro`, beside the app at `app.ssmusor.ro`, on the
same stack (TanStack Router with file routes, TanStack Query, Supabase, `@ssm-usor/ui` and the
design tokens) and with nothing of the app's shell. A participant signs in with a one-time code;
the portal has no password.

## Pages

| Route                   | What                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/sign-in`              | One field, email or phone, then the six-digit code                            |
| `/alege`                | Which client to open, for an account with several participations              |
| `/`                     | _Acasă_; for a client administrator also the client's responsible persons     |
| `/instruiri`            | _Instruiri_: the participant's records and the two individual training sheets |
| `/datele-mele`          | _Datele mele_: the identification data the sheets print                       |
| `/contul-meu`           | _Contul meu_: the sign-in address, the client, the provider, sign out         |
| `/informare`            | The privacy notice, read-only                                                 |
| `/angajati`             | The client's employees with a filter by name, for a client administrator      |
| `/angajati/$employeeId` | One employee's records and sheets, for a client administrator                 |

Everything but `/sign-in` sits under `_participant` (a session, then `useGetPortalMe`; a `403`
says the account has no access and offers to sign out) and, but `/alege`, under `_portal`
(a chosen participation, the privacy notice, the bar). One participation is chosen by itself;
the choice among several is kept in `localStorage` per account and changed from _Contul meu_.

**Signing in.** A value with `@` is an email; anything else is a phone, normalized to E.164 with
Romania as the default (`normalizePhone` from the contracts). The auth store's `requestCode`
calls `signInWithOtp` with `shouldCreateUser: false` and reports only whether the request
reached Supabase: an address nobody invited, a number the Send SMS hook refuses and a rate
limit all show the same "if this address is known, a code is on its way", so the page never
says which addresses exist. `verifyCode` calls `verifyOtp` with type `email` or `sms`. Another
code can be asked for after 60 seconds, Supabase's limit per address.

**The privacy notice** is shown before any place while the participation's `noticeVersion` is
null or older than `currentPrivacyNoticeVersion` (`packages/contracts/src/participants.ts`);
"Am înțeles" records the current version. Raise the constant when the text changes and every
participant reads it again. It links the privacy policy at `https://ssmusor.ro/confidentialitate`.

**The client administrator's Acasă** shows the employee counts, which link to _Angajați_,
and below them the client's responsible persons: name, job title and workplace, and the roles in
Romanian. They are few, so they sit on _Acasă_ rather than below a list of employees that can
run to dozens on a phone. The privacy notice tells an administrator that they see the
employees' records and sheets on the employer's behalf, under the same laws.

**The bar** is at the bottom on a phone, above the safe area, and at the top from 640 px. At
most four places: an employee has _Acasă_, _Instruiri_, _Datele mele_, _Contul meu_; a client
administrator _Acasă_, _Angajați_, _Contul meu_, plus _Instruiri_ when they are an employee
too, whose _Datele mele_ is then a link on _Acasă_.

A sheet opens as a PDF in a tab opened before the request, as the app's preview does, or is
downloaded; a sheet that is not ready names what the specialist still has to fill.

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

Local codes arrive through the local stack's auth hooks, which call port 8797: the API the
browser flows start, not `pnpm dev`'s. To sign in by hand, point the hooks at 8787 as
`supabase/config.toml` explains, or read the code from a running flow server's
`/__e2e/emails?to=…`.

## Browser flows

```bash
pnpm --filter @ssm-usor/portal test:e2e:flows
```

`apps/portal/e2e/flows` runs against the local stack like the app's flows: the API served by
Node with an in-memory mailbox on port 8797 and a preview build of the portal on 4178. A member
creates the fixtures and the invitation through the API; the flow then signs in with the code
read from the mailbox. `sign-in.spec.ts` follows an employee through their places,
`administrator.spec.ts` a client administrator through _Acasă_ (the employee count and the
responsible persons), _Angajați_ and one employee's records and sheets. It shares port 8797 with the app's flows, so run the two one after the other.

## Structure

The same folders as the app ([SPA folder structure](app.md)): `src/app/` (runtime, router,
providers), `src/routes/` (thin, unexported file routes, with the committed `routeTree.gen.ts`
that `pnpm generate:routes` regenerates for both SPAs), `src/features/`, `src/lib/` and
`src/api/`. The root route lays every page out in one column of at most 480 px with a 16 px
gutter.

`src/api/http.ts` wires the shared adapter `@ssm-usor/api-http` (origin guard, bearer token,
file downloads, `ApiHttpError`) without the app's PostHog reporting. It is the mutator of the
portal's own generated client, `src/api/generated/api.ts`, which orval writes from the
operations tagged `portal` ([API client](api-client.md#two-clients-from-one-document)) and
nothing else. Do not edit it; `pnpm generate:api` rewrites it with the app's.

The client calls the API's `/portal` routes ([API](api.md#portal)). Every one of them first
links a first sign-in to its open invitations, then answers `403` to an account that is a
participant nowhere. `useGetPortalMe` lists the participations, one per client, each with its
`participantId`; the portal picks one (asking only when there are several) and passes its
`participantId` to every other hook. An employee's places use `useListPortalTrainingRecords`,
`useGetPortalEmployeeData`, `useGetPortalTrainingSheets` and `getPortalTrainingSheet` (a PDF;
`409 missing_sheet_data` names what the specialist still has to fill); the client
administrator's use `useListPortalClientEmployees`, the `…Employee…` variants of the records
and sheets, and `useListPortalResponsiblePersons`. `useRecordPortalNotice` records the privacy notice's version once shown,
and `noticeVersion` on the participation says whether it was.

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
