# API foundation

`@ssm-usor/api` runs Hono on a Cloudflare Worker. The SPA signs in directly with Supabase;
the API accepts `Authorization: Bearer <access_token>` and independently verifies it.

## Local configuration

For Auth and Postgres running in Docker, follow [local Supabase development](local-development.md).
The settings below connect the local Worker to hosted Supabase.

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill in:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Use the same Supabase project URL and publishable key as `apps/app/.env.local`, without the
`VITE_` prefixes. Get the URL from Supabase's **Connect** dialog and the publishable key from
**Settings → API Keys**. The existing project is `https://xvhiwymggufbvjdfywjg.supabase.co`.
The local `.dev.vars` was populated during initial setup; it is ignored by Git. New checkouts
need to copy the example. Wrangler reads `.dev.vars` from the API workspace; restart it after
changing these values. Do not put the API configuration in the repository root `.env`.

```bash
pnpm --filter @ssm-usor/contracts --filter @ssm-usor/document-engine build
pnpm dev:api
```

The API is available at `http://localhost:8787`. `pnpm dev` runs the workspaces together.
These checks work without a user account:

```bash
curl -i http://localhost:8787/health
curl -i http://localhost:8787/me
```

They return `200` and `401`, respectively. A successful `/me` request needs a user's Supabase
access token in the Authorization header; the publishable API key is not a user access token.

## Routes and authentication

| Route                                                                  | Access                                | Response                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /openapi.json`                                                    | Public                                | Generated OpenAPI contract                                                                                                |
| `GET /health`                                                          | Public                                | `{ "status": "ok", "service": "ssm-usor-api" }`                                                                           |
| `POST /waitlist`                                                       | Public, behind Turnstile              | `202 { "status": "confirmation_pending" }` and a confirmation email                                                       |
| `GET /waitlist/confirm`                                                | Public, by emailed token              | `303` to the marketing site's confirmed or invalid-link page                                                              |
| `POST /hooks/supabase/send-email`                                      | Supabase Auth, by signature           | `200 {}` after handing the recovery, signup, or password-changed email to the mail Worker                                 |
| `GET /me`                                                              | Verified, non-anonymous Supabase user | `{ "user", "profile", "membership" }`; the last two are null when absent                                                  |
| `PATCH /me/profile`                                                    | Verified, non-anonymous Supabase user | The saved profile; creates it when the account has none                                                                   |
| `GET /me/invitations`                                                  | Verified, non-anonymous Supabase user | `{ "items": [ … ] }`, open invitations sent to the caller's address; no id, no token                                      |
| `POST /organization`                                                   | Verified user without a membership    | `201` with the new membership, after creating the organization                                                            |
| `GET /organization/members`                                            | Verified user with a membership       | `{ "items": [ … ] }` with names, emails, and roles                                                                        |
| `PATCH /organization/members/{userId}`                                 | Owner                                 | `204` after changing the member's role                                                                                    |
| `DELETE /organization/members/{userId}`                                | Owner                                 | `204` after removing the membership; the account stays                                                                    |
| `GET /organization/invitations`                                        | Owner                                 | `{ "items": [ … ] }`, open and expired invitations                                                                        |
| `POST /organization/invitations`                                       | Owner                                 | `201` with the invitation, after emailing the link                                                                        |
| `POST /organization/invitations/{invitationId}/resend`                 | Owner                                 | The renewed invitation, after emailing a fresh link                                                                       |
| `POST /organization/invitations/{invitationId}/revoke`                 | Owner                                 | `204`                                                                                                                     |
| `POST /invitations/lookup`                                             | Public, by emailed token              | What the accept page shows, including `accountExists`                                                                     |
| `POST /invitations/accept`                                             | Public, by emailed token              | `201` after creating the account and the membership                                                                       |
| `POST /invitations/join`                                               | Verified user, by emailed token       | The signed-in account joins the organization                                                                              |
| `GET /clients`                                                         | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`, active clients, or `?status=archived`; `?page=&pageSize=&sort=&order=` |
| `POST /clients`                                                        | Verified user with a membership       | `201 { "client": { … } }`                                                                                                 |
| `GET /clients/{clientId}`                                              | Verified user with a membership       | `{ \"client\": { … } }`, archived or not                                                                                  |
| `PUT /clients/{clientId}`                                              | Verified user with a membership       | `{ "client": { … } }` after replacing what was entered about it                                                           |
| `POST /clients/{clientId}/archive`                                     | Owner                                 | `{ "client": { … } }`, archived; nothing under the client changes                                                         |
| `POST /clients/{clientId}/restore`                                     | Owner                                 | `{ "client": { … } }`, active again                                                                                       |
| `POST /clients/{clientId}/promote`                                     | Owner                                 | `{ "client": { … } }`, a client from then on; one way                                                                     |
| `GET /clients/{clientId}/service-contract`                             | Owner                                 | `{ "contract", "suggestedNumber", "clientRepresentative", "readiness", "document" }`                                      |
| `PUT /clients/{clientId}/service-contract`                             | Owner                                 | The same, after saving the contract's details                                                                             |
| `POST /clients/{clientId}/service-contract/generate`                   | Owner                                 | The same, with the contract generated or generated again                                                                  |
| `POST /clients/{clientId}/service-contract/send`                       | Owner                                 | The same, after emailing the issued PDF to `to`                                                                           |
| `GET /clients/{clientId}/owner-notes`                                  | Owner                                 | `{ "notes": { "body", "updatedAt" } }`; an empty body when none were written                                              |
| `PUT /clients/{clientId}/owner-notes`                                  | Owner                                 | The notes after replacing them                                                                                            |
| `GET /organization/company-details`                                    | Verified user with a membership       | `{ "companyDetails": { … } }`: what documents print about the provider as a company                                       |
| `PUT /organization/company-details`                                    | Owner                                 | The company details after replacing them                                                                                  |
| `GET /organization/authorizations`                                     | Verified user with a membership       | `{ "authorizations": { … } }`: the certificate of authorization and the fire-safety technician                            |
| `PUT /organization/authorizations`                                     | Owner                                 | The authorizations after replacing them                                                                                   |
| `GET /clients/{clientId}/document-details`                             | Verified user with a membership       | `{ "documentDetails": { … } }`: the representative's name and role, and the training schedule                             |
| `PUT /clients/{clientId}/document-details`                             | Verified user with a membership       | The document details after replacing them                                                                                 |
| `GET /clients/{clientId}/workplaces`                                   | Verified user with a membership       | `{ "items": [ … ] }`, registered office first; not paginated                                                              |
| `POST /clients/{clientId}/workplaces`                                  | Verified user with a membership       | `201 { "workplace": { … } }`                                                                                              |
| `PUT /clients/{clientId}/workplaces/{workplaceId}`                     | Verified user with a membership       | `{ "workplace": { … } }` after replacing it                                                                               |
| `DELETE /clients/{clientId}/workplaces/{workplaceId}`                  | Verified user with a membership       | `204` after archiving it                                                                                                  |
| `GET /clients/{clientId}/responsible-persons`                          | Verified user with a membership       | `{ "items": [ … ] }` by name; not paginated                                                                               |
| `POST /clients/{clientId}/responsible-persons`                         | Verified user with a membership       | `201 { "responsiblePerson": { … } }`                                                                                      |
| `PUT /clients/{clientId}/responsible-persons/{responsiblePersonId}`    | Verified user with a membership       | `{ "responsiblePerson": { … } }` after replacing it                                                                       |
| `DELETE /clients/{clientId}/responsible-persons/{responsiblePersonId}` | Verified user with a membership       | `204` after archiving it                                                                                                  |
| `GET /clients/{clientId}/documents/readiness`                          | Verified user with a membership       | `{ "ready", "missing": [ … ] }`: what generating is waiting for                                                           |
| `GET /clients/{clientId}/documents`                                    | Verified user with a membership       | `{ "items": [ … ], "lastGeneration" }`, in the order of the pack; not paginated                                           |
| `POST /clients/{clientId}/documents/generate`                          | Verified user with a membership       | `201 { "created": [ … ], "skipped": [ … ] }`                                                                              |
| `GET /documents/{documentId}/revisions/{revisionId}/download`          | Verified user with a membership       | `{ "url", "fileName", "expiresInSeconds" }`, a link valid for a minute                                                    |
| `POST /documents/{documentId}/regenerate`                              | Verified user with a membership       | `{ "document": { … } }` with its new draft                                                                                |
| `POST /documents/{documentId}/issue`                                   | Verified user with a membership       | `{ "document": { … } }` with its issued revision                                                                          |
| `POST /documents/{documentId}/draft`                                   | Verified user with a membership       | `{ "document": { … } }` with a draft copied from its issued revision                                                      |
| `DELETE /documents/{documentId}/draft`                                 | Verified user with a membership       | `204` after deleting the draft and its file                                                                               |
| `PUT /documents/{documentId}/signed-copy`                              | Verified user with a membership       | `{ "document": { … } }` after attaching or replacing the signed copy of the issued revision                               |
| `DELETE /documents/{documentId}/signed-copy`                           | Verified user with a membership       | `204` after removing the signed copy and its file                                                                         |
| `PUT /documents/{documentId}/draft/file`                               | Verified user with a membership       | `{ "document": { … } }` after replacing the draft's Word file                                                             |
| `POST /clients/{clientId}/documents/{typeKey}/upload`                  | Verified user with a membership       | `{ "document": { … } }` with the uploaded file as its draft                                                               |
| `GET /companies/lookup`                                                | Verified user with a membership       | `{ "company": { … } }` from ANAF, by `?cui=`                                                                              |
| `GET /clients/{clientId}/employees`                                    | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`; `?page=&pageSize=&sort=&order=&status=`                                |
| `POST /clients/{clientId}/employees`                                   | Verified user with a membership       | `201 { "employee": { … } }`                                                                                               |
| `GET /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }`, the only response carrying the CNP                                                               |
| `PUT /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }` after replacing what was entered about them                                                       |
| `PATCH /clients/{clientId}/employees/{employeeId}/status`              | Verified user with a membership       | `{ "employee": { … } }` after marking a leaver (with `terminatedAt`) or reactivating                                      |
| `PATCH /clients/{clientId}/employees/{employeeId}/job-position`        | Verified user with a membership       | `{ "employee": { … } }` in the new job position                                                                           |
| `GET /clients/{clientId}/job-positions`                                | Verified user with a membership       | `{ "items": [ … ] }`, by name, each with `employeeCount`                                                                  |
| `POST /clients/{clientId}/job-positions`                               | Verified user with a membership       | `201 { "jobPosition": { … } }`                                                                                            |
| `PUT /clients/{clientId}/job-positions/{jobPositionId}`                | Verified user with a membership       | `{ "jobPosition": { … } }` after the change                                                                               |
| `DELETE /clients/{clientId}/job-positions/{jobPositionId}`             | Verified user with a membership       | `204`: deleted, or archived when people who left still point at it                                                        |

`/health` checks the Worker, not Supabase connectivity. `/me` returns the user's ID and email
(nullable), their profile, and their organization with their role. It answers an account
without a membership too, with `membership: null`, and never exposes Supabase metadata.
During an impersonation `membership` is the impersonated user's while `user` and `profile`
stay the platform admin's own.

Client routes are scoped to the caller's organization. `src/lib/membership.ts` calls the database
helper `current_membership()` and answers `403 forbidden` when the user has no membership.
`POST /clients` validates the body with the Zod schema from `packages/contracts` (CUI checksum,
county list, CAEN format), stores the CUI as digits, and treats an `RO` prefix as VAT
registration. `GET /companies/lookup` proxies ANAF's public VAT registry (no CORS, roughly one
request per second) and maps the record onto the client form fields; the form must work without
it. `PUT /clients/{clientId}` takes the same body without `legalRepresentativeName`, which the
document details own, and answers `409` for a CUI another client has and for an archived client.
A `409` of these routes carries a `reason`: `cui_taken`, `cui_taken_by_archived` (the holder is
archived, so the caller cannot see it in the list they came from), `cui_taken_by_lead` (the
holder is a lead, which is also the answer when the caller cannot see the holder at all, as a
specialist cannot) or `client_archived`.
Archiving and restoring are an owner's, checked by `requireOwner` and again by a trigger;
repeating either changes nothing and keeps the first date.

What is known about the provider is two resources, as the organization page shows it.
`/organization/company-details` is the company: its name and registration, `vatPayer`, which
the ANAF lookup fills and which decides the sentence about VAT beside the prices of a
contract, the registered office, `phone`, the legal representative, and `iban` with
`bankName`. `/organization/authorizations` is the certificate of authorization
(`authorizationCertificateNumber`, `…Date`, `…Issuer`) and the fire-safety technician with
their certificate, as text (issue #170). Every member reads both and an owner writes them:
none of it is secret, and what is owners-only about a contract is the contract. Everything is
optional and `PUT` replaces all of a resource; generating a document or a contract is what
asks for them. The
IBAN is taken with or without spaces, checked by `isValidIban` (ISO 13616, mod 97) and stored
bare in upper case; `formatIban` prints it in groups of four.

A lead (ADR 007) is a client in an earlier stage and uses the same routes. `GET /clients` lists
one stage at a time, `?stage=client` by default, and `POST /clients` takes `stage`; asking for
leads or creating one is an owner's, `403` otherwise, said by the handler because the policies
would only show a specialist an empty list. For a specialist a lead does not exist: `404` by
id. The client carries `stage`, `contactName`, `contactEmail`, `contactPhone` and `promotedAt`.
`PUT /clients/{clientId}` never changes the stage, and leaves a contact field that is not sent
as it is, so that a form without the contact does not erase it; `null` clears one. Employees,
job positions, workplaces, responsible persons and the documentation set do not start under a
lead: the database refuses with `CLL01`, which `fromDatabaseError` turns into `409` with the
reason `client_is_lead`. `POST /clients/{clientId}/promote` turns an active lead into a client; the database stamps
`promotedAt` and who did it. Promoting a client changes nothing, an archived lead answers
`409` with `client_archived` and is restored first. The owners' notes, `…/owner-notes`, are one free text per client or
lead, up to 5000 characters, never readable by a specialist, before or after promotion.

The service contract of a client or a lead (ADR 007) is an owner's. `GET
/clients/{clientId}/service-contract` returns what the app reads about it (`contract`: number,
dates, duration, renewal, the services covered, and `endDate`, the last day of the first term;
null until saved), `suggestedNumber` (the last number of this year plus one, 1 in a year
without contracts, null when the organization has none at all and only the owner knows where
its register stands), who signs for the client, `readiness` with what generating is waiting
for (`missingServiceContractData`: the organization's company details and authorizations, the client's
registration, address and representative, the contract's own details; the fire-safety
technician only when fire safety is covered), and `document`, the contract as a document once
it is generated. `PUT` saves the details, and the client's representative when sent, which a
lead has no other form for; a number used twice in a year answers `409` with
`contract_number_taken`. Prices are not kept: they are written in the file.

`POST …/service-contract/generate` merges the starter template
([document engine](document-engine.md)) with the context of
`modules/service-contracts/context.ts` and writes the result as the contract's draft, through
the same code that regenerates a document of the set: a draft is overwritten, hand edits
included, and beside an issued contract the next revision starts. The document is created as
`other` and `owners_only` the first time. `409` with `missing_contract_data` names what is
missing, `template_missing` says that no template is registered, and an archived client is
refused before anything is read. The response's `draftOutdated` says that the draft would now
print something else: its snapshot is compared, name by name, with the context of today. From
then on the contract goes through `/documents/{documentId}` like any document: saving from the
editor, issuing (which warns about `DE COMPLETAT`, where the prices go), a draft from the
issued file, deleting a draft, downloading. `GET /clients?stage=lead` adds
`serviceContractState` (`none`, `draft`, `issued`) to each lead, from an embedded read that
names its relationships, because `clients`, `client_documents` and `document_revisions` are
each linked twice, by id and by id with organization; it is null in every other response.

`POST …/service-contract/send` takes `to` and an optional `note`. Issuing sends nothing: an
owner sends, knowingly. The PDF of the issued revision is read from Storage and handed to the
mail Worker as Base64 (`sendServiceContract`), in the owner's name, with replies and a copy
going to the owner's own address; then the send is recorded. A failed hand-over answers `503`
and records nothing. `409` with `contract_not_issued` when nothing is issued, and with
`contract_pdf_missing` for a revision issued where no converter was configured: the Word file
is not sent in its place, because it invites the recipient to change clauses. The response's
`lastSend` is the last send of the revision in force, so issuing a new revision clears it, and
`serviceContractState` of a lead gains `sent` on the same rule.

`PUT /documents/{documentId}/signed-copy` takes the bytes of a PDF, up to 15 MB, that starts
with `%PDF-`: a scan of the signed paper, or the file signed with the signer's own
certificate. The row is written first, with the file's SHA-256, because the policies let a
file in only where a row says it lives; a first copy whose file cannot be stored is taken
back, and a failed replacement keeps the earlier row. `409` with `not_issued` for a document
with nothing issued. The app records that a file was attached, not that it is signed.
Revisions carry `hasSignedCopy`, `GET …/download?format=signed` links to it under a name
that ends in "- semnat.pdf", and `DELETE` removes the file and then the row. These are
routes of any document, reachable by whoever reaches it; the contract's is its owners'. A
lead's `serviceContractState` becomes `signed` when the revision in force has a copy, ahead
of `sent`. `GET /clients/{clientId}/documents` lists the documentation set only, and
`POST /documents/{documentId}/regenerate` answers `409` for a document that is not part of it.

Nothing under an archived client changes. The database refuses the write with `CLA01`, which
`fromDatabaseError` turns into `409` with the reason `client_archived` for every route at
once. Issuing, saving and deleting a draft ask first, because they touch files before rows. See the [data model](data-model.md) for the schema and policies.

Employee routes are nested under the client. The handler first looks the client up as the
caller, so a client of another organization is indistinguishable from a missing one and both
answer `404 not_found`. Adding an employee to an archived client answers `409 conflict`, and
so does a CNP or employee number already used by an active employee of that client. The list
omits the CNP and, without `?status=`, returns current employees; archived rows
are never listed. Lists are paginated with page numbers (`page` from 1, `pageSize` up to 100,
25 by default) and sorted by one whitelisted key at a time (employees:
`sort=name|jobTitle|hiredAt`; clients: `sort=legalName|cui|currentEmployeeCount`;
`order=asc|desc`), always with the id as a tiebreaker; the shared query and envelope schemas
live in `packages/contracts/src/list.ts`. A page past the end answers an empty page with the
real total. `POST` validates the CNP checksum and calendar date, stores it as digits,
lowercases the email, and rejects a birth date that contradicts the CNP. `PATCH …/status`
takes `{ "status": "terminated", "terminatedAt": "YYYY-MM-DD" }` or `{ "status": "active" }`;
a leave date before the hire date answers `400` with an issue on `terminatedAt`. Reactivating
is for undoing a mistake; a rehire after a gap is a new employee. `PUT …/employees/{employeeId}`
replaces what was entered about a person with the same body and rules as `POST`; a missing
`jobPositionId` keeps their position, a hire date after the leave date answers `400` on
`hiredAt`, and status, leave date and archive are not its to touch.

Job positions ([ADR 006](architecture/adr-006-job-positions.md)) are the posts a client
employs people in. The list is not paginated, since a client has a handful, leaves archived
positions out, and counts the current employees of each in the database. A name the client
already has, in any case, answers `409` with the reason `job_position_name_taken` and an
issue on `name`. `PUT` replaces the descriptive fields; renaming never rewrites the contract
title of the employees in the position. `DELETE` removes a position entered by mistake; one
an employee points at is archived instead, which releases its name, and while current
employees are in it the answer is `409` with the reason `job_position_held`. `POST
…/employees` takes `jobTitle`, the contract title, and an optional `jobPositionId`: one of
the client's positions that is not archived, or `400` with an issue on `jobPositionId`. Left
out, the database assigns the position named like the contract title, creating it when the
client lacks it. Employees carry `jobPosition: { id, name }` in the list and the detail, and
the list sorts by `jobPosition` as well. `PATCH …/employees/{employeeId}/job-position` moves
a person to another position; the contract title changes only when `jobTitle` is sent with
it, since a post can change without a new contract.

Data access goes through `src/lib/db.ts`: a per-request supabase-js client that forwards the
user's bearer token to PostgREST, so row-level security runs as that user. Database types in
`src/database.types.ts` are generated from the schema (`pnpm generate:db`) and checked in CI.

`src/lib/auth.ts` uses [Supabase `getUser(token)`](https://supabase.com/docs/reference/javascript/auth-getuser)
to validate the supplied token against the configured project and retrieve the current user.
This makes one Supabase Auth request for each authenticated API request, with a five-second
timeout. No user session, cookie, or refresh token is stored in the Worker. Login, persistence,
refresh, and logout stay in the browser SDK. JWT access tokens can remain usable until expiry
after sign-out; this scaffold does not implement immediate token revocation.

Routes acting for a signed-in user need only the publishable key. The waitlist acts for nobody
signed in, so it uses `createAdminClient(c)` from `src/lib/admin-db.ts`, which holds
`SUPABASE_SECRET_KEY` and bypasses row-level security. Import that client only in a module
with the same need; never reach for it to work around a policy. The invitations module is the
second, for the three things listed below.
Supabase owns its Auth schema; business tables live in SQL migrations
and are protected by row-level security. User-editable `user_metadata` never grants permissions.

New authenticated routes should attach `requireAuth`, `requireMembership` when they touch
organization data, and `requireOwner` after it for what only an owner may do, then read `c.get('user')`, `c.get('membership')`, and `createDataClient(c)`.
Transport schemas live in `packages/contracts`.

## Waitlist

`POST /waitlist` takes `{ email, consentVersion, turnstileToken }` from the marketing site's
form. It checks the Turnstile token, stores the normalized address in `waitlist_subscribers`
as pending, and asks the [mail Worker](mail.md) over the `MAIL` service binding to send a
confirmation link. The subscription is double opt-in: only following the link sets
`confirmed_at`.

The answer is always `202 { "status": "confirmation_pending" }`, whether the address is new,
pending, or already confirmed, so the endpoint does not reveal who subscribed. A confirmed
address is not emailed again, and a pending one at most once every ten minutes. Each email
carries a fresh random token of which only the SHA-256 hash is stored; sending a new one
invalidates the previous link. If the email cannot be sent the answer is `503` and the sent
time is left alone, so an immediate retry works.

`GET /waitlist/confirm?token=…` is opened in a browser. It redirects to
`/abonare/confirmata/` on the marketing site, also when the link is followed a second time,
and to `/abonare/link-invalid/` for an unknown or missing token.

The route needs `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, and the `MAIL` binding, and
answers `503` while any is missing. `API_ORIGIN` builds the emailed link and
`MARKETING_ORIGIN` is both the redirect target and the only origin CORS allows on `/waitlist`.

## Invitations

[ADR 003](architecture/adr-003-organization-invitations.md) records the design and
[the data model](data-model.md#organization-invitations) the database side.

An owner's `POST /organization/invitations` takes `{ email, role }`. As the owner, it calls
`create_organization_invitation`, which creates or renews the invitation. With the secret
key it then stores the hash of a fresh token, and only after the mail Worker has accepted the
email, the sent time. The link is `APP_ORIGIN/accept-invitation?token=…` and is never
returned. An address emailed in the last 10 minutes is answered with `409`; a failed send
with `503`, leaving the sent time so a retry works. The response is the same whether or not
the address has an account.

The accept page posts the token to `/invitations/lookup`, which changes nothing. A person
without an account then posts `{ token, fullName, password, termsVersion }` to
`/invitations/accept`: the API creates the user through the Auth Admin API with
`email_confirm: true`, calls `accept_invitation_as`, and deletes the user again if that
fails. A person with an account signs in and posts to `/invitations/join`, which runs
`accept_organization_invitation` as that user and needs no secret key.

The admin client is used for exactly three things: storing the token hash and sent time,
the lookup, and the new-account path. Tokens travel in request bodies, never in an API URL.

Invitation errors carry a `reason` so the SPA can word them: `already_member`,
`too_many_open_invitations`, `sent_recently`, `invitation_accepted`, `invitation_revoked`,
`invitation_expired`, `account_exists`, `already_in_organization`, `email_mismatch`
(`403`), and `full_name_required` (`400`).

The owner routes need `SUPABASE_SECRET_KEY` and the `MAIL` binding and answer `503` before
creating anything while either is missing.

## Onboarding

[ADR 004](architecture/adr-004-registration-and-onboarding.md). Registration itself is
Supabase's signup, which the SPA calls directly; the API's part starts once the person is
signed in without a membership.

`POST /organization` takes `{ organizationName, fullName, termsVersion }` and calls
`create_organization` as the caller. It needs no membership, unlike every other organization
route. `409` with `reason: already_in_organization` for an account that has one, `403` with
`reason: email_not_confirmed` otherwise refused. `termsVersion` must be the current one from
the contracts: the checkbox on the page accepts that version and no other.

`GET /me/invitations` lists the open invitations sent to the caller's confirmed address, so
the page can point them out before the person creates an organization of their own. It carries
no id and no token; only the emailed link accepts an invitation.

## Members

An owner changes a member's role with `PATCH /organization/members/{userId}` and removes a
member with `DELETE /organization/members/{userId}`. Both call database functions as the
owner; memberships have no write policy. Nobody acts on their own membership (`409`,
`reason: own_membership`), which is what keeps an organization from ending up without an
owner. Someone who is not a member of the caller's organization is `404`. Removing deletes
the membership only: the account, the profile, and what the person created stay, the person
sees no organization, and can be invited again.

## What the documents print

The `document-data` module holds the facts a client's SSM documentation prints
([ADR 005](architecture/adr-005-document-generation.md)); the [data model](data-model.md)
describes the columns. Every field is optional while it is being filled in; generating a
document is what will require them.

The two `PUT` routes on details replace the whole set, so a field left out or null is
cleared, which is what a form that shows every field wants. The organization's CUI accepts an
`RO` prefix and spacing and is stored as digits. The training days must be in order, and the
worker interval stops at six months, as the database checks too.

Workplaces and responsible persons are created with `POST`, replaced with `PUT`, and archived
with `DELETE`; archived rows leave the lists. An archived client takes no new ones (`409`). A
second registered office is `409`. A responsible person carries a name, a job title, one or
more of `workplace_manager`, `first_aid`, `risk_evaluation_team`, `imminent_danger`, and
optionally an `employeeId`: an employee of another client is `400` with the issue on
`employeeId`, and an employee who already is a responsible person of the client is `409`.

`PATCH /me/profile` also takes `professionalTitle`: left out it stays, `null` clears it.
`GET /organization/members` returns it for each member.

## Generated documents

The `documents` module generates a client's documentation from the built-in Word templates
([ADR 005](architecture/adr-005-document-generation.md), [the document engine](document-engine.md)).

`GET …/documents/readiness` lists what is missing as codes grouped by where it is filled in:
`provider.*`, `specialist.*` (the caller's own profile), `client.representativeName`,
`client.representativeRole`, `client.trainingSchedule`, and `responsible.<role>` for every
role nobody holds. `POST …/documents/generate` takes `issueDate` and `firstDecisionNumber`
(default 1) and is `409` with the reason `missing_document_data` until that list is empty,
`409` for an archived client, and `503` while no template is registered
(`pnpm templates:register`).

Generating creates every document type the client does not have yet as revision 1, in draft:
the row first, then the file at `<organization>/<client>/<document>/1.docx` in the private
`documents` bucket, because the storage policies only accept the file of a draft revision. If
the file cannot be stored the revision is taken back, so a second call finishes the job.
Documents that exist are left alone and returned under `skipped`; generating one document
again is its own action, since it discards what was edited by hand. Decisions are numbered
from the first number in the order training, evaluation team, first aid, imminent danger.

Each revision keeps the part of the data its template printed. The list compares it with the
stored facts and sets `dataChanged` on a draft that would now print differently: a new
first-aider marks the first aid decision, not the whole set. All files go through
`src/lib/files.ts`, as the verified user; downloads are signed links that carry the
document's title as the file name.

`POST /documents/{documentId}/regenerate` merges one document again from the stored facts. A
draft is overwritten in place, hand edits included; an issued document gets the next revision
as a draft and stays in force until that one is issued. The date is the one the document
carries unless `issueDate` is given, and a decision keeps its number. `POST …/issue` reads the
draft's file, and the database locks the revision with its SHA-256 and supersedes the one
issued before, which stays downloadable. From then on no policy lets anyone write that file
or change that row; a correction is a new draft. Where a converter is configured ([PDF Worker](pdf.md)), issuing first makes the PDF of those
bytes and stores it beside the Word file, and the database records both hashes; when the PDF
cannot be made nothing is issued, `503` with the reason `pdf_unavailable`. Revisions carry
`hasPdf`, and `GET …/download?format=pdf` links to it (`404` when there is none: a draft, or
a revision issued without a converter). A file that still reads "DE COMPLETAT"
(the contracts' `unfilledMark`, which generation prints where the app has nothing to say yet)
is refused with `409` and the reason `unfilled_text`, until the optional body carries
`acceptUnfilled: true`. The file itself is searched, across the runs Word splits a phrase
into, so a draft corrected in the editor or elsewhere is judged as it stands. `DELETE …/draft` removes the file, then the
row, and is `409` when there is no draft, so an issued revision is never touched. Both roles
can do all three, as the ADR decided.

`POST /documents/{documentId}/draft` is the correction that keeps what was written by hand:
the next revision starts as a draft whose file is a copy of the issued one, with the same
template version, generation, data snapshot and `edited_at`, so the draft says about itself
what the issued revision did, "Date modificate" included. Regenerating is the other way to a
new draft, from the template and the facts of today. `409` with the reason `draft_exists`
when the document has a draft, and `409` when nothing was issued or the client is archived.

`PUT /documents/{documentId}/draft/file` takes the bytes of a `.docx` as the request body, as
the in-app editor saves them or as edited elsewhere, up to 15 MB. It checks that the bytes
are a zip naming `word/document.xml`, writes them over the draft's file, and sets `edited_at`
and `edited_by`, which the list shows and "Generează din nou" warns about. `409` when the
document has no draft; an issued file cannot be written by anyone.

`POST /clients/{clientId}/documents/{typeKey}/upload` takes a `.docx` written elsewhere, with
the same checks. `typeKey` is one of the contracts' `packDocumentTypeKeys`, the whole pack in
its order. Five of them are `uploadedDocumentTypes`, which the app cannot write until stages
2 and 3 (the own instructions, the training themes, the protective equipment list, the risk
assessment, the prevention plan): for those the upload is how the document comes to exist, as
revision 1 in draft under the title its template will carry, so a client's set can be
complete today. For a document that exists, the file replaces the draft, or starts the next
draft beside the issued revision, keeping the generation and so the date. An uploaded
revision has no template and no data snapshot, so it never reports `dataChanged`, and it
cannot be regenerated. A generated type that does not exist yet answers `409` with the reason
`not_generated_yet`: its number and date come from a generation. Issuing, deleting the draft,
downloading and the editor work on an uploaded document as on any other.

The whole set, 18 documents, merges and uploads in under a second against the local stack,
inside `workerd` as well as in Node.

## Supabase Auth emails

Supabase Auth does not send email itself: its Send Email hook posts every email it would send
to `POST /hooks/supabase/send-email` ([ADR 002](architecture/adr-002-transactional-email.md)).
The route is left out of the OpenAPI document, since Supabase is its only caller.

The request is signed as [Standard Webhooks](https://www.standardwebhooks.com) specify. The
handler checks the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers against
`SUPABASE_AUTH_HOOK_SECRET` over the raw body, refuses anything older than five minutes, and
accepts several secrets joined with `|` while one is rotated out. Errors use the shape
Supabase expects, `{ "error": { "http_code", "message" } }`.

Two types that carry a link are handled. `recovery` links to `APP_ORIGIN/reset-password?token_hash=…` and
`signup` to `APP_ORIGIN/confirm-email?token_hash=…`, ignoring any redirect Supabase was asked
for. The SPA verifies the token when the page's form or button is submitted, so a mail scanner
opening the link cannot use it up. One notification is handled too:
`password_changed_notification`, which Supabase sends after any password change once
`[auth.email.notification.password_changed]` is enabled in `supabase/config.toml`. It carries
no token, and its one link is the public `APP_ORIGIN/forgot-password`, for an owner who did
not make the change. Supabase does not fail the password change when this notice cannot be
sent. Every other email type is
answered with `422` and logged, so an email nobody implemented fails loudly instead of never
arriving. A failed send answers `500`, which Supabase reports to the caller. The route
answers `503` while the secret or the `MAIL` binding is missing, and must finish within the
hook's five seconds.

The hook itself, the password rules, and closed signup are declared in `supabase/config.toml`
and applied to the hosted project by CI; see [CI/CD](ci-cd.md).

## Source layout

```text
src/
  app.ts               cross-cutting: headers, CORS, module mounting, OpenAPI document, errors
  router.ts            createRouter(): an OpenAPIHono with the shared validation error hook
  lib/                 auth, db, admin-db, tokens, turnstile, env, errors, membership, shared OpenAPI pieces
  modules/<domain>/    routes.ts (OpenAPI route definitions), handlers.ts, index.ts (router), tests
```

Each domain module exports one router built with `createRouter()` and registers its own
routes and handlers; `app.ts` mounts it with `app.route('/', …)`, which also merges its OpenAPI
definitions. Add a new domain by adding a folder under `modules` and one mount line. The [OpenAPI/Orval pipeline](api-client.md)
generates the SPA’s TanStack Query client used by the dashboard to call `/me`.

## Errors and CORS

All responses use `Cache-Control: no-store`. Errors share `{ "error": "…", "message": "…" }`,
with an optional `reason` where one status covers cases the client words differently:

| Status | Error                 | Meaning                                                                                                               |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `400`  | `validation_error`    | Invalid body or query; `issues` lists field paths and messages.                                                       |
| `401`  | `unauthorized`        | Missing, invalid, expired, or rejected bearer token; anonymous users are rejected too.                                |
| `403`  | `forbidden`           | No organization membership, not an owner where one is required, or the database policy rejected the write.            |
| `404`  | `not_found`           | No matching route, no company registered with the CUI, or no such client, employee, workplace, or responsible person. |
| `409`  | `conflict`            | Duplicate CUI, CNP, or employee number, an employee added to an archived client, or an invitation conflict.           |
| `503`  | `service_unavailable` | Missing/invalid Supabase configuration, timeout, rate limit, or authentication service failure.                       |
| `500`  | `internal_error`      | Unexpected API failure.                                                                                               |

Upstream error details are not returned to callers; database failures are logged by context
only. Authentication failures include `WWW-Authenticate: Bearer`.

`CORS_ORIGINS` is a comma-separated list of exact browser origins for every route except
`/waitlist`, which allows only `MARKETING_ORIGIN`. Production defaults to
`https://app.ssmusor.ro`; `.dev.vars` allows the local Vite origins instead. OPTIONS preflight
does not require authentication and allows GET, POST, PATCH, and DELETE requests with Authorization/Content-Type headers.
Cookie credentials are not enabled. CORS controls browser access to responses; bearer
authentication still applies independently, including to non-browser clients.

## Deployment and verification

`apps/api/wrangler.jsonc` declares the `ssm-usor-api` Worker at `api.ssmusor.ro`, its
production origins, and the service binding to `ssm-usor-mail`, which therefore deploys first. The **CI** workflow supplies the public Supabase bindings and deploys
and checks the API when its inputs change on `main`. If the SPA also changed, its deployment
waits for the API checks; otherwise the SPA is left untouched. `.dev.vars` is local only.
See the [application deployment guide](app-deployment.md) for GitHub configuration and release steps.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @ssm-usor/api deploy:dry-run
```

API tests exercise Hono and the real Supabase SDK with mocked HTTP responses: token forwarding,
identity isolation, response filtering, invalid credentials, anonymous users, configuration
errors, upstream failures, CORS, JSON errors, client listing and creation, membership checks,
PostgREST error mapping, and the ANAF lookup. They do not create Supabase users or rows;
policies are covered by the pgTAP tests in `supabase/tests`. The [development admin guide](development-admin.md) covers
the seed command and completed live login-to-API verification.
