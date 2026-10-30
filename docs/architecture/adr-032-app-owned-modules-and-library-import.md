# ADR 032: Instruction modules as text the app owns, and both libraries filled from an imported pack

- Status: proposed
- Date: 2026-10-29

## Context

[ADR 012](adr-012-own-instructions.md) made an instruction module the organization's Word file, kept as uploaded apart from a font sweep, versioned by the file's hash, edited in the document editor, and merged into the issued PDF of the own instructions (3.2) and, since its amendment of 2026-10-11, of the fire-safety own instructions (IPSU) after an annex title page. It rejected a structured editor of our own because "the file stays Word, and the merge stays", and it called the themes' "Art. 1–N" a harmless guess, since N is counted from the file's most used numbered list (`countArticles` in `packages/document-engine/src/modules.ts`).

The client import of [ADR 030](adr-030-import-from-documents.md) sets the own instructions aside (`setAsideKinds` in `packages/import/src/sorting.ts`): in the five reference packs the IPSSM runs to 357,000–511,000 characters and the IPSU to about 189,000, enough to pass the client reading's cap of 600,000 on their own, and the app builds the common part itself. But chapter XIII of a pack's IPSSM, and the annexes of its IPSU, are exactly the provider's modules, and a provider moving to the app has no other copy of them in the form the library wants. The same holds for risks: the pack's risk assessment (document 9, 98,000–186,000 characters, one sheet per post with about 25 factor rows each, plus a sheet for the sensitive groups) and its prevention plan (document 10, measures per factor with deadline and person responsible) are read today only for posts and people, while the risk library of [ADR 015](adr-015-risk-assessment.md) starts empty and "the first is typed".

Mircea decided on 2026-10-29:

1. A module becomes text the app owns: a title, a group, a domain and a body of numbered articles, rendered in house style by the document engine. The Word upload goes. Members type modules in the app or bring them from an import.
2. The instruction library is filled from the pack inside the client import, by a request of its own that returns only where each annex starts and ends; code cuts the text. Modules the organization already has are hidden, similar ones are shown as such, new ones are proposed; confirming creates them and applies them to the imported posts as the pack's training themes say.
3. The pack's risk evaluations go into the risk library as evaluation profiles and are applied to the client's posts in the same confirm, from a second reading request over the risk files alone.
4. Both libraries share one rule for what counts as already there.

This supersedes, in ADR 012: the module as a Word file kept as it is, its versions by file hash, the upload and the font sweep, editing in the document editor and replacing the file, the paragraph on re-styling an uploaded file, the "harmless guess" of the article count, the module's pages "numbered as its author left it", the amendment of 2026-10-03 where it keeps the module untouched (and with it #300), and the consequences that a module prints as its author formatted it and that uploading the provider's files is the first step of onboarding. What stays: a module belongs to the organization, its title, group and domain, the library starting empty with no shipped text, archiving refused while applied, the three decision states of a position per domain, the common part as the Word file of the document, the annex list of chapter XIII, the annex title page, one merged PDF at issuing, versions recorded in the snapshot and documents **behind** when the library moves on. It amends ADR 030's setting aside of the own instructions, and ADR 015's "the first is typed".

There are no customers: production holds test data only, and no organization has a library worth keeping. Nothing migrates.

## Decision

### A module is a body of articles, stored as data

An **instruction module** keeps its title, group (_activitate de lucru_, _echipament de muncă_, _echipament individual de protecție_) and domain (SSM or PSI), and its version now holds a **body** (_textul instrucțiunii_) instead of a file: an ordered list of blocks, each a **heading** (_titlu de secțiune_), one line of text, or an **article** (_articol_), one or more paragraphs of plain text. No bold, no lists, no tables, no pictures: the house style is the engine's, never the author's. Articles are numbered by their place, 1 to N across the whole module, headings included between them and never counted; a paragraph after an article's first is printed under it, and one that opens with "a)", "–" or "•" with a hanging indent, which is all the structure the instructions in the packs use.

The body is a `jsonb` column on `instruction_module_versions`, held by a schema in `packages/contracts` that the API applies on every write, with a check of its shape in the database. Beside it, `text_hash`, the SHA-256 of the body folded as the import folds text (`foldText`: no diacritics, no case, no punctuation, one space), and `article_count`, computed by the database from the body. The file columns (`docx_path`, `sha256`, `size_bytes`), the `instruction-modules` bucket and its policies go. A row per article was rejected: a version is written once and read whole, by the renderer, the editor and the comparison, and one row keeps it one write, one hash and one snapshot reference.

Versions keep ADR 012's rule: nothing changes in place, saving stores the next number, and a save whose `text_hash` equals the current version's stores nothing, so a save that only moved whitespace does not mark every client's 3.2 behind. A title, group or domain change stays on the module, as today. The snapshot keeps recording version ids, so `documents_behind`, the "Date modificate" badge and the regeneration path of [ADR 017](adr-017-legislation-monitoring.md) do not change.

`article_count` is now exact, the number of article blocks, so the themes' "Art. 1–N" of [ADR 014](adr-014-training-themes.md) and the fire-safety themes are a true range and their code is unchanged. A version holds at least one article.

### Typed in a form of articles, previewed in the Word viewer

The module page replaces the document editor with an **articles editor** (_editorul de articole_): the blocks in order, each article a text box labelled "Art. N" that grows with its text, a heading a one-line field, and add, move up, move down and delete on each. Pasting several paragraphs, or "Lipește text" for a whole instruction copied from Word or a PDF, runs the import's splitter (below) and shows the articles it made before adding them, which is how a provider brings a module it holds as a file now that the upload is gone. "Previzualizare" renders the annex as it will print and shows it in the Word viewer in view mode, as the import's source dialog does. A new module starts from the brochure's headings that ADR 012's skeleton had, with no article under them yet; a heading left with nothing under it is dropped on save.

Editing in `@docx-editor.dev` was weighed and rejected. A draft there is bytes in and bytes out (`saveDraftFile`), so every save of a module would be parsed back into articles by guessing which paragraphs Word numbers, the very guess this ADR removes; its toolbar offers bold, tables and pictures the renderer would silently drop; and a member would see Word lists, not the articles the themes cite. The form makes the article the unit the member edits, the import produces and the themes count. The viewer is kept where it is good: showing the result.

### Rendered by the engine as one annex file

The annex title page of ADR 012's amendment becomes the first page of an **annex template**, built into the document engine as the title page is today: after a page break, a loop over the blocks prints the headings and the articles, "Art. N." in bold before the first paragraph, in the common part's article style and Arial. Its page box reads "Anexa N, pag. X din Y", counted within the annex: the title page alone could not say "Pag. 1 din 1", an annex of several pages can number itself.

The Word file of the own instructions stays the common part. Rendering the annexes into it was rejected: a client's edit in the editor would then change a module's text for one binder, which ADR 012's discipline forbids ("a client-specific wording of a module is a module of its own"), and the common part, already some seventy pages, would double for the editor. Issuing renders each annexed version from the snapshot into one file, title page and body, and converts the common part and the annexes in one request, as now with half the files; the Word zip of a set renders the same files. The rendered annex is not stored: the version's body and the engine make it again, and the issued PDF freezes it.

### The instructions read from the pack

Sorting gains a **domain** for `own_instructions` and `training_themes` files, `ssm` or `psi`, which the first 3,000 characters give away ("…securității și sănătății în muncă", "…situațiilor de urgență"). The own instructions stay out of the client reading, and their set-aside reason becomes "Instrucțiuni proprii: le citim pentru biblioteca ta de instrucțiuni".

For each domain with own instructions, one **instructions request** to GPT-6.1 Terra receives that domain's own-instructions files and its training themes, the text rendered with a mark on each paragraph that Word numbers and its level, since `docxToText` drops list numbers and the articles are those numbers. A PDF's typed numbers stay in its text. The answer, a strict schema with no nullables and numbers as strings like every import answer, is a table of contents and a map:

- `annexes`: per block of chapter XIII, or per annex of the IPSU, or per file when a pack keeps one instruction per file: the file, the number as printed ("3", or ""), the title as written, the group, the domain, and `startWords` and `endWords`, the block's first and last eight to fifteen words verbatim.
- `positions`: per post the themes name ("FUNCȚIA: Bucătar: IPSSM 1, 2, 5"), the post as written, the annexes it cites as written (numbers or titles), and the file and quote.

The model never retypes the text. Its output is capped, retyping an IPSSM would be about 146,000 output tokens, some $0.73, more than the rest of the import together, and a retyped legal text can drift where a cut one cannot. Code cuts: for each annex in order, the end is the first match of `endWords` after the previous annex's end and the start the last match of `startWords` before it, which skips the title's earlier appearance in the table of contents; matching is `findQuote`'s, over folded text, ignoring the paragraph marks. An annex whose end is not found ends where the next one starts, flagged; one whose start is not found is listed as "Nu am putut găsi textul în document" and cannot be created.

The **splitter**, a pure function in `packages/contracts` shared by the import and the articles editor, turns a cut into a body: the leading label lines ("ANEXA 3", "I.P.S.S.M.", the title) go; a paragraph numbered at the top level, or one opening with a typed "Art. 12", "Articolul 12", "12." or "12)", starts an article without its number; deeper levels and plain paragraphs after it continue the article; a short line before the first article or between articles, without a closing period, is a heading; a table row becomes a paragraph of its cells joined by " – ", flagged. A cut with no numbering at all makes one article per paragraph, flagged "Numerotarea nu s-a putut citi". The splitter keeps the words; it only decides where articles begin.

The request runs after the client proposal is ready, so that its prompt can list the proposed posts by name for the themes' map. It is capped at 800,000 characters (about 229,000 tokens), which keeps it under the 272,000 prompt tokens past which OpenAI prices the whole request at twice the input rate, for Terra as for Luna; the reference packs need 110,000–160,000 tokens for SSM and about 60,000 for PSI. Above the cap the domain fails with its size. Expected cost: $0.13–0.19 for SSM, $0.06–0.08 for PSI, at $1 a million input tokens and $5 output, with the answer capped at 16,000 tokens.

### The risk evaluations read from the pack

A **risk request**, the second request over the pack, receives only the files sorted as `risk_assessment` (documents 9 and 10), after the client proposal is ready and with its posts listed, and returns, under a strict schema of its own:

- `evaluations`: per sheet, the file, the sheet's heading as written, the posts it evaluates as written (several when the heading names several: "DIRECTOR GENERAL, DIRECTOR COMERCIAL, CONTABIL"), its kind (`job_position`, `sensitive_groups`, or `other` for a sheet such as visitors), and the means of production, the work environment and the exposure as written;
- per sheet, `factors`: the component (one of the four), the group, the description, the gravity class (1–7) and the probability class (1–6) as the pack gives them, the level the pack prints, a verbatim quote of the row, its measures with their kind, and the plan's actions, deadline, person responsible and observations, joined from document 10 by the factor they answer.

Checks by code, as in ADR 030: the quote is found in its file, and the row it sits in holds the two classes, or the factor is flagged "Verifică clasele"; a class outside the grid makes the factor unticked. The **risk level** is computed from the classes by ADR 015's grid and never stored; where the pack's printed level disagrees with the grid, the row shows both ("în document: 2"), since packs get it wrong. Only the classes are the pack's evaluator's judgement, quoted; the app still proposes no class of its own.

The answer is the large one: about 30,000–60,000 output tokens for the reference packs, $0.15–0.30, plus $0.04–0.07 of input, $0.20–0.40 a client in all. Each request's output is capped at 64,000 tokens, reasoning included. A client with more than eight posts is read in requests of eight posts each, named at the end of the prompt, after the same files, prompt and schema, so every request after the first reads its input from the cache at $0.05 a million; the last request also returns the sensitive groups and every sheet about no listed post. An answer cut at the cap is asked again as two halves, once; the text is capped at 400,000 characters.

Running the risks in the client reading was rejected: a second schema in that request changes its cache key and its answer, and a failure would take the client with it. The order, client first, lets the client proposal land and be reviewed while the library requests run, and lets each fail on its own.

### What counts as already in the library

One rule for modules and profiles, applied after the pack is first compared with itself (the same module twice in a pack, two sheets with the same factors, become one entry applied to every post that cites either):

- **Identical** (_identic_): the folded text hash matches an active module of the domain, or the profile's fingerprint matches a profile: the hash of its factors' component, group, description, classes and measures, sorted. Plan fields are left out of the fingerprint, since they name the client's people and dates. Identical entries are not shown as decisions; they are applied as the library's own.
- **Similar** (_asemănător_): for a module, word-trigram Jaccard of the folded bodies of 0.5 or more against a module of the same domain; between 0.25 and 0.5, the pair goes to GPT-6 Luna in one request per import, with the first 2,000 characters of each, for a yes or no on whether they say the same thing (under a cent). For a profile, 70 % or more of its factors match a profile's factors, a factor matching on component and a description trigram similarity of 0.8 or more. Embeddings were rejected: a vector store and a model call per module, for texts of one trade written in the same words.
- **New** (_nou_): anything else, proposed ticked.

A similar entry reads "Ai deja o instrucțiune care spune același lucru: Lucrul la înălțime" or "Ai deja un profil de evaluare asemănător: Bucătar", with **Ce diferă**: for a module, the articles added, removed and changed, the changed words marked; for a profile, the factors only in the pack, only in the library, and those with other classes or measures. Its choice is **Folosește ce ai** (the default) or **Adaugă ca nou**. Replacing the library's text with the pack's is not offered; the member edits the module afterwards. A new entry whose title or name is taken by a different one is proposed with the client's name after it, "Bucătar (Gelateria Sole)", editable.

### Where it sits in the import

The import gains **library proposals** (_propuneri pentru bibliotecă_), one per part: SSM instructions, PSI instructions, risk evaluations, each created when sorting finds its files, with its own status (_se citește_, _de verificat_, _nimic nou_, _nu s-a putut citi_, _confirmat_), proposal, member's changes, version and usage. A table `import_library_parts`, keyed by import and part, holds them; the client proposal stays on `imports`. After `checkImport` makes the client proposal ready, the same transition sends `read-instructions` per domain and `read-risks` (one message per chunk), on the `ssm-usor-import` queue with its dead-letter queue and the six-hour stall rule.

The review hub gains a group **Biblioteca ta** after the client's sections, with three tasks in the library's own tabs: _Instrucțiuni SSM_, _Instrucțiuni PSI_, _Evaluări de risc_. They never block the client's confirm. They are confirmed after it, each on its own, because they apply to posts that exist only once the client is confirmed, and because the client confirm stays ADR 030's one transaction. Before that, they can be reviewed, and their button reads "Confirmă întâi clientul". With a library task still open, confirming the client returns to the hub; the client's page shows a notice linking back until the tasks are confirmed or expire.

- **An instructions task** lists only the new and the similar modules; above them, "7 instrucțiuni din pachet sunt deja în biblioteca ta" for the identical ones. A row: the title, the group and the domain, editable; the article count; the posts it will apply to, with a picker for a post the themes name that matched none of the client's; **Sursa**, the cut highlighted in the file; and **Schimbă**, the articles editor on the proposed body, for a flag or for the client's name, which the review marks wherever it appears in a module's text. When nothing is new or similar it says "Nimic nou în pachet", and its button applies the identical modules to the posts, or the task is done when there is nothing to apply.
- **A risk task** lists one card per sheet: its posts, matched to the client's with a picker, or "Doar în bibliotecă"; the library outcome; and for a new or added profile a table of factors with a tick each, the classes as selects, the computed level and the flags, and the measures and plan fields under each row. The sensitive groups' sheet becomes the client's sensitive-groups evaluation, a sheet of kind `other` an evaluation by its name. A post whose evaluation already has factors is proposed unticked: "Postul are deja o evaluare cu 18 factori".

**Confirming instructions** runs `apply_instruction_import` in one transaction: it creates the new modules with their first version, takes the identical and the chosen similar ones as they are, and inserts `job_position_instructions` for each mapped post, skipping a pair that exists; the existing triggers set `needs_instructions`, or its fire-safety twin, and the client's 3.2 or IPSU is behind as usual. **Confirming risks** runs `apply_risk_import`: it creates the new profiles with their factors and measures, creates each mapped post's evaluation if missing with the sheet's three texts where its own are empty, and applies the profile with `apply_evaluation_profile`, which sets the provenance pointer of 2026-10-05; the client's copied factors then take the pack's plan fields where the pack gives them, since they are the client's. Everything carries the confirming member as `created_by`, which ticks the setup guide's `risk-evaluation` step ([ADR 031](adr-031-setup-guide.md)).

A part that fails shows its reason and **Citește din nou**, which sends its messages again and is paid again; the client proposal and the other parts are untouched. Abandoning the import abandons its parts. A part not confirmed 14 days after the client is expires, and its proposal goes with the import's 30-day clean-up, as ADR 030 keeps proposals. Every request records its tokens and cost on the import's totals and on its part, and the gateway metadata gains the part, so the cost of each step is visible per organization; the credits of #640 count the import as a whole. The main branch still prices Terra flat in `modelRates`; #666, open, adds its band above 272,000 prompt tokens, and this ADR is built on it. The caps keep every request below the band either way.

### An open legal point

The modules and profiles of a pack were often written by an earlier provider, and they land in this provider's library, to be printed for its other clients. The terms say the provider owns what it uploads. Whether that covers text an earlier provider wrote, and what a provider must check before reusing it, is added to the lawyer's questions in #629 and not decided here.

## What is left out

- The question bank from the pack's tests. ADR 024 leaves importing questions out, and the bank is seeded.
- Remembering the themes' map of posts to annexes when the pack's instructions cannot be read, to apply once the modules exist.
- An instructions request above 800,000 characters, or a risk request above 400,000.
- Migrating existing Word modules into bodies: none exists in production; the migration deletes the test rows.
- Replacing a library module's text or a profile's factors with the pack's. Choosing "Adaugă ca nou" and archiving the old one does it by hand.
- Uploading a Word file as a module, and any formatting in a body.
- Comparing against archived modules and profiles.
- The common part's chapters I to XII of a pack, which the app's template replaces.

## Consequences

- The issued binder reads as one document: the annexes are in the house style, numbered and paginated like the common part. A provider's own layout of a module is gone, by decision.
- The training themes cite exact article ranges, and the questions on modules of #531 can cite an article.
- The document engine renders content held as data for the first time beside the merged templates; the annex template ships with a deploy, like the title page, and an engine change reaches only what is issued after it.
- The import costs more: about $0.13 for the client reading, $0.20–0.27 for the instructions, $0.20–0.40 for the risks, so $0.53–0.80 a client with both libraries, which #640 prices.
- The schema loses the module files and their bucket and gains the body, `import_library_parts` and two confirm functions; the module routes lose upload, file link and file save, and gain the body's save, preview and download. `docs/data-model.md`, `docs/api.md` and `docs/document-engine.md` change with them.
- `sweepFonts`, `countArticles`, `firstLine`, the skeleton `.docx` and the module fixtures go; the dev seed and the flow tests use bodies in JSON.
- The glossary changes: instruction module, instruction library, and the new body, article, library proposal, identical and similar.
- A help article on the instruction library, and the import's article on the library tasks, come with the pull requests that complete them, each with its `## Actualizări` block.

## Order of work

Each step is a pull request in one stack, on this ADR.

1. This ADR, the glossary in `CONTEXT.md`, notes in ADR 012, 014, 015 and 030, and the legal question added to #629.
2. The body: its schema, folding and hash, and the splitter in `packages/contracts`, tested on cuts from invented packs.
3. The annex template in the document engine, title page and body, replacing `annexTitlePage`, with the layout and converter tests.
4. The database: body, `text_hash` and computed `article_count` on versions, the file columns and bucket dropped, the test modules deleted, pgTAP tests.
5. The API: saving a body, preview and download, issuing and the Word zip rendering annexes, the upload and file routes removed, the seed in JSON.
6. The app: the articles editor with paste and preview in place of the Word editor, the upload dialog removed.
7. `packages/import`: sorting's domain, the instructions request with its cuts, the risk request with its checks, the comparison with the libraries.
8. The database: `import_library_parts`, `apply_instruction_import`, `apply_risk_import`, their clean-up, pgTAP tests.
9. The API: the parts' messages, chunks and retries, their usage, their proposal, changes and confirm routes.
10. The app: the hub's Biblioteca ta, the instructions task, the risk task, and the "already in your library" rows; the help article.

## Defaults taken instead of asking

- **The body's shape.** Headings and articles of plain paragraphs, "a)", "–" and "•" indented; at least one article; at most 400 articles and 200,000 characters a module.
- **A form, not the Word editor**, with the Word viewer for the preview, and the paste dialog in place of the upload.
- **The annex as one rendered file per module**, not inside the common part, numbered "Anexa N, pag. X din Y" within itself, and not stored.
- **A save that changes no word makes no version**, so documents are not marked behind for whitespace.
- **One instructions request per domain**, with that domain's themes in it, capped at 800,000 characters and 16,000 output tokens; sorting tells the domain.
- **Cutting by the end quote first and the last start quote before it**, an unfound end ending at the next annex.
- **The risk request in chunks of eight posts** when a client has more, 64,000 output tokens each, the text capped at 400,000 characters; one retry in halves.
- **The pack's printed level is read only to flag disagreement** with the grid.
- **Thresholds**: Jaccard 0.5 for similar modules, 0.25–0.5 judged by GPT-6 Luna; 70 % of factors at 0.8 description similarity for similar profiles. To be tuned on the five reference packs in step 7.
- **Plan fields stay out of a profile's fingerprint**, and the client's copied factors take the pack's plan fields.
- **"Folosește ce ai" is the default** for a similar entry; a taken title gets the client's name.
- **Library tasks are confirmed after the client**, never block it, and expire 14 days after it.
- **A post that already has factors is proposed unticked**; an evaluation's three texts fill only empty ones.
- **Archived modules and profiles are not compared.**
- **The test modules on hosted are deleted** by the migration, with their positions' links, rather than converted; a draft that annexed one is regenerated before it is issued, and issued PDFs keep their annexes.
- **Usage is recorded on the import and on its part**, and the gateway metadata names the part.
