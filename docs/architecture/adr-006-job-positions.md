# ADR 006: Job Positions

- Status: accepted
- Date: 2026-09-20

## Context

An employee's job title is free text today, typed once per person. Nothing records which posts a client has. "Instalator", "instalator" and "Instalator sanitar" on three employees are three strings, and a post nobody holds yet cannot be described at all.

Almost everything ahead is organized by post, not by person: the risk assessment evaluates each post, the protective equipment list says what a post receives, the training themes map each post to the instructions that concern it, the individual training record prints the person's post, and the two intervals of periodic training apply to kinds of post. [ADR 005](adr-005-document-generation.md) left these documents to later stages because their content follows the client's posts.

The provider's two sample packs were read for how they name posts. They use "funcția" and "post de lucru" interchangeably and spell the same post differently from one document to the next. "Loc de muncă" means, depending on the document, the company, a kind of zone ("Gelaterie", "Birou", "Atelier, teren"), or the post itself, and never an address. One pack lists the same title twice with different activities and assesses the two separately; the other names one person "Administrator" in the decisions and by the post they actually fill everywhere else. The risk assessment has a column called "denumire funcție contract de muncă" beside the activities actually carried out. Neither pack has COR codes. The gelato bar's equipment list is the construction company's file, unchanged: the fault of a list that hangs off nothing.

## Decision

### A position belongs to the client

A **job position** (_post de lucru_) is a post as occupational safety sees it: a kind of work with its own risks, equipment and training. It belongs to the client and exists whether or not anyone holds it. An employee is assigned to a position.

Positions belong to the client, not to a workplace. The documents are per client, the packs never tie a post to an address, and a post that differs from one site to another is two positions.

An employee holds one position. A person who does mixed work fills one position that says so ("Administrator – vânzător"), which is also how their risks are assessed and how the packs model it. The interface and the documents know one. (Amended while building: the assignment is a required column on the employee, not the link table first written here. A column keeps "every employee has a position" a rule of the database and the insert a single statement; a link table cannot do either through the API's one-request-per-statement access. Allowing several positions later is one migration from either shape.)

### The contract title stays on the employee

The title in the employment contract (_funcția din contract_) and the position are different facts that usually coincide. Two people with the contract title "inginer" can fill an office position and a site position; "vânzător" and "lucrător comercial" can fill the same one.

The employee keeps the contract title as a field of its own, which is what the existing `job_title` column becomes. Choosing a position fills it with the position's name until the person types something else, and a saved title that only repeats the old position's name counts as not typed, so it moves with the person to a new position; renaming a position never rewrites it, because the contract has not changed. Documents about a person print the contract title. Documents about the work print the position.

Two lists with a mapping between them were rejected: most small firms would fill it in one-to-one, and the user would meet a distinction on every form that they need once in twenty.

### What a position records

- A **name**, unique within the client ignoring case and surrounding spaces. Two positions that share a title are named apart ("Manager magazin – birou", "Manager magazin – bar"), as the risk sheets already do.
- A **staff category**, required: _tehnic-administrativ și conducători de locuri de muncă_, or _personal de execuție_. These are the two categories the training decision gives an interval each; the category is what lets the app say when a person's periodic training is due. It defaults to _personal de execuție_, the shorter interval, so a mistake errs towards training too often.
- An optional **training interval** of its own, in months. The first testing round with a provider showed that two posts of one category can differ: a welder trained every 2 months and a sales agent every 3, both execution staff. The client's two intervals stay the defaults and a post only records the exception; empty means "as the rest of its category". The ceilings of H.G. 1425/2006 art. 96 apply to it as they do to the client's intervals: 6 months for execution staff, 12 for the rest. An interval per employee was rejected: training belongs to the work, not to the person. The training decision keeps printing the two category intervals until the provider gives the wording for exceptions, so the interval of a post is, for now, read only inside the app.
- An optional **work zone** (_zona de lucru_): the short free text the instructions, the risk sheets and the equipment list print beside the post. It is not one of the client's workplaces, which are addresses.
- An optional description of the **activities carried out** (_activități desfășurate_), which the risk assessment and the equipment list print and which tells apart two positions close in name.

No COR occupation code: no document prints one. No departments: no document in the pack prints one either, and positions alone unblock what follows.

### Lifecycle

A position is archived, not deleted, once anyone has been assigned to it: issued documents and training history will refer to it. Archiving is refused while active employees hold it; employees who have left do not count. A position nobody was ever assigned to can be deleted. Archived positions leave the pickers and newly generated documents.

A position is required on an employee. The picker on the employee form can create one in place, so a new hire into a new post is still one form.

### Existing data

The migration creates one position per distinct title per client, merging titles that differ only in case or spacing, and assigns every employee. The title text stays where it is, with its new meaning. The development seed does the same. Near-duplicates that survive ("Instalator", "Instalator sanitar") are reassigned by hand.

### In the app

"Posturi de lucru" is a section of the client page beside "Angajați". Owners and specialists both edit it, as they do employees. The employee list shows the position; the employee's page also shows the contract title.

A responsible person who is an employee keeps being entered with the contract title, copied when they are chosen and editable, because a decision is a legal act that names a person. The copy never follows the employee by itself: when the contract title later differs, the list says so and offers to adopt it. People who are not employees stay free text.

### Generated documents do not change

The documents of ADR 005 read the client, the organization, the responsible persons and the specialist, never the employees. Positions cannot reach them: issued files are locked, drafts are files, and the "Date modificate" badge compares data that holds no positions. Listing the positions of each category in the training decision is a possible follow-up, on its own, because it changes the wording of a legal act.

### Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. The table, the assignment, the migration of existing titles, and the API.
3. The "Posturi de lucru" section of the client page.
4. The employee form: the position picker and the contract title.

## Consequences

- Stage 2 and stage 3 of ADR 005, the individual training record, and the dates of periodic training get the list they are organized by.
- The employee form gains one field. It fills itself, and the person entering a new hire chooses from a list instead of typing a title again.
- The interface uses "post de lucru" for the position and "funcția din contract" for the title, one word for one thing, which the source documents do not manage.
- "Vizitatori" and "grupuri sensibile" are assessed like positions in the risk assessment, and nobody is employed in them. They are not positions here. The stage 3 design decides what they are.
- Several positions per employee, COR codes, departments, and a workplace on the employee are left out on purpose. Each can be added without undoing this.
