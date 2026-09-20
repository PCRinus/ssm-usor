# ADR 007: Leads and Service Contracts

- Status: accepted
- Date: 2026-09-21

## Context

A provider's work with a company starts before the company is a client: someone asks for a price, a contract is drafted in Word, sent by email, signed, and only then does the safety work begin. The app starts at the last step. Neither the product scope nor an earlier ADR mentions leads; the scope only lists "contract period" and "service package" among a client's data and rules out building a signing flow of our own (section 6.6).

One provider's service contract was read for what it is made of. It has about 5,200 words in some twenty articles, nearly all fixed text. What varies is the number and date, the two parties, the prices, the start date with a duration and an automatic renewal, and the date and place of signing. It sells two services in one document, occupational safety and fire safety, each with its own chapter of services and of client obligations. Its articles refer to each other by number. It prints provider details the app does not hold: a phone, a bank account, the _certificat de abilitare_, and the fire-safety technician. It has no data protection clause, although the provider processes the personal data of the client's employees.

Every document, revision and PDF in the app belongs to a client ([ADR 005](adr-005-document-generation.md)), and the client's row is readable by the whole team.

## Decision

### A lead is a client that is not served yet

A **lead** (_client potențial_) is a row of the clients table in an earlier stage. A separate table was rejected because of the contract: the documents, revisions, storage paths and policies all take a client, so a lead of its own would need either a second owner on every document or a copy of the contract at promotion, which breaks the hash of the issued file. With one table the contract is already in the client's documents on the day the lead becomes a client.

What one table costs is that every list of clients must leave the leads out. The row policy carries the rule that matters: only owners can read a lead, so a filter forgotten in the API shows an owner too much and never shows a specialist a lead.

Only owners work with leads. A lead carries prices and a negotiation, and a specialist has nothing to do for a company until it is a client.

There are two stages, lead and client, and no funnel to maintain by hand. A lead that goes nowhere is archived, as a client is, and is restored as a lead. Where a lead stands is read from its contract: none, draft, sent, signed.

A client can still be created directly. A provider who joins brings clients whose contracts were signed years ago.

### What a lead holds

The CUI is required from the start, as for any client: the company lookup fills in the rest, the contract cannot be drafted without it, and the constraint and the duplicate check stay as they are. A lead also has an optional contact (name, email, phone), who is often not the legal representative, and whose email is needed when the contract is sent.

**Notes** are one free-text field for the owner, with no dates and no reminders. They stay visible to owners only after promotion, so they are not a column of the client row.

A lead has its data, the contact, the notes, the contract details and its other documents. Employees, job positions, workplaces and the documentation set are hidden and refused by the API, so that work is not started on a record the team cannot see.

Leads are entered by hand. There is no public enquiry form, no follow-up dates, and no activity history.

### The service contract

The **service contract** (_contract de prestări servicii_) is a document like the others: generated from a template, edited, issued, with a PDF. It is the first type of a second group of document types, the **other documents** (_alte documente_): documents about the client that are not part of its documentation set. "Anexe" was rejected as the name: the contract itself calls its annexes that. The "Documente" tab keeps showing the documentation set only, a new "Alte documente" tab shows the rest, and on a lead it is the only one of the two. A document type can be marked for owners only, and the service contract is, before and after promotion: its own confidentiality clause covers the prices. Uploading any file there is left out.

An owner can also draft a service contract for an existing client.

The built-in template is a starter in our own words, following the structure of the contract that was read, with diacritics. The user adapts it in the editor or issues it as it is, which is the position the app takes for the documentation set. The fire-safety chapter and the fire-safety obligations are printed only when that service is sold. A template of the organization's own is left to a later issue; until then a draft can be replaced by an uploaded file.

### The contract's details

A record of its own, readable by owners only, holds what the app needs to know about the contract: the number and date, the start date, the duration in months, whether it renews by itself, and which of the two services it covers. They are required before generating. Columns on the client were rejected: the row policy cannot hide a column from a specialist, and an amendment later needs a second record beside the first, not an overwritten one.

The number continues the provider's own register: the app proposes the last number plus one and the owner can change it.

Prices are not stored. The price article is generated with gaps and the owner fills it in the editor, in whatever pricing model they use. A stored price would be a second copy that falls out of step the first time the file is edited, and nothing in the app uses one yet. Storing them, for a view of expected income, is an issue of its own, with the ways of keeping the two in step.

The dates in the record and in the file can disagree after an edit by hand too. That is accepted, and the form says that the record is what the app reads.

### Provider details

The organization gains a phone, a bank account with its bank, the _certificat de abilitare_ (number, date, issuer), whether it pays VAT, which decides the sentence about VAT beside the prices, and the fire-safety technician with their certificate, as text, because that person may not be a member. All are optional, and only generating a contract needs them: the refusal lists what is missing and links to the settings.

### Sending and signing

Signing happens outside the app. The owner sends the issued PDF from the app: an email to the contact through the mail service of [ADR 002](adr-002-transactional-email.md), with the file attached and replies going to the owner. The send is recorded with its time and address. The file can always be downloaded and sent by other means.

What comes back, a scan or a file signed with the company's own certificate, is attached to the issued revision as its **signed copy** (_exemplar semnat_): a PDF stored with its hash. The app cannot tell whether a file is signed, only that one was attached. It is the place a signature made in the app will fill when that arrives, with its own ADR.

### Promotion

"Transformă în client" is a button an owner presses. It works without a signed copy and says so when there is none: contracts are also signed on paper, with the scan arriving later, and the copy can be attached afterwards. Promotion records who and when, makes the client visible to the team, and cannot be undone; a client whose contract ends is archived. Nothing is generated and nobody is emailed.

### In the app

"Clienți potențiali" is an entry of the sidebar that only owners see, with the clients' table: company, contact, contract state, date added, and a view of the archived ones. A lead's page has its own address and reuses the client page's parts; after promotion it leads to the client's page.

### Order of work

1. Continuing from an issued revision, for every document (the amendment to ADR 005).
2. The stage on clients with its row policy, the contact, the notes, and every existing list of clients leaving leads out.
3. The leads list and the lead's page, archiving included, and promotion.
4. The provider details in the organization's settings.
5. The group of other documents, the "Alte documente" tab, the contract's details, and the starter template.
6. Sending by email, and the signed copy.

Steps 2 and 3 already give an owner a list of leads that become clients.

## Consequences

- ADR 005 is amended: a new draft can start from the issued revision's file. Without it a price change in a contract, or any correction to an edited document, meant redoing every edit.
- Every query that lists clients gains a stage filter, and the e2e seeds a lead to prove that a specialist never sees one.
- The mail provider gains attachments and a reply address per message. Resend accepts 40 MB per email; a contract is well under one.
- The starter contract is legal text under our name. Its review joins issue #61, together with what the contract that was read lacks or overstates: a data protection clause, the penalty clause, the non-compete clause, the late-payment rate.
- Fire safety is recorded as a contracted service while the app produces nothing for it.
- A document exists once per client, so a renegotiated contract is a new revision, not a second contract. The amendment (_act adițional_), several contracts per client, reminders before a contract ends, stored prices, the organization's own template, an onboarding checklist for the provider details, and signing in the app are left out on purpose. Each can be added without undoing this.
