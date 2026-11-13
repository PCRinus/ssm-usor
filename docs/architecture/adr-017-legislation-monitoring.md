# ADR 017: Legislation monitoring, the legal texts the templates quote watched on the Portal Legislativ and fixed through the repository

- Status: accepted
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

(Amended 2026-10-08. The first cron run failed on every act: the portal refuses Cloudflare's and GitHub's networks, answering 520 or 522 or an empty reply on every path and with any user agent, while residential addresses get 200; the Ministry's SOAP service answers 403 from there too and carries no consolidation history anyway. So the Worker fetches the portal through a relay on Mircea's home server, reached through his Cloudflare Tunnel and guarded by Cloudflare Access, which forwards each request and returns the portal's answer unchanged and holds no secrets; the Access service token lives in the homelab Terraform and in the Worker's secrets. The spike in step 3 of the order of work, a portal page fetched from a Worker, had run under wrangler's local mode, which fetches from the laptop, so the block was only seen on the first real run.)

### Changes are resolved by a scheduled Worker, through a pull request

The job that watches the acts and resolves what it finds runs in a Worker of its own, `apps/legislation`, on a Cloudflare cron trigger, beside the mail and PDF Workers. It writes the watched acts, the changes and a log of its own runs to the database with the secret key. A fix is still a new template file that passes the template tests and merges before `templates:register` publishes it, or the repository would hold the old file and the next deploy would publish it back; the Worker opens that pull request through the GitHub API, binary files included, and the pull request's own CI runs the tests. (Amended 2026-11-13: the Worker opens no pull request; `legislation-fix.yml` does, as the amendment of 2026-11-12 below says.)

(Amended 2026-10-07. The first draft of this section put the job in a scheduled GitHub Action, on the grounds that only a checked-out repository could edit Word files and run the template tests before opening a pull request. The first ground was wrong: the engine edits Word XML inside the API Worker at every rendering, and the citation parser runs on the same helpers. The second is worth little: a text-only edit of a run leaves every other part of the file untouched, as the citation wording pass showed, and the pull request's CI runs the tests anyway. What tipped it: Cloudflare's cron fires on time where GitHub's scheduler delays and drops runs; the model is a binding in a Worker, where an Action would call it over HTTP; and either home needs a GitHub App or token, since a pull request opened with an Action's own token triggers no CI. One thing the Action gave for free is lost, the email on a failed run; in its place the Worker records every run in `legal_check_runs`, and the Legislație page warns when the last run failed or is older than two days, which also keeps the alert in the app. The check script remains for manual runs from a laptop.)

On a change the job works in this order:

1. It fetches the amending act and the current consolidated text of the articles the index cites from that act.
2. It compares the text of every quoted article with the current text, after normalizing spacing and the act names. If no quoted text differs and the amending act names no cited article, the change resolves itself as **no impact**, and the page below says so.
3. Otherwise a model receives the amending act, the citations touched and the current articles, and returns the new wording per quoted article and a short note for users. The job applies the wording to the template files with the engine's helpers, regenerates the index, runs the parser and template tests, and opens a pull request that carries the model's report, the note and the change it resolves. When it cannot, it opens an issue instead.
4. A person reads and merges the pull request. This is the one step left to a human, and it is the wording policy's sign-off, not a technical limit; if that policy changes, the pull request can merge itself on green.
5. The merge registers the new version with its note, its kind and the change it resolves, and the change is resolved.

The text comparison in step 2 decides whether a change touches the documents; the model only proposes words and explains. A model that reads an amendment as harmless cannot resolve a change whose quoted text the comparison found altered. A frontier model called over HTTP is the first choice; the open-weight models Workers AI hosts were not tested on Romanian legal text and are not assumed to be enough.

### What changed is read without a model, and the fix is a scheduled pull request

(Amended 2026-11-12. Steps 1–5 above were never built, and the first changes showed what their absence costs. On 12 November non-prod had two open changes and production one, and the page could say of neither what had changed. The difference came from the baseline: no act had a verified form, so each environment took the first form it saw as the reference. Production, wiped on 23 October, first ran on the 24th and took the Fiscal Code's form of 25 October as its baseline, where non-prod had already seen the form before it. Read by hand, the Fiscal Code change touched nothing we cite. The Code of the Road's form of 6 November (Legea 207/2026) changed art. 36 alin. (2), which the general training material quotes. The Criminal Code's form of 18 October predated both environments' first runs and was absorbed without a word, harmlessly as it turned out. This section replaces steps 1–5 and the Worker's pull request from the amendment above.)

**The portal says what changed.** On a newer form, the Worker fetches the act's full text in the verified form and in the new one. The act's page carries it inline, except for the largest acts: the Criminal Code's page links a separate full-text view, `/Public/DetaliiDocumentAfis/<id>`. Each amended unit in the text carries the portal's note, "(la 06-11-2026, Alineatul (2), Articolul 36 … a fost modificat de … LEGEA nr. 207 din 3 noiembrie 2026 …)". The job reads the notes for the units amended since the verified form, and for the amending acts. The act's list of actions misses that act for republished acts: O.U.G. 195/2002's list ends in 2006. The text is fetched only when a change appears, so the relay carries a few more requests per change, not per act per day.

**The outcome is decided by comparison.** Each change gets one of three outcomes, without a model:

- **No impact**: every unit we cite reads the same in both forms, and no note says one of them changed. The job resolves the change itself, with a note naming the amended articles.
- **Quote differs**: the law's text of a unit a template quotes differs between the verified form and the new one. The job stores both texts of the unit and the words that changed, with a few words on each side to find them by.
- **Needs review**: an article the templates refer to without quoting was amended; a cited unit was repealed, is in neither form, or could not be compared (no words to read, an annex kept as images, or too long); a note says a cited unit changed where its text reads the same; the act was republished between the two forms, which may renumber it; the act has no verified form and its text as published could not be read; or the change could not be assessed for three days.

A republication makes a change need review whatever else it holds. Otherwise a quote that differs decides the outcome, and the reasons to review that come with it, such as a reference touched by the same change, are stored beside it and listed in the pull request. A reference to a whole act, with no article, names no unit and never affects the outcome, so every change of an act cited only that way, as the Fiscal Code is, resolves itself.

The comparison is of the law with itself. The portal keeps every earlier consolidated form as a page of its own, linked from the act's history. On a change, the job compares the **verified form**, the one the templates were verified against, with the new one, for the units we cite, headings and the text the portal keeps preformatted (tables, lists, forms) included. An act never consolidated has no verified form: the templates were checked against the act as published, which the portal shows on the act's page with `?isFormaDeBaza=True`, so its first consolidation is compared with that. Only when that page holds no text of the act does the change need review, with nothing compared. Both sides are the portal's text, so the comparison is exact, punctuation included. Comparing the templates with the current law was tried first and rejected: across 25 acts, 84 quotes differed from today's text. Some were the provider's rewording ("Prezenta hotărâre" spelled out as the act's title, merged or renumbered articles), some were quotes adapted with merge fields, and some were markers naming more of an article than they quote. Only a handful were real drift. Every later change of those acts would have come back as a differing quote. The form each act was verified against is recorded by a migration, so a new or wiped environment starts from the same forms instead of from whatever it sees first.

(Amended 2026-11-13.) The Worker assesses an act's open changes oldest first, right after reading the act's page. A run assesses for at most ten minutes, since the platform stops a cron run after fifteen, and the changes left over wait for the next run. A change whose assessment fails, because a form cannot be fetched or is not on the portal, fails no run: the next run tries again, and once it has failed for three days the change is stored as needing review with the reason, so an act the check cannot compare never holds up its newer changes. The outcome is written last, so a run that stops halfway leaves the change to be assessed again from the start.

**The verified form moves forward only.** (Amended 2026-11-13.) Resolving a change, whether by the Worker as no impact, by the platform admin or by the registration of the version that answers it, moves the act's verified form up to the change's form, never back, so the next change is compared with the form the templates now quote. The one way back is the admin's explicit correction of a verified form recorded wrong. The Worker never assesses an open change at or before the verified form, so the admin may not resolve a change while an older change of the same act is open, nor record a verified form at or after an open change.

**Notifications go to Discord, for the platform admin.** Each environment's Worker posts to its own channel, `#legislatie-prod` and `#legislatie-non-prod`. The second shows any drift between the two analyses and can be retired. (Amended 2026-11-13.) The Worker posts:

- the run's changes left open, together, ten embeds to a post for Discord's rate limit, each with its outcome, the amending acts and the units amended, followed by the law's old → new text of every quoted unit that differs and the reasons to review;
- one line for each change resolved as no impact, the run's lines in one post;
- the changes the run read but could not assess, or left for the next run;
- a failed or stopped run;
- at the start of every cron run, no successful run in two days, since a run the platform killed never posts its own failure.

`legislation-fix.yml` posts to production's channel:

- each pull request it opens, with our text's old → new, the note and the sentences the model proposes; each issue, with its reasons and the law's change;
- a change it failed to answer;
- its own warning of no successful check in two days, kept quiet when the Worker's last run failed within 26 hours, a failure the Worker has posted itself;
- on Mondays, the open changes whose pull request or issue was closed, which it no longer answers by itself.

The webhook is the secret `DISCORD_LEGISLATION_WEBHOOK` of each environment. Legislation is public text and the messages carry no personal or client data, so ADR 037's rule for alerts holds. Members still learn nothing by message: they see a change "în verificare" on their Legislație page until it is resolved, as before, and no email is sent to anyone.

**The fix is a GitHub Action, not the Worker.** `legislation-fix.yml` runs daily after production's run, and by hand. It reads production's open changes whose quote differs or that need review. Only production's changes are answered: the templates are shared, and non-prod's detections serve the drift comparison. An act with several open forms gets one pull request: the newest form whose quote differs was compared with the verified form, so its change covers the older ones, and its manifest change lists them in `resolves` beside its own. A newer form that needs review still gets an issue of its own. For a change whose quote differs it:

- applies the law's own change, old words → new words, to the template's passage with the engine's tool `replace-quote`, the command a person runs by hand. The tool places a change only within the unit the law's change names, and only where its old words, with as many words around them as it takes, occur once in the law's unit and once in our passage. Either every change to the passage is placed or nothing is written. The provider's rewording and the merge fields around the change survive. The tool keeps the template's conventions (its diacritics, act names, quote marks and superscripts) and changes the copies `copied-passages.json` lists too;
- regenerates the citation index;
- writes the template's manifest change `{ kind: 'legal', note, resolves }`, where `resolves` is one `{ act, consolidatedOn }` or a list of them, joined to the template's change not yet released when there is one;
- asks a model through the AI Gateway for the note and for a reading of the template's own sentences that restate the changed rule;
- opens the pull request with a GitHub App's token, since one opened with the Action's own token starts no CI;
- posts the replacements and the link to Discord.

The Action needs no portal access: the Worker stored the law's text of both forms. The Worker holds no GitHub token. The amendment above put the pull request in the Worker because a Worker can edit Word XML, which is still true. But the Action has the repository, its tools and its tests, and a schedule's delay does not matter for a fix that waits for a review anyway. A change the tool cannot place, because it needs a person (the tool exits 3) or because our passage holds none of what changed (it exits 4), opens an issue instead, and so does a change that needs review.

(Amended 2026-11-13.) The model writes the note members read, one line of at most 300 characters. A note the model fails to give, or one with a line break, a heading, code or markup, is replaced by a plain note that names the units and the amending acts. The model also reads the paragraphs of our own around the quote that may restate the changed rule, chosen beforehand by the words they share with the law's old and new text. The edits it proposes are listed in the pull request and in Discord and never applied: a person applies the right ones on the branch before merging. The comparison alone decides that the quote changes; the model only words the note and points at sentences.

(Amended 2026-11-13.) A change is answered once. One with an open or merged pull request, or an open issue, found by its branch or by a marker in the body, is skipped, and so is one that a manifest on main already resolves, until a release registers it. One whose pull request or issue was closed is skipped too, and listed on Mondays, until it is named in the workflow's `change` input, which answers it again, on a new branch when its pull request was closed.

(Amended 2026-11-13.) The GitHub App's token is minted for contents and pull requests and never stays in the checkout: in git it reaches only the `git push` and `ls-remote` that talk to GitHub, and otherwise only opens and labels the pull request. The issues are opened with the Action's own token.

**The drift that exists is fixed once, by hand.** The comparison of every quote with the current law, kept as the script `legislation:verify-quotes`, gave the list of 84 for a one-time review. That review brings the real drift up to date. It narrows markers that name more than they quote, and it keeps the provider's rewording and the adapted quotes. The provider signs off on the review's pull request. After it, every act's verified form is its current one.

**The merge is the sign-off, and registration resolves.** A person reads the replacements, in Discord or the pull request, and merges. Registration links the new version to its change by act and consolidation date in each environment, since a change's id differs between environments, resolves it and moves the act's verified form up to the change's form. An environment that never recorded the change gets it recorded as resolved.

(Amended 2026-11-13.) A version may answer several changes: the older open forms of one act, or changes of several acts that reached one template before a release. A change is answered by a version of each template that quotes it. `template_version_legal_changes` lists the pairs, and the manifest's `resolves` is one change or a list. Registering a file already registered keeps its version, kind and note, and still resolves the changes its manifest names, since a file can already quote a form whose change was recorded after it was registered.

### A template version says why it exists

A template version gains a **note** for users, a **kind** and, when it answers one, the legal change it resolves. The kinds are **legal**, a change in a quoted or referred text; **correction**, a fix of the template's own content, such as the audit's pictogram captions and diacritics; and **layout**, which changes no words. `register_built_in_template_version` takes the three, and `templates:register` reads them from the manifest or its arguments. A legal or correction version prompts regeneration; a layout version is silent. Without the three, the page below could tell a specialist to regenerate and could not say what changed.

### The Legislație page and in-app notice only

Each organization has a **Legislație** page. It lists the watched acts with their status, the consolidated form last seen and the date last checked, and the legal changes: open ones as "în verificare", those resolved with no impact as such, and those answered by a template version with the version's note, the text that differs between the two versions, and the documents **behind** it: for each document type, the clients whose newest revision was generated from an older version of a kind that prompts, with their count and a way to regenerate for all of them. A document is behind by its revision's template version alone, so a hand edit changes nothing about whether it is behind.

The documents behind are also marked where documents are listed, as "Date modificate" marks a draft today. Nothing is sent by email, and no document prints a "verified on" date: the client does not read it, the inspector checks content, and a wrong date is a liability. The dates belong on this page.

(Amended 2026-11-13.) Every change shows its amending acts, the units amended, and the law's old and new text of each cited unit, from the text the job stored, with the documents that quote or refer to it. An open change says whether it touches a quote, only an article the documents refer to, or was not assessed yet. A resolved one shows its note, and one answered by template versions names the documents they update.

### The admin area's Legislație page

(Amended 2026-11-12.) The admin app ([ADR 038](adr-038-admin-area.md)) has a Legislație page for the platform admin. It lists the changes with their outcome and resolution; a change's own page shows its amended units, the reasons to review, the law's old → new text of every cited unit, the template versions that answer it and the act's older open changes. It also shows the watched acts with the form each was verified against, and the run log. On it he marks a change as no impact with a note, links a change to a template version that answers it, and records an act's verified form, which may correct a wrong one. A version can answer a change when it is of a template the change's passages name, was registered after the change was seen, is not a layout version, has a note and answers no other change. The page replaces resolving changes by hand in SQL, and it is the only screen that writes the legislation data; the Worker and registration write it too.

(Amended 2026-11-13.) The three writes are database functions that run as their owner (security definer), called with the admin's own token. Each checks `is_platform_admin()`, which asks for a session past the second factor (`aal2`), and writes its named event to `audit.events` in the same transaction. This departs from ADR 038, whose other admin writes go with the secret key and the `x-audit-actor` header: here the database itself decides who may write, so a write can neither come from anyone but an admin nor happen without its event. Each function also refuses what would leave the data wrong, and the page says why: resolving a change already resolved, one the daily check has not assessed yet, or one while an older change of the act is open; linking a version that cannot answer the change; and recording a verified form newer than the last form seen on the portal, or at or after an open change of the act.

### Bulk regeneration runs in a queue

Regenerating a document type for every client behind it is one action on the page, run through a queue (Cloudflare Queues), one message per client, each going through the regeneration path a single document uses today. A hand-edited draft is skipped and listed for the specialist, since regenerating it would discard the edits (ADR 005). An issued revision gets a new draft; issuing stays per client, where the signatures are. The page shows progress and the result. Driving the loop from the browser was rejected: a closed tab or a crash would leave an organization half regenerated with no record of which half. This is the first background job in the codebase and the action that every template fix, legal or not, has needed since the audit's fixes left every client on older versions.

### What is left out

- The organizations' own files, which the index does not read.
- The rules encoded in code. An alert for H.G. 1425/2006 reaches a person who greps the migrations, whose comments already cite the articles; a second index for ten constants was rejected.
- Email of any kind.
- A verification date printed in documents.
- Watching for a document's own data going stale, which the snapshot does already.
- Fixing the drift that exists today, which the open content issues do by hand before the first verification dates are recorded. (Amended 2026-11-13: the drift was fixed once, by the review of the quotes in step 8c, before every act's verified form was recorded; this feature answers only the changes after it.)

## Consequences

- The templates get machine-checked for how they cite the law. A template that quotes an act the index does not know, or that the portal has repealed, fails the build, and every act's spelling is one.
- The product depends on a government site's HTML. The dependency is contained to one job whose failure is visible, and the feature falls back to a manual check with a recorded date rather than to a stale "checked" state.
- A third sibling Worker joins mail and PDF, with a cron trigger, the database's secret key, a GitHub token and a model gateway among its secrets, and it opens pull requests. The API gains its first queue. (Amended 2026-11-13: the Worker holds neither a GitHub token nor a model gateway and opens no pull request; it has the relay's Access service token and a Discord webhook beside the secret key, and `legislation-fix.yml` opens the pull requests.)
- Template versions become meaningful to users: release notes per template, with a kind that decides whether anyone is asked to act.
- The provider's sign-off stays the gate on legal content, as a merge, and the whole pipeline before it is automatic.
- "Resolving" a change has no screen and no role: it happens in the repository, in a pull request and the registration that follows its merge. Members read; nobody in the app writes to the legislation data. (Amended 2026-11-12: the platform admin resolves changes as no impact, links them to the template versions that answer them, and records verified forms, on the admin area's page.)
- (Amended 2026-11-12.) The repository gains a GitHub App with write access to contents, pull requests and issues, used only by `legislation-fix.yml`, whose token never stays in the checkout. The Worker gains a Discord webhook and no GitHub token.

## Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. The citation wording pass on the templates: one spelling per act, one separator before the article.
3. The parser, the index file, the hygiene test and the act list with portal ids; the spike that fetches a portal page from a Worker and reads the portal's robots.txt.
4. The note, kind and resolved change on template versions, in the database function, the manifests and `templates:register`.
5. The watched acts, legal changes and run log in the database; the legislation Worker's daily check, with the run log as its alert; the verification dates once the content issues close.
6. The Legislație page, read-only, with the documents behind.
7. The queue and bulk regeneration from the page.
8. The resolution steps of the Worker: the text comparison, the model's proposal, the pull request and the issue it falls back to. (Amended 2026-11-12, replaced by 8a–8g.)
   1. Reading the full text, earlier forms and the portal's notes; the comparison of two forms for the units the index cites; a check of every quote against today's text.
   2. The engine's tool that applies a law's change to a quoted passage in a template and its copies.
   3. The one-time review of the quotes that differ from today's law.
   4. The outcome and passages stored per change, verified forms recorded for every act, and changes with no impact resolved by the Worker.
   5. Discord messages from the Worker, per environment.
   6. The admin area's Legislație page.
   7. `legislation-fix.yml`: the replacement, the model's note and reading, the pull request and its Discord message, and the registration that links a version to its change. Its first run answers O.U.G. 195/2002 art. 36 alin. (2).

## Open

1. Whether to add the Monitorul Oficial table of contents as the second signal, and when.
2. Whether the pull request may merge itself once the comparison, the tests and a period of reading the model's proposals have earned it. (2026-11-12: not yet. The first candidates are pull requests that only replace quotes and whose model reading found no sentence of ours to change.)
3. Whether an act the index names only through references, never a quoted article, should be watched at all, or listed and not fetched.
