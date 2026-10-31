# ADR 004: Self-Service Registration and Onboarding

- Status: accepted
- Date: 2026-09-18
- Amended 2026-10-24: onboarding takes an optional CUI and looks it up at ANAF; see the amendment below.
- Amended by [ADR 027](adr-027-sign-in-with-google.md): an account made with Google needs no emailed confirmation.
- Amended 2026-10-31: CAPTCHA is on for every auth call Supabase gates; see the amendment below.

## Context

An organization and its first owner still come from the seed script. ADR 003 let an organization grow through invitations and kept public signup disabled; it left the first owner to "the future signup journey". This is that journey.

Two constraints shape it. Authentication stays Supabase's: no token handling or account creation of our own where Supabase has a flow. And the journey should exist before it is announced: built and usable on the hosted project, but not linked from the marketing site or the login page.

Billing, plans, and the legal details of an organization arrive with the Stripe integration and are out of scope.

## Decision

### Registration is Supabase's signup

`/register` asks for an email and a password and calls Supabase's `signUp`. `enable_signup` is turned on, which replaces the sentence in ADR 003 that public signup stays disabled; invitations keep creating their accounts through the Auth Admin API. The page answers the same for an address that already has an account, as Supabase does, so it cannot be used to find out who is registered.

Email confirmation is required, locally too. Supabase hands the confirmation email to the Send Email hook from ADR 002, which gains the `signup` type and a template of its own. The email links to `/confirm-email?token_hash=…` in the SPA. That page confirms when its button is pressed, not when it is opened, so a mail scanner following the link cannot use the token up. Confirming signs the person in.

### An account is not yet a customer

Registration creates an identity and nothing else. A signed-in account without a membership is sent to `/onboarding`, whether it just registered, was removed from an organization, or was created before its invitation was accepted. The page replaces today's "Fără organizație" message.

Onboarding asks for the person's name and the organization's name, and for acceptance of the terms with a checkbox. The contract is between us and the organization, so this is where it is accepted, not at registration, and a checkbox is right here although ADR 003 used a notice for invited members, who accept nothing on the organization's behalf.

One database function, callable only by an account without a membership, creates the organization, makes the caller its `owner`, writes their profile name, and records the acceptance, in one transaction. The accepted terms version and time are stored on the organization with who accepted, and on the owner's profile like any member's. One organization per user still holds; the primary key on `organization_members` enforces it.

### A pending invitation is pointed out

Someone invited to an organization may register on their own instead of following the emailed link. Creating an organization would then shut them out of the one that invited them. When open invitations exist for the account's confirmed email, onboarding names the organizations and who invited, and says to use the link in that email or ask for it to be resent. It offers no accept button: the emailed token stays the only proof that accepts an invitation.

### Not public yet

Nothing links to `/register`: not the marketing site, and the login page only behind a build-time flag that stays off. This is obscurity, chosen because it is the simplest to build and to undo. Supabase signup is a project-wide switch, so once it is on, anyone holding the publishable key, which ships in the SPA, can create an account through Supabase directly. Such an account sees nothing until it creates an organization, which is what registration is for. What the switch really exposes is our sender: each signup makes us email a confirmation to an address the caller chose.

That is accepted for now. Supabase limits how often one address can be emailed (once a minute on the hosted project) and how many emails go out per hour. The hourly cap is not something `supabase config push` manages, so it is read and changed in the dashboard, under Authentication, Rate Limits. Before the page is linked anywhere, registration gets a CAPTCHA; Supabase's applies to every auth call, login and password reset included, so it is its own piece of work. An allowlist through Supabase's Before User Created hook was considered and set aside as more machinery than this stage needs.

### Order of work

1. The migration and its pgTAP tests: acceptance columns on `organizations`, the create-organization function, and the function that lists the caller's open invitations.
2. The confirmation email and the `signup` branch of the Send Email hook.
3. The API: create organization, pending invitations.
4. The SPA: `/register`, `/confirm-email`, `/onboarding`, and the flagged link on the login page.
5. `enable_signup` in `supabase/config.toml`, last, so signup opens only once everything behind it exists.

## Consequences

- Accounts can now exist that belong to no organization and never will. They cost nothing and see nothing; a cleanup rule can wait until there are any.
- The hook handles two email types. The others still answer `422`.
- The accepted terms are the ones on the marketing site. A data processing agreement does not exist yet and must before registration is made public; acceptances recorded before it carry the earlier version string.
- A person removed from an organization can now create their own instead of being stranded.
- The waitlist's launch announcement, with its unsubscribe link, becomes possible and stays separate work.
- The browser flow tests cover registration against the local stack. The post-deploy checks do not register anyone on production.
- Until a CAPTCHA exists, anyone who finds the switch can make us send confirmation emails, within Supabase's rate limits.

## Amendment (2026-10-24): the CUI at onboarding

The firm's legal data used to wait for Organizație → Date firmă, and every generated document reported it missing until then. Onboarding now also asks for the CUI, optional, with the ANAF lookup of the client form. A found record names the organization, which the person can still rename, and its legal name, trade register number, county, locality, address and VAT status are kept. Someone without the CUI finishes onboarding as before.

The details are saved once the organization exists, through the owner's company-details route. That route replaces every field, which is safe only for an organization with nothing saved yet, so an account that turns out to be a member already saves nothing. The create-organization function is unchanged and there is no migration. A CUI the lookup did not find is saved alone. If the save fails, the organization stays, the person goes on to the app, and a message points to Date firmă.

`GET /companies/lookup` now also serves an account with a confirmed email and no membership, the accounts the create-organization function accepts. It neither throttles nor caches ANAF; anyone can register and create an organization, so it was no less open before.

Two PostHog events measure the journey: `signed_up` with `method`, and `organization_created` with `with_cui` and `details_from_anaf`. They carry no personal or company data. PostHog still starts only for members ([ADR 009](adr-009-problem-report-intake.md)), who have accepted the terms with their organization, so both events wait in the browser and go out, stamped with when they happened, in that account's first member session there. A sign-up confirmed in another browser, or never followed by an organization, is not counted.

## Amendment (2026-10-31): CAPTCHA on Supabase Auth

The CAPTCHA this ADR required before registration is linked is Supabase's own, `[auth.captcha]` in `supabase/config.toml`, with Cloudflare Turnstile, approved by Mircea on 2026-10-31 as step 15 of [ADR 029](adr-029-billing-plans-and-trials.md) requires. A gate of our own in front of signup was not considered: anyone with the publishable key can call Supabase directly, so only Supabase can refuse the call.

Supabase checks a token on every route it gates, not on signup alone. Read from the Auth server's source (`supabase/auth`, `internal/api/api.go` and `verifyCaptcha` in `middleware.go`, 2026-10-30): `/signup`, `/recover`, `/resend`, `/magiclink`, `/otp`, `/token` with the `password` grant (and `web3`, and any grant it does not name), SSO and passkey sign-in. The `refresh_token`, `pkce` and `id_token` grants, `/verify`, `/authorize` and the OAuth callback are not gated, nor is a call made with the secret key. So the app sends a token with its password sign-in (the login page, the sign-in after accepting an invitation, and the check of the current password before a change), its signup, and its reset-link requests (the forgot-password page and the first password of an account made with Google); the portal with every code request. Google sign-in, confirming an email, using a recovery link and refreshing a session need none.

The widget is the marketing waitlist's, `ssm-usor-marketing-subscribe`, in managed mode: its domains already cover the app and the portal, and its keys are already in both GitHub environments. It is rendered with `interaction-only`, so a person sees it only when Turnstile wants a click. A token works once and for five minutes, so each attempt takes a fresh one and the widget is reset after every call, successful or not. A refused token reads "Verificarea de securitate nu a reușit"; the portal tells it apart from the answer that a code is on its way, since it says nothing about the address.

Locally and in the browser flow tests the stack uses Cloudflare's public test secret, which accepts only the dummy token that the test site key gives. The deployed SPA check cannot pass a real challenge from a CI runner, so it gets its session from a magic link the Auth Admin API makes, and the login form is left to the flow tests.

The consequence above, that anyone who finds the switch can make us send confirmation emails, now needs a browser that passes Turnstile for each one.
