# ADR 027: Sign-in with Google

- Status: accepted
- Date: 2026-10-24
- Amends [ADR 004](adr-004-registration-and-onboarding.md): an account made with Google needs no emailed confirmation.

## Context

The first version goes to a round of invited testers. Each tester runs their own firm, so they register through the `/register` link, which nothing links to (ADR 004), confirm their address from an email, and create their organization at onboarding. Mircea wants them to be able to use their Google account instead, to take the password and the confirmation email out of the way.

Supabase Auth supports Google as an OAuth provider; nothing has to be hosted for it. What has to exist is an OAuth client in a Google Cloud project, whose consent screen names the app, and the provider switched on in each Supabase project with that client's ID and secret.

Google's account picker says which site the person is signing in to, and that is the host of the OAuth callback. Supabase's callback is on the project's own address, so the picker would say "xvhiwymggufbvjdfywjg.supabase.co", which reads like phishing to someone being asked for their Google account.

## Decision

### Google beside the password, not instead of it

`/register` shows **Continuă cu Google** above the email and password form. `/login` shows it only when `VITE_REGISTRATION_LINK` is on, the flag that already decides whether the login page links to registration: Google makes an account for anyone who has none, so the button on the login page is a public signup, and signup stays unadvertised for now. Pressing the button on `/register` also signs in an account that already exists, which is how a tester signs in with Google while the flag is off.

Password accounts stay as they are. The portal (ADR 022) keeps its sign-in by code, and accepting an invitation (ADR 003) keeps asking for a name and a password; both can get Google later without changing what is decided here.

### The flow

The SPA starts the sign-in with `signInWithOAuth` and the PKCE flow, sending Google back through Supabase to `/auth/callback`, a public route that exchanges the code for a session and goes on as signing in does: to `/dashboard`, or to `/onboarding` for an account without a membership. Cancelling at Google returns to the page the sign-in started from; a sign-in Google or Supabase refused shows a page that says so, with the way back. `detectSessionInUrl` stays off: the callback page exchanges the code itself, so no other page acts on a URL.

Each environment allows its own `/auth/callback` as a redirect in `supabase/config.toml`, the local stack both `localhost` and `127.0.0.1`.

### What Google changes about an account

Google has verified the address, so a Google account is confirmed when it is made and goes straight to onboarding; this is the exception to ADR 004's confirmation email. Onboarding is otherwise the same for everyone: the name is filled in from the one Google returns and stays editable, and the terms are still accepted by ticking the box, since that acceptance is the person's own act.

Supabase links a Google identity to an existing account with the same verified address, so a tester who registered with a password and later presses the Google button reaches the same account and organization.

An account made with Google has no password. The profile's password card asks for the current password, so for such an account it offers to email a link that sets one instead, through the existing password reset.

The signup event carries how the account was made, `signed_up` with `method: 'google'` beside `'password'`, so the tester round shows which one people choose.

### Configuration lives in code where it can

The provider is declared in `supabase/config.toml` under `[auth.external.google]`, with the client's ID and secret read through `env()`. CI fills them from the GitHub environment's secrets `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, and `supabase config push` applies them like the rest of the file. Locally they come from `supabase/.env`.

There are two OAuth clients in one Google Cloud project, `ssm-usor`, owned by the company's Workspace: production's, and one shared by non-prod and the local stack, so a secret on a developer's machine never signs anyone into production. The consent screen is External and in production, asks for no scope beyond `openid`, `email` and `profile`, and has no logo, which together keep it out of Google's verification. Google offers no API for consent screens or OAuth clients, so they are recorded as a runbook in `docs/app-deployment.md` instead.

### Production on its own domain

Production's Supabase project serves its API at `auth.ssmusor.ro` (a custom domain, a Pro add-on), so Google's picker names `ssmusor.ro`. Production's `VITE_SUPABASE_URL` becomes `https://auth.ssmusor.ro`; the API reads the same variable. Non-prod keeps its `supabase.co` address, which only the team sees.

Rejected: Google's own sign-in button (Google Identity Services) handing an ID token to `signInWithIdToken`, which shows the app's domain with no custom domain. It costs more code in the SPA and a nonce to manage, while the Pro plan was wanted anyway for backups and to stop a quiet production project from being paused. Rejected too: the `supabase.co` address on the picker.

## Consequences

- A tester can register with two clicks and one field.
- The consent screen, the OAuth clients and the custom domain exist outside the repository; their settings and the steps to rebuild or rotate them are in `docs/app-deployment.md`, and their DNS records are among those issue #579 plans to declare.
- Switching production's `VITE_SUPABASE_URL` signs everyone out once: supabase-js names the stored session after the first label of that address. There are no real clients yet, so it is accepted.
- Once `VITE_REGISTRATION_LINK` is turned on, anyone with a Google account can create an organization from the login page. Such an account sees nothing until it does, and it makes us send no email, so ADR 004's concern about our sender does not grow.
- A Google account's name and address are Google's at signup; changing them later in Google does not change them here.

## Order of work

1. `[auth.external.google]` and the redirect URLs in `supabase/config.toml`, the secrets in the deployment workflow, the runbook, this ADR.
2. The SPA: the PKCE client, `/auth/callback`, the buttons, the name at onboarding, the password card for an account without a password, the `signed_up` event, and tests. Checked on non-prod with the non-prod client.
3. Production's `VITE_SUPABASE_URL` switched to `https://auth.ssmusor.ro` before the release that carries step 2.
