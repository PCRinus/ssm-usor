# PDF Worker

Status: deployed by CI; the API calls it while issuing a document, and to print one  
Audience: engineering

[ADR 005](architecture/adr-005-document-generation.md) makes the PDF a static copy produced
when a revision is issued. Turning a Word file into a PDF with its layout needs a layout
engine, in practice headless LibreOffice, which cannot run in a Worker. `apps/pdf` owns a
[Cloudflare Container](https://developers.cloudflare.com/containers/) that runs
[Gotenberg](https://gotenberg.dev), and offers one method over a service binding, as
`apps/mail` does for email. It has no routes and no `workers.dev` address.

It is a Worker of its own so that Docker, the image registry and the container's lifecycle
stay out of the API's deployment: a problem here cannot block an API release.

## The interface

`PdfService` in `packages/contracts/src/pdf.ts`:

```ts
convertDocx(docx: ArrayBuffer): Promise<ArrayBuffer>;
```

The result is PDF/A-2b: fonts embedded, nothing fetched when it is opened, the flavour meant
for a copy that is kept as evidence and later signed. It rejects with the message
`pdf_conversion_failed` when Gotenberg refuses the file, cannot be reached, or answers
something that is not a PDF; the reason is logged as one JSON line (`pdf_conversion_refused`,
`pdf_conversion_unreachable`, `pdf_conversion_not_a_pdf`). A failure that is not about the
document, such as a container that did not start, is tried once more after two seconds.

LibreOffice converts almost anything it is handed, a text file included, so the caller checks
that the bytes are a `.docx` before asking.

## How the API uses it

`apps/api/src/lib/pdf.ts` picks the converter:

| Where                       | Converter                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed                    | The `PDF` service binding, switched on by the variable `PDF_CONVERSION=service`, which only the deployment job sets                                                        |
| Flow tests, local by choice | `GOTENBERG_URL`, a Gotenberg started by `pnpm dev:pdf` (see below), then `GOTENBERG_URL=http://localhost:3300` in `apps/api/.dev.vars` or in the shell that runs the flows |
| `pnpm dev` with neither     | None: documents are issued without a PDF, and printing answers `503`                                                                                                       |

The variable exists because `wrangler dev` creates the binding too, with nothing behind it:
`apps/pdf` is not part of `pnpm dev`.

Issuing reads the draft's Word file, converts those bytes, writes the PDF beside the file
(`…/<revision>.pdf`) while the revision is still a draft, which is what lets the storage
policies accept it, and then calls `issue_document_revision` with both hashes. From then on
neither file can be written. When the conversion fails nothing is issued: `503` with the
reason `pdf_unavailable`, and the person tries again. A PDF left behind by an issuing that
failed afterwards is overwritten by the next one and removed with the draft.

Printing goes through a PDF too, so that paper matches the file. An issued revision that has
a PDF prints that PDF. Anything else, a draft or what the editor shows with its unsaved edits,
is sent as Word bytes to `POST /documents/{documentId}/print`, which converts them the same
way and stores nothing. The app opens the result in a hidden frame and calls the browser's
print dialog on it; a browser without a PDF viewer gets the file as a download instead.

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

## Deployment

The job "Deploy PDF Worker" runs on `main` when `apps/pdf/**` or the interface changes.
`wrangler deploy` uploads the Worker, builds the image from the Dockerfile with the runner's
Docker, pushes it to Cloudflare's registry, and rolls the container out. The production build
job does the same build as a dry run, so a broken Dockerfile fails before deployment.

`CLOUDFLARE_API_TOKEN` was created from the "Edit Cloudflare Workers" template
([deployment guide](deployment.md)). If the first deployment is refused for lack of
permission, edit the token and add the account-level permission for Containers, then run the
job again. Nothing else waits for this job.
