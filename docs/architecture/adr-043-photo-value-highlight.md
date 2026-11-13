# ADR 043: Where a value is written, spotlighted on the sheet photo

- Status: accepted
- Date: 2026-11-13
- Amends [ADR 030](adr-030-import-from-documents.md) (a photograph in the source dialog is no longer always unmarked; a second model provider, Google, joins the sub-processors) and [ADR 032](adr-032-employees-imported-from-training-sheets.md) (each sheet page read is also located, by a request of its own that is not charged in credits).

## Context

The employee import of [ADR 032](adr-032-employees-imported-from-training-sheets.md) reads each photograph of a paper training sheet, and each scanned PDF page, into values, and the review shows them by person. Beside a value is a small badge with the number of the page it was read from, "Nume Șonda-Tîrcă [1]". The badge opens the page's photograph, upright and zoomable, and the member looks for the value on it. A sheet holds forty or more handwritten values, the periodic tables a dozen rows of dates, durations and signatures, some written sideways. Finding the one value to check is the slow part of the review.

[ADR 030](adr-030-import-from-documents.md) shows a Word file or a PDF with the passage highlighted, and a photograph "unmarked, since the model gives no position on the page", and left "Highlighting a passage on an image" out. The reading model does not give positions. A model that does was looked for.

### What was measured

27 real sheet photographs of a non-production import (two people, with their consent; kept outside the repository), holding 312 values, were evaluated on 2026-11-13. Each method was given the photograph and the values already read from it, and asked for one box per value, `[ymin, xmin, ymax, xmax]` in integers from 0 to 1000 of the photograph's height and width.

There is no hand-made reference. A method's box counts as agreeing when its median overlap (IoU) with the boxes of the strongest models is at least 0.5; a box with an IoU under 0.1 is a wild box, one pointing somewhere else. A model whose boxes are part of that consensus agrees with it partly by construction, so the highest numbers below overstate their lead. The boxes were also checked by eye on about ten photographs, periodic tables with dates written sideways among them.

| Method                                             | $ a photo                                                          | s a photo                     | Values boxed | Agrees | Wild boxes (IoU < 0.1) |
| -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- | ------------ | ------ | ---------------------- |
| **Gemini 3.1 Flash-Lite, separate pass (chosen)**  | 0.0015 (Google's own route), about 0.002 through the catalog route | 3.8                           | 312/312      | 96%    | 0                      |
| Gemini 3.5 Flash-Lite                              | 0.0024                                                             | 3.7                           | 307/312      | 97%    | 3                      |
| Gemini 3.8 Flash                                   | 0.0066                                                             | 11.8                          | 308/312      | 99.7%  | 0                      |
| Gemini 4 Argon                                     | 0.0095                                                             | 15.7                          | 310/312      | 99%    | 0                      |
| GPT-6.1 Terra writing boxes inside its reading     | 0.0123 for the whole reading, about 0.006 over today's             | 18.2, against about 9.4 today | 308/312      | 95%    | 0                      |
| GPT-6.1 Terra, separate pass, low reasoning effort | 0.0059                                                             | 5.6                           | 311/312      | 77%    | 24                     |
| GPT-6 Luna                                         | 0.0007                                                             | 6.6                           | 305/312      | 69%    | 9                      |
| Gemini 2.5 Flash-Lite                              | 0.0004                                                             | 2.9                           | 311/312      | 39%    | 66                     |

How the value is marked was settled the same day. Mircea compared three looks on the photographs: a spotlight, a red rectangle and a yellow highlighter, and chose the spotlight. Red already means a problem in the review, and yellow is weak on yellowed paper.

The decisions come from Mircea in conversation on 2026-11-13.

## Decision

### The spotlight

When the member opens a sheet page from a value's page badge in the employee import's review, the photo viewer **spotlights** the value: the rest of the photograph is dimmed, the value's box keeps its full brightness with a thin lime outline (`--brand-lime`), and the viewer zooms and scrolls so that the box is in view. A value offered as a choice between pages spotlights its own box on each option's page. Opened any other way, from the photo column or the thumbnails, the photograph shows as today, unmarked.

The box is where the value as read is written. A value the member changed in the review still spotlights where the sheet writes it, since that is what the member compares it with.

A page with no box for the value, because the locate request failed, has not run yet or found nothing, opens as today, unmarked and with nothing said: the spotlight is a help to find the value, never the only way to see it, and the value is always in the row's text.

This round is the employee import only. The client import's scanned pages and photographs can take the same step later; a Word file and a PDF with text keep their highlighted passage.

### Locating: a request of its own, after the reading

After a sheet page has been read, as today, by GPT-6.1 Terra with the prompt and schema ADR 032 evaluated, a second request **locates** the page's values: it sends the same image and the values read from it to Gemini 3.1 Flash-Lite, which returns one box per value, `[ymin, xmin, ymax, xmax]` in integers from 0 to 1000 of the image's height and width, held to a schema as the other requests are. A value is named in the request by its place in the page's reading, a field or a training row's cell, so a box goes back to the value it belongs to.

- **Its own queue message, per page.** The page's reading sends it on the `ssm-usor-import` queue once the reading is stored. The import does not wait for it: its people are grouped, its checks run and its review opens whether or not the pages have been located, so the import is not slowed and the review never waits. A locate that fails, after the queue's retries, is dropped: it fails neither the file nor the import, and its dead letter changes nothing. A locate that arrives after the import has ended (confirmed, abandoned or failed) stores nothing.
- **Code checks the boxes.** A box outside 0 to 1000, with its minimum not under its maximum, or for a value the request did not name is dropped, and so is that value's spotlight.
- **The same image.** The image located is the one read and the one the viewer shows: a photograph's upright JPEG of at most 2,000 pixels a side, and a PDF page's image, both made by the extractor ([ADR 030](adr-030-import-from-documents.md), ADR 032). One image for all three is what makes the boxes line up with what the member sees.
- **The route.** The request goes through the same Cloudflare AI Gateway as the reading, on its Workers AI catalog route (OpenAI-compatible chat completions, model `google/gemini-3.1-flash-lite`), and is paid from the account's gateway credits under the gateway's unified billing, as OpenAI is. No Google account or key is needed. Its model is a constant in `packages/import/src/models.ts`, as each step's is.

### Where the boxes are kept

The boxes are stored beside the page's reading, in the import's folder of the `imports` bucket, under a name of their own, and go wherever the readings go: into the source response the review asks for when it opens a page, into the improvement copy of [ADR 037](adr-037-import-quality-and-alerts.md) when the import ends, and away with the import's folder by the clean-up, 14 days after an import is abandoned or failed and 30 days after it is confirmed. Nothing is written to the database but the usage. The employees' files an import leaves are the photographs alone: an employee's page shows them unmarked.

### Usage and cost

Locating is not charged in credits. A credit stays one page read ([ADR 030](adr-030-import-from-documents.md#usage-is-counted-in-credits), ADR 032), so the dialog's count before an import starts does not change, and a locate that fails gives nothing back since it took nothing.

Its cost is recorded as every request's is, with `record_import_usage` against the import and the file, under a new usage step, `locating`, beside sorting, reading and scanning, and its tokens and cost show in the review's debugging line. Gemini 3.1 Flash-Lite costs $0.25 a million input tokens and $1.50 a million output tokens, with no change announced. A photograph costs about $0.0015 to locate on Google's own route and about $0.002 through the catalog route. A 50-person import of about 200 photographs costs about $1.26 to read today; locating adds about $0.30 to $0.40.

### The successor model

Google's deprecations page gives Gemini 3.1 Flash-Lite a shutdown date of 7 May 2027, with Gemini 3.5 Flash-Lite as its replacement ($0.30 input and $2.50 output a million tokens, no shutdown date). Gemini 3.5 Flash-Lite was evaluated above as the successor: 97% agreeing, 307 of 312 values boxed and 3 wild boxes. Moving is one constant and its rates, and a repeat of this check on the same photographs before the switch, in time for the shutdown.

## Alternatives considered

- **Boxes written inside Terra's reading.** One request instead of two, and as good (95%, no wild boxes). It doubles the reading's time, 18.2 seconds a photograph against about 9.4, and adds about $0.006 a photograph, nearly doubling the reading's cost; it also changes the reading prompt and schema ADR 032 evaluated, so the reading would have to be evaluated again. Rejected.
- **Terra in a separate pass, and GPT-6 Luna.** Cheaper or already in use, but they misplace boxes: 77% and 69% agreeing, with 24 and 9 wild boxes. A spotlight on the wrong value is worse than none. Rejected.
- **Gemini 3.8 Flash and Gemini 4 Argon.** Tighter boxes, but 4 to 6 times the price and three to four times slower, and both double in price soon: Argon on 1 December 2026, 3.8 Flash on 1 January 2027. Rejected.
- **Gemini 2.5 Flash-Lite.** The cheapest and fastest, and wrong more often than right (39%, 66 wild boxes). Rejected.
- **OCR with word boxes, Google Cloud Vision say, matched to the values by code.** Not run: it needs another vendor account, and matching handwriting the OCR reads differently from the model is a problem of its own, while the model pass already places sideways handwriting well.
- **A red rectangle or a yellow highlighter** instead of the spotlight. Rejected by Mircea: red means a problem in the review, and yellow is weak on yellowed paper.

## Data protection

Google becomes a sub-processor. The sheet photographs, with the names, birth dates, addresses and, where the sheet has them, the CNP and the blood group on them, and the values read from them, go to Google through Cloudflare AI Gateway, only when a member starts an employee import, for that import. Under Google's Gemini API terms for paid services, prompts and responses are not used to improve Google's products; they are logged for a limited time, solely to detect and prevent violations of the Prohibited Use Policy, 55 days by Google's usage policies; they may be processed in any country where Google or its agents have facilities; and they are processed under Google's data processing addendum for products where Google is a processor. For Gemini API paid services the Google entity is set by the customer's billing address; the requests go out under Cloudflare's gateway billing, as [ADR 030](adr-030-import-from-documents.md#data-protection) says of OpenAI, so the customer is Cloudflare, Inc., in the United States, and the entity is Google LLC. The lawyer's question on the gateway's billing (#629) covers Google as it covers OpenAI. The gateway's logs keep the locate requests 30 days, as they keep the readings.

Google LLC joins the sub-processors in the data processing agreement and the privacy policy, for finding on the sheet photographs where each value read is written, with the Cloudflare entry naming both providers the gateway reaches. No member uses the app yet, so the 15 days' notice point 6 of the agreement promises is owed to no one. Product scope §6.9's exception for an import a member starts says that the import's data goes to models, through sub-processors the agreement names.

## What is left out

- The client import's scanned pages and photographs. The same step can follow.
- A spotlight on an employee's files once the import is confirmed. The boxes go with the import.
- Saying on a page that it has no box for the value. Nothing is said; the photograph opens as today.
- Zero data retention, which the gateway can ask of providers under unified billing. Nice to have, as it is for OpenAI (ADR 030), not a condition.
- Choosing the reading model per import kind (#703). Locating is a step of its own with its own model, and the reading stays Terra.

## Consequences

- The import reaches a second model provider. The gateway client in `packages/import` gains the catalog route beside the OpenAI one, and `models.ts` a model and its rates.
- Each sheet page costs one more request and about a quarter more, which credits do not count; the cost per import shows it under `locating`.
- `record_import_usage` takes a fourth step, so every place that lists an import's usage by step has one more entry.
- The legal pages name Google LLC, and the help article on the import says how a value is found on its photograph. The pull request that completes the feature, the viewer's spotlight, carries the `## Actualizări` block.
- Moving to Gemini 3.5 Flash-Lite is due before 7 May 2027.

## Order of work

Each step is a pull request in one stack, on this ADR.

1. This ADR, the notes in ADR 030 and ADR 032, the glossary in `CONTEXT.md`, product scope §6.9, and the legal pages: the data processing agreement and the privacy policy name Google LLC.
2. `packages/import`: the locate request, its prompt and its schema, the values of a page reading named by their place, the boxes checked by code, the catalog route in the gateway client, and Gemini 3.1 Flash-Lite with its rates in `models.ts`. Tested on invented readings and recorded answers.
3. `apps/api`, with a migration: the `locating` usage step accepted by `record_import_usage`; the locate message sent once a page's reading is stored, its handler storing the boxes beside the reading and recording its usage, and doing nothing once the import has ended; the boxes in the source response and in the improvement copy; the gateway's route in `docs/deployment.md`. On step 2.
4. `apps/app` and `apps/help`: the photo viewer's spotlight when a page is opened from a value's badge, with the box zoomed and scrolled into view, and on each option's page of a choice; the help article on the import; the `## Actualizări` block. On step 3.
