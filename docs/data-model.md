# Data model and tenancy

Status: implemented for organizations, memberships, profiles, invitations, onboarding, impersonations, clients, employees, participants, the facts documents print, generated documents, client files, and imports from documents  
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
`create_organization(name, owner name, terms version, accepts special clauses)` lets a signed-in account with a
confirmed email and no membership create its organization, become its `owner`, name itself,
and record the accepted terms, on the organization (`terms_version`, `terms_accepted_at`,
`terms_accepted_by`) and on the profile, in one transaction. The express acceptance of the
Terms' standard clauses (ADR 029) is required (`22023` without it) and kept as
`special_clauses_accepted_at` on the organization; organizations created before it have null. It refuses an account that
already belongs to an organization (`ORG01`). `my_open_invitations()` lists the open
invitations sent to the caller's confirmed address, without tokens, so onboarding can point
them out first. Memberships come from the seed and from
accepted invitations; no policy lets a signed-in user write `organization_members`. An owner
changes a role with `change_organization_member_role(user, role)` and removes a member with
`remove_organization_member(user)`. Both lock the organization's memberships before checking
the caller, and refuse the caller's own membership (`MEM01`), so an organization always
keeps an owner. Removal deletes the membership only.

## Subscriptions and access

`subscriptions` holds one row per paying or trialing organization
([ADR 029](architecture/adr-029-billing-plans-and-trials.md)): the `plan` (`start`,
`profesional`, `enterprise`), the `status` (`trialing`, `active`, `past_due`, `canceled`), the
`trial_ends_at`, `access_until`, when full access ends, and `trial_sms`: a trial sends no SMS, except a tester's
trial given SMS, which sends them at the full allowance of its plan. An organization without a row has
full access indefinitely: the seeded ones, the end-to-end accounts and every organization
created before billing. Members read their own organization's row; nobody writes it through the
data API.

`create_organization` starts a 30-day `profesional` trial. `extend_trial(owner email, until, reason, actor, with SMS)`, for the secret key only, moves a trial's end later, or starts a trial for an
organization without a row and returns `started` to say so. It refuses an unknown owner
(`TRL01`), a subscription past its trial (`TRL02`), an end in the past (`TRL03`), an end not
later than the current one (`TRL04`), an email that matches more than one owner (`TRL05`), and a
missing reason or actor (`22023`). Every change is written to `subscription_changes` (`source`,
`change`, `reason`, `details` with the actor), which no signed-in user reads. Only an `active`
subscription may have no `access_until`, so a cancelled or failing one always has an end.

`access_at(access_until)` answers `full` before that moment, or when there is none, and
`read_only` after it. `current_membership()` and `current_participations()` carry the result as
`access`, so the API checks it on every request without another call. Read-only is enforced
by the API, not by policies.

Once a plan is chosen, the row also carries Stripe's side: `stripe_account` (the account the
customer lives in, which a move from the PFA to an SRL may change), `stripe_customer_id`,
`stripe_subscription_id` (unique), `billing_interval` (`month` or `year`), `price_version` (the
catalogue version of its prices, such as `v1`), the quantities `employee_packs` and
`extra_members` (both 0 by default), `invoice_email`, where Oblio sends the invoices instead of
the owner, and `current_period_end`. A trial with no plan chosen has packs and members at 0 and
no Stripe subscription; a trial with a plan chosen carries all of Stripe's side, and a trial whose
plan was cancelled keeps its customer. A Stripe customer needs its
account, and a Stripe subscription its customer, interval and price version. Members read every
column but `invoice_email`, `stripe_customer_id` and `stripe_account`, which are the owner's and
reach them through the API. The plans, prices
and Stripe lookup keys themselves live in the plan catalogue in `packages/contracts`, not in the
database.

`stripe_events` records every webhook event by its Stripe id (`type`, `received_at`,
`processed_at`, and the `error` of a failed attempt), so an event delivered twice is handled
once. Nobody reads or writes it but the secret key.

`billing_invoices` holds one row per document Oblio issued for a Stripe payment, keyed by the
Stripe invoice (for a storno, by the Stripe refund it reverses, with `storno_of` pointing at the
original): the `stripe_account` that issued it, its `kind` (`invoice` in production, `proforma`
on non-prod), `amount_cents` with VAT in `currency` (negative for a storno), and the Oblio
`oblio_series`, `oblio_number` and `oblio_link`, set together with `issued_at` once Oblio has
issued it. `pdf_path` is our copy of Oblio's PDF in the private `billing-invoices` bucket
(`<organization id>/<series>-<number>.pdf`), downloaded once after issue; the bucket has no
policies, so the file is reachable only through the API's signed link. Only the owner reads
the organization's rows, as the invoices are the owner's (ADR 029); only the secret key writes.

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

`clients` stores the client companies of an organization, and its leads (ADR 007):

| Column                                           | Notes                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal_name`                                     | Required.                                                                                                                                                            |
| `cui`                                            | Required, digits only, unique per organization; checksum validated by the API.                                                                                       |
| `vat_payer`                                      | The `RO` prefix is not stored; it is represented by this flag.                                                                                                       |
| `caen_code`                                      | Four digits, leading zeros preserved (CAEN Rev. 3).                                                                                                                  |
| `trade_register_number`                          | As issued (`J40/1234/2020` or the newer `J2024…` format).                                                                                                            |
| `county_code`, `locality`, `address_line`        | Registered office; the county uses the vehicle registration code.                                                                                                    |
| `legal_representative_name`                      | Name only for now.                                                                                                                                                   |
| `declared_employee_count`                        | Headcount a lead declares before it has an employee list. A client goes by `current_employee_count(clients)`, a computed field over its current employees (ADR 010). |
| `stage`                                          | `lead` or `client`, the default. Only promotion changes it, and only one way.                                                                                        |
| `contact_name`, `contact_email`, `contact_phone` | The person the organization talks to, often not the legal representative.                                                                                            |
| `promoted_at`, `promoted_by`                     | Written by the trigger at promotion, never by hand; null for a lead.                                                                                                 |
| `archived_at`                                    | Soft delete. There is no delete policy.                                                                                                                              |

The list of clients reads the view `client_list`: the columns of `clients` the list shows, and
what each client still needs, every count one grouped read: `current_employee_count`,
`documentation_generated_type_keys` (type keys of the occupational safety set that have a
revision), `documentation_issued_count` (documents of that set with an issued revision, the
sort of `sort=documentation`), `documentation_last_generated_at` (the newest
`document_generations.created_at` of that set), the same three for the fire-safety set
(`fire_safety_generated_type_keys`, `fire_safety_issued_count`, the sort of
`sort=fireSafetyDocumentation`, and `fire_safety_last_generated_at`), and `client_since`
(`coalesce(promoted_at, created_at)`). The contract is `other`, so it counts in neither set.
A dated document counts only for the current calendar year in Romania (ADR 020): a report of
an earlier year neither stands for this year's nor counts as issued.
The view is `security_invoker`, so each table inside answers to the caller's policies, and
only `authenticated` selects from it. These were computed fields of `clients` at first, one
query per client per column, which made the list slow; `current_employee_count(clients)`
remains for the read of a single client and for the documents.

Every member corrects a client's data, and only an owner archives or restores one: the update
policy covers the row, so the trigger `clients_protect_archiving` checks the role for a change
of `archived_at` (`42501` otherwise). A caller without a user, which is the secret key of seeds
and maintenance, is let through. Archiving touches nothing under the client: employees, job
positions and documents keep their own state, which is what makes restoring one column set
back to null. An archived client keeps its CUI, so the same company cannot be added twice.

An archived client is read-only. Triggers on `employees`, `job_positions`,
`client_workplaces`, `client_responsible_persons`, `client_documents`, `document_revisions`
and `client_files` refuse every insert, update and delete under it with the code `CLA01`, and the client's own row
takes only the restore. They are triggers because an update policy that fails matches no row,
which the API would report as "not found" for a row the caller can read; and because issuing
a revision runs as its function's owner, past the policies. `is_draft_document_path` and
`is_writable_client_file_path` ask for an active client too, so the files follow. The secret key passes. Recording a leaver of an
archived client used to be allowed; with restoring one click away it no longer is.

`delete_archived_client(organization, client)` deletes an archived client outright with every row
under it, for testing an import with the same company again, which the archived client's CUI
would refuse (`IMP04`). Only the secret key runs it, since the API decides who may (anyone outside
production, a platform admin in production); a member who could call it through PostgREST would
skip that rule. It refuses a client the organization does not have (`P0002`) and an active one
(`CLA02`), and deletes, children first: the signatures of trainings, test sheets and agreements,
signed sheets and their rows, signature requests, test sheets, results and attempts with their
keys, training records and trainings, invitations and participants (their signing sessions with
them), signing agreements; the documents' sends, signed copies and revisions, the documents and
their generations, regeneration items; prevention measures, risk factors and evaluations, the
positions' equipment and instructions; the client's imports with their files and its client files;
responsible persons, employees, the fire-safety rows (buildings, equipment, installations,
maintenance items, substances, `client_fire_safety`), job positions, workplaces, owner notes,
service contracts, and the client. The guards that keep evidence for good
(`training_signatures_written_once`, `agreement_signatures_written_once`,
`test_sheet_signatures_written_once`, `test_sheets_kept`, `test_attempts_frozen`,
`test_attempt_keys_frozen`, `test_results_protect_from_attempt`,
`employee_signing_agreements_retain_recorded`) are disabled inside its transaction and enabled
again before it returns; the foreign keys stay on, so a table it forgets fails the call. It
returns the objects to remove as `(bucket, path)`: those its rows name, and every object under the
client's prefixes (`<organization>/<client>/` in `documents` and `client-files`,
`signed-sheets/<client>/`, `test-sheets/<client>/` and `signing-agreements/<client>/` in
`documents`, `<organization>/<import>/` in `imports`), since a sheet's earlier versions are kept
and no row names them. The objects themselves are the API's to remove, through Storage.

### Leads

A lead is a row of `clients` with `stage = 'lead'`: a company the organization hopes to serve.
It shares the table so that the service contract drafted for it is already the client's
document on the day of promotion. Only owners see one. The select, insert and update policies
of `clients` ask for `stage = 'client'` or `is_organization_owner()`, so a filter forgotten in
the API shows an owner too much and never shows a specialist a lead. The CUI stays unique
across both stages: a specialist who enters a lead's CUI is refused by the index, and cannot
see the holder.

`clients_protect_stage` lets an owner change `lead` to `client` (`42501` for anyone else),
stamps `promoted_at` and `promoted_by`, keeps both as they were on every other update, and
refuses the way back with `CLL02`. An archived lead is restored before it is promoted, since
an archived row takes only the restore.

Nothing of the safety work starts under a lead, which the team could not see: insert triggers
on `employees`, `job_positions`, `client_workplaces`, `client_responsible_persons` and
`client_documents` refuse with `CLL01`. They do not let the secret key through. The documents
trigger is where the service contract will be let in. A lead has client files, for owners only
(below).

`client_owner_notes` holds one free text per client, up to 5000 characters, with who last
wrote it. It is its own table because a policy hides rows and not columns, and the whole team
reads a client's row once it is promoted: the notes may hold prices and a negotiation, so
they stay the owners' afterwards too. Owners read, insert and update; nobody deletes; the
archived-client trigger applies.

Deferred on purpose: service status and contract period, financial data, several contacts as
their own table, and specialist assignment.

## What the documents print

A client's SSM documentation ([ADR 005](architecture/adr-005-document-generation.md)) names
the provider, the client's representative, its workplaces, the people it designates by
decision, and its training schedule. These facts outlast one generation, so they are stored
once. Descriptive fields are optional in the database: the generation form reports what is missing
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

| Column                                    | Notes                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `periodic_training_minutes`               | Duration of a periodic training: 60, 90 or 120.                          |
| `administrative_training_interval_months` | Technical and administrative staff and workplace managers, 1 to 12.      |
| `administrative_training_not_applicable`  | Explicit exclusion; false with a null interval means undecided.          |
| `worker_training_interval_months`         | Execution personnel, 1 to 6.                                             |
| `worker_training_not_applicable`          | Explicit exclusion; false with a null interval means undecided.          |
| `training_first_month`                    | A month with a training; the others follow by interval, around the year. |
| `training_day_from`, `training_day_to`    | The days of that month, for example 2 to 7; ordered by a check.          |
| `sensitive_groups_state`                  | `undecided`, `none` (declared without such workers) or `evaluated`.      |

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

### What a service contract prints about the provider

`organizations` also holds, all optional (ADR 007): `phone`; `iban`, without spaces and in
upper case, with a check of its shape (the API validates the check digits) and `bank_name`;
`authorization_certificate_number`, `_date` and `_issuer`, the _certificat de abilitare_;
`vat_payer`; `fire_safety_technician_name` and `_certificate`, as text, because that person
may not be a member. The name is also what the fire-safety set prints for the provider
(ADR 016). The owners' update policy covers them, and they are added to the list of
columns a member may write, which still leaves out `name` and the accepted terms.

`fire_safety_authorization` (2 to 200 characters, optional) is the inspectorate's
authorization of the provider to act as fire-safety technician under contract, Legea 307/2006
art. 12^2, as the provider writes it: "nr. 12 din 15.09.2026, ISU Cluj". One text, not a number,
a date and an issuer, while the form of the document the authorization methodology will issue is
unknown. Decision 5 of the fire-safety set prints it when set, and no readiness asks for it
([ADR 019](architecture/adr-019-fire-safety-stage-three.md)). It joins the columns a member may
write, under the same owners' update policy.

`risk_evaluator_name`, `risk_evaluator_title` (2 to 160 characters each) and
`risk_evaluator_certificate` (1 to 80), all optional, are the organization's risk evaluator
([ADR 015](architecture/adr-015-risk-assessment.md), amendment of 2026-10-22), text like the
technician because the person may not be a member. Decision 1.2 and the risk assessment name
them as the coordinator of the evaluation when the name and the title are set, the member who
generates otherwise; the API keeps the name and the title together. Added by
`20261022090000_organization_risk_evaluator`, under the same owners' update policy.

## Fire-safety data

Decided by [ADR 018](architecture/adr-018-fire-safety-means.md) and created by the migrations
`20261010100000_fire_safety_roles` and `20261010100100_fire_safety_data`; the smoking place is
[ADR 019](architecture/adr-019-fire-safety-stage-three.md)'s, created by
`20261010130000_fire_safety_smoking_place` with the organization's `fire_safety_authorization`.
`20261011090000_fire_safety_waste_kinds_length` lengthens a kind of waste and
`20261011090100_fire_safety_waste_collectors` adds who collects the waste, both amending ADR 018;
`20261011090200_fire_safety_third_parties` adds whether other firms work on the premises, amending
ADR 019. `20261012090000_workplace_kind` and `20261012100000_fire_substances` add the workplace
kind and the substances list of ADR 018's amendment of 2026-10-11,
`20261012110000_fire_maintenance_items` the free rows of its schedules, and
`20261012120000_fire_buildings` the building of a fixed-space workplace of
[ADR 020](architecture/adr-020-fire-safety-from-ten-employees.md).
The documents of the fire-safety set's second and third stages print these facts; the
occupational safety set reads none of them.

**The client's fire-safety facts.** `client_fire_safety` holds one row per client, keyed by
`client_id`, with the denormalized `organization_id` and a composite foreign key on
`(client_id, organization_id)` to `clients`. The row is created on the first save. Every column
but the keys and `waste_kinds` is nullable, so a card filled in halfway saves:

| Column                                    | Notes                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `periodic_training_hours`                 | 2 to 8: OMAI 712/2005 art. 21 asks two hours at least.                                                  |
| `administrative_training_interval_months` | 1 to 6, the range of art. 26.                                                                           |
| `worker_training_interval_months`         | 1 to 6.                                                                                                 |
| `training_first_month`                    | 1 to 12.                                                                                                |
| `training_day_from`, `training_day_to`    | 1 to 31, ordered by a check, the same shape as the occupational safety columns on `clients`.            |
| `smoking_policy`                          | `fire_smoking_policy`: `forbidden_everywhere` or `designated_places`; no default. Decision 4 prints it. |
| `smoking_place`                           | Where smoking is allowed, 2 to 240 characters; set only with `designated_places`, by a check.           |
| `waste_kinds`                             | A `text[]` of at most 12 entries of 2 to 240 characters each; `'{}'` by default.                        |
| `waste_contractor`                        | The firm that collects the waste, 2 to 160 characters.                                                  |
| `waste_collectors`                        | Who collects the waste at the client, 2 to 160 characters; null for the workers on duty.                |
| `has_third_parties`                       | Other firms work on the client's premises; `false` by default. Decision 9 then controls them.           |
| `substances_state`                        | `fire_substances_state`: `undecided`, the default, `none` or `listed`. See the substances list below.   |

The smoking place is optional even with `designated_places`: without it decision 4 says the
places are those marked "LOC PENTRU FUMAT". The API clears it whenever the card is saved with the
other policy or none, so switching to `forbidden_everywhere` drops the place rather than failing
the check, and switching back starts from an empty place.

This is the fire-safety training schedule, and it is not linked to the occupational safety one
on `clients`. While no row exists, which the API reports, the app opens the form on a starting
state: 2 hours, 3 months for both categories, and `clients.training_first_month`,
`training_day_from` and `training_day_to` when they are set. Nothing else is copied:
`periodic_training_minutes` belongs to another law, and the occupational safety administrative
interval allows up to 12 months where OMAI 712/2005 allows 6. No fire-safety document reads the
columns of `clients`.

**Workplaces.** `client_workplaces` gains eight nullable columns, and from the amendment of
2026-10-11 a `kind`, `workplace_kind`: `fixed_space`, the default, or `mobile_site`, a
temporary or mobile site with no floor area and no annex 6 norm. A mobile site keeps an area
or a norm saved before it became one, and the fire-safety set neither asks for them nor prints
them; no check forbids them, so turning it back into a fixed space restores them. `activity` ("Gelaterie",
"Birouri", 2 to 160 characters) is printed by decision 8, the list of means and the posted
sheet. `floor_area_m2` (1 to 1,000,000) is the list's "Aria utilă". `extinguisher_norm` is
the row of OMAI 163/2007 annex 6 that applies, the list's "Norma de dotare", as
`fire_extinguisher_norm`: `administrative_300`, `commercial_200`, `residential_level`,
`mixed_300` or `other_150`, or `none` for a space the annex has no row for, such as a
workshop, which the list prints as "—". `assembly_point` (2 to 240) is printed by the posted sheet and
decision 8. `combustible_materials`, `ignition_sources` and `fire_risk_equipment` (2 to 600
each) are points I.1, I.2 and I.3 of the posted sheet, and `specific_measures` (2 to 600) is
its point I.5, printed empty when null. Point I.4, the general measures, is template text, the
same at every workplace, and is not stored. A unique index on `(id, client_id)` lets the
tables below, and a responsible person, point at a workplace of the same client.
The fire risk level is not stored: no document prints it.

From the area and the norm the app shows the orientative minimum of extinguishers,
`ceil(floor_area_m2 / divisor)` with 300, 200, 300 or 150 as the divisor and at least one; a
`residential_level` workplace has no divisor and the hint reads "cel puțin unul pe nivel". A
workplace with the norm `none` and a mobile site get no minimum, and the hint reads "fără normă
din anexa 6". It is never stored, never printed and never a reason to refuse generation.

**Responsible persons.** `responsible_person_role` gains `fire_safety_coordinator` and
`fire_intervention_leader`, seven roles in all, and the check on `roles` follows the list: from
one role up to its length, as the contracts' maximum already does. A person gains an
optional `workplace_id`, tied by a composite foreign key on `(workplace_id, client_id)` to
`client_workplaces (id, client_id)`, so it names a workplace of the same client or none. None
means every workplace: the posted sheet of a workplace prints the persons whose `workplace_id`
is that workplace or null. The head of the workplace is the existing `workplace_manager`.

**Equipment.** `fire_equipment` holds one row per unit, with `id`, `organization_id` and
`client_id` and the composite foreign key to `clients`, and a required `workplace_id` with the
composite foreign key to `client_workplaces`. Rows are deleted, not archived.

| Column                               | Notes                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `kind`                               | `fire_equipment_kind`: `extinguisher`, `sand_box`, `fire_post`, `fire_blanket` or `other`.                                  |
| `agent`                              | `fire_extinguishing_agent`: `powder`, `co2`, `foam`, `water` or `clean_agent`. Set exactly for an extinguisher, by a check. |
| `capacity`                           | 1 to 250, in kilograms or litres. Set exactly for an extinguisher, by a check.                                              |
| `wheeled`                            | A wheeled extinguisher (_stingător carosabil_); false by default, and only for extinguishers.                               |
| `label`                              | Optional, 1 to 80 characters: the unit's inventory number or serial.                                                        |
| `location`                           | Optional, 2 to 160: where it hangs, "lângă casa de marcat".                                                                 |
| `manufactured_year`                  | Optional, 1990 to 2100.                                                                                                     |
| `last_service_on`, `next_service_on` | Optional dates of the maintainer's service (OMAI 163/2007 art. 133), not of the monthly check.                              |
| `maintainer`                         | Optional, 2 to 160: the authorized servicing firm.                                                                          |

An extinguisher prints as its agent's letters and its capacity: `P` for powder ("P6"), `G` for
CO₂ ("G3"), `SM` for foam ("SM6"), `AP` for water ("AP9"), `GI` for a clean agent ("GI2"). The
documents group units by agent, capacity and `wheeled` and print counts.

**Installations.** `fire_installations` holds one row per installation, with the same keys as
the equipment and deleted the same way. `kind` is a `fire_installation_kind`:
`detection_alarm`, `interior_hydrants`, `exterior_hydrants`, `sprinklers`, `smoke_exhaust`,
`emergency_lighting`, `lightning_protection`, `gas_detection` or `other`. `description` (2 to
240, "4 hidranți interiori, parter și etaj") is required for `other` and optional otherwise;
`maintainer` (2 to 160) and `last_check_on` and `next_check_on` are optional. A client may have
none. The list of means prints its exterior-hydrant accessories table only when a workplace has
an `exterior_hydrants` row.

The three tables, `client_fire_safety`, `fire_equipment` and `fire_installations`, are guarded
as `client_workplaces` is: members of the organization read and write them under the same
policies, `set_updated_at` keeps `updated_at`, the lead trigger refuses a row under a lead
(`CLL01`), and the archived-client trigger freezes them (`CLA01`). Equipment and installations
also have a delete policy, since they are deleted rather than archived. Members update only the
columns that are not keys, as on `job_position_equipment`: the freeze reads the client of the
row before the change, so a row never moves to another client, while a unit may move to
another workplace of the same one. The API also refuses to tie a unit or a person to an
archived workplace, which the foreign key alone would take, and leaves units of an archived
workplace out of its lists.

**Dangerous substances.** `fire_substances` holds one row per substance a client uses, with
`id`, `organization_id` and `client_id` and the composite foreign key to `clients`, and no
workplace. Rows are deleted, not archived.

| Column                         | Notes                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `name`                         | Required, 2 to 160 characters.                                                            |
| `classification`               | Required, 2 to 600: the CLP hazard classes and H statements, "Flam. Gas 1, H220".         |
| `quantity`                     | Required, 1 to 160, free text: "2 butelii de 11 kg".                                      |
| `physical_chemical_properties` | Optional, 2 to 1000; from section 9 of the safety data sheet.                             |
| `identification_codes`         | Optional, 2 to 600; sections 1 and 3.                                                     |
| `health_environment_risks`     | Optional, 2 to 1000; sections 2, 11 and 12.                                               |
| `protection_means`             | Optional, 2 to 1000; section 8.                                                           |
| `intervention_measures`        | Optional, 2 to 1000: intervention and first aid; sections 4, 5 and 6.                     |
| `extinguishing_agents`         | Optional, 2 to 600: agents for extinguishing, neutralizing or decontaminating; section 5. |
| `storage_place`                | Optional, 2 to 600; section 7.                                                            |
| `handling`                     | Optional, 2 to 1000; section 7.                                                           |
| `sort_order`                   | The order of the list; the API appends a new entry after the last.                        |

The client's `client_fire_safety.substances_state` says whether it uses any: `undecided` until a
member says, `none`, a declaration that it uses none, or `listed`. Two triggers keep the two in
step: a substance is inserted only under a client whose state is `listed` (`SUB02`), and the state
leaves `listed` only while the client has no substance (`SUB01`). Saving the state creates the
`client_fire_safety` row when there is none; the API still reports the card as unsaved while the
row holds nothing of the card, so the card opens on its starting values. Both are guarded as the
other fire-safety tables are, and the list is asked of every client, under ten employees too.

**Maintenance items.** `fire_maintenance_items` holds the free rows of a workplace's
maintenance and check schedules (ADR 018, amended 2026-10-11): what the inventory does not hold,
such as the yearly check of the gas installation or the chimney. It has `id`, `organization_id`,
`client_id` and `workplace_id` with the composite foreign keys of `fire_installations`, so a row
never sits on another client's workplace, and may move to another workplace of the same client.

| Column           | Notes                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `subject`        | What is checked, required, 2 to 160 characters.                                          |
| `interval_label` | How often, as printed: "anual", "la 6 luni"; required, 2 to 60. No interval is computed. |
| `checked_by`     | Who checks it, required, 2 to 160.                                                       |
| `sort_order`     | The order on the workplace; the API appends a new row after the workplace's last.        |

Rows are deleted, not archived, and guarded as the other fire-safety tables are. They are
optional: no readiness code asks for them, and the schedules 5.4 print them below the rows they
derive from the equipment and the installations.

**Buildings.** `fire_buildings` holds the building of a fixed-space workplace (ADR 020), one row
at most per workplace (`unique (workplace_id)`), for the site sheet 7.1. It has `id`,
`organization_id`, `client_id` and `workplace_id` with the composite foreign keys of
`fire_installations`; neither key is granted for update, so a building never moves. Every fact
is nullable:

| Column                     | Notes                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `year_built`               | `smallint`, 1800 to 2100 in the database; the API refuses a year after the current one. |
| `built_area_m2`            | `numeric(10, 2)`, above 0.                                                              |
| `levels`                   | The height regime as written, "P" or "P+1E"; 1 to 40.                                   |
| `classification`           | `fire_building_classification`: `civil`, `production`, `storage` or `mixed`.            |
| `structure`                | The load-bearing structure, 2 to 120.                                                   |
| `heating_fuel`             | 2 to 80.                                                                                |
| `gas_use`                  | What natural gas or LPG is used for, or that none is; 2 to 120.                         |
| `electrical_maintainer`    | The firm that maintains the electrical installation, 2 to 160.                          |
| `electrical_last_check_on` | Its last check.                                                                         |
| `water_reserve_m3`         | `numeric(10, 2)`, 0 or more; 0 says there is no reserve of its own.                     |
| `notes`                    | Anything else the sheet should carry under the building, 2 to 1000.                     |

The detection and alarm, the safety lighting, the hydrants and the lightning protection are not
stored here: the sheet reads them from `fire_installations` by kind. A row is kept, and not
printed, when its workplace becomes a mobile site; the API refuses to save one for a mobile site.
Rows are deleted, not archived, and guarded as the other fire-safety tables are. No readiness code
asks for any of it: an empty building is a sheet with more gaps.

**Readiness.** The fire-safety set adds these codes to `missingDocumentData` and
`fireSafetyMissingDocumentData`: `fire.trainingSchedule` (the hours, both intervals, the first
month and both days set), `fire.waste` (at least one kind), `fire.workplaces` (the seven
columns above other than `specific_measures` set on every active workplace), `fire.equipment`
(an extinguisher in every active workplace), `responsible.fire_safety_coordinator` and
`responsible.fire_intervention_leader` (an active person in each role). It also asks the existing `responsible.workplace_manager` and
`positions.any`. Any of them refuses the whole set's generation. ADR 019 adds `fire.smokingPolicy` (a policy
chosen) and `provider.fireSafetyTechnicianCertificate`; neither the smoking place nor the
authorization is ever asked for. The amendment of 2026-10-11 adds `fire.substances`: the
substances state `none`, or `listed` with at least one substance.

**What the templates read.** Fire-safety templates read these facts from one merge object,
`fire`, and nothing else about the client beyond `client`, `provider`, `fireSafetyTechnician`,
`issueDate` and `branding`. Its `staff` holds the names of the current job positions by staff
category and nothing else of them. The data snapshot keeps the whole `fire` value, so an edit
of any fact above marks the set's drafts "Date modificate" and leaves the occupational safety
ones alone. Fire-safety decisions print the generation's `first_decision_number` plus their
fixed ordinal in the binder (1 to 9) minus one, and the fire-safety generation asks for
that number. The two decisions required only from ten employees take the last ordinals, 8 the
seasons and 9 the own control (ADR 020). A fire-safety decision stores its printed number in
`decision_number`, and a document of the set is compared with its snapshot, and generated
again, with the first number it was made with.

**Documents from ten employees.** Decisions 8 and 9, the schedules (`fire_maintenance_schedules`),
the installation register (`fire_installation_register`), the site sheet (`fire_site_sheet`)
and the annual report (`fire_annual_report`) are part of a client's fire-safety set from 10
current employees,
the same `current_employee_count(clients)` that decides decision 1.5 (ADR 010, ADR 020), or once
the client has a revision of them, whatever the count is then. Nothing is stored for it: the
facts read which of the six have a revision, and the merge data carries `seasonsDecision`,
`controlDecision` and `installationRegister` beside `fire`, so a draft of a cover is marked
"Date modificate" when the client crosses ten, not when any other fact changes.

## Employees

`employees` stores the people employed by a client, one row per employment. A person working
for two clients is two rows; there is no shared person entity. The row carries `client_id`
and a denormalized `organization_id`, and a composite foreign key on `(client_id,
organization_id)` guarantees the client belongs to the same organization, so the policies
stay a one-line comparison like on `clients`.

| Column                                      | Notes                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `last_name`, `first_name`                   | Required, separate columns: forms print "Numele și prenumele" and lists sort by last name.                                                                        |
| `cnp`                                       | Optional, thirteen digits; checksum and date validated by the API. Unique per client.                                                                             |
| `employee_number`                           | The client's own identifier (marca); import and dedupe key. Unique per client.                                                                                    |
| `email`, `phone`                            | Optional, for invitations and remote signing. The phone is E.164 (see Participants).                                                                              |
| `job_title`                                 | Required free text (funcția). A COR code column will join it once the list exists.                                                                                |
| `contract_number`                           | Optional: the number of the individual employment contract, trimmed, up to 50 characters. The signing agreement prints it beside `hired_at`, the contract's date. |
| `hired_at`                                  | Required; drives the introductory training deadline. Tenure is computed, never stored.                                                                            |
| `status`, `terminated_at`                   | `active` or `terminated`; the date is required exactly when terminated.                                                                                           |
| `birth_date`, `birth_place`, `home_address` | Optional fields of the individual training sheet. The birth date must agree with the CNP.                                                                         |
| `blood_group`, `rh_factor`                  | Optional, constrained to `0(I)`, `A(II)`, `B(III)`, `AB(IV)` and `+`, `-`.                                                                                        |
| `notes`                                     | Free text, up to 2000 characters.                                                                                                                                 |
| `workplace_id`                              | Optional: the workplace the person works at, by a composite foreign key on `(workplace_id, client_id)` to `client_workplaces (id, client_id)`. ADR 021.           |
| `qualification`, `education`                | Optional free text the individual training sheets print (calificarea, studiile), up to 160 characters each.                                                       |
| `authorizations`                            | Optional free text (autorizații: "ISCIR" and the like), up to 500 characters.                                                                                     |
| `commute_route`, `commute_minutes`          | Optional: the commute (traseul de deplasare) as free text up to 1000 characters, and its duration, 1 to 600 minutes.                                              |
| `archived_at`                               | Soft delete for rows entered by mistake; a leaver is a status change, not an archive.                                                                             |

Both unique indexes are partial on `archived_at is null`, so archiving a mistaken row releases
its CNP and employee number. The insert policy additionally requires the client to be active
(`archived_at is null`). The update policy does not; the freeze below is what keeps an archived
client's employees as they are, leavers included.

The CNP is optional per the product scope, protected by row-level security like every other
column, and returned only by the detail route. It is not encrypted at the column level; an
audit log of full-CNP reads is planned together with the employee dossier.

There is no suspended status. A paused contract (parental or medical leave, unpaid leave,
technical unemployment) is an absence with a start and a return date, and the return after
more than 30 working days triggers supplementary training; it will be a dated event next to
the training records, from which "currently absent" is derived.

Not on the employee row, on purpose: training completion, signatures, and medical fitness.
Those are evidence records with dates and actors (the training records below), because a
flag would be wrong the day after the periodic training expires. The employee responses carry
each domain's training state, next training due and last periodic training as `training`,
computed by the `employee_training_status` view below and never stored. The post a person fills is
a job position, below. Departments are a future entity; no free-text stand-in was added. Contract type, working
hours, and salary are HR data the product avoids.

The workplace and the commute are optional on the row and on the form: the occupational safety
sheet is what requires the commute route, and both sheets the workplace at a client with
several ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)). Adding an
employee without a workplace gives them the client's only active one when it has exactly one;
the API does that, not a trigger, and refuses a workplace that is archived or belongs to another
client, which the foreign key alone would take. The foreign key restricts deleting a workplace an
employee points at; archiving one leaves the employees on it.

The employee lists are searched by text (ADR 021). Matching is a substring per term: the API
lowercases the query, strips its diacritics, splits it on anything that is not a letter or a
digit, and asks, for every term, `ILIKE '%term%'` on the computed field
`employee_search_name(employees)` (`lower(unaccent_immutable(last_name || ' ' || first_name))`),
on `employee_number`, and for the organization-wide list on
`employee_client_search_name(employees)`, the client's legal name the same way. Every term must
match one of them, so `stefan tar` finds "Țăranu Ștefan" and `naval popescu` the Popescu of the
naval yard. A substring was chosen over a prefix of a word because people type the part they
remember, the middle of a double name or the digits of an employee number, and a list of a few
thousand rows per organization does not need ranking. Splitting on punctuation is also what
keeps a typed comma or parenthesis out of PostgREST's filter syntax.

`unaccent` and `pg_trgm` live in the `extensions` schema. `unaccent()` is only stable, since it
looks its dictionary up by name, so `public.unaccent_immutable(text)` wraps it with the
dictionary named with its schema, and the index can use the wrapper. `employees_search_name_idx`
is a GIN trigram index on the same expression, because a btree cannot serve a match in the
middle of a string; `employees_employee_number_search_idx` is one on the employee number.
`employee_search_name` must stay inlinable to use the index: a plain SQL function without
`set search_path`. The client's name is a subquery per row, read as the caller, and
has no index; the organization's own employees are few enough for it.

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

## Training records

A **training held** is one row of `trainings`, and each employee who attended it one row of
`training_records`, the **training record** the individual training sheets print
([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)). Both carry
`client_id` and a denormalized `organization_id` with the composite foreign key to the client,
the four policies of the organization's members (insert only for an active client), the
archived-client freeze and the lead trigger, as the other tables under a client do. The records
are kept whatever becomes of the employee: a leaver's sheets stay printable.

| `trainings` column                    | Notes                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                              | `training_domain`: `ssm` or `psi`.                                                                                                      |
| `phase`                               | `training_phase`: `introductory_general`, `workplace`, `periodic` or `supplementary`.                                                   |
| `held_on`                             | The day it was held. The API refuses a day after today in Romania.                                                                      |
| `duration_minutes`, `material`        | 1 to 600 minutes; the material taught as text, 1 to 4000 characters. Kept as saved, whatever the themes they were proposed from become. |
| `trainer_name`, `trainer_job_title`   | Required, 1 to 160 characters each.                                                                                                     |
| `verifier_name`, `verifier_job_title` | Both or neither: the fire-safety sheet has no verifier's signature.                                                                     |
| `supplementary_reason`                | `supplementary_training_reason`, one of the cases of H.G. 1425/2006 art. 98; set exactly when the phase is `supplementary`.             |
| `source`                              | `training_source`: `app`, or `paper` for a training typed from a sheet filled by hand, whose signatures are on the paper.               |
| `themes_revision_id`                  | The training themes revision the material was proposed from, if any; set null when that revision is deleted.                            |
| `notes`                               | Optional, up to 2000 characters.                                                                                                        |

| `training_records` column                                  | Notes                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `training_id`, `phase`                                     | The training and its phase, together with `client_id` a foreign key to `trainings (id, client_id, phase)`, deleted and updated with it. |
| `employee_id`                                              | An employee of the same client in any status, by the composite key `(employee_id, client_id)`; once per training.                       |
| `occupation`                                               | The name of the employee's job position when the record was made: a person who changes post keeps the rows of the old one.              |
| `admitted_on`, `admitted_by_name`, `admitted_by_job_title` | "Admis la lucru": all three or none, and only on a workplace training, which the check reads from the record's own `phase`.             |

The phase is kept on the record so that a check constraint, not a trigger, holds the admission
to the workplace training; the foreign key carries a change of the training's phase to its
records. Members update a training's facts and a record's admission only: a training never
moves to another client, and a record never to another training or person.

`save_training(...)` records a training and its attendees in one transaction, or with
`p_training_id` replaces both: the records of attendees left out are deleted, those who stay
keep their record and its occupation, the new ones get a record, and the one admission given
is set on every attendee. It runs as the caller and returns null for a client or a training
the caller cannot see. Deleting a training deletes its records; until signatures exist a
record is editable and deletable like any fact entered by hand. A signed record is frozen, see
[Signatures](#signatures); `save_training` clears an admission only when the phase stops being
`workplace`, so that saving a signed training unchanged changes nothing.

### Next training due and training state

`employee_training_status` is a view, security invoker, with one row per employee and, for
each domain, `<domain>_last_periodic_on`, `<domain>_workplace_trained_on`,
`<domain>_has_hiring_training`, `<domain>_due_on` and `<domain>_state`, then, last,
`<domain>_interval_months` and `<domain>_interval_source` (`position`, `client` or null; never
`position` for `psi`). Nothing of it is stored.

- The interval runs from the day of the last periodic record, else of the latest workplace
  record, else the hire date. A supplementary record never moves it.
- The interval is, for `ssm`, the position's `training_interval_months`, else the client's
  interval for the position's staff category; for `psi`, the `client_fire_safety` interval for
  the category, which a position cannot override. An undecided interval, or a category the
  client does not train, leaves `due_on` null, and so does the lack of a hiring record: an
  `untrained` employee has no due date.
- The state (`training_state`) is `untrained` without an introductory general or a workplace
  record in the domain; otherwise `overdue` once `due_on` has passed, `due` when it falls
  within the next thirty days, else `current`, as it is without a due date. A terminated
  employee has a null state. Days are Romanian days, as the documents date them.

`employee_training_due(...)` computes one domain for one employee; it sets no `search_path`
and qualifies every name instead, so that the planner inlines it. The employee lists read the
view through `training_status(employees)`, a PostgREST computed relationship (to-one, `rows
1`), embedded as `training_status(...)` and as `training_status!inner(...)` with an `or`
filter when the list is filtered by a training state. A row costs a few index reads:
`training_records (employee_id)` and the primary keys; `trainings (client_id, domain, phase,
held_on)` serves a client's list of trainings.

## Knowledge tests

The **knowledge tests** of [ADR 024](architecture/adr-024-knowledge-tests.md) are three: the
hiring test of each domain and the fire-safety annual test (`knowledge_test`: `hiring` or
`annual`; `annual` goes with `psi` only, a check on every table below). Their questions live in
a **question bank**, a sitting of ten of them is a **test attempt** a participant takes in the
portal, and a pass is a **test result**, from an attempt or from the printed test.

### The question bank

`test_questions` holds the bank of every organization at once. A **built-in question** has no
`organization_id`: the app's, seeded by migration with fixed ids, read by every member and
written by none, so that a later migration corrects one in place. An **own question** belongs
to its organization, written, edited and deleted by any member.

| Column                 | Notes                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`, `test`       | `training_domain` and `knowledge_test`; never updated, so a question never moves to another test.                                                        |
| `position`             | The order the printed test lists the questions in, from 1; an own question with a built-in's position comes after it. Built-ins are unique per position. |
| `text`                 | Trimmed, 5 to 1000 characters.                                                                                                                           |
| `options`              | Two to four `{ "text", "correct" }`, the text trimmed, 1 to 500 characters, at least one correct (`test_options_are_valid`, a check).                    |
| `explanation`          | Optional, up to 1000 characters: what the study card shows, and a failed attempt after a wrong answer.                                                   |
| `citation`             | Optional, up to 300 characters: the act and article the question rests on.                                                                               |
| `replaces_question_id` | On an own question only: the built-in of the same test it departs from, provenance only (`TST02` otherwise); set null if that built-in goes.             |

`test_question_hides` holds `(organization_id, question_id)` for each built-in an organization
hides; deleting the row restores it. Members read, insert and delete their organization's; an
own question is not hidden (`TST02`) but deleted.

A question is **active** for an organization when it is a built-in the organization has not
hidden, or one of its own; `active_test_questions(organization, domain, test)` lists them in the
printed order, as the caller, so a participant gets nothing. A test keeps at least ten: hiding a
built-in or deleting an own question that would leave fewer raises `TST01`
(`test_below_minimum`), under an advisory lock per organization and test so that two at once
cannot both pass. The seeded sets hold ten, twelve and ten, so the occupational safety hiring
test needs an own question before anything is hidden.

The options carry the key, so `test_questions` is the members' alone: both select policies ask
for a membership. The seeded content is reviewed in [test-questions-seed.md](test-questions-seed.md).

### Test attempts

A **test attempt** (`test_attempts`) is one sitting by a participant: `client_id` with the
denormalized `organization_id`, `employee_id` and `participant_id` by composite keys to the
client, the domain and test, `started_at` and `finished_at`, `language` (`ro` only), `total`,
`score` and `passed` (the last two set at the finish, with `finished_at`),
`material_revision_id` (the issued revision of the material the portal showed, if any),
`client_address` and `user_agent`. One attempt is in progress per participant and test.

`questions` is the sitting as shown, in the shown order:
`[{ "question_id", "text", "options": [{ "text" }], "chosen": [i, ...] }]`, `chosen` holding
indices into the shown options, empty while unanswered. The row never carries the key: the
correct options in the shown order and the explanations are in `test_attempt_keys`, which has
no policy and no grant, and the finish adds to each question only `correct` and `explanation`.
The key stays after the finish, since a bank of ten shows the same questions at every retake. A
finished attempt and its key are frozen: an update or a delete raises `TST03`
(`attempt_finished`), whoever makes it, and neither table is truncated.
Archived clients and leads take no attempt.

Nobody writes the table directly. The portal's routes run as the participant and call these
functions, security definer, which act only for the caller's own active participation as an
employee (`P0002`, `participant_not_found` or `attempt_not_found`, otherwise):

| Function                                                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start_test_attempt(participant, domain, test, material_revision, address, agent)` | Refuses a test that does not await the employee (`TST05`, `test_not_awaiting`): the hiring test awaits while the state is `pending`, the annual test while it is `annual_due`. Returns the attempt in progress if there is one; otherwise draws ten active questions of the client's organization at random, shuffles each one's options and inserts the attempt. A material revision must be an issued one of the client's (`P0002`, `material_not_found`). |
| `answer_test_attempt(attempt, question_index, chosen)`                             | Stores the options chosen for one question, sorted and distinct; `TST04` for a question or an option out of range (`question_out_of_range`, `option_out_of_range`), `TST03` once finished.                                                                                                                                                                                                                                                                   |
| `finish_test_attempt(attempt, address, agent)`                                     | Scores and finishes: a question counts only when the options chosen are exactly the correct ones, and `passed` is a score of at least 70% of `total`, seven of ten. A pass inserts the test result while the test still awaits the employee, so an attempt left open across a paper pass gives no second one.                                                                                                                                                |
| `test_study_card(participant, domain, test)`                                       | The explanations of the test's active questions, for the study card.                                                                                                                                                                                                                                                                                                                                                                                         |

Members read their organization's attempts and participants their own employee's, each finished
question marked right or wrong but never which option is correct. The client administrator
reads none.

### Test results

A **test result** (`test_results`) is a pass, under a client as the training records are, with
`employee_id` in any status.

| Column                                | Notes                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `domain`, `test`, `taken_on`          | The test and the Romanian day it was passed.                                                                                      |
| `material`                            | What the sheet prints as the material examined, as "Test de verificare a cunoștințelor la angajare (TASSM)"; 1 to 300 characters. |
| `grade`                               | `admis` only: a failed test is not recorded.                                                                                      |
| `examiner_name`, `examiner_job_title` | Both or neither; required on paper. Null on a portal pass the organization had nobody to propose for, until a member names them.  |
| `source`                              | `test_result_source`: `portal`, exactly when `attempt_id` is set, or `paper`.                                                     |
| `attempt_id`                          | The passing attempt, unique, by a composite key to the attempt's employee, domain and test.                                       |

`finish_test_attempt` inserts the portal result, the day being the finish's, with the examiner
proposed: for fire safety the organization's `fire_safety_technician_name` as "Cadru tehnic
PSI", else the trainer and job title of the employee's latest introductory general training in
the domain, which for occupational safety is the specialist. A member records a paper result
(only `source = 'paper'`, for an active client) and updates `taken_on`, `material` and the
examiner; a portal result changes only in its examiner and is not deleted (`TST06`,
`result_from_attempt`). Members read their organization's results, participants their own, the
client administrator the client's. Once the examiner has signed the result's test sheet,
electronically or on paper, its examiner no longer changes (`TST07`, `examiner_signed`); before
that, a change of examiner voids the pending examiner request with `signer_changed`
([test sheets](#test-sheets)).

### Test state

`employee_test_status` is a view, security invoker, beside `employee_training_status`: one row
per employee with, for each domain, `<domain>_hiring_trained_on`, `<domain>_last_passed_on`,
`<domain>_state` and `<domain>_awaiting_test`, and `psi_due_on`. Nothing of it is stored.

- The hiring training the test closes is the latest `introductory_general` record for `ssm` and
  the latest `workplace` record for `psi`, whose one test closes both hiring trainings.
- Any result in the domain is a pass, an annual one included; `psi_due_on` is twelve months
  after the last.
- The state (`test_state`) is `none` with neither a pass nor a hiring record, `pending` with the
  record and no pass, `annual_due` for `psi` once `psi_due_on` is today or past, else `passed`. A
  terminated employee has a null state. `<domain>_awaiting_test` is `hiring` while `pending` and
  `annual` while `annual_due`.

`employee_test_due(...)` computes one domain for one employee and is inlined, as
`employee_training_due` is; the employee lists embed the view through `test_status(employees)`,
a PostgREST computed relationship (to-one), as they embed `training_status`.

Errors, raised with these SQLSTATEs:

- `TST01` the test would keep fewer than ten active questions
- `TST02` only a built-in of the same test is hidden or replaced
- `TST03` a finished attempt is frozen
- `TST04` the answer does not fit the attempt
- `TST05` the test does not await the employee
- `TST06` a portal result changes only in its examiner and is not deleted

`portal_material(participant, domain)`, security definer, answers the caller's own client's
newest issued revision, with its PDF path, of the general training material (`ssm`) or the
fire-safety own instructions (`psi`): what the portal shows with a test, read by the API with the
secret key, since a participant reads no document row.

## Protective equipment

`job_position_equipment` holds what the holders of a job position receive against the risks
of the post ([ADR 011](architecture/adr-011-protective-equipment.md)): one row per item, on
the position, never on the employee. It carries the same `client_id`, `organization_id` and
composite foreign keys as the position, and goes with a position deleted as a mistake.

| Column            | Notes                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `risk`            | What the item protects against, free text: "Înțepături, tăieturi (mâini, brațe)".                                                        |
| `item`            | The item, free text: "Mănuși de protecție mecanică".                                                                                     |
| `quantity`        | Granted at once, 1 to 999, default 1.                                                                                                    |
| `duration_months` | The normed duration of use. Required for the two inventory modes, null for a consumable: a check constraint ties the two.                |
| `allocation`      | `personal_inventory`, `section_inventory` (kept at the workplace and shared) or `consumable`, the modes Ordinul 225/1995 names plus one. |

`job_positions.needs_protective_equipment` is the position's decision: null until decided,
which blocks generating the documentation; false when the post needs none; true while it
has entries. Triggers keep it in step: the first entry sets it to true, deleting the last one
sets it back to null, and an update by hand is refused when it contradicts the entries
(`EQP01` for false with entries, `EQP02` for true without).

Members read, create, update and delete the entries of their organization under active
clients; updates are granted on the five descriptive columns only, so an entry never moves to
another position.

## Instruction modules

`instruction_modules` is the organization's instruction library
([ADR 012](architecture/adr-012-own-instructions.md)): one row per own instruction for a work
activity, a piece of work equipment or a category of protective equipment, with a `title`,
unique within the organization among the modules in use ignoring case, a `module_group`
(`work_activity`, `work_equipment`, `protective_equipment`), a `domain` and `archived_at`. The
**domain** (`instruction_domain`, ADR 012's amendment of 2026-10-11) says whose own instructions
annex the module: `ssm`, the default and every module made before it, for the occupational
safety set's 3.2, or `psi` for the fire-safety set's 2.1. There is one library and one title
space for both. The file is
the module, kept as its author made it: `instruction_module_versions` holds one row per save
or upload, numbered from 1 per module, with the `sha256`, `size_bytes` and `article_count` of
the file (the top-level items of its most used numbered list, which the training themes
cite) and its `docx_path`, which a check constraint holds to
`<organization>/<module>/<number>.docx`. Nothing changes in place: versions are never updated
or deleted, so a document snapshot can name the version it annexed. The files live in the
`instruction-modules` bucket; the row comes first, and the storage policy accepts an upload
only at a path a version of the caller's organization names.

`job_position_instructions` says which modules a job position applies, one row per pair,
with the same composite foreign keys as the equipment entries and a third one tying the
module to the same organization, and the `domain` the module was applied in (`ssm` when not
given). A position decides about each domain apart: `job_positions.needs_instructions` is the
occupational safety decision and `needs_fire_instructions` the fire-safety one, each kept in
step by triggers with the rows of its own domain exactly like the equipment decision: null
until decided, which blocks generating that set's own instructions (and the whole fire-safety
set); false when the post needs none beyond the common part; true while it applies modules of
the domain (`INS01` for false with modules applied, `INS02` for true without). A row whose
domain is not its module's is refused (`INS06`), and so is changing the domain of a module a
current position applies (`INS07`); an archived position's rows keep the domain they were
applied in, since an archived position is never restored. Applying an archived module is
refused (`INS03`), archiving a module a current position applies is refused (`INS04`), and an
archived module takes no new version (`INS05`).

Members read, create and update their organization's modules, add versions, and apply and
remove modules for positions of active clients; updates are granted on the title, the group,
the domain and `archived_at` only.

## Risk evaluations

`risk_evaluations` holds the client's evaluated work systems
([ADR 015](architecture/adr-015-risk-assessment.md)), from which the risk assessment and the
prevention plan are generated. `kind` is `job_position`, with a `job_position_id` (at most one
evaluation per position, and it goes with a position deleted as a mistake), `sensitive_groups`
(at most one per client), or `other`, with a `name` unique within the client ignoring case
and the spaces around it; a check constraint ties `job_position_id` and `name` to the kind. The
evaluation records `means_of_production` and `work_environment` as free text and `exposure`,
"8 h / schimb" by default. An evaluation that is not of a position also records `work_task`
and `exposed_persons` ("Min. 3 persoane") as free text; a position's evaluation reads them
from the position's activities and current employees, and a check constraint keeps them null
there. It carries the same `client_id`, `organization_id` and composite foreign keys as the
equipment entries, and an insert under a lead is refused (`CLL01`).

`clients.sensitive_groups_state` says what the client answered about the sensitive groups:
`undecided` until a member says, `none`, a declaration that the client has no workers from
them, or `evaluated`. Two triggers keep it true: inserting or deleting the sensitive groups'
evaluation sets `evaluated` or `undecided` (as the function's owner, so the seed and the flows
count too), and an update by hand is refused unless it agrees with the evaluation's existence
(`SGR01`), so `none` never sits beside an evaluation and nobody writes `evaluated`.

`risk_factors` hangs off the evaluation, with the same `client_id` and `organization_id`, and
goes with it:

| Column                     | Notes                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `component`                | `executant`, `work_task`, `means_of_production` or `work_environment`.                    |
| `factor_group`             | Free text under the component: "Factori de risc mecanic", "Acțiuni greșite".              |
| `description`              | The concrete form the factor takes.                                                       |
| `gravity_class`            | 1 to 7, chosen by the evaluator.                                                          |
| `probability_class`        | 1 to 6, chosen by the evaluator.                                                          |
| `actions`                  | For the prevention plan, free text, null until typed.                                     |
| `deadline`                 | For the plan, free text: "Permanent", "Trimestrial".                                      |
| `responsible_person`       | For the plan, free text.                                                                  |
| `observations`             | For the plan, free text.                                                                  |
| `sort_order`               | The factor's place in the evaluation, from 0; new factors and copies go after the others. |
| `source_profile_factor_id` | The profile factor this one was copied from or saved as, null once that is deleted.       |

The risk level and the global level are not stored: code reads them from the classes with the
method's grid (`risk-levels` in `packages/contracts`), so they never disagree with them.
`prevention_measures` holds a factor's measures, each a `kind` (`technical`, `organizational`,
`hygienic_sanitary`, `other`: the columns of annex 7 to H.G. 1425/2006), a `description` and a
`sort_order`. Measures are never updated in place.

Three functions run as the caller, so the policies and the archived-client triggers decide,
and each is one transaction. `save_risk_factor` adds a factor after the others, or replaces
one and all its measures, and returns its id, or null when the evaluation or the factor
within it is not the caller's. `reorder_risk_factors` renumbers the factors and returns false
unless it is given every factor of the evaluation once. `copy_risk_factors` appends copies of
another evaluation's factors with their measures, only within one client (`RSK01`
otherwise), and returns how many it copied.

Members read, create, update and delete the evaluations and factors of their organization
under active clients, and create and delete measures. Updates are granted on the evaluation's
`name` and five texts, and on the factor's descriptive columns and `sort_order`, so neither
moves to another position, evaluation or client. No update is granted on
`source_profile_factor_id`: only the profile functions below set it, and `copy_risk_factors`
carries it along.

### Evaluation profiles

`evaluation_profiles` is the organization's risk library: a `name`, unique within the
organization ignoring case and the spaces around it, and nothing else; the library starts
empty. `evaluation_profile_factors` and `evaluation_profile_measures` hold a profile's factors
and their measures with the same columns, checks and enums as `risk_factors` and
`prevention_measures`, tied to the profile and its organization by composite foreign keys
and deleted with it. They are tables of their own rather than evaluations without a client:
every key, trigger and policy on the evaluation tables is the client's (the archived-client
and lead triggers, the client's foreign keys, the policies that ask for an active client).
Only the factors copied from a profile refer to it, as provenance, so a profile is deleted,
not archived.

Each function is one transaction. `save_evaluation_profile_factor` and
`apply_evaluation_profile` run as the caller. `save_evaluation_profile_factor` is
`save_risk_factor` for a profile. `apply_evaluation_profile` appends copies of a profile's
factors and measures after an evaluation's own, each pointing at the factor it was copied from
by `source_profile_factor_id`, and returns how many; a profile of another organization is
refused (`RSK02`), and an archived client by its trigger (`CLA01`).
`save_risk_evaluation_as_profile` runs as its owner, because it writes
`source_profile_factor_id`, and so checks the caller's organization itself. It creates a
profile by name with copies of an evaluation's factors and measures in their order, points each
of the evaluation's factors that had no origin at its copy, and returns the profile's id, or
null when the evaluation is not the caller's; a taken name fails on the unique index (`23505`).
It works for an archived client's evaluation, whose factors it leaves unlinked. The pointer is
provenance only ([ADR 015](architecture/adr-015-risk-assessment.md), amended 2026-10-05):
later changes on either side stay there. Deleting a profile or its factor clears it through the
foreign key, which the archived-client trigger on `risk_factors` lets through.

Members read, create, update and delete their organization's profiles and profile factors,
and create and delete profile measures. Updates are granted on the profile's `name` and on the
factor's descriptive columns and `sort_order`.

## Generated documents

A document is generated from a versioned Word template and from then on its `.docx` file is
the source of truth ([ADR 005](architecture/adr-005-document-generation.md)). The tables say
which file is which; the files live in Supabase Storage.

**Templates.** `document_templates` holds one row per document type (`type_key`, for example
`decision_training`), with `organization_id` null for the built-in set. A provider's own
templates will carry their organization. `document_template_versions` holds the files: a
version number, the Storage path, the SHA-256 of the file, and why the version exists
([ADR 017](architecture/adr-017-legislation-monitoring.md)). Its `kind` is `legal` when a
quoted or referred legal text changed, `correction` when the template's own content was
fixed, and `layout` when no words changed; legal and correction versions prompt
regeneration, layout versions do not. Its `note` says what changed, in Romanian, for
members, at most 500 characters; it is null for the versions registered before ADR 017,
which all count as corrections. The master copies of the built-in set live in the
repository, with the kind and note of each file's latest change in its manifest;
`register_built_in_template_version(type, title, path, hash, kind, note)`, reachable only
with the secret key, registers one and is idempotent: the same hash is the version it
already is, with the kind and note it was first registered with, and a new hash becomes the
next version. Members read templates and have no write policy.

**Documents.** Each client has two documentation sets, the occupational safety set and the
fire-safety set (ADR 016). `client_documents` holds a document type once per client and
`period`, with its title, its set in `document_group`, and, for decisions, the
`decision_number`, which stays the same across revisions. `period` is the year a **dated**
type reports on ([ADR 020](architecture/adr-020-fire-safety-from-ten-employees.md)), a
`smallint` from 2000 to 2100, and null for every other type; the check
`client_documents_period_only_dated` sets it exactly for the dated types, today
`fire_annual_report`, mirroring `datedDocumentTypeKeys` in the contracts. The unique
constraint `client_documents_type_key` is on `(client_id, type_key, period)` with nulls not
distinct, so an undated type appears once per client and a dated one once per year, each year
a document with revisions of its own. A year rather than text because the API and the app
count with it and it sorts as a number; the half-yearly report ADR 020 defers can add its half
beside it. `document_generations` records
what was asked when generating: the set in `document_group` (`documentation_set`, the
default, or `fire_safety_set`, never `other`), the `issue_date` and the
`first_decision_number`, which the occupational safety set always has and the fire-safety set
has from its second stage on (ADR 018): a generation of its first stage, made before it had
decisions, left it null. Users never see it; it keeps the inputs that are not facts about the
client.

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

### Documents behind and regeneration jobs

`documents_behind` is a view, security invoker, so every table in it answers to the caller's
policies: one row per document of an active client (not archived, stage `client`) whose newest
revision, by number, was generated from a template version older than a `legal` or
`correction` version of the same template ([ADR 017](architecture/adr-017-legislation-monitoring.md)),
or, for `own_instructions`, `training_themes`, `fire_own_instructions` and
`fire_training_themes`, built from instruction module versions the library has since replaced
or citing another set of modules than the client's current positions apply in the document's
domain ([ADR 014](architecture/adr-014-training-themes.md), amendment of 2026-10-22). The
cited versions are read from the revision's `data_snapshot`: `annexes[].versionId` for the own
instructions, `themes.ownInstructionsRevision.versionIds` and
`fireThemes.ownInstructionsRevision.versionIds` for the themes. It carries the document, the
client's name, the version the revision came from (`revision_version`), the template's newest
version with its kind and note, `edited_draft`, set when that revision is a draft saved by
hand since it was generated, `behind_template`, and `instruction_changes`, a JSON array of
`{code, title, newestVersionAt}` with `module_version`, `module_added` or `module_removed`
per module, empty for a document behind its template alone. An uploaded revision has no
template version and is never in it; neither is the service contract (group `other`), which is
regenerated from its own page, nor a dated document of an earlier period than the client's
newest of that type (ADR 020): an earlier year's report is what was written for that year.

`regeneration_jobs` holds one document type regenerated for every client behind it: the
organization, `type_key`, `requested_by` (the member the documents name as their specialist),
`requested_at`, `total_count`, `done_count`, `skipped_count`, `failed_count`, and
`finished_at`, which checks keep set exactly when the three counts add up to the total. A
partial unique index allows one unfinished job per organization and type.
`regeneration_job_items` holds one row per client of a job (`job_id`, `client_id`), with a
`status` of `queued`, `done`, `skipped` or `failed`, a `detail` in Romanian for members, and,
for a client failed because data its document prints is missing, `missing`: the codes of that
data, which the Legislație page turns into rows leading to where each is filled in.

Members read their organization's jobs, and the items of the jobs they can read; nobody writes
them but the secret key, through two functions granted only to it.
`start_regeneration_job(organization, type, requested_by, clients)` opens a job with the
clients of that organization among those given, each once; one still running raises
`23505`, and one unfinished after an hour is closed first, its queued clients failed, since a
message the queue gave up on would otherwise hold the type.
`record_regeneration_item(job, client, status, detail, missing)` records what became of a client only
while it is `queued`, so a message delivered twice counts once, and finishes the job with the
last one.

### The service contract's group, and documents for owners only

`client_documents.document_group` is `documentation_set`, the default, which is the
occupational safety set, `fire_safety_set` (ADR 016), or `other` (ADR 007), which holds the
service contract. The value predates client files, which are the "other
documents" of the app (ADR 013) and live in a table of their own. `owners_only` marks a
document that only an owner reaches, and a check constraint keeps a `service_contract` from
being anything else, whoever writes the row.

`can_access_document(id)` is the one answer for every way to a document: the select and
insert policies of `client_documents` carry the same condition, the write policies of
`document_revisions` call it and its read policy asks the same of `client_documents` in a
subquery (a function call per row read was slow; the subquery runs under the caller's policy
on `client_documents`, which is the same rule), `is_readable_document_path` makes the read policy of the
`documents` bucket ask it (reading used to be by the organization's folder alone, which a
specialist who learned the path of a contract would have passed), `is_draft_document_path`
asks it before a file is written, and `issue_document_revision`, which runs past the
policies, answers `DOC01` for a document the caller cannot reach. None of these, nor the
freeze under an archived client, looks at the group, so the fire-safety set is read, written
and frozen as the occupational safety set is. The lead trigger on `client_documents` refuses
both sets and nothing `other`, so a lead has its contract.

### Service contracts

`service_contracts` holds what the app reads about a contract: `contract_number` and
`contract_date` (the provider's own register, a number used once per organization and year),
`start_date`, `duration_months`, `renews_automatically`, `covers_occupational_safety` and
`covers_fire_safety`, at least one of them. Owners only, to read as well. It is its own table
because a policy hides rows and not columns and the team reads a client's row, and its key is
its own because an amendment later is a second row; for now a client has one. Prices are not
stored: they live in the file, where they are binding. The archived-client trigger applies.

### Sends of a service contract

`service_contract_sends` keeps each time an owner emailed an issued contract: `revision_id`,
`sent_to`, the owner's `note`, the provider's message id, `sent_by`, `sent_at`. Rows are
written once and never changed by members (no update or delete grant). Owners insert, and only
for an issued revision of a document they can reach; they read the sends of the documents
their policy on `client_documents` lets them read.
"Sent" is about the revision in force: a revision issued after the last send has none. The
table has one foreign key to `document_revisions`, not also a composite one, because PostgREST
embeds through it and two would make the relationship ambiguous.

Each send also carries its return link (ADR 007, amended): `token_hash`, the SHA-256 of the
token in the email, unique; `return_expires_at`, sixty days on; and `return_uploads`, how many
files came through it, bounded to twenty. The secret key alone writes the last two, from the
public routes. An owner can read the hash of their own sends, which lets them mint nothing
they could not already do: the link only uploads a copy to a contract they attach copies to.

### Signed copies

`document_signed_copies` keeps what came back signed for an issued revision (ADR 007): one
row per revision (`revision_id` is the key), with `storage_path` and `sha256`. It is a table
and not columns of `document_revisions` because an issued revision never changes, which a
trigger and the column grants both hold, and a signed copy arrives after issuing and can be
replaced. `check_signed_copy` refuses a draft (`DOC04`), a revision of another document, and
any path but the revision's own, `<organization>/<client>/<document>/<revision>.signed.pdf`,
beside the Word file and the PDF. `source` says who put it there, `owner` in the app or
`client` through the return link, and `confirmed_at` with `confirmed_by` when an owner accepted
it; a check keeps an owner's own copy confirmed from the start, so only a client's copy waits,
as the **received copy** that does not yet make the contract signed. Whoever reaches the
document reads, attaches, replaces, confirms and removes (reads through the caller's policy on
`client_documents`, writes through `can_access_document`), so a
contract's copy is its owners'. The
archived-client trigger applies. Files follow the row as a draft's files do: the row first,
then `is_signed_copy_path` lets the object in; `is_readable_document_path` reads the third
file beside a revision. A superseded revision keeps the copy it had.

## Client files

`client_files` holds the files a provider keeps about a client or a lead that the app did not
write and does not read ([ADR 013](architecture/adr-013-client-files.md)): one row per upload,
with the same `client_id`, `organization_id` and composite foreign key as `employees`. They
are not documents: no type, no revisions, and a file is replaced by uploading another and
deleting the first.

| Column                 | Notes                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `name`                 | 1 to 200 characters; the API starts it as the uploaded file's name without its extension.   |
| `note`                 | Optional free text, up to 2000 characters.                                                  |
| `owners_only`          | Hides the row and its file from specialists. False by default.                              |
| `original_file_name`   | The name it was uploaded under, up to 255 characters; the download carries it.              |
| `mime_type`            | PDF, JPEG, PNG, `.docx`, `.doc`, `.xlsx` or `.xls`, by a check constraint.                  |
| `size_bytes`, `sha256` | 1 byte to 20 MiB, and the SHA-256 of the content in hex.                                    |
| `storage_path`         | Generated as `<organization>/<client>/<id>.<extension>` from the type; unique.              |
| `uploaded_by`          | The signed-in user, the platform admin during an impersonation; null once the account goes. |
| `employee_id`          | Optional: the employee of the same client the file is about (ADR 021); set at upload only.  |

Members read their organization's files, except that a file for owners only is an owner's
alone. A member inserts a row as its uploader, for an active client of their organization, or
for a lead when they are an owner, and only an owner inserts one for owners only. The uploader
and any owner update and delete the files they can see; column grants limit an update to
`name`, `note` and `owners_only`.

A file can belong to one of the client's employees ([ADR 021](architecture/adr-021-training-records-and-individual-sheets.md)),
such as the photograph of a paper training sheet: `employee_id` with `client_id` references
`employees (id, client_id)`, so the employee is always the file's client's, and `on delete
restrict` since employees are never deleted. The column grants leave it out of an update, so
a file stays with the employee it was uploaded for. `client_files_employee_id_idx` on
`(employee_id, created_at desc)` serves an employee's list. The policies do not change: who
sees a file does not depend on whose it is.

The archived-client trigger applies (`CLA01`). `protect_client_file_visibility` runs before
every insert and update: a lead's file is for owners only (`CFL01`) until the lead is
promoted, and only an owner changes `owners_only` (`42501`), since the update policy also lets
the uploader in. It is a trigger rather than a policy so that the API can name the reason. The
secret key passes the second check, not the first.

The files live in the private `client-files` bucket, which accepts the same seven types up to
20 MiB. No character of a user's file name reaches a path. The row comes first: the read
policy asks `is_readable_client_file_path`, true for a path a row the caller can see names;
the upload and delete policies ask `is_writable_client_file_path`, which also wants the caller
to be the uploader or an owner and the client to be active. There is no update policy, so an
object is never replaced. Supabase's database backups do not include these files, and unlike a
generated document they exist nowhere else.

A client file can come from an import from documents ([ADR 030](architecture/adr-030-import-from-documents.md)):
`import_id` names the import whose folder it belongs to, and `import_path` the folders it sat in
inside the upload, with `/` between them, null at the top of the folder and for a file uploaded
on its own. `client_files_import_idx` on `(import_id, import_path)` lists a folder. `import_id`
holds to the same organization by the composite key to `imports (id, organization_id)`, and the
import is kept as long as one of its files is (`on delete restrict`). Only confirming an import
fills these two columns: the column grants leave them out of a member's insert.

## Imports from documents

An **import** ([ADR 030](architecture/adr-030-import-from-documents.md)) holds a client's
uploaded files and the proposal a model read from them until a member confirms or abandons it.
Created by `20261028100000_imports` and `20261028100100_import_functions`; `read_characters`,
`usage_by_step` and the step of `record_import_usage` by `20261029100000_import_bookkeeping`.

`imports` has one row per import, with `organization_id`:

| Column                                                             | Notes                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`                                                             | `import_kind`: `client` (the documentation pack) or `employees` (training sheets, always into an existing client).                                                       |
| `client_id`, `into_existing_client`                                | The client, by the composite key to `clients (id, organization_id)`: set from the start for an existing client, on confirming for a new one; the flag says which it was. |
| `status`                                                           | `import_status`: `uploading`, `preparing`, `sorting`, `reading`, `checking`, `ready`, then `confirmed`, `abandoned` or `failed`.                                         |
| `failure_reason`                                                   | In Romanian, for members; required with `failed`.                                                                                                                        |
| `company_name`, `company_cui`                                      | The company the documents are about, once the reading found it.                                                                                                          |
| `source_import_id`                                                 | The import whose uploaded files this one took over, when the documents named several companies; the API copies their objects.                                            |
| `proposal`, `changes`                                              | JSON objects: what the model proposed with its sources and the checks' results, and what the member changed, kept or unticked. Null before review and once dropped.      |
| `version`                                                          | Counts the saves of `changes`; a save and the confirmation name the version they were made on.                                                                           |
| `quality`                                                          | Value-free counts per section of how many proposed values were changed, unticked or kept, stored at confirming.                                                          |
| `input_tokens`, `cached_input_tokens`, `output_tokens`, `cost_usd` | Every model request of the import, the cost in US dollars as `numeric(12, 6)`.                                                                                           |
| `usage_by_step`                                                    | The same four counts by step, `sorting` (the pack, a scan's first page), `scanning` (scanned pages) or `reading`, each an object keyed by the four column names.         |
| `read_characters`                                                  | The characters sent to the reading model, which the 600,000 cap counts: set on sorting, past the cap too, and again when a set-aside file is sent back. Null before.     |
| `created_by`, `created_at`, `started_at`, `ready_at`, `failed_at`  | Who started it, as the real user during an impersonation, and when each step was reached. Checks tie each stamp to its status.                                           |
| `confirmed_at`, `confirmed_by`, `abandoned_at`                     | The end. A confirmed import has its client.                                                                                                                              |
| `files_copied_at`, `proposal_dropped_at`, `objects_removed_at`     | The API copied the folder into `client-files`; the proposal was dropped; the API removed the import's objects, which needs the other two.                                |

`import_files` has one row per uploaded file, with `import_id` and `organization_id` by the
composite key to `imports (id, organization_id)`, deleted with the import:

| Column                                                             | Notes                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `upload_path`, `original_file_name`                                | Where the file sat in the upload, its folders and its name, and the name alone, up to 1024 and 255 characters.                                               |
| `mime_type`, `size_bytes`, `sha256`                                | PDF, `.doc`, `.docx`, JPEG, PNG or HEIC (`image/heic` or `image/heif`); 1 byte to 20 MiB.                                                                    |
| `storage_path`                                                     | Generated as `<organization>/<import>/<id>.<extension>` from the type; unique.                                                                               |
| `state`                                                            | `import_file_state`: `uploading` until its object is stored, `uploaded`, `prepared`, then `read`, `set_aside`, `for_employees`, `other_company` or `failed`. |
| `document_kind`, `reason`, `company_name`, `company_cui`           | What the sorting took the file for (a key `packages/import` names), why it was set aside or failed (in Romanian), and the company it names.                  |
| `page_count`, `is_scan`                                            | From the extractor.                                                                                                                                          |
| `text_path`                                                        | The text taken out of it, beside it as `<id>.txt` or `<id>.json`, by a check.                                                                                |
| `derived_path`, `derived_size_bytes`, `derived_sha256`             | The `.docx` of a `.doc` (`<id>.docx`) or the upright JPEG of a photograph (`<id>.jpg`, a JPEG's `<id>.jpeg`), beside it by a check; the three together.      |
| `input_tokens`, `cached_input_tokens`, `output_tokens`, `cost_usd` | The requests that read this file on its own, a scan or a photograph; the import's totals include them.                                                       |
| `client_file_id`                                                   | The client file it became in the import folder; set null if that file is deleted.                                                                            |

`limit_import_files` locks the import and refuses a file once the import is past `uploading`
(`IMP01`), or one that would take it beyond 150 files or 100 MiB, or is over 20 MiB itself
(`IMP05`). It checks the size again when `size_bytes` grows, since the browser declares it and
the API writes the stored object's real size over it. `protect_import`
refuses an import into an archived client (`CLA01`) or a lead (`CLL01`), for the secret key too,
since the API writes imports with it, and keeps a confirmed or abandoned import at its step
(`IMP06`).

**Who reads and writes.** Members of the organization read its imports and their files; an
import into a client is read only by those who read the client, since the policy asks for the
client under the caller's own policies. Nobody signed in inserts, updates or deletes either
table. The API creates imports and their files' rows with the secret key, after checking the
member, and its queue consumer records the steps, the files' states, the proposal and the
usage the same way, the usage through `record_import_usage(import, file, step, input, cached,
output, cost)`, which adds to the import's totals and to its step in `usage_by_step` and, given a
file, to that file; a step other than `sorting`, `reading` or `scanning` is refused (`22023`). A member's decisions are four
functions that run as their owner and find the import as the select policy does, answering
`P0002` for one the caller cannot see: `save_import_changes(import, expected version, changes)`
stores the review and returns the next version, `abandon_import(import)` ends any import not
yet confirmed or abandoned, keeping a failed import's `failed_at` as its `abandoned_at`,
`split_import` takes another company's files into a new import, and `apply_client_import`
confirms. Both of the first refuse an import that is not ready (`IMP01`) and a stale version
(`IMP02`); abandoning refuses an ended import (`IMP01`).

**Splitting.** `split_import(import, file ids)` locks the import, so two splits of the same
files at once take turns, and in one transaction creates an `uploading` import for a new client
with `source_import_id` and `created_by` the caller, holding copies of the files' rows. It
returns `{"import_id", "files": [{"source_path", "target_path"}]}`: the objects the API then
copies within the bucket before it starts the new import. It refuses an import that is not
reading, checking, ready, confirmed or failed (`IMP01`), a file that is not one of the import's
`other_company` files (`IMP07`), and a file whose path is already in an import split from this
one and not abandoned (`IMP08`).

**The bucket.** `imports` is private, takes PDF, `.doc`, `.docx`, JPEG, PNG, HEIC, plain text
and JSON, up to 20 MiB. As for client files, the row comes first: members upload only to the
`storage_path` of a row of theirs that is still `uploading`, in an import still `uploading`,
whose client, if any, is active (`is_uploadable_import_path`); they read any path a row of theirs
names, the original, its text or its converted file (`is_readable_import_path`, which finds the
row by the file id in the path). Both run as the caller, so the policies of the rows decide. Text, converted files and every removal are the
API's.

**Confirming.** `apply_client_import(import, expected version, payload)` writes everything in one
transaction and returns `{"client_id", "files": [{"client_file_id", "source_path",
"target_path"}]}`. It refuses another kind of import (`22023`), one not ready (`IMP01`), a stale
version (`IMP02`), an existing client that is archived (`CLA01`) or whose CUI is not the
documents' `company_cui` or the payload's `cui` (`IMP03`), and a new client whose CUI the
organization already has (`IMP04`). Every row passes its constraints and triggers, so an
employee without a position gets the one named like their job title, and a position's equipment
decision follows its entries.

The payload is shaped like the tables, not like the proposal; the API maps one onto the other.
Each object refuses a field it does not name (`22023`), and a column field takes the column's
values, JSON null or absent leaving the default:

```text
{
  "client": { "legal_name", "cui", "vat_payer", "caen_code", "trade_register_number",
    "county_code", "locality", "address_line", "legal_representative_name",
    "legal_representative_role", "contact_name", "contact_email", "contact_phone",
    "periodic_training_minutes", "administrative_training_interval_months",
    "administrative_training_not_applicable", "worker_training_interval_months",
    "worker_training_not_applicable", "training_first_month", "training_day_from",
    "training_day_to", "replace" },
  "workplaces": [{ "key", "id", "replace", "name", "is_registered_office", "kind",
    "county_code", "locality", "address_line", "activity", "floor_area_m2",
    "extinguisher_norm", "assembly_point", "combustible_materials", "ignition_sources",
    "fire_risk_equipment", "specific_measures" }],
  "job_positions": [{ "key", "id", "replace", "name", "staff_category", "work_zone",
    "activities", "training_interval_months", "needs_protective_equipment" }],
  "equipment": [{ "job_position_key | job_position_id", "risk", "item", "quantity",
    "duration_months", "allocation" }],
  "employees": [{ "key", "job_position_key | job_position_id", "workplace_key | workplace_id",
    "last_name", "first_name", "job_title", "hired_at", "cnp", "employee_number", "email",
    "phone", "contract_number" }],
  "responsible_persons": [{ "employee_key | employee_id", "workplace_key | workplace_id",
    "full_name", "job_title", "roles" }],
  "fire_safety": { "periodic_training_hours", "administrative_training_interval_months",
    "worker_training_interval_months", "training_first_month", "training_day_from",
    "training_day_to", "smoking_policy", "smoking_place", "waste_kinds", "waste_contractor",
    "waste_collectors", "has_third_parties", "replace" },
  "fire_equipment": [{ "workplace_key | workplace_id", "kind", "agent", "capacity", "wheeled",
    "label", "location", "manufactured_year", "last_service_on", "next_service_on",
    "maintainer" }],
  "fire_installations": [{ "workplace_key | workplace_id", "kind", "description",
    "maintainer", "last_check_on", "next_check_on" }],
  "quality": { "<section>": { "changed": 0, "unticked": 0, "kept": 0 } }
}
```

- Only `client` is required. A new client's import creates the client from it.
- An existing client's import fills the client's empty columns and keeps the others, except
  those listed in `replace`, the columns where the member took the documents' value. A
  training interval and its "not applicable" are one choice: an interval fills only a client
  that has not declared the category not applicable, and replacing it clears the declaration;
  "not applicable" fills a category that has no interval.
  `cui`, when given, must be the client's.
- A workplace or a job position with `id` is an existing row of the client, filled the same
  way; a job position without `id` named like an active one of the client is that one, as the
  unique index on the name says. A job position's `needs_protective_equipment` is `false` or
  absent (`22023` otherwise): it fills an undecided position, and the position's entries are
  what decide that it needs some. The client's `client_fire_safety` row is filled the same way
  when it exists. An empty array counts as empty. Every other item is a new row.
- `key` is any string unique within its list. An item names a row of another list by its `key`
  in the payload, or by the `id` of an existing row of the client, which the composite foreign
  keys hold to the same client.
- The one employee the client import creates is the workers' representative (ADR 010): an
  `employees` item, with the hire date the member gave, and a `responsible_persons` item naming
  it. The API's rule that gives a new employee the client's only workplace does not run here;
  the payload names the workplace.
- A room, where fire-safety means stand, is a unit's `location`. Buildings, maintenance rows and
  substances are not imported.
- `quality` is stored on the import as given.

Then the import folder: a client file for every file of the import except those still
`uploading` and another company's, named after the file without its extension, in the folders
of its `upload_path`, uploaded by the member who created the import. A HEIC photograph becomes
its JPEG, `IMG_0042.jpg`, with the converted file's size and hash; one never converted is left
out, since `client-files` does not take HEIC. A set-aside file is still in the folder; the app
marks it "necitit" from its import file's `state`. Each import file gets its `client_file_id`,
and the import is confirmed with its client, `confirmed_by` and `quality`.

The API then copies each `source_path` in `imports` to its `target_path` in `client-files`,
treating an object already there as copied, and sets `files_copied_at` with the secret key.
`import_folder_copies(import)` lists the same copies again, under the caller's policies, for a
copy that was interrupted.

**Retention.** Functions for the secret key, which a daily job of the API calls. Removing
objects is in two calls, so that a failed removal leaves the rows to list them again the next
day: a list, `(import_id, paths)` per import with every object path of its files, which changes
nothing, then, with the ids whose objects the API removed, the change.

- `fail_stalled_imports(stalled reason, left reason)` fails, from today, an import `preparing`,
  `sorting`, `reading` or `checking` when neither it nor any of its files changed for 6 hours,
  with the first reason, and one `uploading` or `ready` with no change for 14 days, with the
  second, and returns their ids.
- `list_abandoned_imports()` then `delete_abandoned_imports(ids)`: the imports abandoned, or
  failed, more than 14 days ago, deleted with their files' rows. An import a client file names is
  left out, so it cannot stop the others on its foreign key.
- `drop_import_proposals()` nulls `proposal` and `changes` 30 days after confirming, sets
  `proposal_dropped_at`, and returns how many.
- `list_import_objects_to_remove()` then `mark_import_objects_removed(ids)`: every object of an
  import whose proposal is dropped and whose folder is copied, the originals, the texts and the
  converted files; marking clears the files' `text_path` and `derived_path` and sets
  `objects_removed_at`. The originals of a folder not yet copied stay, since they are its only
  copy. The import keeps its dates, its people, its counts and its cost, and its files' rows
  stay.

The change functions take only ids the list would still give, and return those they changed.

## Profiles

`profiles` names a user: `full_name`, plus `terms_version` and `terms_accepted_at` for people
who created their account through an invitation. The email stays in `auth.users` and is not
copied. A user reads the profiles of their own organization, creates their own, and changes
only their own `full_name`; column grants keep the terms columns for acceptance to write.
`releases_acknowledged_through` names the last release the person acknowledged
([Releases](#releases)); they write it on their own row too.

`public.organization_member_list()` returns the members of the caller's organization with
their email, name, role, and join date. It runs as `security definer` because `auth.users`
is not readable by signed-in users.

## Releases

`releases` holds the update of each release that has one
([ADR 026](architecture/adr-026-updates-and-release-review.md)): the `tag` (`2026.10.23`, or
`2026.10.23.2` for a later release that day), `published_at`, the `headline`, the `lead`, and
the three sections, `features` as a JSON array of `{ title, text, where, icon }`,
`improvements` and `fixes` as text arrays. `body` keeps the release body the row was parsed
from, up to its horizontal rule. The table is the same for everyone and is not organization
data.

Only the release workflow writes it, with the secret key, by an upsert on the tag; the
published GitHub release is the source, and a correction is an edit there and a run of Deploy
production with the tag. Every signed-in user reads every row; there is no write policy. The
seed inserts four invented releases where fake data is allowed: the two newest published after
the seeded admin's profile was created, and the admin marked as read up to the third, so that
exactly those two are unread.

A release is **unread** for a person when it was published after their profile was created and
after the release in their `profiles.releases_acknowledged_through`, compared by `published_at`,
never by tag, since `2026.10.23.10` sorts before `2026.10.23.2` as text. An account without a
profile has nothing unread. The view `release_list` (`security_invoker`) is every release with
`unread` computed for `auth.uid()`, the real caller also during an impersonation.
`acknowledge_releases(through)` records a release on the caller's profile unless one published
later is recorded already, and returns the tag the profile keeps; it raises `REL01` for an
unknown tag and `REL02` for an account without a profile. Deleting a release clears the
pointers to it.

## Setup guide

The setup guide's fifteen steps ([ADR 031](architecture/adr-031-setup-guide.md)) are ticked
from rows the app already stores; only the skips and two moments on the profile are kept for
it.

`setup_progress()` (`security invoker`) returns one row for the caller's organization, none
for an account without one, read with the caller's policies, so a specialist's checks never
see an owners-only document:

- The organization steps, the same for every member: `company_done` when `legal_name_filled`,
  `cui_filled`, `address_filled` (county, locality and line), `representative_name_filled` and
  `representative_role_filled` all hold; `authorizations_done` when `certificate_filled` (the
  certificate's number, date and issuer) and `fire_safety_technician_filled` (the technician's
  name and certificate) do. The field groups name the focus keys of the organization's pages.
- `professional_title_done`, from the caller's own profile.
- One `<step>_done` per member step, true when **the caller**, `auth.uid()`, wrote the row in
  this organization, by a form or a confirmed import alike: `client_done` (a client, never a
  lead, by `created_by`); `workplaces_positions_done` (a workplace and a job position, of any
  clients); `employees_done`; `responsible_persons_done`; `risk_evaluation_done`;
  `fire_safety_data_done` (the client's fire-safety row, whose `created_by` is whoever first
  saved it, while it holds a fact of the card: the substances declaration alone also creates
  the row); `generate_sets_done` (a generation of each group); `issue_document_done` (a
  revision of the two sets, by `issued_by`; the service contract does not count);
  `portal_invitation_done` (an invitation of kind `employee`, by `invited_by`);
  `training_done` (a training of source `app`); and `signature_done` (a request in state
  `signed` with a signer account, by `issued_by`; a slot marked on paper has none).
- The facts the locks need, about the organization's active clients (stage `client`, not
  archived) whoever did the work: `has_client`; `has_client_with_workplace_and_position` and
  `has_client_with_position`, current ones; `has_client_with_basic_data`, a client absent
  from `clients_missing_basic_data`; `has_draft_revision`, a draft of the two sets;
  `has_client_with_employee`, a current, active employee; and `has_training_record`.
- `furthest_client_id`, the active client with the most of steps 6 to 15 done by anyone, the
  newest first on a tie, by the same tests as the steps; null when the organization has no
  active client.
- `owner_count`, from the memberships, and `owner_names`, the full names in order of the owners
  who have a profile, so the names alone can undercount.

Each check is an `exists` over an index on `organization_id`, `client_id` or the author
column (`created_by`, `issued_by`, `invited_by`).

`setup_step_skips` holds the member steps a person marked _Știu deja_: one row per
`(user_id, step)` with `skipped_at`. `step` is one of the eleven member steps' ids; the
organization steps, `account` and `professional-title` cannot be skipped. A signed-in user
reads, inserts and deletes only their own rows, and an insert sets only `user_id` and `step`.
Rows go with the account.

`profiles.setup_guide_closed_at` is set when the person closes the guide to the header pill and
cleared when they bring it back; `setup_guide_finished_at` is set once the guide has shown
_Gata_ and cleared by Arată ghidul. The person writes both on their own row.

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

## Participants

A **participant** is a person of a client who signs in to the portal
([ADR 022](architecture/adr-022-participants-and-the-portal.md)): an `employee` or the
`client_administrator` (`participant_kind`). A participant is not a member: the account has no
row in `organization_members`, so `current_organization_id()` is null and every members' policy
yields nothing. They read through policies of their own and write only their test attempts, through the
functions of [Knowledge tests](#knowledge-tests). One account may hold
a membership and participations at once; the app's routes act on the membership, the portal's
on the participations.

`client_participants` holds one row per person and client, with `client_id`, a denormalized
`organization_id` and the composite foreign key to the client, as other tables under a client.

| Column                              | Notes                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `kind`                              | `employee` or `client_administrator`. A workplace manager is an employee; the responsible persons say they manage.             |
| `employee_id`                       | Required for an employee, optional for an administrator who is also an employee; composite key to `employees (id, client_id)`. |
| `full_name`                         | Set exactly when there is no employee: an employee's name is read from their row.                                              |
| `user_id`                           | The auth account, deleted with it.                                                                                             |
| `revoked_at`                        | A revoked participant reads nothing; the row stays.                                                                            |
| `notice_version`, `notice_shown_at` | The privacy notice shown after the first sign-in, set together.                                                                |
| `language`                          | `ro` or `en`, the portal's language the participant chose; null until they choose, when the portal follows the browser.        |

Uniqueness holds among active rows: one participation per account and client, and one
participant per employee. A revoked row stays, so the same person can be invited again. The
same account can be a participant at several clients.

`participant_invitations` holds a member's invitation of one person at one **address**:
`channel` is `email` (trimmed and lowercased) or `sms` (E.164), checked against the address.
The person is `kind`, `employee_id` and `full_name` under the same rules as on the participant.
There is no token: receiving a sign-in code at the address is the proof. Status is derived:
accepted (`accepted_at`, with `participant_id`), revoked, expired once `expires_at` has passed
(30 days), otherwise open. A partial unique index allows one open invitation per address at a
client, so inviting the same person there again renews the row (`expires_at` and `created_at`
move); `last_sent_at` limits sending to once per 10 minutes. New rows of either table need an
active client that is not a lead (`CLA01`, `CLL01`); revoking stays possible after archiving.

Members read both tables of their organization under row-level security and write through
functions that check the caller themselves. Every member may invite, not only owners.

| Function                                          | Caller      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_participant_invitation(client, kind, …)`  | member      | Takes the client, kind, employee, name, channel and address; creates or renews an invitation and returns the row. For an employee the address must be their own email or phone. Refuses an employee with an active participant (`PRT01`) or an open invitation at another address (`PRT02`), an address open for another person or held by an active participant (`PRT03`), an incoherent request (`PRT04`), and a renewal within 10 minutes (`PRT05`). |
| `resend_participant_invitation(id)`               | member      | Renews an open or expired invitation for 30 days and returns the row; `PRT06` for an accepted or revoked one, `PRT05` within 10 minutes.                                                                                                                                                                                                                                                                                                                |
| `revoke_participant_invitation(id)`               | member      | Revokes an open invitation; false when there was nothing to revoke.                                                                                                                                                                                                                                                                                                                                                                                     |
| `revoke_client_participant(id)`                   | member      | Revokes an active participant; false when there was nothing to revoke.                                                                                                                                                                                                                                                                                                                                                                                  |
| `accept_participant_invitations()`                | participant | On every portal sign-in: accepts each open invitation sent to the account's confirmed email or confirmed phone, creating the participant, and returns how many. Skips archived clients and a person already a participant there.                                                                                                                                                                                                                        |
| `current_participations()`                        | participant | The account's active participations, with the organization and client names, the kind, the employee, the name, the notice version and the language.                                                                                                                                                                                                                                                                                                     |
| `auth_user_id_by_address(channel, address)`       | secret key  | The account an invitation's address already has, an email matched without case and a phone as Auth stores it, without its `+`; null when there is none. The API flags that account as a participant's; the Auth Admin API finds no user by phone.                                                                                                                                                                                                       |
| `record_participant_notice(participant, version)` | participant | Records the notice on the caller's own active participation; false otherwise.                                                                                                                                                                                                                                                                                                                                                                           |
| `set_participant_language(participant, language)` | participant | Sets the language on the caller's own active participation; false otherwise. A language outside the check raises `23514`.                                                                                                                                                                                                                                                                                                                               |

A client, employee or invitation that is not the caller's raises `P0002` with
`client_not_found`, `employee_not_found` or `invitation_not_found`; a caller without a
membership `42501`.

The participant policies, all `select` for `authenticated`, are built on `security definer`
helpers that read the caller's active participations: `participant_client_ids()`,
`participant_employee_ids()` (the employee rows of either kind) and `administered_client_ids()`,
each an array compared as `column = any ((select …)::uuid[])` so it is read once per query and
an index can serve it. `is_client_administrator(client)` answers the same for one client.

| Table                        | An employee reads                       | An administrator also reads  |
| ---------------------------- | --------------------------------------- | ---------------------------- |
| `clients`                    | their clients                           |                              |
| `organizations`              | the provider of their clients           |                              |
| `employees`                  | their own row                           | every employee of the client |
| `training_records`           | their own                               | the client's                 |
| `trainings`                  | the trainings they attended             | the client's                 |
| `job_positions`              | their own position                      | the client's                 |
| `client_workplaces`          | every workplace of their clients        |                              |
| `client_fire_safety`         | their clients' row (training intervals) |                              |
| `client_responsible_persons` |                                         | the client's                 |
| `document_templates`         | the built-in per-employee templates     |                              |
| `client_participants`        | their own participations                |                              |

The workplaces are all the client's because a sheet names the workplace only at a client with
more than one. `employee_training_status` is a security-invoker view, so it follows the rows
above; `document_template_versions` follows its templates, the two training sheets and the
signing agreement (`20261018110000_signing_agreement_policy.sql`). Storage has no participant policy
yet: a template file read for a participant needs the API's secret key or a policy of its own.

### The phone in E.164

`employees.phone` is stored in E.164, checked by `employees_phone_e164`. The contract's
`phoneSchema` normalizes it with `normalizePhone`, built on `libphonenumber-js` (`min`
metadata), with Romania as the default country: spaces, dots, dashes and parentheses are
allowed, `0721 000 000`, `721 000 000` and `0040 721 000 000` become `+40721000000`, a number
written with `+` or `00` keeps its own country, and the number must be valid for that country
(its length and, for the larger countries, its digits), landlines included. Other text around
the number is refused. `countryOf` names the country of a stored number. The migration normalized existing rows the same way and set
the rest to null. `clients.contact_phone` and `organizations.phone` stay free text.

## Signatures

The app makes an **advanced electronic signature** on training records
([ADR 023](architecture/adr-023-advanced-electronic-signature.md)) and on test sheets
([ADR 024](architecture/adr-024-knowledge-tests.md), [below](#test-sheets)). A record has four
`signer_slot`s: `trainee`, `trainer`, `verifier` (only when the training has a verifier) and
`admitter` (only when the record has an admission); a test sheet two, `trainee` and `examiner`,
the value the enum gained for it (`20261021100000_examiner_slot.sql`, apart since a new enum
value cannot be used in the transaction that adds it). Each slot is signed once live, electronically
by a member or a participant, or marked as signed on paper by a member: one live signature per
slot, by a partial unique index, and one request that is not void per slot.

Two tables hold secrets and have row-level security with no policy at all: only the API's secret
key reads and writes them.

| Table                | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signing_identities` | The history of each auth account's identities (`account_id`, deleted with it): the `subject_name`, the account's own name when the certificate was made, the `certificate_pem` from the app's own authority with its unique `certificate_serial`, `not_before` and `not_after`, the ECDSA private key as `private_key_encrypted` under the API Worker's key-encryption key, `key_version` naming which, and `superseded_at`. One live identity per account (`superseded_at` null, by a partial unique index). Insert-only: a trigger refuses any update but setting `superseded_at` once, and any delete while the account exists (`SIG06`, `identity_kept`), so the certificate an old signature names stays readable. |
| `signing_sessions`   | One act of signing (`account_id`): the `place` it was asked for in (`app` or `portal`) and, in the portal, the `participant_id`; the `channel` (`email` or `sms`) and `address` the code went to, checked as on an invitation, the `code_hash`, `code_sent_at`, `expires_at` (ten minutes by default), `attempts`, `verified_at`, `client_ip` and `user_agent`. Not Supabase's one-time passcode, whose verification issues a session and keeps its own record. A session is used once, enforced by the database: once `verified_at` is set, a trigger refuses any change to the row (`SIG09`, `session_used`).                                                                                                         |

`create_signing_session(...)` (service role only) inserts a session unless the account had a code
sent in the last `p_interval_seconds`, under an advisory lock on the account, and answers
`retry_after_seconds` (0 when inserted) with the `code_sent_at` and `expires_at` it recorded.

The others carry `client_id` and a denormalized `organization_id` with the composite foreign key
to the client, as other tables under a client do. A request, a signature and a sheet row reach
their record through `(training_record_id, client_id)`, and a sheet row its sheet through
`(signed_sheet_id, client_id)`, so none crosses clients.

`signature_requests` is one slot of one record, or of one test sheet, addressed to one signer.

| Column                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training_record_id`, `slot` | The record, deleted with it, and the slot. One request per slot that is not `void`, by a partial unique index.                                                                                                                                                                                                                                                                                                                                                      |
| `test_sheet_id`              | Or the test sheet, by `(test_sheet_id, client_id)`, restricting its deletion: exactly one of the two is set (`signature_requests_one_document`), a sheet's slot is `trainee` or `examiner` and a record's never `examiner` (`signature_requests_slot_of_document`), one request per sheet and slot that is not `void`. The trigger below checks a sheet's slot (`SIG03`, `slot_not_on_sheet`) and its signer as for a record.                                       |
| `signer_account_id`          | The account addressed; null for a paper slot. The trainee must be the employee's own active participant; any other slot a member of the organization or an active participant of the client (`SIG05`, `signer_not_of_client`), checked on insert and on any update of the signer, slot, record or client. No pending trainee request goes to an employee whose agreement is `withdrawn` (`SIG05`, `agreement_withdrawn`). The slot must be on the record (`SIG03`). |
| `issued_by`, `issued_at`     | Who issued it, the real user during an impersonation.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `notified_at`                | When the signer was told.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `state`                      | `pending`, `signed` or `void`. Only the evidence row makes it `signed`, by a trigger.                                                                                                                                                                                                                                                                                                                                                                               |
| `voided_at`, `void_reason`   | Set exactly when `void`. `record_changed` when the record or its training's source changed under a pending request, `signed_on_paper` when a paper mark replaced it, `signer_changed` or `paper` when a save named another signer or none, `signer_left` when the signer lost their standing, `archived` when the client was archived, `withdrawn` when the employee's agreement was withdrawn, otherwise the member's reason.                                      |
| `voided_by`                  | The account that voided it, from `auth.uid()`; null for a void made with the secret key or by a trigger fired by it.                                                                                                                                                                                                                                                                                                                                                |
| `signing_session_id`         | The session that signed it.                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`training_signatures` is the evidence, one row per slot signed, written once.

| Column                                                                           | Notes                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `training_record_id`, `slot`, `request_id`                                       | The request it answers, which must be of the same record and slot; one signature per request, one live signature per slot. |
| `method`                                                                         | `electronic` or `paper`.                                                                                                   |
| `signer_account_id`                                                              | The signer, the account the request addressed (`SIG05`); null on paper.                                                    |
| `signer_name`, `signer_job_title`                                                | As printed.                                                                                                                |
| `channel`, `address`, `code_sent_at`, `code_verified_at`, `signing_session_id`   | Where the code went and when it was sent and verified; the two moments are copied from the session by the trigger.         |
| `signed_at`                                                                      | The API's clock; no trusted timestamp yet (#486).                                                                          |
| `digest_before`, `digest_after`, `certificate_serial`, `client_ip`, `user_agent` | The sheet's digest before and after, the certificate, and the client.                                                      |
| `marked_by`                                                                      | The member who marked a paper slot.                                                                                        |
| `voided_at`, `void_reason`, `voided_by`                                          | Set together, once; `voided_by` from `auth.uid()`.                                                                         |

**The evidence and its request are one write.** A trigger locks the request (`for update`) while
the evidence goes in and refuses it unless the request is `pending` (`SIG08`,
`request_not_pending`) and addressed to the signer (`SIG05`, `signer_not_addressed`). For an
electronic row it also requires the session to be the signer's, verified, to list the request
among its items, and to have sent its code to the row's channel and address (`SIG09`,
`session_mismatch`), and the signer to still have standing (`SIG05`, `signer_not_of_client`).
After the insert, a trigger sets the request `signed` with the session; after a void of the
signature, it sets the request `void` with the same reason and actor. A paper mark goes in the same
way, as a pending request without a signer that its evidence then signs.

An electronic row has the signer, the channel, the address, both code moments, the session, both
digests and the certificate serial; a paper row has `marked_by` and none of those. The accounts a
signature names are kept: their foreign keys restrict deletion. A trigger refuses any update except
setting `voided_at`, `void_reason` and `voided_by` on a live row, and any delete or truncate
(`SIG06`). The database row is the record of a void; the PDF's _anulat_ note follows it and is a
field no signature locks, by design, since a void comes after the signatures. The written-once
rules are triggers: a superuser in replica mode (`session_replication_role = replica`), as the
local check scripts clean up with, is not bound by them.

`employee_signing_agreements` is the _act adițional_ of one employee (`employee_id`, the primary
key, deleted with the employee): `state` is `generated`, `signed_electronically`,
`signed_on_paper`, `withdrawn` (the employee returned to signing by hand: no trainee request goes to
them while it stands, and setting it voids their pending ones with `withdrawn`) or `in_contract` (a
new hire whose employment contract carries the clause, which counts as agreed, with no PDF). It
has `generated_at`, `signed_at` (set when `signed_electronically` or `signed_on_paper`, kept by a
`withdrawn` that follows an electronic signature, else null),
`marked_by` (only for `signed_on_paper`, `withdrawn` and `in_contract`, and forced to the signed-in
member by a trigger whenever a member sets the state; kept as it was on any other member update)
and `client_file_id`, the scan as a client file of the same client, set null when the file is
deleted. Members read and write it with the four usual policies, without `TRUNCATE`; only the secret
key sets or undoes `signed_electronically` (`SIG07`). An agreement in any state but `generated` is
not deleted, except with its employee (`SIG10`, `agreement_recorded`). The electronic signing adds
`storage_path`, the signed PDF's current version in the documents bucket, `employee_signed_at` and
`employer_signed_at`, which members may neither insert nor update: the employer signs after the
employee, a signed agreement has its file, `signed_electronically` holds exactly when the employer
has signed, and the states other than `generated`, `signed_electronically` and `withdrawn` carry no
electronic signature (all by checks). Once either party has signed electronically, a member's update or delete
of the row is refused (`SIG07`), so that a paper mark never contradicts a signed file; the one
change allowed is `withdrawn` (`20261018150000_agreement_withdrawal.sql`), which keeps
`signed_at`, the file and both signing times as the evidence of what was signed.

`agreement_signatures` is the evidence of one party's signature on an agreement, written once:
`employee_id` (restricting the agreement's and the employee's deletion), `party` (`employee` or
`employer`, one row each by a unique key), the signer's account and printed name, the code's
`channel`, `address`, `code_sent_at` and `code_verified_at`, `signed_at`, both digests of the file,
the certificate serial, `client_ip`, `user_agent`, the `signing_session_id` and `storage_path`, the
file this signature produced, all required but the client's. Before the insert a trigger locks the
agreement and requires it `generated` and awaiting this party, the employee's evidence existing
before the employer's (`SIG10`, `agreement_not_awaiting`); the signer to be the employee's own
active participant for `employee` and an active client administrator of the client for `employer`
(`SIG10`, `agreement_signer_not_party`); and the session as for a training signature (`SIG09`).
After the insert a trigger moves the agreement on: `storage_path` and `employee_signed_at`, or
`storage_path`, `employer_signed_at`, `signed_at` and `signed_electronically`. Any update, delete
or truncate raises `SIG06`. Members read their organization's, participants the ones on their own
agreement, administrators the client's; nobody but the secret key writes.

**The evidence columns participants cannot read.** On `training_signatures` and
`agreement_signatures`, `authenticated` has `SELECT` on the columns that say who signed what and
when (the ids, the slot or party, the method, the signer's account and printed name and function,
`signed_at`, `marked_by`, the void columns and `created_at`), not on `address`, `channel`,
`code_sent_at`, `code_verified_at`, the digests, `certificate_serial`, `client_ip`, `user_agent`,
`signing_session_id` or `storage_path`: members, participants and administrators alike get `42501`
for those, which the API reads with the secret key only.

`signing_session_items` says what one signing session signs, in `position` order: a
`request_id`, or an `agreement_employee_id` with the `agreement_party` and the `agreement_digest`,
what the agreement was when the code was asked for, never both kinds, each once per session. The
agreement column names the employee, not an `employee_signing_agreements` row: the employee's
first session precedes their row, which their signature writes (ADR 023). It has row-level
security and no policy: the API writes it with the session and reads it back when the code is
typed.

`signed_sheets` is an individual training sheet stored as a PDF form for signing: one per
`employee_id`, `domain` and `sequence`, the continuation sheets counting up, with its
`storage_path`, the `digest` (SHA-256, hex) and `version` of the current bytes, the `row_capacity`
of periodic rows and the `rows_used`, the highest `p` row taken (a voided row's key is never
reused), and `certified_at` from its first signature. `signed_sheet_rows` says which
`training_record_id` fills which `row_key` of a sheet: `h1` and `h2` for the hiring trainings, `adm`
for the admission, `p1` and onward for the periodic rows, and `s1` and onward for the occupational
safety sheet's supplementary table; one row per key and sheet, and one live row per record,
`voided_at` marking a row _anulat_ and `void_noted_at` when the PDF's note said so. Each row has
the `client_id` of its sheet and record, and a trigger requires its record to be of the sheet's
employee and domain (`23514`, `row_not_of_sheet`). `printed_as_text` marks a record from paper the
sheet printed as text when it was drawn up, which has no fields to fill; `filled_digest` is the
SHA-256 of the values last filled into the other rows' fields. The workplace training's record
takes `h2` and fills the admission block with it, so the API never writes `adm`. Only the secret key
writes either.

A row holds a training record or a **test result** (ADR 024), exactly one of `training_record_id`
and `test_result_id` (`signed_sheet_rows_record_or_result`), the result by a composite key with
the row's `client_id`, one live row per result. A result of the occupational safety sheet takes
a `t` row, `t1` to `t5`, annex 11's block "Rezultatele testărilor", which only results take; a
result of the fire-safety sheet, whose form has no such block, takes the next `p` row of the
periodic table and so counts in `rows_used`. The trigger requires a result to be of the sheet's
employee and domain and in the table of its domain (`23514`, `row_not_of_sheet`). A result's row
is never printed as text and no slot signs it, so it is filled again whenever the result changes;
the freeze below concerns records only. A result with a row is not deleted (`23503`). What the rows' fields are, and how the API fills them, is in
[the document engine's Sheets section](document-engine.md#the-signed-sheet).

### Test sheets

`test_sheets` is the **test sheet** of one passing attempt (ADR 024), stored as a PDF form for the
trainee's and the examiner's signatures: `test_result_id` (unique, by `(test_result_id,
client_id)`), the `employee_id` of the result by `(employee_id, client_id)`, the `storage_path`,
`digest` (SHA-256, hex) and `version` of the current file, `generated_at`, and `certified_at` from
its first signature. A trigger requires the result to be a portal one of the same employee
(`23514`, `test_sheet_not_of_attempt`): a paper result has no test sheet, its test being signed on
the printed test. A table of its own rather than columns on `test_results`: the sheet is a file
every signature moves to a new version, written by the secret key only while members update a
result's examiner, and most results have none. It keeps no state either: its two slots' states
come from the requests and the evidence. The attempt behind it is frozen, so the sheet is never
drawn up again or deleted: a trigger allows an update only to the next `version`, keeping the
result, the employee, the client, `generated_at` and a set `certified_at`, and refuses any delete
or truncate (`TST08`, `test_sheet_kept`). The examiner's name and function are fields of the PDF
that the API fills again after a change of examiner, until the examiner's signature locks them.

`test_sheet_signatures` is a test sheet's evidence, one row per slot signed, as
`training_signatures` without a void: `test_sheet_id`, `slot` (`trainee` or `examiner`, one row
each by a unique key), `request_id` (unique, by `(request_id, test_sheet_id, slot)` to its
request), `method` (`electronic` or `paper`), the signer's account and printed name and function,
the code's channel, address and moments, `signed_at`, both digests, the certificate serial, the
client's address and agent, the session and `marked_by`, with the same evidence-of-method check. A
trigger before the insert checks the request and the session as for a training signature
(`SIG05`, `SIG08`, `SIG09`) and the signer's standing on the sheet; one after it sets the request
`signed` with the session. Any update, delete or truncate raises `SIG06`. A sheet's signatures are
never voided: the trainee signed what they sat, and the examiner's signature fixes the result's
examiner.

| Function                                       | Caller | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mark_test_sheet_paper_signature(sheet, slot)` | member | Voids a pending request of the slot with `signed_on_paper`, inserts a request without a signer and the paper evidence, which signs it, naming whom the sheet prints in the slot: the employee as the trainee, the result's examiner as the examiner (`SIG04`, `examiner_required`, when the result names none). Refuses a signed slot (`SIG02`), a slot the sheet lacks (`SIG03`), an archived client (`CLA01`) and a sheet of another organization (`P0002`, `test_sheet_not_found`). |

The trainee of a sheet is the employee's own active participant; the examiner a member of the
organization or an active participant of the client (`test_sheet_signer_has_standing`), checked
on a request's insert and on its evidence, and lost as a record's is (`signer_left`). A withdrawn
agreement voids the employee's pending trainee requests on their sheets too and refuses new ones
(`agreement_withdrawn`). A change of a result's `examiner_name` or `examiner_job_title` voids the
pending examiner request of its sheet with `signer_changed`; once the examiner has signed, on paper
or electronically, the change is refused (`TST07`, `examiner_signed`).

### The freeze and the void

A record with a live electronic signature (`method = 'electronic'`, `voided_at` null), or a record
from paper printed on a sheet whose `certified_at` is set, is **frozen**: an update of its
training's `domain`, `phase`, `held_on`, `duration_minutes`, `material`, `trainer_name`,
`trainer_job_title`, `verifier_name`, `verifier_job_title`, `supplementary_reason` or `source`, or
of its own `occupation`, `admitted_on`, `admitted_by_name`, `admitted_by_job_title`,
`employee_id`, `training_id` or `client_id`, raises `SIG01` (`record_signed`), whoever makes it,
`save_training` included. A paper signature does not freeze. A training or record with any
signature row, paper or void included, or with a row on a stored sheet, is not deleted (`SIG01`,
`record_has_signatures`), since the evidence and the printed row are kept. The same columns
changing set the record's `pending` requests to `void` with `record_changed`, a source switched to
paper among them, for the API to issue again; signed requests stay.

**Standing lost.** When a participant is revoked or removed, or a member leaves the organization,
their pending requests that they may no longer sign are voided with `signer_left`; a request the
account still has standing for, as a member and a participant at once, stays. Archiving a client
voids its pending requests with `archived`, in a trigger that runs before the client's own
archiving checks.

| Function                                              | Caller | What it does                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `void_training_signatures(record, reason)`            | member | Voids every live signature of the record, paper ones included, with the trimmed reason and the caller as `voided_by`, and every request that is not void, so that the slots can be requested again; when an electronic signature was among them, voids the record's live sheet row too. Returns the signatures voided. The record is then editable. |
| `mark_paper_signature(record, slot, name, job_title)` | member | Voids a pending request of the slot with `signed_on_paper`, inserts a request without a signer and the paper evidence, which signs it, and returns the signature. Refuses a slot with a live signature (`SIG02`) or one the record lacks (`SIG03`).                                                                                                 |
| `issue_signature_requests(requests)`                  | member | A save's requests in one transaction: each element `{ training_record_id, slot, signer_account_id, replaces, reason }` voids the pending request `replaces` with `reason` and inserts the new one, so that a request is voided only together with its replacement. Answers the inserted rows.                                                       |

All three take `p_`-prefixed arguments and refuse a caller without a membership (`42501`) and a
record of another organization (`P0002`, `record_not_found`); the first two also an archived
client (`CLA01`) and a blank reason or name (`SIG04`, `reason_required` or
`signer_name_required`).

### Who reads what

Members read the requests, signatures, agreements, sheets, sheet rows, test sheets and test sheet
signatures of their organization; a test sheet's requests are the API's to issue, with the secret
key, since the member's column grant does not include `test_sheet_id`.
They insert requests naming only `organization_id`, `client_id`, `training_record_id`, `slot` and
`signer_account_id` (the column grant), `pending` and issued by themselves, for an active client,
write the agreements, and change the rest only through the functions above.

| Table                         | Anyone reads                   | An employee participant reads              | An administrator also reads |
| ----------------------------- | ------------------------------ | ------------------------------------------ | --------------------------- |
| `signature_requests`          | the requests addressed to them | those on their own records and test sheets | the client's                |
| `training_signatures`         | their own signatures           | those on their own records                 | the client's                |
| `test_sheets`                 |                                | their own                                  | the client's                |
| `test_sheet_signatures`       | their own signatures           | those on their own test sheets             | the client's                |
| `employee_signing_agreements` |                                | their own                                  | the client's                |
| `agreement_signatures`        | their own signatures           | those on their own agreement               | the client's                |
| `signed_sheets`               |                                | their own                                  | the client's                |
| `signed_sheet_rows`           |                                | the rows of their own sheets               | the client's                |

"Them" is the real signed-in user, as in the other participant policies; the two evidence tables
only in the columns above. Errors, raised with these SQLSTATEs:

- `SIG01` the record is signed: `record_signed` for a change to what it prints,
  `record_has_signatures` for a delete
- `SIG02` the slot already has a live signature
- `SIG03` the slot is not on the record or the test sheet: `slot_not_on_record`,
  `slot_not_on_sheet`
- `SIG04` the request does not hold together: `reason_required`, `signer_name_required`,
  `examiner_required`
- `SIG05` the signer cannot sign this slot: `signer_not_of_client`, `signer_not_addressed`,
  `agreement_withdrawn`
- `SIG06` a signature or an identity is written once: `signature_written_once`, `identity_kept`
- `SIG07` only the signing flow sets or undoes an electronic agreement
- `SIG08` the request is not pending: `request_not_pending`
- `SIG09` the session does not cover the signature, or was used: `session_mismatch`,
  `session_used`
- `SIG10` the agreement does not take it: `agreement_not_awaiting`,
  `agreement_signer_not_party`, `agreement_recorded`
- `TST07` the examiner has signed the test sheet: `examiner_signed`
- `TST08` a test sheet is not deleted and moves only to its next version: `test_sheet_kept`

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

## Legislation

The legal acts the built-in templates cite are watched on the Portal Legislativ
([ADR 017](architecture/adr-017-legislation-monitoring.md)). The three tables belong to no
organization: every member reads every row, nobody signed in writes, and the daily check
writes with the secret key, run by the cron of the legislation Worker
([deployment](deployment.md#legislation-worker)) or by `pnpm legislation:check`.

`legal_acts` holds one row per act in `packages/document-engine/templates/legal-acts.json`,
keyed by its id there (`lege-319-2006`). `pnpm legislation:check` writes `name` and
`portal_id` from the file, then what it read on the portal:

| Column                     | Notes                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `portal_id`                | The act's page, `legislatie.just.ro/Public/DetaliiDocument/<id>`. Null skips the act.                   |
| `portal_status`            | `in_force` or `repealed`, from the portal's list of actions the act underwent.                          |
| `verified_consolidated_on` | The consolidated form the templates were verified against. Set by hand; the job never writes it.        |
| `last_consolidated_on`     | The newest consolidated form seen.                                                                      |
| `last_amending_act`        | The acts adopted between the last two consolidations, as the portal names them (`LEGE 208 21/07/2021`). |
| `last_checked_at`          | The last time the page was read.                                                                        |
| `checked_by_hand_on`       | Set by hand when someone read the act because the job could not.                                        |

`legal_changes` holds a **legal change**: a consolidated form newer than the last one seen, or
newer than `verified_consolidated_on`, which is how the first run reports drift instead of
taking today's form as the baseline. Without either date the first form seen is the baseline.
A form is recorded once per act (unique `act_id`, `consolidated_on`), so the daily run can
see it again without repeating it. `resolution` is `open` until it is `no_impact` or
`template_version`, and `resolved_at` is set exactly when it is not open; `resolved_by_note`
says why. `document_template_versions.resolves_legal_change_id` names the change a template
version answers.

`legal_check_runs` logs every run of the check, because a cron that fails tells nobody. A run
inserts its row as `running` when it starts and updates it when it ends, even when the check
throws, so the Legislație page can warn when the latest run failed or is too old:

| Column          | Notes                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`        | `running`, `succeeded` or `failed`. `finished_at` is set exactly when it is not `running`; a row left `running` was cut off.                   |
| `acts_checked`  | Acts whose page was read.                                                                                                                      |
| `changes_found` | Legal changes this run recorded; a change seen again on a later day is not counted again.                                                      |
| `acts_skipped`  | Acts without a portal id.                                                                                                                      |
| `errors`        | Null when nothing failed; otherwise `[{ "act", "message" }]`, one per act whose page could not be read, `act` null when the run itself failed. |

A run that read some pages and not others is `failed`; the acts it did read are saved all the
same.

## Dashboard

The dashboard's numbers ([ADR 027](architecture/adr-027-dashboard.md)) are read from two views
and a function, all security invoker, so a count over a table the caller may not read, the
service contracts and their copies for a specialist, is zero. The employees they count are
those the employees list shows: not archived, `active`, of an active client (stage `client`,
not archived).

`dashboard_summary` has one row per organization the caller can read: `ssm_overdue`,
`ssm_due`, `ssm_untrained`, `ssm_current` and the same four for `psi`, from
`employee_training_status`; `employees`; `next_due_on`, the nearest due date of an employee
current or due in either domain, and `next_due_count`, how many employees it concerns;
`tests_pending`, employees with a hiring test waiting in either domain; `drafts_to_issue`,
documents of the two sets whose newest revision is a draft, of the newest period for a dated
type; `documents_behind`, the rows of that view; `clients_missing_data`, the rows of
`clients_missing_basic_data`; `employee_signatures_pending` and
`employee_signatures_oldest_issued_at`, pending trainee slots; `active_clients`;
`contracts_received_to_confirm`, copies received through the return link and not confirmed on
an issued service contract; and `contracts_ending_within_60_days`, contracts that do not renew
by themselves and end, start plus duration less a day, between today and 60 days on, in
Bucharest.

`clients_missing_basic_data` lists the active clients failing a rule of the readiness check
that reads their own rows, with `missing`, the codes of `missingDocumentData` in its order:
the legal representative's name and role, the six responsible roles of the two sets, at least
one current job position, and the answers of every current position about equipment,
instruction modules and fire-safety modules.

`dashboard_employees_at_month_ends(organization)` returns twelve rows, `month` (its first day)
and `employees`, oldest first: the employees of the organization's active clients, archived
ones left out, hired by the month's last day and not left by it, the current month counted up
to today.

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
