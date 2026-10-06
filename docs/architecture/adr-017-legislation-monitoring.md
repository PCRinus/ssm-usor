# ADR 017: Legislation monitoring, the legal texts the templates quote watched on the Portal Legislativ and fixed through the repository

- Status: proposed
- Date: 2026-10-07

## Context

Every legal text a generated document prints is static prose in a built-in template, copied once from the provider's packs at import ([ADR 005](adr-005-document-generation.md)). Nothing is fetched from anywhere and no table says which act or article a template quotes. The provider marked each quoted article the same way, a paragraph that opens "(Preluare din Legea 319/2006 – Art. 7)" and goes on with the article's text as it stood when they copied it; sentences of the documents' own refer to acts inline, "conform art. 20 din Legea 319/2006". Some thirty-five acts are named. The general training material quotes about 390 paragraphs from 23 acts, the employer briefing about 140 from 27, the own instructions' common part 75; the decisions, the tests, the equipment list, the risk assessment and the service contract a handful each; the registers and the fire-safety forms none, though the forms' layouts are annexes of OMAI 163/2007 and OMAI 135/2023. The core is Legea 319/2006, H.G. 1425/2006, H.G. 355/2007, H.G. 1048/2006, Legea 53/2003, Legea 346/2002 and, for fire safety, Legea 307/2006 with its orders. The rest are the 2006 decisions transposing directives, which rarely change. A few rules are in code rather than in text: the training intervals of H.G. 1425/2006 art. 96, the one-hour periodic minimum of art. 80¹, the columns of annex 7, the headcounts that make a document conditional.

The texts drift. The audit of 3 October 2026 found template 6 quoting H.G. 1048/2006 as it read before 2022 and citing H.G. 115/2004, repealed, and [ADR 016](adr-016-fire-safety-documents.md) noted that the fire-safety norms move faster than the first set's (Legea 307/2006 twice in 2026). Both were found by reading. Nothing in the repository or the app would have said so, and nothing tells a specialist that a document issued last year rests on a text that has since changed.

What exists around the templates matters for the shape of a fix. The master files live in the repository, with tests that open every template in the editor and check its layout, and `templates:register` registers them on hosted as versions; a version is a number, a Storage path, a hash and a date, and nothing says why it exists. Every revision records the template version it was generated from. A regenerated draft loses its hand edits (ADR 005). The instruction modules and training themes annexed to the own instructions are the organization's own files, which the app ships none of ([ADR 012](adr-012-own-instructions.md)). The app has owners and specialists inside organizations and no role for the people who run it. The API Worker has no scheduled trigger, queue or durable object. Legal content never changes in a template without the provider's sign-off.

The official consolidated texts are on the Portal Legislativ, legislatie.just.ro, run by the Ministry of Justice. Checked on 7 October 2026, the page of Legea 319/2006 has a "Forme act" section listing every consolidated form with its date (the newest 25 July 2021) and the acts that produced it; it fetched without trouble from a server. There is no API and no feed, and the pages' URLs are the portal's own ids, not derivable from an act's number. Legal databases sold by subscription offer alerts per act.

## Decision

### The citation index is derived from the templates and nothing else

A **citation** is one place in a built-in template that quotes or refers to a legal act. A parser in the engine package reads every template's text and records, per citation, the template and the conditional block it sits in, the act, the article where the text gives one, and, for a quoted article, the words quoted. Two forms count. A **quoted article** is a "Preluare din" block: act, article and text, which is what article-level checks compare. A **reference** is a sentence that names an act with a number and year, with or without an article: act-level only. Loose mentions, "potrivit legii", "legislația în vigoare", are not citations.

The index is a file beside the templates' manifests, regenerated whenever a template changes and bundled with the API like the templates' manifest is. It is not a database table and nobody edits it: the template stays the source of truth, as the import approach already says, so there is nothing to keep in step. What a test enforces, beside the one that opens every template, is hygiene: every marker parses; every act named resolves to a watched act with a portal page; an act the portal marks as repealed fails; a paragraph that reads like an article, opening "(1)" or "Art.", with no marker is reported. A new template that quotes an unknown act fails the build until the act is added.

The act names are made uniform first, in one wording pass under the wording policy: one spelling of each act ("Legea 319/2006", "H.G. 1425/2006") and one separator before the article, in place of the "Legea nr. 319/2006", "Legii 319/ 2006", "H.G. 1425/ 2006, Art" and "H.G. 1425/ 2006 Art" the files hold today. The provider's marker itself, "Preluare din", stays: it is how the trade writes and how an inspector reads it. A marker syntax of our own was rejected.

A hand-kept table of citations was rejected: it would drift from the templates the day after it was written. Indexing the organizations' own files, instruction modules and training themes, was rejected: they are the organization's text, maintained by the organization, and the app does not read them for this.

### A watched act is a portal page, checked daily

A **watched act** is one of the acts the index names, with its portal id resolved once and kept, its status on the portal, the date of the consolidated form the templates were verified against, and the newest consolidated form last seen. A daily job fetches each act's page and compares the newest consolidation date and the list of amending acts with what it saw last. A difference is a **legal change**: the act, the date seen, the new consolidated form and the amending act. A change is **open** until it is resolved, either as **no impact** or by the template version that answers it.

The job never returns "no change" on a page it could not read. A fetch or parse failure is a failure of the job, which is the alert; an act can be marked checked by hand with a date, so the feature degrades to a manual check and not to silence. Portal ids are resolved by a one-time lookup when an act first appears in the index and confirmed by a person; the test above fails while an act has none.

The verification date makes the first run meaningful. When the content issues that bring the templates current are closed, each act records the consolidation date the templates were verified against; the first run then reports every act whose portal form is newer than that date, instead of silently recording the present as the baseline. Drift that exists before that date is the review loop's work, not this feature's.

The Monitorul Oficial's table of contents, where an amendment appears weeks before the portal consolidates it, was considered as a second signal and left for later. A subscription to a legal database's alerts was rejected: the signal is a list of dates on a public page, and the subscription would add a monthly cost and a dependency on a vendor's email format.

### Changes are resolved in the repository, by a scheduled job, through a pull request

The job that watches the acts runs as a scheduled GitHub Action, not in the API Worker, and the same job resolves what it finds. The reason is where templates live: a fix is a new template file, and that file has to pass the template tests, be reviewed and merge before `templates:register` publishes it, or the repository would hold the old file and the next deploy would publish it back. The Action has the checked-out repository, Node, the test suite, the engine's own Word helpers and a GitHub token; a Worker would have to rebuild the Word tooling without a filesystem to open the same pull request. Running the pipeline in Cloudflare's AI Worker was rejected for that reason, not for the model. The Action writes the watched acts and changes to the database the way the register script does, with the secret key.

On a change the job works in this order:

1. It fetches the amending act and the current consolidated text of the articles the index cites from that act.
2. It compares the text of every quoted article with the current text, after normalizing spacing and the act names. If no quoted text differs and the amending act names no cited article, the change resolves itself as **no impact**, and the page below says so.
3. Otherwise a model receives the amending act, the citations touched and the current articles, and returns the new wording per quoted article and a short note for users. The job applies the wording to the template files with the engine's helpers, regenerates the index, runs the parser and template tests, and opens a pull request that carries the model's report, the note and the change it resolves. When it cannot, it opens an issue instead.
4. A person reads and merges the pull request. This is the one step left to a human, and it is the wording policy's sign-off, not a technical limit; if that policy changes, the pull request can merge itself on green.
5. The merge registers the new version with its note, its kind and the change it resolves, and the change is resolved.

The text comparison in step 2 decides whether a change touches the documents; the model only proposes words and explains. A model that reads an amendment as harmless cannot resolve a change whose quoted text the comparison found altered. A frontier model called over HTTP is the first choice; the open-weight models Workers AI hosts were not tested on Romanian legal text and are not assumed to be enough.

### A template version says why it exists

A template version gains a **note** for users, a **kind** and, when it answers one, the legal change it resolves. The kinds are **legal**, a change in a quoted or referred text; **correction**, a fix of the template's own content, such as the audit's pictogram captions and diacritics; and **layout**, which changes no words. `register_built_in_template_version` takes the three, and `templates:register` reads them from the manifest or its arguments. A legal or correction version prompts regeneration; a layout version is silent. Without the three, the page below could tell a specialist to regenerate and could not say what changed.

### The Legislație page and in-app notice only

Each organization has a **Legislație** page. It lists the watched acts with their status, the consolidated form last seen and the date last checked, and the legal changes: open ones as "în verificare", those resolved with no impact as such, and those answered by a template version with the version's note, the text that differs between the two versions, and the documents **behind** it: for each document type, the clients whose newest revision was generated from an older version of a kind that prompts, with their count and a way to regenerate for all of them. A document is behind by its revision's template version alone, so a hand edit changes nothing about whether it is behind.

The documents behind are also marked where documents are listed, as "Date modificate" marks a draft today. Nothing is sent by email, and no document prints a "verified on" date: the client does not read it, the inspector checks content, and a wrong date is a liability. The dates belong on this page.

### Bulk regeneration runs in a queue

Regenerating a document type for every client behind it is one action on the page, run through a queue (Cloudflare Queues), one message per client, each going through the regeneration path a single document uses today. A hand-edited draft is skipped and listed for the specialist, since regenerating it would discard the edits (ADR 005). An issued revision gets a new draft; issuing stays per client, where the signatures are. The page shows progress and the result. Driving the loop from the browser was rejected: a closed tab or a crash would leave an organization half regenerated with no record of which half. This is the first background job in the codebase and the action that every template fix, legal or not, has needed since the audit's fixes left every client on older versions.

### What is left out

- The organizations' own files, which the index does not read.
- The rules encoded in code. An alert for H.G. 1425/2006 reaches a person who greps the migrations, whose comments already cite the articles; a second index for ten constants was rejected.
- Email of any kind.
- A verification date printed in documents.
- Watching for a document's own data going stale, which the snapshot does already.
- Fixing the drift that exists today, which the open content issues do by hand before the first verification dates are recorded.

## Consequences

- The templates get machine-checked for how they cite the law. A template that quotes an act the index does not know, or that the portal has repealed, fails the build, and every act's spelling is one.
- The product depends on a government site's HTML. The dependency is contained to one job whose failure is visible, and the feature falls back to a manual check with a recorded date rather than to a stale "checked" state.
- The repository gains a scheduled Action that writes to the database and opens pull requests, with a model API key and the database's secret key among its secrets. The API gains its first queue.
- Template versions become meaningful to users: release notes per template, with a kind that decides whether anyone is asked to act.
- The provider's sign-off stays the gate on legal content, as a merge, and the whole pipeline before it is automatic.
- "Resolving" a change has no screen and no role: it happens in the repository, in a pull request and the registration that follows its merge. Members read; nobody in the app writes to the legislation data.

## Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. The citation wording pass on the templates: one spelling per act, one separator before the article.
3. The parser, the index file, the hygiene test and the act list with portal ids; the spike that fetches a portal page from an Action and reads the portal's robots.txt.
4. The note, kind and resolved change on template versions, in the database function, the manifests and `templates:register`.
5. The watched acts and legal changes in the database; the scheduled Action's detection step, with its failure as the alert; the verification dates once the content issues close.
6. The Legislație page, read-only, with the documents behind.
7. The queue and bulk regeneration from the page.
8. The resolution steps of the Action: the text comparison, the model's proposal, the pull request and the issue it falls back to.

## Open

1. Whether to add the Monitorul Oficial table of contents as the second signal, and when.
2. Whether the pull request may merge itself once the comparison, the tests and a period of reading the model's proposals have earned it.
3. Whether an act the index names only through references, never a quoted article, should be watched at all, or listed and not fetched.
