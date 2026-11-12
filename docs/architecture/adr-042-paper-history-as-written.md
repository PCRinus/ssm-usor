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

Who gave the periodic trainings is then asked, once per import: one answer for the trainings before the handover date and one for those after it, when a sheet has a handover note; one answer for all of them when none has. This is decided in principle; its screens follow on the design canvas "Importul lucrătorilor".

### 2. A missing material or duration stays missing

Likewise, a missing material or duration is left as it is on paper, _necompletat pe fișă_, and never borrowed from today's themes. This reverses ADR 032's "A missing trainer, trainer's function or material is taken from the client's training themes and trainer, tagged _Din tematica clientului_" for all four values.

A training from paper (`source` paper) may therefore hold no trainer, no material and no duration. A training held in the app (`source` app) still requires all three, as today. A due date counts from the day of a training, never its duration, so nothing that computes a due date needs a duration.

### 3. The instructions the sheets refer to are asked for

A paper row's material cites the client's own instructions as they were then: "IPSSM, art. 167–288". When a client has paper trainings and the app holds no copy of the own instructions (IPSSM or IPSU) they cite, two places ask for them, optionally: the employee import, and the client's page where history is typed by hand. A client import that already kept the pack's own instructions among the client's files satisfies the request.

The copy is kept as a client file ([ADR 013](adr-013-client-files.md)) with the period it was valid. It is not a legal duty, since no act obliges an employer to keep replaced instructions. It is evidence for an investigation, which reads the sheet against what was taught. Screens follow on the canvas.

### 4. A change of the own instructions proposes a supplementary training

When a client's own occupational safety instructions are replaced or changed by issuing them from the app, and the client has employees with a training recorded, the app proposes a supplementary periodic training with the reason _modificarea instrucțiunilor proprii_. This is HG 1425/2006 art. 98 lit. b), and the reason already exists among those of [ADR 021](adr-021-training-records-and-individual-sheets.md) (`rules_changed`). It is a proposal the specialist confirms, never a training recorded by itself.

It is occupational safety only. OMAI 712/2005 has no such rule for the fire-safety own instructions (see above), so issuing an IPSU proposes nothing. Screens follow on the canvas.

### 5. The generated sheet says its paper rows are transcribed

On every sheet the app generates, the on-demand one and the signed one, both domains, a row or a hiring block that comes from a paper training reads as a transcription whose signed original is with the employer.

- **The row's note** reads `transcris; semnat pe hârtie`, where it read `semnat pe hârtie`. A training held in the app whose slot nobody signs electronically keeps `semnat pe hârtie`: it is signed by hand on the sheet itself, not transcribed.
- **One line** under the sheet's title, printed only when the sheet carries at least one paper row or block: "Rândurile cu mențiunea „transcris” sunt copiate de pe fișa pe hârtie. Originalul, cu semnăturile, se păstrează la angajator."
- **The on-demand sheet** marks a paper row the same way. The note goes in the trainee's signature cell of a periodic row, in each signature box of a hiring block, and after the date of the occupational safety admission. The trainer's and verifier's names stay printed small under them. A training held in the app keeps its empty cells for the pen.
- **The signed sheet** prints the note where it printed _semnat pe hârtie_: in the trainee's cell of a row printed as text, in each box of a hiring block printed as text, and after the admission's date. A paper training that takes a row after the sheet was made gets the note in that row's note field, and the line is a field under the title, filled when the sheet is made with paper rows or when the first paper row is filled later. The row's note field holds two lines so the note keeps its size.
- **A stored sheet never changes** what it printed. A sheet made before this decision keeps `semnat pe hârtie` for the paper rows filled on it later, and has no line: the stored sheet records which form it was drawn from. Only sheets made from now on carry the new wording.

### What does not change

- Nobody signs again and nobody is trained again because of an import or a change of provider ([ADR 032](adr-032-employees-imported-from-training-sheets.md)). The paper signature stands.
- The client keeps the paper originals after an import. The app's copy is a transcription, never a replacement (HG 1425/2006 art. 81(4) and (5); OMAI 712/2005 art. 50), and an investigation of a fatal accident takes the originals (art. 122(1) lit. k)).

## What this changes in earlier ADRs

- **ADR 032**: a missing trainer, trainer's function, material or duration is no longer taken from the client's training themes; `from_client_themes` and _Din tematica clientului_ go; a training from paper may hold none of the three; the handover note is a read value shown in the review; who gave the periodic trainings is asked once per import, before and after a handover date.
- **ADR 021**: a training from paper (`source` paper) holds a trainer, a material and a duration only where the paper writes one; a training held in the app still requires all three. Both sheets mark a paper row as transcribed and print the line under the title. A change of the own occupational safety instructions issued from the app proposes the supplementary training of art. 98 lit. b).
- **ADR 023**: the paper rows of a signed sheet read `transcris; semnat pe hârtie`, its row note field holds two lines, and a field under the title takes the line; a stored sheet records the form it was drawn from and keeps its wording.
- **ADR 013**: a client file can be the copy of the own instructions a client's paper trainings cite, with the period it was valid; its shape follows the canvas.

## What is left out

- Re-reading the material's article numbers against the instructions the app generates. The material stays as written; the copy of the old instructions is what explains it.
- A mark telling what a model read from what a member typed (#715, left out by ADR 032). Both are transcriptions from paper and both carry the note.
- A paper test result printed on the fire-safety sheet's periodic table. It prints as today, since a test row is never signed (ADR 024).
- A supplementary training for fire safety when the IPSU changes: no act asks for one.
- Proposing a supplementary training when the instructions change outside the app, in a Word file the specialist issues by hand.

## Consequences

- `trainings.trainer_name`, `trainer_job_title`, `material` and `duration_minutes` become optional for paper trainings, and every place that reads them, the contracts, the app, the portal and the sheets, has an empty value to show.
- The sheets carry one more template version each. The on-demand sheet's merge data gains a note per row and per hiring block and the line, and the signed sheet gains a field for the line and a taller note field. Sheets stored before keep printing what they printed.
- The import's review gains the handover note and one question; its screens wait for the canvas.
- The help articles on the import and on trainings change with the steps that change what they describe; the step that completes each part carries its `## Actualizări` block.

## Order of work

Each step is a pull request. Steps 5 to 7 follow the design canvas "Importul lucrătorilor".

1. This ADR, the notes in ADR 021, ADR 023 and ADR 032, and the glossary in `CONTEXT.md`.
2. The sheet's wording: the note and the line on both sheets, the on-demand sheet's paper rows marked, the signed sheet's line field and two-line note field, the stored sheet's form recorded; the templates registered as new versions; the help on the sheet.
3. Paper trainings as written: no fill from the themes; trainer, trainer's function, material and duration optional for a paper source in the database, the contracts and the API; _nume neînscris pe fișă_ and _necompletat pe fișă_ where they are shown.
4. The handover note read as a value with its date and shown in the review.
5. The "who trained" question, once per import, before and after a handover date.
6. The instructions the sheets refer to: asked for in the employee import and on the client's page, kept as a client file with its period.
7. The supplementary training proposed when the own occupational safety instructions change.
