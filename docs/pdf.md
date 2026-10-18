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
either way. PDF/A for the signed sheet waits for the archiving of #487; every other PDF stays
PDF/A-2b. `mergePdfs` is Gotenberg's `/forms/pdfengines/merge` with `flatten=true`: one PDF of
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
| `applySignature(ctx, recordId, slot, signer, signedAt, sign)` | `beginSignature` on the slot's field, certifying with the first signature on the sheet, locking the row's text, the appearance `[name, jobTitle, "semnat electronic", day]`; `sign(toSign)` makes the raw signature; `finishSignature`; answers `{ digestBefore, digestAfter, sheetId, version }` for the evidence                                                                                                                                                                                         |
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
line inside it.

`pnpm --filter @ssm-usor/api signed-sheet:check:local -- --out <folder>`, with `GOTENBERG_URL`
and `SIGNER_URL` set, runs all of it on the local stack with a throwaway certificate authority:
it records trainings for a seeded employee, places, signs, voids and continues, validates every
signature, writes the PDFs to the folder and removes what it made. CI does not run it.

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
validate(pdf: ArrayBuffer): Promise<SignatureValidation[]>;
```

`prepareSheet` first names every field by its tooltip, where LibreOffice puts the title of the
content control it exported, since it names the fields themselves `Widget`, `_2`, `_3`…, and
empties the blank placeholder LibreOffice exports as a field's value. It then turns the named
text fields, the signature cells, into signature fields of the same rectangle. `fillFields` writes values as an incremental update,
each with its appearance drawn in an embedded Liberation Sans, so no viewer needs to redraw
fields and earlier signatures stay valid. Unknown field names are refused.

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
loses it, and the caller begins again. That is why the class runs one instance.

`lockFields`, the row's text fields, become the signature's `/FieldMDP` reference, which is
what validators read. They are not written as a `/Lock` into the field: after the certification
that would itself be a change the document does not permit. A row's signature fields still to
be signed must not be in the list, or they could not be signed.

`validate` trusts no root, the app being its own authority, and reports per signature whether
the signed bytes are intact and the signature verifies, and whether every later change was
form filling or signing that touched no locked field. pyHanko's own default policy wrongly
counts an appearance written before a signed revision as changed after it, so the service
validates without in-place appearance updates, which it never makes.

### Over HTTP

The container answers JSON, every PDF and signature in base64, on port 3301. The same client,
`signerOverHttp` in `packages/contracts/src/signer-http.ts`, serves `apps/pdf` and a local API.

| Route                 | Body                                                                                                           | Answer                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `POST /prepare-sheet` | `pdf`, `signatureFields`                                                                                       | `pdf`                                 |
| `POST /fill`          | `pdf`, `values`                                                                                                | `pdf`                                 |
| `POST /sign/begin`    | `pdf`, `field`, `certificatePem`, `chainPem`, `reason`, `signedAt`, `certify`, `lockFields`, `appearanceLines` | `prepared`, `toSign`, `sessionToken`  |
| `POST /sign/finish`   | `prepared`, `sessionToken`, `signature`                                                                        | `pdf`                                 |
| `POST /validate`      | `pdf`                                                                                                          | `signatures`: `SignatureValidation[]` |
| `GET /health`         |                                                                                                                | `{ "status": "ok" }`                  |

A refusal is `{ "error", "detail" }`: 400 for the request or the PDF (`unknown_fields`,
`already_signed`, `cannot_certify`, `bad_signature`, `prepared_changed`, …), 404 for an unknown
or expired session, 422 for a malformed body. `apps/pdf` rejects every failure with the message
`signer_failed` and logs the reason as one JSON line (`signer_refused`, `signer_unreachable`,
`signer_timeout`, `signer_not_json`). A container that did not start, or answered 5xx, is
tried once more after two seconds; a request still unanswered after 60 seconds is not.

### The container

| Setting         | Value                                | Why                                                                               |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Image           | `python:3.12.15-slim-trixie`, 229 MB | `apps/pdf/signer/Dockerfile`; every Python package pinned in `requirements.txt`   |
| Instance type   | `basic`                              | A quarter of a vCPU: the service starts in about 4 s. On `lite` it took some 40 s |
| `max_instances` | 1                                    | A signature's second phase must find the session its first phase left             |
| `sleepAfter`    | 10 minutes                           | The session's lifetime                                                            |
| Internet        | off                                  | Nothing is fetched: no revocation lists, no timestamps                            |

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

Locally, `pnpm dev:pdf` starts the signer beside Gotenberg, from the same Dockerfile, on port 3301. Set `SIGNER_URL=http://localhost:3301` in `apps/api/.dev.vars` and restart `pnpm dev`.

The service's tests are Python and need Python 3.12 or newer, once:

```sh
pnpm --filter @ssm-usor/pdf setup:signer   # a venv in apps/pdf/signer/.venv
pnpm --filter @ssm-usor/pdf test:signer    # pytest
```

They make a throwaway certificate authority and sheet, and sign, fill and validate it as the
sheet will be. CI does not run them yet. `src/sign.test.ts` covers the forwarding in the
Worker without a container.

## Deployment

The job "Deploy PDF Worker" runs on `main` when `apps/pdf/**` or the interfaces change.
`wrangler deploy` uploads the Worker, builds an image for each container class, Gotenberg's
and the signer's, with the runner's Docker, pushes them to Cloudflare's registry, and rolls the
containers out. The production build job does the same builds as a dry run, so a broken
Dockerfile fails before deployment.

`CLOUDFLARE_API_TOKEN` was created from the "Edit Cloudflare Workers" template
([deployment guide](deployment.md)). If the first deployment is refused for lack of
permission, edit the token and add the account-level permission for Containers, then run the
job again. Nothing else waits for this job.
