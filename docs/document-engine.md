# Document engine

Status: the merge engine, the authoring tool, and the first built-in template  
Audience: engineering

`packages/document-engine` turns a Word template and data into a client's document
([ADR 005](architecture/adr-005-document-generation.md)). It is server-only and has no
knowledge of the database: the API builds the data and stores the result.

## Placeholders

Templates are ordinary `.docx` files with `{{ }}` placeholders:

| Placeholder                             | Meaning                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `{{client.legalName}}`                  | A value, by dotted path.                                                                          |
| `{{#firstAiders}}` … `{{/firstAiders}}` | A repeated block; inside, `{{name}}` reads from the item.                                         |
| `{{#noPlan}}` … `{{/noPlan}}`           | On a boolean, a text or an object: printed once when it is true or set, never when false or null. |
| `{{^plan}}` … `{{/plan}}`               | The other way round: printed once when the value is false, null or an empty list.                 |
| `{{.}}`                                 | The current item of a list of strings.                                                            |
| `{{$index}}`                            | The item's number in its list, from 1.                                                            |

Where the two loop tags sit decides what repeats. Both in one table row: the row. Each alone
in a paragraph of its own: the paragraphs between them. Anywhere else: the text between
them, inline. Inside a loop a name is looked up on the item first and then outwards, so a
table row can still print `{{issueDate}}` or `{{client.legalName}}`. A condition is a section
on a boolean (`hasPlan: true`), not a list of one empty item.

`renderDocument(template, data)` returns the merged file. **A placeholder without a value is
an error, never a blank**: it throws a `TemplateError` whose `missing` lists every one, so a
generated document cannot leave a gap where a name belongs. A section's name is held to the
same rule: one the data does not have at all is in `missing`, so a misspelt `{{#plna}}`
cannot print nothing in silence. `null`, `false` and a list with no items are values: the
section prints nothing (and `{{^…}}` prints). A control character in a value is dropped
rather than abort the document, and errors are not logged by the engine with the data around
them. `templatePlaceholders(template)` lists what a template asks for.

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
position this way, its heading printing the work zone only inside an inline loop, and `after`
writes a paragraph once past the loop, for a note that would otherwise be left alone on a page
as the table's last row. Repeated tables need a paragraph between them, or they are saved as
one: the training themes print the position's name as the `heading` of each repetition. Where loop
tags close the document, a table perhaps inside or before them, a paragraph at 1 pt follows the last tag, which leaves
nothing behind once merged, as Word wants a paragraph after a table. `keepWithNext` lists the
rows whose paragraphs keep with the next row, so a heading row is never the last thing on a
page. Do not mark every row to keep a table whole: LibreOffice, which makes the PDFs, drops a
row at the page break of a keep chain longer than a page, and moves the table's start to a new
page. One with `remove: true` takes the original's table out and draws nothing: the equipment
list's grid of risks against body parts, copy-pasted unchanged between clients.

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
page out), a section that restarts the page numbers (the risk assessment's landscape annex
did, so "Pag. X din Y" counted wrong after it), and LibreOffice's own fonts as the defaults
of the styles (replaced with the house font, so no viewer warns about substitutes).
`import-templates --sweep [name…]` runs only this
pass over the templates that exist, covers included, without originals or an office:

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text             | Arial 10 pt; the document title bold 12 pt; headings ("DECIDE:", "PROCES VERBAL…") bold 10 pt, centred; 8 pt in a table of more than six columns and in the header's document details                                                                                                                                                                                                                                                                                                                               |
| Page             | A4, margins 25 mm left for binding and 20 mm elsewhere; an empty header or footer is switched off; a header sits inside the top margin like the footer inside the bottom one: 12 mm, the box, 4 mm                                                                                                                                                                                                                                                                                                                  |
| Alignment        | Running text and list items are left-aligned, never justified: without hyphenation a justified line opens uneven gaps between words. Titles, headings, and the signature block are centred                                                                                                                                                                                                                                                                                                                          |
| Spacing          | Paragraph margins, 6 pt between paragraphs and 2 pt between list items. Every empty paragraph used as spacing is removed, and so are the spaces paragraphs were aligned with                                                                                                                                                                                                                                                                                                                                        |
| Lists            | Items snapped to three indent tiers, in the list's own definition, whatever list they came from. The originals build one hierarchy from a dozen unrelated lists with paragraph indents on top. A list of one item loses its lone "1.". Article labels ("Art. 1.") stay automatic list numbers                                                                                                                                                                                                                       |
| Signature block  | The client's name, the representative's role and name: centred, so a long name grows both ways instead of drifting off a column of spaces                                                                                                                                                                                                                                                                                                                                                                           |
| Staying together | From a heading to the table it introduces, everything moves to the next page together, but no run of paragraphs kept with the next, by their own setting or their style's, is longer than three: the sweep cuts a longer one, which left pages two thirds empty, down to its first two and its last three, sparing a chapter heading and a line that ends in a colon. A line that ends in a colon keeps with the list item after it. A short table does not split; two lines at least stay together at a page break |
| Characters       | Romanian as the language, no font colours (the provider marks in red what they replace by hand), no dead internal hyperlinks and the underline they left, no boxes or shading around a paragraph, no empty shapes drawn behind a title                                                                                                                                                                                                                                                                              |
| Page fields      | "Pag. X din Y" in the header box is real `PAGE` and `NUMPAGES` fields, written as the bare keywords: LibreOffice spells the default format out as `\* ARABIC`, and the in-app editor then paints the cached result, the last page's number, on every page instead of evaluating the field                                                                                                                                                                                                                           |
| Footer           | Every footer ends with `{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}`, Arial 7.5 pt, grey, centred: alone where the document had no footer, one more paragraph where it had one. `branding: true` in the merge data prints it; `false` prints nothing. See [branding](document-branding.md)                                                                                                                                                                                                  |
| The end          | A document that closes with a table keeps the one paragraph Word needs after it, at 1 pt, so it cannot spill onto an empty last page                                                                                                                                                                                                                                                                                                                                                                                |

Then **read the result**. `preview` renders every template twice, with one person and short
names and with three people and names long enough to test the layout, converts to PDF, and
prints the page counts. No check replaces reading the pages.

One thing can only be fixed when values are in: a company name ending in a full stop that
closes a sentence gives "S.R.L..". `renderDocument` drops the second full stop after merging,
across runs, and leaves an ellipsis alone.

`templates/manifest.json` lists all 24 originals under their own numbers, with the stage each
belongs to: the 23 of the provider's pack, and decision 1.5 on the workers' representatives,
which came later from another client's pack (ADR 010). A template is named `<number>_<type_key>.docx`.

All 23 are templates: the own instructions (3.2), the training themes (4.2) and the
protective equipment list (6), stage 2, are generated from the positions (ADR 011, ADR 012,
ADR 014), and the risk assessment (9) and the prevention plan (10), stage 3, from the risk
evaluations (ADR 015).

Two things the long originals needed. A table that Word floats arrives inside a text frame,
outside the body's flow; the import walks the frames too, and a `tables` entry with
`replaceFrame` instead of `replaceTable` removes the n-th frame and draws its table in the body
where the frame was anchored, as the second plan of the training themes is. And the risk
assessment cannot be saved once its empty paragraphs are removed (LibreOffice fails to write the
file and does not say why; removing any part of them works, removing all does not), so its spec
sets `"emptyParagraphs": "shrink"` and they stay at 1 pt, where they take no room. `handover`
may name other words for the client's side (`{"client": ["Am primit și aprobat", …]}`).

A spec's `cut` names a pattern; everything from the first paragraph matching it to the end of
the body goes, tables included. The own instructions lose their chapter XIII this way, whose
content the organization's instruction modules now carry as annexes (ADR 012). `append` then
writes paragraphs at the end, each `{ text, bold, italic, keep, above, below }`: the chapter
XIII heading and the annex list, its loop tags in paragraphs of their own so the engine
repeats the line per annex. A table definition without `rows` can drop columns and rows of
the original and add rows with `addRows`, which is how the table of contents kept the
original's chapter titles, lost its page numbers, and gained the annex rows; since the audit
of 2026-10-03 the contents is a list of paragraphs, and so are the five boxes of chapter XI
that showed the steps of lifting a load beside a picture, rebuilt from their text alone when
the picture was dropped: a picture anchored inside a table cell stops LibreOffice's PDF export
at that table, and every page after it is lost. The equipment list (6) is portrait since then.

`sections` rewrites a part in the middle of the body. Each `{ from, to, content }` removes
everything from the first paragraph matching `from` (the first after the one matching
`after`, where a section names it) up to the one matching `to` (to the end without `to`),
tables and frames included, and writes `content` there: paragraphs as `append`
writes them, with `indent` (1/100 mm), `pageBefore` and `pageAfter`, and `{ "table": … }`, a
table drawn from a definition with `rows` like a `tables` entry, a paragraph left after it
only where the next thing is a table too. Between removing and writing the document goes
through a file and back: after the long chapter V of the risk assessment is removed,
LibreOffice fails to save the file once the new content grows past where that chapter was,
saying nothing more, and a reloaded document saves. `subheadings` are patterns for headings
of a spec's own that stay left-aligned: bold, 12 pt above, kept with what follows.

The risk assessment (ADR 015) is rewritten this way around the `riskAssessment` context.
Chapters I and II, the annexes and the bibliography are the provider's. Chapter III lists
the client, its representative, the workplace manager, the CAEN class, the employee count,
the workplaces, and the positions table; the questionnaire about the premises, the accident
counts and the inventory tables are gone. Chapter IV names the evaluation team from
`evaluationTeam` and the specialist, without the decision's number, which a document other
than a decision does not get. Chapter V repeats a subchapter per evaluation: the work system
table, the factors by component and group, an identity table and the evaluation sheet (two
tables, so that the sheet's column heads repeat on every page), the measures sheet or the
sentence that there is nothing unacceptable, and the interpretation as a ranking table,
sentences and a table of shares. The charts and the per-post formula objects are dropped; the
formula is written once in words. Every evaluation ends with a page break. Chapter VI keeps
its text with the count of posts from `evaluationCountText` and the recommendations made
general, then a table of the evaluations' levels and the unit's `Nrg`, and a subchapter VI.III
on consulting the workers (art. 18 of Legea 319/2006, naming `workersRepresentatives` when
there are any) and on when the assessment is reviewed (art. 46 (1) of H.G. 1425/2006). The
contents table loses its page numbers and gains a row per evaluation.

The prevention plan keeps its title and the hand-over block, signed by the employer, and
from there repeats per evaluation its `heading` and a table with the columns of annex 7 to
H.G. 1425/2006, a row per entry of `plan`, the place of work said once above it rather than in
a column; an evaluation without measures (`noPlan`) prints a sentence in place of the table.
The general training material's closing table of the unit's own risks is looped on
`hasUnitRisks` the same way, with a sentence after it for `noUnitRisks`.

## Covers

The seven covers are not imported, they are built:
`pnpm --filter @ssm-usor/document-engine build-covers`. The provider's covers are text boxes on
an empty page, with the provider's name pushed into place in the header by nine empty lines.
LibreOffice cannot read the boxes as text, and every cover is the same page with another
title. `tools/import/build_covers.py` makes them from `tools/import/covers.ro.json`: the
provider's name at the head, an optional motto, the title at 16 pt, the client's name at
14 pt, a list of contents where there is one, and the hand-over block as two borderless
columns, the client's side and the provider's, each with a line for the date. A cover is the
one place the house style goes above 12 pt.

The hand-over block starts at the same height on all seven, so the covers of a binder differ
only in their title and contents. The builder lays every cover out first and measures, in
LibreOffice, where the block would start; the lowest of them, plus 36 pt, is where it starts
on all, and each cover gets the space above the block that puts it there. A conditional item
is followed by an inverted section, `{{^condition}}`, holding an empty line of the item's
height, so the block stays put without it.

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
  sentences. The template predates `{{^…}}`, so the context carries both sides.
- **Prices** are printed as `DE COMPLETAT`, the contracts' `unfilledMark`, which is what
  issuing already warns about. The app keeps no prices (ADR 007).
- `{{#client.phone}}…{{/client.phone}}` and `{{#client.activity}}…` are inline conditions: the
  client's phone and CAEN activity are the only optional values.

The context is built by `apps/api/src/modules/service-contracts/context.ts`, and
`apps/api/scripts/lib/contract-template.test.ts` merges the real file with it, in every
combination above.

## Instruction modules

An instruction module ([ADR 012](architecture/adr-012-own-instructions.md)) is a Word file the
provider writes or uploads, never merged: the engine only reads what the app needs from one
and changes its fonts. `firstLine` is the first paragraph with text, the title proposed for
an upload. `countArticles` is how many top-level items the file's most used numbered list
has, whether the paragraphs carry the numbering themselves or through their style, which is
the count the training themes cite as "Art. 1–N"; a file without a numbered list counts
none. `sweepFonts` names the house font in every `rFonts`, in the font table and in the
theme, so the editor, which serves only that font, shows no notice; nothing else in the file
changes. `instructionModuleSkeleton()` is the file a module written in the app starts from.

The skeleton and the fixture modules of the dev seed and the flow tests are written by
`tools/import/build_modules.py` from `tools/import/modules.ro.json` (`pnpm --filter
@ssm-usor/document-engine build-modules`), as plain OOXML without LibreOffice: a module has
no header, no footer and no page furniture. The skeleton lands in `src/skeleton.ts`, base64
in a TypeScript module so the API needs no file at run time; the fixtures land in
`apps/api/scripts/fixtures/instruction-modules/` with an `index.json` naming their titles
and groups. Their article list is the one the templates keep, "Art. 1." flush left with
"1." and "a)" tiers under it.

The **annex title page** the PDF of the own instructions prints before each module (ADR 012,
amended 2026-10-03) is a template, but neither the pack's nor one of `templates/other/`:
`annexTitlePage()` returns it from `src/annex-title.ts`, base64 like the skeleton, so it
needs no Storage, no registry and no version in the snapshot. It is not a document a client
has, only a page of another document's PDF; it changes with a deploy, and an issued revision
keeps the one it was issued with inside its stored PDF. The API merges it per annex with
`branding`, `issueDate`, `provider` and `client` from the own instructions' snapshot and the
annex's `number`, `title` and `versionDate`; a missing value is an error, as for any template.

It is built like the covers, through LibreOffice, so that it gets the box of document details
from the import's own `build_header`, the same as 3.2's pages and checked equal to them by a
test, and the sweep:

```sh
pnpm --filter @ssm-usor/document-engine build-annex-title
```

`tools/import/build_annex_title.py` reads `tools/import/annex-title.ro.json`: the header's
code and name, what replaces "Pag. X din Y" ("Anexa {{number}}"), and the lines of the body,
centred in the upper third of the page. The typesetting tests run over it with the templates.

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
generated from the earlier one keep pointing at it.

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
  kept under 10 employees still needs one representative, and the training themes need an own
  instructions revision to cite (`documents.own_instructions`). The risk evaluations
  ([ADR 015](architecture/adr-015-risk-assessment.md)) need every current position evaluated
  with at least one factor (`positions.risk_evaluation`), the sensitive groups too
  (`risk_evaluations.sensitive_groups`), a prevention measure on every factor above level 3
  (`risk_evaluations.measures`), and a deadline and a person responsible on every factor with
  measures (`risk_evaluations.plan`); readiness names the evaluations behind those codes as
  `incompleteRiskEvaluations`.
  `GET /clients/{clientId}/documents/readiness` returns the list; generating is refused until
  it is empty, because a data field is never left blank. The training schedule requires a
  decision for both staff categories, at least one interval, and an interval for every category
  held by a current employee. An explicit “Nu se aplică” excludes a category with no current
  employees; an undecided blank does not count as an exclusion.
- `buildDocumentContext(facts)` turns the stored facts into the names of the table below:
  dates as `19.01.2026`, people under the roles they hold in the order they were designated,
  the training schedule in words (`TRIMESTRIAL`, `februarie, mai, august, noiembrie`, `2 ore`,
  its number and unit joined by no-break spaces so a line cannot end between them), and
  `branding`. Where a sentence names everyone who holds a role, one text names them all and
  reads for one person or several: `workplaceManagersText` and `imminentDangerText`
  (`Ion POP având funcția de Șef atelier și Ana RUS având funcția de Șef sală`),
  `firstAiderNames` (`Ion POP, Ana RUS și Dan MARIN`), and `workplaceManagersList` for a
  label line (`Ion POP, Șef atelier; Ana RUS, Șef sală`). A count is worded as Romanian counts:
  `de` from 20 on (`24 de luni`). The decisions are numbered from the first decision number in
  the order training, evaluation team, first aid, imminent danger, workers' representatives; `documentData(context, typeKey)` gives
  one template its number. The context is what a revision keeps as its data snapshot.
- `documentApplies(facts, typeKey)` says whether a document belongs in the client's set:
  decision 1.5 only from 10 current employees. Generating leaves out the rest; a document
  that already exists stays, and cover 1.0 keeps listing a 1.5 that was generated.
- `unitRisks` are the unacceptable factors (level above 3) of every evaluation the risk
  assessment prints, each description once (compared without case, spacing or a closing full
  stop), the highest level first and then in the order met, with `risk` the description and
  `measure` every prevention measure taken against it, one per line, those of a repeated
  factor merged, each line opening with `– `. `hasUnitRisks` is true when there are some, for
  the table, and `noUnitRisks` when there are none, for a sentence to say so.
- `riskAssessment` is what the risk assessment (9) and the prevention plan (10) print
  ([ADR 015](architecture/adr-015-risk-assessment.md)). It is built whole and recorded whole
  in a snapshot that prints any of it, so a changed factor marks those documents "Date
  modificate". Every text is ready to print: a dash (`—`) stands where there is nothing,
  levels and shares have a comma and two decimals, a share's `%` held to its number by a
  no-break space, and a value that holds several measures
  (`measures`, the four kinds) puts each on a line of its own opening with `– `, so a measure
  that wraps cannot be read as the next one.

  | Name                                 | Example                                                                                                                  |
  | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
  | `riskAssessment.unit.activity`       | `5630 – Baruri și alte activități de servire a băuturilor`, the CAEN class by name; `—` without a code                   |
  | `….unit.employeeCount`               | `6`, the current employees                                                                                               |
  | `….unit.workplaces[]`                | `{ name, kind: 'Sediu social' \| 'Punct de lucru', address }`, the registered office first; `noWorkplaces` without any   |
  | `riskAssessment.evaluationCountText` | `5 posturi de lucru, grupurile sensibile la riscuri specifice și o altă evaluare`; `un post de lucru`, `alte 2 evaluări` |
  | `riskAssessment.globalLevel`         | `2,50`, the unit's: the evaluations' levels, each weighted by itself (Σ Nr² / Σ Nr)                                      |
  | `riskAssessment.evaluations[]`       | One per subchapter of chapter V and per table of the plan, in the order below                                            |

  The evaluations are the current positions in the order of the positions table, then the
  sensitive groups, then the client's other evaluations by name. An archived position's
  evaluation stays out, and so does another evaluation without a factor. Each has:

  | Name                                   | Example                                                                                                                                                                                                                                                                                                                     |
  | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `roman`, `name`                        | `II`, `Sudor`; `Grupuri sensibile la riscuri specifice`; another's own name                                                                                                                                                                                                                                                 |
  | `heading`                              | `LOCUL DE MUNCĂ: BIROU, POSTUL DE LUCRU: CONTABIL`, `POSTUL DE LUCRU: SUDOR` without a work zone, `VIZITATORI`, `GRUPURI SENSIBILE LA RISCURI SPECIFICE (FEMEI …)`                                                                                                                                                          |
  | `workZoneOrDash`                       | `Birou`, or `—`                                                                                                                                                                                                                                                                                                             |
  | `workSystem`                           | `{ executant, workTask, meansOfProduction, workEnvironment }`: a position's name and activities, or the client-level evaluation's own texts                                                                                                                                                                                 |
  | `exposedPersons`, `exposure`           | `3 persoane`, `25 de persoane`, `nicio persoană` (a position's current employees) or the evaluation's text; `8 h / schimb`                                                                                                                                                                                                  |
  | `factorCount`                          | `37`                                                                                                                                                                                                                                                                                                                        |
  | `components[]`                         | The four components, always, in the sheet's order: `{ label: 'MIJLOACE DE PRODUCȚIE', of: 'mijloacelor de producție', count, share: '24,32 %', noFactors, groups }`                                                                                                                                                         |
  | `…groups[]`                            | `{ letter: 'a', name: 'Factori de risc mecanic', factors: [{ code, description }] }`, in the order the evaluator first used them                                                                                                                                                                                            |
  | `sheet[]`                              | A row of the evaluation sheet per factor: `{ component, group, code: 'F1', description, consequence, gravityClass, probabilityClass, level }`                                                                                                                                                                               |
  | `ranked[]`                             | `{ code, description, level }`, every factor, the highest level first                                                                                                                                                                                                                                                       |
  | `globalLevel`                          | `2,49`                                                                                                                                                                                                                                                                                                                      |
  | `verdict`                              | `valoare care îl încadrează în categoria locurilor de muncă cu nivel de risc acceptabil, nedepășind limita maximă acceptabilă de 3,5`, or the sentence for a level over the limit                                                                                                                                           |
  | `unacceptable[]`                       | `{ code, description, level }`, the highest level first, for the interpretation's list                                                                                                                                                                                                                                      |
  | `hasUnacceptable`, `noUnacceptable`    | Booleans                                                                                                                                                                                                                                                                                                                    |
  | `findings`                             | `Rezultatul este susținut de „Fișa de evaluare”, din care se observă că din totalul de 37 de factori de risc identificați, 2 dintre ei depășesc, …`                                                                                                                                                                         |
  | `unacceptableLead`, `measuresSentence` | `Cei 2 factori de risc care se situează în domeniul inacceptabil sunt:`, `Pentru diminuarea sau eliminarea celor 2 factori de risc sunt necesare …`; empty without                                                                                                                                                          |
  | `irreversible`                         | `Din analiza „Fișei de evaluare” se constată că 7 dintre factorii de risc identificați, reprezentând 18,92 %, pot avea consecințe ireversibile …`                                                                                                                                                                           |
  | `plan[]`, `hasPlan`, `noPlan`          | The rows of the measures sheet (9) and of the plan (10): every factor with a measure, the highest level first, `{ code, description, level, measures, technical, organizational, hygienicSanitary, other, actions, deadline, responsiblePerson, observations }`, `measures` all of them and the next four by kind; booleans |

  The factors are numbered F1…Fn down the sheet: by component in the provider's order (means of
  production, work environment, executant, work task), then by group in the order the
  evaluator first used it, then in the evaluator's order. On a `sheet` row `component` and
  `group` are empty after their first row, as the merged cells of the sheet print them.
  `consequence` is the gravity class's wording. The sentences are
  worded for any count: `singurul factor`, `niciunul dintre cei 12 factori`, `unul singur`,
  `toți cei`, and `de` from 20 on (`21 de factori`). `irreversible` counts the factors whose
  consequence is invalidity or death, gravity classes 4 to 7.

- `themes` is what the training themes (4.2, [ADR 014](architecture/adr-014-training-themes.md))
  print, built from the client's newest own instructions revision, draft or issued, and the
  modules it annexes at the versions it annexed them. It is absent while there is no such
  revision (none, or an uploaded file), and `documentData(context, 'training_themes')` then
  throws; every other document merges as before. The template reads it by dotted paths, so the
  snapshot records the whole object and any change in it marks the themes "Date modificate":

  | Name                             | Example                                                                                                                                                                                                                                               |
  | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `themes.ownInstructionsRevision` | `{ id, number, versionIds }` of the 3.2 revision cited, the module versions in its annex order; never printed                                                                                                                                         |
  | `themes.annexTitles`             | `I.P.S.S.M. Birou; I.P.S.S.M. Scări`, or `—` without annexes                                                                                                                                                                                          |
  | `themes.positions[].name`        | `ȘOFER`, the position's name in capitals                                                                                                                                                                                                              |
  | `…trainer`                       | `Ion POP – conducător loc de muncă` for an execution post, `Ion POP și Ana RUS – conducători loc de muncă` with two workplace managers, `S.C. SSM S.R.L. – Dan MARIN` for a technical-administrative one; "loc de muncă" is joined by no-break spaces |
  | `…modules[]`                     | `{ citation }`, the post's modules the revision annexes, in its order: `I.P.S.S.M. Birou, Art. 1 – 12`, or the title alone for a module without numbered articles                                                                                     |
  | `…intervalLabel`                 | `3 LUNI`, `1 LUNĂ`: the post's interval or its category's                                                                                                                                                                                             |
  | `…sessions[]`                    | `{ month: 'FEBRUARIE', content, duration: '120 min' }`                                                                                                                                                                                                |

  A session's `content` is the slice of the common part dealt to it, then every module whole,
  then `Testare.` on the last: `I.P.S.S.M. Art. 1 – 45; I.P.S.S.M. Birou, Art. 1 – 12`. The
  twelve chapters of 3.2 are dealt over the sessions in contiguous groups whose sizes differ by
  at most one, the larger first. The chapter starts of 3.2 and 2.2 are constants of
  `apps/api/src/modules/documents/themes.ts`, held to the templates by
  `apps/api/scripts/lib/theme-chapters.test.ts`.

A test merges every registered template with this context; the engine throws on a placeholder
without a value, so a template that asks for a new name fails there first. The list of
document types in `packages/contracts/src/documents.ts` is checked against the manifest by the
same test.

## Built-in templates

| `type_key`                        | Document                                                                                                                                                   | Data beyond `decisionNumber`, `issueDate`, `client`, `provider`                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision_training`               | Decision no. 1: who trains whom, and the periodic training schedule                                                                                        | `workplaceManagers[]`, `workplaceManagersText`, `training` (`periodicDuration`, `administrativeFrequency`, `administrativeMonths`, `workerFrequency`, `workerMonths`, `dayFrom`, `dayTo`) |
| `decision_risk_evaluation_team`   | Decision no. 2: the risk evaluation team                                                                                                                   | `evaluationTeam[]`, `specialist` (`name`, `professionalTitle`)                                                                                                                            |
| `decision_first_aid`              | Decision no. 3: who gives first aid, with its two acknowledgement tables                                                                                   | `firstAiders[]`, `firstAiderNames`                                                                                                                                                        |
| `control_regulation`              | The internal regulation on the employer's own checks, with its schedule                                                                                    | `issueYear`, `followingYear` for the schedule's heading                                                                                                                                   |
| `test_hiring`                     | The test after the general introductory training, with its specimen                                                                                        | None                                                                                                                                                                                      |
| `test_periodic`                   | The yearly test, with its specimen                                                                                                                         | None                                                                                                                                                                                      |
| `event_registers`                 | The four registers of accidents and dangerous incidents, A4 landscape                                                                                      | None                                                                                                                                                                                      |
| `control_report`                  | The report form filled in by hand at each control visit                                                                                                    | None                                                                                                                                                                                      |
| `employer_briefing`               | What the law asks of the employer, chapter by chapter, about 30 pages                                                                                      | None                                                                                                                                                                                      |
| `general_training_material`       | The material for the general introductory training, about 85 pages                                                                                         | `unitRisks[]` (`risk`, `measure`), `hasUnitRisks` and `noUnitRisks` for the closing chapter on the unit's own risks                                                                       |
| `own_instructions`                | The common part of the own instructions (ADR 012): chapters I–XII, a table of contents without pages, the positions table, and the list of annexed modules | `positions` (`workZoneOrDash`, `intervalLabel`, `trainingDuration`), `annexes` (`number`, `title`, `versionId`, `versionDate`), `noAnnexes`                                               |
| `training_themes`                 | Themes and schedule of the three kinds of training (ADR 014), a block per position in chapters II and III                                                  | `specialist`, `themes` (`annexTitles`, `positions`: `name`, `trainer`, `intervalLabel`, `modules[]`, `sessions[]`)                                                                        |
| `protective_equipment_list`       | Protective equipment per job, A4 landscape (ADR 011)                                                                                                       | `positions` (`activities`, `staffCategory`), `equippedPositions`: the positions with entries, with `equipment[]`, which `positions` does not carry                                        |
| `risk_assessment`                 | The risk assessment (ADR 015): the method's chapters and annexes, then the unit, the team, a subchapter per evaluation, and the conclusions                | `specialist`, `workplaceManagersList`, `evaluationTeam`, `workersRepresentatives`, `positions`, `riskAssessment`                                                                          |
| `prevention_plan`                 | The prevention and protection plan (ADR 015), A4 landscape: a table per evaluation with the columns of annex 7 to H.G. 1425/2006                           | `riskAssessment.evaluations[]` (`heading`, `plan[]`, `hasPlan`, `noPlan`)                                                                                                                 |
| `decision_imminent_danger`        | Decision no. 4: who acts in serious and imminent danger                                                                                                    | `workplaceManagersText`, `imminentDanger[]`, `imminentDangerText`                                                                                                                         |
| `decision_workers_representative` | Decision no. 5: the workers' representatives, from 10 employees                                                                                            | `workersRepresentatives[]`, `workersRepresentativesLead`                                                                                                                                  |

For `decision_training`, `training` has `periodicDuration`, `intervalPhrase`, `dayFrom`, and
`dayTo`. The booleans `administrative` and `worker` say which interval paragraphs print.
Their matching frequency and months values exist only for applicable categories; the months
carry their noun, "luna martie" or "lunile februarie și august", so one month reads right.

`client` is `legalName`, `representativeName`, `representativeRole`; `provider` is `legalName`
and `representativeName`. A person in a list is `name` and `jobTitle`. Every decision ends with
an acknowledgement table that repeats a row per designated person.
