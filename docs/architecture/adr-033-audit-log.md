# ADR 033: An audit log of who changed personal data and legally binding records

- Status: accepted
- Date: 2026-11-01

## Context

Support has no way to answer "who changed this, and when" today. A row says who created it (`created_by`, `issued_by`, `invited_by`, `uploaded_by`) and when it last changed (`updated_at`), but not who changed it, what changed, or what was deleted. Before the first real clients, the app holds personal data under GDPR: CNPs, birth dates, home addresses, blood group and Rh. It also holds records that bind a client legally: issued documents, training records, electronic signatures, test results, signing agreements. When a specialist, a client or an inspector asks what happened to one of them, we need an answer that does not depend on anyone's memory.

Three facts shape the design:

- **Many writes go through the API's secret key.** The signing flow, invitations, imports, the portal's knowledge tests and the deletion of an archived client all write this way, and there `auth.uid()` is null. A log that only reads the JWT would name nobody for exactly the writes that matter most.
- **Platform admins impersonate members** (`impersonations`, `effective_user_id()`). The admin's own JWT then acts as the member. Only the impersonation row shows who really acted, and the admin who wrote that row could rewrite every column of it, choose its `started_at`, and set any `expires_at`.
- **Write-once evidence tables already refuse updates and deletes,** and `delete_archived_client` deletes everything under a client in one run.

Mircea decided on 2026-10-31:

- **Our own table, fed by Postgres triggers.** `supa_audit` was rejected because it stores a full copy of every row, so the log would become a second copy of every CNP. `pgaudit` was rejected because it writes to the server log, which the app cannot read and which the hosted plan keeps for days.
- **Readers.** Only we, as support, read it for now. An organization owner's "history" view may come later, and specialists never see the log. Nothing is built for the owner's view yet.
- **Coverage.** Everything sensitive or legally binding.
- **What an event stores.** Who, when, which organization, which table, which row, the operation, and the names of the changed columns. Never the values of personal fields.
- **Retention is not decided.**

## Decision

### One append-only table in its own schema

`audit.events` lives in a schema of its own, `audit`. The schema is not in `[api].schemas`, so PostgREST cannot reach it, and no API role (`anon`, `authenticated` or `service_role`) has any privilege on the schema or its objects. Support reads it with SQL.

| Column                  | Holds                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `occurred_at`     | Order and time; `occurred_at` is the transaction's time, shared by every event of one request.                                                                                                             |
| `action`                | `insert`, `update`, `delete`, or one of the named events below.                                                                                                                                            |
| `table_name`, `row_id`  | The table and the row's key: its `id`, or `user_id` on `organization_members`, `employee_id` on `employee_signing_agreements`, `revision_id` on `document_signed_copies`.                                  |
| `organization_id`       | The row's organization, or the organization's own id.                                                                                                                                                      |
| `changed_columns`       | The columns an update changed, or the columns an insert filled. Null on a delete. `updated_at` and generated columns are left out.                                                                         |
| `details`               | The kept values: `{column: [old, new]}` for the few columns listed below, only when they changed.                                                                                                          |
| `actor_id`              | The account that acted (see attribution).                                                                                                                                                                  |
| `impersonating_user_id` | The member that account was acting as, during an impersonation.                                                                                                                                            |
| `source`                | `user` (the account's own token), `api` (the API with the secret key, acting for `actor_id`), `service` (the secret key acting for nobody) or `database` (no request: SQL, migrations, Auth's own writes). |
| `transaction_id`        | Groups the events of one request.                                                                                                                                                                          |

There are no foreign keys, because the log outlives the accounts, organizations and rows it names. Indexes serve the two questions support asks: events for a row, `(table_name, row_id, occurred_at)`; and events by an account or an organization over time, `(actor_id, occurred_at)` and `(organization_id, occurred_at)`.

Nobody changes or removes an event. No API role has a grant, and a trigger raises `AUD01` on any update, delete or truncate, whoever runs it. The table's owner is refused too. Only someone who can disable the trigger in a migration could change the log, and that leaves a trace in the repository.

### Triggers: one function, statement-level

One generic trigger function, `audit.record_changes()` (plpgsql, security definer, `search_path = ''`), runs as three `after … for each statement` triggers per table, with transition tables. A bulk write, such as an import that inserts hundreds of employees in one statement, writes its events in one `insert … select` instead of calling a function per row. The trigger's arguments are the key column and the columns whose values are kept. An update that changes nothing but `updated_at` records nothing.

The write-once triggers on the evidence tables run before the statement and refuse it, so a refused update or delete leaves no audit event.

### What is audited

| Table                                                                  | Why                                                                                    | Values kept                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `employees`                                                            | Personal and health data: CNP, birth date and place, address, blood group, Rh, contact | `status`                                               |
| `clients`                                                              | The employer's identity and its stage; archiving                                       | `stage`, `archived_at`                                 |
| `organizations`                                                        | The provider's company details, bank account and accepted terms                        |                                                        |
| `organization_members`                                                 | Who belongs to an organization, and their role                                         | `role`                                                 |
| `organization_invitations`                                             | Who was let in, as what                                                                | `role`                                                 |
| `client_participants`                                                  | Portal access granted and revoked                                                      | `kind`, `revoked_at`                                   |
| `participant_invitations`                                              | Portal access offered, to which channel                                                | `kind`, `channel`, `revoked_at`                        |
| `client_responsible_persons`                                           | Designations the documents print, the workers' representative among them               | `roles`, `archived_at`                                 |
| `client_files`                                                         | Uploaded files that cannot be generated again, often about a person                    | `owners_only`                                          |
| `client_documents`, `document_revisions`, `document_signed_copies`     | Issuing, superseding, deleting a draft, a signed copy recorded                         | `type_key`; `status`, `revision`; `source`             |
| `service_contracts`                                                    | The contract with the client                                                           |                                                        |
| `trainings`, `training_records`                                        | The legal record of a training                                                         | `domain`, `phase`; `phase`                             |
| `signature_requests`                                                   | Who was asked to sign what, and what became of it                                      | `slot`, `state`                                        |
| `training_signatures`, `agreement_signatures`, `test_sheet_signatures` | The signatures themselves, voids included                                              | `slot`, `method`; `party`; `slot`, `method`            |
| `signing_identities`                                                   | A signer's certificate being issued                                                    |                                                        |
| `employee_signing_agreements`                                          | The agreement to sign electronically, and its withdrawal                               | `state`                                                |
| `signed_sheets`, `test_sheets`                                         | The signed documents, version by version                                               | `domain`, `sequence`, `version`; `version`             |
| `test_attempts`, `test_results`                                        | A test taken in the portal, and a pass from it or from paper                           | `domain`, `test`, `passed`; `domain`, `test`, `source` |
| `impersonations`                                                       | A platform admin acting as someone                                                     | named events, below                                    |
| `delete_archived_client`                                               | A client deleted with everything under it                                              | named event, below                                     |

Every kept value states what happened without describing a person: a state, a role, a stage, a domain, a version, a flag, or a moment such as `archived_at` or `revoked_at`. No name, number, address, email, phone, note, file name or reason typed about a person is kept.

**Left out, and why:**

- **Data that feeds the documents but describes no person and binds nobody until issued:** job positions, workplaces, fire safety data, risk evaluations, the instruction libraries. The issued revision is audited.
- **Technical rows that the audited rows already account for:** `signing_sessions`, `signing_session_items` and `signed_sheet_rows`. The signatures are the evidence. A session holds the code's hash and the address it went to, which is personal data that would add nothing to the log.
- **`test_attempt_keys`,** which hold the answer key.
- **Rows that belong to the account rather than to a record:** `profiles` and `setup_step_skips`.
- **Billing tables.** Stripe keeps the record.
- **`client_owner_notes`** and the waitlist.
- **Imports** (`imports`, `import_files` with its `source_file_id` for a found sheet photograph, and `import_page_images`, the JPEG of each page of an employee import's scanned PDF). These are the pipeline's working copies, written with the secret key and never read by members. What an import confirms is written into the audited tables and audited there: `apply_employee_import` (ADR 032) inserts employees, trainings and training records, and each employee's sheet page or photograph becomes a `client_files` row, with `import_page` among the changed columns.
- **Protective equipment hand-overs.** No table records them yet. `job_position_equipment` lists what a position needs, not what a person received. A hand-over table, when it comes, is audited.

**A new table** that holds personal data or a legally binding record gets the three triggers in its migration. The list above is the place to add it.

### Attribution

`audit.current_actor()` decides once per statement who the write is for:

- **A user's token** (`authenticated`). The actor is `auth.uid()`, the real signed-in account. When `effective_user_id()` differs, the actor is a platform admin impersonating someone, and that someone is `impersonating_user_id`.
- **The secret key** (`service_role`). The API sends the signed-in account's id in the `x-audit-actor` header on every secret-key client made inside a request (`createAdminClient` and `createLastingAdminClient` in `apps/api/src/lib/admin-db.ts`, the one place those clients are made). PostgREST puts the request's headers in `request.headers`, and the trigger reads it. If that account has an active impersonation, the impersonated member is named too. Without the header, or with one that is not an account id, the source is `service` and nobody is named; the write still goes through. Queues, the Stripe webhook and the scheduled jobs, which act for nobody, are `service`.
- **Anything else** (a SQL session, a migration, Auth's own writes) is `database`.

**The header is believed only on a service-role request.** PostgREST switches to the role the verified JWT names, so the session's `role` is `service_role` only for a request signed with the project's secret, which only the API holds. A user who sends `x-audit-actor` with their own token is still recorded as themselves, and pgTAP covers that case. The check reads the `role` setting, which a security definer function does not change, rather than any claim a caller could shape. This was verified on 2026-11-01 against a PostgREST of the version the local stack runs, pointed at a scratch database: a service-role JWT with the header was recorded as `api` with that account, one without it as `service`, and an `authenticated` JWT with a forged header as the token's own `sub`.

### Impersonation

Starting and ending an impersonation are events of their own, `impersonation_started` and `impersonation_ended`. Each names the admin as `actor_id`, the member as `impersonating_user_id` and the member's organization. The reason and the expiry are kept, because they describe the admin's action and are not data about the member.

The impersonation row is the evidence, so the admin no longer controls it. The admin inserts only `admin_user_id`, `target_user_id`, `reason` and `expires_at`, so `started_at` is always the database's `now()`. Afterwards the admin updates only `ended_at`, which the database stamps with the moment of ending, whatever value was sent. An ended impersonation is not changed again (`IMS01`). The admin deletes and truncates nothing. `expires_at` is at most `started_at + 2 hours`. That is the column's default and the only duration in use: nothing in the app or the API starts an impersonation with another one, and there were no local rows to check. The cap applies to everyone, the service role and SQL included.

### Deleting an archived client

`delete_archived_client` writes one `client_deleted` event for the run, before deleting anything. The event names the client's id, organization, legal name and CUI, and the account that asked for the deletion. The legal name and CUI identify the company, and nothing else will identify it once its row is gone. The function then sets `audit.suppressed` for its own transaction, so the thousands of rows it deletes under the client record nothing, and clears it before returning. The setting is honoured only outside a user's or anon's request. PostgREST runs no `SET`, and no function exposed to a user sets it.

## What is not stored

- **The values of personal fields,** before or after: not the CNP, birth date, address, blood group, Rh, name, email, phone, notes, a file's name or contents, or a signature's IP, browser or code address. The log says that `cnp` changed on an employee, who changed it and when, never what it was or became. pgTAP checks that no event holds a CNP or a blood group that was written.
- **Full rows.** A deleted row leaves its key, its organization and its kept values.
- **Reads.** The log records writes only. Who downloaded a sheet or opened an employee is not recorded.

## Open questions

- **Retention.** How long events are kept is not decided, and nothing deletes them yet. The log holds account ids, row ids and column names. That is pseudonymous personal data about members and participants, not their content, so a retention period belongs in the privacy policy and the data-processing agreement, beside the evidence's own retention. When it is decided, deletion is a scheduled job that runs as the owner and disables `events_append_only` for its own transaction, written in a migration.
- **An organization owner's history view.** If it comes, it is a security definer function or an API route that reads `audit.events` for the caller's organization, shows only owners, and maps column names to labels. The table already has `organization_id` and its index. Specialists never get it, and the schema stays unexposed.
- **Natural expiry of an impersonation** writes no event: the admin's rights end at `expires_at` without a write. Support reads `expires_at` from the started event.

## Consequences

- Every write to an audited table costs one extra `insert … select` per statement, plus a lookup of the actor and, for a user's token, of `effective_user_id()`. A bulk insert of n rows writes n events in one statement.
- Every secret-key client made inside a request names the signed-in account. Writes that must outlive the request use `createLastingAdminClient`, which drops only the request's abort signal. New code that writes with the secret key for a user goes through these helpers, not `adminClient(env)`.
- The evidence tables keep refusing updates and deletes, and the audit triggers do not change that.
- `delete_archived_client` is redefined on the latest definition: deleting client files before import files (`20261101180100`) and the organization-prefixed evidence paths (`20261101190000`). A pull request that redefines it again keeps the event and the suppression.
- Writes to audited tables get the triggers automatically: the employee import's `apply_employee_import` (ADR 032) inserts employees, trainings, training records and client files, and records one event per row, written in one statement per insert.
- The impersonation row can no longer be edited by the admin. A support script that needs another expiry ends the impersonation and starts a new one.
- `docs/data-model.md` describes the log under "Platform admins and impersonation" and "Audit log".
