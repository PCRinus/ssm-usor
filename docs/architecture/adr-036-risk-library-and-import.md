# ADR 036: The risk library as "Evaluări de risc", and evaluations read from an imported pack

- Status: accepted
- Date: 2026-11-02
- Amended by [ADR 037](adr-037-import-quality-and-alerts.md) (accepted 2026-11-04): a risks library part keeps `quality` counts, its reading version and flags (the columns found on each sheet among them), and leaves an improvement copy of its proposal and the member's changes, kept apart for 12 months; its review gains a report entry.

## Context

[ADR 015](adr-015-risk-assessment.md) gave each client a **risk evaluation** per post, and each organization a library of **evaluation profiles** that are copied into evaluations. [ADR 034](adr-034-own-instructions-as-app-text.md) reworked the other library, the own instructions, and made the client import read them from a pack. It left the risk evaluations "to a decision of their own". This is that decision.

The risk library as built:

- **Its name says little.** The sidebar reads "Riscuri", the page "Biblioteca de riscuri", an entry is a "profil". "Profil" also names the member's own profile ("Profilul meu"). Mircea's SSM contact, asked what he would call the page, said "Evaluări de risc".
- **That name is taken on the client's side.** A post's page has a section "Evaluare de risc", its evaluation page is headed "Evaluare de risc", the positions table has a column "Evaluare de risc", and the client-level card is "Evaluări de risc în afara posturilor".
- **An entry is made by hand only.** "Profil nou" creates an empty profile by name; "Salvează în bibliotecă" copies a client's evaluation. There is no upload, paste or import anywhere, so nothing has to be removed first, as the Word upload was for instructions.
- **An entry holds factors only.** The work-system texts (means of production, work environment, exposure) live on the client's evaluation alone. The plan fields (actions, deadline, person responsible, observations) are on both the profile's factors and the evaluation's.
- **Deleting is always allowed**, even while clients use the profile; their factors stay and lose their pointer. An instruction module, which clients link to rather than copy, cannot be archived while it is applied.
- **The list** shows the name, the factor counts, the global level and the date; it has no usage, no archive and no search.
- **No help article** covers the library or the evaluation page, though ADR 028 reserved the area.

The client import of [ADR 030](adr-030-import-from-documents.md) already sorts the pack's risk assessment and prevention plan as `risk_assessment` and reads them in the client reading for posts, staff categories and the evaluation team. Their factors, classes and measures are dropped.

The five reference archives, read for this ADR:

- **All five come from one provider and one Word template.** No archive from another provider is available. The reader is built on one layout, and how it fares on others is to be learned in production (#802).
- **Each post's sheet is one table of seven columns:** component, group, "F3. description", consequence, gravity, probability, level. Gravity, probability and level are bare digits; the component and the group are merged cells, empty on the rows below their first. 381 factor rows in all, 11 to 47 a sheet.
- **The import's reader keeps the tables.** `docxToText` writes each row as `| a | b | … |`; all 381 rows come out as clean seven-cell rows and the plan's as eleven-cell rows.
- **The pack's own figures are often wrong.** In 5 % of rows the printed level disagrees with the method's grid; in 9 % the consequence disagrees with the gravity class. A post's stated global level can be stale, and a ranking table can name a post the client does not have.
- **Copies abound.** The sensitive groups' sheet is often a byte-for-byte copy of a post's. One sheet can cover several job titles. Eight to eighteen identical factors with identical classes recur between clients: the provider works from a library of its own.
- **Measures sit in two places.** The assessment's measures sheet gives the unacceptable factors' measures as one text, sometimes labelled "Măsuri tehnice: … Măsuri organizatorice: …". The plan has one column per kind for most factors, but names no factor code: 60–85 % of its rows match a factor word for word, a few match none, and one plan was older than its assessment.
- **The plan's deadlines and people are roles, not names:** "Periodic", "Permanent", "Anual"; "Cond. loc muncă / Serv. extern", "Administrator".

Mircea decided on 2026-11-02:

1. The sidebar entry and the library page are **Evaluări de risc**. The client's side is renamed instead: a post's evaluation is its **Fișa de evaluare**, the name document 9 prints ("Fișa de evaluare a locului de muncă").
2. The library works like Instrucțiuni proprii: an entry no client uses can be deleted; one that any client uses can only be **archived**. Clients keep copies, not links. The list gains a usage column. Unlinking a client from an entry is #801.
3. A library entry also holds the **work-system texts**, copied with its factors.
4. A library entry's plan fields are **defaults**, copied into an evaluation and changed there for the employer.
5. The import fills **both** the library and the new client's evaluations.
6. A post that already has factors: **the specialist decides** what happens to it.
7. The sensitive groups' and other client-level sheets are imported whenever the pack has them.
8. **PDFs and scans are read too.**
9. Text written by an earlier provider is imported like the rest, as for instructions.
10. The import's credits keep today's setup: a flat amount for the reading. The pricing of imports is discussed later.
11. The quality record and alerts for all imports come **after** this, in one decision of their own (#802).

## Decision

### The names

The library is **Evaluări de risc**: the sidebar entry, the page's title and its breadcrumb. Its subtitle stays: "Posturile pe care le evaluezi o dată și le aplici la orice client." An entry is an **evaluare de risc** of the library, named by its post ("Bucătar"):

- "Profil nou" becomes **Evaluare nouă**; "Aplică un profil" becomes **Aplică din bibliotecă**, and its dialog lists the library's evaluations;
- "Salvează în bibliotecă", "Unde este folosit" and the factor's origin ("în evaluarea Bucătar din bibliotecă") keep their place with the new noun;
- every "profil" in the app's text goes.

A client's evaluation is its **Fișa de evaluare**:

- the post page's section and the evaluation page's heading read "Fișa de evaluare";
- the positions table's column reads "Fișa de evaluare";
- the client-level card reads "Fișe de evaluare în afara posturilor".

What names the work or the document stays: document 9's title, the setup guide's "Evaluează riscurile posturilor", the missing-data labels and the documents tab.

The addresses follow ADR 035, with no redirects: `/evaluari-de-risc` and `/evaluari-de-risc/$profileId`; a post's `…/posturi/$jobPositionId/fisa-de-evaluare` and a client-level one's `…/posturi/fise-de-evaluare.$evaluationId`.

The code keeps its names: `evaluation_profiles`, `/evaluation-profiles`, `EvaluationProfile*` for the library, `risk_evaluations` for the client's. Renaming tables and routes for a word on screen was rejected; the glossary maps the two.

"Evaluări de risc tip" was rejected by Mircea as reading wrong. "Fișe de evaluare" for the library was rejected because the library is what specialists call evaluations, and "fișă" already names the individual training sheets.

### The library's lifecycle

An entry is **in use** while any client's factor points at one of its factors (ADR 015's provenance, amended 2026-10-05), archived posts and clients included, since their factors still exist.

- **Deleting** is offered only for an entry not in use. For one in use, the menu offers **Arhivează** in its place, and the API refuses a delete with the reason.
- **Archiving** hides the entry from "Aplică din bibliotecă" and from the import's comparison. It keeps its usage, its page and its factors, and **Reactivează** brings it back. Archiving is allowed in use, unlike an instruction module: a client holds a copy, so nothing a client prints depends on the entry.
- **The list** gains the column **Folosită la**, "3 clienți": the clients that "Unde este folosit" lists, which leaves out archived posts. And **Arată arhiva**, as on Instrucțiuni proprii.
- **Names stay unique** across active and archived entries, as today.
- Deleting a factor of an entry in use is still allowed and clears its pointers, as today; only the whole entry is protected.

That an entry once used can never be deleted is accepted. Unlinking, which would make it deletable again, is #801.

### What an entry holds

An entry gains the evaluation's three work-system texts: **means of production**, **work environment** and **exposure**, all optional. Exposure has no default on an entry.

- **Applying** an entry fills only the evaluation's empty texts and never overwrites one; the exposure counts as empty while it is still the default "8 h / schimb". Two entries applied in turn fill from the first.
- **Saving** an evaluation into the library copies its texts.
- **The entry's page** shows them in the same "Sistemul de muncă" card as the evaluation page.

The entry's factors keep their plan fields, which become **defaults**: applying copies them, and the specialist changes them on the client's sheet. The page says so above the factors.

### The evaluations read from the pack

**The library part.** The import gains a third library part, `risk_evaluations`, beside `instructions_ssm` and `instructions_su`. It has no domain: the documents it reads are SSM only, and fire risk lives in the SU data (ADR 019). It is created when sorting finds `risk_assessment` files, runs when the client proposal is ready, and follows the instructions parts' life: its own status, reading, retry and refund, review after the client, confirm on its own, expiry 14 days after the client, tokens and cost on the import and on the part, gateway metadata naming the part.

**The model points, code copies.** One request to GPT-6.1 Terra receives the pack's `risk_assessment` files as the client reading prepared them, with each table row numbered (`R212 | … |`), and the proposed posts. It returns:

- `sheets`: one per evaluation sheet. Each gives its file; the heading as written; its kind, `job_position`, `sensitive_groups` or `other` with the name as written; the proposed posts it evaluates, several when the heading names several; the rows its factor table spans; which cell of a row holds the component, the group, the description, the gravity, the probability and the printed level; and the start and end words of its means of production, work environment and exposure.
- `measures`: for each row of the assessment's measures sheet, the factor row it belongs to and, where its text mixes kinds without labels, the start words of each kind.
- `plan`: for each row of the plan, the factor row it belongs to, or none.

Code then copies, never the model:

- each factor row's cells, carrying the merged component and group down from the row above, and dropping the "F3." code;
- the component, mapped from the label by folded match to the four of the method ("Mijloace de producție", "Sarcina de muncă", …), else flagged;
- the group and the description as written;
- the plan row's four measure columns as measures of those kinds, and its actions, deadline, person responsible and observations;
- a measures-sheet text, split on its "Măsuri tehnice:" labels or at the model's start words, for a factor the plan does not cover;
- the work-system texts at the quotes' places.

Retyping was rejected for Word files: the answer would be some 25 factors a sheet written out, a long and costly output, and a retyped class or description can drift where a copied one cannot.

**PDFs and scans** have no rows to point at. The same request, for those files, returns each sheet's factors written out with a quote of the row, and every factor read this way is marked **Verifică** in the review. The scanned pages are read as the client import reads them (ADR 030) and charged per page, as there.

_Note, 2026-11-02, from building step 6:_ a plan row can name two risks ("… / …"), and one block of the plan can name the posts of two sheets, so `plan` gives each row every factor row it belongs to, none or several. A PDF's measures sheet has no rows to point at either: a factor read from a PDF takes its measures from the plan alone, joined by its description. Since the notes of 2026-11-04 below, the requests that write a PDF's factors out write their measures and plan fields too.

**Checks, never corrections.** The classes are the evaluator's judgement (ADR 015), so the import copies them as written and never proposes one:

- a printed level that disagrees with the grid shows both, "în document: 2, după metodă: 3", and the sheet takes the grid's;
- a consequence that disagrees with the gravity class is shown, since the app prints the class's own wording;
- a class missing or off the scale leaves the factor unticked until the specialist sets it;
- a quote not found, a row the model placed in no sheet, and a plan row that matches no factor are listed for review.

**Which posts take which sheet.** A sheet that names several posts applies to each. A heading that matches no proposed post is left undecided with its words shown, and the specialist picks the post or leaves it to the library alone. A `sensitive_groups` sheet becomes the client's sensitive-groups evaluation; an `other` sheet becomes a client-level evaluation by its name ("Vizitatori"). Copies stay copies: a sensitive groups' sheet identical to a post's is still imported for both.

**What counts as already in the library.** The pack is first compared with itself, so identical sheets make one entry. Each sheet is then, against the active entries:

- **identical** when its factors match one-for-one on component, folded description and both classes; it is not offered as a new entry;
- **similar** when at least 70 % of its factors match an entry's on component with a description word-trigram Jaccard of 0.8 or more; it reads "Ai deja o evaluare asemănătoare: Bucătar", with **Ce diferă**: the factors only in the pack, only in the library, and those with other classes or measures;
- **new** otherwise.

Measures, plan fields and texts are left out of the match. A taken name is proposed with the client's name after it, "Bucătar (Royal Hotel)", editable, as for instructions.

_Note, 2026-11-07, an entry's name:_ an entry is reused at other employers, so a new one read from a pack is no longer named by its post first. The risks request asks, for each post's sheet, a name for its work (`workName`): in Romanian, two to five words, reusable at other employers, with no client's or person's name, and different for each sheet of the pack ("Activități de birou", "Lucrări de sudură"). The proposed name is that name, else the workplace code reads from the heading ("LOCUL DE MUNCĂ : BIROU" gives "Birou"), else the post as before. A name that holds the client's name, or the name of one of the client's people, is passed over, and a taken name still gets the client's name after it. The sensitive groups' and the other client-level sheets keep their names. The proposal also gives each sheet the work's name and the workplace, for the review's rename options. Measured against the reference answers on the five archives, before and after the change: every sheet, factor and class still right (381 of 381), and all 8 post sheets named by their work, each name its own in its pack, none holding the client's name or a person's (before, all 8 were named by their posts). The reading costs the same, $0.045–0.095 a pack and $0.095 for the dearest, so the credits stay 15. In one of two runs of the largest archive, the model changed one word in quoting a work-environment text that three sheets repeat, so those texts were not found; the other run found them, as main's prompt did.

**The review.** The hub gains a group **Evaluări de risc** with one task. It lists one card per sheet:

- the sheet's heading, kind and posts, with the picker for an undecided one;
- the factors as a table, each with its tick, component, group, description, gravity and probability selects, computed level, measures, plan fields and flags; **Sursa** shows the row in the file;
- the library choice: **Adaugă în bibliotecă** or **Nu adăuga** for a new sheet, which a client-level one defaults to, and **Folosește ce ai** or **Adaugă ca nouă** for a similar one;
- for a post that already has factors, "Postul are deja o fișă cu 18 factori", and the specialist's choice: **Adaugă după cei existenți**, **Înlocuiește** or **Lasă cum e**, the default.

_Note, 2026-11-04:_ this list first offered Nu adăuga for any sheet. A similar sheet has none: its factors go to the client either way, and Folosește ce ai already leaves the library as it is, the client's factors that match the entry's pointing at them.

_Note, 2026-11-07, Mircea's decision (tester feedback):_ the choice between **Adaugă în bibliotecă** and **Nu adăuga** is gone. A post's new sheet with factors always becomes an entry, since an evaluation confirmed for one client is worth having for the next; a client-level sheet (grupuri sensibile, the other sheets outside the posts) never does, and its card has no library row. The identical and similar cases stay: an identical sheet uses the entry, and a similar one still chooses between **Folosește ce ai** and **Adaugă ca nouă**. `RiskImportChanges.library` takes only those two, for a post's similar sheet, and saving refuses it on any other; a proposal or changes saved earlier with `add` or `skip` are read as the rule says (a post's sheet added, a client-level one left out). The card merges the library rows into one **În bibliotecă** row with the name, where it comes from, why the client's name was added when the name was taken (archived entries included), and **Redenumește**, which refuses a taken name when saved, the part now serving every entry's name; an unticked factor moves to a **Scoși de tine** list with **Pune înapoi** (a search over the factors, drawn with it, was dropped on 2026-11-08 as rarely needed); and the confirm bar sticks to the bottom of the page, naming the evaluations and counting the factors as they change. The taken name still gets the client's name; whether the post should replace it awaits a decision.

_Note, 2026-11-04, plan rows with no factor:_ a plan row that pairs with no factor can be a risk the evaluator planned for the post but left off its sheet (ROYAL HOTEL's receptionist block plans for "Neutilizarea echipamentului individual de protecţie", which the receptionist's sheet does not list), though others are copies from another post or a template's leftovers. Listed at the end, it was never imported. Code now writes such a row out as an unticked factor with the plan's measures by kind and its plan fields, and places it on the sheet most of its block's paired rows go to, else on the one sheet whose name its post names. That sheet's card shows it folded under **Rânduri fără factor**, and **Adaugă ca factor** opens the factor form, where the specialist chooses its component, group and classes; the app still chooses no class. An added row is written like the sheet's own factors, into the entry the sheet creates too. Rows placed on no sheet, measures rows with no factor and factor rows outside every sheet stay listed at the end, under **Rânduri pe care nu le preluăm**.

A plan field that names a person rather than a role is flagged, and is copied to the client's sheet but not into the library.

**Confirming** runs `apply_risk_import` in one transaction, after the client's confirm:

- it creates the chosen library entries, with their factors, measures, plan fields as defaults and texts;
- it creates each missing evaluation, the sensitive groups' and the other client-level ones included, and fills only their empty texts;
- it writes the pack's factors, as reviewed, onto each sheet's posts as the post's choice says, with their plan fields as the pack gives them;
- each factor written to a client points at the matching factor of the entry it was added to or matched, so "Unde este folosit" and the origin read right from the first day;
- a sensitive groups' evaluation moves the client's sensitive groups state to evaluated, as the database already does when one is created.

Everything carries the confirming member as `created_by`. The client's documents 9 and 10 become ready or behind as the existing triggers say.

**When it runs and its size.** After the client proposal is ready, so the prompt can list the posts, as for instructions. The pack's `risk_assessment` text goes in whole; the five archives need about 30,000 to 70,000 tokens. Word files need a short answer. Retyped PDFs need the long one, read eight sheets at a time, each request after the same files so the later ones hit the prompt cache. Expected cost for a Word pack: $0.05–0.10.

_Note, 2026-11-04, measured on PDFs:_ PROFLEX VEST and ROYAL HOTEL printed to PDF by LibreOffice and read as the extractor reads a PDF are 550,000 and 380,000 characters, 87,097 and 60,446 prompt tokens. Retyped in the first request as built, they took 15,136 and 11,384 output tokens, reasoning included, every sheet, factor and class right, at $0.16 and $0.12. A factor written out takes 100 to 150 output tokens, so eight sheets of 47 factors would pass the 32,000 limit. The five archives' assessments in one file (11 sheets, 381 factors, 242,000 tokens) were not cut but came back short: the first answer wrote out 4 sheets and the request for the other 7 wrote one; smaller requests were also answered with one entry describing a sheet's columns, or an entry per row saying where it stands ("p. 29, rând F1, coloana 4"). So the first request writes no factor out and counts each sheet's (381 of 381); the sheets are written out by requests of about 70 counted factors, a third of the limit at 150 tokens a factor, four at a time; a cut or broken answer is asked again in halves, and a sheet written out under half its count or without its classes as digits is asked again alone. So read, the 11 sheets came back whole, 381 of 381 factors with every class right, in about five minutes and $0.60–0.85; each parallel request that misses the provider's cache adds $0.26 at that size. By these counts, a pack of the archives' size should cost $0.10–0.25 read from PDF. One limit stays: a PDF this large passes the 800,000-character cap only with its layout's runs of spaces squeezed (1.18 million characters as extracted).

_Note, 2026-11-04, a PDF's measures:_ a factor written out from a PDF took measures only from a plan row of a Word file that repeated its description, so with the plan a PDF too most factors came without any. The requests that write a PDF's factors out now also write each factor's measures by kind and its actions, deadline, person responsible and observations, from the plan's row for the factor, else from its row of the measures sheet, in the document's words, and none where the documents give none; code keeps the limits, the flag on a person named and Verifică, and a factor of a Word file is still pointed at and copied. A factor so written out took up to 300 output tokens, reasoning included (225 to 305 a request where most factors have a plan row, about 150 where few have measures), so a request now holds about 35 counted factors, a third of the limit. Measured against the reference answers, each factor's plan rows read in the Word plan: ROYAL HOTEL's and PROFLEX VEST's assessments and plans as PDFs, 233 factors, took their measures from the right place for 226; of the 79 the documents give none, 72 stayed empty and 7 took a nearby row's; of the 154 with measures, 146 had them with at least 90 % of their words and no others (mean word recall and precision 0.99) and 147 of 151 every kind right; their deadline, person responsible and observations were right for 147 to 148 of 148 and their actions for 143, the misses but one being words the Word plan breaks with a hyphen. The eleven-sheet pack, with no plan, took its 40 measures-sheet texts at recall 0.98 and precision 1.00 and kept 338 of 341 factors empty. Every factor and class stayed right. The first request's cache did not serve these requests, whose answer format differs: the first of them read no cached token on any of the three packs, and every later one read all but about 700 tokens of its prompt from cache (240,843 of 241,500 for the eleven sheets). So the first of them goes alone and the others after it, four at a time. Read so, ROYAL HOTEL cost $0.22, PROFLEX VEST $0.38 and the eleven sheets $0.66 besides their first request: a pack of the archives' size costs $0.20–0.40 read from PDF, above the $0.095 the 15 credits were set by.

**Credits.** A flat **15 credits** for the reading, charged when the request is sent, refunded on a failure on our side, as the instructions parts are. That follows ADR 034's rule: the dearest reference reading at a credit's cost. The rule was 10, or 15 if the dearest of the five archives cost more than $0.08; measured in the import package step, the dearest cost $0.095. Scanned pages are 1 credit each, as today. The import's total names it: _Importul a folosit 75 de credite (25 + 35 pentru instrucțiunile proprii + 15 pentru evaluările de risc)_.

**Testing.** There is no second provider's archive. Reference answers for the five archives' sheets and factors are written in the import package step, and the reader is measured against them before any change of prompt or model. What an import does on an unfamiliar template is the subject of #802.

### Help

The help site gains the article **Evaluări de risc** in the area ADR 028 reserved as "Riscuri", renamed with the page: the library, an entry's page, applying it, archiving, and a client's Fișa de evaluare with its factors, classes and measures. It names the method's acts: Legea 319/2006, art. 12 (1) a, and H.G. 1425/2006, art. 15 (1) pt. 1 and art. 46, for Mircea to check. The import's article gains a section on the Evaluări de risc task. Each comes with the pull request that completes its feature, with its `## Actualizări` block.

## What is left out

- **Unlinking** a client's evaluation from a library entry: #801.
- **The quality record and alerts** for every import: #802.
- **The pricing of imports** as a whole: a full import costs 75 credits plus scanned pages under this ADR; to be discussed later.
- **Starting an entry from another entry** in the library, as instructions can.
- **Evaluations by another method** (#259), and an ergonomic study or any non-I.N.C.D.P.M. document in a pack: it is not read.
- **The pack's ranking table, stated global levels and charts**: the app computes its own.
- **The assessment's general measures for the workplace**, which no factor carries.
- **Comparing against archived entries.**
- **Search and filters** on the library list.
- **Replacing a library entry with the pack's sheet.** Choosing "Adaugă ca nouă" and archiving the old one does it by hand.

## Consequences

- **Two words for two things.** "Evaluări de risc" is the organization's library; "Fișa de evaluare" is the client's. The glossary maps them to `evaluation_profiles` and `risk_evaluations`, which keep their names.
- **The library fills itself.** A provider's first import brings its own library with it, so the second client of a kind is cheap from the start.
- **The first client's documents 9 and 10** can be generated right after an import, where the evaluation was the largest typing job in the product (ADR 015).
- **The pack's errors are surfaced, not fixed.** A specialist sees every level the grid disagrees with; the app still never chooses a class.
- **Entries outlive their use.** An entry used once stays, archived at most, until #801.
- **The import costs more:** about $0.05–0.10 and 15 credits for a Word pack.
- **The schema changes:** `archived_at` and the three texts on `evaluation_profiles`; the part `risk_evaluations` and `apply_risk_import`; the library part's domain becomes optional; the delete refused in use. `docs/data-model.md`, `docs/api.md` and `docs/app.md` change with it.
- **The glossary changes:** evaluation profile, risk evaluation and library proposal.

## Order of work

Each step is a pull request in one stack, on this ADR. The clean-up comes first.

1. This ADR, the glossary in `CONTEXT.md`, and notes in ADR 015 and 034.
2. **The names.** Evaluări de risc and Fișa de evaluare in the app, the addresses, the flow tests and `docs/app.md`; the marketing site's alt text.
3. **The lifecycle.** `archived_at`, the delete refused in use, the usage count on the list, Arhivează, Reactivează and Arată arhiva; pgTAP and app tests.
4. **The texts.** The three work-system texts on entries, filled by apply and save, edited on the entry's page.
5. **The help article** Evaluări de risc.
6. **`packages/import`.** Numbered rows, the risks request, the copying and its checks, the plan's join, the comparison with the library; the reference answers for the five archives, the measured cost and the credits.
7. **The database.** The part `risk_evaluations`, the optional domain, `apply_risk_import`, the credits; pgTAP tests.
8. **The API.** The part's message, retry, proposal, changes and confirm.
9. **The app.** The hub's Evaluări de risc group and task, its sheet cards and choices; the import's help section and the `## Actualizări` block.

## Defaults taken instead of asking

- **The addresses** `/evaluari-de-risc` and `…/fisa-de-evaluare`, and the code keeping its English names.
- **"Evaluare nouă", "Aplică din bibliotecă"** and the other strings as listed.
- **"Folosită la" counts clients**, as "Unde este folosit" lists them; an entry used only by archived posts reads "—" and still cannot be deleted.
- **Archiving is allowed while in use**, unlike an instruction module, since a client holds a copy.
- **Applying fills only empty texts.**
- **Thresholds**: identical on component, folded description and classes; similar at 70 % of factors with a description Jaccard of 0.8. To be tuned on the five archives in step 6.
- **Defaults on the review card**: a new sheet is added to the library, a client-level one is not, a post with factors is left as it is. Since 2026-11-07 the first two are rules, not defaults (note under The review).
- **The sheet takes the grid's level**, showing the printed one beside it.
- **A person named in a plan field** goes to the client only.
- **PDFs are written out in requests of about 35 factors** as the first answer counts them, each factor with its measures and plan fields, the first request alone (notes of 2026-11-04), and their factors are all marked Verifică.
- **Credits**: 15, since the measured dearest reading, $0.095, passed $0.08.
