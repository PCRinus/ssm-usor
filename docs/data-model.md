# Data model and tenancy

Status: implemented for organizations, memberships, profiles, invitations, onboarding, impersonations, clients, employees, the facts documents print, and generated documents  
Audience: engineering

The schema lives in checked-in SQL migrations under `supabase/migrations`, applied by the
Supabase CLI locally and from CI to the hosted project. There is no ORM. The Hono API reads
and writes through PostgREST with the caller's own access token, so the row-level security
(RLS) policies in the database are the authorization layer.

## Tenancy

An **organization** is one external SSM provider using the app: the paying customer. Every
Supabase auth user belongs to at most one organization through **organization_members**,
whose primary key is the user id. Roles are `owner` (administers the organization: team,
settings, archiving) and `specialist` (does the SSM work). `public.is_organization_owner()`
is true for an owner; inviting people is the first thing it guards.

Every business table carries an `organization_id`. Policies compare it with
`public.current_organization_id()`, which resolves the caller's **effective** user (see
impersonation) and returns that user's membership. `public.current_membership()` returns the
same information as one row for the API. Both helpers run as `security definer` so they can
read memberships regardless of the caller's own policies.

Roles and organizations are never stored in Supabase user metadata. The only claim the app
trusts is `app_metadata.role = 'admin'`, which only the Auth Admin API can set.

A user without a membership can sign in but sees nothing, and the API answers `403 forbidden`.
Organizations are created by the seed, and by onboarding
([ADR 004](architecture/adr-004-registration-and-onboarding.md)):
`create_organization(name, owner name, terms version)` lets a signed-in account with a
confirmed email and no membership create its organization, become its `owner`, name itself,
and record the accepted terms, on the organization (`terms_version`, `terms_accepted_at`,
`terms_accepted_by`) and on the profile, in one transaction. It refuses an account that
already belongs to an organization (`ORG01`). `my_open_invitations()` lists the open
invitations sent to the caller's confirmed address, without tokens, so onboarding can point
them out first. Memberships come from the seed and from
accepted invitations; no policy lets a signed-in user write `organization_members`. An owner
changes a role with `change_organization_member_role(user, role)` and removes a member with
`remove_organization_member(user)`. Both lock the organization's memberships before checking
the caller, and refuse the caller's own membership (`MEM01`), so an organization always
keeps an owner. Removal deletes the membership only.

## Platform admins and impersonation

`public.is_platform_admin()` is true for a JWT whose `app_metadata.role` is `admin`. Platform
admins have no blanket bypass. To reproduce a customer's problem they **impersonate** a user:
an `impersonations` row (admin, target, reason, `expires_at`, `ended_at`) makes
`public.effective_user_id()` return the target while the row is active, so every policy
automatically scopes to the target's organization and role. Rows are kept after ending as an
audit trail, and a partial unique index allows one active impersonation per admin.

Writes made during an impersonation carry the target's organization but the admin's real user
id in `created_by`. The API routes and the banner for starting and ending impersonations are a
follow-up; the schema, policies, and pgTAP tests already cover the mechanism.

## Clients

`clients` stores the client companies of an organization:

| Column                                    | Notes                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `legal_name`                              | Required.                                                                       |
| `cui`                                     | Required, digits only, unique per organization; checksum validated by the API.  |
| `vat_payer`                               | The `RO` prefix is not stored; it is represented by this flag.                  |
| `caen_code`                               | Four digits, leading zeros preserved (CAEN Rev. 3).                             |
| `trade_register_number`                   | As issued (`J40/1234/2020` or the newer `J2024…` format).                       |
| `county_code`, `locality`, `address_line` | Registered office; the county uses the vehicle registration code.               |
| `legal_representative_name`               | Name only for now.                                                              |
| `declared_employee_count`                 | Headcount declared at onboarding; a live count will come from employee records. |
| `archived_at`                             | Soft delete. There is no delete policy.                                         |

Deferred on purpose: service status and contract period, financial data, contacts as their
own table, and specialist assignment.

## What the documents print

A client's SSM documentation ([ADR 005](architecture/adr-005-document-generation.md)) names
the provider, the client's representative, its workplaces, the people it designates by
decision, and its training schedule. These facts outlast one generation, so they are stored
once. All of them are optional in the database: the generation form reports what is missing
and refuses to generate until it is filled in. Honorifics are not stored; documents print
the name and the role.

**The provider.** `organizations.name` stays what the app shows. Documents print
`legal_name`, `cui`, `trade_register_number`, the registered office (`county_code`,
`locality`, `address_line`), and `legal_representative_name` with
`legal_representative_role`. Only an owner updates them, and column grants keep the name
and the accepted terms out of that update. A specialist's qualification, as printed
("Coordonator în materie de securitate și sănătate în muncă, evaluator autorizat"), is
`profiles.professional_title`, which each person writes for themselves;
`organization_member_list()` returns it.

**The client.** `legal_representative_role` ("Administrator") sits next to the name. The
training schedule that the first decision sets is on the client too, because the deadline
calendar will read the same columns:

| Column                                    | Notes                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `periodic_training_minutes`               | Duration of a periodic training: 30, 60, 90 or 120.                   |
| `administrative_training_interval_months` | Technical and administrative staff and workplace managers, 1 to 12.   |
| `worker_training_interval_months`         | Workers, 1 to 6.                                                      |
| `training_first_month`                    | First month of the year with a training; the rest follow by interval. |
| `training_day_from`, `training_day_to`    | The days of that month, for example 2 to 7; ordered by a check.       |

**Workplaces.** `client_workplaces` holds the registered office and the points of work: a
name, `is_registered_office` (one per client, by a partial unique index), and an address.
Documents belong to the client, not to a workplace; they list the workplaces.

**Responsible persons.** `client_responsible_persons` holds the people the employer
designates by decision, with `roles` as an array of `workplace_manager` (gives the workplace
and periodic training), `first_aid`, `risk_evaluation_team`, and `imminent_danger`. One
person often holds every role, and the administrator is not always an employee, so the row
carries its own `full_name` and `job_title` and only optionally an `employee_id`, which a
composite foreign key ties to the same client. An employee appears once per client.

Both tables follow `employees`: a denormalized `organization_id` with a composite foreign
key to the client, the same three policies, new rows only for an active client, and
`archived_at` as the soft delete. The new address columns use the `county_code` domain;
`clients.county_code` keeps its own check with the same values.

## Employees

`employees` stores the people employed by a client, one row per employment. A person working
for two clients is two rows; there is no shared person entity. The row carries `client_id`
and a denormalized `organization_id`, and a composite foreign key on `(client_id,
organization_id)` guarantees the client belongs to the same organization, so the policies
stay a one-line comparison like on `clients`.

| Column                                      | Notes                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `last_name`, `first_name`                   | Required, separate columns: forms print "Numele și prenumele" and lists sort by last name. |
| `cnp`                                       | Optional, thirteen digits; checksum and date validated by the API. Unique per client.      |
| `employee_number`                           | The client's own identifier (marca); import and dedupe key. Unique per client.             |
| `email`, `phone`                            | Optional, for invitations and remote signing.                                              |
| `job_title`                                 | Required free text (funcția). A COR code column will join it once the list exists.         |
| `hired_at`                                  | Required; drives the introductory training deadline. Tenure is computed, never stored.     |
| `status`, `terminated_at`                   | `active` or `terminated`; the date is required exactly when terminated.                    |
| `birth_date`, `birth_place`, `home_address` | Optional fields of the individual training sheet. The birth date must agree with the CNP.  |
| `blood_group`, `rh_factor`                  | Optional, constrained to `0(I)`, `A(II)`, `B(III)`, `AB(IV)` and `+`, `-`.                 |
| `notes`                                     | Free text, up to 2000 characters.                                                          |
| `archived_at`                               | Soft delete for rows entered by mistake; a leaver is a status change, not an archive.      |

Both unique indexes are partial on `archived_at is null`, so archiving a mistaken row releases
its CNP and employee number. The insert policy additionally requires the client to be active
(`archived_at is null`); the update policy does not, so leavers of an archived client can still
be recorded.

The CNP is optional per the product scope, protected by row-level security like every other
column, and returned only by the detail route. It is not encrypted at the column level; an
audit log of full-CNP reads is planned together with the employee dossier.

There is no suspended status. A paused contract (parental or medical leave, unpaid leave,
technical unemployment) is an absence with a start and a return date, and the return after
more than 30 working days triggers supplementary training; it will be a dated event next to
the training records, from which "currently absent" is derived.

Not on the employee row, on purpose: training completion, signatures, and medical fitness.
Those are evidence records with dates and actors (a `training_records` table follows), because a
flag would be wrong the day after the periodic training expires. The post a person fills is
a job position, below. Departments are a future entity; no free-text stand-in was added. Workplaces exist as
`client_workplaces`, and an employee does not point at one yet. Contract type, working
hours, and salary are HR data the product avoids.

The CAEN Rev. 3 class list (651 four-digit codes with Romanian names) also lives in
`packages/contracts` and feeds the form's combobox and the seed. The county list is a Zod enum in `packages/contracts`. It flows into the OpenAPI document and
the generated client, so the form and the API validate against one list, and the database
check constraint mirrors it.

## Job positions

`job_positions` holds the posts a client employs people in, as occupational safety sees them
([ADR 006](architecture/adr-006-job-positions.md)). A position belongs to the client, not to
a workplace, and exists whether or not anyone is in it. It carries the same `client_id`,
`organization_id` and composite foreign key as `employees`.

| Column                     | Notes                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | Unique per client among positions that are not archived, compared in lower case without the spaces around it.                                                    |
| `staff_category`           | `technical_administrative` or `execution`: the two kinds of staff the training decision gives an interval each. Defaults to `execution`, the shorter interval.   |
| `training_interval_months` | Optional: set only when the post is trained at another interval than its category's, which the client holds. At most 6 for `execution`, 12 otherwise.            |
| `work_zone`                | Optional free text, "Birou", "Atelier, teren": the kind of place the work happens in. Not a workplace, which is an address.                                      |
| `activities`               | Optional: what the person in it actually does. Tells apart two positions close in name.                                                                          |
| `archived_at`              | Set instead of deleting once an employee points at the position. A trigger refuses it (`JOB01`) while current employees are in it; people who left do not count. |

`employees.job_position_id` is required: one position per employee. ADR 006 spoke of a link
table; a required column keeps the rule in the database and the insert in one statement, and
allowing several positions later is one migration either way. `employees.job_title` stays
and means the title in the employment contract, a fact of its own that usually reads the
same. A trigger gives an employee inserted without a position the one named like their
contract title, creating it when the client lacks it; the migration did the same for the
employees that existed, merging titles that differed only in case or spacing. The trigger
runs as the person inserting, so the policies decide, as everywhere.

Members read, create, update and delete the positions of their organization; updates are
granted on the descriptive columns and `archived_at` only. Deleting succeeds only for a
position no employee points at: the foreign key keeps the rest.

## Generated documents

A document is generated from a versioned Word template and from then on its `.docx` file is
the source of truth ([ADR 005](architecture/adr-005-document-generation.md)). The tables say
which file is which; the files live in Supabase Storage.

**Templates.** `document_templates` holds one row per document type (`type_key`, for example
`decision_training`), with `organization_id` null for the built-in set. A provider's own
templates will carry their organization. `document_template_versions` holds the files: a
version number, the Storage path, and the SHA-256 of the file. The master copies of the
built-in set live in the repository; `register_built_in_template_version(type, title, path,
hash)`, reachable only with the secret key, registers one and is idempotent: the same hash
is the version it already is, a new hash becomes the next version. Members read templates
and have no write policy.

**Documents.** Each client has one documentation set. `client_documents` holds a document
type once per client (a unique constraint), with its title and, for decisions, the
`decision_number`, which stays the same across revisions. `document_generations` records
what was asked when generating: the `issue_date` and the `first_decision_number`. Users never
see it; it keeps the inputs that are not facts about the client.

**Revisions.** `document_revisions` holds a document's content over time:

| Column                                  | Notes                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `revision`                              | 1, 2, 3… per document.                                                                      |
| `status`                                | `draft`, `issued`, or `superseded`. One draft and one issued revision per document at most. |
| `template_version_id`, `generation_id`  | What it was generated from; both null for a file that was uploaded instead.                 |
| `docx_path`                             | `<organization>/<client>/<document>/<revision>.docx`; a check ties it to the organization.  |
| `data_snapshot`                         | The data merged into the file, so the app can tell that it has changed since.               |
| `edited_at`, `edited_by`                | Last save from the editor or upload; null while the file is as generated.                   |
| `docx_sha256`, `issued_by`, `issued_at` | Set by issuing. The hash is of the file as issued.                                          |
| `superseded_at`                         | Set when the next revision is issued.                                                       |

Members write drafts only: the policies require `status = 'draft'` before and after, and
column grants limit an update to what regenerating and saving change. Issuing goes through
`issue_document_revision(id, sha256)`, which locks the document, supersedes the issued
revision if there is one, and marks this one issued with its hash (`DOC01` no such revision,
`DOC02` not a draft). During an impersonation `issued_by` records the platform admin, as
`created_by` does. A trigger then refuses any change to a revision that is not a draft, except
being superseded, to everyone including the secret key (`DOC03`): an issued revision is
evidence. A correction is a new draft revision of the same document.

**Files.** Two private buckets, limited to Word and PDF files of 20 MiB. `document-templates`
is read by members under `built-in/` and under their own organization, and written only with
the secret key. In `documents`, a member reads everything under their organization's folder
and can upload, replace, or delete a file only where a draft revision of their organization
says it lives (`is_draft_document_path`). Issuing a revision therefore locks its file as
well as its row, and tenancy and impersonation apply to files exactly as they do to rows,
because the policies use `current_organization_id()`. Supabase's database backups cover these
rows but not the files (issue #77).

## Profiles

`profiles` names a user: `full_name`, plus `terms_version` and `terms_accepted_at` for people
who created their account through an invitation. The email stays in `auth.users` and is not
copied. A user reads the profiles of their own organization, creates their own, and changes
only their own `full_name`; column grants keep the terms columns for acceptance to write.

`public.organization_member_list()` returns the members of the caller's organization with
their email, name, role, and join date. It runs as `security definer` because `auth.users`
is not readable by signed-in users.

## Organization invitations

`organization_invitations` holds an owner's invitation for one email address
([ADR 003](architecture/adr-003-organization-invitations.md)). Its status is derived:
accepted, revoked, expired once `expires_at` has passed (7 days), otherwise open. A partial
unique index allows one open invitation per address in an organization, so inviting an
address again renews the row.

Owners read their organization's invitations under row-level security, without the
`token_hash` column, and write through functions that check the role themselves:

| Function                                      | Caller    | What it does                                                                                                               |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `create_organization_invitation(email, role)` | owner     | Creates or renews an invitation. Refuses a member of the same organization (`INV01`) and a 21st open invitation (`INV02`). |
| `revoke_organization_invitation(id)`          | owner     | Revokes an open invitation; false when there was nothing to revoke.                                                        |
| `accept_organization_invitation(hash, …)`     | signed in | For an account without a membership: accepts as the real signed-in user.                                                   |
| `organization_invitation_by_token(hash)`      | API key   | What the accept page shows, including whether the address has an account.                                                  |
| `accept_invitation_as(hash, user, …)`         | API key   | For an account the API has just created.                                                                                   |

Accepting locks the invitation, requires it to be open (`INV03` with the status otherwise)
and sent to the account's confirmed email (`INV04`), then adds the membership and the
profile and marks it accepted, all in one transaction. The primary key on
`organization_members` refuses an account that already belongs to an organization (`INV05`).

Nobody signed in can write a token hash. A browser holds the same credentials as the API's
per-user client, so an owner able to write a hash could mint a link and create a confirmed
account for someone else's address. The API sets the hash with its secret key after the
owner's call succeeds. During an impersonation `invited_by` records the platform admin.

## Waitlist subscribers

`waitlist_subscribers` holds the people who asked on the marketing site to be told when
accounts open. It belongs to no organization. Row-level security is on with no policies and
both `anon` and `authenticated` are revoked, so only the API's secret key reaches it.

| Column                    | Notes                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| `email`                   | Trimmed and lowercased by the API, enforced by a check; unique.                  |
| `confirmation_token_hash` | SHA-256 of the token in the latest confirmation email; the token is not kept.    |
| `consent_version`         | Version of the consent text shown next to the form.                              |
| `confirmation_sent_at`    | When the latest confirmation email was handed to the provider; throttles more.   |
| `confirmed_at`            | Set when the emailed link is followed. Only confirmed rows get the launch email. |

## Working with the schema

```bash
supabase migration new <name>      # new SQL file under supabase/migrations
supabase db reset                  # rebuild the local database from all migrations
pnpm supabase:test                 # pgTAP tests in supabase/tests
pnpm generate:db                   # regenerate apps/api/src/database.types.ts
pnpm seed:local                    # admin user, organization, fake clients and employees
```

Migrations are forward-only. A bad migration is fixed with a corrective migration, never by
rolling back. CI applies every migration to a fresh database, runs the pgTAP tests, and fails
if the committed database types are stale. On `main`, the **Deploy database migrations** job
pushes pending migrations to the hosted project before the API deploys; see the
[application deployment guide](app-deployment.md) for its secrets.

## Environments

There is a single hosted Supabase project today, used by the deployed app and for development.
It becomes the development project when the first customer data or external pilot user arrives:
create a new production project, point a new GitHub environment at it, let CI replay the
migrations, run the seed without fake data, and move the custom domains. Nothing in the schema
or code changes for that switch.
