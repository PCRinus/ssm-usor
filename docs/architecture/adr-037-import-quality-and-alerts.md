# ADR 037: A copy of every import to improve the reading, and alerts when one goes wrong

- Status: accepted
- Date: 2026-11-04
- Amends: [ADR 030](adr-030-import-from-documents.md) (retention), and through it the employee import ([ADR 032](adr-032-employees-imported-from-training-sheets.md)), own instructions ([ADR 034](adr-034-own-instructions-as-app-text.md)) and risks ([ADR 036](adr-036-risk-library-and-import.md))
- Issue: #802

## Context

The four imports (clients, employees, own instructions, risks) were built and tested on the few archives we had. The risk import rests on five archives that all come from one provider and one Word template. A reading that goes badly on a template we have never seen looks, to us, like any other reading: nothing fails, the specialist corrects the review by hand or abandons it, and we never learn of it.

What exists today:

- **Counts.** Tokens and cost per import and per library part. The client and employee imports also keep `quality`: per section, how many proposed values the member changed, unticked or kept. Instruction and risk parts keep no such counts.
- **Errors.** `console.error` in the Worker's logs when something breaks. Nobody watches them.
- **The proposal.** Every value with its file and quote, the checks' flags and the member's changes. It is deleted 30 days after confirming, and an abandoned or failed import is deleted with its files 14 days after it ends. The worst readings, the ones a member walked away from, go first.
- **The gateway's logs.** The raw requests for 30 days.

Two shapes were considered and rejected:

- **A record with no document content,** which #802 proposed. It identified a layout by its tables' column titles, a template fingerprint. With many providers on many templates, nearly every reading would carry a fingerprint of its own, so nothing groups and every reading looks new. A count says that a reading went badly, never why; the why is in the document.
- **Keeping documents only when a member reports a problem.** Most bad readings are never reported: the member fixes them or leaves.

Mircea decided on 2026-11-04:

- We keep a copy of every import, documents included, for 12 months, to improve the import. The data processing agreement says so, and accepting it at sign-up is the provider's agreement. It is a term of the contract, not a choice offered.
- The legal pages are changed now, by us. The lawyer reviews them all at the end (#629), before the first real provider. Production has no provider yet, so nobody has accepted the old text and nobody is asked to accept again.
- No masking. A test case kept longer than 12 months has its personal data replaced with invented values first.
- An organization that leaves, or asks for deletion, takes its copies with it. A single employee's data in a copy ages out with the copy.
- The copies live in a private bucket of their own.
- Alerts go to Discord, not email, so they use no email quota. Re-running test cases costs model credit, and that is accepted.
- The agreement does not authorize "any use of all data to improve the platform". Such a general authorization is not valid for a processor's reuse (the CNIL guidance below), and a regulator has refused it in a like case: in January 2024 the Danish authority ordered 53 municipalities to stop passing pupils' data to Google for Google's own maintenance and improvement of its products. The agreement instead names each use in a list under "Îmbunătățirea Platformei"; the improvement copy is the first, and a new use joins the list with the 15 days' notice and the right to object that a new sub-processor already has. Statistics that identify no one need no entry.

## Decision

### The improvement copy

The **improvement copy** (_copia pentru îmbunătățire_) is what we keep of one import for 12 months, to find what the reading gets wrong and to test a change against it:

- the uploaded files as uploaded, and the converted copies the reading used (a photograph's upright JPEG, a scanned PDF's page images);
- the text extracted from each file, and the scan step's reading of each page, so a new prompt runs again on the text without paying for the scan;
- how each file was sorted;
- the proposal: every value with its file and quote, the choices offered, and the flags the code checks raised;
- what the member did in review: each value changed, with its value before and after, each row unticked or added;
- the import's end: confirmed, abandoned or failed, the failure reason, and the time;
- its reading version, its counts and its cost (below).

The same is kept for each library part (own instructions, risks), which ends on its own, up to 14 days after its client.

**Where.** A private bucket, `import-copies`, under `<organization>/<import>/`. It has no Storage policy, so no member's or participant's token reaches it; only the secret key does. The app never reads it. Support reads it through the admin area (below), and, until that exists, through the Supabase dashboard.

**When.** The copy is written when the import ends: confirmed, abandoned, or failed by the reading or by the daily clean-up. The files are copied, not moved, so the import's own files follow ADR 030 unchanged: what a member sees, the import folder, the 14 days of an abandoned import, does not change. A library part's copy is written beside its import's when the part ends. An import that fails before any file is stored leaves only its record.

**How long.** 12 months from the day the import ended. The daily clean-up deletes copies older than that, objects before any row that names them, as ADR 030 does.

**Earlier deletion.** When an organization is deleted (the read-only period after its access ends runs out, or it asks), its whole `import-copies/<organization>/` folder goes with it. Deleting a client, an employee or a file in the app does not reach the copies; that data ages out within the 12 months.

**What it is used for, and not.** Support reads a copy to understand a reading that went wrong. A copy is read again by the model only to test a change to the reading. No copy trains a model, ours or OpenAI's, and none leaves the bucket except to the model through the gateway, as an import already does. None is ever committed to the repository, which is public.

### Test cases

A confirmed import's copy is a ready test case: the files are the question, and what the member confirmed, after their changes, is the answer. A script in `apps/api/scripts` reads the chosen copies from the bucket, runs the current reading on them, and compares its proposal with the confirmed result, value by value: found, missed, wrong, or extra. It keeps nothing on disk after the run. Before a run on many copies, the script states the expected cost and runs one copy first.

A case kept past its 12 months is **shuffled** first: names, CNPs, birth dates and places, addresses, phone numbers and emails are replaced with invented ones, consistently across the case's text and its answer. A shuffled case is kept under `import-copies/<organization>/test-cases/`, so it still goes with its organization, and never in the repository. A case whose only source is a photograph or scan cannot be shuffled and is not kept past its 12 months.

### Reading version

Each import and each library part stores its **reading version**: the model of each step it used and a short hash of the prompts and schemas that read it. Two readings with the same version ran the same code, so a change in quality across a deploy is told apart from a change in the documents.

### Reading flags

Each import and library part stores counts that describe the reading, never what it read. They are kept with the import, which stays after its proposal is dropped:

- files by sorted kind, files that could not be opened or read, and files set aside;
- what was found: posts, employees, training rows, instructions, evaluation sheets and factors, and required fields left empty;
- the code checks' flags: values whose quote is not in their file, classes outside the grid, printed risk levels that disagree with the grid, an instruction's end not found;
- for each risk sheet, which of the columns the reading needs it found: component, factor, gravity, probability, level, measures;
- the `quality` counts (changed, unticked, kept), which the instruction and risk parts now keep too.

### Alerts

Alerts are posted to a Discord channel through a webhook, one channel per environment. The webhook's URL is the API's secret `DISCORD_ALERTS_WEBHOOK`; without it, as locally, alerts are skipped. A failed post never fails an import: it is logged and dropped.

**What a message holds.** The rule, the environment, the import's kind and id, the organization's id, the counts and flags that tripped the rule, the cost, and a link to the import in the admin area once it exists. It holds no personal data and no client data: no organization or client name, no employee data, no values and no file names, since a file's name often names a person ("Fișă Popescu Ion.jpg"). A file is named by its place and kind, "file 3 of 9, risk assessment". Discord is therefore not a sub-processor.

**The first rules.**

| Rule                                  | Checked when                                     | Trips when                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed on our side                    | an import or part fails                          | its reason is ours: the gateway or model did not answer, refused or gave no usable answer, the scan did not finish, an error, or not configured   |
| Stuck                                 | the daily clean-up                               | the clean-up fails an import or part as stalled                                                                                                   |
| Sorted, but nothing found             | the reading ends                                 | a file sorted as a kind gave nothing of it: a risk assessment with no factor, a training sheet with no person, an instruction pack with no module |
| Client reading with no required field | the reading ends                                 | a client import's proposal has no company name, no CUI and no post                                                                                |
| Files we could not open               | the reading ends                                 | any uploaded file could not be opened or read                                                                                                     |
| Reported by the member                | the member reports a problem with the import     | always                                                                                                                                            |
| Confirmed, but mostly changed         | the import or part is confirmed                  | the member changed or unticked more than half of what was proposed                                                                                |
| Abandoned after a reading             | the member abandons it, or the clean-up fails it | its reading had finished                                                                                                                          |
| Expensive import                      | the reading ends                                 | the import with its parts cost more than $1                                                                                                       |
| Busy organization                     | an import starts                                 | the organization started more than 10 imports in the last hour, or spent more than $5 since midnight UTC                                          |

Stuck imports are found by the daily clean-up, so that alert can come up to a day late; an hourly check is added if that proves too slow.

**The daily summary.** After the daily clean-up, one message sums up the previous day: imports started, confirmed, abandoned and failed, the share of proposed values changed, the cost, how many alerts were sent, and the clean-up's own line. It also shows that the alerting runs: a day without alerts still has its summary.

**Later rules,** not built now, each added when its data exists or traffic makes it worth it: many quotes not found, printed levels that disagree with the grid, needed columns not found, most files set aside, imports blocked by the size limits, an organization at the credit floor, imports queued too long, several failures within an hour.

Every rule must be something support would act on. What support would only read goes into the summary.

### Reporting a problem with an import

The review pages of an import and of its library parts gain **Raportează o problemă cu importul**. It records the report on the import (`reported_at`, and who) through the API, which sends the "reported" alert, and opens the support widget of [ADR 009](adr-009-problem-report-intake.md), where the member describes the problem and gets the answer. What the member writes stays in PostHog Support; the alert carries only the import's id and the member's account id, so the ticket and the copy are matched.

### Where support reads it

The admin area (#611) gains an **Imports** page: every import with its kind, organization, status, reading version, flags, cost, alerts and reports, and, for one import, its improvement copy: the files, the proposal beside what the member changed, and the parts. A Discord alert links to it. Impersonation (#611) shows only what the member can still see, an import in review, and not an abandoned import, a dropped proposal or a copy, so it does not replace this page.

### Not chosen

- **Sentry,** which #802 proposed for alerts. The API has no Sentry, and the rules are a handful of checks the import already reaches. A Discord webhook needs one secret and no SDK. PostHog stays where it is, in the app.
- **Email alerts,** which would use the transactional email quota.
- **Product analytics events from the API.** The flags and counts are in the database, where the admin page and a query read them. PostHog charts can come later from the same counts.

## The legal pages

This pull request changes them; the lawyer reviews them with the rest at the end (#629):

- **The data processing agreement** (`/prelucrare-date`): a new item, _Îmbunătățirea Platformei_, authorizes a closed list of uses, which grows only with 15 days' notice and the right to object, as for a new sub-processor; none trains a model. Its first entry is the improvement copy, with what it holds. The duration names its 12 months, the confidentiality point who reads the copies, and the end of the contract deletes them.
- **The privacy policy** (`/confidentialitate`): the import's paragraph, the retention list, and the sentence on training models.

For the legal review:

- For the copies, we use the provider's data for a purpose of our own, so for that use we act as controller (GDPR art. 28(10)), on legitimate interest (art. 6(1)(f)), for a purpose that must be compatible with the one the data was uploaded for (art. 6(4)). The provider authorizes it by accepting the agreement (art. 28(3)(a)). The French authority CNIL's guidance on processors reusing data (_Sous-traitants : la réutilisation de données confiées par un responsable de traitement_, 2022) asks for exactly this: a specific written authorization naming the further purpose, not a general one, and a compatibility test, and it names improving the processor's own service as a reuse that can pass it. The agreement's clause names the purpose, the data and the period; the test is below.
- **Compatibility (art. 6(4)).** The link: the copy serves the same reading the provider started, to make it read the provider's next documents better. The context: the provider uploaded the documents for us to read them with a model, and expects the reading to improve. The data: identification data, CNPs, and for employee imports blood group and Rh. The consequences for the people: none in their dealings with their employer; the risk is a breach, and three things limit it: the bucket is isolated, nothing is kept past 12 months, and no member can read a copy. The safeguards: no model is trained, nothing leaves the bucket except to the model already used, nothing reaches the repository, and a case kept longer is shuffled.
- The copies hold CNPs. Romanian Law 190/2018, art. 4(2) allows processing the national identification number on legitimate interest only with four safeguards: (a) technical and organizational measures, minimization and security among them; (b) a data protection officer; (c) set storage periods with deadlines for deletion or review; (d) regular training of those who process the data. We have (a) and (c); (b) and (d) are for the legal review.
- The copies of employee imports hold blood group and Rh, which are health data (GDPR art. 9). Article 9(2) has no exception written for improving a service; the lawyer says which condition applies, or whether those copies need the blood group removed.
- The employees, whose data it is, learn of it through their employer's and the provider's information to them; whether the agreement should ask the provider to mention it.

## Consequences

- Every import, abandoned and failed ones included, now leaves its documents with us for 12 months, where before an abandoned import's were gone in 14 days and a confirmed import's proposal in 30. What members see does not change.
- Storage grows by one copy of every upload for a year. An import is capped at 100 MiB (client) or 1 GiB (employees), so the bucket's size is bounded by the number of imports; it is watched on the daily summary.
- Deleting an organization must also empty its copies. No organization is deleted yet, and the deletion work from the database audit picks this up.
- The webhook's URL is a secret per environment, set by Mircea. A non-prod channel keeps test noise out of production's.
- The help article on importing does not change: the member's import behaves as before. When the report button ships, the article names it.

## Building it

Each step is a pull request in one stack, on this ADR.

1. **This ADR, the legal pages and the glossary.**
2. **The database.** The `import-copies` bucket without policies; `reading_version`, `reading_flags` and `reported_at` (with who) on imports and library parts; `quality` on library parts; the copies' 12-month clean-up and the organization's deletion of its folder; pgTAP tests.
3. **The API.** The copy written when an import or part ends; the reading version and flags; the Discord sender with the first rules and the daily summary; the report route.
4. **The app.** The report entry on the review pages, and the help article naming it.
5. **The admin area's Imports page,** as part of #611.
6. **The test runner** in `apps/api/scripts`, with its cost estimate and its one-copy trial.
