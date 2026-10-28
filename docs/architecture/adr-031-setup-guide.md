# ADR 031: A setup guide of fifteen steps, ticked from what each member has done

- Status: proposed
- Date: 2026-10-28

## Context

A new organization lands on a dashboard that says _Totul e la zi_ and has nothing to say about where to start. The only guide is the welcome tour: four tooltips on `/dashboard` (react-joyride), finished by clicking through them, recorded in `user_guides` as `completed` or `skipped`, and replayed from Setări → Ghiduri. Nothing in it reads what the organization has done, and testers dismiss it in a few seconds.

Stripe's Dashboard has the pattern Mircea wants to follow: a small window at the bottom right with a progress bar and "Next: …", which expands into groups of tasks, opens one group at a time, locks a task until the one before it is done, and explains the lock on hover. Its tasks open step-by-step modal windows. Tried in the Stripe sandbox on 2026-10-28: closing it leaves a "Setup guide" pill with a progress ring in the header, clicking the pill opens the full list, and the next full page load brings the window back. Nothing in Stripe's search or help menu reopens it.

Four placements were drawn on a design canvas ("Ghid de configurare", 2026-10-28): a floating window (A), a card in the sidebar opening a side sheet (B), a panel on the dashboard that shrinks to a header pill elsewhere (C), and a column on the client's page listing that client's readiness (D). Mircea chose A. D was rejected because the column takes too much of crowded pages such as a client's, and the client's documents tabs already list what is missing. The canvas page "Varianta A" is drawn on the app's real header and sidebar, for desktop and phone, in every state below.

The data each step needs is already stored. Every table a member's work writes records the author: `created_by` on clients, workplaces, job positions, employees, responsible persons, a client's fire-safety data, risk evaluations, document generations and trainings; `issued_by` on document revisions and signature requests; `invited_by` on participant invitations. The client import of [ADR 030](adr-030-import-from-documents.md), open as PRs #642–#649, writes the confirming member as `created_by` of every row it creates.

Mircea decided on 2026-10-28: the fifteen steps below with fire safety in them, since providers sell SSM and SU/PSI together and the app generates both sets for every client; that every member follows their own progress, the owner included, because the owner is usually a specialist too and should learn to set up a client; that a member who joins an organization already set up still gets the full list, so the guide teaches the app; that steps only an owner can do are shown to a specialist and ticked once an owner has done them; that the header pill brings the guide back small, not expanded; and that adding a client or employees counts by the form and by the document import alike.

## Decision

### One guide, fifteen steps, in four groups

The **setup guide** (_ghid de configurare_) is one list for every member. Its steps, in order, with the id each keeps in code and analytics:

**Contul și firma**

1. `account`, _Creează contul_. Always done; the list never starts at zero.
2. `company`, _Completează datele firmei_. An **organization step**.
3. `authorizations`, _Adaugă abilitările și cadrul tehnic PSI_. An organization step.
4. `professional-title`, _Completează-ți titlul profesional_. Yours: the documents print it beside your name.

**Primul client**

5. `client`, _Adaugă primul client_.
6. `workplaces-positions`, _Adaugă punctele de lucru și posturile_.
7. `employees`, _Adaugă angajații_.
8. `responsible-persons`, _Numește persoanele responsabile_.

**Prima documentație**

9. `risk-evaluation`, _Evaluează riscurile posturilor_.
10. `fire-safety-data`, _Completează datele PSI ale clientului_.
11. `generate-sets`, _Generează documentația SSM și PSI_.
12. `issue-document`, _Emite primul document_.

**Instruire și semnături**

13. `portal-invitation`, _Invită angajații în portal_.
14. `training`, _Înregistrează prima instruire_.
15. `signature`, _Strânge prima semnătură electronică_.

Steps 5 to 15 are **member steps**. Where the organization already has the thing a step adds, the wording drops "primul": _Adaugă un client_, _Emite un document_, group _Primul tău client_. A member who joins an organization that is already set up therefore reads the same list as its founder, as things to learn rather than things missing.

### What ticks a step

An organization step ticks from the organization's own columns, for every member, whoever filled them. Only an owner can change them (the organization endpoints require the owner):

- `company`: the legal name, CUI, address and legal representative's name and role are filled. The SSM set needs the name and the representative; the service contract needs the rest.
- `authorizations`: the certificate of authorization's number, date and issuer, and the fire-safety technician's name and certificate, are filled. The fire-safety set needs the technician; the service contract cites the certificate.

`professional-title` ticks when the caller's profile has a professional title.

A member step ticks when **the caller** has done it, through a form or through a confirmed import:

| Step                   | Done when the caller has …                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| `client`               | created a client (stage `client`)                                             |
| `workplaces-positions` | created a workplace and a job position, not necessarily of the same client    |
| `employees`            | created an employee                                                           |
| `responsible-persons`  | created a responsible person                                                  |
| `risk-evaluation`      | created a risk evaluation                                                     |
| `fire-safety-data`     | saved a client's fire-safety data for the first time (the row's `created_by`) |
| `generate-sets`        | generated the occupational safety set and the fire-safety set, of any clients |
| `issue-document`       | issued a document revision                                                    |
| `portal-invitation`    | invited an employee to the portal                                             |
| `training`             | recorded a training held in the app (source `app`)                            |
| `signature`            | issued a signature request that was signed                                    |

Ticking by the caller's own work, and not by the organization's, was chosen over a partial guide for joiners that left out what the organization had already done: a specialist joining a firm with forty clients would get a list of one step and never see the rest of the app. Ticking by the organization for the owner alone was rejected too, as one rule for everyone is simpler and the owner learns the same app.

A step can also be **skipped** with **Știu deja**, which ticks it with a lighter mark, "Știi deja", and counts it as done. It is there for experienced specialists and for steps a joiner may never meet, such as naming responsible persons in a firm where every client has them. Only member steps can be skipped; `professional-title` cannot, as the documents need it. A skipped step that is later done shows as done.

The progress reads "N din 15", counting the done and the skipped steps.

### What locks a step

A lock follows the organization, never the caller: a joiner in a firm with clients can record a training at once without adding a client first. A locked step shows a padlock and its reason on hover or focus:

| Step                                                              | Locked until the organization has …                                                                                           | Reason                                                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workplaces-positions`, `responsible-persons`, `fire-safety-data` | a client                                                                                                                      | _Adaugă întâi primul client ca să deblochezi pasul._                                                                                                             |
| `employees`                                                       | a client with a workplace and a job position                                                                                  | _Adaugă întâi punctele de lucru și posturile._                                                                                                                   |
| `risk-evaluation`                                                 | a client with a job position                                                                                                  | _Se deblochează după ce clientul are posturi._                                                                                                                   |
| `generate-sets`                                                   | both organization steps done, and an active client absent from `clients_missing_basic_data` ([ADR 027](adr-027-dashboard.md)) | _Se deblochează când clientul are toate datele de bază._, or, when an organization step is missing, _Așteaptă datele firmei de la administrator, Ioana Popescu._ |
| `issue-document`                                                  | a draft revision                                                                                                              | _Generează întâi documentația._                                                                                                                                  |
| `portal-invitation`, `training`                                   | a client with an employee                                                                                                     | _Adaugă întâi angajații clientului._                                                                                                                             |
| `signature`                                                       | a training with a training record                                                                                             | _Se deblochează după prima instruire._                                                                                                                           |

The basic-data check is the dashboard's subset, so an unlocked `generate-sets` may still be refused at generation; the documents tab then lists the rest, as it does today.

For a specialist, an organization step not yet done shows no button and reads _Doar administratorul poate completa · Ioana Popescu_. A done one reads _Făcut de Ioana Popescu_. The name is the organization's owner. The organization's columns do not record who filled them, so with several owners the line reads _Doar un administrator poate completa_ and _Gata_. "Cere administratorului" with a message to the owner was rejected: it needs a notification the app does not have.

### Where each step leads

The **next step** is the first step in order that is neither done, skipped nor locked, and that the caller can do. It is shown as a card with a sentence and its actions, and the guide's group holding it is open by default. Every other open step is a row that leads to the same place. A step leads to the real page, never to a wizard of the guide's own. Stripe's modal wizards were rejected because they would be a second form for everything the app already has a form for.

### Fields are highlighted, workflows are not

A step that comes down to filling in fields points at the field, with the highlight the missing-data list already uses when it sends a member from a set that cannot be generated to what is missing: the link carries `?focus=<field>`, and the page scrolls to the card, opens its form and marks the field for a moment (`useFocusRequest`, `data-pointed`). These are `company`, `authorizations` and `professional-title`, whose focus keys exist (`organizationCompanyFocus`, `authorizationsFocus`, `profileFocus`). `account` has nothing to fill.

Their card in the guide names each missing field as its own link, as the missing-data list does, and its button opens the first missing one, in the order of the page's form:

- `company`: _Lipsesc: CUI, adresa_; the keys `legal-name`, `cui`, `address`, `representative-name`, `representative-role`.
- `authorizations`: _Lipsesc: certificatul de abilitare, cadrul tehnic PSI_; the keys `certificate` and `fire-safety-technician`.
- `professional-title`: the key `professional-title`, alone.

For a specialist these steps have no links, as they have no button.

Every other step is a workflow, adding a client, generating a set, recording a training, and opens its page without a highlight. A highlight there would point at a button and say nothing the step's own sentence does not, and a workflow has no single field to be missing. `fire-safety-data` is a workflow too: it ticks on the first save of a client's fire-safety card, so the guide knows no particular field to point at. The missing-data list keeps its own highlights on those pages.

| Step                   | Actions                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company`              | Organizație → Date firmă, at the first missing field                                                                                                             |
| `authorizations`       | Organizație → Abilitări, at the first missing field                                                                                                              |
| `professional-title`   | Profilul meu, at the professional title                                                                                                                          |
| `client`               | **Adaugă client** (`/clients/new`) and **Importă din documente** (the client list's import dialog, [ADR 030](adr-030-import-from-documents.md))                  |
| `workplaces-positions` | the client's Detalii, for the workplaces, and its Posturi                                                                                                        |
| `employees`            | **Adaugă angajat** (the client's new-employee form) and **Importă din fișe** (the employee import on the client's Angajați tab, once ADR 030's step 10 is built) |
| `responsible-persons`  | the client's Detalii, for the responsible persons                                                                                                                |
| `risk-evaluation`      | the client's Posturi                                                                                                                                             |
| `fire-safety-data`     | the client's Instruire tab, for the fire-safety card                                                                                                             |
| `generate-sets`        | the client's Documente SSM                                                                                                                                       |
| `issue-document`       | the client's Documente SSM                                                                                                                                       |
| `portal-invitation`    | the client's Portal tab                                                                                                                                          |
| `training`             | the client's Instruiri                                                                                                                                           |
| `signature`            | Semnături                                                                                                                                                        |

A step on a client opens the active client furthest along: the one with the most of steps 6 to 15 done, by anyone, the newest first on a tie. The import is counted like the form because the import's confirm function writes the confirming member as `created_by`: one confirmed client import ticks `client`, `workplaces-positions`, `responsible-persons` and `fire-safety-data` at once, and the next step becomes `employees`.

### Three states, and the pill

- **Expanded** (_deschis_): 372 px at the bottom right, 24 px from the edges. A header with _Ghid de configurare_, "N din 15", a down chevron (_Micșorează ghidul_) and × (_Ascunde ghidul_); the progress bar; then the four groups, one open at a time, each with "N din M" or _Gata_.
- **Collapsed** (_micșorat_): 340 px at the bottom right: the title, "N din 15", an up chevron (_Arată toți pașii_), ×, the bar, and _Următorul: <next step>_ as a link.
- **Closed** (_închis_): no window. A pill at the right end of the header, _Ghid de configurare N/15_ with a progress ring, which brings the guide back collapsed. Stripe's pill opens the full list; collapsed covers less of the page.

On a phone the expanded guide is a bottom sheet over the dimmed page, the collapsed one a bar docked 12 px from the edges, and the closed one a 40 px ring after the subscription badge, with no text so the header still fits. Its accessible name is "Ghid de configurare, N din 15 pași făcuți". Every control there is at least 44 px.

The guide opens expanded on the member's first page load, once the update dialog ([ADR 026](adr-026-updates-and-release-review.md)) is out of the way, and collapsed afterwards. On a phone it always opens collapsed. Expanded or collapsed is kept for the browser session only. Closed is kept on the account, so it holds across devices and reloads, unlike Stripe's. Once all fifteen steps are done or skipped, the guide shows _Gata_ once, expanded with every group ticked, and then leaves the page and the header for good.

It is not shown on the document editor's pages, while the organization's access is read-only ([ADR 029](adr-029-billing-plans-and-trials.md)), or while the platform admin acts as an owner, since closing or skipping would be recorded on someone else's account.

Setări → Ghiduri lists the guide with its progress and **Arată ghidul**, which reopens it collapsed, also after it has finished.

### Data and API

- A function, `setup_progress()`, read as the caller (security invoker): one row for the caller's organization, with whether each step is done by the caller, the organization-wide facts the locks need, the furthest client's id and the owners' names. Tenancy and the owners-only policies apply as they do on every list, as for `dashboard_summary`.
- A table, `setup_step_skips`: `user_id`, `step`, `skipped_at`, keyed on the first two, read and written only by its user. `step` is checked against the eleven member steps.
- Two columns on `profiles`: `setup_guide_closed_at`, set by ×, cleared by the pill and by Arată ghidul; and `setup_guide_finished_at`, set when _Gata_ has been shown, cleared by Arată ghidul. The first expanded opening is kept in the browser: showing it twice on a second device does no harm.
- `GET /me/setup` returns the fifteen steps, each `{ id, state: done | skipped | open | locked, lock?, missing? }`, with the lock's code and, for `company` and `authorizations`, the focus keys of the fields still empty, in the form's order; the next step's id; the furthest client's id; the owner's name or null; `closed` and `finished`. `PUT /me/setup` takes `{ closed?, finished? }`. `PUT` and `DELETE /me/setup/skips/{step}` skip a step and undo the skip.
- The SPA refetches `GET /me/setup` when a mutation that can tick a step settles (the existing query invalidations), so a step ticks while the guide is in view.

### The welcome tour goes

The tour, react-joyride, the `data-tour` attributes, `user_guides` and `GET`/`PUT /me/guides` are removed. Its events `guide_started`, `guide_completed` and `guide_skipped` stop. The setup guide sends, to PostHog:

- `setup_guide_expanded`, `setup_guide_collapsed`, `setup_guide_closed`, `setup_guide_reopened` (`from: pill | settings`);
- `setup_step_clicked` (`step`, `action`: `form`, `import` or `open`);
- `setup_step_skipped` and `setup_step_unskipped` (`step`);
- `setup_step_done` (`step`), when a refetch shows a step done that was not before, during the session;
- `setup_guide_finished`.

## Defaults taken instead of asking

- **Past trainings do not count.** `training` ticks on a training held in the app (source `app`). A training recorded from paper, and the past trainings the employee import will bring in from the sheets, are history: the step is there to teach recording a new one. The canvas's orange note asked this; Mircea had not answered when this was written.
- **The fire-safety data ticks for whoever first saved it.** The row keeps `created_by` and no editor, so a member who only edits a client's existing card does not tick the step and can use Știu deja.
- **The owner's name.** One owner is named; several are "un administrator", since the organization's columns do not say who filled them.
- **The first expanded opening is per browser**, not per account.

## What is left out

- A message or notification to the owner from a specialist's locked step.
- Steps for the plan (_Alege un plan_, once the subscription page is built), the team (_Invită un coleg_), service contracts and leads. They can join the list later; changing the list does not need a migration beyond the check on `setup_step_skips.step`.
- A help article on the guide. No article describes the welcome tour, so none has to change.
- A first-time hint on the phone's ring.
- Per-step videos, and any modal wizard.

## Consequences

- The schema gains a function, a table and two profile columns, and loses `user_guides`. `docs/data-model.md` and `docs/api.md` describe them in place of the user guides; `docs/app.md` describes the guide.
- `setup_progress()` runs a dozen `exists` queries on each load and after each mutation that can tick a step. Each is on an indexed `organization_id` or `created_by`, and stops at the first row.
- A step's wording, its actions and its lock reasons live in the SPA; the API returns ids and codes only.
- The pull request that completes the guide carries the Actualizări block: a _Ce e nou_ entry for the guide, and nothing about the tour, which members do not miss.

## Order of work

1. This ADR, and the glossary terms in `CONTEXT.md`.
2. The database: `setup_progress()`, `setup_step_skips`, the two profile columns, dropping `user_guides`. pgTAP tests for each step's rule, the locks and tenancy, including a member who joined after the organization was set up.
3. The API: `GET /me/setup`, `PUT /me/setup`, the skips, their contracts; `/me/guides` removed. On step 2.
4. The SPA: the guide in its three states on desktop and phone, the pill and the ring, the links, Știu deja, Setări → Ghiduri, the events, and the welcome tour removed. From the canvas's "Varianta A" boards. On step 3.
5. The import actions: _Importă din documente_ once the client import's upload (#648) is on `main`, and _Importă din fișe_ once the employee import (ADR 030, step 10) is built. Until then each step shows its form action alone.
