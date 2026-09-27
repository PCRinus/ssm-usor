# ADR 011: The protective equipment list, and documents that read job positions

- Status: accepted
- Date: 2026-09-24

## Context

[ADR 005](adr-005-document-generation.md) left three documents to a second stage because their content follows the client's posts: the own instructions (3.2), the training themes (4.2) and the internal list of protective equipment (6). Until now all three, like the risk assessment and the prevention plan of stage 3, come to exist only by uploading a `.docx` written elsewhere. [ADR 006](adr-006-job-positions.md) gave the app the list they are organized by, the job positions, and said the generated documents would not read it yet.

The equipment list goes first: it needs one new fact and nothing from the other two, and it is the document the product exists to fix. In the provider's two sample packs the list was the same file, down to the other client's name and posts. Their list prints, after a page of legal text and the three annexes of H.G. 1048/2006, a table of the client's posts with their activities and a department, and then, per work zone and group of posts, a table of rows: the risk, the item of equipment, its duration of use, and how it is allocated, "Inventar" on every row. It ends with a grid of risk categories against body parts, marked with crosses, identical in both packs.

Five other Romanian lists were read to see whether that shape is the provider's or the trade's. Every one is per post, never per person. All print a risk and a duration; most print a quantity, as "1/12" or "2/12" pieces per months; some add the body part protected and the protective quality of the item; only the provider's has an allocation mode. The shape comes from the framework order of 1995 (Ordinul 225/1995, abrogated after Law 319/2006 and still followed): its point 2.3 has the employer's commission set the kinds of equipment, their normed duration of use, and their allocation mode, "inventar personal, inventar secție etc.", and allows two pieces with the duration doubled for dirty or harmful work, which is where the quantity column comes from; its point 2.5 chooses between personal and section inventory on hygiene grounds. H.G. 1048/2006, the act in force, prescribes no list format; its three annexes are the ones the template already carries. A per-person handover sheet, with sizes and signatures, is a separate document everywhere.

## Decision

### The list hangs off the job position

Protective equipment is recorded per **job position**, as entries on the position, and the list is generated from them. An entry is what everyone in that post receives, so a new hire into an existing post needs nothing entered. Recording it per employee was rejected: the law and every list read organize it by post, and the per-person record, the handover sheet with sizes and signatures, is a later document about a person that will read the post's list.

### What an entry records

- The **risk** it protects against, as free text: "Înțepături, tăieturi (mâini, brațe)".
- The **item**, as free text: "Mănuși împotriva agresiunilor mecanice", "Bocanci S3".
- The **quantity** granted at once, a whole number, 1 unless said otherwise.
- The **duration of use** in months, required for equipment kept in inventory and left empty for consumables, where it means nothing.
- The **allocation mode**, one of three: **personal inventory** (_inventar personal_), issued to the worker and replaced when its duration runs out; **section inventory** (_inventar de secție_), kept at the workplace and shared, such as a welding mask or a harness; **consumable** (_consum_), used up and restocked, such as disposable gloves. Personal inventory unless said otherwise. The two inventory modes are the ones the framework order names; the third exists because the lists read print consumables as short durations or as "permanent", which is what a duration column cannot say. Three values now rather than a text column, because the app serves more providers than the one whose file was read, and a list from another provider should merge without a wording change.

No body part and no protective quality as fields of their own: the lists that split them print in three cells what the risk and the item say in one. No sizes: they belong to a person. The risk and the item offer what the organization typed before on any client, so a provider types "Cască de protecție" once, and a position can copy the entries of another position of the same client.

### Every position decides

A position is in one of three states about equipment: **undecided**, **needs none**, or **equipped**, the last meaning it has at least one entry. New positions are undecided. Generation requires every current position to have decided, and the generation form names the undecided ones with a link. Deriving "needs none" from the staff category was rejected: a site manager is technical-administrative staff and wears a helmet. An undecided position blocks the whole set, as any missing data does under ADR 005, and the set also requires at least one current position, which a client with employees always has.

### In the app

A job position gets a page of its own, as an employee has, reached from its name in the positions table: the position's facts, the employees in it, and a card "Echipament individual de protecție" with the entries and the needs-none choice. The positions table gains a column showing the state of each post, "3 articole", "nu necesită" or "nedecis", so the state is visible from the list and the generation form can link to it.

Editing the entries inside the position dialog was rejected as too small for a list; an expandable row under each position was rejected because the state would be hidden until opened; a card on "Date pentru documente" was rejected because equipment belongs to a post, and the facts stage 2 and 3 add next, the applicable instructions and the risk sheet, belong to the same post and would pile up on that tab. Owners and specialists both edit, as they do positions.

### What the document prints

The template is the provider's, with the usual fixes, and these departures:

- The table of posts prints the staff category where the original has a department, which the app does not record by decision.
- One section per current position, in the order of the positions table, instead of the original's grouping of posts that share a set. The section heads "LOC DE MUNCĂ: zone / MESERIA: post" print the zone only when the position has one.
- Each row prints the quantity with the duration, "2 buc. / 12 luni", or "consum" where there is no duration, and the allocation mode in words.
- The grid of risks against body parts is dropped. It was copy-pasted unchanged between two clients in different trades, and it only restates the rows above; keeping it would force a risk category and a body part on every entry.
- Archived positions stay out of newly generated lists, as ADR 006 already says, and keep their entries.

### Generated documents now read positions

ADR 006 said the documents of ADR 005 never read positions. From this document on they do: the data snapshot a revision is generated from includes the current positions and their equipment, so an entry changed after generation shows the "Date modificate" badge like any other fact. ADR 006 is amended in place.

### The other two documents of stage 2

The own instructions and the training themes are the next steps. Both read one more fact recorded on the position: which of the built-in **activity instruction modules** apply to it, chosen from a library that starts with the four the sample packs contain: food service, offices, cleaning, and construction and assembly. Chapter XIII of the own instructions then prints the chosen modules, and the training themes print, per position, the article ranges of the general chapters and of its modules across the training sessions the client's schedule already fixes. The training themes therefore follow the own instructions, whose article numbering they cite. How the module library is kept, and the module chapters' typed page numbers and signage images, are decided when the own instructions are built, not here. (Amended by [ADR 012](adr-012-own-instructions.md): the modules are the organization's own Word files, uploaded or written into a library that starts empty, with no built-in ones; the own instructions annex them rather than printing them, and the training themes cite the module versions of the client's generated own instructions rather than the library.)

## Consequences

- The job position becomes the place where per-post facts accumulate: equipment now, applicable instructions next, the risk sheet in stage 3, the training due dates.
- A client's readiness for generation depends on every one of its positions, so a client with many posts has more to fill in before the first generation, and the form has to say exactly which.
- The document data snapshot grows by the positions and their entries, and the "Date modificate" badge fires on equipment edits for every document of the set, not only the list, until staleness is computed per document.
- Three allocation modes and a quantity cover the lists read; a provider that prints the body part or the protective quality as columns of their own puts them in the risk and the item text.
- The equipment list leaves the uploaded document types and joins the generated set; a list uploaded before this change stays as it is until regenerated.

## Order of work

1. This ADR, the glossary in `CONTEXT.md`, and the amendment to ADR 006.
2. The entries table, the position's decision, the migration, and the API.
3. The position page, the equipment card, and the state column in the positions table.
4. The template, the merge context with positions and equipment, the readiness checks, the snapshot, and the document's move from uploaded to generated.
