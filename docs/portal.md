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
(a chosen participation, the privacy notice, the shell). One participation is chosen by itself;
the choice among several is kept in `localStorage` per account and changed from _Contul meu_.

**Signing in.** A value with `@` is an email; anything else is a phone, normalized to E.164 with
Romania as the default (`normalizePhone` from the contracts, built on `libphonenumber-js`): a
foreign number is typed with its `+` or `00` prefix, and the field has no country picker. The auth store's `requestCode`
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

**The shell** (`src/app/portal-shell.tsx`) is a header, the page and a quiet footer. At most
four places: an employee has _Acasă_, _Instruiri_, _Datele mele_, _Contul meu_; a client
administrator _Acasă_, _Angajați_, _Contul meu_, plus _Instruiri_ when they are an employee
too, whose _Datele mele_ is then a card on _Acasă_. One list of places
(`src/app/portal-header.tsx`) serves both layouts:

- On a phone (below 640 px) the header is a 56 px strip with the logo, and the places are a bar
  fixed at the bottom, a lime pill under the current icon. The bar is padded by
  `env(safe-area-inset-bottom)` (the viewport meta has `viewport-fit=cover`, without which the
  inset is zero on iOS), and the page reserves
  `calc(var(--portal-bar-height) + env(safe-area-inset-bottom) + 1rem)` below its content, the
  bar's height being the `--portal-bar-height` variable of `src/styles.css`. The root is
  `min-h-svh`: the small viewport unit is the stable one on iOS, where `dvh` resizes as Safari's
  toolbar collapses and `vh` overflows under it.
- From 640 px the header is 64 px, sticky, with the places as text links (a 3 px lime underline
  and `aria-current="page"` on the current one) and the account menu on the right
  (`src/app/account-menu.tsx`): the initials, the name and the client, then _Schimbă clientul_
  when there are several, _Contul meu_ and _Ieși din cont_. _Contul meu_ leaves the list there.
  The language switch will sit left of the menu.

Pages lay out in a 64 rem column with 20 px gutters on a phone and 32 px from 640 px
(`pageColumn` in `src/components/page.tsx`), on a 12-column grid from 1024 px: _Acasă_ 7 + 5
(the side column holds the _Datele mele_ summary and the provider to ask), _Instruiri_ and an
employee's page 8 + 4 (the sheets stick in the right column; on a phone they come first, as
compact rows), _Datele mele_ 8 + 4. The footer names the provider and links the notice, the
privacy policy and the commit version. The public pages, sign-in, `/alege`, the first-sign-in
privacy notice, no access and not found, render inside the `PublicFrame` of `@ssm-usor/ui`
that the app's login pages use too, with the portal's own version line as its footer.

A sheet opens as a PDF in a tab opened before the request, as the app's preview does, or is
downloaded; a sheet that is not ready names what the specialist still has to fill.

## Knowledge tests

The tests of [ADR 024](architecture/adr-024-knowledge-tests.md) have their API and not yet their
pages. What the pages will call, all in the portal's generated client
([API, Portal](api.md#portal)):

- _Acasă_ lists a test that awaits from `GET …/tests`: per domain `status.awaitingTest`, the
  hiring test while `pending`, the annual one once `annual_due`. A test is never sent; nothing
  else says it awaits.
- The test page opens with `GET …/tests/{domain}/{test}/study-card`, the explanations of the
  test's questions and, when the client has one issued, the material it closes, whose PDF
  `GET …/materials/{domain}` serves inline: the general training material for `ssm`, the IPSU
  with its annexes for `psi`. A missing material answers `404 material_not_issued`, and the card
  then shows the explanations alone.
- `POST …/tests/{domain}/{test}/attempts` starts the sitting, or answers the one in progress,
  which `GET …/tests` also returns as `inProgress`: ten questions, one a screen, with
  `chosen` as answered so far. Each answer is saved as it is given with
  `PUT …/test-attempts/{attemptId}/answers/{index}`, so a dropped connection resumes.
- `POST …/test-attempts/{attemptId}/finish` answers the score and `passed`, and for a failed
  attempt the questions answered wrong with their explanations, never the correct option; the
  retake is the same start route again, drawn and shuffled anew. A pass is recorded as the
  employee's test result, which `GET …/tests` lists.

## Languages

Every string the portal shows goes through Lingui 6 (`@lingui/core`, `@lingui/react`; the CLI,
`@lingui/format-po` and `@lingui/vite-plugin` in development, all from the pnpm catalog). The
macros come from `@lingui/react/macro` (`Trans`, `useLingui`) and `@lingui/core/macro` (`msg`,
`plural`); a count passes through `plural` with Romanian's `one`, `few` and `other` ("1 oră",
"3 ore", "25 de ore"). `lingui({ macroTransform: true })` in `vite.config.ts` and
`vitest.config.ts` expands the macros natively in Vite's `pre` stage, so before the React
Compiler of `@vitejs/plugin-react`, and no Babel or SWC plugin is involved.

`apps/portal/lingui.config.ts` has Romanian as the source locale and English beside it
(falling back to Romanian); the catalogs are `src/locales/{ro,en}/messages.po`, without line
numbers so that unrelated edits leave them alone. `pnpm --filter @ssm-usor/portal i18n:extract`
rewrites them from the code and `i18n:compile` writes `src/locales/{ro,en}/messages.ts`, which
`src/app/i18n.ts` imports. Every file is committed, and `pnpm check:generated` runs the two
scripts and fails when any changes: run them after touching a string, and translate the new
`msgstr ""` entries of the English catalog (extract reports how many are missing; keep it at
0). English plurals take `one` and `other` only. Production builds keep only message ids, so a
string missing from the compiled catalog would show its id.

The locale is chosen in this order (`src/features/language/locale.ts`):

1. Signed in, the language saved on the chosen participation (`client_participants.language`,
   `language` in `/portal/me`), applied by `ParticipantGate` before the first paint.
2. Otherwise the choice remembered on the device, in `localStorage` under
   `ssm-usor.portal.language`.
3. Otherwise the browser: Romanian when any of `navigator.languages` starts with `ro`, English
   otherwise.

`activateLocale` sets the catalog, `<html lang>` and the tab title, without a reload. The switch
(`src/features/language/language-switch.tsx`, "RO | EN") sits in the header beside the account
menu from 640 px, as a row of _Contul meu_ for the phone, and under the card of every page in the
public frame (sign-in, the client picker, the privacy notice), above the version line. Where a
participation is chosen it saves the language on it (`PUT
/portal/participants/{participantId}/language`) and updates the cached `/portal/me`; it also
remembers the choice on the device, which is all the sign-in page does. The Playwright configs
pin `locale: 'ro-RO'` and the unit test setup reports a Romanian browser, so tests read Romanian
unless they choose otherwise.

The labels the contracts carry in Romanian (training states, phases, domains, supplementary
reasons, responsible-person roles, missing sheet data, participation kinds) are not shown as
they are: `src/lib/labels.ts` maps each value to a Lingui message. Dates go through
`useFormatDate` (`src/lib/format.ts`), `Intl.DateTimeFormat` for the active locale (`ro-RO`,
`en-GB`), durations through `useFormatDuration` and lists through `useFormatList`.

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

## PostHog

The portal reports to the app's EU PostHog project with the same `VITE_POSTHOG_PROJECT_TOKEN`,
through the same proxy and with the same masking (`src/app/observability/posthog.ts`). Locally
it is optional, as in the app ([App](app.md#local-configuration)); without the token no PostHog
code loads.

PostHog starts in `ParticipantGate`, so never on `/sign-in`. It identifies the Supabase user
with `name` (the chosen participation's), `email` or `phone` (the sign-in address), groups the
events under the chosen client as group type `client`, and registers `participant_kind` and
`organization_name` on every event. The provider's organization id stays out of PostHog
because `/portal/me` does not send it. Page views, clicks, unhandled errors, failed API calls
(`api_request_failed`) and sessions are captured; replays mask all text, inputs and element
attributes. There is no Support widget. Sign-out resets the identity and stops recording.

## Browser flows

```bash
pnpm --filter @ssm-usor/portal test:e2e:flows
```

`apps/portal/e2e/flows` runs against the local stack like the app's flows: the API served by
Node with an in-memory mailbox on port 8797 and a preview build of the portal on 4178. A member
creates the fixtures and the invitation through the API; the flow then signs in with the code
read from the mailbox. `sign-in.spec.ts` follows an employee through their places,
`administrator.spec.ts` a client administrator through _Acasă_ (the employee count and the
responsible persons), _Angajați_ and one employee's records and sheets. It shares port 8797
with the app's flows, so run the two one after the other.

`signing.spec.ts` has an employee sign their agreement and a training with one code, read from
the mailbox, and the client administrator countersign the agreement. Signing needs
`GOTENBERG_URL`, `SIGNER_URL` and the three `SIGNING_*` values exported in the shell, as the
app's signing flow does ([app](app.md), [Signing locally](local-development.md#signing-locally));
without them the flow checks only what the lists show and stops before asking for a code.

```bash
pnpm dev:pdf
set -a; . <(grep -E '^(GOTENBERG_URL|SIGNER_URL|SIGNING_)' apps/api/.dev.vars); set +a
pnpm --filter @ssm-usor/portal test:e2e:flows
```

## Structure

The same folders as the app ([SPA folder structure](app.md)): `src/app/` (runtime, router,
providers, i18n, the shell and the public frame), `src/routes/` (thin, unexported file routes,
with the committed `routeTree.gen.ts` that `pnpm generate:routes` regenerates for both SPAs),
`src/features/`, `src/components/`, `src/lib/`, `src/locales/` and `src/api/`.

`src/api/http.ts` wires the shared adapter `@ssm-usor/api-http` (origin guard, bearer token,
file downloads, `ApiHttpError`) and sends a failed request to PostHog, as the app does. It is the mutator of the
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
