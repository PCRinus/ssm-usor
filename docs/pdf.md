# PDF Worker

Status: deployed by CI; the API calls it while issuing a document, and to print one  
Audience: engineering

[ADR 005](architecture/adr-005-document-generation.md) makes the PDF a static copy produced
when a revision is issued. Turning a Word file into a PDF with its layout needs a layout
engine, in practice headless LibreOffice, which cannot run in a Worker. `apps/pdf` owns a
[Cloudflare Container](https://developers.cloudflare.com/containers/) that runs
[Gotenberg](https://gotenberg.dev), and offers one method over a service binding, as
`apps/mail` does for email. It has no routes and no `workers.dev` address. A second container
runs the [signer](#signer) of [ADR 023](architecture/adr-023-advanced-electronic-signature.md),
and a third the [extractor](#extractor) of [ADR 030](architecture/adr-030-import-from-documents.md),
behind the same entrypoint.

It is a Worker of its own so that Docker, the image registry and the container's lifecycle
stay out of the API's deployment: a problem here cannot block an API release.

## The interface

`PdfService` in `packages/contracts/src/pdf.ts`:

```ts
convertDocx(docx: ArrayBuffer): Promise<ArrayBuffer>;
convertDocuments(files: ArrayBuffer[]): Promise<ArrayBuffer>;
convertForm(docx: ArrayBuffer): Promise<ArrayBuffer>;
mergePdfs(files: ArrayBuffer[]): Promise<ArrayBuffer>;
```

`convertDocuments` is one PDF of several Word files in the order given, for a document and
the instruction modules it annexes ([ADR 012](architecture/adr-012-own-instructions.md)):
one request to Gotenberg's LibreOffice route with `merge=true`, the files named `0001.docx`,
`0002.docx` and so on, since Gotenberg merges in the alphanumeric order of the names. For
either set's own instructions, 3.2 or 2.1, the files are the common part, then per annex its title page and the
module's file: `[common part, title page 1, module 1, title page 2, module 2, …]`, 1 + 2n
files, which four digits number up to 9,999.

The result is PDF/A-2b: fonts embedded, nothing fetched when it is opened, the flavour meant
for a copy that is kept as evidence and later signed. It rejects with the message
`pdf_conversion_failed` when Gotenberg refuses the file, cannot be reached, or answers
something that is not a PDF; the reason is logged as one JSON line (`pdf_conversion_refused`,
`pdf_conversion_unreachable`, `pdf_conversion_not_a_pdf`). A failure that is not about the
document, such as a container that did not start, is tried once more after two seconds.

LibreOffice converts almost anything it is handed, a text file included, so the caller checks
that the bytes are a `.docx` before asking.

`convertForm` is the [signed sheet](#the-signed-sheet)'s conversion: the same route, without
PDF/A. Gotenberg exports form fields by default (`exportFormFields`), and LibreOffice keeps them
under PDF/A-2b too, but a PDF/A export is tagged, and the structure tree references every field's
widget, so pyHanko's analysis of what changed after a signature counts each later fill as an
unexplained change to the signed revision, and every signature but the newest stops validating.
Without PDF/A the PDF is untagged and every fill is a permitted change. The fonts are embedded
either way. The signed sheet is therefore never PDF/A, and cannot become PDF/A later either:
converting it rewrites the file, and every signature on it stops verifying. The archiving of #487
keeps it as it is, beside its metadata; every other PDF stays PDF/A-2b. `mergePdfs` is Gotenberg's `/forms/pdfengines/merge` with `flatten=true`: one PDF of
several, in the order given, their fields drawn into the pages.

## How the API uses it

`apps/api/src/lib/pdf.ts` picks the converter:

| Where                       | Converter                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed                    | The `PDF` service binding, switched on by the variable `PDF_CONVERSION=service`, which only the deployment job sets                                                        |
| Flow tests, local by choice | `GOTENBERG_URL`, a Gotenberg started by `pnpm dev:pdf` (see below), then `GOTENBERG_URL=http://localhost:3300` in `apps/api/.dev.vars` or in the shell that runs the flows |
| `pnpm dev` with neither     | None: documents are issued without a PDF, and printing answers `503`                                                                                                       |

The variable exists because `wrangler dev` creates the binding too, with nothing behind it:
`apps/pdf` is not part of `pnpm dev`.

Issuing reads the draft's Word file and, for either set's own instructions (`own_instructions`
or `fire_own_instructions`, no other type), the files of the module versions its snapshot
annexes (`annexes[].versionId`, read from `instruction_module_versions` and the
`instruction-modules` bucket), merges that set's annex title page before each from the same
snapshot ([document engine](document-engine.md#instruction-modules)), converts them into one PDF, writes it beside the file
(`…/<revision>.pdf`) while the revision is still a draft, which is what lets the storage
policies accept it, and then calls `issue_document_revision` with both hashes. From then on
neither file can be written. When the conversion fails nothing is issued: `503` with the
reason `pdf_unavailable`, and the person tries again. A PDF left behind by an issuing that
failed afterwards is overwritten by the next one and removed with the draft.

Printing goes through a PDF too, so that paper matches the file. An issued revision that has
a PDF prints that PDF. Anything else, a draft or what the editor shows with its unsaved edits,
is sent as Word bytes to `POST /documents/{documentId}/print`, which converts them the same
way, the annexes of the newest revision included, and stores nothing. The app opens the result in a hidden frame and calls the browser's
print dialog on it; a browser without a PDF viewer gets the file as a download instead.

The individual training sheets ([document engine](document-engine.md#sheets)) are the one PDF
made outside the documents: `GET /clients/{clientId}/employees/{employeeId}/training-sheet`
merges the sheet's template, converts it with the same converter and answers the PDF, storing
nothing, until signing starts and the sheet is stored (below). Without a converter it answers
`503 pdf_unavailable`, so opening a sheet locally needs `pnpm dev:pdf` and `GOTENBERG_URL`.

## The signed sheet

Once signing starts, an employee's sheet of a domain is a stored PDF form
([ADR 023](architecture/adr-023-advanced-electronic-signature.md)), made, filled and signed by
`apps/api/src/modules/signed-sheets`, whose functions the signing flow calls:

| Function                                                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureSignedSheet(ctx, employeeId, domain)`                  | The current sheet, the highest `sequence` while `rows_used < row_capacity`; else a new one: the template merged with `form.on` ([fields](document-engine.md#the-signed-sheet)), `convertForm`, `prepareSheet` with every signature field, stored, a `signed_sheets` row at version 1. An employee's first sheet prints the trainings recorded from paper (`source` paper) as text in the rows they take, with `signed_sheet_rows` and no fields, and runs on to continuation sheets when they fill a table |
| `placeRecord(ctx, recordId)`                                  | The record's row: `h1` or `h2` for the hiring trainings, the workplace one filling the admission too, else the next free `p` (or `s`, the occupational safety sheet's supplementary table) row of the current sheet, on a continuation sheet when it is full. Claims the row, then `fillFields` with what the paper sheet prints. A record already placed keeps its row, filled again while nobody has signed it since                                                                                     |
| `voidRow(ctx, recordId)`                                      | Writes _anulat_ in the row's note and sets `voided_at`; the signatures stay, and the record takes another row when placed again                                                                                                                                                                                                                                                                                                                                                                            |
| `applySignature(ctx, recordId, slot, signer, signedAt, sign)` | `beginSignature` on the slot's field, certifying with the first signature on the sheet, locking the row's text, the appearance `[name, "semnat electronic", day]`, the job title left to the row or the block since a periodic row's box is narrow; `sign(toSign)` makes the raw signature; `finishSignature`; answers `{ digestBefore, digestAfter, sheetId, version }` for the evidence                                                                                                                  |
| `currentSheetPdf(ctx, employeeId, domain)`                    | The stored sheet as it is, several merged with `mergePdfs`, or null before signing                                                                                                                                                                                                                                                                                                                                                                                                                         |

`signedSheetContext(c)` gives them the secret key's database client and documents bucket, the
converter and the signer: the caller decides who may act before calling. Every version of a
sheet is a file of its own, `signed-sheets/{clientId}/{employeeId}/{domain}-{sequence}/v{version}-{nonce}.pdf`
in the `documents` bucket, and the row's `storage_path` and `digest` point at the current one. A
write reads the current version, checks its bytes against the digest, makes the next one and
moves the row on only where `version` is still the one it read; when another write got there
first, its file is removed and it tries once more on the newer bytes, `sign` included, then
answers `409 sheet_busy`. A Postgres advisory lock was the alternative and does not fit: a write
spans calls to the signer, and PostgREST holds no transaction between requests. The earlier
versions stay, so the evidence's `digest_before` names a file that still exists.

The text of a cell is broken into lines by the API (`wrapToBox`) in the field's proportions,
and the signer sets a text too long for its field in a smaller size, never below what keeps every
line inside it. A hiring training's material field is drawn as tall as the text the sheet is
drawn up with ([document engine](document-engine.md#the-signed-sheet)).

Apple's PDF viewer (Preview, Safari, every iPhone) ignores a text field's appearance and draws
the value itself, from the field's `/DA` font size and its multiline flag: top-aligned in a
multiline field, where it drops every line that does not fit whole, a single short line
included. LibreOffice exports every cell as multiline at the template's size, so on an iPhone the
short cells showed half a line and a long one lost its last lines. A fill therefore writes the
size it drew into `/DA`, sets the multiline flag only for a value with several lines, and sizes a
multiline value so that Apple's layout fits it too: about 1.2 times the size plus 1.2 pt a line,
and 3.5 pt for the field, measured with PDFKit on the real sheet. The appearance's lines are
spaced with that same leading, so every viewer shows a multiline value filling its field alike. Both keys are among those a
form fill may change after a certification, and only the filled fields are touched, so earlier
signatures stay intact and permitted. A later fill of the same unsigned row starts from the size
the previous one left.

`pnpm --filter @ssm-usor/api signed-sheet:check:local -- --out <folder>`, with `GOTENBERG_URL`
and `SIGNER_URL` set, runs all of it on the local stack with a throwaway certificate authority:
it records trainings for a seeded employee, places, signs, voids and continues, validates every
signature, writes the PDFs to the folder and removes what it made. CI does not run it.

## The test sheet

The test sheet of a pass in the portal ([ADR 024](architecture/adr-024-knowledge-tests.md)) is
the second document signed on the same pipeline, made and signed by
`apps/api/src/modules/test-sheets` ([API](api.md#the-test-sheet)): the template merged
([document engine](document-engine.md#the-test-sheet)), `convertForm`, `prepareSheet` with
`test_sig_trainee` and `test_sig_examiner`, `fillFields` with the examiner's name and function,
and stored at `test-sheets/{clientId}/{employeeId}/{resultId}/v1-{nonce}.pdf` in the documents
bucket, beside the signed sheets and the signing agreements. Every later write is the next
version, a file of its own, `v{version}-{nonce}.pdf`, made from the current bytes after checking
them against the row's digest and moved on by compare-and-set on `version`, as a signed sheet's
writes are: a refill of the examiner's fields, and each of the two signatures, the first
certifying the file (DocMDP `/P 2`), the examiner's locking the examiner's fields. The sheet is
never PDF/A, for the signed sheet's reason, and never drawn up again.

`pnpm --filter @ssm-usor/api test-sheet:check:local -- --out <folder>`, with `GOTENBERG_URL` and
`SIGNER_URL` set, runs it all on the local stack with a throwaway certificate authority: a seeded
employee is trained and passes the hiring test in the portal, the trainee signs the sheet and the
training record in one session, the member changes the examiner, back again, and signs the sheet
and the record in one session, a further change is refused, and both signatures are validated. It
writes the signed sheet to the folder and removes what it made. CI does not run it.

## The container

| Setting         | Value                        | Why                                                                                    |
| --------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| Image           | `gotenberg/gotenberg:8.37.0` | Pinned in `apps/pdf/Dockerfile`: a LibreOffice upgrade can move a page break           |
| Instance type   | `standard-1`                 | Half a vCPU, 4 GiB. LibreOffice wants more than the 1 GiB of `basic`                   |
| `max_instances` | 1                            | Issuing is rare; a second request waits its turn inside Gotenberg                      |
| `sleepAfter`    | 10 minutes                   | Billed while awake. A client's set is issued in a burst, then nothing for days         |
| Internet        | off                          | It converts what it is handed                                                          |
| Routes          | LibreOffice only             | Chromium, webhooks and metrics are switched off; LibreOffice starts with the container |

Fonts: the documents are set in Arial, which the image does not have and cannot ship.
LibreOffice substitutes Liberation Sans, built to Arial's metrics, which is also what the
in-app editor draws with, so pages break in the same places in all three.

Measured on 19 September 2026 with the container limited to half a CPU: a decision converts
in 0.3 s, the 31 pages of the employer briefing in 1.8 s, the general training material with
its 112 images in 6 s, the 75 pages of the own instructions in 6 s. Through `wrangler dev` and
the real Container class, a cold start added about 2.5 s.

Cost: Workers Paid includes 25 GiB-hours of container memory a month, about six hours awake
at this size. At ten minutes awake per burst that is some 35 bursts a month before anything is
billed, and an hour beyond it costs about four cents.

## Running it locally

`pnpm dev` runs the API under `wrangler dev`, which creates the `PDF` binding with nothing
behind it: `apps/pdf` is not part of `pnpm dev`, on purpose, so that the root command needs
neither Docker nor a 1.7 GB image. Service bindings under `wrangler dev` only ever reach other
local dev sessions, never the deployed Workers, even when the API points at the hosted
Supabase. So a document issued locally has no PDF, and its contract cannot be emailed, until
a converter is configured.

The converter is one command away. `compose.yaml` at the root builds the same image as the
deployed container, from `apps/pdf/Dockerfile`, and publishes it on port 3300:

```sh
pnpm dev:pdf      # docker compose up, waits until Gotenberg answers /health
pnpm stop:pdf     # docker compose down
```

Then set `GOTENBERG_URL=http://localhost:3300` in `apps/api/.dev.vars` (the example file has
the line, commented out) and restart `pnpm dev`. From then on issuing makes the PDF and the
send button on a contract is enabled. A revision issued without a PDF stays without one; issue
a new draft.

`pnpm --filter @ssm-usor/pdf start` is the other way: it runs `wrangler dev` for the Worker
itself, which builds the image and starts the container on the first conversion, for working
on `apps/pdf`. Tests (`src/convert.test.ts`) cover the request and the failure handling
without a container.

## Signer

[ADR 023](architecture/adr-023-advanced-electronic-signature.md) signs the individual training
sheet as a PDF form that collects PAdES signatures row by row. The second container class,
`Signer`, runs a small Python service around [pyHanko](https://pyhanko.readthedocs.io)
(`apps/pdf/signer`), and the `Pdf` entrypoint offers it as `SignerService` in
`packages/contracts/src/signer.ts`:

```ts
prepareSheet(pdf: ArrayBuffer, signatureFields: string[]): Promise<ArrayBuffer>;
fillFields(pdf: ArrayBuffer, values: Record<string, string>): Promise<ArrayBuffer>;
beginSignature(pdf: ArrayBuffer, options: BeginSignatureOptions): Promise<BeginSignatureResult>;
finishSignature(prepared: ArrayBuffer, sessionToken: string, signature: ArrayBuffer): Promise<ArrayBuffer>;
validate(pdf: ArrayBuffer, trustRootsPem?: string[]): Promise<SignatureValidation[]>;
stampPages(pdf: ArrayBuffer, text: string): Promise<ArrayBuffer>;
```

`prepareSheet` first names every field by its tooltip, where LibreOffice puts the title of the
content control it exported, since it names the fields themselves `Widget`, `_2`, `_3`…, and
empties the blank placeholder LibreOffice exports as a field's value. It then turns the named
text fields, the signature cells, into signature fields of the same rectangle. `fillFields` writes values as an incremental update,
each with its appearance drawn in an embedded Liberation Sans, so no viewer needs to redraw
fields and earlier signatures stay valid. Unknown field names are refused, and so is a field that
a signature locks (below), with `409 locked_field` and the locked names as the detail: the
service reads every signature's `/Reference` for a `/FieldMDP` and applies its action, `Include`,
`Exclude` or `All`, so that a fill which would break a signature never reaches the file.

`stampPages` draws a line of text in small grey letters in the top margin of every page, in the
same embedded font, as an incremental update that adds page content and touches no field or
signature. It is meant for a copy whose signatures no longer count, such as the flattened merge
of several sheets (`mergePdfs`): there the line says what the copy is.

### The two phases

The private key never leaves the API, so a signature takes two calls.

1. `beginSignature` writes, as an incremental update, the signature dictionary with a
   placeholder for its contents, the visible text (`appearanceLines`), the signing time
   (`signedAt`, the dictionary's `/M`) and, on the first signature (`certify: true`), the
   certification that permits form filling and signing only (DocMDP level 2). It hashes the
   signed byte range with SHA-256 and returns the prepared PDF, `toSign` and a session token.
   `toSign` is the DER of the CMS signed attributes, which hold that digest (content type,
   message digest and the signing certificate; no signing-time attribute, which PAdES leaves
   to `/M`).
2. The API signs `toSign` as it is, with WebCrypto: ECDSA P-256 with SHA-256, which answers
   raw r||s, 64 bytes.
3. `finishSignature` turns r||s into the DER that CMS expects, checks it against the
   certificate, checks that `prepared` is the PDF the first phase returned, wraps it with the
   certificate and its chain, and writes it into the placeholder.

A session is kept in memory for ten minutes and finishes once; a restart of the container
loses it, and then the item being signed fails and the person signs it again, with a new code.
That is why the class runs one instance.

`beginSignature` refuses with `bad_certificate` a certificate that is not for an ECDSA P-256 key,
whose key usage lacks digitalSignature, or that no certificate of `chainPem` issued, and with
`bad_lock_fields` a `lockFields` entry that names a signature field.

The routes that call pyHanko run in Starlette's threadpool, each with an event loop of its own
for pyHanko's coroutines, so that one long validation does not hold the others, and the session
store is locked: two signatures begun at once both get a session.

`lockFields`, the row's text fields, become the signature's `/FieldMDP` reference, which is
what validators read. They are not written as a `/Lock` into the field: after the certification
that would itself be a change the document does not permit. A row's signature fields still to
be signed must not be in the list, or they could not be signed.

`validate` reports per signature, as `SignatureValidation`:

| Field                    | Meaning                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `intact`                 | The signed bytes are unchanged and the signature verifies against its certificate                                                        |
| `modificationsPermitted` | Every later change was form filling or signing that touched no locked field                                                              |
| `certified`              | The signature certified the document                                                                                                     |
| `trusted`                | The certificate chains to one of `trustRootsPem`, the app's CA in practice; false when none is given                                     |
| `certificateSerial`      | The certificate's serial in lowercase hex, as `@peculiar/x509` gives it, to compare with the evidence row                                |
| `issuer`                 | The issuer's name as RFC 4514 writes it, `CN=SSM Ușor Signing CA`                                                                        |
| `subjectSerialNumber`    | The subject's serialNumber attribute (2.5.4.5), the account the certificate was issued to; null without one                              |
| `coverage`               | `entire` when the signature covers the whole file, as the newest does while nothing follows it; `partial` when a later update follows it |

The chain is checked at the signing time the signature states (`/M`), as Adobe Acrobat does by
default: until the timestamps of #486, a certificate that has expired since would otherwise fail
a signature that was sound when it was made. Revocation is not checked; the app publishes no
lists. A chain to another authority, even one whose name copies ours, is not `trusted`, and its
issuer and serial show it.

pyHanko's default diff policy refuses a valid sheet: its in-place appearance check
(`get_last_change(ref) == old_rev` in `pyhanko/sign/diff_analysis/rules/form_field_rules.py`)
counts an appearance written before a signed revision as changed after it, so every signature
that locks a row reads as followed by a change to a locked field. The service validates with its
own policy, the default without in-place appearance updates, which it never makes; the test
`test_pyhanko_default_policy_still_refuses_the_valid_sheet` fails on the day pyHanko fixes it.
The bug should be reported upstream. Until it is fixed, anyone checking a signed sheet outside
the app, a court's expert or an inspector, should use Adobe Acrobat or the EU's DSS validator,
not pyHanko's command line with its defaults.

### Over HTTP

The container answers JSON, every PDF and signature in base64, on port 3301. The same client,
`signerOverHttp` in `packages/contracts/src/signer-http.ts`, serves `apps/pdf` and a local API.

| Route                 | Body                                                                                                           | Answer                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `POST /prepare-sheet` | `pdf`, `signatureFields`                                                                                       | `pdf`                                 |
| `POST /fill`          | `pdf`, `values`                                                                                                | `pdf`                                 |
| `POST /sign/begin`    | `pdf`, `field`, `certificatePem`, `chainPem`, `reason`, `signedAt`, `certify`, `lockFields`, `appearanceLines` | `prepared`, `toSign`, `sessionToken`  |
| `POST /sign/finish`   | `prepared`, `sessionToken`, `signature`                                                                        | `pdf`                                 |
| `POST /validate`      | `pdf`, `trustRootsPem` (optional)                                                                              | `signatures`: `SignatureValidation[]` |
| `POST /stamp`         | `pdf`, `text`                                                                                                  | `pdf`                                 |
| `GET /health`         |                                                                                                                | `{ "status": "ok" }`                  |

A refusal is `{ "error", "detail" }`: 400 for the request or the PDF (`unknown_fields`,
`already_signed`, `cannot_certify`, `bad_certificate`, `bad_lock_fields`, `bad_signature`,
`prepared_changed`, …), 404 for an unknown or expired session, 409 `locked_field` for a fill of a
locked field, 422 for a malformed body. `apps/pdf` rejects a refusal with the message
`signer_failed:<error>`, `signer_failed:locked_field` for instance, which the service binding
carries to the API, and every other failure, an unreachable container, a timeout, a 5xx or an
answer that is not the service's JSON, with `signer_failed` alone; `signerRefusalCode` in the
contracts reads the code back, and `signerAnswerError` makes the same error from an answer, for a
signer reached by URL. The reason is logged as one JSON line (`signer_refused`,
`signer_unreachable`, `signer_timeout`, `signer_not_json`). A container that did not start, or
answered 5xx, is tried once more after two seconds; a request still unanswered after 60 seconds
is not, since the service may still be working on it.

### The container

| Setting         | Value                                | Why                                                                                                               |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Image           | `python:3.12.15-slim-trixie`, 256 MB | `apps/pdf/signer/Dockerfile`; the base pinned by digest, the font by Debian version, every Python package by hash |
| Instance type   | `basic`                              | A quarter of a vCPU: the service starts in about 4 s. On `lite` it took some 40 s                                 |
| `max_instances` | 1                                    | A signature's second phase must find the session its first phase left                                             |
| `sleepAfter`    | 10 minutes                           | The session's lifetime                                                                                            |
| Internet        | off                                  | Nothing is fetched: no revocation lists, no timestamps                                                            |

`requirements.txt` and `requirements-dev.txt` are generated from the `.in` files beside them,
with pip-tools in the image's Python:

```sh
docker run --rm -v "$PWD/apps/pdf/signer:/work" -w /work python:3.12.15-slim-trixie sh -c \
  'pip install -q pip-tools \
   && pip-compile -q --generate-hashes --allow-unsafe -o requirements.txt requirements.in \
   && pip-compile -q --generate-hashes --allow-unsafe -o requirements-dev.txt requirements-dev.in'
```

The image installs them with `--require-hashes`, and so does `setup:signer`. pip-compile keeps the
pins already in the files; `--upgrade-package <name>` moves one.

Liberation Sans comes from Debian and is rescaled to 1,000 units per em when the image is
built: pyHanko writes a subset's widths in the font's own units, and PDF reads them as
thousandths, so Liberation's 2,048 would spread every line out.

Measured on 18 October 2026 in Docker on a quarter of a CPU: ready in 3.6 s, then a
preparation, a fill, both phases of a signature and a validation of a small sheet take well
under a second together, in about 85 MB of memory.

### How the API reaches it

`apps/api/src/lib/signer.ts` picks it as `pdf.ts` picks the converter: `createSigner` returns
the `SIGNER` binding (the same `Pdf` entrypoint) where `PDF_CONVERSION=service`, else the
signer at `SIGNER_URL`, else nothing, and `requireSigner` answers `503` with the reason
`signer_unavailable`. Any failure of a method answers the same.

Locally, `pnpm dev:pdf` starts the signer beside Gotenberg, from the same Dockerfile, on port 3301. Set `SIGNER_URL=http://localhost:3301` in `apps/api/.dev.vars` and restart `pnpm dev`. Both
containers publish their ports on 127.0.0.1 only: they take any document they are handed,
without authentication.

The service's tests are Python and need Python 3.12 or newer, once:

```sh
pnpm --filter @ssm-usor/pdf setup:signer   # a venv in apps/pdf/signer/.venv
pnpm --filter @ssm-usor/pdf test:signer    # pytest
```

They make a throwaway certificate authority and sheet, and sign, fill and validate it as the
sheet will be, and do the same on `tests/fixtures/sheet-ssm-form.pdf`, the occupational safety
sheet as LibreOffice exports it: the template merged with the sample employee of
`apps/api/src/modules/signed-sheets/form.fixture.ts` and converted through Gotenberg with
`convertForm`'s request. Make it again the same way when the template's fields change. The pull
request workflow runs ruff and the tests whenever `apps/pdf` or the signer's contracts change.
`src/sign.test.ts` covers the forwarding in the Worker without a container.

## Extractor

An import ([ADR 030](architecture/adr-030-import-from-documents.md)) reads a client's files as
text, and some of them need a tool to become text or an image first: a `.doc` becomes a `.docx`,
whose XML the API reads with its tables; a PDF gives its text page by page, and a scanned page an
image for the model; a HEIC photograph becomes a JPEG, which the model and the browser read. The
extractor is a container of its own, `apps/pdf/extractor`, with LibreOffice, poppler and
ImageMagick behind a small Node server, one file per request.

It is not a route added to Gotenberg. Gotenberg's pinned LibreOffice decides where the app's own
documents break pages, so its image changes only for that, and its routes only make PDFs. The
extractor's LibreOffice only reads: Debian's version, moved with the base image.

### The interface

`ExtractorService` in `packages/contracts/src/extractor.ts`, offered by the `Pdf` entrypoint:

```ts
docToDocx(doc: ArrayBuffer): Promise<ArrayBuffer>;
pdfText(pdf: ArrayBuffer): Promise<PdfText>; // { pageCount, pages: [{ number, text, isScan }] }
pdfPageImage(pdf: ArrayBuffer, page: number): Promise<ArrayBuffer>;
heicToJpeg(image: ArrayBuffer): Promise<ArrayBuffer>;
```

A method rejects with `extraction_failed:<reason>` when the file is refused, and with
`extraction_failed` alone for anything else: an unreachable container, a 5xx, a timeout, or an
answer that is not what the route makes. `extractionRefusalOf` in the contracts reads the reason
back. A refusal is about the file, so trying again does not help:

| Reason               | When                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `too_large`          | Over 20 MiB, the limit of a client file, checked before the file is sent; or a PDF over 300 pages, or whose text passes 8 MiB |
| `unsupported`        | Not a type the route takes, by its first bytes                                                                                |
| `corrupt`            | The tool could not read it                                                                                                    |
| `password_protected` | A PDF that opens only with a password, or a Word file encrypted with one                                                      |
| `timeout`            | The tool did not finish within its limit: two minutes for LibreOffice and `pdftotext`, one for the rest                       |
| `page_out_of_range`  | A page below 1 or past the PDF's last                                                                                         |

The forwarding is `convertDocx`'s: a container that did not start, or answered 5xx, is tried once
more after two seconds, on either instance, and a request unanswered after three minutes is
aborted and not tried again. The reason is logged
as one JSON line (`extraction_refused`, `extraction_unreachable`, `extraction_timeout`), and the
container logs its own (`extractor_refused`, `extractor_busy`, `extractor_abandoned`,
`extractor_failed`), without the file's content.
`src/extract.test.ts` covers the forwarding, `extractor/files.test.ts` the server's own checks and
`extractor/processes.test.ts` its limits on the tools, all without a container.

### Over HTTP

The file is the request's body, `application/octet-stream`; the result is the answer's body. Port 3302.

| Route                         | Takes                                                         | Answers                                                                                |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /doc-to-docx`           | Word 97–2003, or RTF, HTML or Office Open XML saved as `.doc` | The `.docx`, from LibreOffice                                                          |
| `POST /pdf-text`              | A PDF                                                         | `{ "pageCount", "pages": [{ "number", "text", "isScan" }] }`, as JSON                  |
| `POST /pdf-page-image?page=N` | A PDF                                                         | Page N as a JPEG at 150 dpi, less for a page larger than 2,500 pixels a side           |
| `POST /heic-to-jpeg`          | A HEIC, JPEG or PNG                                           | A JPEG turned upright, at most 2,500 pixels a side, transparency on white, no metadata |
| `GET /health`                 |                                                               | `{ "status": "ok" }`                                                                   |

A refusal is `{ "error": "<reason>", "detail" }`, with 413 for `too_large`, 415 for
`unsupported`, 400 for `page_out_of_range` and 422 for the others; anything else that goes wrong
is a 500. A request that finds too many files waiting is turned away with 503 and
`{ "error": "busy" }`, which the Worker tries once more like any 5xx.

`pdf-text` runs `pdftotext -layout` once and splits its pages at the form feeds. `isScan` marks a
page with fewer than 100 characters other than whitespace, since the layout pads lines with
spaces. A PDF with only an owner password, which forbids copying, is read: poppler does not
enforce the permission. ImageMagick runs with its own limits on memory, disk, time and size
(20,000 pixels a side), below Debian's policy and set by the server, so an image that unpacks to
more is refused as `too_large` whatever a later base image allows. LibreOffice reports a Word
file that needs a password as one it cannot load, so the server tells the two apart from the compound file itself: an encrypted `.docx`
package, or a `.doc` whose File Information Block says it is encrypted or obfuscated. Stripping
the metadata of a photograph removes its location too.

### The container

| Setting         | Value                                    | Why                                                                                         |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Image           | `node:24.22.1-trixie-slim`, about 900 MB | `apps/pdf/extractor/Dockerfile`, the base pinned by digest; LibreOffice is most of the size |
| Instance type   | `standard-1`                             | LibreOffice, as for Gotenberg                                                               |
| `max_instances` | 2                                        | Each request goes to one at random, so a slow file holds up half the files read at once     |
| `sleepAfter`    | 5 minutes                                | An import's files arrive in a burst, one queue message each                                 |
| Internet        | off                                      | It reads what it is handed                                                                  |

The server is TypeScript run by Node's type stripping, with no dependencies and no build step.
LibreOffice runs one conversion at a time, since two cannot share a profile, with two more
waiting at most; poppler and ImageMagick run two at a time, with six waiting, since more on half
a CPU would only turn each into a timeout. The profile is made when the image is built, so a cold
start does not wait for it. When the Worker stops waiting for an answer, it aborts the request,
and the server drops the file from the queue or kills the tool reading it. `tini` is the container's
first process, so that what LibreOffice leaves behind is reaped.

Measured on 28 October 2026 in Docker on half a CPU (Apple silicon): ready in about a second; a
`.doc` converts in 2.3 s the first time and 0.4 s after, a two-page PDF's text takes 0.1 s, a
page image 0.15 s, and a 12-megapixel HEIC 1.1 s, in under 100 MB of memory.

### Running it locally

Not part of `pnpm dev` or `pnpm dev:pdf`, since only an import needs it:

```sh
pnpm dev:extractor   # docker compose up, waits until the extractor answers /health
pnpm stop:pdf        # stops it with the others
```

Then set `EXTRACTOR_URL=http://localhost:3302` in `apps/api/.dev.vars` and restart `pnpm dev`.
`createExtractor` in `apps/api/src/lib/extractor.ts` picks the `EXTRACTOR` binding (the same `Pdf`
entrypoint) where `PDF_CONVERSION=service`, else the extractor at `EXTRACTOR_URL`, else nothing.
The port is published on 127.0.0.1 only, as the others.

## Deployment

The job "Deploy PDF Worker" runs on `main` when `apps/pdf/**` or the interfaces change.
`wrangler deploy` uploads the Worker, builds an image for each container class, Gotenberg's,
the signer's and the extractor's, with the runner's Docker, pushes them to Cloudflare's registry, and rolls the
containers out. The production build job does the same builds as a dry run, so a broken
Dockerfile fails before deployment.

`CLOUDFLARE_API_TOKEN` was created from the "Edit Cloudflare Workers" template
([deployment guide](deployment.md)). If the first deployment is refused for lack of
permission, edit the token and add the account-level permission for Containers, then run the
job again. Nothing else waits for this job.
