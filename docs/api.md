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
| `GET /clients/{clientId}/files`                                        | Verified user with a membership       | `{ "items": [ … ] }`, the files the caller can see, newest first; not paginated; `?employeeId=` for one employee's        |
| `POST /clients/{clientId}/files`                                       | Verified user with a membership       | `201 { "file": { … } }` from the bytes in the body; `?fileName=&name=&note=&ownersOnly=&employeeId=`                      |
| `PATCH /clients/{clientId}/files/{fileId}`                             | Uploader or owner                     | `{ "file": { … } }` after renaming or annotating it                                                                       |
| `PUT /clients/{clientId}/files/{fileId}/owners-only`                   | Owner                                 | `{ "file": { … } }` after keeping it for owners or opening it to the team                                                 |
| `GET /clients/{clientId}/files/{fileId}/download`                      | Verified user with a membership       | `{ "url", "fileName", "disposition", "expiresInSeconds" }`, a link valid for a minute                                     |
| `DELETE /clients/{clientId}/files/{fileId}`                            | Uploader or owner                     | `204` after deleting the stored file and the row                                                                          |
| `GET /files/download`                                                  | Public, by signed Storage link        | The file behind `?source=`, named `?name=`; `?disposition=inline` shows a PDF, a JPEG or a PNG                            |
| `GET /organization/company-details`                                    | Verified user with a membership       | `{ "companyDetails": { … } }`: what documents print about the provider as a company                                       |
| `PUT /organization/company-details`                                    | Owner                                 | The company details after replacing them                                                                                  |
| `GET /organization/authorizations`                                     | Verified user with a membership       | `{ "authorizations": { … } }`: the certificate of authorization, the fire-safety technician and authorization             |
| `PUT /organization/authorizations`                                     | Owner                                 | The authorizations after replacing them                                                                                   |
| `GET /legislation/acts`                                                | Verified user with a membership       | `{ "items": [ … ] }`, the watched acts by name with what the portal showed; not paginated                                 |
| `GET /legislation/changes`                                             | Verified user with a membership       | `{ "items": [ … ] }`, legal changes newest first, each with its `act`; not paginated                                      |
| `GET /legislation/runs/latest`                                         | Verified user with a membership       | `{ "run": { … } }`, the run of the daily check that started last, or `{ "run": null }`                                    |
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
| `GET /clients/{clientId}/fire-safety`                                  | Verified user with a membership       | `{ "fireSafety": { … }, "exists" }`: the fire-safety training schedule, smoking rule and waste                            |
| `PUT /clients/{clientId}/fire-safety`                                  | Verified user with a membership       | The same after replacing them; the first save creates them                                                                |
| `GET /clients/{clientId}/fire-equipment`                               | Verified user with a membership       | `{ "items": [ … ] }` on active workplaces, by workplace, kind, agent, capacity and label                                  |
| `POST /clients/{clientId}/fire-equipment`                              | Verified user with a membership       | `201 { "equipment": { … } }`                                                                                              |
| `PUT /clients/{clientId}/fire-equipment/{equipmentId}`                 | Verified user with a membership       | `{ "equipment": { … } }` after replacing it                                                                               |
| `DELETE /clients/{clientId}/fire-equipment/{equipmentId}`              | Verified user with a membership       | `204` after deleting it                                                                                                   |
| `GET /clients/{clientId}/fire-installations`                           | Verified user with a membership       | `{ "items": [ … ] }` on active workplaces, by workplace and kind                                                          |
| `POST /clients/{clientId}/fire-installations`                          | Verified user with a membership       | `201 { "installation": { … } }`                                                                                           |
| `PUT /clients/{clientId}/fire-installations/{installationId}`          | Verified user with a membership       | `{ "installation": { … } }` after replacing it                                                                            |
| `DELETE /clients/{clientId}/fire-installations/{installationId}`       | Verified user with a membership       | `204` after deleting it                                                                                                   |
| `GET /clients/{clientId}/fire-substances`                              | Verified user with a membership       | `{ "state", "items": [ … ] }`: whether the client uses dangerous substances, and the list in its order                    |
| `PUT /clients/{clientId}/fire-substances/state`                        | Verified user with a membership       | `{ "state" }` after setting `undecided`, `none` or `listed`; `none` is `409` while entries exist                          |
| `POST /clients/{clientId}/fire-substances`                             | Verified user with a membership       | `201 { "substance": { … } }`; `409` unless the state is `listed`                                                          |
| `PUT /clients/{clientId}/fire-substances/{substanceId}`                | Verified user with a membership       | `{ "substance": { … } }` after replacing it                                                                               |
| `DELETE /clients/{clientId}/fire-substances/{substanceId}`             | Verified user with a membership       | `204` after deleting it                                                                                                   |
| `GET /clients/{clientId}/fire-maintenance-items`                       | Verified user with a membership       | `{ "items": [ … ] }`: the free rows of the schedules 5.4, by workplace, in their order                                    |
| `POST /clients/{clientId}/fire-maintenance-items`                      | Verified user with a membership       | `201 { "item": { … } }`, after the workplace's last row                                                                   |
| `PUT /clients/{clientId}/fire-maintenance-items/{itemId}`              | Verified user with a membership       | `{ "item": { … } }` after replacing it                                                                                    |
| `DELETE /clients/{clientId}/fire-maintenance-items/{itemId}`           | Verified user with a membership       | `204` after deleting it                                                                                                   |
| `GET /clients/{clientId}/fire-buildings`                               | Verified user with a membership       | `{ "items": [ … ] }`: the buildings of the active fixed spaces, in workplace order                                        |
| `PUT /clients/{clientId}/fire-buildings/{workplaceId}`                 | Verified user with a membership       | `{ "building": { … } }`, created the first time; `409` for a mobile site                                                  |
| `DELETE /clients/{clientId}/fire-buildings/{workplaceId}`              | Verified user with a membership       | `204`, the building cleared, whether or not there was one                                                                 |
| `GET /clients/{clientId}/documents/readiness?set=`                     | Verified user with a membership       | `{ "ready", "missing": [ … ] }`: what generating the set is waiting for                                                   |
| `GET /clients/{clientId}/documents?set=`                               | Verified user with a membership       | `{ "items": [ … ], "lastGeneration" }` of one set, in its order; not paginated                                            |
| `POST /clients/{clientId}/documents/generate?set=`                     | Verified user with a membership       | `201 { "created": [ … ], "skipped": [ … ] }`                                                                              |
| `GET /documents/{documentId}/revisions/{revisionId}/download`          | Verified user with a membership       | `{ "url", "fileName", "expiresInSeconds" }`, a link valid for a minute                                                    |
| `POST /documents/{documentId}/regenerate`                              | Verified user with a membership       | `{ "document": { … } }` with its new draft                                                                                |
| `POST /documents/{documentId}/issue`                                   | Verified user with a membership       | `{ "document": { … } }` with its issued revision; the PDF annexes either set's own instructions' modules                  |
| `POST /documents/{documentId}/draft`                                   | Verified user with a membership       | `{ "document": { … } }` with a draft copied from its issued revision                                                      |
| `DELETE /documents/{documentId}/draft`                                 | Verified user with a membership       | `204` after deleting the draft and its file                                                                               |
| `PUT /documents/{documentId}/signed-copy`                              | Verified user with a membership       | `{ "document": { … } }` after attaching or replacing the signed copy of the issued revision                               |
| `DELETE /documents/{documentId}/signed-copy`                           | Verified user with a membership       | `204` after removing the signed copy and its file                                                                         |
| `POST /documents/{documentId}/signed-copy/confirm`                     | Verified user with a membership       | `{ "document": { … } }` after accepting the copy received through the return link as the signed copy                      |
| `POST /contract-returns/lookup`                                        | Public, by emailed token              | What the return page shows: the contract, the parties, and whether the link still takes a copy                            |
| `POST /contract-returns/download`                                      | Public, by emailed token              | A short-lived link to the PDF that was sent                                                                               |
| `POST /contract-returns/upload`                                        | Public, by emailed token              | The same as lookup, `received`, after keeping the uploaded PDF as the received copy                                       |
| `PUT /documents/{documentId}/draft/file`                               | Verified user with a membership       | `{ "document": { … } }` after replacing the draft's Word file                                                             |
| `POST /clients/{clientId}/documents/{typeKey}/upload`                  | Verified user with a membership       | `{ "document": { … } }` with the uploaded file as its draft                                                               |
| `GET /companies/lookup`                                                | Verified user with a membership       | `{ "company": { … } }` from ANAF, by `?cui=`                                                                              |
| `GET /clients/{clientId}/employees`                                    | Verified user with a membership       | `{ "items": [ … ], "page", "pageSize", "total" }`; `?page=&pageSize=&sort=&order=&status=&trainingState=`                 |
| `POST /clients/{clientId}/employees`                                   | Verified user with a membership       | `201 { "employee": { … } }`                                                                                               |
| `GET /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }`, the only response carrying the CNP                                                               |
| `PUT /clients/{clientId}/employees/{employeeId}`                       | Verified user with a membership       | `{ "employee": { … } }` after replacing what was entered about them                                                       |
| `PATCH /clients/{clientId}/employees/{employeeId}/status`              | Verified user with a membership       | `{ "employee": { … } }` after marking a leaver (with `terminatedAt`) or reactivating                                      |
| `PATCH /clients/{clientId}/employees/{employeeId}/job-position`        | Verified user with a membership       | `{ "employee": { … } }` in the new job position                                                                           |
| `GET /clients/{clientId}/employees/{employeeId}/training-records`      | Verified user with a membership       | `{ "items": [ … ] }`, each record with its `training`, newest first; `?domain=`                                           |
| `GET /clients/{clientId}/trainings`                                    | Verified user with a membership       | `{ "items": [ … ] }`, newest first, each with `attendeeCount`; `?domain=&phase=`                                          |
| `GET /clients/{clientId}/trainings/proposal`                           | Verified user with a membership       | `{ durationMinutes, material, trainer, … }`; `?domain=&phase=&heldOn=&jobPositionId=`                                     |
| `POST /clients/{clientId}/trainings`                                   | Verified user with a membership       | `201 { "training": { …, "records": [ … ] } }`                                                                             |
| `GET /clients/{clientId}/trainings/{trainingId}`                       | Verified user with a membership       | `{ "training": { …, "records": [ … ] } }`                                                                                 |
| `PUT /clients/{clientId}/trainings/{trainingId}`                       | Verified user with a membership       | `{ "training": { … } }` after replacing its facts and attendees                                                           |
| `DELETE /clients/{clientId}/trainings/{trainingId}`                    | Verified user with a membership       | `204`, the records deleted with it                                                                                        |
| `GET /clients/{clientId}/job-positions`                                | Verified user with a membership       | `{ "items": [ … ] }`, by name, each with `employeeCount`                                                                  |
| `POST /clients/{clientId}/job-positions`                               | Verified user with a membership       | `201 { "jobPosition": { … } }`                                                                                            |
| `PUT /clients/{clientId}/job-positions/{jobPositionId}`                | Verified user with a membership       | `{ "jobPosition": { … } }` after the change                                                                               |
| `DELETE /clients/{clientId}/job-positions/{jobPositionId}`             | Verified user with a membership       | `204`: deleted, or archived when people who left still point at it                                                        |
| `GET /clients/{clientId}/job-positions/{jobPositionId}/equipment`      | Verified user with a membership       | `{ "items": [ … ], "needsProtectiveEquipment" }`, the position's entries and its decision                                 |
| `POST /clients/{clientId}/job-positions/{jobPositionId}/equipment`     | Verified user with a membership       | `201 { "entry": { … } }`                                                                                                  |
| `POST …/job-positions/{jobPositionId}/equipment/copy`                  | Verified user with a membership       | `{ "items": [ … ], "needsProtectiveEquipment" }` after copying another position's entries                                 |
| `PUT …/job-positions/{jobPositionId}/equipment/{entryId}`              | Verified user with a membership       | `{ "entry": { … } }` after the change                                                                                     |
| `DELETE …/job-positions/{jobPositionId}/equipment/{entryId}`           | Verified user with a membership       | `204`                                                                                                                     |
| `PATCH …/job-positions/{jobPositionId}/protective-equipment`           | Verified user with a membership       | `{ "jobPosition": { … } }` after saying the post needs none (`false`) or taking that back (`null`)                        |
| `GET /equipment-suggestions`                                           | Verified user with a membership       | `{ "items": [ … ] }`, risks or items typed before; `?field=risk                                                           | item&query=` |
| `GET /instruction-modules`                                             | Verified user with a membership       | `{ "items": [ … ] }`, by domain, group and title; `?archived=true` lists the archived ones instead; `?domain=`            |
| `POST /instruction-modules`                                            | Verified user with a membership       | `201 { "module": { … } }`, started from the skeleton                                                                      |
| `POST /instruction-modules/upload`                                     | Verified user with a membership       | `201 { "module": { … } }` from the `.docx` in the body; `?title=&group=&domain=`                                          |
| `GET /instruction-modules/{moduleId}`                                  | Verified user with a membership       | `{ "module": { … } }`                                                                                                     |
| `PATCH /instruction-modules/{moduleId}`                                | Verified user with a membership       | `{ "module": { … } }` after renaming, regrouping, moving domain, archiving or restoring                                   |
| `GET /instruction-modules/{moduleId}/file-link`                        | Verified user with a membership       | `{ "url", "fileName", "expiresAt" }`, a one-minute link to the current file                                               |
| `PUT /instruction-modules/{moduleId}/file`                             | Verified user with a membership       | `{ "module": { … } }` with the body stored as the next version                                                            |
| `GET …/job-positions/{jobPositionId}/instructions`                     | Verified user with a membership       | `{ "domain", "items": [ … ], "needsInstructions" }`, one domain's modules and decision; `?domain=`                        |
| `PUT …/job-positions/{jobPositionId}/instructions`                     | Verified user with a membership       | The same, after replacing the set of `domain` with `moduleIds`                                                            |
| `POST …/job-positions/{jobPositionId}/instructions/copy`               | Verified user with a membership       | The same, after adding another position's modules of `domain`                                                             |
| `PATCH …/job-positions/{jobPositionId}/instructions-decision`          | Verified user with a membership       | `{ "jobPosition": { … } }` after saying the post needs none of `domain` (`false`) or taking back (`null`)                 |
| `GET /clients/{clientId}/risk-evaluations`                             | Verified user with a membership       | `{ "items": [ … ] }`, the client's evaluations without factors, with counts and global levels                             |
| `POST /clients/{clientId}/risk-evaluations`                            | Verified user with a membership       | `201 { "evaluation": { … } }` for a position, the sensitive groups or another named one                                   |
| `GET …/risk-evaluations/{evaluationId}`                                | Verified user with a membership       | `{ "evaluation": { … } }` with its factors, measures, levels and global level                                             |
| `PATCH …/risk-evaluations/{evaluationId}`                              | Verified user with a membership       | `{ "evaluation": { … } }` after changing its work system texts or name                                                    |
| `DELETE …/risk-evaluations/{evaluationId}`                             | Verified user with a membership       | `204`, with its factors                                                                                                   |
| `POST …/risk-evaluations/{evaluationId}/factors`                       | Verified user with a membership       | `201 { "evaluation": { … } }` after adding a factor with its measures                                                     |
| `PUT …/risk-evaluations/{evaluationId}/factors/{factorId}`             | Verified user with a membership       | `{ "evaluation": { … } }` after replacing a factor and its measures                                                       |
| `DELETE …/risk-evaluations/{evaluationId}/factors/{factorId}`          | Verified user with a membership       | `{ "evaluation": { … } }` after removing a factor                                                                         |
| `PUT …/risk-evaluations/{evaluationId}/factor-order`                   | Verified user with a membership       | `{ "evaluation": { … } }` after reordering the factors by `factorIds`                                                     |
| `POST …/risk-evaluations/{evaluationId}/factors/copy`                  | Verified user with a membership       | `{ "evaluation": { … } }` after adding another evaluation's factors                                                       |
| `GET …/job-positions/{jobPositionId}/risk-evaluation`                  | Verified user with a membership       | `{ "evaluation": { … } }`, the position's evaluation, or `null`                                                           |
| `GET /risk-factor-suggestions`                                         | Verified user with a membership       | `{ "items": [ … ] }`, groups, plan fields or observations typed before; `?field=&query=`                                  |
| `POST …/risk-evaluations/{evaluationId}/save-as-profile`               | Verified user with a membership       | `201 { "profile": { … } }`, a new profile of the library with copies of the evaluation's factors                          |
| `POST …/risk-evaluations/{evaluationId}/factors/apply-profile`         | Verified user with a membership       | `{ "evaluation": { … }, "addedFactorCount" }` after adding copies of a profile's factors                                  |
| `GET /evaluation-profiles`                                             | Verified user with a membership       | `{ "items": [ … ] }`, the risk library by name, with counts and global levels                                             |
| `POST /evaluation-profiles`                                            | Verified user with a membership       | `201 { "profile": { … } }`, an empty profile by `name`                                                                    |
| `GET /evaluation-profiles/{profileId}`                                 | Verified user with a membership       | `{ "profile": { … } }` with its factors, measures, levels and global level                                                |
| `PATCH /evaluation-profiles/{profileId}`                               | Verified user with a membership       | `{ "profile": { … } }` after renaming it                                                                                  |
| `DELETE /evaluation-profiles/{profileId}`                              | Verified user with a membership       | `204`, with its factors; the copies in evaluations stay                                                                   |
| `POST /evaluation-profiles/{profileId}/factors`                        | Verified user with a membership       | `201 { "profile": { … } }` after adding a factor with its measures                                                        |
| `PUT /evaluation-profiles/{profileId}/factors/{factorId}`              | Verified user with a membership       | `{ "profile": { … } }` after replacing a factor and its measures                                                          |
| `DELETE /evaluation-profiles/{profileId}/factors/{factorId}`           | Verified user with a membership       | `{ "profile": { … } }` after removing a factor                                                                            |

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
(`authorizationCertificateNumber`, `…Date`, `…Issuer`), the fire-safety technician with
their certificate, as text (issue #170), and `fireSafetyAuthorization`, the inspectorate's
authorization under Legea 307/2006 art. 12^2, one text of up to 200 characters (ADR 019). Every member reads both and an owner writes them:
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
`sort=name|jobTitle|hiredAt`; clients:
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
record and its occupation, one left out loses it. The list is not paginated. The detail lists
the records by name, each with `employee: { id, lastName, firstName }`, `occupation` and
`admission` or null; `GET …/employees/{employeeId}/training-records` lists one person's
records with their training's facts, newest first. An archived client or a lead answers `409`
as elsewhere.

`GET …/trainings/proposal` proposes what the flow pre-fills, every value the specialist may
change and null where nothing can be proposed. A periodic training takes the content line and
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

Employees carry `training: { ssm, psi }`, each `{ state, dueOn, lastPeriodicOn }`, in the list
and the detail: `state` is `untrained`, `current`, `due` or `overdue`, null for a leaver, and
`dueOn` null while the interval is undecided. `GET …/employees?trainingState=` takes
`untrained`, `due` or `overdue` and keeps the employees in that state in either domain.

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
others by name, each with `factorCount`, `unacceptableFactorCount` and `globalRiskLevel`.
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
routes. `GET /clients/{clientId}/files` lists the files the caller can see: a specialist is
not told that files for owners only exist. Each carries `name`, `note`, `ownersOnly`,
`employee` (`{ id, lastName, firstName }` for a file that belongs to one of the client's
employees, otherwise null), `originalFileName`, `mimeType`, `sizeBytes`, `sha256`,
`uploadedBy` (`{ id, fullName }`, null once the account is gone) and `canChange`, true for its
uploader and for an owner. `?employeeId=` keeps only that employee's files ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)); a
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
`risk_evaluations.sensitive_groups` likewise for the sensitive groups,
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
(`pnpm templates:register`).

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
nothing, an uploaded file is never behind, and a hand edit changes nothing about it. Only
active clients count (not archived, not leads), and the service contract never does: its data
comes from its own page. Of a dated type only the client's newest period counts (ADR 020): an
earlier year's report is what was written for that year. The database view `documents_behind` decides it, under the caller's
policies.

`GET /documents/behind` lists the organization's documents behind by type, in the pack's
order: the template's `title`, its `newestVersion` (`version`, `kind`, `note`), the
`runningJobId` of a regeneration of that type still under way, or null, and the `clients`
behind, by name, each with its `documentId`, the `version` its newest revision came from, and
`editedDraft` when that revision is a draft edited by hand. A type nobody is behind on is left
out.

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
  index.ts             the Worker: the app's fetch, and the queue consumer for bulk regeneration
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

Every response carries `Server-Timing`: `total` for the whole request, and `auth` and
`membership` for the token and membership checks that run before a handler. What is left of
`total` is the handler, which is mostly its database reads. The browser's network tab shows the
values under a request's timing.

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
