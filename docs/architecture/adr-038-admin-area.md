# ADR 038: The admin area as an app of its own on `admin.ssmusor.ro`

- Status: accepted
- Date: 2026-11-04
- Replaces the shape decided in #611 on 2026-10-26 (a section of the app at `/admin`)
- Issue: #611
- Amended 2026-11-05: platform-admin power requires `aal2` everywhere, the database included: `is_platform_admin()` asks for the token's `aal` as well as the claim, the public API's admin tools too, and the member app asks an account with an authenticator for its code, since verifying one ends the account's `aal1` sessions and Supabase Auth refuses a password change at `aal1`.
- Amended 2026-11-11: impersonation is built ahead of the Accounts page, from a list of every organization's members; the database refuses an impersonation without a reason (the agreement promises support access is logged with one) or of an account that is not a member; and the public API has one route of the admin's, `DELETE /me/impersonation`, so the member app's banner can end it.

## Context

Only the platform owner should do some things, and today nothing in the product lets him:

- **Read the improvement copies** of every organization's imports ([ADR 037](adr-037-import-quality-and-alerts.md)): the files, the proposal and what the member changed. These hold CNPs and blood groups from every provider, the most sensitive data we keep.
- **Give testers more time and usage.** Trials are extended and credits and signing codes granted by GitHub workflows run by hand (`extend-trial.yml`, `grant-credits.yml`, `grant-signing-codes.yml`).
- **Impersonate a member.** It has existed in the database since the clients feature (`impersonations`, `is_platform_admin()`, `effective_user_id()`, `me.impersonation`), and ADR 033 made its row trustworthy, but nothing starts one.
- **See an account** (subscription, usage, members, invoices), which today means SQL.

On 2026-10-26, #611 decided on a lazy-loaded section of the existing app at `/admin`, visible only to platform admins. Mircea reversed it on 2026-11-04, once the improvement copies made the admin area the place that shows every organization's personal data. A section of the app sends its code to every member's browser, shares the member app's session, and cannot be put behind a lock in front of its address. He also chose English for it, since he is its only user.

## Decision

### An app of its own

`apps/admin` is a single-page app built like the portal: React, Vite, TanStack Router with file routes, TanStack Query, and the shared `packages/ui`, `packages/contracts` and `packages/api-http`. It leaves out what the member apps carry for members:

- **No PostHog.** Its pages show personal data from every organization, and nothing there should be recorded or replayed.
- **No Lingui and no help links.** It is in English and has one user.
- **No Actualizări block and no help article** for its changes.

It is served as static assets by a Worker, `ssm-usor-admin`, on the custom domains `admin.ssmusor.ro` and `admin.non-prod.ssmusor.ro`, deployed by the existing deploy workflows. `workers_dev` and `preview_urls` are off, as on the other Workers, because a `workers.dev` or preview address would not be behind the lock below. Browsers keep a Supabase session per origin, so the admin's session is separate from the one he uses in the member app.

### Three locks

| Lock                                     | What it is                                                                                                                                                                                                                                                                                          | What it stops                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Cloudflare Access**                    | An Access application on both admin hostnames, whose policy allows only Mircea's address, signed in with a one-time code by email or with Google. Cloudflare checks it before the Worker runs. The Zero Trust free plan covers up to 50 users.                                                      | Anyone else reaching the app or its API at all, whatever our bugs |
| **Supabase sign-in and the admin claim** | Email and password, and the trusted `app_metadata.role = 'admin'` that `is_platform_admin()` already reads. `app_metadata` can only be written with the secret key, so no member can give it to themselves. The claim is granted by SQL or a script, never in the app.                              | A signed-in member who is not an admin                            |
| **Multi-factor authentication**          | A code from an authenticator app (TOTP), enrolled at the first sign-in to the admin app. Supabase marks a session that passed it `aal2`, and the claim gives an admin's power only to such a session, in the database (`is_platform_admin()`) as in both APIs. TOTP comes with every Supabase plan. | A stolen password                                                 |

The admin Worker also verifies the `Cf-Access-Jwt-Assertion` header Cloudflare adds, against the Zero Trust team's keys and the Access application's audience, and refuses a request without a valid one. A route or a domain that missed the Access application then fails closed instead of open.

A lost authenticator is reset with the secret key (deleting the factor in Supabase Auth); the steps are written down when the scaffold lands.

### The admin API is not on the public API

The API Worker gains a second entrypoint, `Admin`, beside its public `fetch`, the way the mail, SMS and PDF Workers expose `Mail`, `Sms` and `Pdf`. Only it serves admin routes. The admin Worker reaches it through a service binding and forwards the browser's `/api/*` requests, with their `Authorization` header, so the admin app calls its own origin: no CORS, and Access covers the API calls as well as the pages. `api.ssmusor.ro` has no admin routes at all.

The `Admin` entrypoint checks every request itself, whatever the locks in front of it: the token is verified with Supabase Auth as the public API does, and the request is refused (`403`) unless the user carries the admin claim and the token's `aal` is `aal2`.

Reads across organizations, such as the improvement copies, accounts and usage, are made with the secret key. A write the database already lets an admin make with his own token, starting and ending an impersonation, goes with that token, so ADR 033's attribution and its rules on the impersonation row hold. Other writes go with the secret key and the `x-audit-actor` header, through the helpers ADR 033 names.

### Every action, and every look at a copy, is logged

Each admin action writes a named event to `audit.events` (ADR 033) with the admin as actor and the organization it concerns: extending a trial, granting credits or signing codes, starting and ending an impersonation, and **opening an improvement copy or one of its files**. An action that changes an account requires a reason, kept on the event; opening a copy does not, but it is recorded, so the agreement's "le citesc doar cei care lucrează la import" can be checked against the log.

### Impersonation across the two addresses

The admin starts an impersonation in the admin app, with its reason and ADR 033's two-hour cap, then opens `app.ssmusor.ro`, where he is signed in as himself, and the member app acts as the member with its banner. He ends it from either app.

Starting, ending and acting during an impersonation all need a session at `aal2`. `is_platform_admin()` is false for a token whose `aal` is not `aal2`, so a session with the password alone, from either app or straight to PostgREST, neither starts nor ends an impersonation, and an active one does not apply to it. The member app therefore asks an account with an authenticator for its code after every sign-in and after a recovery link. It has to anyway: verifying a code ends the account's `aal1` sessions, so the member app's session ended at each sign-in to the admin app, and Supabase Auth refuses a password or email change at `aal1` to an account with a verified factor. The portal asks for none; impersonation is for members, and the participants' functions act as the real signed-in user.

### Not chosen

- **A section of the member app at `/admin`** (#611's shape): its code ships to every member, it shares the member session, and no lock stands in front of its address.
- **Admin routes on the public API behind the claim alone:** one check between the internet and every organization's data.
- **A third-party admin tool or Supabase Studio:** they bypass our logic (Stripe, emails, the audit log) and add a processor with access to production data.

## Consequences

- A third single-page app to keep current beside the app and the portal, with its own Worker and deploy steps in `deploy-non-prod.yml` and `deploy-production.yml`.
- Mircea sets up, once, the Cloudflare Zero Trust team in the dashboard: its onboarding asks for a team name and a plan with payment details, even for the Free plan, which the API cannot do. The Access applications and the one-time-code login are then created through the API with the scaffold.
- Signing in to the admin app with a password and a code redirects nowhere, so the Supabase projects need no new redirect URL. If a redirecting sign-in comes later (Google, a reset link), its callback joins `additional_redirect_urls` in `supabase/config.toml`, which CI pushes to each project; an entry added in the dashboard is overwritten by the next deploy.
- The API gains the `Admin` entrypoint and the admin app's Worker a service binding to it, per environment.
- The GitHub workflows that extend trials and grant credits and signing codes stay until their pages exist, and are then removed.
- ADR 037's Imports page is built here.

## Building it

Each step is a pull request in one stack, on this ADR.

1. **This ADR,** and #611 brought in line with it.
2. **The scaffold.** `apps/admin` with sign-in, MFA enrolment and an empty home page; its Worker with the Access check; the API's `Admin` entrypoint with its guard and one route that returns the signed-in admin; deploys for both environments.
3. **The Imports page** of ADR 037, with its audit events.
4. **Accounts:** the list and detail, extending a trial, granting credits and signing codes (replacing the workflows), and impersonation start and stop.
