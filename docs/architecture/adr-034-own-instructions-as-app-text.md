# ADR 034: Own instructions as text the app owns, written in a guided form and read from an imported pack

- Status: accepted
- Date: 2026-11-02

## Context

[ADR 012](adr-012-own-instructions.md) made an instruction module the organization's Word file. It is kept as uploaded apart from a font sweep, versioned by the file's hash, and edited in the document editor. At issuing it is merged, after an annex title page, into the PDF of the own instructions (3.2, IPSSM) or, since the amendment of 2026-10-11, of the fire-safety own instructions (2.1, IPSU).

That has three costs:

- **The house style.** An uploaded file prints as its author made it: other fonts, other margins, its own page numbers, sometimes thirty pages long.
- **The article count is a guess.** The themes' "Art. 1–N" counts N from the file's most used numbered list (`countArticles` in `packages/document-engine/src/modules.ts`).
- **The skeleton is the text.** "Scrie o instrucțiune" opens a Word skeleton whose hints are the text itself: the member overwrites them, and a module nobody has written yet already counts four articles.

The client import of [ADR 030](adr-030-import-from-documents.md) sets the own instructions aside (`setAsideKinds` in `packages/import/src/sorting.ts`). Yet the client-specific chapters of a pack's IPSSM (chapter XIII, sometimes XIV) and the annexes of its IPSU are exactly a provider's modules. A provider moving to the app has no other copy of them in the form the library wants.

The five reference archives, read again for this ADR, show where they are and how they are written:

- **The SSM instructions** are subchapters ("Subcapitolul XIII.VIII. Instrucțiuni … la utilizarea polizorului unghiular") or per-post blocks ("I.P.S.S.M. 2. … privind activitățile desfășurate de recepționeri de hotel") of one bound `3.2._IPSSM.docx`.
- **Article numbers.** They are Word's automatic numbering and run through the whole document: one instruction starts at "Art. 288". In two packs they also reset or repeat (one pack has Art. 358–481 twice).
- **The PSI instructions** are "Anexa nr. 1" and "Anexa nr. 2" of `2.2._IPSU.docx`. They sit in the Word file's endnotes.
- **Which post takes which instruction** is said only by the training themes, as ranges of the bound document ("IPSSM Art. 1 – 296 ; 331 – 353 ; IPSSM 2. Art. 1 – 16").
- **Most "client-specific" text is shared.** Cars, office work and metal ladders recur word for word in three or four packs. The client's name is written into the articles ("S.C. ROYAL HOTEL S.R.L." sixty times in one pack).
- **The import's reader misses both.** `docxToText` (`packages/import/src/docx.ts`) reads the body, headers and footers only. It drops automatic numbers and never opens the endnotes, so today it would find neither the articles nor the PSI instructions.

Mircea decided on 2026-10-29 and, narrowing it to the instructions, on 2026-11-02:

1. A module becomes text the app owns: a title, a category, a domain and a body of headings and numbered articles, printed in house style by the document engine. The Word upload goes, and the Word editor with it.
2. The library is renamed **Instrucțiuni proprii**, with the tabs **IPSSM** and **IPSU**.
3. A module is written in a **guided form** whose sections depend on its category. The PSI modules get categories of their own.
4. An annex prints as a separate **title page**, then its text. Every page has a header that names the annex and numbers its pages within it ("Anexa 2 · Pag. 1 din 3"). An annex stands alone and is reused, so it does not continue the IPSSM's page numbers.
5. The Word download of the own instructions includes the annexes, as the PDF does.
6. The library is filled from the pack inside the client import. A request of its own returns where each instruction starts and ends, and code cuts the text. Its cost counts in the same import's credits.
7. A per-post instruction that holds sections on equipment stays one module.
8. Text written by an earlier provider is imported like the rest.
9. Text only: no pictures and no tables for now (#768).
10. The existing test modules are deleted, not converted. There are no customers, and production holds test data only.
11. The clean-up comes first: the rename and the upload's removal land before the new form and the import.

The risk evaluations, which the earlier draft of this ADR also read from the pack into the risk library, are left to a decision of their own.

This supersedes, in ADR 012:

- the module as a Word file kept as it is, its versions by file hash, the upload and the font sweep, editing in the document editor and replacing the file;
- the "harmless guess" of the article count;
- the module's pages "numbered as its author left it", and the amendment of 2026-10-03 where it keeps the module untouched (and with it #300);
- the Word file of the document being the common part alone;
- the consequence that uploading the provider's files is the first step of onboarding.

What stays:

- a module belongs to the organization, with its title and domain;
- the library starts empty and ships no module;
- archiving is refused while a module is applied;
- the three decision states of a position per domain;
- the annex list of chapter XIII;
- one PDF at issuing;
- versions recorded in the snapshot, and documents **behind** when the library moves on.

It amends ADR 030's setting aside of the own instructions, and ADR 014's article ranges, which become exact.

## Decision

### The library is called "Instrucțiuni proprii"

The sidebar entry and the page title read **Instrucțiuni proprii**. Its tabs read **IPSSM** and **IPSU**, the abbreviations the documents print, in place of "Instrucțiuni SSM" and "Instrucțiuni PSI". The page's subtitle says what a module is for: an instruction for one activity, piece of equipment or category of protective equipment, applied to a client's posts and printed as an annex of its own instructions.

The position page's cards keep "Instrucțiuni specifice SSM" and "Instrucțiuni specifice PSI": on one post they are the instructions specific to that post. The import's set-aside reason, the empty states and the help topics follow the new name.

### A module is a body of articles, stored as data

An **instruction module** keeps its title, its **category** (_categoria_) and its **domain** (SSM or PSI). Its version now holds a **body** (_textul instrucțiunii_) instead of a file: an ordered list of blocks. Each block is one of two kinds:

- **heading** (_titlu de secțiune_): one line;
- **article** (_articol_): one or more paragraphs of plain text.

There is no bold, no list, no table and no picture. The house style is the engine's, never the author's.

Articles are numbered by their place, 1 to N across the module. Headings sit between them and are never counted. A paragraph after an article's first is printed under it. One that opens with "a)", "1.", "–" or "•" gets a hanging indent, with its marker kept as typed. That is all the structure the packs' instructions use.

The categories depend on the domain:

| Domain | Categories                                                                 |
| ------ | -------------------------------------------------------------------------- |
| SSM    | _Activități_, _Echipamente de muncă_, _Echipament de protecție_ (as today) |
| PSI    | _Spații și activități_, _Instalații și echipamente_, _Lucrări periculoase_ |

"Echipament de protecție" means nothing for fire safety. The PSI annexes in the packs are written per kind of space ("birouri", "spații de cazare și alimentație publică", "ateliere") and per dangerous work ("lucrul cu foc deschis"). The `module_group` enum gains the three PSI values (`premises_activity`, `installation_equipment`, `hazardous_work`), and a check keeps each category in its domain. The category sorts the annexes (category, then title), groups the picker on the position page and chooses the form's sections. The documents never print it.

**Storage.** The body is a `jsonb` column on `instruction_module_versions`. A schema in `packages/contracts` holds it, the API applies it on every write, and the database checks its shape. Beside it are two columns:

- `text_hash`: the SHA-256 of the body folded as the import folds text (`foldText`: no diacritics, no case, no punctuation, one space), by which the import finds an identical instruction in the library;
- `article_count`: computed by the database from the body.

The file columns (`docx_path`, `sha256`, `size_bytes`), the `instruction-modules` bucket and its policies go. A row per article was rejected: a version is written once and read whole, by the renderer, the form and the comparison. One row keeps it one write, one hash and one snapshot reference.

**Versions** keep ADR 012's rule: nothing changes in place, and saving stores the next number. The API stores the body with each run of whitespace made one space, and a save whose body is then the current version's stores nothing, so a save that only moved whitespace does not mark every client's 3.2 behind; the database refuses a body identical to the current one. The comparison is on the body, not on `text_hash`: the folded hash would discard a save that only puts back diacritics or turns a symbol ("> 50 V" to "< 50 V"), which a reader of the annex sees. `text_hash` stays what the import matches identical instructions by. The snapshot keeps recording version ids, so `documents_behind`, the badge and the regeneration path of [ADR 017](adr-017-legislation-monitoring.md) do not change.

`article_count` is now exact: the number of article blocks. The "Art. 1–N" of the themes of [ADR 014](adr-014-training-themes.md) and of the fire-safety themes is therefore a true range, and their code is unchanged. A version holds at least one article.

### Written in a guided form

The module page replaces the document editor with a **form** (_formularul instrucțiunii_). It shows the blocks in order:

- an article is a text box labelled "Art. N" that grows with its text;
- a heading is a one-line field;
- each block has add, move up, move down and delete;
- **Previzualizare** renders the annex as it will print and shows it in the Word viewer, in view mode, as the import's source dialog does.

**"Scrie o instrucțiune"** asks for the title, category and domain. It opens the form already divided into the sections of that category, the **guided template** (_structura propusă_). Each section shows a hint in grey placeholder text. A hint is never saved, never printed and never counted, and a section left empty is not printed. Each section can also show one example article, written by us for illustration, which goes into the module only when the member clicks **Arată un exemplu**. The examples are help text, not a seed: the library still starts empty.

The sections keep the minimum content of the Inspecția Muncii brochure that ADR 012's skeleton followed. They split its "work safely" part by what the module is about:

| Category                  | Sections                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activități                | Domeniul de aplicare · Calificarea necesară · Înainte de începerea lucrului · În timpul lucrului · La terminarea lucrului · Echipament de protecție necesar · Acțiuni interzise · Situații de urgență                                      |
| Echipamente de muncă      | Domeniul de aplicare · Cine îl poate folosi · Verificări înainte de pornire · În timpul utilizării · Oprire, curățare și întreținere · Ce faci la o defecțiune · Echipament de protecție necesar · Acțiuni interzise · Situații de urgență |
| Echipament de protecție   | Domeniul de aplicare · Când se poartă · Verificarea înainte de folosire · Purtare și reglare · Păstrare, întreținere și înlocuire · Acțiuni interzise                                                                                      |
| Spații și activități      | Domeniul de aplicare · Surse de aprindere și materiale combustibile · Reguli în timpul lucrului · La terminarea programului · Dacă izbucnește un incendiu · Mijloacele de stingere și evacuarea                                            |
| Instalații și echipamente | Domeniul de aplicare · Cine le poate exploata · Reguli de exploatare · Verificări și întreținere · Acțiuni interzise · Dacă izbucnește un incendiu                                                                                         |
| Lucrări periculoase       | Domeniul de aplicare · Înainte de începerea lucrării · În timpul lucrării · După terminarea lucrării · Acțiuni interzise · Dacă izbucnește un incendiu                                                                                     |

The headings are a structure the app proposes. No act prescribes them, and a member may rename, move or delete any of them. The hints and example articles are written in the pull request that builds the form, and listed there for Mircea to check.

"Acte normative avute în vedere", the last heading of ADR 012's skeleton, is no longer typed. The annex template prints it after the last article:

- for SSM: Legea nr. 319/2006 and H.G. nr. 1425/2006;
- for PSI: Legea nr. 307/2006 and the general norms approved by O.M.A.I. nr. 163/2007.

Three more ways help the member write:

- **Lipește text.** Pasting several paragraphs into an article, or choosing "Lipește text" for a whole instruction copied from Word or a PDF, runs the splitter (below). It shows the articles it made before adding them. Now that the upload is gone, this is how a provider brings a module it holds as a file.
- **Pornește de la o instrucțiune existentă.** The new module starts as a copy of a library module's body, to adapt.
- **A client's name in the text.** Where the body contains the legal name of one of the organization's clients, the form marks it and says "Textul numește clientul X. Instrucțiunea se aplică și altor clienți.". It does not block the save.

Editing in the document editor was weighed and rejected. A draft there is bytes in and bytes out, so every save would be parsed back into articles by guessing which paragraphs Word numbers, the very guess this ADR removes. Its toolbar offers bold, tables and pictures the renderer would drop. And the member would see Word lists, not the articles the themes cite.

### The splitter

The **splitter** is a pure function in `packages/contracts`, shared by the form's paste and the import. It turns text into a body:

- The leading label lines go ("ANEXA 3", "I.P.S.S.M. 2.", "Subcapitolul XIII.VIII.", the title).
- A paragraph numbered at the top level starts an article, without its number. So does one that opens with a typed "Art. 12", "Articolul 12", "12." or "12)".
- Deeper levels and plain paragraphs after it continue the article.
- A short line without a closing period, before the first article or between articles, becomes a heading.
- A table row becomes a paragraph of its cells joined by " – ", and is flagged.
- A text with no numbering at all makes one article per paragraph, flagged "Numerotarea nu s-a putut citi".

Articles are renumbered from 1: the pack's "Art. 288" becomes "Art. 1". The splitter keeps the words; it only decides where articles begin.

### Printed by the engine: a title page, then the text, under the annex's own header

Each annex is rendered from its version's body by an **annex template**, built into the document engine as the title page is today. It is never stored: the version's body and the engine make it again, and the issued PDF freezes it. The layout is the one Mircea chose on the design canvas of 2026-11-02 (https://claude.ai/artifact/8qjDxqDwSYn9y5czrUm7gn, row "Final"):

- **Title page.** "ANEXA N", "la Instrucțiunile proprii în domeniul securității și sănătății în muncă" (PSI: "… în domeniul situațiilor de urgență"), "I.P.S.S.M. Title" (PSI: "I.P.S.U. Title") and "versiunea din" the version's date, as today's annex title page.
- **The text** starts on the next page:
  - headings in bold;
  - "Art. N." in bold before an article's first paragraph;
  - the indented paragraphs hanging from their marker;
  - Arial 10 justified, the margins of every template, and the "Acte normative" line at the end.
- **The header of every page** is the document-details box of the house style:
  - row 1: the date, "Întocmit de" (the provider for SSM, the fire-safety technician for PSI), "Întocmit pentru" and "Cod document" (IPSSM or IPSU);
  - row 2 names the annex: "Anexa N la Instrucțiunile proprii în domeniul securității și sănătății în muncă:", then the bold "I.P.S.S.M. Title" and "versiunea din …";
  - its page box reads "Anexa N" over "Pag. X din Y", counted within the annex, the title page being page 1.
- **The branding line** closes every page, as on every template.

ADR 012 rejected a page box saying "Pag. 1 din 1" on a title page alone. An annex now has its own pages to count, so it numbers them.

**Issuing.** Each annexed version is rendered from the snapshot into one file. The common part and the annexes are converted in one request and merged into one PDF, as now. Each annex counts its own pages because it is its own file.

**The Word download.** "Descarcă Word" and the Word zip of a set give one file: the common part, then each annex as a section of its own whose page numbers restart. "Pag. X din Y" counted per section needs the Word field for a section's page count (`SECTIONPAGES`). LibreOffice, the converter, prints the value saved in the file rather than counting, so every annex page of a merged file read "din 1" (checked when building the annex template). The Word file therefore prints "Pag. X" alone, in the annexes and in the common part, whose total would otherwise count the annexes too; the PDF keeps the full count, each annex being converted as its own file.

**The draft stays the common part.** The draft opened in the document editor stays the common part alone, and the annexes are added when the file is downloaded. Otherwise a client's edit would change a module's text for one binder, and a client-specific wording of a module is a module of its own (ADR 012).

### The instructions read from the pack

**The reader.** For files sorted as own instructions, the reader gives each paragraph Word numbers its number as printed, from the numbering definitions and their restarts, or else from the converter's PDF of the file, which prints them. It also reads the endnotes and footnotes. The reader step (step 9 of the order of work) chooses between the two ways on the five packs. Either way the cut keeps the pack's article numbers, which the themes cite.

**Sorting** gains a domain for `own_instructions` and `training_themes` files, `ssm` or `psi`, which the first 3,000 characters give away ("… securității și sănătății în muncă", "… situațiilor de urgență"). The own instructions stay out of the client reading. Their set-aside reason becomes "Instrucțiuni proprii: le citim pentru biblioteca ta de instrucțiuni proprii".

**The instructions request.** For each domain with own instructions, one request to GPT-6.1 Terra receives that domain's own-instructions files and its training themes. The answer follows a strict schema, with no nullables and numbers as strings like every import answer, and holds:

- `instructions`: one entry per client-specific instruction. That is a subchapter of chapter XIII or XIV, an "I.P.S.S.M. n" block, an annex of the IPSU, or a file when a pack keeps one instruction per file. Each entry gives the file, the number as printed ("2", "XIII.VIII", or ""), the title as written, the category, and `startWords` and `endWords`: its first and last fifteen to twenty-five words, verbatim (ten words were not unique inside some instructions of the reference packs). The common chapters I–XII, which the app's template replaces, are not listed.
- `positions`: one entry per post the themes name, with the post as written, its citation as written ("IPSSM Art. 1 – 296 ; 331 – 353 ; IPSSM 2. Art. 1 – 16"), and the file and quote.

**The model never retypes the text.** Retyping an IPSSM would be about 146,000 output tokens, some $0.73, more than the rest of the import together, and a retyped legal text can drift where a cut one cannot.

**Code cuts.** For each instruction in order:

- The end is the first match of `endWords` after the previous instruction's end.
- The start is the last match of `startWords` before that end, which skips the title's earlier appearance in the table of contents.
- Matching is `findQuote`'s, over folded text.
- An instruction whose end is not found ends where the next one starts, and is flagged.
- One whose start is not found is listed as "Nu am putut găsi textul în document" and cannot be created.

The splitter then makes each cut a body. An instruction that holds sections on several pieces of equipment, such as Royal Hotel's "Bucătari" with its coffee machine and slicer, stays one module, its sections as headings.

**Which posts take which instruction.** Code resolves each post's citations, never the model. A post is resolved on the union of all its citations, since the periodic chapters split one instruction across months. Each citation is read in its own numbering: a bare "Art." range in the main document's numbering; "IPSSM n." (also written "IPSSM 04." or "I.P.S.S.M. 2") in block n's own articles; "Anexa n" in that IPSU annex's own articles. The introductory "MISSMIG Art. …" is not an IPSSM citation, and a post that cites only it takes nothing.

- **A number** ("IPSSM 2.") names that instruction.
- **An article range** names every instruction whose articles, as the pack numbers them, all lie inside it.
- **A range covering only the common part** names none.
- **An ambiguous citation** names nothing, and the post is left undecided with the themes' quote shown: a range that cuts an instruction in half, or a cited bound printed twice whose copies sit in different instructions. A number printed twice inside one instruction, as two packs do, is not ambiguous.
- **A cited annex the pack lacks** is dropped; the post is undecided only when nothing else it cites resolves.
- **A post that takes the whole document** ("IPSSM Art. 1 – 367"), as three of the five packs give every post, takes every instruction.

**When it runs.** The request runs after the client proposal is ready, so that its prompt can list the proposed posts by name. It is capped at 800,000 characters (about 229,000 tokens), below the 272,000 prompt tokens past which the model prices the whole request higher (`modelRates`, since #666); above the cap the domain fails with its size. The reference packs need 110,000–160,000 tokens for SSM and about 60,000 for PSI. Expected cost, at $1 a million input tokens and $5 output, with the answer capped at 16,000 tokens: $0.13–0.19 for SSM, $0.06–0.08 for PSI.

**Credits.** The reading counts in the import's credits (ADR 030, "Usage is counted in credits"): 25 for the SSM instructions and 10 for the PSI ones. That covers the dearest reading at a credit's cost, as the client reading's 25 does. It is charged when the request is sent, like a scanned page when it is found, and the import's total says it: _Importul a folosit 60 de credite (25 + 35 pentru instrucțiunile proprii)_. The upload dialog adds it to what the import may use.

### What counts as already in the library

The pack is first compared with itself: the same instruction twice in a pack becomes one entry, applied to every post that cites either. Then each instruction is one of three:

- **Identical** (_identică_): its folded text hash matches an active module of the domain. It is not shown as a decision; the library's module is applied.
- **Similar** (_asemănătoare_): word-trigram Jaccard of the folded bodies of 0.5 or more against an active module of the same domain. Between 0.25 and 0.5, the pair goes to GPT-6 Luna, in one request per import with the first 2,000 characters of each, for a yes or no on whether they say the same thing (under a cent). Embeddings were rejected: a vector store and a model call per module, for texts of one trade written in the same words.
- **New** (_nouă_): anything else, proposed ticked.

A similar instruction reads "Ai deja o instrucțiune care spune același lucru: Scări metalice", with **Ce diferă**: the articles added, removed and changed, the changed words marked. Its choice is **Folosește ce ai** or **Adaugă ca nouă**. The default is "Folosește ce ai", except when the pack's instruction has articles the library module lacks: then it is "Adaugă ca nouă", so that a post's own articles are not lost (a hotel receptionist's block was 0.95 similar to an office-work module and added the receptionist's duties). The proposed title drops the common lead ("Instrucțiuni proprii în domeniul securității și sănătății în muncă privind …"); the title as written is kept beside it. A new instruction whose title is taken by a different module is proposed with the client's name after it, "Recepționeri de hotel (Royal Hotel)", editable. Replacing the library's text with the pack's is not offered; the member edits the module afterwards.

### Where it sits in the import

The import gains **library proposals** (_propuneri pentru bibliotecă_), one per domain. Each is created when sorting finds own instructions of that domain, with its own status (_se citește_, _de verificat_, _nimic nou_, _nu s-a putut citi_, _confirmat_), proposal, member's changes and usage. A table `import_library_parts`, keyed by import and part (`instructions_ssm`, `instructions_psi`), holds them; the parts are named so another library can join later. After `checkImport` makes the client proposal ready, the same transition sends one `read-instructions` message per domain on the `ssm-usor-import` queue, with its dead-letter queue and the six-hour stall rule.

The review hub gains a group **Instrucțiuni proprii** after the client's sections, with one task per domain, _IPSSM_ and _IPSU_.

- **The tasks never block the client's confirm.** They are confirmed after it, each on its own, because they apply to posts that exist only once the client is confirmed, and the client confirm stays ADR 030's one transaction.
- **Before that,** they can be reviewed, and their button reads "Confirmă întâi clientul".
- **With a task still open,** confirming the client returns to the hub, and the client's page shows a notice linking back until the tasks are confirmed or expire.

A task lists only the new and the similar instructions. Above them, "7 instrucțiuni din pachet sunt deja în biblioteca ta" counts the identical ones. Each row has:

- the title and the category, editable;
- the article count;
- the posts it will apply to, with a picker for a post left undecided or one the themes name that matched none of the client's;
- **Sursa**, the cut highlighted in the file;
- **Schimbă**, the form on the proposed body, for a flag or for the client's name, which the review marks wherever it appears.

When nothing is new or similar, the task says "Nimic nou în pachet". Its button then applies the identical modules to the posts, or the task is done when there is nothing to apply.

**Confirming** runs `apply_instruction_import` in one transaction:

- it creates the new modules with their first version;
- it takes the identical and the chosen similar ones as they are;
- it inserts `job_position_instructions` for each mapped post, skipping a pair that exists.

The existing triggers set `needs_instructions` or `needs_fire_instructions`, and the client's 3.2 or IPSU is behind as usual. Everything carries the confirming member as `created_by`.

A part that fails gets its reading back (`library_part_refund`), since it fails before its request is sent or on our side. It shows its reason and **Citește din nou**, which sends its message again and is charged again; the client proposal and the other part are untouched. Abandoning the import abandons its parts. A part not confirmed 14 days after the client expires, and its proposal goes with the import's 30-day clean-up, as ADR 030 keeps proposals. Every request records its tokens and cost on the import's totals and on its part, and the gateway metadata names the part.

## What is left out

- **The risk evaluations of the pack** and the risk library. They will get a decision of their own.
- **Pictures and tables in a module**, and any formatting in a body. Tracked in #768.
- **Checking the imported text and proposing fixes**: diacritics, typos, clear wording, text copied from a manual, the client's name. The import keeps the pack's words as they are. Tracked in #770.
- **Uploading a Word file as a module.**
- **Splitting an instruction's equipment sections into modules of their own.**
- **Remembering the themes' map of posts to instructions** when the pack's instructions cannot be read, to apply once the modules exist.
- **An instructions request above 800,000 characters.**
- **Migrating the existing Word modules into bodies.** None exists in production; the migration deletes the test rows.
- **Replacing a library module's text with the pack's.** Choosing "Adaugă ca nouă" and archiving the old one does it by hand.
- **Comparing against archived modules.**
- **The common chapters I–XII of a pack**, which the app's template replaces.

## Consequences

- **The binder reads as one document.** The annexes are in the house style, each with its own title page and page count. A provider's own layout of a module is gone, by decision.
- **Exact citations.** The training themes cite exact article ranges, and the questions on modules of #531 can cite an article.
- **The engine renders data.** For the first time, the document engine renders content held as data beside the merged templates. The annex template ships with a deploy, like the title page, and an engine change reaches only what is issued after it.
- **The Word download grows by its annexes.** It is no longer the file the editor holds; the editor's draft stays the common part.
- **The import costs more.** A pack with both domains costs about $0.20–0.27 and 35 credits more.
- **The schema changes.** It loses the module files and their bucket, and gains the body, `text_hash`, the PSI categories, `import_library_parts` and `apply_instruction_import`.
- **The routes change.** The module routes lose upload, file link and file save, and gain the body's save, preview and download. `docs/data-model.md`, `docs/api.md`, `docs/app.md` and `docs/document-engine.md` change with them.
- **Code goes.** `sweepFonts`, `countArticles`, `firstLine`, `requireDocx` for modules, the skeleton `.docx` and its builder, and the module fixtures go. The dev seed and the flow tests use bodies in JSON.
- **The glossary changes.** It updates instruction module, instruction library and both own instructions, and gains body, article, guided template, library proposal, identical and similar.
- **Help articles.** "Instrucțiuni proprii" gets a help article in the help site's reserved `instructiuni` area, and the import's article gains the library task. Each comes with the pull request that completes it, with its `## Actualizări` block.

## Order of work

Each step is a pull request in one stack, on this ADR. The clean-up comes first.

1. This ADR, the glossary in `CONTEXT.md`, and notes in ADR 012, 014 and 030.
2. **The rename.** "Instrucțiuni proprii", the IPSSM and IPSU tabs, the subtitle, the empty states and the set-aside reason.
3. **The upload removed.** The "Încarcă fișiere" button and dialog, `POST /instruction-modules/upload` and the font sweep go; "Scrie o instrucțiune" and the Word editor still work.
4. **The body.** Its schema, folding and hash, the splitter and the guided template's sections in `packages/contracts`, tested on cuts from invented packs.
5. **The annex template** in the document engine: the title page, the body, the annex header with its own page count, and the "Acte normative" line, for both domains, replacing `annexTitlePage`. With the layout and converter tests, including the Word file's per-section page count.
6. **The database.** Body, `text_hash` and computed `article_count` on versions; the PSI categories and their check; the file columns and bucket dropped; the test modules deleted; pgTAP tests.
7. **The API.** Saving a body, preview and download; issuing, the Word download and the Word zip rendering the annexes; the file routes removed; the seed in JSON.
8. **The app.** The guided form with its hints, examples, paste, copy from an existing module, the client-name mark and the preview, in place of the Word editor; the PSI categories in the dialogs and the picker.
9. **The reader.** Word's numbers and the endnotes for own-instructions files, chosen on the five reference packs.
10. **`packages/import`.** Sorting's domain, the instructions request, the cuts, the posts' citations resolved, the comparison with the library.
11. **The database.** `import_library_parts`, `apply_instruction_import`, their clean-up and credits, pgTAP tests.
12. **The API.** The parts' messages and retries, their usage and credits, their proposal, changes and confirm routes.
13. **The app.** The hub's Instrucțiuni proprii group, the IPSSM and IPSU tasks, and the "already in your library" rows; the help articles.

## Defaults taken instead of asking

- **The body's shape.** Headings and articles of plain paragraphs, with "a)", "1.", "–" and "•" indented. At least one article; at most 400 articles and 200,000 characters a module.
- **The guided template's sections** per category, as listed. The hints and examples are written in step 8 for Mircea to check.
- **The PSI category keys**: `premises_activity`, `installation_equipment`, `hazardous_work`.
- **The "Acte normative" line** printed by the template, per domain, as listed.
- **The client-name mark** warns and never blocks.
- **The Word download's annexes** are added at download, not kept in the editor's draft. A Word file that cannot count pages per section prints "Pag. X" alone.
- **A save that changes no word makes no version.**
- **One instructions request per domain**, with that domain's themes in it, capped at 800,000 characters and 16,000 output tokens; sorting tells the domain.
- **Credits**: 25 for the SSM instructions and 10 for the PSI ones, charged when the request is sent.
- **Cutting by the end quote first** and the last start quote before it, an unfound end ending at the next instruction; an end quote found inside an instruction runs on to the next one, flagged.
- **An ambiguous citation leaves the post undecided** rather than guessing.
- **Thresholds**: Jaccard 0.5 for similar, 0.25–0.5 judged by GPT-6 Luna. To be tuned on the five reference packs in step 10.
- **"Folosește ce ai" is the default** for a similar instruction unless the pack adds articles, and a taken title gets the client's name.
- **The library tasks** are confirmed after the client, never block it, and expire 14 days after it.
- **Archived modules are not compared.**
- **The test modules on hosted are deleted** by the migration, with their positions' links. A draft that annexed one is regenerated before it is issued, and issued PDFs keep their annexes.
