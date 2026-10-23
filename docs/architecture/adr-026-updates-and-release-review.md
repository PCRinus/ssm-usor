# ADR 026: Updates written per pull request, reviewed at the release, read from a table

- Status: accepted
- Date: 2026-10-24

## Context

A release is one click ([ADR 025](adr-025-non-production-environment.md), amendment of 2026-10-23): **Deploy production** takes the newest commit non-prod has run, tags it with the date in Bucharest, publishes a GitHub release whose notes are the titles of the merged pull requests, and deploys. The notes are English, written for developers, and created in the same second as the tag; nobody reads them before they exist. The app learns the tag alone, through `VITE_RELEASE_TAG`, and prints it in the sidebar's footer as "Versiune 2026.10.23".

The waitlist's users are about to arrive and will meet a product that changes every few days. Mircea wants them told what changed, in Romanian and in their words, and wants to read that text before it ships, while keeping the release at one click from the Actions page. The GitHub release form was already rejected on 2026-10-23 as clumsy to fill.

The look was settled on 2026-10-23 and 2026-10-24 on a design canvas (ten boards, "Actualizări — release notes mockups"). The feature is called **Actualizări**. After signing in, a member with unread releases sees a dialog: on the left a sand panel with a hanging calendar tag, red header, the release's month circled, the version in Inter numerals; on the right the release's headline, a lead paragraph, up to three new features with an icon each, "și încă N îmbunătățiri", and two buttons, **Am înțeles** as primary and **Vezi detaliile** as secondary. "Actualizări" sits at the bottom of the sidebar with a badge of unread releases, and the footer's version links to its release. The release page has the sand header with the tag, then three sections only, **Ce e nou** (cards with a title, a paragraph and "Unde o găsești: …"), **Îmbunătățiri** and **Remedieri** (plain lists), and a link to the previous release. The list page shows every release newest first, grouped by month, each with its headline, summary and counts, a "Necitită" mark and a "Marchează toate ca citite" button. Rejected on the canvas: a carousel, a "you also missed" line, a technical-details section, filters, chips for new templates, Roman numerals and a condensed display face.

What this ADR decides is the pipeline behind those screens: where the words come from, where they are reviewed, and how the app reads them.

## Decision

### A release is a version, an update is what users read about it

A **release** (_versiune_) stays what ADR 025 made it: a commit on `main` tagged with its date and deployed to production. An **update** (_actualizare_) is the account of one release written for members: a **headline** (_titlu_), a **lead** (_rezumat_) of one or two sentences, and its items in three sections, **new features** (_Ce e nou_: a title, a paragraph, where to find it in the app, and the name of a lucide icon), **improvements** (_Îmbunătățiri_) and **fixes** (_Remedieri_), both plain lines. Every line is written for the specialist who uses the app, in Romanian, and says what they can now do or what no longer goes wrong, never how. A release whose merged pull requests changed nothing a member sees is **silent** (_fără actualizare_): it exists on GitHub with its tag and nothing of it reaches the app.

### Each pull request carries its lines

A pull request that changes what members see carries its update lines in its description, under a heading `## Actualizări`, in the dialect below: new features as `### ` headings with their paragraph and labelled lines, improvements and fixes as list items under `## Îmbunătățiri` and `## Remedieri`. Whoever writes the pull request writes them, which today is the agent, so the text is machine-generated, and Mircea reads them when he reviews the pull request, which he does anyway. A pull request with no heading contributes nothing: dependency bumps, CI, documentation, refactors, and the pull requests of a stack except the one that completes the feature. No check fails a pull request without the heading; the review below catches an omission, and a check would make every internal pull request declare itself.

### Deploy production assembles, pauses for approval, then publishes

The job **Choose the release** keeps choosing the commit and the tag. It then finds the pull requests merged between the newest release in the chosen commit's history and the chosen commit (amended 2026-10-24: not since the release production runs, which after a rollback or a deployment that failed is older than the last published release, whose items members were already shown), collects their `## Actualizări` blocks in merge order, and assembles one update: the sections concatenated, the headline and the lead drafted as below. It writes the result to the run's summary and creates the GitHub release as a **draft**, with the update as the body, a horizontal rule, and the generated list of pull requests after it for developers. A draft release is visible to the repository's writers only and creates no tag, so at this point nothing has happened that a user, or a rollback, could see.

A job **Approve the update** then waits on a GitHub environment, `release-approval`, whose required reviewer is Mircea. GitHub notifies him; the run page shows the summary and a "Review deployments" button. He reads the draft release, edits its body in GitHub's release editor where the wording needs it, and approves. A rejection fails the run, and the draft stays for the next run to delete. The `production` environment gets no reviewers of its own: the gate is one job, so one approval covers the whole run, and the thirteen production jobs never queue behind a second one.

After approval, a job **Publish the update** reads the draft's body again, since it may have been edited, parses the update out of it up to the horizontal rule, fails the run before anything else if the dialect is broken, publishes the release, which creates the tag, and writes the update to the `releases` table of non-prod. Then production deploys as today, and its row is written once the deployment has succeeded (amended 2026-10-24: the migration that creates or changes the table reaches production inside that deployment, and members should meet an update only once its release runs). A run with a tag, the rollback path, skips the gate and the publishing, since that release was approved when it was made, but rewrites its update from the release body before deploying: that is how a typo found after release is fixed, by editing the published release on GitHub and running Deploy production with its tag.

A release pull request was rejected: a bot keeping `releases/next.md` open on `main`, appended at each merge and merged by hand to approve. It reviews in the diff view and keeps the notes in git, but it costs a bot commit per merge and per release, the file cannot know its tag since the tag is the day of the release, regenerating it must not clobber hand edits, and the release becomes merge, wait for non-prod, click. Reviewing per pull request alone, with no gate, was rejected because the assembled whole is never read as a whole before it opens in front of every member. A separate "Prepare release" workflow before Deploy production would also work and needs no environment, at the price of two clicks; the gate keeps one.

### The headline and the lead are drafted by a model, with a plain fallback

The lines come from the pull requests, but a release needs one headline and one lead that no pull request wrote, and five pull requests about one feature may leave five lines where one was meant. In **Choose the release**, Claude receives the collected blocks and the titles and bodies of the merged pull requests and returns the headline, the lead, the items merged where they overlap, and a line for any pull request that looks user-facing yet carries no block, each such line suffixed "(propus)" so that the reviewer sees it was not written by a person. The model never invents an item that no pull request supports, and the reviewer edits or deletes what it wrote like any other line. Without an API key, or when the call fails, the fallback is deterministic: the headline is the first new feature's title, or the first improvement when there is none, and the lead is empty. The model is not on the path that publishes: the gate is.

### The release body is the source, a `releases` table is the copy the app reads

The published release's body is where the update lives and the one place it is edited. The app reads a table, `releases`: the tag, the publish time, the headline, the lead, and the three sections as structured data, together with the body it was parsed from. Only the workflow writes it, with the environment's Supabase secret key as `seed.yml` does, by an upsert on the tag: row-level security grants members a read of every row and nothing else, and the API exposes no write. Nobody edits the table by hand, by decision; a correction is an edit of the release body and a run with the tag.

Baking the updates into the SPA's bundle at build time was considered: the production build runs after approval and could fetch every release into a JSON file, with no table and no endpoint. It was rejected because a typo would need a release to fix, because non-prod and local builds would have nothing to show, because a rollback would ship an older list, and because the acknowledgment below wants a column anyway. Reading GitHub's releases API from the API Worker at request time was rejected for the runtime dependency, the rate limit and the drafts to filter.

Non-prod receives the same rows as production, written by the production run, so testers see what members see. Where fake data is allowed, the seed may also insert invented releases, so the screens can be tried before the first real update exists.

### Who sees what, and when it stops being new

The update is for members, in the app. The portal shows nothing of it: a participant signs in to sign or to take a test, and the releases change the specialist's work, not theirs.

A release is **unread** (_necitită_) for a member when it was published after their account was created and after the release they last acknowledged. A new account therefore meets no dialog about history. The last acknowledged tag lives on the profile, so it follows the member across browsers. **Am înțeles** in the dialog, **Marchează toate ca citite** on the list page, and opening the page of the newest release each acknowledge everything published so far. Closing the dialog with its cross dismisses it for the browser session only; the badge stays, so the dialog nags nobody and hides nothing. The dialog opens once per session, after sign-in or on the first page load with unread releases, shows the newest release only, and counts the rest in the badge. "Vezi detaliile" opens the release page, which acknowledges.

The pages are the app's `/actualizari` and `/actualizari/<tag>`; the sidebar entry sits at the bottom with the badge, and the footer's version links to its release page when a row exists for it, as the canvas shows.

### The dialect

One grammar, parsed by one script used by the collector and by the publisher:

```
# Teste de verificare, direct din portal
Dai un test angajaților unui client, ei răspund de pe telefon, iar rezultatul intră singur în fișa individuală.

## Ce e nou
### Teste compuse din banca de întrebări
Alegi tematica, câte întrebări intră și pragul de promovare.
Unde o găsești: Client, fila Instruiri, butonul Test nou
Pictogramă: clipboard-check

## Îmbunătățiri
- Lista de angajați arată cine e la zi și are un filtru „La zi”.

## Remedieri
- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.

---
```

The `#` heading is the headline and the paragraph under it the lead; a pull request block carries neither, since they belong to the release. "Unde o găsești" and "Pictogramă" are optional; an icon name must exist in lucide, and an unknown one fails the parse. A section that is empty is left out. Everything after the horizontal rule is for developers and is not parsed. A body with no section at all, or only the rule and the list, is a silent release and writes no row.

## What is left out

- Images per release. The tag is drawn from the version, icons are lucide by name, so no files travel with an update. A screenshot per release (board B of the canvas) is not built.
- Emails or in-portal notice about a release. The dialog is the only notice.
- Editing updates in the app, an admin screen, or anyone writing the table but the workflow.
- Updates for the marketing site or a public changelog page. The pages live behind sign-in; a public page can read the same table later.
- Translating updates: the app is Romanian only; the portal's English of ADR 022 does not apply since the portal shows none of this.
- A check that a pull request carries a block, and a label to exempt one.

## Consequences

- A release is one click and one approval, and the approval is where the wording is read as a whole. A release nobody approves does not happen; Mircea is the only reviewer, so a release waits for him, which is the point.
- Pull request descriptions gain a user-facing section in Romanian beside the English developer text. `CLAUDE.md`'s pull request rule says so, and the agent writes it.
- `deploy-production.yml` grows two jobs and a parser script; the `release-approval` environment is created by hand with Mircea as required reviewer and self-review allowed, since he also starts the run.
- The schema gains a `releases` table and a column on `profiles`; the API gains a list, a detail and an acknowledge endpoint; the app gains a dialog, two pages, a sidebar entry and a badge.
- The GitHub release body keeps the generated pull request list after the rule, so developers lose nothing of today's notes.
- `docs/ci-cd.md`, `docs/data-model.md`, `docs/api.md` and `docs/app.md` describe the gate, the table, the endpoints and the screens.

## Order of work

1. This ADR, and the glossary terms in `CONTEXT.md`.
2. The dialect and its parser as a small package or script with tests: a block in, structured sections out, errors named by line.
3. The table, the profile column, the policies, and the API: list, detail, acknowledge, with the seed able to insert invented releases where fake data is allowed. On step 2 for the shape of a row.
4. The app: the dialog, the pages, the sidebar entry and badge, the footer link, on the canvas's boards. On step 3; built against seeded releases on non-prod.
5. The workflow: the collector in **Choose the release**, the draft release, the `release-approval` gate, **Publish the update** with the table write to both environments, the rollback path's rewrite. On step 2. The `## Actualizări` rule in `CLAUDE.md` lands with it, so the pull requests merged after this step carry blocks for the first real update.
6. The model draft of the headline, the lead and the merged items, with the deterministic fallback already in place from step 5.
7. The documents of the consequences above.
