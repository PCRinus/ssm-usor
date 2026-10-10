# ADR 018: Fire-safety means per workplace, and the client data of the fire-safety set's second stage

- Status: accepted
- Date: 2026-10-10

## Context

[ADR 016](adr-016-fire-safety-documents.md) built the fire-safety set in three stages and left the data model of the second to the day it starts. Stage 2 holds the documents whose content is clear and whose open point is the client's data: five decisions, the list of fire-fighting means, the posted workplace sheet, and the cover that fronts the decisions.

| Number | Type key                      | Document                                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------ |
| 1.0    | `fire_cover_decisions`        | The decisions cover                                                                        |
| 1.1    | `fire_decision_organization`  | Decision 1, how fire defence is organized and who answers for what                         |
| 1.2    | `fire_decision_training`      | Decision 2, fire-safety training                                                           |
| 1.3    | `fire_decision_open_fire`     | Decision 3, work with open fire                                                            |
| 1.5    | `fire_decision_seasons`       | Decision 5, hot and dry periods and the cold season                                        |
| 1.8    | `fire_decision_waste`         | Decision 8, collecting combustible waste                                                   |
| 5.1    | `fire_means_list`             | The list of fire-fighting means                                                            |
| 5.2    | `fire_workplace_organization` | The posted sheet on how fire defence is organized at the workplace, one page per workplace |

The legal texts were read on 2026-10-10. OMAI 712/2005, as amended by OMAI 786/2005, sets the periodic training at two hours at least for every staff category (art. 21) and its interval by category (art. 26): at most one month for operative and execution staff supporting the intervention, one to three months for staff working directly with machines and installations, three to six for auxiliary production staff, one to six for auxiliary staff with organization, management and control duties. At an operator with at most nine employees the periodic training is the owner's or the head's own task (art. 31(2)). OMAI 163/2007 art. 17 lists the acts of authority, among them (a) the organization and the responsibilities, (b) the instructions and duties at the workplace, (c) open fire and smoking, (d) training, (i) the appointment of the technician and (j) the hot and dry seasons. Art. 20(1) applies art. 17 and 18 from the headcount of a small enterprise, ten employees under Legea 346/2004; art. 20(2) and (3) give an operator under ten a shorter list, which still holds the instructions and duties at the workplace, open fire and smoking, the training, the fire-work permit register, "organizarea apărării împotriva incendiilor la locul de muncă" and the training sheets. Art. 25 and annex 1 give that posted sheet: one per workplace, section I on prevention (combustible materials, ignition sources, equipment and means of work, general measures, specific measures) and section II on first intervention (the alarm means, the limiting and extinguishing installations, the personal protection means, who acts with extinguishers, interior hydrants, the electrical panel and the installations, who evacuates persons and goods), completed by the head of the workplace and approved by the technician. Art. 131 and annex 6 give an orientative minimum of extinguishers per built area: one per 300 m² for administrative buildings, one per 200 m² for commercial and food service, one per level or apartment for dwellings, one per 300 m² for mixed civil buildings, one per 150 m² for other arrangements. Legea 307/2006 art. 19 makes the administrator set the responsibilities and the organization by written dispositions (a) and write the fire-safety instructions and the employees' duties (g).

The sample pack prints these facts about the client. Decision 1 names one person, the shop's manager, in every designation, with the provider's technician "după caz" beside them, and a first-intervention team of a named leader and "personalul aflat la program". Decision 2 names the posts of each staff category, "Manager magazin" as administrative and two execution posts, trains both every three months for two hours, and names the head of the workplace as trainer. Decision 3 names who answers for open-fire work and leaves the permit to "coordonatorul privind apărarea împotriva incendiilor". Decision 5 names the workplace by its activity, "Punct de lucru, Gelaterie", and the person who answers for each seasonal measure. Decision 8 lists the waste collected and the authorized firm it goes to. The list of means prints, per workplace, its used area, its norm from annex 6, and counts of extinguishers by type, wheeled extinguishers, sand boxes and fire posts, then annex 6 itself, then a table of exterior-hydrant accessories.

The pack contradicts itself on the one fact it counts. The list of means counts two P6 and one G3 extinguishers, in the workplace's row and again in its total. Decision 7, the posted instructions of stage 3, lists the same two P6 and one G3 in its table, and the sentence right above that table says two P6 alone. Typed by hand, the same count drifted within one page; generated, both documents must read one inventory.

The app already stores part of this. A client has workplaces (`client_workplaces`: a name, the registered-office flag, an address) and responsible persons with roles, the workplace manager among them. Its occupational safety training schedule sits on `clients`: a duration of 60, 90 or 120 minutes, an interval per staff category, the first month and the days. A job position has a staff category. The organization keeps the fire-safety technician's name and certificate, and `document_generations.first_decision_number` exists, left null by the fire-safety generation since ADR 016.

## Decision

### Fire-safety means: one row per unit, on the workplace, with a tab of their own

A client's **fire-safety means** (_mijloace de apărare împotriva incendiilor_) are recorded per unit and hang off the workplace. `fire_equipment` holds one row per extinguisher, sand box, fire post, fire blanket or other piece of equipment; `fire_installations` holds one row per installation, such as the detection and alarm system or the interior hydrants. Every row names its workplace, and the documents print them per workplace.

Counts per workplace and type, which is what the sample prints, were rejected. The register of the monthly extinguisher control (OMAI 135/2023 annex 2, already a blank of stage 1) and the maintainer's service (OMAI 163/2007 art. 133) are about one unit: its label, where it hangs, when it was serviced and when it is due. Counts would serve the documents of this stage and nothing after; moving from counts to units later means re-entering every client's extinguishers. A unit therefore carries, besides its kind, its agent and capacity when it is an extinguisher, whether it is wheeled, an optional label (an inventory number or serial), where it hangs, its year of manufacture, its last and next service and its maintainer. Only the kind, and for an extinguisher the agent and the capacity, are required; the rest is there for whoever has it. The documents group the units by agent, capacity and wheeled and print counts, as the sample's table does. A unit taken away is deleted, not archived: nothing else points at it, and a generated document keeps what it printed in its snapshot.

The means have a tab of their own, "Mijloace PSI", after "Posturi de lucru" and before "Instruire și responsabili", for specialists and owners alike: one section per active workplace, titled by its name and activity, with a table of its equipment and a table of its installations, each row added, edited and deleted through a dialog. Putting them in the workplace dialog was rejected: a list of units does not fit in a dialog about an address, as ADR 011 found for protective equipment in the position dialog. They are a thing in their own right, and the tab is where the living records will go when they come: the monthly checks and the services.

Equipment kinds are `extinguisher`, `sand_box`, `fire_post`, `fire_blanket` and `other`. An extinguisher's agent is `powder`, `co2`, `foam`, `water` or `clean_agent`, and its capacity, in kilograms or litres, is printed after the agent's letters as the trade writes it: `P` for powder ("P6"), `G` for CO₂ ("G3"), `SM` for foam ("SM6"), `AP` for water ("AP9"), `GI` for a clean agent ("GI2"). Installation kinds are `detection_alarm`, `interior_hydrants`, `exterior_hydrants`, `sprinklers`, `smoke_exhaust`, `emergency_lighting`, `lightning_protection`, `gas_detection` and `other`, the last with a description required. Installations are optional: a shop may have none. The list of means prints the exterior-hydrant accessories table only when some workplace has exterior hydrants.

Annex 6 is a hint and nothing more. Each workplace records which of its five rows applies to it (its **norm**) and its floor area; the tab then shows "N stingătoare · minim orientativ M (anexa 6)", the area divided by the norm's area and rounded up, at least one, or "cel puțin unul pe nivel" for dwellings, which the annex counts by level. The hint never blocks generation and is never printed: the annex calls its numbers orientative, and blocking a client on a guide figure would make the app stricter than the norm. What generation does require is at least one extinguisher in every active workplace.

### The client's fire-safety facts, apart from the occupational safety ones

`client_fire_safety` holds one row per client, created on the first save, so a client nobody has opened for fire safety has no row rather than a row of nulls. It carries the **fire-safety training schedule** (_programul de instruire PSI_), the smoking policy and the waste.

The fire-safety training schedule is not the occupational safety one. The two come from different law, OMAI 712/2005 here and H.G. 1425/2006 there, and their bounds differ: two hours at least against a choice of 60, 90 or 120 minutes, and art. 26's ranges against the intervals of the first set. It records the duration of a periodic training in hours (2 to 8), an interval in months (1 to 6) for each of the two staff categories a job position already has, the first month, and the days of that month. Reading the occupational safety columns was rejected because one client can rightly have different answers, and a change made for one law would silently change the documents of the other.

While a client has no row, the card opens on one starting state: two hours, the law's minimum and the sample's value; three months for both categories, the sample's value; and the first month and the days of the occupational safety schedule, when they are set, because the calendar is the client's while the law is not. Nothing else is carried over: the occupational safety duration is a choice of minutes under another law, and its administrative interval allows twelve months where OMAI 712/2005 allows six. The API says whether the row exists, so the app applies the starting state only then; a saved row is shown as saved, and after that the two schedules never touch.

Every client gets the full set of art. 17 acts whatever its headcount, and the starting values above are the sample's, inside art. 26's ranges. Decision 2 names, at every client whatever its headcount, the technician for the general introductory training and the workplace manager, with the technician "după caz", for the workplace and periodic training, as the sample does; at a client of at most nine employees that also meets art. 31(2), since the workplace manager is the client's own person. These are provisional, waiting on ADR 016's questions 2 and 5, and question 2 stays open; what may change is wording, not the data.

The smoking policy, `forbidden_everywhere` or `designated_places`, is stored now and may stay empty. Nothing prints it until the smoking decision of stage 3, which waits on ADR 016's question 3, and no readiness asks for it; it sits on this card because that is where a specialist settles the client's fire-safety rules. (Amended 2026-10-10. [ADR 019](adr-019-fire-safety-stage-three.md) prints it: decision 4 is the client's smoking rule, and the posted workplace sheet and the posted instructions repeat it. The set requires it from then on, as the readiness code `fire.smokingPolicy`. With `designated_places`, an optional text on the same card, `smoking_place`, says where the places are.)

The waste is a list of kinds, at most twelve short texts ("deșeuri de carton, hârtie, plastic"), and the firm that collects them, optional. Decision 8 prints both.

`client_fire_safety`, `fire_equipment` and `fire_installations` follow `client_workplaces` alike: members of the organization read and write them under the same row policies, `updated_at` is kept by the same trigger, a lead has none of them, and an archived client's rows are frozen (`CLA01`).

### Two new roles, and the head of the workplace

The responsible persons gain two roles: the **fire-safety coordinator** (_coordonator privind apărarea împotriva incendiilor_, the sample's own term, from decision 3) and the **first-intervention leader** (_șef echipă de primă intervenție_). They are roles of a responsible person, not names on the fire-safety card, because a responsible person is already whoever holds a role in the client's safety organization, employee or not, and one person often holds several: in the sample the shop's manager holds every designation. A person may hold from one role up to every role in the list; the limit follows the list of roles, seven from now on.

The head of the workplace, who completes the posted sheet and trains at the workplace, is the existing workplace manager. A role of its own was rejected for now: asking for the same person twice invites two different answers. Whether the two are the same is ADR 016's question 1, tracked as issue #372; until it is answered they are, provisionally.

The coordinator holds every designation of decision 1, with the technician "după caz" beside them as the sample prints. That is provisional too, ADR 016's question 4.

A responsible person can be tied to one workplace, optionally; none means all of them, which is what the dialog offers by default ("Toate locurile de muncă"). The posted sheet of a workplace prints the persons tied to it and those tied to none. The tie is a composite foreign key to the workplace and its client, so a person never points at another client's workplace.

### What a workplace adds

A workplace gains eight columns, all optional in the database: its **activity** ("Gelaterie", "Birouri"), which decision 5, the list of means and the posted sheet print; its floor area in square metres and its annex 6 norm, which the list prints as "Aria utilă" and "Norma de dotare" and the hint reads; its assembly point; three texts of section I of the posted sheet, the combustible materials (I.1), the ignition sources (I.2), and the equipment and means of work (I.3); and the specific measures of point I.5. The texts are what only someone who knows the place can write; the dialog shows examples from annex 1 as placeholders. Generation asks for the first seven; the specific measures are optional, and the sheet prints that point empty when they are not set.

Point I.4, the general measures, is the template's own text, the same at every workplace: open fire only with a permit, smoking as the client's rule says, combustible waste collected daily, access and evacuation routes kept free, the electrical panel and the installations checked at closing time. It is not stored, since nothing in it differs between workplaces.

The fire risk level of a space is not stored. No document of this stage prints it, and a column nobody prints is a field users fill for nothing.

### Each fact is entered where its subject is

There is no "Date PSI" tab. The client page was reorganized in September 2026 because its old "Date pentru documente" tab was named for where its data was printed, not for what it was, and collected facts about unrelated things. The fire-safety facts follow what they are about:

- the fire-safety training schedule, the smoking policy and the waste, on "Instruire și responsabili", as a card "Instruire PSI" beside the occupational safety training card, in the same frame and edited in place;
- the two roles and the optional workplace, in the responsible-person dialog on the same tab;
- the activity, area, norm, assembly point and the four texts, in the workplace dialog under "Detalii", as a group "Apărare împotriva incendiilor", with a muted "Date PSI incomplete" in the workplaces table on every row that lacks one of the seven required;
- the equipment and the installations, on "Mijloace PSI".

### Readiness stays whole

The fire-safety set is still generated whole or not at all: any missing fact blocks the generation of every fire-safety document, as ADR 016 kept it. Generating only the documents whose data is complete is idea #369, parked. The set asks, besides what it asks today:

- `fire.trainingSchedule`: the duration, both intervals, the first month and both days;
- `fire.waste`: at least one kind of waste;
- `fire.workplaces`: the seven required facts on every active workplace, the specific measures not among them;
- `fire.equipment`: at least one extinguisher in every active workplace, so a workplace without one is a row of missing data, not a document that prints nothing;
- `responsible.fire_safety_coordinator` and `responsible.fire_intervention_leader`: an active person in each role;
- `responsible.workplace_manager` and `positions.any`, the existing codes, because the posted sheet and decision 2 print them.

Each row of the generation dialog leads to the field that fixes it, as the occupational safety rows do.

### One object for the fire-safety facts

Fire-safety templates read the client's fire-safety facts from one object, `fire`, merged into every template of the set beside the shared `client`, `provider`, `fireSafetyTechnician`, `issueDate` and `branding`, and from nowhere else. It holds the decision numbers, the training schedule with its printed labels, the staff names by category, the coordinator, the intervention leader, the workplace managers, each workplace with its facts, its grouped extinguishers, its other equipment, its installations, its manager and its first-intervention persons, whether any workplace has exterior hydrants, and the waste.

`fire.staff` lists the names of the client's current job positions by staff category, the posts decision 2 prints, and nothing else of them: no equipment, no instructions, no evaluation. ADR 016 kept the first set's `positions` out of fire-safety templates because a snapshot keeps the whole value of every name a template printed, so a protective-equipment edit would mark fire-safety drafts as changed. A names-only projection keeps that rule: renaming a post or moving it to the other category marks the fire-safety drafts, as it should, since decision 2 prints both, and nothing else about a post does.

The snapshot keeps the whole `fire` value, so any edit of the facts above marks the set's drafts "Date modificate". The occupational safety drafts never print `fire` and are not marked.

### Fire-safety decisions keep their place in the binder

Each fire-safety decision has a fixed ordinal, its number in the provider's binder: 1, 2, 3, 5 and 8 now, 4, 6, 7 and 9 with stage 3. Its printed number is the first decision number plus its ordinal minus one. Numbering the decisions one after another in the order of what exists, as `decisionTypeKeys` does for the occupational safety set, was rejected: decision 4 arriving in stage 3 would renumber decisions 5 and 8 on their next generation while the issued copies on the client's shelf keep the old numbers.

From this stage the fire-safety generation asks for the first decision number, in the field `document_generations.first_decision_number` that the occupational safety set already uses.

## What is left out

- Filled registers and the monthly extinguisher check as records in the app. The units are recorded so these can come; the registers stay blank pages for the binder.
- Documents that exist many times per client, such as a register sheet per extinguisher or per installation. The posted sheet is one document with a page per workplace, not a document per workplace.
- A fire-safety interval per job position, overriding its category's, as the occupational safety schedule allows (issue #371).
- The evacuation plan, which is drawn, not merged.
- The fire risk level of a space.
- Decisions 4, 6, 7 and 9, the own instructions, the training themes and the tests: stage 3, waiting on ADR 016's questions 3 and 6 to 13. Their planned rows on the _Documente PSI_ tab stay.
- Any reading of the service contract: the set still applies to every client.

## Consequences

- The fire-safety set can no longer be generated with the technician alone. A client whose fire-safety data is incomplete gets none of the set, the blank registers of stage 1 included, until it is complete or idea #369 is taken up.
- A client with several workplaces has more to fill in before the first fire-safety generation: seven facts and at least one extinguisher per workplace, and the generation dialog has to say which workplace lacks what.
- Every extinguisher is entered one by one, which is more typing than a count for a client with many units, once.
- The client page gains its ninth tab. On a phone the tab bar already scrolls, and the tab's tables stack their cells at 360 px.
- `responsible_person_role`, the contracts' role list and the responsible-person request grow by two roles, and the limit on a person's roles grows with them; the occupational safety documents ignore them.
- A fire-safety draft goes "Date modificate" on any edit of any fire-safety fact, not only those it prints, until staleness is computed per document.
- Printed decision numbers have gaps until stage 3: the binder goes from decision 3 to decision 5 and from 5 to 8.
- The wording of decisions 1 and 2 and of the posted sheet follows provisional defaults. When the provider answers ADR 016's questions 1, 2, 4 and 5, the templates change and the data stays.

## Order of work

1. This ADR, the amendment to ADR 016, the glossary in `CONTEXT.md` and the fire-safety section of `docs/data-model.md`.
2. The data: the migrations for `client_fire_safety`, the workplace columns, the two roles and the person's workplace, `fire_equipment` and `fire_installations`, with their pgTAP tests; the contracts, the API routes and their tests, the seed, and `docs/api.md`.
3. The screens: the "Instruire PSI" card, the roles and workplace in the responsible-person dialog, the fire-safety group in the workplace dialog, and the "Mijloace PSI" tab, with unit tests and a flow.
4. The documents: the `fire` object, the readiness codes, the fixed-ordinal numbering and the first decision number in the generation dialog, the snapshot, the eight templates and their manifest, and the move of the eight type keys from planned to built on the _Documente PSI_ tab. After the merge, the templates are registered on hosted.
