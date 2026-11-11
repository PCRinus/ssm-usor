# ADR 042: A dangerous substance filled in from its safety data sheet

- Status: accepted
- Date: 2026-11-11
- Amends [ADR 018](adr-018-fire-safety-means.md) (the substances list: where its texts come from).

## Context

The SU set's list of dangerous substances, document 5.3 ([ADR 018](adr-018-fire-safety-means.md), its amendment of 2026-10-11), prints for each substance its name, its classification under the CLP regulation, the quantity held and eight texts: the physical and chemical properties, the identification codes, the risks to health and the environment, the protection means, the intervention and first-aid measures, the agents for extinguishing, neutralizing or decontaminating, the storage place and the way it is handled. An empty text prints `DE COMPLETAT`. Since [ADR 041](adr-041-su-import-questions-and-suggestions.md) the client import proposes the substances a pack names, by their names only, and an entry without its classification or quantity is incomplete and blocks the set. No pack states a classification, so the readiness row "Substanțele periculoase" stays open after every import, and a specialist types eleven fields per product by hand.

The facts are in the product's **safety data sheet** (_fișa cu date de securitate_). Regulation (EC) No 1907/2006 (REACH) art. 31 (1) has the supplier of a hazardous substance or mixture give the recipient a sheet compiled after its annex II, which fixes its 16 sections; art. 31 (5) has it in an official language of the member state where the product is sold, unless that state provides otherwise, and art. 31 (8) free of charge, on paper or electronically, by the first delivery. The eight texts were modelled on the sheet's sections, and each field of the dialog names the section it is copied from. Nothing read a sheet.

ADR 041 rejected a classification guessed from a product's category. A sheet is the opposite case: the classification of the product bought, written by its supplier.

## Decision

### 1. Where

The substance dialog on the client's _Mijloace de apărare_ tab gains, above its fields, a notice with **Alege fișa (PDF)**, for a new substance and for an existing one, the incomplete entries an import created included. One sheet is one substance. The notice, its button and the credits line are the app's own: the `Notice` with an action, the outline button and hidden file input of the contract card, and the import's `CreditsLine`. While the sheet is read the notice turns into a spinner notice; afterwards into "Fișa a fost citită" with **Citește altă fișă**.

### 2. Nothing is written by the reading

The API answers a draft. The dialog puts it into its fields and the member saves as usual.

- An empty field takes the sheet's value, and so does one still holding an earlier sheet's value the member did not edit. It is marked with the review's tag **Din fișă** until the member edits it; saving closes the dialog.
- A field the member filled keeps their text. Where the sheet says otherwise, the sheet's text is shown under the field, "Păstrăm textul tău. În fișă: …", with the link button **Folosește textul din fișă**, which takes it and marks it. This is the employee review's pattern for a value the app holds and a sheet contradicts ("Pe fișă: …", "Folosește valoarea de pe fișă", [ADR 032](adr-032-employees-imported-from-training-sheets.md)), and the client import's rule for an existing client (ADR 030): nothing is overwritten without the member's click. Making each difference a choice that blocks saving was rejected for the reason ADR 030 rejected it in the review.
- A value equal to the member's, case and spacing aside, is neither filled nor offered.

### 3. What is read

| Field                                     | Read from the sheet                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Denumirea                                 | The trade name of section 1.1, without the supplier                                                                               |
| Clasificarea (CLP)                        | Section 2.1: each hazard class and category, abbreviated as CLP does, with its H and EUH codes ("Flam. Liq. 2, H225")             |
| Proprietăți fizico-chimice                | Section 9                                                                                                                         |
| Coduri de identificare                    | CAS and EC of the substance (section 1) or of the mixture's hazardous components (section 3, six at most), UN number (section 14) |
| Riscuri pentru sănătate și mediu          | Sections 2, 11 and 12, in words                                                                                                   |
| Mijloace de protecție recomandate         | Section 8                                                                                                                         |
| Măsuri de intervenție și de prim ajutor   | Sections 4, 5.3 (advice for firefighters) and 6                                                                                   |
| Substanțe pentru stingere, neutralizare … | Section 5.1, the unsuitable media marked "nu se folosește", and the absorbing or neutralizing materials of 6.3                    |
| Modul de manipulare                       | Section 7, handling and storage conditions                                                                                        |

The quantity is the client's stock and the storage place is, in template 5.3's words, "locul din unitate, în condițiile din secțiunea 7": the client's own place. Neither is ever filled. The template names sections 4, 5 and 6 for the intervention measures and 5 and 6 for the agents, and the reading follows the template; and the dialog's hints, which said sections 1 and 3 for the codes and 5 for the agents, now name the template's 1, 3 and 14, and 5 and 6. A product the sheet declares not classified gets "Neclasificat conform Regulamentului (CE) nr. 1272/2008".

The classification and the codes come back from the model as lists (classes with their codes, components with CAS and EC, a UN number) and code writes the field's text, so a code left out never leaves a dangling label.

### 4. Language and length

Every text is written in Romanian, also from a sheet in another language, condensed as short phrases to what serves fire defence and first intervention, with nothing the sheet does not state: an absent section, or one that says "nu există date", gives an empty value. The prompt states each column's limit (the table's checks: 160 for the name, 600 for the classification, the codes and the agents, 1000 for the other texts), and code cuts a longer text at its last full phrase that fits.

### 5. A guard in code

Every H or EUH statement, CAS, EC and UN number in the draft, in its own field or written inside a text, must occur in the file's extracted text, and a CAS, EC or UN number must have its format. One that does not is left out, with its label, and counted; the answer's `droppedCodes` says how many, and the dialog then asks the member to check the classification and the codes against the sheet. A value without a quote, as ADR 030 asks of an import, cannot work here: the values are condensed and translated, so no passage of the sheet contains them. The guard holds the part a wrong value would make dangerous, the codes an inspector and a firefighter act on.

A file that is not a safety data sheet is refused, "Fișierul nu este o fișă cu date de securitate", and its credits given back: when fewer than 12 of the section numbers 1 to 16 are found as headings ("SECȚIUNEA 2", "Section 2", "Abschnitt 2"…) or subsections ("2.1"), before the model is asked; or when the model says so.

### 6. Text PDFs only

The file is one PDF, at most 10 MB and 40 pages; a sheet runs to 10 to 20 pages, and the client files' 25 MB were too generous for one. A PDF whose pages are mostly scans (the extractor's rule of fewer than 100 characters, ADR 030) is refused with a message that says the app reads only PDFs with text for now; a photograph is not a PDF and is refused before it is sent. Scanned sheets would need a page-by-page image reading, as the import's, at a credit a page.

### 7. One synchronous request

`POST /clients/{clientId}/fire-substances/read-safety-sheet` takes the file as the body, the way a client file is uploaded. The substances live under `fire-substances`, not `fire-safety`, so the route does too. The same authorization as saving a substance: a member of the organization, a client it sees, not archived and not a lead. The extractor reads the text (`pdfText`), one structured request goes through the AI Gateway, code checks the answer and the route returns the draft. The file is not stored, has no import, and no improvement copy is kept ([ADR 037](adr-037-import-quality-and-alerts.md) is about imports).

A Worker answering an HTTP request has no wall-clock limit while the client waits, and time spent waiting on the extractor and the gateway is not CPU time, so a synchronous call is sound. Each attempt at the gateway is cut after two minutes, not the import's ten; the gateway client still tries a transient failure again and asks once more for an answer outside the schema. A sheet of 40 dense pages is about 120,000 characters, within the request's cap of 200,000.

### 8. Model

`safetySheetModel` in `packages/import/src/models.ts`, GPT-6.1 Terra, the reading model, at low reasoning effort, with at most 8,000 output tokens. The prompt and the schema are `packages/import/src/safety-sheet.ts`, tested on hand-written answers about an invented product.

### 9. Credits

A reading takes **3 credits** (`importCredits.safetySheet`). Estimated, not measured: a 12-page sheet is about 12,000 prompt tokens and 2,000 to 3,000 output tokens, about $0.03, and 40 pages about $0.05; three credits at $0.008 are $0.024, so the dearest sheet costs more than it is charged, by cents. The ledger gains two kinds, `safety_sheet` and `safety_sheet_refund`, with no import: the import's kinds name an import, and the refund is matched by the charge's key. The charge is refused, recording nothing, unless the balance covers it (`409`, `credits_insufficient`, as an import's start); a reading never takes the balance below zero. Every failure after the charge gives it back: a scan, too many pages, a damaged or protected file, a file that is no sheet, a failure of the extractor, the gateway or the model. The dialog shows the cost and what is left before the member chooses the file, with the import's `CreditsLine`, and the button is disabled when the balance does not cover it.

### 10. Usage record

Imports store tokens and cost on the import's row; a sheet's reading has none, and a table for it was not light. So each request's tokens and cost are logged as one JSON line (`safety_sheet_reading`, with the organization, the client, the outcome and the codes left out), and the gateway's metadata names the organization, the client and `reading: safety_sheet`, so the gateway's own cost per organization covers it.

## What is left out

- Several sheets at once, a sheet giving several substances.
- Scanned or photographed sheets.
- Keeping the sheet among the client's files.
- Reading sheets during a client import.
- The other papers a client holds: the extinguishers' service reports, the electrical check bulletins (PRAM), building papers.

## How it is checked

The tests hold the guard, an absent section, a file that is not a sheet, the length limits, the route's authorization, refusals, charge and refund, and the dialog's merge. After the merge, one real published sheet is read on non-prod by the main session: the draft is compared with the sheet field by field, and its tokens and cost replace the estimate in decision 9.

## Consequences

- An incomplete entry from an import is completed from its sheet in a minute, and so is a new one.
- What the list 5.3 sends to the inspectorate still passes through a member's eyes and a save; the reading's text is the member's once saved.
- The credits, until now an import's unit, count one reading outside an import. A balance shown to members is unchanged in meaning.
- A real sheet may lay out its headings or its codes in ways the guard and the structure check do not expect; the non-prod check is the first measure.
