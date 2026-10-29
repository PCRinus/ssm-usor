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
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
```

Use the same Supabase project URL and publishable key as `apps/app/.env.local`, without the
`VITE_` prefixes. Get the URL from Supabase's **Connect** dialog and the publishable key from
**Settings → API Keys**. The existing project is `https://xvhiwymggufbvjdfywjg.supabase.co`.
The local `.dev.vars` was populated during initial setup; it is ignored by Git. New checkouts
need to copy the example. Wrangler reads `.dev.vars` from the API workspace; restart it after
changing these values. Do not put the API configuration in the repository root `.env`.

```bash
pnpm --filter @ssm-usor/contracts --filter @ssm-usor/document-engine --filter @ssm-usor/import build
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

| Route                                                                  | Access                                | Response                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /openapi.json`                                                    | Public                                | Generated OpenAPI contract                                                                                                                                                                         |
| `GET /health`                                                          | Public                                | `{ "status": "ok", "service": "ssm-usor-api" }`                                                                                                                                                    |
| `POST /waitlist`                                                       | Public, behind Turnstile              | `202 { "status": "confirmation_pending" }` and a confirmation email                                                                                                                                |
| `GET /waitlist/confirm`                                                | Public, by emailed token              | `303` to the marketing site's confirmed or invalid-link page                                                                                                                                       |
| `POST /hooks/supabase/send-email`                                      | Supabase Auth, by signature           | `200 {}` after handing the recovery, signup, password-changed or sign-in code email to the mail Worker                                                                                             |
| `POST /hooks/supabase/send-sms`                                        | Supabase Auth, by signature           | `200 {}` after handing the portal's sign-in code to the SMS Worker                                                                                                                                 |
| `GET /me`                                                              | Verified, non-anonymous Supabase user | `{ "user", "profile", "membership", "subscription" }`; null when absent                                                                                                                            |
| `PATCH /me/profile`                                                    | Verified, non-anonymous Supabase user | The saved profile; creates it when the account has none                                                                                                                                            |
| `GET /me/invitations`                                                  | Verified, non-anonymous Supabase user | `{ "items": [ … ] }`, open invitations sent to the caller's address; no id, no token                                                                                                               |
| `GET /me/setup`                                                        | Verified user with a membership       | The caller's setup guide: the fifteen steps with their state, lock and missing fields, `next`, `clientId`, `ownerName`, `closed`, `finished`                                                       |
| `PUT /me/setup`                                                        | Verified user with a membership       | The setup guide after recording `{ closed?, finished? }` on the caller's profile; allowed read-only                                                                                                |
| `PUT /me/setup/skips/{step}`                                           | Verified user with a membership       | The setup guide after skipping a member step (_Știu deja_); idempotent, allowed read-only                                                                                                          |
| `DELETE /me/setup/skips/{step}`                                        | Verified user with a membership       | The setup guide after undoing a skip; idempotent, allowed read-only                                                                                                                                |
| `GET /releases`                                                        | Verified, non-anonymous Supabase user | `{ "items": [ … ] }`, every release with its update, newest first, each with `unread` for the caller; not paginated                                                                                |
| `GET /releases/{tag}`                                                  | Verified, non-anonymous Supabase user | One release with its update and `unread`; `404` for an unknown tag                                                                                                                                 |
| `POST /releases/acknowledge`                                           | Verified, non-anonymous Supabase user | `{ "acknowledgedThrough" }` after acknowledging every release up to `{ tag }`                                                                                                                      |
| `GET /dashboard/summary`                                               | Verified user with a membership       | The dashboard's counts for the organization in one answer; `contracts` is null unless the caller is an owner                                                                                       |
| `POST /organization`                                                   | Verified user without a membership    | `201` with the new membership, after creating the organization                                                                                                                                     |
| `GET /organization/members`                                            | Verified user with a membership       | `{ "items": [ … ] }` with names, emails, and roles                                                                                                                                                 |
| `PATCH /organization/members/{userId}`                                 | Owner                                 | `204` after changing the member's role                                                                                                                                                             |
| `DELETE /organization/members/{userId}`                                | Owner                                 | `204` after removing the membership; the account stays                                                                                                                                             |
| `GET /billing`                                                         | Verified user with a membership       | The Abonament tab: `{ subscription, usage, catalogue, owner }`; `owner` is null except for the owner in person                                                                                     |
| `POST /billing/preview`                                                | Owner in person                       | What `{ plan, interval, employeePacks, extraMembers }` costs today and at the renewal, and what keeps it out                                                                                       |
| `POST /billing/subscription`                                           | Owner in person                       | `201 { clientSecret, intent }` after creating the Stripe subscription                                                                                                                              |
| `PATCH /billing/subscription`                                          | Owner in person                       | `{ clientSecret, intent }` after changing it, at once or at the renewal                                                                                                                            |
| `POST /billing/subscription/cancel`                                    | Owner in person                       | `204` after setting the cancellation, or dropping a plan chosen in the trial                                                                                                                       |
| `POST /billing/subscription/resume`                                    | Owner in person                       | `204` after withdrawing a pending cancellation                                                                                                                                                     |
| `POST /billing/portal-session`                                         | Owner in person                       | `201 { url }`, Stripe's page for the card                                                                                                                                                          |
| `PUT /billing/invoice-email`                                           | Owner in person                       | `{ email }`, where the invoices go; null for the owner's email                                                                                                                                     |
| `GET /billing/invoices/{stripeInvoiceId}/pdf`                          | Owner in person                       | `{ url, fileName, expiresAt }`, a one-minute link to our copy                                                                                                                                      |
| `POST /billing/stripe-webhook`                                         | Stripe, by signature                  | `200 { received: true }` once the event is handled or was already                                                                                                                                  |
| `GET /organization/invitations`                                        | Owner                                 | `{ "items": [ … ] }`, open and expired invitations                                                                                                                                                 |
| `POST /organization/invitations`                                       | Owner                                 | `201` with the invitation, after emailing the link                                                                                                                                                 |
| `POST /organization/invitations/{invitationId}/resend`                 | Owner                                 | The renewed invitation, after emailing a fresh link                                                                                                                                                |
| `POST /organization/invitations/{invitationId}/revoke`                 | Owner                                 | `204`                                                                                                                                                                                              |
| `POST /invitations/lookup`                                             | Public, by emailed token              | What the accept page shows, including `accountExists`                                                                                                                                              |
| `POST /invitations/accept`                                             | Public, by emailed token              | `201` after creating the account and the membership                                                                                                                                                |
| `POST /invitations/join`                                               | Verified user, by emailed token       | The signed-in account joins the organization                                                                                                                                                       |
| `GET /clients`                                                         | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`, active clients, or `?status=archived`; `?page=&pageSize=&sort=&order=`                                                                          |
| `POST /clients`                                                        | Verified user with a membership       | `201 { "client": { … } }`                                                                                                                                                                          |
| `GET /clients/{clientId}`                                              | Verified user with a membership       | `{ \"client\": { … } }`, archived or not                                                                                                                                                           |
| `PUT /clients/{clientId}`                                              | Verified user with a membership       | `{ "client": { … } }` after replacing what was entered about it                                                                                                                                    |
| `POST /clients/{clientId}/archive`                                     | Owner                                 | `{ "client": { … } }`, archived; nothing under the client changes                                                                                                                                  |
| `POST /clients/{clientId}/restore`                                     | Owner                                 | `{ "client": { … } }`, active again                                                                                                                                                                |
| `POST /clients/{clientId}/promote`                                     | Owner                                 | `{ "client": { … } }`, a client from then on; one way                                                                                                                                              |
| `DELETE /clients/{clientId}`                                           | Platform admin; anyone off production | `204` after deleting an archived client outright, with everything under it and its stored files                                                                                                    |
| `GET /clients/{clientId}/service-contract`                             | Owner                                 | `{ "contract", "suggestedNumber", "clientRepresentative", "readiness", "document" }`                                                                                                               |
| `PUT /clients/{clientId}/service-contract`                             | Owner                                 | The same, after saving the contract's details                                                                                                                                                      |
| `POST /clients/{clientId}/service-contract/generate`                   | Owner                                 | The same, with the contract generated or generated again                                                                                                                                           |
| `POST /clients/{clientId}/service-contract/send`                       | Owner                                 | The same, after emailing the issued PDF to `to`                                                                                                                                                    |
| `GET /clients/{clientId}/owner-notes`                                  | Owner                                 | `{ "notes": { "body", "updatedAt" } }`; an empty body when none were written                                                                                                                       |
| `PUT /clients/{clientId}/owner-notes`                                  | Owner                                 | The notes after replacing them                                                                                                                                                                     |
| `GET /clients/{clientId}/files`                                        | Verified user with a membership       | `{ "items": [ … ] }`, the client's own files, newest first; not paginated; `?employeeId=` for one employee's instead                                                                               |
| `POST /clients/{clientId}/files`                                       | Verified user with a membership       | `201 { "file": { … } }` from the bytes in the body; `?fileName=&name=&note=&ownersOnly=&employeeId=`                                                                                               |
| `PATCH /clients/{clientId}/files/{fileId}`                             | Uploader or owner                     | `{ "file": { … } }` after renaming or annotating it                                                                                                                                                |
| `PUT /clients/{clientId}/files/{fileId}/owners-only`                   | Owner                                 | `{ "file": { … } }` after keeping it for owners or opening it to the team                                                                                                                          |
| `GET /clients/{clientId}/files/{fileId}/download`                      | Verified user with a membership       | `{ "url", "fileName", "disposition", "expiresInSeconds" }`, a link valid for a minute                                                                                                              |
| `DELETE /clients/{clientId}/files/{fileId}`                            | Uploader or owner                     | `204` after deleting the stored file and the row                                                                                                                                                   |
| `POST /imports`                                                        | Verified user with a membership       | `201 { "import": { … } }`, an import from documents `uploading`, for a new client or `{ clientId }`                                                                                                |
| `GET /imports`                                                         | Verified user with a membership       | `{ "items": [ … ] }`, the open imports, failed ones included, newest first; `?clientId=` for one client's                                                                                          |
| `GET /imports/{importId}`                                              | Verified user with a membership       | `{ "import": { … } }` with its files, progress, other companies, and from `ready` its proposal, changes and blockers                                                                               |
| `POST /imports/{importId}/files`                                       | Verified user with a membership       | `201 { "files": [ … ] }`, the bucket and path each file is uploaded to, after registering `{ files }`                                                                                              |
| `POST /imports/{importId}/start`                                       | Verified user with a membership       | `{ "import": { … } }`, `preparing`, after dropping files never uploaded and queueing the rest                                                                                                      |
| `PUT /imports/{importId}/changes`                                      | Verified user with a membership       | `{ "version" }` after saving `{ version, changes }`; `409` on a stale version                                                                                                                      |
| `GET /imports/{importId}/source`                                       | Verified user with a membership       | Signed links to a source file and its converted file, its text, and where `?quote=` is in it, nearest after `?near=`; `?file=` as the proposal names it                                            |
| `POST /imports/{importId}/confirm`                                     | Verified user with a membership       | `{ "clientId", "fileCount" }` after writing the proposal and the changes in one transaction; `422` lists what blocks                                                                               |
| `POST /imports/{importId}/abandon`                                     | Verified user with a membership       | `204`                                                                                                                                                                                              |
| `POST /imports/{importId}/split`                                       | Verified user with a membership       | `201 { "import": { … } }`, another company's files `{ fileIds }` in a new import, already reading                                                                                                  |
| `POST /imports/{importId}/files/{fileId}/read`                         | Verified user with a membership       | `200 { "import": { … } }`, a set-aside file of a ready import read again with the rest                                                                                                             |
| `GET /files/download`                                                  | Public, by signed Storage link        | The file behind `?source=`, named `?name=`; `?disposition=inline` shows a PDF, a JPEG or a PNG                                                                                                     |
| `GET /organization/company-details`                                    | Verified user with a membership       | `{ "companyDetails": { … } }`: what documents print about the provider as a company                                                                                                                |
| `PUT /organization/company-details`                                    | Owner                                 | The company details after replacing them                                                                                                                                                           |
| `GET /organization/authorizations`                                     | Verified user with a membership       | `{ "authorizations": { … } }`: the certificate of authorization, the fire-safety technician and authorization                                                                                      |
| `PUT /organization/authorizations`                                     | Owner                                 | The authorizations after replacing them                                                                                                                                                            |
| `GET /legislation/acts`                                                | Verified user with a membership       | `{ "items": [ … ] }`, the watched acts by name with what the portal showed; not paginated                                                                                                          |
| `GET /legislation/changes`                                             | Verified user with a membership       | `{ "items": [ … ] }`, legal changes newest first, each with its `act`; not paginated                                                                                                               |
| `GET /legislation/runs/latest`                                         | Verified user with a membership       | `{ "run": { … } }`, the run of the daily check that started last, or `{ "run": null }`                                                                                                             |
| `GET /clients/{clientId}/document-details`                             | Verified user with a membership       | `{ "documentDetails": { … } }`: the representative's name and role, the employee they also are (`legalRepresentativeEmployeeId`, `legalRepresentativeEmployee`) or null, and the training schedule |
| `PUT /clients/{clientId}/document-details`                             | Verified user with a membership       | The document details after replacing them                                                                                                                                                          |
| `GET /clients/{clientId}/workplaces`                                   | Verified user with a membership       | `{ "items": [ … ] }`, registered office first; not paginated                                                                                                                                       |
| `POST /clients/{clientId}/workplaces`                                  | Verified user with a membership       | `201 { "workplace": { … } }`                                                                                                                                                                       |
| `PUT /clients/{clientId}/workplaces/{workplaceId}`                     | Verified user with a membership       | `{ "workplace": { … } }` after replacing it                                                                                                                                                        |
| `DELETE /clients/{clientId}/workplaces/{workplaceId}`                  | Verified user with a membership       | `204` after archiving it                                                                                                                                                                           |
| `GET /clients/{clientId}/responsible-persons`                          | Verified user with a membership       | `{ "items": [ … ] }` by name; not paginated                                                                                                                                                        |
| `POST /clients/{clientId}/responsible-persons`                         | Verified user with a membership       | `201 { "responsiblePerson": { … } }`                                                                                                                                                               |
| `PUT /clients/{clientId}/responsible-persons/{responsiblePersonId}`    | Verified user with a membership       | `{ "responsiblePerson": { … } }` after replacing it                                                                                                                                                |
| `DELETE /clients/{clientId}/responsible-persons/{responsiblePersonId}` | Verified user with a membership       | `204` after archiving it                                                                                                                                                                           |
| `GET /clients/{clientId}/fire-safety`                                  | Verified user with a membership       | `{ "fireSafety": { … }, "exists" }`: the fire-safety training schedule, smoking rule and waste                                                                                                     |
| `PUT /clients/{clientId}/fire-safety`                                  | Verified user with a membership       | The same after replacing them; the first save creates them                                                                                                                                         |
| `GET /clients/{clientId}/fire-equipment`                               | Verified user with a membership       | `{ "items": [ … ] }` on active workplaces, by workplace, kind, agent, capacity and label                                                                                                           |
| `POST /clients/{clientId}/fire-equipment`                              | Verified user with a membership       | `201 { "equipment": { … } }`                                                                                                                                                                       |
| `PUT /clients/{clientId}/fire-equipment/{equipmentId}`                 | Verified user with a membership       | `{ "equipment": { … } }` after replacing it                                                                                                                                                        |
| `DELETE /clients/{clientId}/fire-equipment/{equipmentId}`              | Verified user with a membership       | `204` after deleting it                                                                                                                                                                            |
| `GET /clients/{clientId}/fire-installations`                           | Verified user with a membership       | `{ "items": [ … ] }` on active workplaces, by workplace and kind                                                                                                                                   |
| `POST /clients/{clientId}/fire-installations`                          | Verified user with a membership       | `201 { "installation": { … } }`                                                                                                                                                                    |
| `PUT /clients/{clientId}/fire-installations/{installationId}`          | Verified user with a membership       | `{ "installation": { … } }` after replacing it                                                                                                                                                     |
| `DELETE /clients/{clientId}/fire-installations/{installationId}`       | Verified user with a membership       | `204` after deleting it                                                                                                                                                                            |
| `GET /clients/{clientId}/fire-substances`                              | Verified user with a membership       | `{ "state", "items": [ … ] }`: whether the client uses dangerous substances, and the list in its order                                                                                             |
| `PUT /clients/{clientId}/fire-substances/state`                        | Verified user with a membership       | `{ "state" }` after setting `undecided`, `none` or `listed`; `none` is `409` while entries exist                                                                                                   |
| `POST /clients/{clientId}/fire-substances`                             | Verified user with a membership       | `201 { "substance": { … } }`; `409` unless the state is `listed`                                                                                                                                   |
| `PUT /clients/{clientId}/fire-substances/{substanceId}`                | Verified user with a membership       | `{ "substance": { … } }` after replacing it                                                                                                                                                        |
| `DELETE /clients/{clientId}/fire-substances/{substanceId}`             | Verified user with a membership       | `204` after deleting it                                                                                                                                                                            |
| `GET /clients/{clientId}/fire-maintenance-items`                       | Verified user with a membership       | `{ "items": [ … ] }`: the free rows of the schedules 5.4, by workplace, in their order                                                                                                             |
| `POST /clients/{clientId}/fire-maintenance-items`                      | Verified user with a membership       | `201 { "item": { … } }`, after the workplace's last row                                                                                                                                            |
| `PUT /clients/{clientId}/fire-maintenance-items/{itemId}`              | Verified user with a membership       | `{ "item": { … } }` after replacing it                                                                                                                                                             |
| `DELETE /clients/{clientId}/fire-maintenance-items/{itemId}`           | Verified user with a membership       | `204` after deleting it                                                                                                                                                                            |
| `GET /clients/{clientId}/fire-buildings`                               | Verified user with a membership       | `{ "items": [ … ] }`: the buildings of the active fixed spaces, in workplace order                                                                                                                 |
| `PUT /clients/{clientId}/fire-buildings/{workplaceId}`                 | Verified user with a membership       | `{ "building": { … } }`, created the first time; `409` for a mobile site                                                                                                                           |
| `DELETE /clients/{clientId}/fire-buildings/{workplaceId}`              | Verified user with a membership       | `204`, the building cleared, whether or not there was one                                                                                                                                          |
| `GET /clients/{clientId}/documents/readiness?set=`                     | Verified user with a membership       | `{ "ready", "missing": [ … ] }`: what generating the set is waiting for                                                                                                                            |
| `GET /clients/{clientId}/documents?set=`                               | Verified user with a membership       | `{ "items": [ … ], "lastGeneration" }` of one set, in its order; not paginated                                                                                                                     |
| `POST /clients/{clientId}/documents/generate?set=`                     | Verified user with a membership       | `201 { "created": [ … ], "skipped": [ … ] }`                                                                                                                                                       |
| `GET /documents/{documentId}/revisions/{revisionId}/download`          | Verified user with a membership       | `{ "url", "fileName", "expiresInSeconds" }`, a link valid for a minute                                                                                                                             |
| `POST /documents/{documentId}/regenerate`                              | Verified user with a membership       | `{ "document": { … } }` with its new draft                                                                                                                                                         |
| `POST /documents/{documentId}/issue`                                   | Verified user with a membership       | `{ "document": { … } }` with its issued revision; the PDF annexes either set's own instructions' modules                                                                                           |
| `POST /documents/{documentId}/draft`                                   | Verified user with a membership       | `{ "document": { … } }` with a draft copied from its issued revision                                                                                                                               |
| `DELETE /documents/{documentId}/draft`                                 | Verified user with a membership       | `204` after deleting the draft and its file                                                                                                                                                        |
| `PUT /documents/{documentId}/signed-copy`                              | Verified user with a membership       | `{ "document": { … } }` after attaching or replacing the signed copy of the issued revision                                                                                                        |
| `DELETE /documents/{documentId}/signed-copy`                           | Verified user with a membership       | `204` after removing the signed copy and its file                                                                                                                                                  |
| `POST /documents/{documentId}/signed-copy/confirm`                     | Verified user with a membership       | `{ "document": { … } }` after accepting the copy received through the return link as the signed copy                                                                                               |
| `POST /contract-returns/lookup`                                        | Public, by emailed token              | What the return page shows: the contract, the parties, and whether the link still takes a copy                                                                                                     |
| `POST /contract-returns/download`                                      | Public, by emailed token              | A short-lived link to the PDF that was sent                                                                                                                                                        |
| `POST /contract-returns/upload`                                        | Public, by emailed token              | The same as lookup, `received`, after keeping the uploaded PDF as the received copy                                                                                                                |
| `PUT /documents/{documentId}/draft/file`                               | Verified user with a membership       | `{ "document": { … } }` after replacing the draft's Word file                                                                                                                                      |
| `POST /clients/{clientId}/documents/{typeKey}/upload`                  | Verified user with a membership       | `{ "document": { … } }` with the uploaded file as its draft                                                                                                                                        |
| `GET /companies/lookup`                                                | Member, or confirmed email            | `{ "company": { … } }` from ANAF, by `?cui=`                                                                                                                                                       |
| `GET /clients/{clientId}/employees`                                    | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`; `?page=&pageSize=&sort=&order=&status=&trainingState=&testState=&q=`                                                                            |
| `GET /employees`                                                       | Verified user with a membership       | The organization's employees across its active clients, each with `client`; `?clientId=&status=&trainingState=&testState=&domain=&q=`                                                              |
| `POST /clients/{clientId}/employees`                                   | Verified user with a membership       | `201 { "employee": { … } }`                                                                                                                                                                        |
| `GET /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }`, the only response carrying the CNP                                                                                                                                        |
| `PUT /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }` after replacing what was entered about them                                                                                                                                |
| `PATCH /clients/{clientId}/employees/{employeeId}/status`              | Verified user with a membership       | `{ "employee": { … } }` after marking a leaver (with `terminatedAt`) or reactivating                                                                                                               |
| `PATCH /clients/{clientId}/employees/{employeeId}/job-position`        | Verified user with a membership       | `{ "employee": { … } }` in the new job position                                                                                                                                                    |
| `GET /clients/{clientId}/employees/{employeeId}/training-records`      | Verified user with a membership       | `{ "items": [ … ] }`, each record with its `training`, `signed`, `hasSignatures`, newest first; `?domain=`                                                                                         |
| `GET /clients/{clientId}/employees/{employeeId}/training-sheets`       | Verified user with a membership       | `{ "ssm": { ready, missing, stored, sequences }, "psi": { … } }`: whether each individual training sheet can be drawn up, or is stored                                                             |
| `GET /clients/{clientId}/employees/{employeeId}/training-sheet`        | Verified user with a membership       | `200 application/pdf`, the stored signed sheet, a merged copy, or the sheet built on the spot; `?domain=ssm\|psi&sequence=`; `409 missing_sheet_data`, `503 pdf_unavailable`                       |
| `GET /clients/{clientId}/trainings`                                    | Verified user with a membership       | `{ "items": [ … ] }`, newest first, each with `attendeeCount`, `attendees`, `signed`, `hasSignatures`; `?domain=&phase=`                                                                           |
| `GET /clients/{clientId}/trainings/proposal`                           | Verified user with a membership       | `{ durationMinutes, material, trainer, … }`; `?domain=&phase=&heldOn=&jobPositionId=&employeeIds=` (the attendees so far, comma-separated)                                                         |
| `POST /clients/{clientId}/trainings`                                   | Verified user with a membership       | `201 { "training": { …, "records": [ … ] } }`                                                                                                                                                      |
| `GET /clients/{clientId}/trainings/{trainingId}`                       | Verified user with a membership       | `{ "training": { …, "records": [ … ] } }`                                                                                                                                                          |
| `PUT /clients/{clientId}/trainings/{trainingId}`                       | Verified user with a membership       | `{ "training": { … } }` after replacing its facts and attendees                                                                                                                                    |
| `DELETE /clients/{clientId}/trainings/{trainingId}`                    | Verified user with a membership       | `204`, the records deleted with it                                                                                                                                                                 |
| `GET /clients/{clientId}/job-positions`                                | Verified user with a membership       | `{ "items": [ … ] }`, by name, each with `employeeCount`                                                                                                                                           |
| `POST /clients/{clientId}/job-positions`                               | Verified user with a membership       | `201 { "jobPosition": { … } }`                                                                                                                                                                     |
| `PUT /clients/{clientId}/job-positions/{jobPositionId}`                | Verified user with a membership       | `{ "jobPosition": { … } }` after the change                                                                                                                                                        |
| `DELETE /clients/{clientId}/job-positions/{jobPositionId}`             | Verified user with a membership       | `204`: deleted, or archived when people who left still point at it                                                                                                                                 |
| `GET /clients/{clientId}/job-positions/{jobPositionId}/equipment`      | Verified user with a membership       | `{ "items": [ … ], "needsProtectiveEquipment" }`, the position's entries and its decision                                                                                                          |
| `POST /clients/{clientId}/job-positions/{jobPositionId}/equipment`     | Verified user with a membership       | `201 { "entry": { … } }`                                                                                                                                                                           |
| `POST …/job-positions/{jobPositionId}/equipment/copy`                  | Verified user with a membership       | `{ "items": [ … ], "needsProtectiveEquipment" }` after copying another position's entries                                                                                                          |
| `PUT …/job-positions/{jobPositionId}/equipment/{entryId}`              | Verified user with a membership       | `{ "entry": { … } }` after the change                                                                                                                                                              |
| `DELETE …/job-positions/{jobPositionId}/equipment/{entryId}`           | Verified user with a membership       | `204`                                                                                                                                                                                              |
| `PATCH …/job-positions/{jobPositionId}/protective-equipment`           | Verified user with a membership       | `{ "jobPosition": { … } }` after saying the post needs none (`false`) or taking that back (`null`)                                                                                                 |
| `GET /equipment-suggestions`                                           | Verified user with a membership       | `{ "items": [ … ] }`, risks or items typed before; `?field=risk                                                                                                                                    | item&query=` |
| `GET /instruction-modules`                                             | Verified user with a membership       | `{ "items": [ … ] }`, by domain, group and title; `?archived=true` lists the archived ones instead; `?domain=`                                                                                     |
| `POST /instruction-modules`                                            | Verified user with a membership       | `201 { "module": { … } }`, started from the skeleton                                                                                                                                               |
| `POST /instruction-modules/upload`                                     | Verified user with a membership       | `201 { "module": { … } }` from the `.docx` in the body; `?title=&group=&domain=`                                                                                                                   |
| `GET /instruction-modules/{moduleId}`                                  | Verified user with a membership       | `{ "module": { … } }`                                                                                                                                                                              |
| `PATCH /instruction-modules/{moduleId}`                                | Verified user with a membership       | `{ "module": { … } }` after renaming, regrouping, moving domain, archiving or restoring                                                                                                            |
| `GET /instruction-modules/{moduleId}/file-link`                        | Verified user with a membership       | `{ "url", "fileName", "expiresAt" }`, a one-minute link to the current file                                                                                                                        |
| `PUT /instruction-modules/{moduleId}/file`                             | Verified user with a membership       | `{ "module": { … } }` with the body stored as the next version                                                                                                                                     |
| `GET …/job-positions/{jobPositionId}/instructions`                     | Verified user with a membership       | `{ "domain", "items": [ … ], "needsInstructions" }`, one domain's modules and decision; `?domain=`                                                                                                 |
| `PUT …/job-positions/{jobPositionId}/instructions`                     | Verified user with a membership       | The same, after replacing the set of `domain` with `moduleIds`                                                                                                                                     |
| `POST …/job-positions/{jobPositionId}/instructions/copy`               | Verified user with a membership       | The same, after adding another position's modules of `domain`                                                                                                                                      |
| `PATCH …/job-positions/{jobPositionId}/instructions-decision`          | Verified user with a membership       | `{ "jobPosition": { … } }` after saying the post needs none of `domain` (`false`) or taking back (`null`)                                                                                          |
| `GET /clients/{clientId}/risk-evaluations`                             | Verified user with a membership       | `{ "items": [ … ] }`, the client's evaluations without factors, with counts and global levels                                                                                                      |
| `POST /clients/{clientId}/risk-evaluations`                            | Verified user with a membership       | `201 { "evaluation": { … } }` for a position, the sensitive groups or another named one                                                                                                            |
| `PUT /clients/{clientId}/sensitive-groups-state`                       | Verified user with a membership       | `{ "state" }` after setting `undecided` or `none`; `none` is `409` while the sensitive groups are evaluated                                                                                        |
| `GET …/risk-evaluations/{evaluationId}`                                | Verified user with a membership       | `{ "evaluation": { … } }` with its factors, measures, levels and global level                                                                                                                      |
| `PATCH …/risk-evaluations/{evaluationId}`                              | Verified user with a membership       | `{ "evaluation": { … } }` after changing its work system texts or name                                                                                                                             |
| `DELETE …/risk-evaluations/{evaluationId}`                             | Verified user with a membership       | `204`, with its factors                                                                                                                                                                            |
| `POST …/risk-evaluations/{evaluationId}/factors`                       | Verified user with a membership       | `201 { "evaluation": { … } }` after adding a factor with its measures                                                                                                                              |
| `PUT …/risk-evaluations/{evaluationId}/factors/{factorId}`             | Verified user with a membership       | `{ "evaluation": { … } }` after replacing a factor and its measures                                                                                                                                |
| `DELETE …/risk-evaluations/{evaluationId}/factors/{factorId}`          | Verified user with a membership       | `{ "evaluation": { … } }` after removing a factor                                                                                                                                                  |
| `PUT …/risk-evaluations/{evaluationId}/factor-order`                   | Verified user with a membership       | `{ "evaluation": { … } }` after reordering the factors by `factorIds`                                                                                                                              |
| `POST …/risk-evaluations/{evaluationId}/factors/copy`                  | Verified user with a membership       | `{ "evaluation": { … } }` after adding another evaluation's factors                                                                                                                                |
| `GET …/job-positions/{jobPositionId}/risk-evaluation`                  | Verified user with a membership       | `{ "evaluation": { … } }`, the position's evaluation, or `null`                                                                                                                                    |
| `GET /risk-factor-suggestions`                                         | Verified user with a membership       | `{ "items": [ … ] }`, groups, plan fields or observations typed before; `?field=&query=`                                                                                                           |
| `POST …/risk-evaluations/{evaluationId}/save-as-profile`               | Verified user with a membership       | `201 { "profile": { … } }`, a new profile of the library with copies of the evaluation's factors                                                                                                   |
| `POST …/risk-evaluations/{evaluationId}/factors/apply-profile`         | Verified user with a membership       | `{ "evaluation": { … }, "addedFactorCount" }` after adding copies of a profile's factors                                                                                                           |
| `GET /evaluation-profiles`                                             | Verified user with a membership       | `{ "items": [ … ] }`, the risk library by name, with counts and global levels                                                                                                                      |
| `POST /evaluation-profiles`                                            | Verified user with a membership       | `201 { "profile": { … } }`, an empty profile by `name`                                                                                                                                             |
| `GET /evaluation-profiles/{profileId}`                                 | Verified user with a membership       | `{ "profile": { … } }` with its factors, measures, levels and global level                                                                                                                         |
| `PATCH /evaluation-profiles/{profileId}`                               | Verified user with a membership       | `{ "profile": { … } }` after renaming it                                                                                                                                                           |
| `DELETE /evaluation-profiles/{profileId}`                              | Verified user with a membership       | `204`, with its factors; the copies in evaluations stay                                                                                                                                            |
| `POST /evaluation-profiles/{profileId}/factors`                        | Verified user with a membership       | `201 { "profile": { … } }` after adding a factor with its measures                                                                                                                                 |
| `PUT /evaluation-profiles/{profileId}/factors/{factorId}`              | Verified user with a membership       | `{ "profile": { … } }` after replacing a factor and its measures                                                                                                                                   |
| `DELETE /evaluation-profiles/{profileId}/factors/{factorId}`           | Verified user with a membership       | `{ "profile": { … } }` after removing a factor                                                                                                                                                     |

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
it. Onboarding looks up the new organization's own CUI, so the route also serves an account with
a confirmed email and no membership, the same accounts `POST /organization` accepts
(`requireConfirmedEmailOrMembership`). It neither throttles nor caches: anyone can sign up and
create an organization, so it was as open before. `PUT /clients/{clientId}` takes the same body without `legalRepresentativeName`, which the
document details own, and answers `409` for a CUI another client has and for an archived client.
A `409` of these routes carries a `reason`: `cui_taken`, `cui_taken_by_archived` (the holder is
archived, so the caller cannot see it in the list they came from), `cui_taken_by_lead` (the
holder is a lead, which is also the answer when the caller cannot see the holder at all, as a
specialist cannot) or `client_archived`.
Archiving and restoring are an owner's, checked by `requireOwner` and again by a trigger;
repeating either changes nothing and keeps the first date.

`DELETE /clients/{clientId}` deletes an archived client outright, for testing an import with the
same company again, which an archived client's CUI otherwise refuses. Who may call it is the rule
of the import's `usage`: anyone when `ENVIRONMENT` is not `production`, and in production a
platform admin only (`adminToolsAllowed` in `lib/auth.ts`); anyone else gets `403`. Every client
response, and each row of `GET /clients`, says it as `canDelete`: true for an archived client
when the rule holds. The handler
reads the client as the caller, so `404` and the policies are as for `GET`, answers `409` with
the reason `client_not_archived` for an active client, and then calls `delete_archived_client`
with the secret key and the caller's organization. Members cannot call that function, so the rule
cannot be skipped through PostgREST. It returns the client's objects in the `documents`,
`client-files` and `imports` buckets, which the handler removes after the rows are gone; a removal
that fails is logged with the bucket and the number of objects, never their paths, and the answer
is still `204`. No audit log records it: the API has none.

What is known about the provider is two resources, as the organization page shows it.
`/organization/company-details` is the company: its name and registration, `vatPayer`, which
the ANAF lookup fills and which decides the sentence about VAT beside the prices of a
contract, the registered office, `phone`, the legal representative, and `iban` with
`bankName`. `/organization/authorizations` is the certificate of authorization
(`authorizationCertificateNumber`, `…Date`, `…Issuer`), the fire-safety technician with
their certificate, as text (issue #170), `fireSafetyAuthorization`, the inspectorate's
authorization under Legea 307/2006 art. 12^2, one text of up to 200 characters (ADR 019), and
the risk evaluator (`riskEvaluatorName`, `riskEvaluatorTitle`, `riskEvaluatorCertificate`; ADR
015, amendment of 2026-10-22), whom decision 1.2 and the risk assessment name as the coordinator
of the evaluation: the name and the title go together, and a `PUT` with one but not the other is
`400`. Every member reads both and an owner writes them:
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

Each client of `GET /clients` also says what is left to do, from the view `client_list` in one
read (no request and no query per row): `documentation` for the occupational safety set and
`fireSafetyDocumentation` for the fire-safety set, each with `state` (`none` while no document
of the set has a revision, `issued` when every document that applies has an issued revision,
`in_progress` otherwise), `issuedCount`, `totalCount` and `lastGeneratedAt`. The total is
`documentationProgress` in `modules/documents/context.ts`, counted over what the set's tab
lists: the built-in documents that apply, plus any other document the set holds. In the
occupational safety set, decision 1.5 applies from 10 current employees or once it has a
revision, and training themes waiting for generated own instructions count as not done; in the
fire-safety set, decisions 8 and 9 and the installation register apply the same way (ADR 020),
every other document always. `clientSince` is when the company became a client: its promotion
for a former lead, otherwise its creation. A lead carries null for all three.
`sort=documentation` and `sort=fireSafetyDocumentation` order by the set's issued count, with
the name next; `sort=clientSince` by `clientSince`.

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
`serviceContractState` of a lead gains `sent` on the same rule. Every send also mints a
**return link**: a random token, hashed onto the send with a 60-day expiry, and the email
carries `https://app.ssmusor.ro/contract?token=…`. The email leaves from `contracte@`, in the
owner's name, and prints the owner's address as where a reply lands.

The return link's three routes are public and run with the secret key, as the invitation
lookup does; the token travels in request bodies, never in the path. `POST
/contract-returns/lookup` answers the contract number and date, the parties, the owner's
address to write to, and a `status`: `open`, `received` (a copy arrived and can still be
replaced, with `receivedAt`), `confirmed`, `superseded` (a newer revision was issued since the
send), or `expired` (also for an archived client); an unknown token is `404`. `POST
/contract-returns/download` signs a one-minute link to the PDF of the revision that was sent,
and `POST /contract-returns/upload` (`multipart/form-data`, `token` and `file`) keeps one PDF
of up to 15 MB as the **received copy**: the same row and path as a signed copy, with `source`
`client` and no `confirmed_at`, replacing an earlier unconfirmed one; the owner who sent the
contract is emailed (`sendSignedCopyReceived`). Both answer `409` with `return_link_closed`
once the status is not `open` or `received`, and the upload with
`return_link_too_many_uploads` past twenty tries on one send. Every path and row comes from
the send the token names, never from the request.

`PUT /documents/{documentId}/signed-copy` takes the bytes of a PDF, up to 15 MB, that starts
with `%PDF-`: a scan of the signed paper, or the file signed with the signer's own
certificate. The row is written first, with the file's SHA-256, because the policies let a
file in only where a row says it lives; a first copy whose file cannot be stored is taken
back, and a failed replacement keeps the earlier row. `409` with `not_issued` for a document
with nothing issued. The app records that a file was attached, not that it is signed.
Revisions carry `hasSignedCopy`, true only for a confirmed copy, and `receivedCopy` with its
`uploadedAt` while a copy from the return link waits; `POST …/signed-copy/confirm` turns the
one into the other (`409` with `no_received_copy` otherwise). `GET …/download?format=signed`
links to either under a name that ends in "- semnat.pdf", and `DELETE` removes the file and
then the row. These are
routes of any document, reachable by whoever reaches it; the contract's is its owners'. A
lead's `serviceContractState` becomes `signed` when the revision in force has a copy, ahead
of `sent`. `GET /clients/{clientId}/documents` lists one documentation set only, and
`POST /documents/{documentId}/regenerate` answers `409` for a document that is in neither.

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
`sort=name|jobTitle|jobPosition|hiredAt`; the organization's employees:
`sort=name|client|jobPosition|hiredAt`; clients:
`sort=legalName|cui|currentEmployeeCount|jobPositionCount|documentation|clientSince`;
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

The facts the individual training sheets print
([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)) ride on the same
bodies, all optional: `workplaceId`, `qualification` and `education` (up to 160 characters),
`authorizations` (up to 500), `commuteRoute` (up to 1000) and `commuteMinutes` (an integer from 1
to 600). A `workplaceId` that is archived or belongs to another client answers `400` with an issue
on `workplaceId`, as for a job position. `POST` without one gives the employee the client's only
active workplace when it has exactly one, and none otherwise; `PUT` without the key keeps the
stored workplace, and `workplaceId: null` clears it. The detail returns the five facts and both
the list and the detail carry `workplace: { id, name } | null`, the name read even once the
workplace is archived.

`contractNumber`, the number of the individual employment contract, is optional on the same
bodies (trimmed, up to 50 characters) and on the detail as `string | null`; the list leaves it
out. `PUT` without it clears it, as for the other optional facts. The signing agreement prints it.

Both employee lists take `?q=`, up to 100 characters, and keep the employees that match every
term of it: the text is lowercased, stripped of diacritics and split on anything that is not a
letter or a digit, and each term must appear somewhere in the name (`last_name first_name`) or
the employee number, so `stefan tar` finds "Țăranu Ștefan" and `a-17` finds "A-17". A blank `q`
filters nothing. See the [data model](data-model.md#employees) for how the database matches.
`GET /employees` ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)) is
the organization's list: the same row as a client's list plus `client: { id, name }`, the same
envelope, current employees by default and `?status=terminated` for the leavers, `?clientId=`
for one client, and `q` matching the client's name as well. Only employees of active clients
are listed, never those of archived ones. Leads are never included, so an owner and a specialist see the same list. It sorts by `name` (the default),
`client`, `jobPosition` or `hiredAt`, and takes `?trainingState=` as a client's list does.
`?domain=ssm|psi` narrows the state filters to one domain: `?trainingState=overdue&domain=ssm`
keeps those overdue in SSM, `current` with a domain those up to date in it whatever the other
says, and a `testState` likewise; without it the filters read both domains as below
([ADR 027](architecture/adr-027-dashboard.md)).

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

Training records ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md))
hang off the client. A training held is recorded once with its attendees: `POST …/trainings`
takes `domain`, `phase`, `heldOn`, `durationMinutes` (1 to 600), `material`, `trainer` and an
optional `verifier` as `{ name, jobTitle }`, `supplementaryReason` (required for, and only
for, a supplementary training), `source` (`app` by default, `paper` for history typed from a
sheet), an optional `themesRevisionId` and `notes`, `employeeIds` and an optional
`admission: { admittedOn, name, jobTitle }`. The admission, "admis la lucru", is one for every
attendee and allowed on a workplace training only; a body that breaks a rule answers `400`. A
day after today in Romania is `400` on `heldOn`; an attendee who is not an employee of the
client, or one archived as a mistake, `400` on `employeeIds` (a leaver is fine: paper history
may belong to one); a revision that is not one of the client's training themes of the domain,
`400` on `themesRevisionId`. Each attendee's record takes the name of their job position as
its `occupation`. `PUT` replaces the facts and the attendees: an attendee who stays keeps their
record and its occupation, one left out loses it. The list is not paginated; each item
carries its attendees ordered by name, `attendees: [{ employeeId, lastName, firstName }]`,
read in the same query as `attendeeCount`. The detail lists the records by name, each with
`employee: { id, lastName, firstName }`, `occupation` and `admission` or null; `GET …/employees/{employeeId}/training-records` lists one person's
records with their training's facts, newest first, each with its training's `signed` and
`hasSignatures` as the list gives them, over every attendee's record and not the person's alone. An archived client or a lead answers `409`
as elsewhere. The body's optional `signers: { trainer?, verifier?, admitter? }` names the
accounts asked to sign the slots electronically, and saving issues their requests; see
[Signatures](#signatures). A training whose record is signed, or is a record from paper printed
on a certified sheet, answers `409` with `record_signed` to an edit that changes what the record
prints; an edit that leaves out an attendee whose record has a signature or a sheet row, and a
delete of such a training, `409` with `record_has_signatures`. The list items and the detail
carry `signed`, true while any record has a live electronic signature, when the app locks the
training's edit and delete, and `hasSignatures`, true once any record has a signature row, voided
and paper ones included, or a row on a stored sheet, when the app locks its delete.

`GET …/trainings/proposal` proposes what the flow pre-fills, every value the specialist may
change and null where nothing can be proposed. With `employeeIds`, the attendees chosen so far,
nobody is proposed as their own trainer or admitter: where the head of the workplace would train
only themself, the client's legal representative is proposed, and where that is the same person
again (the employee linked as the representative), the specialist, or the fire-safety technician
for a fire-safety training. A periodic training takes the content line and
duration of the session of `heldOn`'s month, else the last session before it, from the client's
newest training themes revision of the domain, draft or issued: by the position for
occupational safety, by the position's staff category for fire safety, with
`themesRevisionId` naming the revision; without one, or for a position the themes do not hold,
the material is null and the duration the schedule's. A hiring training proposes 240 minutes
(occupational safety) or 480 (fire safety) and the content line of the 4.2 or 3.1 plan, the
occupational safety workplace plan citing the position's modules from the themes and the
fire-safety one the instructions decision. A supplementary training proposes 60 minutes and no
material. The people follow "Who signs what": the specialist is the caller, by their profile's
name and professional title; the workplace manager is the first one the client designated,
else the legal representative; the fire-safety technician is the organization's, as `Cadru
tehnic PSI`. The introductory general training is the specialist's (the technician's in fire
safety); the workplace, periodic and supplementary trainings are the workplace manager's for
execution staff and the specialist's (the technician's) for technical-administrative staff,
as the themes have it; the specialist verifies every occupational safety training and nobody
a fire-safety one; the trainer of a workplace training admits to work. A `jobPositionId` of
another client is `400`.

The two individual training sheets
([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)) are built on demand
and never stored, until signing starts: from then on the sheet of that employee and domain is
the stored signed sheet ([ADR 023](architecture/adr-023-advanced-electronic-signature.md),
[PDF](pdf.md#the-signed-sheet)), and both routes answer it instead.
`GET …/employees/{employeeId}/training-sheets` answers for both domains `stored`, `sequences`
(the stored sheet and its continuation sheets by number, empty before signing), and whether
the sheet can be drawn up and, when not, the codes of what is missing:
`employee.commute_route` on the occupational safety sheet while the route is empty, and
`employee.workplace` on both while the employee has no workplace at a client with more than one
active workplace. Nothing else blocks a sheet, and a leaver's sheets are drawn up too.
`GET …/employees/{employeeId}/training-sheet?domain=ssm|psi` builds the merge data from the
employee, the position, the workplace and the domain's training records
([document engine](document-engine.md#sheets)), merges the newest registered version of the
template `training_sheet_ssm` or `training_sheet_psi`, converts it with the converter issuing
uses, and answers the PDF as an attachment named in ASCII after the domain and the person,
`Fisa-SSM-Popescu-Ion.pdf`. A stored sheet is `ready`, with nothing `missing`, whatever the
employee lacks now, and the route answers its file as it is, its signatures verifiable; a sheet
with continuation sheets is answered as one PDF merged by Gotenberg with its fields flattened, a
copy to read, in which the signatures no longer verify: the signer stamps every page of it with
"Copie de citire – semnăturile se verifică pe fișele originale" (`stampPages`) and it is named
`…-copie.pdf`. `?sequence=n` answers the original of sheet n as stored, signatures verifiable,
named `…-n.pdf` from the second on; a number the employee has no stored sheet of is `404`. The
portal's two sheet routes take the same `?sequence=`. The row of the stored sheet is read
with the caller's token, so its policies decide who sees it, and its file with the secret key,
since Storage's policies on the documents bucket know only the members' own folders. Missing data answers `409` with the reason `missing_sheet_data`
and the codes under `missing`, before anything is merged; no converter, `503` with the reason
`pdf_unavailable`, as printing does; a template not registered yet, `503` with the reason
`template_missing`. An employee who is not the client's is `404`.

Employees carry `training: { ssm, psi }`, each
`{ state, dueOn, lastPeriodicOn, intervalMonths, intervalSource }`, in the list and the detail:
`state` is `untrained`, `current`, `due` or `overdue`, null for a leaver; `dueOn` is null while
the interval is undecided and while the employee is `untrained`; `intervalMonths` is the
interval the due date counts, null while undecided, and `intervalSource` says where it comes
from, `position` when the job position carries its own (SSM only), `client` when the client's
training programme or fire-safety schedule sets it, null with no interval. `GET …/employees?trainingState=` takes
`current`, `due`, `overdue` or `untrained`: `current` keeps the employees up to date in both
domains, the other three those in that state in either, since each of those is someone the
specialist has to see to.

Protective equipment ([ADR 011](architecture/adr-011-protective-equipment.md)) hangs off the
job position: `GET …/equipment` lists its entries in the order they were added, with
`needsProtectiveEquipment`, null until decided, false when the post needs none, true while it
has entries. `POST` adds an entry, which decides "needs equipment" by itself; a consumable
carries no `durationMonths` and inventory must, or the answer is `400` on `durationMonths`.
`DELETE` of the last entry leaves the position undecided again. `POST …/equipment/copy`
appends copies of another position's entries, with `400` on `fromJobPositionId` for the
position itself or one of another client. `PATCH …/protective-equipment` takes
`needsProtectiveEquipment: false` or `null`; `true` answers `400` with the reason
`equipment_decided_by_entries`, and `false` while entries exist answers `409` with the reason
`equipment_entries_exist`. Job positions carry `needsProtectiveEquipment` and
`equipmentCount` in every response. `GET /equipment-suggestions` returns, for `field` `risk`
or `item`, the distinct values the organization typed before that contain `query`, most
recently used first, at most twenty; it filters in the Worker, so a typed `%` or `,` is a
character, not a PostgREST operator.

The instruction library ([ADR 012](architecture/adr-012-own-instructions.md)) is the
organization's own instructions, one Word file each, kept as their author made them. Each
module has a `domain`, `ssm` or `psi` (ADR 012's amendment of 2026-10-11): which set's own
instructions annex it, 3.2 or 2.1. `GET /instruction-modules` lists the modules in use by
domain, group and title, each with its current version (`number`, `sha256`, `sizeBytes`,
`articleCount`, the top-level items of the file's most used numbered list) and
`appliedCount`, how many current positions across the organization's clients apply it;
`?archived=true` lists the archived ones instead, and `?domain=` one domain's only. `POST
/instruction-modules` starts a module from the skeleton the app ships, in the house style
with the Labour Inspection's headings; `POST /instruction-modules/upload` takes the bytes of
a `.docx` as the body, one file per request, sweeps its fonts to the house font and nothing
else, and titles it after `?title=` or the first line of the file, in `?group=` or a work
activity; both take a `domain`, `ssm` when left out. A title the library already has, of
either domain, answers `409` with the reason
`instruction_module_title_taken`. `PUT …/file` stores the body as the next version, which is
what the editor saves; versions are never replaced, so documents generated before keep
citing the one they annexed. `PATCH` renames, regroups, moves to the other domain, archives
(`archived: true`) or restores; archiving a module a current position applies answers `409`
with the reason `instruction_module_applied`, moving one to the other domain `409` with
`instruction_module_domain_applied` (the position applied it as part of its decision for the
other set), and a file for an archived module answers `409` with
`instruction_module_archived`. `GET …/file-link` signs a one-minute link to the current file,
named after the module.

A job position decides about each domain apart, and every route below takes the `domain` it
is about, `ssm` when left out (`?domain=` on `GET`, in the body otherwise); the other domain's
modules and decision are never touched. A position applies modules through `GET`/`PUT
…/instructions`: `PUT` takes `moduleIds` and replaces the domain's set, adding first so a swap
never passes through "undecided"; the first module applied decides "needs instructions" for
the domain by itself, an empty set leaves the position undecided again, an archived module
answers `409` with `instruction_module_archived`, a module of the other domain `400` with
`instruction_module_other_domain`, naming it, and a module not in the library `400` on
`moduleIds`. `POST …/instructions/copy` adds another position's modules of the domain, with
`400` on `fromJobPositionId` for the position itself or one of another client. `PATCH
…/instructions-decision` takes `needsInstructions: false` or `null`; `true` answers `400` with
the reason `instructions_decided_by_modules`, and `false` while modules of the domain are
applied `409` with `instructions_applied`. Job positions carry `needsInstructions` and
`instructionCount` for the occupational safety modules and `needsFireInstructions` and
`fireInstructionCount` for the fire-safety ones in every response.

Risk evaluations ([ADR 015](architecture/adr-015-risk-assessment.md)) belong to the client.
`POST …/risk-evaluations` takes a `kind`: `job_position` with a `jobPositionId` (a current
position of the client, or `400` on `jobPositionId`), `sensitive_groups`, or `other` with a
`name`; and optionally `meansOfProduction`, `workEnvironment` and `exposure`, which defaults
to "8 h / schimb". An evaluation that is not of a position also takes `workTask` and
`exposedPersons` ("Min. 3 persoane"), which a position's evaluation reads from the position;
sent for one, they answer `400` on the field. A second evaluation of a position or of the
sensitive groups answers `409` with `risk_evaluation_exists`, a name the client already uses
`409` with `risk_evaluation_name_taken`. `PATCH` changes the fields sent, `null` clearing an
optional text; a `name` for an evaluation that is not `other`, or a `workTask` or
`exposedPersons` for a position's, answers `400`. `GET …/risk-evaluations` lists
the evaluations of current positions in name order, then the sensitive groups, then the
others by name, each with `factorCount`, `unacceptableFactorCount` and `globalRiskLevel`, and
carries the client's `sensitiveGroupsState`: `undecided`, `none` once the client declared that
it has no workers from the sensitive groups, or `evaluated` while their evaluation exists.
`PUT …/sensitive-groups-state` takes `undecided` or `none`; `none` while the evaluation exists
answers `409` with `sensitive_groups_evaluated`, and `evaluated` is never sent, since the
database sets it when the evaluation is created and clears it when it is deleted.
`GET …/job-positions/{jobPositionId}/risk-evaluation` reads a position's evaluation by the
position, `null` until one is started.

An evaluation is read whole: its factors in their order, each with `component`, `group`,
`description`, `gravityClass` (1–7), `probabilityClass` (1–6), the plan fields `actions`,
`deadline`, `responsiblePerson` and `observations`, its `measures` (`kind`: `technical`,
`organizational`, `hygienic_sanitary` or `other`, and a `description`) in their order, and
`riskLevel` from the method's grid; and the evaluation's `globalRiskLevel`, Σ R² / Σ R to two
decimals, null without factors. Levels are computed, never stored or sent; the SPA computes
the rest (unacceptable factors, shares per component, the consequence of a gravity class)
with the same module, `@ssm-usor/contracts`' `risk-levels`. Every change to the factors
answers with the whole evaluation, since the global level moves with each. `POST …/factors`
adds a factor after the others and `PUT …/factors/{factorId}` replaces one; both carry the
factor's `measures`, which replace its old ones in one transaction. `PUT …/factor-order`
takes `factorIds`, every factor of the evaluation once, or `400` on `factorIds`. `POST
…/factors/copy` adds copies of the factors of `fromEvaluationId`, another evaluation of the
same client, after the factors already there, with `400` on `fromEvaluationId` for the
evaluation itself or one of another client. `GET /risk-factor-suggestions` returns, for
`field` `group`, `actions`, `deadline`, `responsiblePerson` or `observations`, what the
organization typed before, in its evaluations and in its risk library alike, as the equipment
suggestions do. A write under an archived client answers `409` with `client_archived`.

The risk library is the organization's evaluation profiles, each a `name` and factors exactly
like an evaluation's. `GET /evaluation-profiles` lists them by name without their factors,
each with `factorCount`, `unacceptableFactorCount` and `globalRiskLevel`; `GET
/evaluation-profiles/{profileId}` reads one whole, as an evaluation is read. `POST
/evaluation-profiles` starts an empty one by `name` and `PATCH` renames it; a name the
library already holds, ignoring case and the spaces around it, answers `409` with
`evaluation_profile_name_taken` on `name`. `DELETE` removes a profile with its factors;
nothing refers to a profile, so there is no archive. `POST …/factors`, `PUT
…/factors/{factorId}` and `DELETE …/factors/{factorId}` take the bodies an evaluation's
factor routes take (`RiskFactorRequest`) and answer with the whole profile. Two routes join
an evaluation and the library, and nothing links what they copy: `POST
/clients/{clientId}/risk-evaluations/{evaluationId}/save-as-profile` takes a `name` and
answers `201` with a new profile holding copies of the evaluation's factors (its work system
texts stay behind), also for an archived client's evaluation; `POST
…/risk-evaluations/{evaluationId}/factors/apply-profile` takes a `profileId` and answers with
the evaluation, the profile's factors copied after its own, and `addedFactorCount`. A profile
outside the library answers `400` on `profileId`, an archived client `409` with
`client_archived`.

A client's files ([ADR 013](architecture/adr-013-client-files.md)) are what the organization
keeps about a client or a lead without the app writing or reading them; a lead uses the same
routes. `GET /clients/{clientId}/files` lists the client's own files the caller can see,
those of no employee: a specialist is not told that files for owners only exist. Each
carries `name`, `note`, `ownersOnly`, `employee` (`{ id, lastName, firstName }` for a file that belongs to one of the client's
employees, otherwise null), `originalFileName`, `mimeType`, `sizeBytes`, `sha256`,
`uploadedBy` (`{ id, fullName }`, null once the account is gone), `canChange`, true for its
uploader and for an owner, and for a file of an import folder ([ADR 030](architecture/adr-030-import-from-documents.md))
`importId`, `importPath` (the folders it sat in inside the upload, null at the top) and
`importRead` with `importReason`, from the import's file row (`import_files.client_file_id`):
whether the import read it and, if not, why. The four are null for a file uploaded on its own.
`?employeeId=` lists that employee's files instead ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)); a
value that is not an id answers `400`, and the id of an employee the client does not have gives
an empty list.

`POST` takes one file per request: its bytes as the body (`application/octet-stream`), and
the rest in the query, since the body is the file. `fileName` is the name on the uploader's
computer, whose extension decides the type; `name` defaults to it without the extension;
`note` is optional; `ownersOnly` is `true` or `false`; `employeeId`, optional, gives the file
to one of the client's employees, and one the client does not have, or one archived, answers
`400` with an issue on `employeeId` before anything is stored. It cannot be changed after the
upload. A refused file answers `400` with a
reason: `client_file_empty`; `client_file_too_large` over 20 MiB, by `Content-Length` before
the body is read; `client_file_type_not_allowed` for any extension but `.pdf`, `.jpg`,
`.jpeg`, `.png`, `.docx`, `.doc`, `.xlsx` and `.xls`; and `client_file_content_mismatch` when
the content is not that type. The content check reads the first bytes of a PDF, a JPEG, a PNG
or an old Office file, and looks for `word/document.xml` or `xl/workbook.xml` in a `.docx` or
`.xlsx`, which also passes as an old Office file when it is password-protected. A specialist
asking for `ownersOnly` gets `403`, and a lead's file is for owners only whatever is asked.
The row is written first, then the file at the path the row names; a file that cannot be
stored takes its row back.

`PATCH` takes `name` and `note` (`null` or an empty string clears the note). `PUT
…/owners-only` takes `{ ownersOnly }`, from an owner; for a lead's file it answers `409` with
`client_file_lead_owners_only`, the database's `CFL01`. `PATCH` and `DELETE` by anyone but the
uploader or an owner answer `403`, and a file the caller cannot see, or one under another
client, `404`. `DELETE` removes the stored file and then the row; there is no recycle bin.
Every write under an archived client answers `409` with `client_archived`, asked first by the
upload and the delete, which touch files; the list and the download link still answer.

`GET …/download` signs a one-minute link, with the name the file was uploaded under (cut to
200 characters, keeping the extension) and `disposition`: `inline` for a PDF, a JPEG or a
PNG, `attachment` for the rest. The SPA opens every Storage link through `GET
/files/download`, which streams the object under `name`, because Storage names a file in a
way browsers do not read correctly. It accepts only a signed read link of the configured
Supabase project, so it is not an open proxy. With `disposition=inline` it shows a PDF, a
JPEG or a PNG and downloads any other type, HTML and SVG among them, which would run script
in the API's origin; responses carry `X-Content-Type-Options: nosniff`. An expired link
answers `404`.

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

`POST /organization` takes `{ organizationName, fullName, termsVersion, acceptsSpecialClauses }` and calls
`create_organization` as the caller. It needs no membership, unlike every other organization
route. `409` with `reason: already_in_organization` for an account that has one, `403` with
`reason: email_not_confirmed` otherwise refused. `termsVersion` must be the current one from
the contracts: the checkbox on the page accepts that version and no other. `acceptsSpecialClauses`
must be `true`: the Terms checkbox names the clauses accepted expressly (ADR 029), which the
database records and requires too.

`GET /me/invitations` lists the open invitations sent to the caller's confirmed address, so
the page can point them out before the person creates an organization of their own. It carries
no id and no token; only the emailed link accepts an invitation.

## Subscriptions and read-only access

[ADR 029](architecture/adr-029-billing-plans-and-trials.md). `GET /me` carries the
organization's `subscription`: `{ plan, planChosen, status, trialEndsAt, accessUntil, access, deletesAt }`,
or null for an organization without one, which has full access. `access` is `full` or
`read_only`; `deletesAt` is 30 days after `accessUntil` once read-only.

While the organization is read-only, every member request that changes something (`POST`,
`PUT`, `PATCH`, `DELETE`) answers `403` with `reason: read_only` from the membership middleware,
before the handler runs. A participant's change through `/portal/participants/{participantId}/…`
answers the same. Exempt, through `allowWhileReadOnly` placed before those middlewares:
printing a document's unsaved edits, the portal's notice and language, the caller's setup
guide (closing it and skipping its steps), and what only takes access away: removing a member,
revoking a member's invitation, revoking a participant or a participant's invitation. Reads are
never affected. Accepting an invitation and a client's upload through the contract return link
stay open (ADR 029).

## Billing

[ADR 029](architecture/adr-029-billing-plans-and-trials.md), phase 2. The `billing` module calls
Stripe (`stripe` SDK on its fetch client, API version `2026-09-30.endive`, the one the setup
script pins) and Oblio. Without `STRIPE_SECRET_KEY` every route that needs Stripe answers `503`
with `reason: stripe_unset`, the webhook also without `STRIPE_WEBHOOK_SECRET`. The prices, the
VAT rate, the portal configuration and the account id are read from Stripe by lookup key and
by the setup script's metadata, and kept for ten minutes per isolate.

Every billing route stays open while the organization is read-only. Only the owner in person
calls the owner routes: a specialist and an admin impersonating the owner get `403`.
`GET /billing` answers every member; its `owner` part (next payment, extra SMS so far, card,
email for invoices, a change set for the renewal, the fewest packs and members each plan needs,
the invoices) only the owner in person. `usage.smsThisMonth.used` is null: SMS are not counted
per organization yet (step 10).

A choice is `{ plan: start | profesional, interval: month | year, employeePacks, extraMembers }`.
It cannot go below the packs today's employees need or the extra members today's members need,
Start stops at 600 employees and 2 members, and Enterprise never comes through here. A choice
that breaks one of those answers `409` with the first problem as `reason`
(`start_employee_ceiling`, `start_member_ceiling`, `employee_packs_below_need`,
`extra_members_below_need`, `employee_packs_above_plan`, `extra_members_above_plan`);
`POST /billing/preview` lists them all in `problems` instead. Other `409` reasons:
`subscription_exists`, `no_subscription`, `enterprise_plan`, `company_details_missing` (the
legal name or CUI under Date firmă, which the invoice needs), `unchanged`, `not_canceling`,
`pdf_pending`. A declined card is `422` with `reason: card_declined`.

**Choosing a plan** creates or reuses the Stripe customer (company name and address, the
owner's email, locale `ro`, `organization_id` in its metadata) and a subscription with the
plan, the packs, the extra members and the metered SMS price, the 21 % tax rate,
`default_incomplete`, the card saved on the subscription, card as the only payment method (Apple
Pay and Google Pay come through it; Link stays off) and flexible billing mode. During a trial
its `trial_end` is the trial's end and the answer carries a SetupIntent secret (`intent: setup`);
otherwise the first invoice is charged now and the answer carries its PaymentIntent secret
(`intent: payment`). An incomplete subscription is not the organization's until it is paid; a
checkout started again cancels the abandoned one.

**Changing** follows the ADR: an upgrade or an addition applies at once, prorated, on a monthly
plan as a line on the next invoice (`create_prorations`), on an annual one charged now
(`always_invoice` with `pending_if_incomplete`, so it applies only once paid, and the answer
may carry a payment secret); monthly to annual applies at once the same way. A downgrade, a
removal and annual to monthly wait for the renewal: a subscription schedule made from the
subscription keeps the current items until the plan item's period end, then the new ones with
`proration_behavior: none` for one interval, and releases the subscription. A downgrade takes
the whole choice to the renewal. During a trial every change applies at once and nothing is
prorated. A new change releases the schedule first.

**Cancelling** sets `cancel_at: max_period_end` (not `cancel_at_period_end`, which on a
mixed-interval subscription stops at the monthly SMS item's end) and Stripe's cancellation
feedback, and logs the reason in `subscription_changes`. Before the first charge of a trial the
subscription is cancelled at once and the organization returns to its plain trial.
**Resuming** clears `cancel_at`. Reactivating a read-only organization is choosing a plan again.

**The webhook** checks the signature with `constructEventAsync` and Web Crypto, refuses an event
of the other mode or of a connected account, and inserts the event id into `stripe_events`
first: an event already processed answers `200` at once; a failure records `error` and answers
`500`, so Stripe delivers it again. Each subscription event reads the subscription back from
Stripe and writes the row from it: plan, interval and price version from the items' lookup keys,
packs and members from their quantities, `current_period_end` from the plan item, and
`access_until` as the ADR sets it (the trial's end plus 14 days while a chosen plan waits for its
first charge; null while active, the cancellation date once one is set; 14 days from the first
failed renewal while past due; the end of the paid period once canceled). An organization
follows one subscription; another one's late events change nothing. `invoice.payment_failed`
starts the 14 days (not for the first charge, confirmed in the browser);
`invoice.payment_action_required` is logged; `invoice.upcoming` only recorded.
`customer.updated` with a new default card moves the subscription to it and, while past due,
pays the open invoices at once.

`invoice.paid` above zero adds a `billing_invoices` row, issues the Oblio document through
`oblio-documents.ts` (`OBLIO_DOCUMENTS=invoice`: series `SSMUSOR` to the email for invoices or
the first owner's; anything else: a `TEST` proforma to the fixed test client, never emailed),
stores its series, number and link, then downloads the PDF into `billing-invoices` at
`<organization_id>/<series>-<number>.pdf`. Each step checks what is done, so a retried event
issues nothing twice. Lines are named from the catalogue (Stripe's descriptions are English);
a prorated credit is a negative quantity. `charge.refunded` for a whole charge issues a storno
of the original invoice, stored as a negative row keyed by the refund id with `storno_of`, or
cancels the proforma outside production; a partial refund is left alone.

## Members

An owner changes a member's role with `PATCH /organization/members/{userId}` and removes a
member with `DELETE /organization/members/{userId}`. Both call database functions as the
owner; memberships have no write policy. Nobody acts on their own membership (`409`,
`reason: own_membership`), which is what keeps an organization from ending up without an
owner. Someone who is not a member of the caller's organization is `404`. Removing deletes
the membership only: the account, the profile, and what the person created stay, the person
sees no organization, and can be invited again.

## Releases

[ADR 026](architecture/adr-026-updates-and-release-review.md). The update of each release,
read from the `releases` table through the view `release_list` with the caller's token
([data model](data-model.md#releases)). The routes need a signed-in account and no
membership, since releases are not organization data; they carry no `portal` tag, so the
portal's client does not have them.

`GET /releases` lists every release in full, newest `publishedAt` first, not paginated:
there are few. `GET /releases/{tag}` returns one, `404` when no release has the tag and `400`
when the path is not a tag. Each release has `unread` for the caller: published after their
profile was created and after the release they last acknowledged.

`POST /releases/acknowledge` takes `{ tag }` and acknowledges everything published up to and
including that release, through `acknowledge_releases`. When the caller has already
acknowledged a release published later, that one is kept; either way the answer is
`{ "acknowledgedThrough" }`, the tag the profile keeps. `404` for an unknown tag. An account
without a profile gets `409` with `reason: profile_missing`: a profile needs a name, which
this request does not carry, and such an account has nothing unread. The API exposes no write
to the table itself; only the release workflow writes it.

## Setup guide

[ADR 031](architecture/adr-031-setup-guide.md). The routes need a membership and read and write
with the caller's token. `GET /me/setup` reads `setup_progress()`, the caller's
`setup_step_skips` and the two moments on their profile
([data model](data-model.md#setup-guide)), and answers:

- `steps`: the fifteen steps in the ADR's order, each `{ id, state, canDo, lock?, missing? }`.
  `state` is the first that holds of `done`, `skipped`, `locked` and `open`; `account` is
  always done. `canDo` is false for `company` and `authorizations` when the caller is not an
  owner. `lock` is present only on a locked step: `needs-client` (`workplaces-positions`,
  `responsible-persons`, `fire-safety-data`), `needs-workplace-and-position` (`employees`),
  `needs-position` (`risk-evaluation`), `needs-organization-data`, then
  `needs-professional-title`, then `needs-basic-data` (`generate-sets`), `needs-draft`
  (`issue-document`), `needs-employee` (`portal-invitation`, `training`) and
  `needs-training-record` (`signature`). `needs-organization-data` asks only what the sets print:
  the legal name, the representative's name and role, and the fire-safety technician; the CUI,
  the address and the certificate serve the service contract. `missing`, on `company` and
  `authorizations` while not done, lists the focus keys of the empty fields in the form's order:
  `cui`, `legal-name`, `address`, `representative-name`, `representative-role`; `certificate`,
  `fire-safety-technician`.
- `next`: the first open step the caller can do, or null.
- `clientId`: the active client furthest along, or null.
- `ownerName`: the owner's name when the organization has exactly one owner, otherwise null.
- `organizationHasClients`: whether the organization has an active client, whoever added it,
  which words the member steps without «primul».
- `closed` and `finished`: whether the profile has `setup_guide_closed_at` and
  `setup_guide_finished_at`.

`PUT /me/setup` takes `{ closed?, finished? }`: `true` sets the moment to now, `false` clears it
and a missing key leaves it; `409` with `reason: profile_missing` for an account without a
profile. `PUT /me/setup/skips/{step}` and `DELETE /me/setup/skips/{step}` skip a member step
and undo the skip, both idempotent; `400` for any step but the eleven member steps. All three
answer the guide as `GET` does. They are the caller's own state, so they stay open while the
organization is read-only, and during an impersonation they act on the signed-in admin's own
account, as the releases do. During an impersonation every route answers the admin's own done
steps, skips, `closed` and `finished`, while `canDo` and `next` follow the impersonated member's
role, and the locks their organization.

## Dashboard

[ADR 027](architecture/adr-027-dashboard.md). `GET /dashboard/summary` answers every count of
the dashboard in one request, computed each time: the organization's row of the view
`dashboard_summary`, the twelve month ends of `dashboard_employees_at_month_ends`, and a count
of the caller's own pending signature slots with the predicates of `GET /me/signature-requests`
([data model](data-model.md#dashboard)). All three read with the caller's token. `contracts` is
null for a member who is not an owner; the policies would give a specialist zeros anyway. An
organization without a row answers zeros.

## Participants

[ADR 022](architecture/adr-022-participants-and-the-portal.md) records the design and
[the data model](data-model.md#participants) the database side. Every member invites, resends
and revokes; these routes take a membership like the client routes and are not part of the
portal's client.

| Route                                                                     | Response                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /clients/{clientId}/employees/{employeeId}/participant`              | `{ participant, invitation }`: the active participant, else the pending one |
| `POST /clients/{clientId}/employees/{employeeId}/participant-invitations` | `201` with the invitation, after sending its message                        |
| `POST /clients/{clientId}/participant-invitations`                        | `201` with the client administrator's invitation, after sending its message |
| `GET /clients/{clientId}/participants`                                    | `{ participants, invitations }`: active participants, pending invitations   |
| `POST /participant-invitations/{invitationId}/resend`                     | The invitation renewed for 30 days, after sending its message again         |
| `POST /participant-invitations/{invitationId}/revoke`                     | `204`                                                                       |
| `POST /client-participants/{participantId}/revoke`                        | `204`; the person's records stay                                            |

A participant carries the `channel` and `address` of the accepted invitation, which is what
they sign in with, `noticeVersion`, and `language`, `ro` or `en` once they chose one in the
portal, else null. The client's "Portal" tab lists them from this route.

An employee is invited with `{ channel, address }`, `channel` `email` or `sms`; the address
must be the employee's own email or phone as their row holds it, which the database checks. The
client administrator is invited with `{ channel, address, employeeId?, fullName? }`: an
employee of the client, whose name is read from their row, or a name. The contract lowercases
an email and puts a phone in E.164 with Romania as the default country, so `0721 000 000`
arrives as `+40721000000`. An invitation is `open`, `expired`, `accepted` or `revoked`;
`resendableAt` is 10 minutes after `lastSentAt`, and the database refuses a message before it.

Sending runs as the member first: `create_participant_invitation` (or
`resend_participant_invitation`) saves the invitation and its send time. Then, with the secret
key and only for this, the API prepares the account the person will sign in with:
`auth_user_id_by_address` finds the account the address already has, since the Auth Admin API
finds no user by phone; without one it creates the user through the Auth Admin API with
`email_confirm: false` or `phone_confirm: false`, so the first code confirms the address. Either
way the account carries `app_metadata.participant: true`, merged into the metadata it already
has, so a platform admin's `role` stays; without the flag the Send SMS hook texts it nothing.
An address that already belongs to a member is reused as it is: the account then has a
membership in the app and participations in the portal. Last, the message goes out over the
`MAIL` or `SMS` binding with `PORTAL_ORIGIN` as its link and no token.

When the account or the message fails the answer is `503` with the reason
`participant_account_unavailable` or `participant_message_not_sent`, and the invitation stays
saved with its send time: the member resends it once the 10 minutes are over. A missing secret
key or binding answers `503` before anything is saved.

Errors carry a `reason` from `participantErrorReasons` in the contracts, all `409`:
`employee_has_participant`, `employee_already_invited` (open at another address),
`address_has_participant`, `address_invited_for_another_person`, `address_not_of_employee`,
`employee_required`, `full_name_required`, `invalid_address`, `sent_recently`,
`invitation_accepted`, `invitation_revoked`, plus `client_archived` and `client_is_lead`. A
client, employee or invitation outside the organization is `404`.

## Portal

The routes under `/portal` are the portal's and nothing else's. Each carries the OpenAPI tag
`portal`, which is what puts it in the portal's generated client ([API client](api-client.md));
no route outside the prefix has the tag.

| Route                                                             | Who                  | Response                                                                                        |
| ----------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /portal/me`                                                  | Participant          | `{ participations: [ … ] }`, never empty                                                        |
| `POST /portal/participants/{participantId}/notice`                | Participant          | `204` after recording `{ version }` of the privacy notice                                       |
| `PUT /portal/participants/{participantId}/language`               | Participant          | `204` after saving `{ language }`, `ro` or `en`                                                 |
| `GET …/{participantId}/training-records`                          | Employee             | `{ items, training }`: own records newest first with their `slots`, the states                  |
| `GET …/{participantId}/data`                                      | Employee             | _Datele mele_: what the sheets print, and the provider                                          |
| `GET …/{participantId}/sheets`                                    | Employee             | `{ ssm, psi }`, each `{ ready, missing, stored, sequences }`                                    |
| `GET …/{participantId}/sheets/{domain}`                           | Employee             | `200 application/pdf`, as stored once signing has started; `409 missing_sheet_data`             |
| `GET …/{participantId}/employees`                                 | Client administrator | `{ items }`: current employees with their training states                                       |
| `GET …/{participantId}/employees/{employeeId}/training-records`   | Client administrator | As the employee's own                                                                           |
| `GET …/{participantId}/employees/{employeeId}/sheets`             | Client administrator | As the employee's own                                                                           |
| `GET …/{participantId}/employees/{employeeId}/sheets/{domain}`    | Client administrator | As the employee's own                                                                           |
| `GET …/{participantId}/responsible-persons`                       | Client administrator | `{ items }`: the client's active responsible persons                                            |
| `GET …/{participantId}/signature-requests`                        | Participant          | `{ items }`: the pending requests addressed to them                                             |
| `GET …/{participantId}/employees/signature-requests`              | Client administrator | `{ items }`: the client's pending requests                                                      |
| `GET …/{participantId}/signing-agreement`                         | Employee             | `200 application/pdf`, their own signing agreement                                              |
| `GET …/{participantId}/signing-agreement/state`                   | Employee             | `{ agreement, unavailable }`: null until they sign it or the specialist records one             |
| `GET …/{participantId}/employees/signing-agreements`              | Client administrator | `{ items }`: agreements awaiting the employer, then those signed electronically                 |
| `GET …/{participantId}/employees/{employeeId}/signing-agreement`  | Client administrator | `200 application/pdf`, as the employee's own                                                    |
| `POST …/{participantId}/signing-sessions`                         | Participant          | `201 { sessionId, channel, addressHint, expiresAt, items }`; the code is sent                   |
| `POST …/{participantId}/signing-sessions/{sessionId}/sign`        | Participant          | `{ signed, failed, agreements }` after `{ code }`                                               |
| `GET …/{participantId}/tests`                                     | Employee             | `{ ssm, psi }`, each `{ status, results, attempts, inProgress }`                                |
| `GET …/{participantId}/tests/{domain}/{test}/study-card`          | Employee             | `{ explanations, material }`; `material` null while none is issued                              |
| `POST …/{participantId}/tests/{domain}/{test}/attempts`           | Employee             | `{ attempt }`, started or resumed; `409 test_not_awaiting`                                      |
| `PUT …/{participantId}/test-attempts/{attemptId}/answers/{index}` | Employee             | `{ attempt }` after `{ chosen }`; `400 option_out_of_range`, `409 attempt_finished`             |
| `POST …/{participantId}/test-attempts/{attemptId}/finish`         | Employee             | `{ id, score, total, passed, mistakes, … }`                                                     |
| `GET …/{participantId}/materials/{domain}`                        | Participant          | `200 application/pdf`, the issued material; `404 material_not_issued`                           |
| `GET …/{participantId}/tests/results/{resultId}/sheet`            | Participant          | `200 application/pdf` inline, the [test sheet](#the-test-sheet); `404 test_sheet_not_available` |

`…` stands for `/portal/participants`. `requireParticipant` (`src/lib/participant.ts`) runs
after `requireAuth` on every one of them: as the caller it calls
`accept_participant_invitations()`, which links a first sign-in from an invited, now confirmed
address to its open invitations and is a no-op afterwards, then `current_participations()`,
and answers `403` when the account has none. It never looks at a membership: a member who is
also a participant uses the portal as the participant. A route for one participation takes its
`participantId` from the path and answers `404` for one that is not the caller's. The
employee's routes answer `404` for a client administrator who is not an employee; the
administrator's routes answer `403` to an employee, checked in the API because an account that
is also a member reads more through the members' policies than the participant's would give.

A responsible person reads as the decisions name them: `fullName`, `jobTitle`, the `roles` as
keys (the contracts' `responsiblePersonRoleLabels` word them), `employeeId` or null for someone
who is not an employee, and the name of the one `workplace` they answer for, or null for every
workplace. Archived rows are left out, and the list is ordered by name.

A training record reads as its row of the sheet prints it, with `slots`: the slots the record
has, derived by the same rule as `GET /clients/{clientId}/training-records/{recordId}/signatures`
(`recordSlots` in `src/modules/signing/record-slots.ts`), each cut to `slot`, `state`,
`signedAt`, `signerName` and `signerJobTitle`, which the signed sheet prints. The request, the
addressed account, the delivery times and the void reason, which is the member's own words, stay
with the specialist. The request and signature rows come embedded in the records query, read as
the participant: the participants' and the client administrators' policies on
`signature_requests` and `training_signatures` cover the records they read. The portal says a
slot that is `signed` or `paper`; a `void` one reads as not signed, and a live request shows
through the signature requests list.

Policies choose the rows a participant reads, not the columns, so every portal query names its
columns and every response is built field by field into a schema of its own in
`packages/contracts/src/participants.ts`: never the CNP, the specialist's notes, a training's
notes, or the organization's bank, contract and terms details. Nothing of the app's responses
is reused as-is. A new portal route does the same.

**The tests.** A participant never reads `test_questions`, whose options carry the key: the
draw, the answers and the finish are the definer functions `start_test_attempt`,
`answer_test_attempt` and `finish_test_attempt`, the study card `test_study_card`, called as the
participant ([data model](data-model.md#knowledge-tests)). `GET …/tests` reads the employee's
`test_status`, their results and their finished attempts as summaries without the questions,
and the participation's attempt in progress of the test that awaits, which carries no key until
the finish, as
`{ questionId, text, options: [{ text }], chosen }`. Starting passes the newest issued material
revision as the attempt's `material_revision_id`, and `CF-Connecting-IP` and the user agent as
the signing evidence does; finishing passes them again. The answer's question is the path's
index from 0, a string of digits in the OpenAPI document. The outcome of a finish is the score,
the total and `passed`, and for a failed attempt `mistakes`, each question answered wrong with
its `index`, `text` and `explanation`: never the options and never which one was correct, since
a retake is drawn and shuffled again. A pass then puts its result on the stored signed sheet
(above, [Knowledge tests](#knowledge-tests)). The client administrator's `GET …/employees`
answers `tests` beside `training`.

**The material** (`GET …/materials/{domain}`) is the newest issued revision of the client's
general training material (`ssm`) or fire-safety own instructions (`psi`), the two type keys of
the contracts' `portalMaterialTypeKeys`, served inline. A participant reads no document row, so
`portal_material(participant, domain)`, security definer, answers the revision for the caller's
own participation, and the API reads its PDF with the secret key. No Storage policy and no
manifest flag were added: the function is the one place that says which documents the portal
shows.

The secret key reads files for the sheets and the signing agreement: a template from Storage
with `createAdminFileStore`, because Storage's template policy admits members only, and a stored
signed sheet's or agreement's file the same way. The participant reads the template's registry
row, the signed sheet's row and the agreement's row through their own policies, so the paths the
secret key reads are ones they are allowed. Signing, below, is the other exception. Everything
else runs as the participant.

## Knowledge tests

The knowledge tests of [ADR 024](architecture/adr-024-knowledge-tests.md): the question bank for
members, an employee's tests in the app, the paper result, and what the documents and the sheets
print. The portal's own routes are under [Portal](#portal). The modules are `src/modules/tests/`
(the bank, the employee's tests, the rows shared with the portal) and
`src/modules/portal/test-routes.ts`; the shapes are in `packages/contracts/src/tests.ts`.

| Route                                                                       | Access                          | Response                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /organization/tests/questions`                                         | Verified user with a membership | `{ sittingSize, minimumActiveQuestions, passMarkPercent, tests: [{ domain, test, code, title, activeCount, questions }] }`; `?domain=&test=`          |
| `POST /organization/tests/questions`                                        | Verified user with a membership | `201 { question }`, an own question                                                                                                                   |
| `PATCH /organization/tests/questions/{questionId}`                          | Verified user with a membership | `{ question }`; `409 question_built_in` for a built-in                                                                                                |
| `DELETE /organization/tests/questions/{questionId}`                         | Verified user with a membership | `204`; `409 question_built_in`, `409 test_below_minimum`                                                                                              |
| `PUT /organization/tests/questions/{questionId}/hidden`                     | Verified user with a membership | `{ question }`, hidden; `409 question_not_built_in`, `409 test_below_minimum`                                                                         |
| `DELETE /organization/tests/questions/{questionId}/hidden`                  | Verified user with a membership | `{ question }`, restored                                                                                                                              |
| `GET /clients/{clientId}/employees/{employeeId}/tests`                      | Verified user with a membership | `{ ssm, psi }`, each `{ status, results, attempts }`                                                                                                  |
| `POST /clients/{clientId}/employees/{employeeId}/tests/results`             | Verified user with a membership | `201 { result }`, a pass of the printed test; `409 test_not_awaiting`                                                                                 |
| `PATCH /clients/{clientId}/employees/{employeeId}/tests/results/{resultId}` | Verified user with a membership | `{ result }`; `409 result_from_attempt` for a portal result's day or material, `409 examiner_signed` for the examiner once they signed the test sheet |
| `GET …/tests/results/{resultId}/sheet`                                      | Verified user with a membership | `200 application/pdf` inline, the stored test sheet; `404 test_sheet_not_available` for a paper result                                                |
| `POST …/tests/results/{resultId}/sheet/paper-signatures`                    | Verified user with a membership | `{ resultId, sheet }` after `{ slot: trainee \| examiner }` marked on paper; `400 examiner_required`, `409 slot_signed`                               |

**The bank.** Owners and specialists alike, as the policies have it. The list reads
`test_questions`, which the members' policies narrow to the built-ins and the organization's
own, in the order `active_test_questions` prints them (position, the built-in first, then the
oldest), and the organization's `test_question_hides`; each question carries `builtIn` (no
organization) and `hidden` (a hide row), and each test its `activeCount`. The sitting size, the
minimum of active questions and the pass mark are the contracts' constants (ten, ten, 70%),
answered so the app shows them and never sets them. An own question without a `position` takes
the one after the test's highest. Only an own question is edited or deleted
(`question_built_in`, checked before the write); only a built-in is hidden (`TST02`,
`question_not_built_in`), and hiding one already hidden writes nothing. The database refuses to
leave a test with fewer than ten active questions (`TST01`), which the API answers as `409` with
reason `test_below_minimum` and the message "Un test trebuie să păstreze cel puțin zece
întrebări active." There is no preview route: the app draws the question as the employee will
see it from the bank's own row.

**Errors.** `fromDatabaseError` (`src/lib/db.ts`) translates the schema's codes, the raised text
being the `reason` (the contracts' `testErrorReasons`) and the message Romanian: `TST01`, `TST02`,
`TST03` (`attempt_finished`), `TST05` (`test_not_awaiting`) and `TST06` (`result_from_attempt`)
as `409`, `TST04` (`question_out_of_range`, `option_out_of_range`) as `400`. The portal's
handlers answer the definer functions' `P0002` (`participant_not_found`, `attempt_not_found`) as
`404`.

**An employee's tests.** `GET …/tests` answers per domain the `status` from `test_status`
(`state`, `awaitingTest`, `lastPassedOn`, and `dueOn` for fire safety), the `results` newest
first (`takenOn`, `material`, `grade` `admis`, `examiner` `{ name, jobTitle }` or null, `source`
`portal` or `paper`, `attemptId`), and the `attempts` newest first as summaries: `startedAt`,
`finishedAt`, `score`, `total`, `passed`, never the questions. Each result carries `sheet: { available, signed: { trainee, examiner } }`, its
[test sheet](#the-test-sheet): `available` once the stored PDF exists, never for a paper result,
and each slot's state as a record's slots have them (`unassigned`, `pending`, `signed`, `paper`,
`void`), from `test_sheets`, its requests and `test_sheet_signatures` as the caller reads them.
The portal's `GET …/tests` carries the same `sheet` on each result. The client's employee lists and the organization's _Angajați_ answer
`tests: { ssm, psi }` beside `training`, from the computed relationship `test_status`, and
`?testState=passed|pending|annual_due|none` filters as `?trainingState=` does: `passed` keeps
those passed in both domains, any other state those in it in either, through an inner embed.

**A paper result** is a test filled in on the printed copy and passed: the day (not in the
future), the examiner, the grade `admis` and the material, by default the test's name and code
(`testResultMaterial`). It is taken while the test can be owed, read from the hiring training
and the last pass rather than from the state, which a leaver has none of: a hiring result once
the domain's hiring training is recorded (the introductory general one for occupational safety,
the workplace one for fire safety) and before any pass, an annual one once the employee has a
fire-safety pass. Otherwise `409 test_not_awaiting`. A failed paper test is not recorded.
`PATCH` replaces the examiner, and of a paper result the day and the material; a portal result's
day and material are the attempt's (`TST06`).

**On the sheets.** The individual training sheets read the employee's `test_results` of the
domain beside the records. The occupational safety sheet prints them in annex 11's block,
oldest first, as `testResults: [{ date, material, grade: "Admis", examiner: "Name, job title" }]`
with `blankRows.testResults` to five rows. The fire-safety sheet, whose form has no such block,
prints a pass as a row of its periodic table, sorted with the training rows by day: the
material followed by ": admis" ("Verificare anuală pe bază de test (TPSU): admis"), no duration,
the employee's position as the occupation and the examiner where the trainer is named. On a
stored signed sheet a result fills its row as a training record does (below, and
[data model](data-model.md#signatures)): when a result is recorded on paper, when the finish of
a passing attempt records it, and when it changes, `syncResultRows` fills the next free `t` row
of the occupational safety sheet (`tN_date`, `tN_material`, `tN_grade`, `tN_examiner`,
`tN_note`), or the next periodic row of the fire-safety one (`pN_date`, `pN_duration` empty,
`pN_occupation`, `pN_material` with "(examinator: …)" after it, since the row's other column is
a signature nobody gives), on a continuation sheet once the block's five rows or the page are
taken. No slot signs the row: the [test sheet](#the-test-sheet) is what the trainee and the
examiner sign. An employee without a stored sheet is left alone; their first sheet places every result they have,
among the records by day. Best effort: the result stands if the row could not be filled.

**On the documents.** The three tests, `test_hiring`, `fire_test_hiring` and
`fire_test_annual`, print every active question of the organization's bank
([document engine](document-engine.md#knowledge-tests)). The document facts read
`active_test_questions` of the preparer's organization for each test
(`src/modules/documents/knowledge-tests.ts`), numbered from 1, the options lettered `a` to `d`
and the key the correct letters in upper case, as `knowledgeTests` of each set's context, which
no template prints as a name: `documentData` and `fireSafetyDocumentData` give a test its own
`test` (code and title) and `questions` by type key, as a decision gets its number, so no other
document of the set holds the bank in its snapshot. The revision's snapshot keeps `questions` as
printed, and "Date modificate" compares it with the bank as it is: an edited, hidden or new
question marks the draft, and generating it again prints the bank as it stands.

### The test sheet

A pass in the portal renders a **test sheet** (_fișa de test_), signed as ADR 023 signs a record
(`src/modules/test-sheets/test-sheets.ts`; [data model](data-model.md#test-sheets), [document
engine](document-engine.md#the-test-sheet)). After the finish records a pass, `afterPass` in
`src/modules/portal/test-handlers.ts` fills the result's sheet row and calls `afterTestPass`,
best effort and with the secret key: `ensureTestSheet` merges the `test_sheet` template with
`buildTestSheetData` from the attempt as it was sat (its questions and options in the shown order,
the options chosen, the score and total), the employee's name and position, the client, the test's
code and title and the day, converts it with `convertForm`, makes `test_sig_trainee` and
`test_sig_examiner` signature fields with `prepareSheet`, fills `test_examiner_name` and
`test_examiner_job_title` from the result, and stores it at
`test-sheets/{clientId}/{employeeId}/{resultId}/v1-{nonce}.pdf` in the documents bucket with its
`test_sheets` row; two calls racing keep one sheet. Then `issueTestSheetRequests` asks the
trainee, the employee's own active participant (none while their agreement is `withdrawn`), and
the examiner: the member whose profile name is the result's examiner by `samePerson`, as a slot's
signer is matched, else an active participant of the client of that name, else nobody, the slot
left for a member to mark on paper. A slot with a live request or a signature is left alone. No
message goes out: the request lists show them. A pass whose sheet could not be drawn up has it
drawn up, with its requests, the first time the sheet is read.

The sheet is never drawn up again: the attempt is frozen. A `PATCH` of the result's examiner,
which the database voids the pending examiner request for (`signer_changed`), fills the examiner's
fields again as the sheet's next version and requests the slot from the new examiner, issued by
the member, best effort; once the examiner has signed, electronically or on paper, the database
refuses the change, `409 examiner_signed`. Each write makes the next version from the current
bytes, checked against the digest, as a file of its own (`…/v{version}-{nonce}.pdf`), and moves
the row on only where `version` is still the one read; the loser removes its file and tries once
more, then answers `409 sheet_busy`. A signature (below, the signing session) is
`applyTestSheetSignature`: the first certifies the file with filling and signing as the only
permitted changes; the examiner's fills the examiner's fields from the result first, in the same
version, and locks them; the trainee's locks nothing. The appearance prints the name the slot
prints, `semnat electronic` and the day, the reason "Fișa de test: persoana testată" or
"…: examinator".

`GET …/tests/results/{resultId}/sheet` answers the stored PDF inline, named
`Fisa-de-test-{code}-{Name}-{yyyy-mm-dd}.pdf`, after reading the result as the member; the
portal's `GET …/{participantId}/tests/results/{resultId}/sheet` after reading it as the
participant, the employee's own or, for a client administrator, any of the client's, the file read
with the secret key in both. `…/sheet/paper-signatures` calls `mark_test_sheet_paper_signature`,
which names the employee or the result's examiner in the evidence, and answers the sheet's
summary.

## Signatures

[ADR 023](architecture/adr-023-advanced-electronic-signature.md) records the design and
[the data model](data-model.md#signatures) the database side. The `signing` module holds the
routes below, the signing sessions among them; the signed sheet they sign on is the
`signed-sheets` module's.

| Route                                                                    | Response                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `GET /clients/{clientId}/signer-candidates`                              | `{ items }`: members, then active participants, each account once             |
| `GET /clients/{clientId}/training-records/{recordId}/signatures`         | `{ recordId, slots }`, each slot with its state                               |
| `POST /clients/{clientId}/training-records/{recordId}/signatures/paper`  | The slots, after `{ slot, signerName, signerJobTitle? }` marked on paper      |
| `POST /clients/{clientId}/training-records/{recordId}/signatures/void`   | The slots, after `{ reason }` voided every live signature and request         |
| `GET /me/signature-requests`                                             | `{ items }`: the caller's own pending requests across clients, oldest first   |
| `GET /clients/{clientId}/signature-requests`                             | `{ items }`: the client's requests in `?state=` (`pending` by default)        |
| `GET /clients/{clientId}/employees/{employeeId}/signing-agreement`       | `200 application/pdf`, the act adițional drawn up on the spot                 |
| `GET /clients/{clientId}/employees/{employeeId}/signing-agreement/state` | `{ agreement, unavailable }`: the state, or null, and why it cannot be signed |
| `PUT /clients/{clientId}/employees/{employeeId}/signing-agreement/state` | The agreement after `{ state: generated \| signed_on_paper, clientFileId? }`  |
| `POST /me/signing-sessions`                                              | `201 { sessionId, channel, addressHint, expiresAt, items }`; the code is sent |
| `POST /me/signing-sessions/{sessionId}/sign`                             | `{ signed, failed, agreements }` after `{ code }`                             |

Every member route takes a membership; the four portal routes are in the [Portal](#portal)
table, with the `portal` tag.

**Requests at save.** `POST` and `PUT …/trainings` with `signers` first read the signer
candidates and refuse, before saving: an account that is neither a member of the organization
nor an active participant of the client, `422` with `signer_not_of_client`, and an account whose
own name (a member's profile name, an employee participant's `last first`, an administrator's
name) is not the name the slot prints, compared without order, case, hyphens or diacritics by
`samePerson` of the contracts, `422` with `signer_name_mismatch`, each with the slot in `issues`.
An edit that changes a slot's printed name while keeping its signer is checked the same way. After
the save, best effort, for every record of the training and every slot it has (the verifier only
with a verifier, the admitter only with an admission): the trainee's to the employee's own active
participant, found by the API, unless the employee's agreement is `withdrawn`; the trainer's,
verifier's and admitter's to the accounts named. A slot left out or null is signed on paper, and
a body without `signers`, or a training whose `source` is `paper`, asks nobody. A slot whose live
request is already addressed to the signer wanted, pending or signed, is left alone, so a save
after an edit issues only what the edit voided (the database voids the pending requests of a
record whose printed facts or source change). A pending request addressed to someone else gives
way with `signer_changed`, and one whose slot is now null or left out with `paper`. All of it is
one call to `issue_signature_requests`, as the member, so a request is voided only together with
its replacement; a refusal there (the database's `SIG05`, `SIG03`) is logged and the save still
answers `201` or `200`, the next save issuing what is missing. A signed request is never touched by
a save. Then the rows: for each record whose employee has a stored sheet of the domain, the record
takes a row if it has none and its row is filled again from the record as it is now while no live
electronic signature holds it (see the signed sheet below), also best effort.
`GET …/trainings/{trainingId}` answers `signers: { trainer, verifier, admitter }`, the account
each slot's live request (pending or signed) is addressed to on any of the records, the first
issued, null when none is, for the form to start from.

Each signer is then told once per save, with the number of requests issued to them and never
the list: by email whenever the person has one (a member's account email; an employee's email
on their row; otherwise the address of the participant's accepted invitation), else by SMS to
the phone, through `sendSignatureRequest` of the mail or SMS Worker. A member is sent to the
app's address and signs there; a participant, and every trainee, to the portal's. A message
that fails leaves its requests standing; `notified_at`, which members may not write, is set
with the secret key on the requests whose signer was told.

**Slots.** A slot is `pending` (with `signer: { accountId, name }`), `signed` electronically or
`paper`, with `signedAt`, `signerName` and `signerJobTitle` as printed, `void` when its request
or signature was voided and nothing replaced it (`voidedAt`, `voidReason`, a code the app labels:
`record_changed`, `signed_on_paper`, `signer_changed`, `paper`, `signer_left`, `archived`,
`withdrawn`, or the member's own words), or `unassigned`. `hasSignatures` is true once the record
has any signature row, voided and paper ones included, which is when the database refuses to
delete the record or its training (`record_has_signatures`). `…/paper` calls
`mark_paper_signature`; `…/void` calls `void_training_signatures`, which also strikes the
record's live sheet row when an electronic signature was voided, and then writes _anulat_ into
that row's note on the PDF (`voidRow`; a record never placed on a sheet is fine, and a failure
here leaves the note for the sheet's next write). Both answer `404` for a record outside the
client in the path, checked before the function runs.

**Errors.** The database's codes become API errors in `fromDatabaseError`, the raise's message
being the `reason`: `SIG01` (`record_signed`, `record_has_signatures`), `SIG02`
(`slot_signed`), `SIG06`, `SIG07` (`agreement_signed_electronically`), `SIG08`
(`request_not_pending`), `SIG09` (`session_mismatch`, `session_used`) and `SIG10`
(`agreement_not_awaiting`, `agreement_signer_not_party`, `agreement_recorded`) are `409`; `SIG03`
and `SIG05` are `422`; `SIG04` (`reason_required`, `signer_name_required`, `examiner_required`) is `400`; any other
foreign-key refusal (`23503`) is a plain `409`. The signing code's own refusals are `409` too, from
the API: `code_rate_limited` (a second code within 60 seconds, with `retryAfterSeconds`),
`code_attempts_exceeded`, `code_expired`, `code_already_used` and `code_invalid` (with
`attemptsLeft`).

**Lists.** A request names a training record's slot or a test sheet's, and the four lists answer
both alike: every item has `kind` (`training_record` or `test_sheet`), `label`, one line naming
what it signs from `signatureRequestLabel` of the contracts ("Instruire introductiv-generală SSM ·
05.01.2026", "Fișa de test · Test la angajare SSM · 21.10.2026"), and `employee` `{ id, lastName,
firstName }`; `record` is set for a record's request and `testSheet` for a sheet's, the other null.
The members' `testSheet` is `{ id, resultId, domain, test, takenOn }`; the portal's adds `code`,
`title`, `score`, `total` and `examiner` (`{ name, jobTitle }` or null), and its `signerName` is the
employee for the trainee and the result's examiner for the examiner. A sheet's `slot` is `trainee`
or `examiner`, the value lists alone carry (`signatureRequestSlotSchema`). An item carries the
request, the client, the record (its training, employee, day, domain and phase) or the test sheet,
and `agreement`, the employee's signing agreement with its state and the two
signing moments, null when none is recorded, which the app and the portal show as "act adițional
nesemnat" unless it is `signed_electronically`, `signed_on_paper` or `in_contract`, and as
"așteaptă angajatorul" once the employee has signed. `GET /me/signature-requests` is the
member's own pending requests in the membership's organization, never a trainee's, which an
account that is also an employee signs in the portal. A request whose client, record, employee or
training a policy hides is left out of a list rather than failing it. The portal's items carry
the record as its row of the sheet prints it and `signerName`, the person the slot prints. Both
portal lists read the request rows as the participant, then those records and test sheets, by id
and client, with the secret key: a workplace manager signs other employees' admissions, and an
examiner who is a participant other employees' test sheets, which the participant policies do not
show. The administrator's list is refused to an employee with `403`.

**The signing agreement** is drawn up like an individual training sheet: merged from the
`signing_agreement` template with `buildSigningAgreementData` (the employee, the client's legal
name, CUI, registered office and representative, the provider's legal name) and converted, never
stored until it is signed. It names the channel the codes go to, email when the employee's row
has one, else the phone; with neither it answers `409` with `employee_has_no_address`. Without
the client's legal representative's name or role it answers `409` with `missing_document_data`
and `client.representativeName` or `client.representativeRole` under `missing`, as the documents
do; `PUT …/state` with `generated` refuses the same way. The portal reads its template with the
secret key, as the sheets do, after the participant's own policy has shown the registry row
(`20261018110000_signing_agreement_policy.sql`). `PUT …/state` takes `generated`,
`signed_on_paper`, `withdrawn` (the employee went back to signing by hand: the database voids
their pending trainee requests and no new one is issued while it stands) or `in_contract` (a new
hire whose contract carries the clause, which counts as agreed), inserts the row or updates only
the columns members may change, and never sends `marked_by`, which the database sets to the
member signed in; `signed_electronically` is the signing session's. An agreement recorded in any
state but `generated` cannot be deleted. Every agreement state answer carries `awaiting`,
`employee` or `employer` while the agreement waits for that party's electronic signature, else
null. The employee's signature is awaited from their first sign-in, before any member records
the agreement (ADR 023: the act is the first thing the portal offers), so `agreement` null means
the employee may sign it; the answer's `unavailable` says when they cannot yet, with the same
reasons drawing it up would refuse (`missing_document_data` with `missing`, or
`employee_has_no_address`), and is null once the agreement no longer awaits the employee. An
employee who signs before any member recorded the agreement records it as `generated`
themselves, with the secret key, just before the evidence row.

**The authority and the identities.** The app is its own certificate authority. Its secrets
are `SIGNING_CA_KEY` (P-256, PKCS#8 PEM), `SIGNING_CA_CERT` (PEM) and
`SIGNING_KEY_ENCRYPTION_KEY` (32 bytes, base64), made by
`pnpm --filter @ssm-usor/api signing:ca`, which prints the three `.dev.vars` lines; a PEM may
carry its line breaks as `\n`. `loadSigningCa` refuses a certificate that has expired and a key
that is not the certificate's (it signs a random probe and verifies it with the certificate's
public key); without the secrets, or with either refusal, signing answers `503` with
`signing_unavailable`. `src/lib/signing-ca.ts` issues an identity: a P-256 key from WebCrypto,
stored as PKCS#8 under AES-256-GCM with a random IV and the account id as additional data, and a
two-year certificate signed by the authority whose subject is the account's own name (CN, cut to
64 characters: a member's profile name, a participant's name as the participation carries it,
`last first` for an employee), never the name a slot prints, which goes only in the signature's
appearance and reason, and the account id (the `serialNumber` attribute), with key usage
`digitalSignature` and `nonRepudiation` and a random serial. `identityFor` reissues an identity
only when it has expired, expires within 30 days, or was made under an authority or a
key-encryption key since replaced; the store supersedes the old row and inserts the new one, so
the identities are a history and the certificate an old signature names stays. A signature keeps
its certificate's serial in its evidence. `signWithIdentity` signs the signer container's
`toSign` as raw r‖s, after `checkToSign` (`src/lib/signed-attributes.ts`) has read those bytes as
CMS signed attributes and found their `messageDigest` equal to the SHA-256 of the prepared PDF
outside its newest `/ByteRange` hole and their `signingCertificateV2` naming the identity's
certificate; anything else is refused with `503 signer_unavailable` and nothing is signed.
`src/lib/x509.ts` is the only importer of `@peculiar/x509`, whose dependency needs
`reflect-metadata` loaded first. `src/modules/signing/identities.ts` keeps the identities in
`signing_identities` with the secret key.

**The signer's refusals.** A 4xx of the signer container crosses the binding as
`signer_failed:<code>`; `createSigner` passes `already_signed`, `locked_field`, `unknown_fields`
and `cannot_certify` on as `409` with that reason, and any other code as `409 signer_refused`; a
signer that cannot be reached or fails is `503 signer_unavailable`.

**The signing code.** `src/modules/signing/signing-sessions.ts`: six digits, its SHA-256 salted
with the session id kept in `signing_sessions` and the code never, ten minutes, three attempts
counted with a compare-and-set, one code per account a minute decided by the database
(`create_signing_session`, which answers the seconds to wait), sent by `sendSigningCode` of the
mail or SMS Worker. A code that could not be sent removes its session and answers `503` with
`signing_code_not_sent`. A session records the `place` it was asked for in and, in the portal, the
participation; the code is typed in the same place for the same participation, else `404
signing_session_not_found`.

**The signing session.** `src/modules/signing/session-signing.ts`. `POST …/signing-sessions`
takes `{ requestIds, agreementEmployeeIds? }`, at least one item, at most 30 in all, each once.
Every request must be `pending` and addressed to the caller, in the portal under the
participation's client, in the app in the membership's organization and never a trainee's (which
is signed in the portal), read as the caller. In the portal, `agreementEmployeeIds` takes, per
agreement, the participant's own while it awaits the employee (as the employee, even for an
administrator who is that employee), and for a client administrator any of the client's that awaits
the employer; the member's route refuses any with `422 agreement_signed_in_portal`. Anything else
answers `404 signing_item_not_found` with the item in `issues`, before a code is sent. Each
agreement item keeps the digest of what the signer is shown: the employee's of the agreement's
template and merge data, the employer's of the stored file the employee signed. The code goes
where `signerContact` says, the email whenever there is one, else the phone (`409
signer_has_no_address` with neither), and the answer masks it in `addressHint` (`i***@example.ro`,
`+40 7** *** *12`). The items, the agreements first and then the requests in the order given, go
into `signing_session_items` with the secret key before the code leaves, so a code never goes out
for a session without them. `code_rate_limited` (`409`) and `signing_code_not_sent` (`503`) are
the code's, above; without the three signing secrets both routes answer `503
signing_unavailable` before a code is sent or spent.

`POST …/signing-sessions/{sessionId}/sign` with `{ code }` first checks that the authority, the
signer and the converter are there (`503` with `signing_unavailable`, `signer_unavailable` or
`pdf_unavailable`, the code not spent), then verifies the code (`404 signing_session_not_found`
for another account's session or one asked for elsewhere, `409` with the code's reasons), which
spends the session, then signs each item in turn with the secret key, none of it tied to the
request's abort signal, so that a signature the signer has made reaches its evidence; one that
fails is reported and the others go on. For a request: the request is read again and skipped as
`request_not_pending` unless it is still pending and the caller's, and as `client_archived` under
an archived client, before the sheet is touched; the signer's identity is `identityFor(account,
the account's own name)`; `placeRecord` gives the record its row, and `applySignature` signs the
slot on it under the name and function the slot prints, the moment taken inside the sheet's write
so that a write retried after losing a race signs at its own moment; the `training_signatures` row
goes in right after, with the session's channel and address, the moment, both digests, the
certificate's serial, the request's client address (`CF-Connecting-IP`, dropped when it is not an
IP address) and user agent, and the database's checks on it make the request `signed` in the same
write or refuse it (`request_not_pending`, `signer_not_of_client` when the signer has lost their
standing). A test sheet's request goes the same way, in the same session as the records'
(`signTestSheetRequest`): the sheet is read with its employee, its result's examiner and its
client (`client_archived` before it is touched), `applyTestSheetSignature` signs the slot's field
under the name the sheet prints (the employee's `last first`, or the result's examiner), and the
`test_sheet_signatures` row goes in with the same evidence, which the database checks as a
record's. The answer is `{ signed: [{ requestId, agreementState }], failed: [{ requestId, reason
}], agreements: [{ employeeId, party, signed, reason, agreementState }] }`. `agreementState` is
the trainee's agreement after the session: a record is signed whatever it is (ADR 023), and the
screen keeps warning. The failure reasons are `request_not_pending`, `agreement_not_awaiting`,
`agreement_changed`, `missing_document_data`, `client_archived`, `signer_not_of_client`,
`sheet_busy`, `slot_not_on_sheet` (the fire-safety sheet's verifier and admitter),
`missing_sheet_data`, `row_locked`, the signer's `already_signed`, `locked_field`,
`unknown_fields`, `cannot_certify` and `signer_refused`, `signer_unavailable`, `pdf_unavailable`,
`template_missing`, and `signing_failed` for anything else, which is logged. A signature whose
evidence cannot be written after the sheet took it leaves its field spent and its request as the
database left it; only a void moves the record to a new row.

**The signed sheet's rows.** A sheet is drawn up at the first signature of an employee in a
domain: the records from paper are printed as text in the first rows, as before, and every other
record of the domain then takes the next rows as filled fields, the hiring blocks going to the
newest training of each phase; a record nobody is asked to sign electronically prints _semnat pe
hârtie_ in its note. A record of an employee with a sheet takes its row when a training is saved,
or at its first signature. A row is filled again, when the values it was last filled with
(`filled_digest`) differ from the record's, only while no live electronic signature made since
the row was taken holds it; the signer refuses to fill a field a signature locks
(`locked_field`), which is taken as the row filled when another write filled it with these values
meanwhile, else refused as `row_locked`. A row is voided and the record takes a new one when all
its electronic signatures were voided (the database does this on a void; `placeRecord` heals a
row it finds so), or when the record's training changed domain or phase. A voided row's note gets
_anulat_ with the sheet's next write, whatever that write is.

**The signing agreement, signed.** The agreement's template has two signature cells, content
controls named `sig_employer` and `sig_employee` that LibreOffice exports as text fields named
by their tooltip, as on the sheets, and beside each a "Data:" field, `date_employer` and
`date_employee`, which `fillFields` writes the day of that party's signature into just before
it is given (a paper copy keeps them blank). The employee signs first: the agreement is drawn up
as on demand, its digest compared with the one the session item kept (`agreement_changed` when
it differs), converted with `convertForm`, the two fields made signature fields by
`prepareSheet`, and `sig_employee` signed with `certify: true` and nothing locked; the file is stored at
`signing-agreements/{clientId}/{employeeId}/v1-{nonce}.pdf` in the documents bucket and the
`agreement_signatures` row written with it as `storage_path`, which moves the agreement on in the
database. The administrator then signs `sig_employer` on that file, whose digest must match the
employee's evidence and the session item, without certifying, into `v2-{nonce}.pdf`; the evidence
makes the agreement `signed_electronically`. Each party's appearance prints the participation's
name; the certificate names the account. The database's checks on the evidence settle two sessions
racing for one signature and a signer who is not the party: the loser removes its file and
reports `agreement_not_awaiting`. The agreement routes of members, the employee and the
administrator answer the stored file once it exists, else the on-demand render.
`GET …/employees/signing-agreements` lists for the administrator the agreements awaiting the
employer (`awaitingEmployer`) and then those signed electronically, by name, each with the
agreement state.

`pnpm --filter @ssm-usor/api signing:check:local`, with `GOTENBERG_URL` and `SIGNER_URL` set,
runs all of it on the local stack over HTTP: it starts `scripts/e2e-server.ts` on port 8797
with a throwaway authority, whose mailbox holds the codes, makes a member, an employee
participant and a client administrator, records a training with signers, signs it in the three
places with the agreement, validates the stored sheet and agreement with the signer against the
throwaway authority as the trust root, then voids the record, corrects the training and signs it
again on a new row beside the old one marked _anulat_, validates the sheet's six signatures,
prints the evidence and removes everything, the evidence included, as the local database's
superuser.

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
more of `workplace_manager`, `first_aid`, `risk_evaluation_team`, `imminent_danger`,
`workers_representative`, `fire_safety_coordinator` and `fire_intervention_leader`, and
optionally an `employeeId`: an employee of another client is `400` with the issue on
`employeeId`, and an employee who already is a responsible person of the client is `409`. Its
optional `workplaceId` ties it to one workplace, and null means every workplace; anything but
an active workplace of the client is `400` with the issue on `workplaceId`. A workplace also
carries the fire-safety facts of [ADR 018](architecture/adr-018-fire-safety-means.md), all
optional: `activity`, `floorAreaM2`, `extinguisherNorm`, `assemblyPoint`,
`combustibleMaterials`, `ignitionSources`, `fireRiskEquipment` and `specificMeasures`; the
`PUT` clears those left out, as it does the address. Its `kind` is `fixed_space`, the default
when left out, or `mobile_site`, and `extinguisherNorm` may be `none` beside the five rows of
annex 6. A mobile site keeps an area and a norm it is sent, which the fire-safety set neither
asks for nor prints.

The `fire-safety` module holds the rest of the fire-safety set's client data (ADR 018).
`GET …/fire-safety` answers with every field null, `wasteKinds` empty and `exists` false until
the first `PUT` creates the row; the app then opens the form on its starting values (two hours,
three months for both categories, and the occupational safety schedule's first month and days),
which `fireSafetyStartingValues` names. The `PUT` replaces the whole set like the details above,
with OMAI 712/2005's bounds: two to eight hours, one to six months for each category, the days
in order, at most twelve distinct kinds of waste of up to 240 characters each, and
`wasteCollectors` up to 160 characters (ADR 018, amended); `hasThirdParties` left out is false
(ADR 019, amended). `smokingPlace` (up to 240 characters) is kept
only when `smokingPolicy` is `designated_places`; with the other policy or none the `PUT` stores
it as null rather than refusing it, so a switch to `forbidden_everywhere` saves the card in one
request and clears the place (ADR 019). Equipment and installations are one row per
unit, each on a workplace in `workplaceId`, which must be an active workplace of the client
(`400` with the issue on `workplaceId`); `PUT` may move one to another. An extinguisher needs
`agent` and `capacity` and is the only kind that may be `wheeled`, and an installation of the
kind `other` needs a `description`, all `400` before the database is asked. `DELETE` removes the
row. The dangerous substances (ADR 018, amended 2026-10-11) belong to no workplace: a name, a
CLP classification and a quantity, required, and eight optional texts copied from the safety data
sheet, which a `PUT` clears when left out. `GET …/fire-substances` answers `state` `undecided`
while the client has not said, or has no fire-safety row. `PUT …/fire-substances/state` saves it,
creating the row when there is none without counting as the card's first save; `none` while the
client has entries is `409` with the reason `substances_listed`, and a new entry under any state
but `listed` is `409` with `substances_not_listed`. Entries keep the order they were added in.
The free rows of the maintenance and check schedules (`fire-maintenance-items`, ADR 018, amended
2026-10-11) sit on a workplace like the units, with the same `workplaceId` checks, and carry three
required texts: `subject` (2 to 160), `intervalLabel` (2 to 60, printed as typed) and `checkedBy`
(2 to 160). They are optional: no readiness code asks for them.
The building of a fixed-space workplace (`fire-buildings`, ADR 020) is keyed by the workplace in
the path: `PUT` replaces every fact, a fact left out or null is cleared, and creates the row the
first time; a workplace that is not an active one of the client is `404`, a mobile site `409`
with no reason. Every fact is optional (`yearBuilt` 1800 to the current year, `builtAreaM2` above
0, `levels`, `classification` of `civil`, `production`, `storage`, `mixed`, `structure`,
`heatingFuel`, `gasUse`, `electricalMaintainer`, `electricalLastCheckOn`, `waterReserveM3` 0 or
more, `notes`), and no readiness code asks for any. The list leaves out a building kept from
when its workplace was a fixed space.
Under an archived client or a lead, every write is `409` with the reason `client_archived`
or `client_is_lead`.

`PATCH /me/profile` also takes `professionalTitle`: left out it stays, `null` clears it.
`GET /organization/members` returns it for each member.

## Generated documents

The `documents` module generates a client's documentation from the built-in Word templates
([ADR 005](architecture/adr-005-document-generation.md), [the document engine](document-engine.md)).

A client has two documentation sets ([ADR 016](architecture/adr-016-fire-safety-documents.md)):
the occupational safety set and the fire-safety set. Readiness, the list and generation take
`set=occupational_safety|fire_safety` in the query, the occupational safety one when left out,
and answer for that set alone: one set's missing data never blocks the other, and generating
one never creates documents of the other. A document says its set by its `document_group`
(`documentation_set` or `fire_safety_set`), and a generation records the set it ran for, so
`lastGeneration` is the set's own. The routes of one document (regenerate, issue, draft,
file, print, download, signed copy, upload) work the same in both sets. What follows describes
the occupational safety set unless it says otherwise.

`GET …/documents/readiness` lists what is missing as codes grouped by where it is filled in:
`provider.*`, `specialist.*` (the caller's own profile), `client.representativeName`,
`client.representativeRole`, `client.trainingSchedule`, `responsible.<role>` for every
role nobody holds, `positions.any` for a client without a current position,
`positions.equipment` while a position is undecided about its protective equipment
([ADR 011](architecture/adr-011-protective-equipment.md)), and `positions.instructions` while
one is undecided about the instruction modules it applies
([ADR 012](architecture/adr-012-own-instructions.md)); `undecidedJobPositions` names those,
so the form can send someone to each. The risk evaluations
([ADR 015](architecture/adr-015-risk-assessment.md)) add four: `positions.risk_evaluation`
while a current position has no evaluation or one without a factor,
`risk_evaluations.sensitive_groups` while the client has neither evaluated the sensitive groups
with a factor nor declared that it has no workers from them (`sensitiveGroupsState` `none`),
`risk_evaluations.measures` while an unacceptable factor (level above 3) has no prevention
measure, and `risk_evaluations.plan` while a factor with measures lacks its deadline or its
person responsible. `incompleteRiskEvaluations` names the evaluations behind them, each with
`evaluationId` (null for one not started), `kind`, `jobPositionId`, `name` and `missing`, a
list of `factors`, `measures` and `plan`. Generating the training themes again also needs an own
instructions revision to cite, `documents.own_instructions`
([ADR 014](architecture/adr-014-training-themes.md)); readiness never lists it, as generating
the set makes the own instructions first. `POST …/documents/generate` takes `issueDate` and `firstDecisionNumber`
(1 when left out) and is `409` with the reason `missing_document_data` until that list is empty,
`409` for an archived client, and `503` while no template of the set is registered
(`pnpm templates:register`). Readiness also returns `hints`, what generating would do better
with but does not wait for: `provider.riskEvaluator` while the organization has named no risk
evaluator, in which case decision 1.2 and the risk assessment name the caller as the
coordinator of the evaluation (ADR 015, amendment of 2026-10-22); the fire-safety set's hints
are empty.

The fire-safety set asks only what its documents print: `provider.legalName`,
`provider.fireSafetyTechnician` (the organization's fire-safety technician, by name, the same
code a service contract covering fire safety uses), `provider.fireSafetyTechnicianCertificate`
(the technician's certificate, which decision 5 prints; ADR 019), `client.representativeName`,
`client.representativeRole`, and the client data of its second and third stages (ADR 018,
ADR 019): `fire.trainingSchedule` (the duration, both intervals, the first month and both days
of the "Instruire PSI" card), `fire.smokingPolicy` (a smoking rule chosen; the place never),
`fire.waste` (at least one kind), `responsible.workplace_manager`,
`responsible.fire_safety_coordinator`, `responsible.fire_intervention_leader`,
`positions.any`, `fire.instructions` (a current position undecided about the fire-safety
instruction modules, ADR 012's amendment of 2026-10-11; the occupational safety set's
`positions.instructions` is about the other domain and never blocks this set),
`fire.workplaces` (an active workplace at least, each with its activity,
assembly point and the three texts of the posted sheet, and a fixed space with its area and
its norm, which may be `none`), `fire.equipment` (an
extinguisher in every active workplace) and `fire.substances` (the substances state `none`, or
`listed` with an entry; ADR 018, amended). Any of them refuses the whole set. Its readiness lists
nothing else; its `undecidedJobPositions` names the positions behind `fire.instructions`, each
with `undecided: ['fire_instructions']`, and its `incompleteRiskEvaluations` and
`workersRepresentativeClash` are empty. Generating the fire-safety themes 3.1 again also needs
an IPSU revision whose annexes they cite, `documents.fire_own_instructions`, which readiness
never lists, as generating the set makes the IPSU before the themes (ADR 012, amendment of
2026-10-11). Its generation requires `firstDecisionNumber`, at most
9991 so that the binder's ninth decision still fits in four digits, and is `400`
(`validation_error`, the issue on `firstDecisionNumber`) without it. Each fire-safety decision
keeps its place in the binder (`fireDecisionOrdinals`, 1 to 9, each decision's
number printed in `fire` before its template exists) and is numbered the first number plus that
ordinal minus one; its `decisionNumber` says so, and a
decision generated again keeps it. The two decisions required only from ten employees come last
(ADR 020): 1 organization, 2 training, 3 open fire, 4 smoking, 5 technician, 6 instructions, 7
waste, 8 seasons, 9 control. Under 10 current employees (`currentEmployeeCount`, the same count
as decision 1.5's) `fire_decision_seasons`, `fire_decision_control`,
`fire_maintenance_schedules`, `fire_installation_register`, `fire_site_sheet` and
`fire_annual_report` (`fireSafetyTypeKeysFromTenEmployees`) are not generated and the
list names them under `notApplicable`; one that exists stays in the list and in the set, and
generating it again works as for any document. No readiness code belongs to them alone, so the
readiness is the same either side of ten. Its templates are merged with a context of their own,
`client`, `provider`, `fireSafetyTechnician` (`name`, `certificate`, `authorization`),
`issueDate`, `branding`, `fire`, and `seasonsDecision`, `controlDecision` and
`installationRegister`, whether the set holds each of those three (from ten employees, or once
it exists): covers 1.0 and 6.0 list only what the set holds, and decision 6 cites decision 9
only then. `annexes` and `noAnnexes` are what the own instructions 2.1 annex: the `psi` modules
the current positions apply, each once, by group, title and id, numbered from 1, as the other
set's `annexes` holds its `ssm` ones; only 2.1 prints them, so an edit in the library marks
only its draft. Issuing 2.1 merges, like 3.2, an annex title page before each annexed module
version into one PDF, the fire-safety page naming the technician in its box. It is
never merged with the occupational safety set's names, so an edit to positions or equipment never
marks a fire-safety draft; renaming a post, which decision 2 prints in `fire.staff`, does.

**Dated types** ([ADR 020](architecture/adr-020-fire-safety-from-ten-employees.md)). A type in
`datedDocumentTypeKeys`, today only `fire_annual_report`, is held once per client and
**period**, a year, instead of once per client; every document carries `period`, the year for
a dated one and null for the rest. The generation's optional `period` (2000 to 2100) is the
year its dated types are made for, the current year in Romania when left out: a dated type
with no document of that year gets one, beside the documents of other years, and one of that
year is left alone and listed under `skipped`, like any document that exists. The other types
ignore it. A dated document is merged after the rest of the run, from the facts read again,
because it reports on the set: the annual report states every document of the set with its
revisions. Its data is the set's context with `fire.annualReport` for its year; every other
document's `fire` has no `annualReport`, so issuing a document marks only the report's draft as
changed, not the whole set's. Generating a dated document again keeps its period. The list
returns a dated type once per period, the newest first; the upload takes `?period=` to name
the year's document, the newest when left out; a download's file name carries the year.

Generating creates every document type the client does not have yet as revision 1, in draft:
the row first, then the file at `<organization>/<client>/<document>/1.docx` in the private
`documents` bucket, because the storage policies only accept the file of a draft revision. If
the file cannot be stored the revision is taken back, so a second call finishes the job.
Documents that exist are left alone and returned under `skipped`; generating one document
again is its own action, since it discards what was edited by hand. Decisions are numbered
from the first number in the order training, evaluation team, first aid, imminent danger.
The training themes are made last, after every other document of the run, and cite the own
instructions revision the run just made; when the client's own instructions are an uploaded
file there is nothing to cite, and the themes are left out until the own instructions are
generated.

A revision names the template version it was generated from in `templateVersion`, with its
`version`, `kind` and `note` (ADR 017), or null for an uploaded file; a draft started from an
issued revision keeps that revision's.

Each revision keeps the part of the data its template printed. The list compares it with the
stored facts and sets `dataChanged` on a draft that would now print differently: a new
first-aider marks the first aid decision, not the whole set. While data is missing there is
nothing to compare with: a draft is marked when the gap is in what it prints (a position
without an evaluation marks the risk assessment, the prevention plan and the training
material; a gap in the provider's or the client's details marks every draft), and otherwise
waits until the data is complete. All files go through
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

`GET /clients/{clientId}/documents/archive?set=&format=docx|pdf` answers one set as a zip,
built in the Worker from Storage with `fflate` (stored, not deflated: Word files and PDFs are
compressed already; names carry the UTF-8 flag, so diacritics survive Windows and macOS). Each
document is a file numbered in the set's order. `docx` takes the issued revision, or the draft
while nothing is issued (named "ciornă"), plus the own instructions' annexed module versions as
files of their own; `pdf` takes only the PDFs made at issuing, which already hold the annexes.
`409` with the reason `nothing_to_archive` when no document qualifies. The archive's name is in
`Content-Disposition`, which CORS exposes so the SPA can save it under that name.

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
the same checks. `typeKey` is a built-in type of either set, `documentTypeKeys` or
`fireSafetyDocumentTypeKeys`, and the document is looked for in that type's set. The file replaces the draft, or starts the next draft beside the issued revision,
keeping the generation and so the date. An uploaded revision has no template and no data
snapshot, so it never reports `dataChanged`. For a dated type, `?period=` names the year's
document, the newest when left out. A document that does not exist yet answers `409`
with the reason `not_generated_yet`: its number and date come from a generation. Issuing, deleting the draft,
downloading and the editor work on an uploaded document as on any other.

The whole set, 18 documents, merges and uploads in under a second against the local stack,
inside `workerd` as well as in Node.

### Documents behind, and regenerating them for every client

A document is **behind** when its newest revision was generated from a template version older
than a `legal` or `correction` version of the same template
([ADR 017](architecture/adr-017-legislation-monitoring.md)). A `layout` version alone prompts
nothing, an uploaded file is never behind, and a hand edit changes nothing about it. The own
instructions and the training themes of either set are also behind when the library holds a
newer version of an instruction module their newest revision was built from, when a current
position of the client applies a module it does not cite, or when no current position applies
a module it cites ([ADR 014](architecture/adr-014-training-themes.md), amendment of
2026-10-22): an issued revision is frozen and never "Date modificate", so this is what tells
someone the themes went stale after issuing. Only active clients count (not archived, not
leads), and the service contract never does: its data comes from its own page. Of a dated type
only the client's newest period counts (ADR 020): an earlier year's report is what was written
for that year. The database view `documents_behind` decides it, under the caller's policies.

`GET /documents/behind` lists the organization's documents behind by type, in the pack's
order: the template's `title`, its `newestVersion` (`version`, `kind`, `note`), the
`runningJobId` of a regeneration of that type still under way, or null, and the `clients`
behind, by name, each with its `documentId`, the `version` its newest revision came from,
`editedDraft` when that revision is a draft edited by hand, `behindTemplate`, and
`instructionChanges`: per module, `module_version` with `newestVersionAt`, the date of the
library's newest version, `module_added` or `module_removed`, with the module's `title`; empty
for a document behind its template alone. A type nobody is behind on is left out. The themes
cite the newest own instructions revision, so regenerating 4.2 while 3.2 is itself behind
leaves 4.2 behind: the app says to regenerate the own instructions first.

`POST /documents/behind/regenerate` takes `{ typeKey }`, a built-in type of either set, and
starts a **regeneration job**: one item per client behind, read with the caller's token, and
one message per client on the Cloudflare Queue `ssm-usor-regeneration`, which the API Worker
also consumes. It answers `201` with the job, every client `queued`; `409` with the reason
`nothing_behind` when no client is behind, and with `regeneration_running` while a job of the
same type is under way (a job unfinished after an hour no longer counts: the next one closes it
and fails the clients it left queued); `503` where no queue is bound or the messages could not
be sent, in which case the job is taken back. `GET /documents/regeneration-jobs/{jobId}`
returns the job with `total`, `done`, `skipped` and `failed`, `finishedAt` once no client is
queued, and the `items`, by client name, each with its `status` and, when skipped or failed, a
`detail` in Romanian.

The consumer (`queue` in `src/index.ts`, `modules/documents/regeneration-queue.ts`) handles one
client per message, with the secret key, since nobody is signed in. It asks again whether the
document is behind: one regenerated since is `skipped` as no longer behind, which also covers a
message delivered twice, and an item that is no longer `queued` is not touched again. A draft
edited by hand is `skipped`, because regenerating would discard the edits; the specialist does
those one at a time. Everything else goes through the same `regenerateDocument` as
`POST /documents/{documentId}/regenerate`, as the member who started the job: a draft is
overwritten, and an issued document gets a new draft and stays in force until someone issues
it, client by client. Missing data or a refused document fails the item at once; an unreachable
database or Storage is retried, 30 seconds apart, and fails the item on the last delivery.
Without the secret key there is nothing to read with, and the queue retries.

## Imports from documents

An **import** ([ADR 030](architecture/adr-030-import-from-documents.md)) turns a client's files
into a **proposal** a member reviews and confirms; nothing under a client is written before.
Only the client import is built; the employee import comes later. The module is
`modules/imports`: the routes, `payload.ts` (the proposal and the changes as
`apply_client_import` takes them), `pipeline.ts` (the queue's steps), `queue.ts` (the consumer)
and `cleanup.ts` (the cron). The tables, the bucket and the functions are in the
[data model](data-model.md#imports-from-documents); the proposal's schema, the prompts, the
sorting, the checks and the gateway client are `packages/import`.

Members read imports through their own policies. The API writes the rows with the secret key,
after finding the import under the caller's token; saving, abandoning, splitting and
confirming go through the database's own functions as the caller. Creating, starting and splitting an import
answer `503` with the reason `import_unavailable` unless `AI_GATEWAY_URL`, `AI_GATEWAY_TOKEN`,
the extractor (`EXTRACTOR` with `PDF_CONVERSION=service`, or `EXTRACTOR_URL`) and the
`IMPORT_QUEUE` binding are all there ([deployment](deployment.md#the-same-gateway-for-imports-from-documents)).

### Uploading and starting

`POST /imports` creates the import, for a new client or for `clientId`, an active client that is
not a lead (`409` with `client_archived` or `client_is_lead`). `POST /imports/{importId}/files`
registers `{ files: [{ uploadPath, mimeType, sizeBytes, sha256 }] }`: the path inside the upload
with its folders, whose last part is the name. A path climbing out (`..`) or an extension that is
not the type's is `400` (`import_type_mismatch`), a path twice `409` (`import_duplicate_path`),
more than 150 files or 100 MiB `422` (`import_too_large`). The answer gives each file's `id`, the
bucket `imports` and the `storagePath`: the browser uploads the bytes there itself, with its own
Supabase session, which the bucket's policy accepts for that path while the file and the import
are `uploading`. The bytes never pass through the Worker. Registering can be repeated in
batches.

`POST /imports/{importId}/start` lists the import's folder in Storage, drops the rows whose
object never arrived or is not the size the browser declared (removing that object, since the
caps counted the declared sizes), marks the others `uploaded`, moves the import to `preparing` and sends one
`prepare` message per file. Nothing arrived is `422` (`import_empty`); a started import `409`
(`import_not_uploading`). When the messages cannot be sent the import goes back to `uploading`
and the answer is `503`.

### The queue

`ssm-usor-import` (`-non-prod` in non-prod) is sent to and consumed by the API Worker, which
tells it from the regeneration queue by its name. The consumer takes one message per invocation,
at most ten at once. Every step reads the import first and does nothing unless the import is at
that step and the file is in the state the step expects, so a message delivered twice does no
harm. A step that moves the import on and sends the next message takes the move back when the
send fails, so the retried delivery moves on again.

| Message          | Step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare` (file) | Reads the original; one whose size is not the declared one fails, its real size recorded, and a real size past the caps (`IMP05`) fails the import. A `.docx` is rendered to text (`docxToText`); a `.doc` is converted by the extractor and its `.docx` kept as the derived file; a PDF's pages are taken with `pdfText`, scans marked; a HEIC photograph is converted to the JPEG kept as the derived file, while JPEG and PNG stay as uploaded. The text goes to `<id>.txt`, the pages to `<id>.json` (a photograph is one scanned page). The stored bytes' hash replaces what the browser declared. When no file is left `uploaded`, the import moves to `sorting`. |
| `sort` (import)  | One GPT-6 Luna request with the first 3,000 characters of every file that has text, then `sortFiles` with the organization as the provider and, for an existing client, the client. Each file gets its kind and company: read, set aside with a reason, kept for the employee import, or another company's. The company most files name is recorded on the import. The characters to read are recorded on the import (`read_characters`) before it fails past 600,000 of them or 150 scanned pages. Moves to `reading`, sending one `scan` per file with scanned pages and one `read`.                                                                                  |
| `scan` (file)    | A photograph or a PDF with no text is first sorted from its first page as an image (Luna); a training sheet is kept for the employee import, a cover or blank form set aside. Then one `scan` message per batch of five scanned pages, each a GPT-6.1 Terra request per page (`pdfPageImage`) or photograph, each reading kept in `<id>.page-<n>.json` as it comes, so a retry pays only for what is left. The batch that finds every page read gathers the readings into the file's `.json` and the file becomes `read`. Each step and batch first claims `<id>.scan.json` or `<id>.scan-<first page>.json`, created only when absent, so one sent twice is read once. |
| `read` (import)  | Comes back every 10 seconds while a scan is unfinished, and gives up after half an hour in which no scanned page was read. Then one Terra request with the text of every file read, and `toProposal` joins it with the scans' readings. Moves to `checking` with that proposal.                                                                                                                                                                                                                                                                                                                                                                                         |
| `check` (import) | `withChecks` against every file's text, and the proposal's CUIs confirmed with ANAF (`companies/anaf.ts`); what ANAF answered is kept beside the proposal as `registeredCompany`. Moves to `ready`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `copy` (import)  | After confirming: copies each file of the import folder from `imports` to `client-files` (`import_folder_copies`), an object already there counting as copied, then sets `files_copied_at`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Every model request carries `{ organizationId, importId }` as the gateway's metadata, and its
tokens and cost go to `record_import_usage` with its step (`sorting` for the pack and a scan's
first page, `scanning` for a scanned page, `reading` for the documents), on the file for a file's
own request; a request that failed is recorded with what it used. Each caps its output,
reasoning included (`max_completion_tokens`): 16,000 tokens for sorting a pack or a scan, 64,000
for reading the documents or a scanned page. An answer cut off at the cap fails at once, with
the reason an answer outside the schema gets. The provider the prompts name is the
organization's legal name and CUI, and its members', legal representative's, risk evaluator's and PSI
technician's names; an existing client's name and CUI are passed as well.

Failures follow the regeneration queue: an unreachable database, Storage or gateway (a dropped
connection, `429` or `5xx`) is retried after 30, 60 and 120 seconds, and the last of four
deliveries records the failure. An extractor that answered nothing usable (busy with other files,
unreachable or too slow, after apps/pdf tried once more) is not retried but sent again as a new
message, up to six times from one to fifteen minutes later, before its deliveries count down. A
message whose every delivery died unrecorded goes to `ssm-usor-import-dead-letter`, whose
consumer fails the file or the import. A refusal by the extractor, an unreadable Word file or a model
answer outside the schema twice fails at once. A file's failure marks the file `failed` with a
reason in Romanian and the import goes on without it; the failure of `sort`, `read` or `check`
marks the import `failed` with a reason. The copy is not failed: the clean-up copies again.

### Reviewing and confirming

`GET /imports/{importId}` returns the summary, the `files` with `state`, `documentKind`,
`reason`, the company and the page count, `progress` (`files`, `prepared`, `scans`,
`scansRead`), `otherCompanies` (by CUI or name, with their `fileIds`), and from `ready` on the
`proposal`, `registeredCompany`, the member's `changes`, the `version` and the `blockers`. The
proposal is null before `ready` and once dropped.

`usage` is a debugging aid, not a member's figure: the models' cost in dollars at list price
(`costUsd`), `inputTokens`, `cachedInputTokens` and `outputTokens` for the whole import, the
same four for each step that called a model in `bySteps` (`sorting`, `reading`, `scanning`), and
`readCharacters`, null until sorted, all as numbers, from the import's bookkeeping columns. It is
served when `ENVIRONMENT` is not `production` (non-prod and `wrangler dev`, where it is unset) and,
in production, only to a platform admin, an account whose `app_metadata.role` is `admin`, the
claim `is_platform_admin()` reads (`adminToolsAllowed`, which also guards `DELETE
/clients/{clientId}`); otherwise the field is absent ([deployment](deployment.md#the-same-gateway-for-imports-from-documents)).

`changes` holds what the member decided, by the proposal's paths. `fields` is keyed
`client.<name>`, `trainingSchedule.<name>` or `fireSafety.<name>`: `option` picks one of the
documents' values, `value` writes another (null leaves the field empty), `included` takes or
leaves a value only another company's passages give, and `replace`, into an existing client,
takes the documents' value over the app's. `items` is keyed by a list item's id (`workplace-2`):
`included`, `values` by the item's own field names, with `workplace`, `jobPosition` and
`employee` naming an item of the proposal or an existing row of the client, `existingId` for the
row a workplace or a position completes, and `replace`. `PUT /imports/{importId}/changes` saves
them on the version read (`save_import_changes`).

Besides the fields and lists the review shows, the proposal carries what the posted
fire-safety sheet and the list of means say of each workplace (`kind`, `floorAreaM2`,
`extinguisherNorm`, `assemblyPoint`, `combustibleMaterials`, `ignitionSources`,
`fireRiskEquipment`, `specificMeasures`), each with its own sources in the workplace's
`fieldSources`, and a post's `needsProtectiveEquipment` (null when the documents do not say).
A post's `staffCategory` and `activities` also carry their own sources in the post's
`fieldSources`, and each of a responsible person's `roles` its own in `roleSources`, by role
code, the person's `sources` giving the name; a role whose quote is not found is flagged on
`responsiblePersons.<i>.roles.<role>.sources.<n>`. A proposal stored before them reads them as
`{}`, and the review then shows the item's own passages.
A text value is proposed with its spelling corrected: sentence case for one written in capitals
(by code) and Romanian diacritics (by the reading model), for a workplace's `name`, `activity` and
fire-safety texts and its `rooms`, a post's `name`, `workZone` and `activities`, an equipment
entry's `item` and `risk`, a unit's `room`, `fireSafety.smokingPlace`, `wasteKinds` (a kind at a
time) and `wasteCollectors`, and `client.legalRepresentativeRole` (sentence case only); names of
people and companies, identifiers and addresses stay as written. Where the document writes the
value otherwise only in its capitals or diacritics, the document's spelling is kept beside it: in
the item's `spelling`, by field (`{ "name": "INGRIJITOR HOTEL" }`; never for a room of the
workplace, which confirming does not write), and in an option's `spelling`. It comes from the
quote, or is the value before its capitals were corrected when the quote does not hold it. The
member keeps it by writing it as their value. A proposal stored before it reads `spelling` as `{}`
on an item and without it on an option.
`fireSafety.wasteKinds` is one text, the kinds separated by semicolons, written as the list
`waste_kinds`; the yes-or-no fields `fireSafety.hasThirdParties` and
`trainingSchedule.administrativeTrainingNotApplicable` / `workerTrainingNotApplicable` are
`"true"` or `"false"`. A proposal stored before they were read reads them empty.

Without a change a value is the proposal's: a field with one value of the client's own documents
takes it, two or more of them are a **choice** that blocks, and a value only another company
gives is left out. A list item is taken unless only another company gives it. Into an existing
client, a workplace is matched to one of the client's by its name or its street, a position by
its name, an employee by the CNP or the name (and then not created again), and a responsible
person the client has already is left as it is; the client's filled values are kept unless
replaced. A responsible person is linked to the employee of the same name, the workers'
representative must be. The `blockers` are a choice not made, the new client's name or CUI
missing, a value the checks flagged that would be written unchanged (`invalid`), a staff
category given both an interval and "not applicable" (`invalid` on the latter), an employee
without a name, job title or hire date, equipment without a risk, inventory without a duration
(`missing` on `durationMonths`) or a consumable with one (`invalid` on it), as
`job_position_equipment` refuses, a person without a job title,
and a fire-safety unit, an installation or equipment whose workplace or position is unknown
(`unknown_reference`).

`POST /imports/{importId}/confirm` with `{ version }` maps the proposal and the changes onto
the payload, answers `422` with `import_incomplete` and the blockers as `issues` while any is
left, then calls `apply_client_import` as the member: `409` with `import_changed`,
`import_not_ready`, `import_other_company`, `import_client_exists` or `import_outdated` (a
workplace or position the review named is no longer the client's), and `422` with
`import_refused` when a table still refuses a value (a check or not-null violation the blockers
missed): one issue whose `path` is the proposal's list or group for that table (or the table)
and whose `message` is the constraint's name, never the refused values. A new client's VAT
registration is ANAF's. A post's decision that it needs no protective equipment goes into the
payload only while none of its entries is written, and a smoking place only beside designated
places, the policy the member chose or the client keeps, since `client_fire_safety` refuses a
place under another policy or none; a place left out never blocks. The payload's `quality` counts per section, without values, how many
values the member changed, unticked or kept. The answer is `{ clientId, fileCount }`, and a `copy`
message copies the folder afterwards. `GET /imports/{importId}/source?file=&quote=&near=` resolves
a source's `file`, an upload path or `<upload path> (pagina N)`, and answers five-minute links to
the original and the converted file, a Word file's text, a PDF's pages, and where the quote is
(`placeQuote`), on a page for a PDF, with the place of each part an ellipsis separates. A quote
found in several places, as an equipment row repeated in each post's table, is placed after the
closest preceding `near`, the post (or room) the app sends for the item, counted only as the whole
of a heading or a cell; without it, or when nothing precedes it, the first place. When no place
starts at a heading naming `near`, as for an entry the model gave for several posts, the quote's
last part is placed alone. A PDF's pages are searched as one text, as the model read them, and the
match is on the page of the last part, with only the parts on that page.

`POST /imports/{importId}/abandon` ends an import not yet confirmed (`abandon_import`).
`POST /imports/{importId}/split` with `{ fileIds }`, all `other_company` (else `422`,
`import_not_other_company`), creates a new import for a new client with `source_import_id` in
one transaction (`split_import`), then copies their objects within `imports` and starts it. Files
split once already into an import not abandoned are `409` (`import_already_split`), and so is an
import still sorting its files or abandoned (`import_ended`). The function locks the import, so
of two splits of the same files at once the second waits for the first and gets the `409`. If a
copy or the start fails, the API removes the objects it copied and deletes the new import, which
frees the files for another split; when the objects cannot be removed, it abandons the new import
instead, so the clean-up finds them by its file rows.
`POST /imports/{importId}/files/{fileId}/read` sends a `set_aside` file of a `ready` import back
to be read: the file becomes `read` (`prepared` with a scan message when it has scanned pages),
the import returns to `reading` with its proposal and changes dropped, its version moved on and
`read_characters` counted again with the file, and a `read` message reads every file again,
since the documents are read in one request. Item ids may change with the new reading, so
changes kept would point at the wrong items. `409` with `import_not_ready` or `import_changed`,
`422` with `import_file_not_set_aside`.

### The clean-up

The API Worker's `scheduled` handler runs daily (`41 2 * * *` in production, `11 3 * * *` in
non-prod). It copies again the folders of imports confirmed more than an hour ago whose copy did
not finish, then fails, with a reason for members, the imports idle six hours in a step of the
queue or 14 days uploading or ready (`fail_stalled_imports`). Objects go before the rows that
name them: for each import `list_abandoned_imports()` lists (abandoned or failed 14 days ago) it
removes the paths and the rest of the import's folder (a scan's page readings and claims), then
`delete_abandoned_imports` deletes only the imports whose objects went. Likewise
`drop_import_proposals()` (confirmed 30 days ago), `list_import_objects_to_remove()` (proposal
dropped, folder copied) and `mark_import_objects_removed`. An import whose removal failed is
listed again the next day.

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

The portal's one-time code by email ([ADR 022](architecture/adr-022-participants-and-the-portal.md))
comes through the same hook. `signInWithOtp` makes Supabase send a `magiclink` email whose
`token` is the code; the route hands the code, and no link, to `sendSignInCode`. While an address
is unconfirmed Supabase sends its `signup` confirmation instead, with the code as its `token`, and
a participant's account is created unconfirmed; a `signup` for an account whose `app_metadata`
has `participant: true` is therefore a sign-in code too, and every other `signup` stays the
registration's confirmation link. The code works for `otp_expiry`, the setting that also governs
the recovery link: an hour. Supabase sends at most 60 of these emails an hour for the whole
project (`[auth.rate_limit] email_sent` in `supabase/config.toml`, which `config push` does not
manage, so the deploy workflow sets it through the Management API; the default of 2 applied to
the hook too and silently dropped the third code of an hour on 2026-10-19). A
request past the cap is answered as if sent, and every new request invalidates the previous
code, sent or not.

### Supabase Auth SMS

Supabase Auth texts no one itself either: its Send SMS hook posts each code to
`POST /hooks/supabase/send-sms`, verified the same way with `SUPABASE_AUTH_SMS_HOOK_SECRET`, a
secret of its own, and the route hands the code to the SMS Worker's `sendSignInCode` over the
`SMS` binding ([SMS Worker](sms.md)). Supabase holds no Twilio credentials. The payload's
`sms.phone` (else `user.phone`) is E.164 without the `+`, which the route adds.

Supabase cannot have phone sign-in on and signup by phone off: `[auth.sms] enable_signup` is the
switch for phone sign-in as a whole, and `/otp` creates an account for any unknown number. The
route therefore texts only an account whose `app_metadata` has `participant: true`, which only
the API, with the secret key, can write when it creates or reuses an account for an invitation;
any other answers `403`, so a stranger's number costs nothing. It answers `503` while the secret
or the `SMS` binding is missing and `500` when the Worker fails.

Declared in `supabase/config.toml` and pushed by CI: phone sign-in on, phone confirmation on, one
code per number per minute, the hook, and a cap of 100 SMS an hour for the project. Three
settings the file cannot hold are set by the configuration job through the Management API after
the push: the code's expiry, 10 minutes (`sms_otp_exp`, which `SMS_OTP_EXPIRY_MINUTES` in the
auth-hooks module repeats to the reader), `sms_autoconfirm` off, because the CLI pushes
`enable_confirmations` inverted ([supabase/cli#6997](https://github.com/supabase/cli/issues/6997)),
and the cap of 60 auth emails an hour (`rate_limit_email_sent`, which `config push` declares
unmanaged); `[remotes.production.auth.sms]` compensates so the push itself does not flip the
confirmation. Locally the
code works 100 minutes, which the CLI fixes. Nothing has to be clicked in the dashboard. After
the first deployment, check that **Authentication → Sign In / Providers → Phone** is on with the
Send SMS hook as its provider and phone confirmations on; if the push is refused for want of an
SMS provider, switch the phone provider on there once with the hook selected and re-run the job.

The hook itself, the password rules, and closed signup are declared in `supabase/config.toml`
and applied to the hosted project by CI; see [CI/CD](ci-cd.md).

## Source layout

```text
src/
  index.ts             the Worker: the app's fetch, the consumers of the regeneration and import queues, and the cron
  app.ts               cross-cutting: headers, CORS, module mounting, OpenAPI document, errors
  router.ts            createRouter(): an OpenAPIHono with the shared validation error hook
  lib/                 auth, db, admin-db, tokens, turnstile, env, errors, membership, participant, shared OpenAPI pieces
  modules/<domain>/    routes.ts (OpenAPI route definitions), handlers.ts, index.ts (router), tests
```

Each domain module exports one router built with `createRouter()` and registers its own
routes and handlers; `app.ts` mounts it with `app.route('/', …)`, which also merges its OpenAPI
definitions. Add a new domain by adding a folder under `modules` and one mount line. The [OpenAPI/Orval pipeline](api-client.md)
generates the SPA’s TanStack Query client used by the dashboard to call `/me`.

## Errors and CORS

All responses use `Cache-Control: no-store`. Errors share `{ "error": "…", "message": "…" }`,
with an optional `reason` where one status covers cases the client words differently:

| Status | Error                 | Meaning                                                                                                                                                    |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `validation_error`    | Invalid body or query; `issues` lists field paths and messages.                                                                                            |
| `401`  | `unauthorized`        | Missing, invalid, expired, or rejected bearer token; anonymous users are rejected too.                                                                     |
| `403`  | `forbidden`           | No organization membership, not an owner where one is required, a read-only organization (`reason: read_only`), or the database policy rejected the write. |
| `404`  | `not_found`           | No matching route, no company registered with the CUI, or no such client, employee, workplace, or responsible person.                                      |
| `409`  | `conflict`            | Duplicate CUI, CNP, or employee number, an employee added to an archived client, or an invitation conflict.                                                |
| `422`  | `unprocessable`       | A well-formed request the data refuses, such as a signer who cannot sign the slot.                                                                         |
| `503`  | `service_unavailable` | Missing/invalid Supabase configuration, timeout, rate limit, or authentication service failure.                                                            |
| `500`  | `internal_error`      | Unexpected API failure.                                                                                                                                    |

Upstream error details are not returned to callers; database failures are logged by context
and code only, and a broken unique, foreign key, check or not-null constraint also by its name,
which quotes no values. Authentication failures include `WWW-Authenticate: Bearer`.

Every response carries `Server-Timing`: `total` for the whole request, and `auth` and
`membership` for the token and membership checks that run before a handler, or
`participations` for the portal's. What is left of
`total` is the handler, which is mostly its database reads. The browser's network tab shows the
values under a request's timing.

`CORS_ORIGINS` is a comma-separated list of exact browser origins for every route except
`/waitlist`, which allows only `MARKETING_ORIGIN`. Production allows the app and the portal,
`https://app.ssmusor.ro` and `https://portal.ssmusor.ro`; `.dev.vars` allows the local Vite
origins of both, ports 5173 and 5174, instead. `PORTAL_ORIGIN` is the portal's address that
participant invitations link to, `https://portal.ssmusor.ro` in `wrangler.jsonc` and
`http://localhost:5174` locally. OPTIONS preflight
does not require authentication and allows GET, POST, PATCH, and DELETE requests with Authorization/Content-Type headers.
Cookie credentials are not enabled. CORS controls browser access to responses; bearer
authentication still applies independently, including to non-browser clients.

## Deployment and verification

`apps/api/wrangler.jsonc` declares the `ssm-usor-api` Worker at `api.ssmusor.ro`, its
production origins, and the service bindings to `ssm-usor-mail` and `ssm-usor-sms`, which therefore deploy first. The **CI** workflow supplies the public Supabase bindings and deploys
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
