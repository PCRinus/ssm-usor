# ADR 013: Client files, the other documents of a client

- Status: accepted
- Date: 2026-09-30

## Context

Everything the app stores about a client so far it wrote itself, or took in as a `.docx` standing for a document it will write one day ([ADR 005](adr-005-document-generation.md)). A provider also holds files the app will never write: the client's registration certificate, a labor inspectorate report, a medical fitness record, an offer, an annex with prices, a photo of a workplace. They live in email and on someone's laptop, and the team asks each other for them.

[ADR 007](adr-007-leads-and-service-contracts.md) opened an "Alte documente" tab for the documents about a client that are not part of its documentation set, put the service contract there as the first, and left "uploading any file there" out. The tab then held one contract card and nothing else, under a name that promised more. The client page has since been reorganized: the contract has a tab of its own, and "Alte documente" was taken out of the tab bar until it could be what its name says.

Storage is in place: private buckets, policies on `storage.objects` that reuse `current_organization_id()`, files that pass through the API in both directions, short-lived signed links, a 20 MiB limit per file, a hash per stored file. Nothing under an archived client changes, by triggers that answer `CLA01`.

## Decision

### A client file is not a document

A **client file** (_fișier_) is a file about a client that the app did not write and does not read: uploaded, named, downloaded, deleted. A **document** stays what ADR 005 made it: one document type, once, for a client, with revisions, a template and a data snapshot. The two do not share a table or a type list. Making client files one more document type was rejected: a document type exists once per client and has revisions that are issued, and a folder of scans has neither.

The client's files together are its **other documents** (_alte documente_), which is the name of the tab. The service contract is no longer one of them. In the code, the "other document" types of ADR 007 are renamed after what they are, the service contract; and the catch-all section of the documentation set's list, also titled "Alte documente", becomes "Alte documente SSM".

### What a file carries

- A **name**, which starts as the name of the uploaded file without its extension and can be changed.
- An optional **note**, as free text.
- Whether it is **for owners only**.
- What the app records by itself: the original file name, the type, the size, the SHA-256 of the content, who uploaded it and when.

No categories and no tags: a client has a handful of files at first, and a category list made now would be a guess. The name and the note are searched by reading. No date of the paper itself, no expiry: a file whose date matters, such as a medical record that expires, is a fact the app will hold as data when that feature is built, not a property of a scan.

No versions. A file is replaced by uploading the new one and deleting the old one. Versions belong to documents, where a revision is issued and the one before it is superseded.

### What can be uploaded

PDF, JPEG and PNG images, Word (`.docx`, `.doc`) and Excel (`.xlsx`, `.xls`), up to 20 MiB each, which is the limit Storage already applies. The type is checked by the API against the content's first bytes and by the bucket against the declared type. Executables, archives, HTML and SVG are refused: the last two run script when opened from the app's own origin. HEIC, which phones produce, is left out until someone asks: browsers do not show it.

Several files can be sent at once, by dropping them on the list or by picking them; each is its own request, with its own progress and its own refusal.

### Who sees and who changes

Owners and specialists see a client's files, upload, and download. A file is renamed, annotated and deleted by the member who uploaded it and by any owner. A specialist does not remove a colleague's file.

An owner can mark a file **for owners only**, when uploading or later. A specialist never sees such a file, nor its name. This is the same reason the service contract is for owners: offers and price annexes end up here. The flag is a column the row policy reads; it can be one, unlike the contract's details in ADR 007, because it hides the whole row, not a column of it.

Deleting is permanent, after a confirmation that names the file. The row and the stored object go together. A recycle bin was rejected: it keeps personal data the user asked to remove, and it is a second list to explain.

### Leads

A lead has the same files, as a card on the lead's page, since a lead has no tabs. A file uploaded for a lead is for owners only from the start, because nobody else could see the lead; after promotion it stays with the company, and an owner opens it to the team by clearing the flag.

### Archived clients

The files of an archived client are listed and downloaded, and nothing else: no upload, rename, flag change or delete. The table joins the ones the `CLA01` triggers guard, and the path check of the bucket asks for an active client for every write, as the documents bucket does.

### Storage

A private bucket of its own, `client-files`, with the allowed types and the size limit set on the bucket. Objects are stored as `<organization>/<client>/<file id>.<extension>`; the original name lives in the row and is given back in the download's `Content-Disposition`, so no character of a user's file name reaches a storage path. The row is written first and the policy accepts only the path a row of the caller's organization names, as for instruction modules.

The documents bucket was not reused: its policies are written around revisions and drafts, its type list is narrower, and a separate bucket can be backed up, emptied or moved on its own.

PDFs and images open in a browser tab from a signed link; the other types download. There is no preview inside the app.

### What is not decided here

No limit on the number of files or on the space a client or an organization uses. It will be needed with pricing, and the size of every file is recorded from the first one, so the sum exists when the limit does.

## Consequences

- The app stores files it cannot inspect. There is no virus scanning: a file is stored as uploaded and handed back as stored. Restricting the types and never serving a file from the app's origin as a page limits what a bad file can do to the app, not to the person who opens it on their own computer.
- People will upload personal data the app has no fields for: medical fitness records, identity papers, payroll extracts. The data processing agreement and the privacy policy describe what the app processes, so the legal review (#61) has to cover free-form files, their retention, and what deleting an organization removes.
- Supabase's database backups do not include stored files, which ADR 005 already says of issued revisions. This bucket adds files that exist nowhere else, unlike a generated document that can be generated again; the backup of stored files that ADR 005 asks for before a pilot covers `client-files` too.
- "Alte documente" means one thing in the interface. The glossary, ADR 007 and the code that called the contract an "other document" are brought in line.
- A specialist's view of a client can now differ from an owner's by rows that are not there, not only by a tab that is hidden. Counts shown to a specialist count what they can see.
- The client page gains its seventh tab. On a phone the tab bar already scrolls.

## Order of work

1. This ADR, the glossary in `CONTEXT.md`, and the amendments to ADR 005 and ADR 007.
2. The `client_files` table with its policies and the `CLA01` trigger, the `client-files` bucket with its path check, and the API: list, upload, rename and annotate, flag, download link, delete.
3. The "Alte documente" tab and the lead's card: the list, upload by drop and by picker, the owners-only switch, rename, delete.
4. The renames: the contract's "other document" types in the code, and "Alte documente SSM" in the documentation set's list.
