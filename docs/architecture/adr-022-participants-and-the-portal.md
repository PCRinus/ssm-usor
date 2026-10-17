# ADR 022: Participants, the people of a client who sign in, and the portal they see

- Status: proposed
- Date: 2026-10-17

## Context

Everyone who signs in today is a member of an organization: an `owner` or a `specialist` of the provider ([ADR 003](adr-003-organization-invitations.md), [ADR 004](adr-004-registration-and-onboarding.md)). Every policy resolves the caller to one organization through `current_organization_id()`, and an account without a membership sees nothing. The only people outside the provider who touch the app are the recipients of a contract's return link ([ADR 007](adr-007-leads-and-service-contracts.md)), who hold a token and no account.

The product scope promises a fourth product: "a client and employee portal for supplying data, completing assigned actions, signing documents, and viewing relevant records", mobile web first, for people who "should need almost no training to complete an assignment". The training records of [ADR 021](adr-021-training-records-and-individual-sheets.md) are the first records about one person that such a person would want to see, and the first thing they will sign: every record has signer slots for the trainee, the trainer, the verifier and the person who admits to work, and the paper sheet carries those signatures until the electronic signature exists. Mircea's ITM contacts confirmed in October 2026 that an advanced electronic signature (eIDAS art. 26) suffices across the board, and he decided on 2026-10-17 to build it in-house, first for the organization's members, then for employees and the people who run a client. The advanced signature needs the signer to be a known, identified person under whose sole control the signing step is. That person must exist in the app before anything can be signed, which is why this ADR comes first and leaves signing to the next one.

Who those people are: the **employee**, who attends trainings, signs their own sheet rows and has a right of access to the data kept about them; the **workplace manager**, a responsible person who gives the workplace and periodic trainings and signs as trainer; and the person at the client who looks after the staff's records, the administrator, the HR person or the legal representative, who admits people to work, signs the client's documents and wants to know who is trained and who is due. What the three have in common: each has a phone of their own, which is the device they will use, and each will bear one flow, no manual and nothing to install.

What the app holds about them: an employee has an optional email and an optional phone, a home address, a birth date, a position and a workplace; a responsible person has a name, a job title and optionally an employee; a client has a legal representative's name and a contact person's name, email and phone. None of them has an account.

What authentication the audience can bear: a password is one more thing to forget, and the people here sign in a few times a year. A code sent to the address the employer holds for them is what they already do with their bank. Email costs nothing on the existing mailer; an SMS to Romania costs about $0.08 through Twilio, which Supabase phone login plugs into, and an employee who signs two trainings a year costs well under a leu. Mircea decided on 2026-10-17 that both channels are offered and neither is pushed in the interface.

## Decision

### A participant is a person of a client with an account

A **participant** (_participant_) is a person who belongs to one client and signs in to see what concerns them: an **employee** of that client, or the **client administrator** (_administratorul clientului_), the person who runs the client's safety records on the employer's side. A participant is created by a member of the organization, from the employee's page or the client's page, and is one row per person and client: who they are at that client, the employee row where they are one, their name where they are not, and the account they sign in with once they have accepted. The same account can be a participant at several clients, since one accountant administers several companies and one person can be employed at two clients of the same provider, and the portal then asks which client they open; most people have one and never see the question.

A participant is not a member and a member is not a participant. The organization's roles stay `owner` and `specialist`; a third value in `organization_role` was rejected, because a participant belongs to a client, not to the organization, and every policy that compares `organization_id` with the caller's would have to learn an exception. A participant acts under policies of their own, written per table, that let them read the rows about themselves: their employee row, their training records and the trainings held they attended, the client's name, their position's name and work zone, their workplace, and the organization's name and footer facts that their sheets print. Nothing in the policies of members changes.

One auth account may hold a membership and participations at once. The two never mix: the app's routes act on the membership and the portal's routes on the participations, so a specialist who is also somebody's employee signs into the app at `app.ssmusor.ro` and into the portal at `portal.ssmusor.ro`, each with its own session. Refusing to invite an address that has a member account was rejected: it would tell the member who invited whether that address has an account, which ADR 003 took care never to say. Nothing sends an account from one to the other: the app's membership gate is unchanged, and a participant who types the app's address gets its login page, which asks for a password they do not have.

The **workplace manager** is not a kind of participant. Being one is a responsible-person role of an employee at a client, which the app already holds; a participant whose employee row carries that role gets the manager's views when they exist, as the signing ADR will need them to sign as trainer. Storing the role twice was rejected.

### An invitation goes to an address, and the address is the identity

A member invites a participant to one **address**: the employee's email or phone from their row, or for an administrator a name and an address typed in the dialog, proposed from the client's contact person. Where the employee has both, the member picks; neither is proposed first. The phone is normalized to E.164 on the employee row, with Romania as the default country, by the contract and once by a migration; an address that cannot be normalized cannot be invited. A **participant invitation** (_invitație_) is a row: the client, the person (the employee or the name), the address and its channel, who invited, `expires_at`, `accepted_at` and `revoked_at`, with its status derived. It expires after 30 days, not the 7 of a member's, since a workshop's employees are not at a desk; a client holds one open invitation per address; resending renews it and resends the message, one resend per 10 minutes.

There is no token. The message says who invited them and where to go, and that they sign in with the address it came to; the portal's address is the same for everyone. What proves that the person is who the member meant is that they receive a code at that address, which is a stronger proof than holding a link: a link is forwarded, a mailbox or a phone is not. On the first sign-in from an address with open invitations, the account is linked to each of them in one transaction and they are marked accepted; the person lands on the portal with nothing further to do. A member revokes an invitation, or later the participant, from the same place; a revoked participant's records stay, as ADR 021 keeps a leaver's.

The invitation message is sent by the API through the mail Worker, by email with the existing templates' look, or by SMS through a `sendSms` that the mail Worker gains, backed by Twilio with an alphanumeric sender where the carrier allows it. The SMS is written without diacritics and under 160 characters: a message with a single ș is encoded in UCS-2, holds 70 characters per segment and costs two or three times as much; the invitation and the code are the two messages the app will send most, and the interface's rule on diacritics stops at the SMS.

### Signing in is a one-time code, by email or SMS

The portal has no password. Its sign-in page asks for one thing, an email or a phone, and then for the six-digit code that arrives there, through Supabase's one-time passcode: `signInWithOtp` without creating users, then `verifyOtp`, as the SDK does it. The code's email leaves through the existing Send Email hook of [ADR 002](adr-002-transactional-email.md), with a template of its own, so that it reads like the invitation it follows; the code's SMS leaves through Supabase's Send SMS hook, which hands the code to the mail Worker's `sendSms`, verified the way the email hook is. One SMS vendor, one set of credentials, held by the Worker; Supabase holds none. A password was rejected for the reasons in the context; a magic link was rejected because a link opened on a laptop from a phone's mail app signs the laptop in, and because the code is what the signature will reuse as the signer's sole-control step.

Who gets a code: a code is sent only to an address with an account, and an account exists for an address once a member has invited it. The API creates the auth user, with the address unconfirmed, when the invitation is sent, through the Auth Admin API, as ADR 003 creates an invited member's at acceptance; the first verified code confirms the address. Self-service signup by phone stays off in Supabase, so a stranger's number gets no SMS, and a request for a code to an address nobody invited is answered as any other is, "if this address is known, a code is on its way", so that the page never says which addresses exist. The spend an address can cause is bounded by Supabase's own limits: one code per address per minute, and a project-wide cap on SMS per hour, which is raised from its default of 30 to what a client onboarding a floor of employees in one afternoon needs. CAPTCHA on Supabase's auth endpoints is not turned on now: it would also gate the app's password sign-in and registration, and the cap bounds the loss; it is the first thing to turn on if the spend ever shows abuse.

Twilio Verify, which would generate and check the code itself, was rejected: Supabase already does that, and Verify costs a second fee on each code.

### The portal: one column, four places, nothing else

The portal is a single-page application of its own, `apps/portal`, served at `portal.ssmusor.ro` as the app is at `app.ssmusor.ro`: a Worker with static assets, the same stack, React, TanStack Router with file routes, the UI package and the design tokens, and a layout of its own: one column, phone first, a bar of at most four entries at the bottom on a phone and at the top on a wider screen, no sidebar, no breadcrumbs, no account menu with an organization in it. A route tree inside the app was the first draft, and Mircea rejected it on 2026-10-17: what the portal would share inside the app is what it does not want, the password auth store, the membership gate, the sidebar shell, the feature folders and the route conventions of a workspace, and it would have been a second shell in an app built around the first. A separate origin also keeps the sessions apart, since the browser storage is per origin: a member signed into the app is not signed into the portal, and no rule has to send an account from one to the other. A deploy of one cannot break the other, and the portal's flows run against a small app.

The portal calls the one API, under a `/portal` prefix, through a generated client of its own: the routes of the prefix carry the OpenAPI tag `portal`, and a second orval output generates from the same OpenAPI document only the operations with that tag, into the portal app, so that the portal's whole API surface is one file a reviewer can read and the app's client stays what it is. Generating one client for both apps was rejected: the portal would carry every type of the app for nothing, and nothing would say which routes a participant may call. The fetch adapter the generated code calls, the origin guard, the bearer token, the file download and the error type, moves to a package the two apps share, with the app passing in its event capture; two copies of the same error handling would drift apart.

What an employee sees:

- _Acasă_: their name, the client, their position; what needs them, which is empty until the signature exists and says so; their last training and the next due, per domain, with the state the app computes.
- _Instruiri_: their training records, newest first, each with its day, domain, phase, material and trainer, and under them the two individual training sheets, opened as PDF, which is the same on-demand route as the employee's page uses, scoped to the participant. A sheet that is not ready says what the client's specialist still has to fill, by name, and nothing else: the participant cannot fix it.
- _Datele mele_: the identification data the sheets print, as they will print it, read-only, with the specialist's name and address for corrections. This is the right of access of GDPR art. 15 served as a page.
- _Contul meu_: the address they sign in with, the client (or the clients, with the switch), sign out, and the privacy notice.

What a client administrator sees in addition: the client's employees with their two training states and the next due date, each employee's records and sheets opened the same way, and the client's responsible persons as named. Read-only, and nothing of the provider's documentation yet: what a client signs comes with the signature.

The portal writes nothing in this ADR. Letting an employee correct their own route or phone was considered and left for later: a changed address is an identity change, and a changed route is a fact on a signed sheet; both belong with the signing ADR, which decides what a correction does to a signed record.

### What a participant is told

The participant's data is processed under the employer's legal obligations (Legea 319/2006, HG 1425/2006, OMAI 712/2005) and the organization's contract with the employer; nothing in the portal needs consent, and no checkbox is shown. The first page after sign-in shows a privacy notice that names the client as the employer and the organization as the provider, says what the portal shows and why, and links the privacy policy; the version shown and the day are recorded on the participant, as the member's terms version is on the profile. The legal review (#61) covers the notice, and the data-processing agreement (#62) must say that the provider gives employees access to their own records on the employer's behalf.

A participant whose employee is terminated keeps the portal: the records stay, as ADR 021 decided, and the person's right of access does not end with the contract. The member can revoke the participant when the employer asks. Revoking on termination was rejected as the default.

## What is left out

- The electronic signature, the `training_signatures` table, signature requests and the "what needs you" list that they fill: the next ADR. This one creates the people and the sole-control step it will use.
- Anything a participant writes: corrections to their data, a route declaration, answers to a test (#449).
- The documents an employee was trained on, the position's instructions and the workplace's posted instructions as issued PDFs on _Instruiri_: a manifest flag and a policy away, after the shell exists.
- The workplace manager's views: the trainings they gave, the people they admitted. They come with signing, where the manager signs as trainer.
- WhatsApp as a channel: Twilio supports it, nobody has asked.
- Inviting every employee of a client at once: one at a time from the employee's page first; a bulk action once the first client wants it.
- A client administrator writing anything about the employees, and the "supplying data" of the product scope.
- A password for a participant, beside the code: Supabase keeps both on one account, so it is a page in the portal and a reset flow, when the optics of a password are worth it. Mircea's call of 2026-10-17: not in the first version.
- Removing an auth user whose invitation expired unaccepted: the row stays, as expired member invitations do; a retention rule for both at once.

## Consequences

- A second principal exists, and for the first time policies answer to someone who has no organization. Every new table from here on decides whether a participant reads it, and the pgTAP tests get a participant beside the member and the stranger.
- The API has a second middleware chain, `requireParticipant`, resolving the account's participations the way `requireMembership` resolves its membership, and a route prefix `/portal` whose contracts are its own; nothing of the app's responses is reused as-is, so that what a participant is told is decided once per route.
- The mail Worker sends SMS, through Twilio, and receives a second Supabase hook. Its name is now narrower than what it does; it keeps the name.
- Supabase's phone auth is on, with signup off and the SMS cap raised, the Send SMS hook pointed at the Worker, and the hosted project configured from `config.toml` by CI as it is now. Twilio's credentials are two more secrets of the Worker.
- A third deployed application exists, `apps/portal`, with its own Worker, custom domain, environment, CI build, verify step and Playwright flows, on the pattern of `apps/app`. The API's allowed origins gain the portal's. The fetch adapter becomes a package, the generated client is per app, and CI's drift check covers both outputs.
- The employee's phone is stored in E.164 from now on; the form shows it as typed and keeps it normalized.
- An auth user is created when an invitation is sent, not when it is accepted, so `auth.users` holds addresses of people who have not signed in; the invitation row says why each exists.
- Costs: email codes are free; an SMS invitation plus a code is two messages, about $0.16, per employee without an email, then one code per sign-in.
- The glossary gains participant, client administrator, participant invitation and portal; `docs/data-model.md` and `docs/api.md` change with the pull requests.

## Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. The schema: `client_participants` and `participant_invitations` with their functions and policies, the participant policies on the tables a participant reads, `current_participations()`, and the E.164 phone; pgTAP with a participant caller.
3. The messages: the invitation email, the invitation SMS and `sendSms` in the mail Worker; the code email template on the Send Email hook; the Send SMS hook. Independent of step 2.
4. The API: inviting, resending and revoking from the employees and clients modules; the auth user at send time; `requireParticipant` and `/portal/me`; the portal's read routes for the records, the sheets and the data. On steps 2 and 3.
5. The app side: the invite, resend and revoke actions on the employee's page and the client's page, with the participant's state shown there.
6. The portal application: the scaffold at `apps/portal` with its Worker and domain, the shared fetch adapter package, the `portal` tag and the second orval output, the deploy and verify jobs. Independent of steps 2 to 5.
7. The portal's pages: the sign-in page with the code, the layout and the bar, the four places of the employee, the privacy notice. On steps 4 and 6.
8. The client administrator's places. On step 7.
9. The signing ADR.

## Defaults taken instead of asking the provider

1. Both channels are offered and neither is proposed first; the member picks when the employee has both.
2. A terminated employee keeps the portal until a member revokes them.
3. Invitations expire after 30 days, a resend renews them.
4. CAPTCHA stays off on the auth endpoints, with the SMS cap as the bound.
