# ADR 005: Generating a Client's SSM Documentation

- Status: accepted
- Date: 2026-09-18

## Context

The product scope names the document studio as the wedge: a provider should produce a client's documentation without moving files between Word, PDF tools, and email. Until now the app held organizations, clients, and employees, and produced nothing.

Two real documentation sets from one provider, for a gelato bar and for an installations contractor, were compared file by file. Both hold the same 23 Word files, 20 of them in the legacy `.doc` format, issued on one date when the contract starts. They fall into three groups:

- Files that differ only by names and dates: the covers, the four decisions, the tests, the event registers, the control report form, the internal control regulation, and the employer briefing (17,000 words, one date and two names apart).
- Files assembled from the client's job titles and activities: the workplace instructions with their activity modules, the training themes, and the protective equipment list.
- The risk assessment and the prevention plan, whose risk levels are computed per job.

Two files sit between groups. The first decision also states the client's training schedule: the duration of periodic training, its frequency per staff category, the months, and the days of the month. The general training material is shared text that ends with a chapter of the client's own risks, taken from the risk assessment, and gains a chapter for some industries, such as construction sites.

The comparison also showed the fault the product exists to remove. The protective equipment list was identical in both sets, down to the other client's name and job titles; one company name was spelled five ways; fields in the company description were left blank.

The provider who supplied the files will be the app's first main user and allows their wording to become the built-in template set for every provider. The layout of a file may be simplified where a tool cannot handle it; the wording and the legal references are what matter.

## Decision

### The Word file is the document

A document is generated from a Word template and from then on the `.docx` file is the source of truth. The app scaffolds; the user completes and corrects. No structured document model of our own sits behind the file, which is what lets an off-the-shelf editor open it and lets the customer keep it.

So nothing refreshes by itself. When the client's data changes, the user corrects the file or regenerates the document, which makes a fresh draft from the template without the manual edits and leaves the earlier revision beside it. Each generated file is stored with a JSON snapshot of the data merged into it, so the app can say that the workplace manager has changed since a document was generated, and so an issued document records what it was built from. Refreshing values inside an edited file, through Word content controls, is left to a later issue.

### One documentation set per client, in revisions

Each client has one set, and each document type appears in it once: "Decizia nr. 1", "Tematica de instruire". Documents belong to the client, not to a workplace; both sample sets are issued that way, including for a client with two locations. Reissuing after a legislative change or a renewal creates new revisions of the same documents, never a second set.

A revision is a **draft** or **issued**. A draft can be edited, regenerated, and deleted. Issuing locks the revision, stores the file's hash with who issued it and when, and cannot be undone; a correction is a new draft revision, and issuing it marks the earlier one superseded, still downloadable. Review, client approval, and signature states arrive with electronic signatures. Owners and specialists can all generate, edit, and issue.

Generating creates drafts for every document type that has none. A generation record, which users never see, keeps the issue date, the starting decision number, who generated, and when.

### Templates

The built-in templates are the provider's files, converted once to `.docx`, with `{{ }}` placeholders and no honorifics: "Maria POPESCU, în calitate de Administrator". The master copies live in `packages/document-engine/templates`, where a change to legal wording is reviewed and has history, and where a wiped environment, the local stack, and CI get them back from one command. A script uploads them to Storage and registers each as a template version with its hash; every revision records the template version it came from. Templates carry an owning organization that is empty for the built-in set, so a provider's own templates can come later and live in Storage only.

A chapter that cannot be filled yet, such as the client's risks before the risk assessment exists, is generated as a highlighted "de completat" block for the user to write in the editor, and issuing warns while one remains. Data fields are never left blank.

### What the documents need, and where it lives

Facts that outlast one generation are stored once:

- on the organization: the provider's legal details, and its specialists with their qualifications, on the members;
- on the client: the legal representative's role, next to the name already there; the workplaces, as their own table; the training schedule (periodic duration, frequency per staff category, first month, days of the month);
- per client, the responsible persons: who instructs, who gives first aid, who sits on the evaluation team, who acts in imminent danger. A responsible person is a name and a job title, optionally linked to an employee, because the administrator is often all of them and is not always an employee.

The training schedule is the same data the future deadline calendar needs. Only the issue date and the starting decision number are asked at generation time. The generation form lists whatever is missing, links to where it is filled in, and refuses to generate until it is.

### Where the work runs

The API merges templates with docxtemplater, which is plain JavaScript and runs on Workers; `docx-templates` does not, because it needs `eval`. Generation stays on the server so that the bulk generation of per-employee documents later does not depend on an open browser tab. The account is on Workers Paid, which the largest file, at 68,000 words, needs to be unzipped and rebuilt. The engine is the `packages/document-engine` that the technical architecture reserved.

Files are stored in Supabase Storage, in a private bucket. Policies on `storage.objects` reuse `current_organization_id()`, so tenancy and impersonation apply to files as they do to rows, and the API hands out short-lived signed URLs. R2 was set aside because the API would become the only authorization layer for files, a second security model to test. Both speak the S3 protocol, and file access sits behind one module, so the choice can be revisited as a copy job. Supabase's database backups do not include the files; issued revisions need a backup of their own before a pilot.

### Editing in the app

Users edit a generated file inside the app. Downloading is always possible, and uploading a file back as the new draft remains for the rare document the editor cannot handle.

The editor must keep a Word file a Word file. Rich-text frameworks, Lexical, TipTap, CKEditor, Slate, Plate, and Quill, edit their own HTML or JSON, have no pages, headers, footers, or page-number fields, and would replace the customer's file with an approximation on every save; they are out. The candidates that edit `.docx` natively are tried on the two sample sets: open, edit a wide table, save, reopen in Word. `@docx-editor.dev` (eigenpal) goes first, because it runs in the browser alone and its Apache-2.0 packages raise no license question; it is young and weak on tables with merged cells, which the templates can be simplified to avoid. Collabora Online and ONLYOFFICE Docs, each a server we would host, follow only if it fails. Because the file is the source of truth, the editor takes bytes and returns bytes, and replacing it later touches one screen and no stored data.

### PDF

The PDF is a static copy made when a revision is issued, stored beside the Word file, previewed by the browser, and later the file a person signs digitally. It does not come from the editor. Converting Word to PDF with its layout needs a layout engine, in practice headless LibreOffice, which cannot run in a Worker: Gotenberg runs in a Cloudflare Container behind the API, as ADR 001 anticipated for document conversion. It needs the templates' fonts or metric-compatible ones. A page break falling elsewhere than in the editor is acceptable for a file that is signed, not compared.

### Stages and order of work

Stage 1 covers the names-and-dates files, with the first decision and the general training material as described. Stage 2 adds the files driven by job titles, which need job titles per client and the activity modules. Stage 3 is the risk assessment and the prevention plan, a module with its own ADR; until then the user uploads a risk assessment written elsewhere, so the set is complete.

Stage 1 is built in this order:

1. The data: provider details, the representative's role, workplaces, responsible persons, the training schedule.
2. Storage, the documents and revisions tables, and the template registry.
3. The merge engine and the stage 1 templates.
4. The "Documente" tab on the client page: the list, generating, downloading, regenerating, issuing.
5. The editor, after its trial.
6. The PDF at issuing.

Steps 1 to 4 already give a provider usable documents.

## Consequences

- The app stores binary files for the first time: Storage is switched on in `supabase/config.toml`, and the Workers bundle and deploy stay unchanged because templates live in Storage, not in the bundle.
- Manual edits do not survive a regeneration. The snapshot makes the staleness visible; it does not resolve it.
- The template set is one provider's professional work, reused with their consent. Another provider's wording needs the template upload that is not built yet.
- A second runtime arrives with the PDF step: a container to build, deploy, and keep fonts in.
- Comments and tracked changes, which the scope's review flow wants, are in eigenpal's paid packages. If the trial selects it, that flow reopens the editor choice.
- Workplaces and responsible persons arrive earlier than the scope's full client structure, shaped by what the documents print. Departments and SSM posts are still to come with stage 2.
- The layout of the built-in templates will drift from the provider's originals where a simpler construct renders and edits more reliably.
