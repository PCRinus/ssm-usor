# Document engine

Status: the merge engine, the authoring tool, and the first built-in template  
Audience: engineering

`packages/document-engine` turns a Word template and data into a client's document
([ADR 005](architecture/adr-005-document-generation.md)). It is server-only and has no
knowledge of the database: the API builds the data and stores the result.

## Placeholders

Templates are ordinary `.docx` files with `{{ }}` placeholders:

| Placeholder                             | Meaning                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `{{client.legalName}}`                  | A value, by dotted path.                                  |
| `{{#firstAiders}}` … `{{/firstAiders}}` | A repeated block; inside, `{{name}}` reads from the item. |
| `{{.}}`                                 | The current item of a list of strings.                    |
| `{{$index}}`                            | The item's number in its list, from 1.                    |

Where the two loop tags sit decides what repeats. Both in one table row: the row. Each alone
in a paragraph of its own: the paragraphs between them. Anywhere else: the text between
them, inline. Inside a loop a name is looked up on the item first and then outwards, so a
table row can still print `{{issueDate}}` or `{{client.legalName}}`.

`renderDocument(template, data)` returns the merged file. **A placeholder without a value is
an error, never a blank**: it throws a `TemplateError` whose `missing` lists every one, so a
generated document cannot leave a gap where a name belongs. A list with no items is a value.
`templatePlaceholders(template)` lists what a template asks for.

The engine uses docxtemplater with a parser of its own, because docxtemplater's default reads
a single property name and its expression parser needs `eval`, which Workers forbid. Ours
splits a dotted path and evaluates nothing.

## Importing a template

Templates are imported once from the provider's original Word files, and from then on **the
template in `packages/document-engine/templates` is the source of truth**. A later change of
wording is made to the template, in the app's editor once it exists, not by importing again.
The import is a tool, not part of the product: the engine in `src/` only fills placeholders.

```bash
pnpm --filter @ssm-usor/document-engine import-templates   # all specs, or name some
pnpm --filter @ssm-usor/document-engine preview            # PDFs to read, in originals/preview/
```

To try a change of style before adopting it, import next to the real templates and preview
that folder; anything under `originals/` is git-ignored:

```bash
pnpm --filter @ssm-usor/document-engine import-templates --out originals/try
pnpm --filter @ssm-usor/document-engine preview originals/try originals/preview-try
```

Both run LibreOffice inside the Gotenberg Docker image, the same one that will make the PDFs,
so nothing is installed on the host. `tools/import/import_templates.py` drives it through its
UNO API, which opens the original as a document, not as XML. That matters: Word stores what
reads as one phrase in several runs ("S.C. VELOCITA URBANA" + " " + "S.R.L."), which a search
over the XML never finds and LibreOffice's own search does. The script also converts nothing
by hand: legacy `.doc` files are converted to `.docx` with the same image first
(`soffice --headless --convert-to 'docx:MS Word 2007 XML'`).

For each spec it does three things.

**1. Placeholders.** A spec in `originals/` lists the texts that vary and what replaces them:

```json
{
  "source": "1.3._Decizie_privind_responsabili_primul_ajutor.docx",
  "kind": "decision",
  "replacements": [
    { "find": "Nr. : 3 SSM", "replace": "Nr. : {{decisionNumber}} SSM" },
    {
      "pattern": "S\\.C\\.\\s+VELOCITA URBANA\\s+S\\.?R\\.?L\\.?",
      "replace": "{{client.legalName}}",
      "min": 5
    },
    {
      "find": "Paolo - Antonio LUCA",
      "replace": "{{#firstAiders}}{{name}}",
      "whole": true,
      "min": 2
    }
  ]
}
```

`pattern` is a regular expression, for a phrase the original spells several ways. `whole`
matches only a paragraph that holds nothing else, such as a table cell with a name.
`loopParagraph` puts loop tags in paragraphs of their own around the match, which is what
makes the engine repeat a paragraph per person. `min` is how often the text must be found;
a text found less often fails the import. Honorifics go: "D-na … in calitate de Administrator"
becomes `{{client.representativeName}} in calitate de {{client.representativeRole}}`.

A spec can ask for three larger repairs, where tidying what is there would not do:

| Spec key         | What it does                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header`         | Rebuilds the box of document details at the head of every page from `code` and `title`: the issue date, who prepared the document and for whom, its code, its name, and "Pag. X din Y" as real page fields. The originals type the page number by hand and pad cells with spaces. `preparedBy: "specialist"` names the specialist |
| `handover: true` | Replaces the five lines of "Am întocmit și predat un exemplar … Am primit un exemplar", aligned with tabs and runs of spaces, with the two-column block the covers use: what each side confirms, room to sign, who signs                                                                                                          |
| `tables`         | Replaces the n-th table of the body (`replaceTable`) with one drawn from a definition: `widths`, `rows` of cells as text or `{text, colspan, rowspan}`, `headerRows`, the columns set `left`, a `size`, and a `heading` paragraph above it. For a table whose columns are a letter wide or whose cells are aligned with tabs      |

A spec's `kind` picks the rules that recognise a document's parts: `decision`, `regulation`,
or `test`. A test has questions and answers on top of a title: a question typed with its number
is set bold and kept with its answers; each question's answers start again from a), where the
originals run one list through the whole test so that the specimen reads d), e), f); answers
typed by hand (" a) …", long ones broken with the Enter key) are joined back together and
hung from their letter; a second title opens the specimen on a new page. In a `register`, every
title after the first opens a new page the same way. `tableSizes` sets one
table smaller than the small print, for pictogram captions. A replacement may set
`groups: true` to use what its pattern captured (`$1`).

A `tables` entry without `rows` redraws the original's table from its own text in columns that
fit it: `widths`, `number: true` to write out a first column the original numbered with a list,
a first row merged across the table becomes the caption above it, and a cell the original
merged downwards stays merged. Tables of up to a dozen rows do not split; longer ones do, or
most of a page stays empty before them. Letters under a numbered point are set one tier in.

A column that holds one value for the whole table is said once, above it: `headingFromColumn`
turns the column's heading and its value into a line over the table ("Loc de muncă / Post de
lucru: MANAGER MAGAZIN"), `headingStrip` removes a pattern from that value, and `dropColumns`
takes the column out, which leaves its width to the ones that carry text. `dropRows` removes
rows, such as one that numbers the columns. `top: true` starts the cells of long rows from the
top, `wholeRows: true` moves a row to the next page instead of cutting it in two, and
`pageBreak: true` opens a new page before the table. The prevention plan's three tables are set
this way: the original merged the workplace cell down the whole table, which some viewers
cannot carry over a page and cut off instead.

A `tables` entry with `loop` puts loop tags in paragraphs of their own around its heading and
the table, so the engine repeats both per item: the equipment list draws one section per job
position this way, its heading printing the work zone only inside an inline loop. One with
`remove: true` takes the original's table out and draws nothing: the equipment list's grid of
risks against body parts, copy-pasted unchanged between clients.

A spec with `"source": null` starts from an empty document and draws all of it (`kind:
"form"`, a `tables` entry without `replaceTable`). The control report form is made this way:
the original lays it out in text frames, which LibreOffice cannot read back as a table. In a
drawn table a cell may set `bold` and `align`, and `rowHeights` makes single rows taller, for
the blank space of a form.

`originals/` is git-ignored, specs included, because both quote real people by name.

**2. Wording.** `tools/import/wording.ro.json`, committed because it quotes no one, is an
editorial pass shared by every template. The originals carry years of small defects: most
words without diacritics and some with, the old cedilla letters (ş, ţ), typos, double spaces,
spaces before punctuation, and sentences that are only right for one person ("Subsemnatul am
luat cunoștință… ne obligăm"). The rule is to **reword once in the template rather than add a
case at generation time**: a sentence that must read right for one person or five is rewritten
so it does. `words` is a dictionary applied as whole words in lower, Capitalised, and UPPER
case (a Roman numeral is left alone: "II" is not "îi"); a word whose diacritics depend on
meaning goes in only after every occurrence has been read in context. Most of its 2,500
entries were derived, not typed: every word of both packs was checked against LibreOffice's
Romanian spelling dictionary, and a plain word went in only if it is not itself a word and
exactly one way of adding diacritics to it is. Only the words a document contains are applied
to it. `context` holds the rules for words that are right both ways: "sa" is "să" except as a
possessive ("activitatea sa"), "munca" is "muncă" after a preposition, "asigura" is "asigură"
unless an auxiliary precedes it. `phrases` are replacements, none of which has to occur.

`grammar` decides the words that are right both ways, by what stands beside them. A verb is
the infinitive after an auxiliary ("va asigura") and the present tense otherwise ("asigură").
An adjective after its noun never takes the article, so "instruire periodica" is "periodică";
the ones that are also nouns ("tehnica securității") change only right after a feminine noun.
A noun is indefinite after "o", "orice", "această", or after a preposition with nothing
following to make it definite ("în perioadă."), and otherwise keeps its article with its
diacritics ("siguranța"). Participles and adjectives were collected with the spelling
dictionary (the masculine and the infinitive must be words) and read through by hand.
What is still not a word after an import was listed with the same dictionary, outside the
repository, which is how the last typos were found; on the long documents that list is down to
abbreviations, product names, and medical terms.

What the documents _say_ is not touched: article references, durations, who decides what. Nor are the empty
numbered rows of the acknowledgement tables, where newly appointed people sign later.

**3. Typesetting**, to one house style, followed by a last sweep over the saved XML for what
LibreOffice's API reaches in most places and not in all, or not at all: a dead link that
survives clearing, an empty paragraph written as justified, a picture that floats at the left
between two lines (made a character, which looks the same and lets the in-app editor lay the
page out), and LibreOffice's own fonts as the defaults of the styles (replaced with the house
font, so no viewer warns about substitutes). `import-templates --sweep [name…]` runs only this
pass over the templates that exist, covers included, without originals or an office:

|                  |                                                                                                                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text             | Arial 10 pt; the document title bold 12 pt; headings ("DECIDE:", "PROCES VERBAL…") bold 10 pt, centred; 8 pt in a table of more than six columns and in the header's document details                                                                                                                                       |
| Page             | A4, margins 25 mm left for binding and 20 mm elsewhere; an empty header or footer is switched off; a header sits inside the top margin like the footer inside the bottom one: 12 mm, the box, 4 mm                                                                                                                          |
| Alignment        | Running text and list items are left-aligned, never justified: without hyphenation a justified line opens uneven gaps between words. Titles, headings, and the signature block are centred                                                                                                                                  |
| Spacing          | Paragraph margins, 6 pt between paragraphs and 2 pt between list items. Every empty paragraph used as spacing is removed, and so are the spaces paragraphs were aligned with                                                                                                                                                |
| Lists            | Items snapped to three indent tiers, in the list's own definition, whatever list they came from. The originals build one hierarchy from a dozen unrelated lists with paragraph indents on top. A list of one item loses its lone "1.". Article labels ("Art. 1.") stay automatic list numbers                               |
| Signature block  | The client's name, the representative's role and name: centred, so a long name grows both ways instead of drifting off a column of spaces                                                                                                                                                                                   |
| Staying together | From a heading to the table it introduces, everything moves to the next page together; a short table does not split; two lines at least stay together at a page break                                                                                                                                                       |
| Characters       | Romanian as the language, no font colours (the provider marks in red what they replace by hand), no dead internal hyperlinks and the underline they left, no boxes or shading around a paragraph, no empty shapes drawn behind a title                                                                                      |
| Page fields      | "Pag. X din Y" in the header box is real `PAGE` and `NUMPAGES` fields, written as the bare keywords: LibreOffice spells the default format out as `\* ARABIC`, and the in-app editor then paints the cached result, the last page's number, on every page instead of evaluating the field                                   |
| Footer           | Every footer ends with `{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}`, Arial 7.5 pt, grey, centred: alone where the document had no footer, one more paragraph where it had one. `branding: [{}]` in the merge data prints it; empty or missing prints nothing. See [branding](document-branding.md) |
| The end          | A document that closes with a table keeps the one paragraph Word needs after it, at 1 pt, so it cannot spill onto an empty last page                                                                                                                                                                                        |

Then **read the result**. `preview` renders every template twice, with one person and short
names and with three people and names long enough to test the layout, converts to PDF, and
prints the page counts. No check replaces reading the pages.

One thing can only be fixed when values are in: a company name ending in a full stop that
closes a sentence gives "S.R.L..". `renderDocument` drops the second full stop after merging,
across runs, and leaves an ellipsis alone.

`templates/manifest.json` lists all 24 originals under their own numbers, with the stage each
belongs to: the 23 of the provider's pack, and decision 1.5 on the workers' representatives,
which came later from another client's pack (ADR 010). A template is named `<number>_<type_key>.docx`.

All 23 are templates. Five of them are marked `contentPending`: the own instructions (3.2),
the training themes (4.2), the protective equipment list (6), the risk assessment (9), and
the prevention plan (10). They have the house style, the wording pass, and placeholders for
names and dates, and **their content is still the first client's**: job titles, equipment,
risks. That content comes from the job-title data of stage 2 and the risk assessment of
stage 3 (ADR 005); until then a generated file of these five is a starting point to edit, not
a finished document.

Two things the long originals needed. A table that Word floats arrives inside a text frame,
outside the body's flow; the import walks the frames too. And the risk assessment cannot be
saved once its empty paragraphs are removed (LibreOffice fails to write the file and does not
say why; removing any part of them works, removing all does not), so its spec sets
`"emptyParagraphs": "shrink"` and they stay at 1 pt, where they take no room. `handover` may
name other words for the client's side (`{"client": ["Am primit și aprobat", …]}`).

## Covers

The seven covers are not imported, they are built:
`pnpm --filter @ssm-usor/document-engine build-covers`. The provider's covers are text boxes on
an empty page, with the provider's name pushed into place in the header by nine empty lines.
LibreOffice cannot read the boxes as text, and every cover is the same page with another
title. `tools/import/build_covers.py` makes them from `tools/import/covers.ro.json`: the
provider's name at the head, an optional motto, the title at 16 pt, the client's name at
14 pt, a list of contents where there is one, and the hand-over block as two borderless
columns, the client's side and the provider's. A cover is the one place the house style goes
above 12 pt.

One correction to the content: the decisions' cover listed a fifth decision, naming the worker
designated for prevention and protection, which the pack does not contain. The list now has
the four decisions that exist. A fifth item, for decision 1.5, sits inside
`{{#workersRepresentativeDecision}}`: an item in `covers.ro.json` may be an object with
`text` and `when`, and prints only when the merge data has that condition.

Covers need `provider.representativeRole` besides what the decisions use.

## The service contract

The starter template of the service contract (ADR 007) is not one of the provider's originals,
so it is not imported and it is not in the pack's manifest, which lists the 23 originals and
nothing else. It lives in `templates/other/`, with a manifest of its own, and is built like
the covers:

```sh
pnpm --filter @ssm-usor/document-engine build-contract
```

`tools/import/build_contract.py` typesets `tools/import/contract.ro.json` to the house style.
The wording is ours, written after the structure of one provider's contract, with diacritics
and with the legal references of that contract kept. What it decides differently from its
model is listed in the pull request that added it and belongs to the legal review (#61): a
data protection clause (GDPR art. 28), damages for proven loss in place of a penalty of one
year of the contract's value, a late-payment penalty of 0.1% a day capped at the debt, a
30-day notice for either party, and exclusivity stated as a way to avoid overlapping
responsibility.

- **Articles are a list.** "Art. N." comes from a numbering style (`ListFormat`, because this
  version of the office reads `Prefix` and `Suffix` and drops them on export), so an article a
  provider deletes in the editor, or a chapter left out by a condition, leaves no gap. A new
  paragraph inherits the numbering of the one before it, so every paragraph that is not an
  article clears it. For the same reason chapters carry no number and no article refers to
  another by number. Lettered items are typed.
- **Conditions.** `{{#contract.coversFireSafety}}` and its closing tag stand alone in their
  paragraphs around the fire-safety chapters and articles, and
  `{{#contract.coversOccupationalSafety}}` around the others, so a contract prints one
  service, the other, or both. `provider.vatPayer` and `provider.notVatPayer`, and
  `contract.renewsAutomatically` and `contract.endsWithoutRenewal`, choose between two
  sentences: the engine has no "else", so the context carries both sides.
- **Prices** are printed as `DE COMPLETAT`, the contracts' `unfilledMark`, which is what
  issuing already warns about. The app keeps no prices (ADR 007).
- `{{#client.phone}}…{{/client.phone}}` and `{{#client.activity}}…` are inline conditions: the
  client's phone and CAEN activity are the only optional values.

The context is built by `apps/api/src/modules/service-contracts/context.ts`, and
`apps/api/scripts/lib/contract-template.test.ts` merges the real file with it, in every
combination above.

## Registering the templates

Both manifests are registered: the pack's, and `templates/other/manifest.json`.

The API does not read the repository: it takes a template from Storage, by the version the
registry gives it. One script brings the two in line with `templates/`:

```bash
pnpm templates:register:local   # the local stack
pnpm templates:register         # the hosted project, from SUPABASE_URL in apps/api/.env.seed
```

For every entry of the manifest it uploads the file to the private bucket `document-templates`
as `built-in/<type_key>/<sha256>.docx` and calls `register_built_in_template_version`. The path
holds the hash, so a file that is already there is not sent again, and a hash that is already
registered stays the version it was. A changed file becomes the next version; revisions
generated from the earlier one keep pointing at it. Entries marked `contentPending` are left
out, so nothing offers them for generation yet.

On `main`, the job "Register document templates" runs the same script after the migrations
when a template, the script or a migration changed since the last deployment. The deployment
workflow compares with the last run that succeeded, so a run that is superseded hands its
templates on to the next. A wiped environment gets everything back from the migrations and this one command.

## The merge context

The API builds the data once per generation and merges every template with it
(`apps/api/src/modules/documents/context.ts`, pure and tested without a database):

- `missingDocumentData(facts)` lists what is in the way, as codes grouped by where the user
  fills it in: `provider.*` (the organization's company details), `specialist.*` (the profile of
  the member who generates), `client.representativeName`, `client.representativeRole`,
  `client.trainingSchedule`, and `responsible.<role>` for every role nobody holds. The
  workers' representative is required only from 10 current employees, two from 50
  (`responsible.workers_representative`, `responsible.workers_representatives_two`), counts
  only while their employee has not left, and must not have the client's legal
  representative's name (`responsible.workers_representative_is_legal_representative`;
  readiness also returns the two names as `workersRepresentativeClash`).
  `missingDocumentData(facts, typeKey)` is what generating one document again needs: a 1.5
  kept under 10 employees still needs one representative.
  `GET /clients/{clientId}/documents/readiness` returns the list; generating is refused until
  it is empty, because a data field is never left blank. The training schedule requires a
  decision for both staff categories, at least one interval, and an interval for every category
  held by a current employee. An explicit “Nu se aplică” excludes a category with no current
  employees; an undecided blank does not count as an exclusion.
- `buildDocumentContext(facts)` turns the stored facts into the names of the table below:
  dates as `19.01.2026`, people under the roles they hold in the order they were designated,
  the training schedule in words (`TRIMESTRIAL`, `februarie, mai, august, noiembrie`, `2 ore`),
  and `branding`. The decisions are numbered from the first decision number in the order
  training, evaluation team, first aid, imminent danger, workers' representatives; `documentData(context, typeKey)` gives
  one template its number. The context is what a revision keeps as its data snapshot.
- `documentApplies(facts, typeKey)` says whether a document belongs in the client's set:
  decision 1.5 only from 10 current employees. Generating leaves out the rest; a document
  that already exists stays, and cover 1.0 keeps listing a 1.5 that was generated.
- `unitRisks` is one row reading "DE COMPLETAT" until the risk assessment lives in the app.

A test merges every registered template with this context; the engine throws on a placeholder
without a value, so a template that asks for a new name fails there first. The list of
document types in `packages/contracts/src/documents.ts` is checked against the manifest by the
same test.

## Built-in templates

| `type_key`                        | Document                                                                     | Data beyond `decisionNumber`, `issueDate`, `client`, `provider`                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision_training`               | Decision no. 1: who trains whom, and the periodic training schedule          | `workplaceManagers[]`, `training` (`periodicDuration`, `administrativeFrequency`, `administrativeMonths`, `workerFrequency`, `workerMonths`, `dayFrom`, `dayTo`) |
| `decision_risk_evaluation_team`   | Decision no. 2: the risk evaluation team                                     | `evaluationTeam[]`, `specialist` (`name`, `professionalTitle`)                                                                                                   |
| `decision_first_aid`              | Decision no. 3: who gives first aid, with its two acknowledgement tables     | `firstAiders[]`, `firstAiderNames`                                                                                                                               |
| `control_regulation`              | The internal regulation on the employer's own checks, with its schedule      | `issueYear`, `followingYear` for the schedule's heading                                                                                                          |
| `test_hiring`                     | The test after the general introductory training, with its specimen          | None                                                                                                                                                             |
| `test_periodic`                   | The yearly test, with its specimen                                           | None                                                                                                                                                             |
| `event_registers`                 | The four registers of accidents and dangerous incidents, A4 landscape        | None                                                                                                                                                             |
| `control_report`                  | The report form filled in by hand at each control visit                      | None                                                                                                                                                             |
| `employer_briefing`               | What the law asks of the employer, chapter by chapter, about 30 pages        | None                                                                                                                                                             |
| `general_training_material`       | The material for the general introductory training, about 85 pages           | `unitRisks[]` (`risk`, `measure`) for the closing chapter on the unit's own risks                                                                                |
| `own_instructions`                | The own instructions, about 75 pages. Content pending                        | None yet                                                                                                                                                         |
| `training_themes`                 | Themes and schedule of the three kinds of training. Content pending          | `specialist`, `workplaceManager`                                                                                                                                 |
| `protective_equipment_list`       | Protective equipment per job, A4 landscape. Content pending                  | None yet                                                                                                                                                         |
| `risk_assessment`                 | The risk assessment, about 75 pages, portrait and landscape. Content pending | `specialist`                                                                                                                                                     |
| `prevention_plan`                 | The prevention and protection plan, A4 landscape. Content pending            | None yet                                                                                                                                                         |
| `decision_imminent_danger`        | Decision no. 4: who acts in serious and imminent danger                      | `workplaceManager`, `imminentDanger[]`, `imminentDangerText`                                                                                                     |
| `decision_workers_representative` | Decision no. 5: the workers' representatives, from 10 employees              | `workersRepresentatives[]`, `workersRepresentativesLead`                                                                                                         |

For `decision_training`, `training` has `periodicDuration`, `intervalPhrase`, `dayFrom`, and
`dayTo`. The `administrative[]` and `worker[]` arrays contain one item when applicable and are
empty otherwise, controlling which interval paragraphs print. Their matching frequency and
months values exist only for applicable categories.

`client` is `legalName`, `representativeName`, `representativeRole`; `provider` is `legalName`
and `representativeName`. A person in a list is `name` and `jobTitle`. Every decision ends with
an acknowledgement table that repeats a row per designated person.
