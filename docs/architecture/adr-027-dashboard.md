# ADR 027: A dashboard of counts, computed in the database for one organization

- Status: proposed
- Date: 2026-10-24
- Amended 2026-10-31: the training and test counts are read through a function that checks the caller; see the amendment below.

## Context

The first page after sign-in, `/dashboard`, shows an account card and a card of clients; it was renamed **Dashboard** in the sidebar and the breadcrumb by #565, and nothing else about it was decided. A specialist who opens the app wants to know what needs them today and where their clients stand, and today learns it by walking the clients list, each client's documents tabs, the employees list with its state chips, and the signatures page.

The page was designed over six rounds on a canvas (rounds 5 and 6, boards "R6Main", "R6Empty" and "R6Phone", 2026-10-24). One pattern serves every number: a 40 px badge, the number at 28 px and its label on one baseline, a detail line, a chevron when it leads somewhere. The colours of the training strip are settled: depășite `#b42318`, scadente `#e9c46a`, neinstruiți `#8fa69b`, la zi `#d4ddd5`, and the action panel is lime (`#eef5dc`, border `#d3e5a6`). Rejected on the canvas: rings and gauges, a multicoloured card per number, and a page per role.

What the code had, swept on 2026-10-24. No aggregate: every list endpoint returns a `total`, so the page would need a dozen requests, and some numbers exist in no list at all. The training state is computed per employee by the view `employee_training_status` (_neinstruit_, _la zi_, _scadentă_ within 30 days of the Romanian day, _depășită_) and the test state by `employee_test_status` ([ADR 021](adr-021-training-records-and-individual-sheets.md), [ADR 024](adr-024-knowledge-tests.md)). The `trainingState` filter of `GET /employees` matches either domain, and `current` means both, so a link from an SSM count would list PSI's too. The readiness of a client's documentation is computed in TypeScript from about twenty reads per client (`missingDocumentData`, [ADR 005](adr-005-document-generation.md) and its successors) and stored nowhere. No history of headcount is kept. A client has no specialist assigned, so a specialist answers for the whole organization.

Mircea decided on 2026-10-24: "clienți cu date lipsă" counts the clients failing a cheap subset of the readiness rules, computed in SQL, the detail line saying "date de bază"; the portfolio's monthly bars come from the employment dates; the contracts card counts the received copies of clients and leads alike, since a copy mostly comes back before the lead is promoted, and the ending contracts of active clients only, leaving out the contracts that renew by themselves; "semnături de la angajați" links to the clients list until the employees list can filter on it (#580).

## Decision

### One page for every member, the contracts card for owners

Top to bottom:

1. The heading **Dashboard**, a greeting line with the totals, and the day.
2. **Ce ai de făcut**, the lime panel, with three tiles: _semnături de dat_, the caller's own pending signature slots (to `/signatures`); _documente gata de emis_, drafts waiting to be issued (to `/clients?sort=documentation&order=asc`); _clienți cu date lipsă_, red, with the detail "date de bază".
3. **Situația clienților**, one card: a row for SSM and one for PSI, each with the overdue count, one segmented strip over the four states, and under it the count of each state linking to `/employees?trainingState=<state>&domain=<ssm|psi>`; then a third row, _documente de actualizat_, the documents behind their template or their instruction modules (to `/legislatie/documente`).
4. A bottom row: **Așteptăm de la angajați**, the employees' pending signatures with the age of the oldest (to `/clients`, until #580) and the hiring tests waiting (to `/employees?testState=pending`); **Portofoliu**, the active clients, the employees, "+N față de luna trecută" and twelve monthly bars captioned with the month; **Contracte**, for owners only, the signed copies received and not yet confirmed and the contracts ending within 60 days.

A specialist sees the same page without the contracts card, and the same numbers as the owner otherwise: with no client assignment, a per-specialist page would be a guess. The owner check is the endpoint's, and the database agrees by itself, since a specialist reads no service contract and no copy of one.

### Every organization-wide number comes from one row

The schema gains a view, `dashboard_summary`, with one row per organization the caller can read, every count a column, and a function, `dashboard_employees_at_month_ends(organization)`, with the twelve bars. Both are read as the caller (security invoker), so tenancy, impersonation and the owners-only policies apply as they do on every list, and a count over a table the caller may not read is zero. One request, `GET /dashboard/summary`, reads the row, the bars and the caller's own pending signatures, which are a count on `signature_requests` with the predicates of `GET /me/signature-requests` and need no object of their own. Twelve list requests counted by `total` were rejected for their cost and because half the numbers have no list; a cache of counts written on change was rejected for the many writes that would have to keep it right.

**The employees counted** are those the employees list shows: not archived, not a leaver, of an active client (stage `client`, not archived). Every count that links to the list therefore matches what the list shows when opened. A lead is never counted, as a lead is never on that list.

### The training states per domain, and a domain on the employees list

The SSM and PSI rows count the employees in each state of that domain, from `employee_training_status`. Every employee has a state in both domains, so the two strips total the same headcount. `GET /employees` gains `?domain=ssm|psi`: with it, a state filter reads that domain only, `trainingState=current&domain=ssm` meaning up to date in SSM whatever PSI says, and a `testState` filter likewise; without it, the filters keep their meaning. The SPA keeps the domain in the search params, and picking or clearing a state on the page drops it, so no filter stays on that the page does not show.

### The documents

_Documente gata de emis_ counts the documents of the two sets whose newest revision is a draft, of an active client, for a dated type only in its newest period, never the service contract. A draft exists only if the readiness check passed when it was generated, and is not checked again here. _Documente de actualizat_ counts the rows of `documents_behind` ([ADR 017](adr-017-legislation-monitoring.md), [ADR 014](adr-014-training-themes.md) amendment of 2026-10-22), edited drafts included.

### Clients missing basic data, not the whole readiness check

`clients_missing_basic_data` lists every active client failing one of the readiness rules that read a client's own columns and rows directly, with the codes of the full check (`missingDocumentData`), so the app words them as the documents tabs do. Covered:

- `client.representativeName` and `client.representativeRole`: blank or missing.
- `responsible.workplace_manager`, `responsible.first_aid`, `responsible.risk_evaluation_team`, `responsible.imminent_danger`, `responsible.fire_safety_coordinator`, `responsible.fire_intervention_leader`: no current responsible person holds the role.
- `positions.any`: no current job position.
- `positions.equipment`, `positions.instructions`, `fire.instructions`: a current position has not answered whether it needs protective equipment, instruction modules or fire-safety modules.

Not covered, and found only when the set is generated: the organization's and the specialist's own data (`provider.*`, `specialist.*`), which concern the provider rather than a client; the training schedules (`client.trainingSchedule`, `fire.trainingSchedule`), whose rule depends on the staff categories in use; the workers' representatives (`responsible.workers_representative`, `responsible.workers_representatives_two`, `responsible.workers_representative_is_legal_representative`), which depend on the headcount and on comparing two people; the risk evaluations (`positions.risk_evaluation`, `risk_evaluations.*`); the fire-safety card, workplaces, equipment and substances (`fire.smokingPolicy`, `fire.waste`, `fire.workplaces`, `fire.equipment`, `fire.substances`); and the two that only regenerating the themes asks (`documents.own_instructions`, `documents.fire_own_instructions`). A client missing from the count may therefore still be refused at generation; the detail line "date de bază" says what was checked, and the count never claims more. Counting the clients without generated documents was rejected because it answers another question, and storing the readiness per client was rejected because each of its many inputs would have to refresh it.

### What waits on employees

_Semnături de la angajați_ counts the pending trainee slots, of training records and of test sheets ([ADR 023](adr-023-advanced-electronic-signature.md), [ADR 024](adr-024-knowledge-tests.md)), on active clients, with the issue time of the oldest for its age. _Teste de susținut_ counts the employees with a hiring test waiting in either domain, the `pending` test state.

### The portfolio from employment dates

The bars are the employees of the organization's clients at the end of each of the last twelve calendar months, the current one counted up to today: hired on or before that day and not left by it, from `hired_at` and `terminated_at`. These dates say when someone worked for the client, so a provider who onboarded last week sees the clients' real history rather than a flat line and a jump on the day of the import, which counting by `created_at` would show. Archived employees are left out of every month, and only the clients active today count, in every month: an archived client leaves the history with its employees. "+N față de luna trecută" is the last bar minus the one before. Months before the first hire count zero.

### The contracts, for owners

The card counts the signed copies received through the return link ([ADR 007](adr-007-leads-and-service-contracts.md)) and not yet confirmed, on the revision of the service contract in force, a correction drafted beside it included, as the clients list shows such a contract as received. It also counts the contracts ending between today and 60 days from now, the end being the start plus the duration less one day, as the contract prints it; a contract that renews by itself never ends and is left out. The copies count leads as well as clients, since the copy mostly comes back while the company is still a lead and the owner who sees the row is the one who promotes it; the ending contracts count active clients only.

### When numbers are zero

- A row whose count is zero disappears, and a card left without rows disappears.
- The SSM and PSI rows always stay: a strip all _la zi_ is the good news.
- The lime panel always holds one row: with its three tiles at zero, a dashed tile **Totul e la zi** with the next training due, "Următoarea instruire scadentă: luni, 2 noiembrie, pentru 4 angajați": the nearest due date of an employee current or due in either domain, and how many employees it concerns. With no due date at all, the line names none.
- The portfolio has no rows and stays.

## What is left out

- Numbers per specialist, until a client is assigned to one.
- Trends other than the portfolio's bars, and any stored history of counts.
- The full readiness check in the count of clients missing data.
- A filter of the employees list on pending signatures (#580).
- Notifications about any of these numbers: the page is read when opened.
- Caching the summary: it is computed on every load.

## Consequences

- The schema gains two views and a function; `GET /employees` gains a parameter; the API gains one endpoint; `/dashboard` is replaced. The generated types gain the relationships PostgREST infers through the views' `organization_id` and `client_id`, as for `client_list`.
- Each load computes the training and test states of every current employee of the organization, which the employees list does a page at a time. At the sizes providers have today that is cheap; a stored state is the next step if it stops being so.
- `docs/data-model.md` and `docs/api.md` describe the views, the function, the parameter and the endpoint; `docs/app.md` the page.

## Order of work

1. This ADR; `dashboard_summary`, `clients_missing_basic_data` and `dashboard_employees_at_month_ends` with pgTAP tests; the `domain` parameter of `GET /employees` and of the SPA's employees route.
2. `GET /dashboard/summary` in a module of its own, with its contract: the row, the bars, the caller's own pending signatures, and the contracts as null for a specialist. On step 1.
3. The page, from the canvas's boards, for desktop and phone, with its empty rules. On step 2.

## Amendment (2026-10-31): the states of a whole organization

Measured on generated data, one organization with about 21,000 employees, 400 clients and 534,000 training records, the training and test counts took over two seconds of the summary, and the employees list filtered by a state as long: read through the status views as the caller, every employee costs lookups per domain, and under the policies the planner's estimates collapse. Calling `employee_training_due` and `employee_test_due` once per employee as the owner, so with the same rules and no policies, still took over a second for the two counts.

`organization_employee_states(organization)`, security definer, reads the training records, the trainings and the test results once each, grouped by employee, and returns the training state and due date and the test state in both domains of every current employee of the organization's active clients. It answers only for the caller's own organization and returns nothing for another, so it stands in for the policies the views would apply. It repeats the rules of the two functions rather than calling them; a pgTAP test compares it with the views row by row on employees that reach every state, so a rule changed in one place only fails the build. `dashboard_summary` keeps its columns and takes its training counts, its nearest due date and its pending tests from it. `organization_employees_in_state(organization, training state, test state, domain)` returns the employees in those states, with the meaning the list gives them, and `GET /employees` with a state filter pages through it and reads the page's statuses afterwards. On the generated data the two counts take about 170 ms and a filtered page about 200 ms.
