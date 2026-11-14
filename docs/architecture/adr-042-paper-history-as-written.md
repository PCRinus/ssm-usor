# ADR 042: Paper history as written: a transcribed training says only what the paper says

- Status: accepted
- Date: 2026-11-12
- Amends [ADR 032](adr-032-employees-imported-from-training-sheets.md) (a missing trainer, trainer's function, material or duration is no longer taken from the client's training themes; the handover note on a sheet is read), [ADR 021](adr-021-training-records-and-individual-sheets.md) (a training from paper may lack a trainer, a material or a duration; both sheets mark its rows as transcribed) and [ADR 023](adr-023-advanced-electronic-signature.md) (the note the signed sheet prints on a paper row).

## Context

The employee import of [ADR 032](adr-032-employees-imported-from-training-sheets.md) reads photographs of the paper individual training sheets into employees and training records. The paper sheet stays the legal original. What the app holds is a transcription of it, _transcris de pe fișa pe hârtie_.

### What the law asks of the sheet

Read by Mircea on 2026-11-12 in the consolidated texts.

- **HG 1425/2006 art. 81(1)**: the result of a training is recorded in the fișa de instruire individuală, "întocmită pe suport hârtie sau în format electronic", "cu indicarea materialului predat, a duratei și datei instruirii". **Art. 81(3)**: the worker signs it, and so do those who gave and verified the training. **Art. 81(4) and (5)**: the workplace manager keeps it, on paper or electronically, from hiring until employment ends. **Art. 81(3³)**: traceability and integrity of the training materials is required only for trainings held electronically.
- **Art. 96(1)**: the conducătorul locului de muncă gives the periodic training. **Art. 96(4)**: the trainer's superior verifies it and, by sampling, the employer or the prevention service, who sign the sheets.
- **Art. 98 lit. b)**: a supplementary periodic training is due "când au apărut modificări ale prevederilor de securitate și sănătate în muncă privind activități specifice ale locului de muncă și/sau postului de lucru sau ale instrucțiunilor proprii, inclusiv datorită evoluției riscurilor sau apariției de noi riscuri în unitate".
- **Art. 122(1) lit. k)**: the file of an accident investigation holds copies of the injured workers' training sheets, and the originals when the accident is fatal.
- **OMAI 712/2005 art. 45 to 50**, the fire-safety sheet: written "cu pastă sau cu cerneală" (art. 47), signed by the trainee and by those who gave and verified the training (art. 48), kept by the workplace managers (art. 50). The order has **no** rule that a change of the employer's own instructions brings a training. Art. 17¹ repeats the workplace training only after 30 calendar days of absence, a changed technological process or a new technology, and a return to work after a fire, an explosion or another emergency. Art. 24 only adapts the yearly themes.
- No act found says anything about a change of external prevention service. The sheet is the employer's. The "Preluare" note a new provider writes on a sheet is practice, not law. No act found obliges an employer to keep its own instructions once they are replaced.

So the sheet is evidence the employer keeps for years, and an investigation reads it. A transcription that says more than the paper does is worse evidence than the paper.

### What a review of a real import found

A real import on the non-production environment was reviewed on 2026-11-12.

- **Who trained.** The periodic table of annex 11 has columns for the date, the duration, the occupation, the material and the signatures. It has no column for the trainer's name. ADR 032 has the import fill a missing trainer, trainer's function or material from the client's current training themes and trainer, tagged _Din tematica clientului_ (`fill(...)` in `packages/import/src/employee-import.ts`, flag `from_client_themes`). In the import reviewed, 52 of 60 rows got the current provider's people as their trainer. 20 of them were dated before a handover note written on the sheets, "03.10.22 Preluare <firma>": they were trainings given under the previous provider. Two fire-safety annual test results from 2021 named the current provider's fire-safety technician as their examiner. Once the import is confirmed, nothing tells these values from values read off the page.
- **Material and duration.** The same fill applies to a missing material or duration.
- **The handover note** was caught only by luck, as free text in the page reading's `notes`. No code reads it, and the review never shows it.
- **The material** is copied as written, "IPSSM, art. 167–288". That is right. But the numbers point into the instructions the client had then, not into the ones the app now generates.
- **The generated sheet** prints a paper-era row with the note _semnat pe hârtie_ only (`paperSigned` in `apps/api/src/modules/signed-sheets/form.ts`). It does not say the row is a transcription that the paper overrides. And the reading makes mistakes: one row was read as dated before the hire date, and one surname was read two ways on two pages.
- **The on-demand sheet**, the one printed while a client signs on paper ([ADR 021](adr-021-training-records-and-individual-sheets.md)), prints a paper-era training as a filled row whose signature cells are empty, with the trainer's and verifier's names printed small under them. Nothing marks it. It reads as a training nobody has signed yet.

ADR 032 took the fill on Mircea's decision of 2026-10-30, because a training held's trainer, material and duration were required columns. That reason does not hold up against evidence: a required column is a schema choice, and the sheet's columns are the law's.

## Decision

Mircea approved five changes on 2026-11-12. The first two are about what a transcription holds, the third and fourth about the instructions the sheets refer to, and the fifth about what the generated sheet says.

### 1. A paper training says who trained only when the paper does

The import no longer fills a trainer's name or function from the client's training themes. A training from paper may have no trainer name: it shows as _nume neînscris pe fișă_.

A **handover note** (_mențiunea de preluare_), "03.10.22 Preluare <firma>" and its like, becomes a read value of the page with its date, not free text, and the review shows it.

Who gave the periodic trainings is then asked **per person**, on the person's page of the review, per domain, and split at that person's handover date when their sheet has one: one answer for the trainings before it and one for those after it. One answer per import was rejected. HG 1425/2006 art. 96(1) has the periodic training given by each worker's own workplace manager, so two workers of one client may have two trainers, and the only evidence is the signature in the photograph, which the person page shows.

- An answer may be offered to the other people of the import who have none, as an explicit, optional step. Nobody's own answer is overwritten by it, and a single row may still differ from the answer.
- The import's hub only shows who has no answer yet. Nothing blocks the confirm.

Screens follow the design canvas, row 1 of the page "Istoricul pe hârtie".

As built on 2026-11-14, revised after review:

- **Where the answer lives.** In the member's stored changes, as `whoTrained` on the person, by domain; no column and no migration. The confirm expands it per row (`rowSigners` in `@ssm-usor/import`), and the review does the same for what it shows, so changes stored before it stay valid and nothing is written before confirming.
- **The rule.** The app never puts a name on a row in a period the member did not place it in. Each role of an answer keeps the handovers it was chosen under (`splitOn`, `previousOn`, null for none). When the person's sheets no longer record those handovers, for instance after a page moves, the role names nothing, the person counts as unanswered, and the question says the handover changed; the old names stay shown and are preselected when the role is chosen again.
- **The handovers.** A provider takes over the client, not a domain, so a person's handovers count across both sheets, and both tables show them as rows at their date. The latest splits the periods; with several, the answer before it covers only the rows from the previous handover on, and older rows take nothing. A month-only row in the month of a handover not on the 1st falls in neither period, unless the member gives it a day.
- **What it names.** The rows of the periodic table, every non-hiring phase (periodic and supplementary), of the domain. A name the sheet writes is never replaced; a function the sheet writes without a name stays, and only the name comes from the answer; a name typed on the row with its pencil wins over the answer. The verifier is asked and written for occupational safety only, since the fire-safety periodic table has no verifier's signature; a verifier is a name and a function together, and one without a function is shown as not taken over.
- **Copies.** A copy goes only to people without an answer whose sheets record the same handovers or none; one with none takes the source's handovers along (`splitCopied`). An unchanged copy (`copiedFrom`) follows its source when the source's answer changes, and a changed copy, or one whose source leaves the import, becomes the holder's own answer.
- **When it is asked.** Where a dated periodic row of the domain leaves a role the domain asks unnamed on the sheet. The hub counts the people included who are asked and have no answer in force.
- **Departures from the canvas.** The picker is the browser's own list, grouped, with "pe 6 fișe" after the name, instead of a drawn list; the handover line stays above the cards and also takes a row in the periodic tables at its date; the window that copies an answer shows the whole answer, both roles and both periods, since the whole answer is copied.

### 2. A missing material or duration stays missing

Likewise, a missing material or duration is left as it is on paper, _necompletat pe fișă_, and never borrowed from today's themes. This reverses ADR 032's "A missing trainer, trainer's function or material is taken from the client's training themes and trainer, tagged _Din tematica clientului_" for all four values.

A training from paper (`source` paper) may therefore hold no trainer, no trainer's function, no material and no duration. A training held in the app (`source` app) still requires all four, as today. A due date counts from the day of a training, never its duration, so nothing that computes a due date needs a duration.

### 3. The instructions the sheets refer to are asked for

A paper row's material cites the client's own instructions as they were then: "IPSSM, art. 167–288". When a client has paper trainings and the app holds no copy of the own instructions (IPSSM or IPSU) they cite, two places ask for them, optionally: the employee import, and the client's page where history is typed by hand. A client import that already kept the pack's own instructions among the client's files satisfies the request.

The copy is kept as a client file ([ADR 013](adr-013-client-files.md)) with the period it was valid. It is not a legal duty, since no act obliges an employer to keep replaced instructions. It is evidence for an investigation, which reads the sheet against what was taught. Screens follow on the canvas.

As built (step 6), where the above leaves it open:

- **Per domain.** IPSSM and IPSU are asked and answered apart: copies, or _Nu le am_, which says nothing about the other domain and can be taken back. A domain counts as answered when a confirmed client import kept files its sorting took for that domain's own instructions (_le avem deja_), when a member added a copy, or when a member answered _Nu le am_, in that order. Adding a copy takes back a _Nu le am_ of its domain.
- **The period** is one day, _Valabile până la_: the day the instructions that replaced them apply from, proposed as today. It is kept on each file, so copies of two generations of instructions keep their own days. Several files per domain are allowed, since old instructions come as several scans.
- **Storage.** The copy is a client file with two columns, the domain and the day (`client_files.earlier_instructions_domain`, `valid_until`), both or neither, never on an employee's file or an import folder's. ADR 013 kept categories out of client files; this is not a category list but the one kind of file the app asks for by name. The answer _Nu le am_ is a row of its own per client and domain (`earlier_instructions_unavailable`). What a client import kept is not copied or marked: it is read from the import's file rows.
- **Where it is asked.** In the employee import, as the last section of its page, only for the domains its sheets have trainings in, with how many of them cite each; it is optional and blocks nothing. On the client's tab _Instruiri ținute_, a notice while a domain with trainings transcribed from paper is unanswered, below the supplementary training notice of decision 4. The files show in _Alte documente_ as the group _Instrucțiuni proprii anterioare_, each with its domain and day; the day is changed from the file's rename window.
- **Departures from the canvas.** The notice's _Nu le am_ opens a choice (_Nu am IPSSM_, _Nu am IPSU_, _Nu le am pe niciunele_) when both domains are missing, since each domain is answered apart; with one missing it answers that one. The window takes several files, adding _Adaugă încă un fișier_ under the first, as the import's section does. In the import, changing _Valabile până la_ once a domain has files changes the day of every file of that domain the member may change.

### 4. Issuing the own instructions again proposes a supplementary training

Every time a client's own instructions, the occupational safety ones (IPSSM) or the fire-safety ones (IPSU), are issued again and the client has workers with a training recorded, the app proposes a supplementary periodic training. The first issue from the app counts too: it replaces the instructions the client had on paper.

- **What it proposes.** A notice that lists every post with current workers. Each post is one training, recorded through the existing training dialog, whose rule of one post per training stays.
- **Closing it.** One answer, _Nu e nevoie de instruire_, closes the notice, for a revision that changed nothing important.
- **Who decides.** It is a proposal the specialist confirms, never a training recorded by itself. A member can always record a supplementary training by hand, whatever the app proposes.

Comparing the new revision with the one issued before it, so as to propose only for a change of substance and only for the posts it concerns, is deferred to #932 (see "What is left out").

For occupational safety the basis is HG 1425/2006 art. 98 lit. b), with the reason _modificarea instrucțiunilor proprii_, which already exists among the reasons of [ADR 021](adr-021-training-records-and-individual-sheets.md) (`rules_changed`). For fire safety there is none: OMAI 712/2005 has no such rule (art. 17¹ and art. 24, see above). Mircea chose on 2026-11-12 to propose it there too, for one rule in both domains and to be on the safe side, so the fire-safety proposal cites no law. Screens follow the design canvas, row 4 of the page "Istoricul pe hârtie".

As built (step 7), where the above leaves it open:

- **When.** The issue brings the proposal only if, at that moment, a current worker of the client (active, not archived) has a training recorded in the domain; a client whose only trained workers have left has nobody to train again. The database decides it as the revision is issued and keeps the proposal beside that revision (`supplementary_training_proposals`), with who closed it and when: the member whose token closed it, never a name the request gives, and a closed proposal is never reopened. Only the open proposal of the revision in force closes.
- **What it lists** is read live: the posts with current workers now, not as they were at the issue. A post shows as done once a supplementary training of the domain with the reason `rules_changed`, recorded after the issue and held on the issue's day or later, has one of its current workers among its attendees, whether it was opened from the notice or recorded by hand; a paper training held before the issue and transcribed after it does not count. The notice shows the day the training was recorded, as its words _Înregistrată pe_ say. The notice goes when every post is done, when it is closed, or when a newer issue supersedes its revision.
- **The material** the dialog proposes names the instructions, their revision and their date, without articles: "Instrucțiuni proprii de securitate și sănătate în muncă, rev. 2 din 14.11.2026".

### 5. The generated sheet says its paper rows are transcribed

On every sheet the app generates, the on-demand one and the signed one, both domains, a row or a hiring block that comes from a paper training reads as a transcription whose signed original is with the employer.

- **The row's note** reads `transcris; semnat pe hârtie`, where it read `semnat pe hârtie`. A training held in the app whose slot nobody signs electronically keeps `semnat pe hârtie`: it is signed by hand on the sheet itself, not transcribed.
- **One line** under the sheet's title, printed only when the sheet carries at least one paper row or block: "Rândurile cu mențiunea „transcris” sunt copiate de pe fișa pe hârtie. Originalul, cu semnăturile, se păstrează la angajator."
- **The on-demand sheet** marks a paper row the same way. The note goes in the trainee's signature cell of a periodic row, in each signature box of a hiring block, and after the date of the admission on the occupational safety sheet; the fire-safety form's admission has no signature, so it carries no note. The trainer's and verifier's names stay printed small under them. A training held in the app keeps its empty cells for the pen.
- **The signed sheet** prints the note where it printed _semnat pe hârtie_: in the trainee's cell of a row printed as text, in each box of a hiring block printed as text, and, on the occupational safety sheet only, after the admission's date. A paper training that takes a row after the sheet was made gets the note in that row's note field. The line is a field under the title, filled when the sheet is made with paper rows and again whenever a paper row is filled on it later. Like a voided row, which stays on the sheet, the line stays on a stored sheet even when its only paper row is later voided. The row's note field holds two lines: on one, "transcris; semnat pe hârtie" would be set at about 3 pt; on two it is set at 5 pt, the size the one-line _semnat pe hârtie_ had. The line is set at 8 pt in its field, where the on-demand sheet prints it at 9 pt.
- **A stored sheet never changes** what it printed. A sheet made before this decision keeps `semnat pe hârtie` for the paper rows filled on it later, and has no line: the stored sheet records which form it was drawn from. Only sheets made from now on carry the new wording.

### What does not change

- Nobody signs again and nobody is trained again because of an import or a change of provider ([ADR 032](adr-032-employees-imported-from-training-sheets.md)). The paper signature stands.
- The client keeps the paper originals after an import. The employer keeps the sheet, on paper or electronically, until employment ends (HG 1425/2006 art. 81(4) and (5); OMAI 712/2005 art. 50). The app's copy is a transcription, never a replacement, because it carries none of the signatures: art. 81(3) has the sheet signed by the worker and by those who gave and verified the training. An investigation of a fatal accident takes the originals (art. 122(1) lit. k)).

## What this changes in earlier ADRs

- **ADR 032**: a missing trainer, trainer's function, material or duration is no longer taken from the client's training themes; `from_client_themes` and _Din tematica clientului_ go; a training from paper may hold none of the four; the handover note is a read value shown in the review; who gave the periodic trainings is asked per person and per domain, split at that person's handover date, with an optional step that offers an answer to the people who have none.
- **ADR 021**: a training from paper (`source` paper) holds a trainer, a trainer's function, a material and a duration only where the paper writes one; a training held in the app still requires all four. Both sheets mark a paper row as transcribed and print the line under the title. Issuing the own instructions again from the app, in either domain, proposes a supplementary training for every post with current workers, under art. 98 lit. b) for occupational safety and by Mircea's choice for fire safety.
- **ADR 023**: the paper rows of a signed sheet read `transcris; semnat pe hârtie`, its row note field holds two lines, and a field under the title takes the line; a stored sheet records the form it was drawn from and keeps its wording.
- **ADR 034**: issuing a revision of the own instructions, in either domain, while the client has trained workers, brings the notice proposing a supplementary training.
- **ADR 013**: a client file can be the copy of the own instructions a client's paper trainings cite, with the period it was valid; its shape follows the canvas.

## What is left out

- Re-reading the material's article numbers against the instructions the app generates. The material stays as written; the copy of the old instructions is what explains it.
- A mark telling what a model read from what a member typed (#715, left out by ADR 032). Both are transcriptions from paper and both carry the note.
- A paper test result printed on the fire-safety sheet's periodic table. It prints as today, since a test row is never signed (ADR 024).
- Proposing a supplementary training when the instructions change outside the app, in a Word file the specialist issues by hand.
- Comparing a newly issued revision of the own instructions with the one issued before it (#932). The instructions are structured articles with versions ([ADR 034](adr-034-own-instructions-as-app-text.md)), so the comparison can go by instruction and by article. It would propose only when an instruction was added or removed, an article was added, removed or moved, or an article's text changed beyond a typo, a changed number, measure or negation always counting, and nothing for a revision that only fixes typos, spacing, diacritics or the client's identification data; when unsure, it would propose. The proposal would say what changed and cover only the workers on the posts that carry the changed instructions. Until then the notice proposes on every issue and lists every post.

## Consequences

- `trainings.trainer_name`, `trainer_job_title`, `material` and `duration_minutes` become optional for paper trainings, and every place that reads them, the contracts, the app, the portal and the sheets, has an empty value to show.
- The sheets carry one more template version each. The on-demand sheet's merge data gains a note per row and per hiring block and the line, and the signed sheet gains a field for the line and a taller note field. Sheets stored before keep printing what they printed.
- The import's review gains the handover note and, on each person's page, the question of who trained, per domain; the hub counts who has no answer and blocks nothing. Its screens wait for the canvas.
- Every issue of the own instructions at a client with trained workers brings a notice, a revision that changed nothing important included, until #932 compares revisions; one answer closes it.
- The help articles on the import and on trainings change with the steps that change what they describe; the step that completes each part carries its `## Actualizări` block.

## Order of work

Each step is a pull request. Steps 5 to 7 follow the design canvas, page "Istoricul pe hârtie".

1. This ADR, the notes in ADR 021, ADR 023 and ADR 032, and the glossary in `CONTEXT.md`.
2. The sheet's wording: the note and the line on both sheets, the on-demand sheet's paper rows marked, the signed sheet's line field and two-line note field, the stored sheet's form recorded; the templates registered as new versions; the help on the sheet.
3. Paper trainings as written: no fill from the themes; trainer, trainer's function, material and duration optional for a paper source in the database, the contracts and the API; _nume neînscris pe fișă_ and _necompletat pe fișă_ where they are shown.
4. The handover note read as a value with its date and shown in the review.
5. The "who trained" question on each person's page, per domain and split at the person's handover date, the optional step offering an answer to the people who have none, and the hub showing who has no answer.
6. The instructions the sheets refer to: asked for in the employee import and on the client's page, kept as a client file with its period.
7. The supplementary training proposed when the own instructions are issued again, in both domains: the notice listing every post with current workers, one training per post through the existing dialog, and _Nu e nevoie de instruire_. The comparison of revisions follows in #932.
