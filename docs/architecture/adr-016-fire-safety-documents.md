# ADR 016: The fire-safety documentation set, a second set beside the occupational safety one, built in three stages

- Status: accepted
- Date: 2026-10-06

## Context

[ADR 005](adr-005-document-generation.md) and the ADRs after it built one documentation set per client, the occupational safety one, from the provider's pack for a gelato bar. The same provider serves the same client for fire safety (_apărarea împotriva incendiilor_, PSI; the documents themselves say _situații de urgență_, SU) and handed over that pack too: 25 Word files in the shape of the first pack. It has nine decisions with their acknowledgement tables, own instructions of about 40 pages ("IPSU") that the training themes cite by article range, two tests, a list of fire-fighting means, three blank registers, the blank fire-work permit, the blank installation register, five covers, and the provider's own control checklist, which is not handed to clients.

The pack was reviewed on 3 October 2026 against the texts on legislatie.just.ro: Legea 307/2006 as amended by OUG 17/2026 and OUG 38/2026, OMAI 163/2007, OMAI 712/2005 and OMAI 135/2023. Three findings shape this decision.

The merge engine needs nothing new. Values, row loops, paragraph loops and flags cover everything the pack varies, and every file has a close relative among the templates of the first set.

The code around the engine assumes one set. The built-in type keys are one list (`documentTypeKeys`), readiness is one list of missing data that blocks generation as a whole (`missingDocumentData`), decisions are numbered from one first number in one order (`decisionTypeKeys`, `document_generations.first_decision_number`), generation creates every registered template the client lacks, and the `documentation_set` value of `document_group` is what the documents list, the lead trigger and the clients list's documentation progress read. A fire-safety template registered today would be generated with the occupational safety documents, blocked by their missing data and counted in their progress.

The pack's content is weaker than the first pack's was. The periodic training interval is three months everywhere and one month in a test's answer key; decision 4 allows a smoking place and bans smoking on the whole site; decision 6 cites the legal basis of decision 5 and annexes a job description from before 2006; decision 7 and the IPSU teach first aid that is out of date; the IPSU's one client-specific annex is cited and missing; whole chapters are written for barracks, depots and households. Several documents the norms ask of every employer are not in the pack at all: the individual training sheet (OMAI 712/2005), the posted sheet on how fire defence is organized at the workplace (OMAI 163/2007 art. 25 and annex 1) and the register of the monthly extinguisher control (OMAI 135/2023 art. 8 and annex 2).

The blank registers and forms have none of these problems. Their layouts are the norms' own models: the permit is annex 4 of OMAI 163/2007, the installation register annex 7 (art. 142), the exercise record annex 8 (art. 146).

The provider normally sells both services to every client, so a client without fire-safety documents is the exception, and the two checkboxes on the service contract that say what it covers do not describe how the provider works.

## Decision

### A second set, for every client

A client has two documentation sets: the **occupational safety set** and the **fire-safety set**. The fire-safety set exists for every client, with no switch on the client and no reading of the service contract. A client who does not need it simply has nothing generated in it, as with the first set. A lead has neither set.

A per-client switch was rejected because the provider sells both services together. The contract's `covers_fire_safety` was rejected twice over: only owners can read contracts, so a specialist could not see whether the set applies, and the checkboxes are expected to go.

### What a set keeps to itself

Each set has its own tab on the client, _Documente SSM_ and _Documente PSI_, with its own sections, its own "Generează documentația" action and its own readiness. Listing, readiness, generation and the memory of what the last generation asked are per set. Missing data of one set never blocks the other, and generating one set never creates documents of the other. A document's own routes (edit, regenerate, issue, print, download, signed copy) do not change, and neither do revisions, snapshots, the "Date modificate" badge or the PDF at issuing.

The set is a fact on the document: `document_group` gains the value `fire_safety_set`, and a generation records the set it ran for. Deriving the set from the type key was rejected: the documents list, the lead trigger and the clients list already read the group, and a new value leaves all three correct for the first set without touching their conditions. The lead trigger refuses both sets.

Fire-safety decisions are numbered in a sequence of their own, "Decizia nr. 1 PSI", from a first number the fire-safety generation asks for, as the provider's pack does. The field arrives with the first fire-safety decision; until then the fire-safety generation asks only the issue date.

Fire-safety templates live in a folder of their own with their own manifest, registered by the same script as the other two manifests. Their type keys start with `fire_`. They are merged with the shared facts (client, provider, issue date) and, from stage 2, with one object that holds the fire-safety facts. They never print the first set's `positions`: a snapshot keeps the whole value of every name a template printed, so a protective-equipment edit would mark fire-safety drafts as changed.

The _Documente PSI_ tab lists the sections of the provider's binder in its order: decisions, own instructions, training themes, tests, list of fire-fighting means, registers. A section is listed once one of its document types is built, so the tab starts with the registers alone. (Amended 2026-10-07. The tab lists the whole pack from the start, every section of the binder under its number and every document in it, so a specialist sees what the documentation will hold. A document that is built but not generated for the client yet reads "Negenerat", and one the app cannot write yet reads "În pregătire"; both are muted, with no link and no actions. Uploading a file for a document that was never generated stays refused, as in the other set.) The documentation progress in the clients list keeps counting the occupational safety set only.

### The fire-safety technician signs for the provider

The provider's side of fire-safety covers, header boxes and hand-over blocks is the organization's **fire-safety technician** (_cadru tehnic PSI_), not its legal representative. The name and certificate already kept on the organization are used; they join the facts the documents are generated from, and a missing technician is a readiness row of the fire-safety set. The cover builder and the import tool, which fix the provider's signer to the representative, take the signer per cover and per template.

Waiting for a list of technicians chosen per client (issue #170) was rejected for a first stage: one technician per organization is what the data holds and what the sample shows.

### Three stages

The pack is built in three stages, by what stands between us and a correct document.

1. **Clear and needing no client data**: the plumbing above and the blank registers and forms. This ADR decides it in full.
2. **Clear but needing data the app does not store**: the list of fire-fighting means, the posted workplace sheet, and the decisions whose open point is data: organization and responsibilities, training, fire work, hot and cold seasons, waste. They need a fire-safety training schedule apart from the occupational safety one, two or three fire-safety roles among the responsible persons, the activity, area and assembly point of a workplace, and an inventory of extinguishers and installations. The data model is decided when the stage starts, as an amendment here or an ADR of its own. (Amended 2026-10-10. Stage 2's data model is [ADR 018](adr-018-fire-safety-means.md). Its documents are eight type keys: `fire_cover_decisions` (1.0), `fire_decision_organization` (1.1), `fire_decision_training` (1.2), `fire_decision_open_fire` (1.3), `fire_decision_seasons` (1.5), `fire_decision_waste` (1.8), `fire_means_list` (5.1) and `fire_workplace_organization` (5.2). Each fire-safety decision keeps a fixed ordinal, its number in the binder, and prints the first decision number plus that ordinal minus one, so the decisions of stage 3 take their places without renumbering the others; the fire-safety generation asks for the first decision number from stage 2 on. `fire.staff`, the names of the current job positions by staff category, is the one names-only projection of positions the set reads; it never reads `positions` itself.)
3. **Waiting for the provider**: the smoking decision, the appointment of the technician with its annex, the posted instructions of decision 7, the control decision, the own instructions, the training themes that cite them, and the tests. Each has content only the provider can settle, listed at the end. (Amended 2026-10-10. Stage 3 is [ADR 019](adr-019-fire-safety-stage-three.md), built on a provisional default for each question below, every one tracked by an issue. Its documents are eleven type keys: `fire_decision_smoking` (1.4), `fire_decision_technician` (1.6), `fire_decision_instructions` (1.7), `fire_decision_control` (1.9), `fire_cover_own_instructions` (2.0), `fire_own_instructions` (2.1), `fire_cover_training_themes` (3.0), `fire_training_themes` (3.1), `fire_cover_tests` (4.0), `fire_test_hiring` (4.1) and `fire_test_annual` (4.2). The decisions take ordinals 4, 6, 7 and 9, so the binder's numbers have no gaps; the covers are built with their sections. The stage adds two optional texts to the data, the client's smoking place and the organization's fire-safety authorization, and asks the smoking policy and the technician's certificate before generating.)

Which stage a document falls in is provisional after stage 1: the provider's answers can move a document forward or back. A cover is built with the section it fronts, not before, so stage 1 has the registers cover only. Building all five covers at once was rejected: four would front sections with nothing in them.

Importing the documents of stage 3 now, as written, with wording fixes only, was considered, since that is how the first set began. It was rejected for the first stage: the first set's content problems were found after the fact, and these are known before a line is imported. Once every document can be generated, the set gets the same pass the first set got: generate for several clients, read the PDFs, fix the templates.

### The documents of stage 1

| Type key                     | Document                                                                                      | From                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fire_cover_registers`       | The registers cover, listing the documents below                                              | The sample's cover, signed by the technician                                            |
| `fire_registers`             | Three registers in one document, each on its own page: exercises, controls, fire-work permits | The exercise record is annex 8 of OMAI 163/2007; the other two are the sample's layouts |
| `fire_work_permit`           | The blank fire-work permit                                                                    | Annex 4 of OMAI 163/2007                                                                |
| `fire_installation_register` | The blank register of an installation: its sheet and its table of events                      | Annex 7 of OMAI 163/2007                                                                |
| `fire_extinguisher_register` | The blank register of the monthly extinguisher control                                        | Annex 2 of OMAI 135/2023; not in the sample                                             |

The three registers are one document, as the four accident registers of the first set are. The sample's permit register copies the columns of the exercise record, down to "Cine a organizat lucrarea (exercițiul)"; ours identifies a permit by its number, its issuer and who did the work. The extinguisher register is the one document of the stage the provider did not hand over: its layout is the norm's, it is as blank as the others, and no employer with an extinguisher is exempt from it.

All five print the client and the provider at most. None prints a date that matters or a fact that changes, so they are generated once and reissued only when a template changes.

### What is left out

- The provider's control checklist is not a document of the set: it is the technician's own tool, and its value is in the answers.
- Filled registers. A register here is a blank page for the binder. Exercises, controls, permits and extinguisher checks as records in the app are features of their own.
- Documents that exist many times per client: a training sheet per employee, a filled permit per job, a register sheet per installation. A document is one type, once, for a client (ADR 005); lifting that is an ADR of its own.
- The evacuation plan, which is drawn, not merged.
- Removing the two checkboxes from the service contract, which is a change to [ADR 007](adr-007-leads-and-service-contracts.md).

## Consequences

- "The documentation set" stops being one thing. The glossary names the two sets, and everything that says "the set" in the ADRs before this one means the occupational safety set.
- A client's page gains a tab that, after stage 1, holds five blank documents. The stage is mostly plumbing; the documents that carry a client's facts come with stage 2.
- The contracts' type-key list, readiness codes and generation request grow a notion of set, and the app's sections become one list per set.
- Fire-safety documents need the technician's name on the organization, which until now only a service contract covering fire safety asked for.
- Since OUG 17/2026 a provider acting as technician under contract must be authorized by the inspectorate and must register each contract on its platform. The app records neither yet; the appointment decision of stage 3 is where it will matter.
- The norms change faster here than for the first set (Legea 307/2006 twice in 2026, the extinguisher norm in 2023), so every imported legal text needs its act and date checked at import.

## Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. The set in the database and the contracts: the group value, the set on a generation, the lead trigger, the fire-safety type keys.
3. Listing, readiness and generation per set in the API, with the technician among the facts.
4. The _Documente PSI_ tab with its sections and its generation dialog.
5. The signer per cover and per template in the import tool; the five templates and their manifest.
6. Registration on hosted after the merge.

## Open with the provider

Stage 3 waits for these; the first five also decide the data of stage 2.

1. Is the head of the workplace for fire safety the same person as the workplace manager of the first set?
2. The periodic interval per staff category (the pack says three months and, in a test key, one), the periodic duration (the IPSU says 60 minutes, OMAI 712/2005 two hours), and who trains at a client of at most nine employees, where art. 31(2) makes it the employer's task.
3. Smoking: forbidden on the whole site, or one outdoor place with a named supervisor?
4. Who approves the acts of authority in decision 1, and can one person hold every designation in it?
5. Clients under ten employees fall under the shorter list of OMAI 163/2007 art. 20: do they get that list or the full set?
6. The missing annex 1 of the IPSU (food service), and whether other activities have annexes.
7. Corrected first-aid text for decision 7 and the IPSU.
8. Which IPSU chapters apply to which kind of client, and which can go.
9. Decision 6: the current duties of Legea 307/2006 art. 27 in place of its annex, and its legal basis.
10. Decision 9: the control intervals, where its text and its table disagree.
11. The tests: the questions with no correct answer or a wrong key, and the workplace test the IPSU announces.
12. The provider's own models for the individual training sheet, the posted workplace sheet, the half-yearly evaluation report and the report of an exercise.
13. Whether OMAI 712/2005 art. 65, which asks the inspectorate's approval for training materials made for sale, touches generated themes and tests.
