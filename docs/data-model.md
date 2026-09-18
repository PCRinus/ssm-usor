# Data model and tenancy

Status: implemented for organizations, memberships, profiles, invitations, impersonations, clients, and employees  
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
Organizations are created by the seed for now. Memberships come from the seed and from
accepted invitations; no policy lets a signed-in user write `organization_members`.

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
flag would be wrong the day after the periodic training expires. Workplace, department, and SSM
post are their own future entities; no free-text stand-ins were added. Contract type, working
hours, and salary are HR data the product avoids.

The CAEN Rev. 3 class list (651 four-digit codes with Romanian names) also lives in
`packages/contracts` and feeds the form's combobox and the seed. The county list is a Zod enum in `packages/contracts`. It flows into the OpenAPI document and
the generated client, so the form and the API validate against one list, and the database
check constraint mirrors it.

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
