# ADR 002: Transactional Email

- Status: accepted
- Date: 2026-09-18

## Context

SSM Ușor sends no email today. Three transactional emails are planned:

1. a confirmation for people who ask on the marketing site to be told when accounts open;
2. an invitation for a new member of an organization;
3. the account emails Supabase Auth triggers, starting with signup confirmation.

All three should share one look and one sending path. The current Cloudflare account is on the free Workers plan; production will move to a separate Workers Paid account later.

## Decision

### A mail Worker that owns sending

Add `apps/mail`, a Cloudflare Worker with no routes and no public hostname. It exposes one RPC method per email, such as `sendWaitlistConfirmation`, through a `WorkerEntrypoint`. Templates, subjects, plain-text versions, the sender address, and the provider stay inside it. Callers pass data and never receive HTML.

`apps/api` reaches it over a service binding. The RPC interface and its payload schemas live in `packages/contracts`, so neither application imports the other's internals.

`apps/api` remains the only public backend. It hosts the waitlist endpoints now and, later, the endpoint for Supabase's Send Email hook: it verifies the hook's signature and forwards the request to the mail Worker.

### Templates

Write templates with React Email and render them in the mail Worker at request time. Style them with inline styles from a TypeScript copy of the brand palette, because `packages/design-tokens` exports CSS only and email clients ignore CSS variables. Do not use React Email's Tailwind component.

Emails are written in Romanian. The logo is a resized PNG served by the marketing site, shown on a solid light background so dark-mode clients keep it readable.

### Provider

Send through Resend's REST API from a single provider module inside `apps/mail`. Cloudflare Email Service is the candidate replacement once production runs on Workers Paid and the service leaves beta; swapping is a change to that one module. Without an API key, the provider logs the email instead of sending it, which is the local development default.

Send from `SSM Ușor <noreply@mail.ssmusor.ro>` with `contact@ssmusor.ro` as the reply-to. The `mail.` subdomain keeps the reputation and DNS records of automated mail apart from the mailbox people write to.

### Waitlist

Subscribers live in a `waitlist_subscribers` table in Supabase, which is the source of truth; a provider audience is at most a copy made when the launch announcement goes out.

Subscription is double opt-in. A request stores a pending row and sends a confirmation email; the row counts only once its link is clicked. Subscribing an address that is already confirmed succeeds without sending anything and without revealing that the address was known. The public endpoint is protected by Turnstile. The launch announcement carries an unsubscribe link.

### Privileged database access

`apps/api` receives a Supabase secret key for work done on behalf of nobody signed in: waitlist writes now, invitation acceptance later. It is reachable only through a dedicated admin client that the modules needing it import explicitly. The per-user client bound by row-level security stays the default.

### Order of work

1. The mail Worker with the waitlist confirmation email.
2. The waitlist table and API endpoints.
3. The marketing form that replaces the `mailto:` link.
4. Organization invitations, backed by an `organization_invitations` table of our own, because Supabase's invitation call rejects people who already have an account.
5. Supabase's Send Email hook and signup confirmation, when public signup opens.

## Consequences

- One more deployable. The mail Worker must be deployed before the API, whose service binding refuses to deploy against a Worker that does not exist.
- React and the renderer stay out of the API bundle, and the provider key lives in one Worker.
- On the free plan a render may exceed the 10 ms CPU limit. This is accepted for the current environment. If it becomes a problem before the move to Workers Paid, templates can be exported to HTML at build time and filled in by substitution without changing the RPC interface.
- The API holds a key that bypasses row-level security for the first time; code review must keep the admin client confined to the modules that need it.
- Sending email requires DKIM, SPF, and DMARC records for `mail.ssmusor.ro` and a Resend account, none of which depend on the Cloudflare account, so the planned account move only needs the secret set again.
- No queue is introduced. Sends happen inside the request, so a caller learns of a failure immediately. Bulk or retryable sending would revisit this.
