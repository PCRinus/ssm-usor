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

| Spec key         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `header`         | Rebuilds the box of document details at the head of every page from `code` and `title`: the issue date, who prepared the document and for whom, its code, its name, and "Pag. X din Y" as real page fields. The originals type the page number by hand and pad cells with spaces. `preparedBy: "specialist"` names the specialist, `preparedBy: "fireSafetyTechnician"` the fire-safety technician                                                                                                                                   |
| `handover: true` | Replaces the five lines of "Am întocmit și predat un exemplar … Am primit un exemplar", aligned with tabs and runs of spaces, with the two-column block the covers use: what each side confirms, room to sign, who signs. As an object, `signer: "fireSafetyTechnician"` has the technician sign for the provider in place of the legal representative. Where a loop's closing tag stands right above the block, an empty line under it keeps 12 pt between the repeated table and the block, since merged tags leave no room behind |
| `tables`         | Replaces the n-th table of the body (`replaceTable`) with one drawn from a definition: `widths`, `rows` of cells as text or `{text, colspan, rowspan}`, `headerRows`, the columns set `left`, a `size`, and a `heading` paragraph above it. For a table whose columns are a letter wide or whose cells are aligned with tabs                                                                                                                                                                                                         |

A spec's `kind` picks the rules that recognise a document's parts: `decision`, `regulation`,
or `test`. A test has questions and answers on top of a title: a question typed with its number
is set bold and kept with its answers; each question's answers start again from a), where the
originals run one list through the whole test so that the specimen reads d), e), f); answers
typed by hand (" a) …", long ones broken with the Enter key) are joined back together and
hung from their letter, which may carry the superscript of a letter the law inserted later
(`r¹⁶)`, in the posted instructions' quotation of Legea 307/2006 art. 19); a second title opens
the specimen on a new page. In a `register`, every
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
cannot carry over a page and cut off instead. `above` asks for more room above a table than a
paragraph's distance, in points: the tests' answer sheet starts 12 pt under the last answer.

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
drawn table a cell may set `bold` and `align`, and `rowHeights` makes single rows taller or
shorter than the `rowHeight` of the rest, for the blank space of a form.

A document drawn from nothing can also be written in order with `content`, a list of
paragraphs and tables as a section's `content` takes them; two tables in a row keep a
paragraph between them, or they would be saved as one. `landscape: true` turns its page.
`titles`, `subtitles`, `headings` and `answers` add patterns to the rules of the spec's
`kind`, for the titles a drawn document has and no original did: the fire-safety registers are
drawn this way, as `kind: "register"` with a title of their own opening each register on a new
page. Every import clears the author, company and title the original was saved with, and sets
the document's language to Romanian.

A form's blanks are cells, never runs of dots or underscores: a label in one cell, the room to
write in the next, and for a sentence with a blank inside it, the sentence cut at the blank
across the cells of the row ("13. Incendiul sau orice alt eveniment se anunță la" | | "prin" | ).
Lines to write on are empty rows of the form's table, as many as the model has.

`originals/` is git-ignored, specs included, because both quote real people by name.

Each documentation set ([ADR 016](architecture/adr-016-fire-safety-documents.md)) has a folder of
its own, the same under `originals/` and `templates/`: a spec in `originals/fire/` reads its
original from that folder and writes its template to `templates/fire/`. The occupational safety
set stays at the top of both. `import-templates` takes every set's specs, or the ones named;
`--sweep` reaches every set's templates.

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
| Text             | Arial 10 pt; the document title bold 12 pt; headings ("DECIDE:", "PROCES-VERBAL…") bold 10 pt, centred; 8 pt in a table of more than six columns and in the header's document details                                                                                                                                                                                                                                                                                                                               |
| Page             | A4, margins 25 mm left for binding and 20 mm elsewhere; an empty header or footer is switched off; a header sits inside the top margin like the footer inside the bottom one: 12 mm, the box, 4 mm                                                                                                                                                                                                                                                                                                                  |
| Alignment        | Running text and list items are left-aligned, never justified: without hyphenation a justified line opens uneven gaps between words. Titles, headings, and the signature block are centred                                                                                                                                                                                                                                                                                                                          |
| Spacing          | Paragraph margins, 6 pt between paragraphs and 2 pt between list items. Every empty paragraph used as spacing is removed, and so are the spaces paragraphs were aligned with. A list sits close under the line that introduces it and the room comes after its last item, loop tags looked through; after an item a loop repeats, the room goes above the next paragraph instead                                                                                                                                    |
| Lists            | Items snapped to three indent tiers, in the list's own definition, whatever list they came from. The originals build one hierarchy from a dozen unrelated lists with paragraph indents on top. A list of one item loses its lone "1.". Article labels ("Art. 1.") stay automatic list numbers. A dash typed by hand ("– ") hangs from its tier like a list label, a tab after it, so a long item's lines run under its text. A bullet asked for in Times New Roman is set in Arial                                  |
| Signature block  | The client's name, the representative's role and name: centred, so a long name grows both ways instead of drifting off a column of spaces; 24 pt above the client's name and 6 pt under the representative's, so the acknowledgement after it fits on the same page more often. A client's name that opens the document is a title block and has no room above it: LibreOffice drops that room after a page break, so the first page sat lower than the next                                                        |
| Staying together | From a heading to the table it introduces, everything moves to the next page together, but no run of paragraphs kept with the next, by their own setting or their style's, is longer than three: the sweep cuts a longer one, which left pages two thirds empty, down to its first two and its last three, sparing a chapter heading and a line that ends in a colon. A line that ends in a colon keeps with the list item after it. A short table does not split; two lines at least stay together at a page break |
| Characters       | Romanian as the language, no font colours (the provider marks in red what they replace by hand), no dead internal hyperlinks and the underline they left, no boxes or shading around a paragraph, no empty shapes drawn behind a title. Superscript characters ("r¹⁶", "30³") become digits set as superscript: the bold face of the PDFs lacks ⁰ and ⁴ to ⁹ and printed them in another font                                                                                                                       |
| Page fields      | "Pag. X din Y" in the header box is real `PAGE` and `NUMPAGES` fields, written as the bare keywords: LibreOffice spells the default format out as `\* ARABIC`, and the in-app editor then paints the cached result, the last page's number, on every page instead of evaluating the field                                                                                                                                                                                                                           |
| Footer           | Every footer ends with `{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}`, Arial 7.5 pt, grey, centred on the width of the text: alone where the document had no footer, one more paragraph where it had one. `branding: true` in the merge data prints it; `false` prints nothing. See [branding](document-branding.md)                                                                                                                                                                         |
| The end          | A document that closes with a table keeps the one paragraph Word needs after it, at 1 pt, so it cannot spill onto an empty last page                                                                                                                                                                                                                                                                                                                                                                                |

Then **read the result**. `preview` renders every template twice, with one person and short
names and with three people and names long enough to test the layout, converts to PDF, and
prints the page counts. No check replaces reading the pages.

`src/editor-layout.test.ts` opens every template in the layout engine of the in-app editor, at
the version the app uses (both take it from the `catalog` in `pnpm-workspace.yaml`), and fails
when the editor refuses a file or a word of it is missing from the laid-out pages. The editor
drops what a table cell cannot hold instead of growing the row: text set vertically never makes
its row taller and needs room for a line across the cell's width, and a row of exact height
loses the line that does not fit. The vertical headers of the risk assessment's Anexa 2 have
side margins of 1.4 pt for this, in columns 19 pt wide.

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

A section's `content`, or a drawn document's, can copy a passage of another template
([ADR 019](architecture/adr-019-fire-safety-stage-three.md)): the fire-safety set prints the
first aid of the own instructions (3.2) this way, so there is one text to correct.

```json
{
  "copy": "3.2_own_instructions.docx",
  "first": "^Primul ajutor este ajutorul imediat",
  "last": "^Dacă sunt mai mulți salvatori"
}
```

`copy` is a template's path under `templates/`, never an original: what is copied is the text
the other set prints. The passage runs from the body's first paragraph matching `first` to the
next one matching `last`, both included, with no table between them; the patterns are read
both by Python, at import, and by JavaScript, in the test, so they keep to what the two share.
The import copies it through the office's own copy and paste, its formatting and lists
included, after the wording pass and the `corrections`, which the source has already been
through and which would change it a second time (the shared pass makes "a doua victimă" "a
două"), and before the typesetting. Its list styles are renamed after the template on the way,
since every imported file names its lists `WWNum1`, `WWNum2` and so on and the document's own
style of the same name would win. Its articles join the document's article list, so a spec
that copies needs `articles: true`, and the import fails without it. A copy inside a loop sets
`"numbering": "dashes"`: its articles lose their labels and its numbered lists become dashes,
since the engine repeats a list's paragraphs under one numbering, and decision 7's posted
instructions would otherwise count on from one workplace to the next. `"restyle": true` sets the
copy like the document it joins: 3.2 sets its articles in a bold heading style, which becomes the
body's, so only the "Art. N." label is bold, and its list labels, which took the 9 pt of their
paragraph's end mark, become bold at the body's size, or plain for dashes. The labels stay
numbers or letters as the source has them.

The import lists every copy in `templates/copied-passages.json`, the template, its source and
the two patterns, replacing the entries of the template it writes: the specs live outside the
repository, and the list does not. `src/copied-passages.test.ts` reads the list and compares each
copied passage with its source paragraph by paragraph, by their text without list labels, and
fails on the first word that differs, so a correction to 3.2 fails the test until every
template that copies from it is imported again.

A decision's spec may set `articles: true`: every paragraph that opens with a typed article
label ("Art. 3.") or is numbered by a list of the original's own ("Art.3") joins one list
numbered "Art. %1.", as the other decisions' are, so an article added or deleted in the editor
leaves no gap and a label the original typed twice is numbered right (the fire-safety decision
8 had two "Art. 6."). `levels` moves the list items matching a `pattern` to a `level`, for one
the original nested under the item before it by mistake (decision 1's responsibilities under
contracts, typed as item c) of the item above). `tiers` sets the list items matching each
`pattern` at a `tier` (0 to 2) after the typesetting, where the original nests parallel parts
differently: fire-safety decision 2 set the letters of one training flush with its heading and
those of the next one tier in. A tier belongs to a list's level, so items of one level sent to
different tiers move to a copy of their list, and the import fails if a label changes on the way.
`corrections` are replacements applied after the shared wording pass, for
what its dictionary gets wrong in one document: it makes every "afara" the adverb "afară", also
in "din afara unității". A paragraph holding only `@@page-break@@` becomes a page break of its
own when the file is swept; inside a section of a loop it prints a break for some items only,
which a break set on a paragraph cannot do, since it is saved as a break run at the end of the
paragraph before it, a loop tag's. The posted sheet of the fire-safety set opens a page for
every workplace but the first this way.

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

The covers are not imported, they are built:
`pnpm --filter @ssm-usor/document-engine build-covers [number or type key …]`. The provider's
covers are text boxes on an empty page, with the provider's name pushed into place in the
header by nine empty lines. LibreOffice cannot read the boxes as text, and every cover is the
same page with another title. `tools/import/build_covers.py` makes them from one definition
per set: `tools/import/covers.ro.json`, the seven of the occupational safety set, into
`templates/`, and `tools/import/covers.fire.ro.json` into the `folder` it names,
`templates/fire/`. A cover has the provider's name at the head, an optional motto, the title
at 16 pt, the client's name at 14 pt, a list of contents where there is one, and the hand-over
block as two borderless columns, the client's side and the provider's, each with a line for
the date. A cover is the one place the house style goes above 12 pt.

The provider's side is signed by the legal representative unless the definition's `handover`,
or a cover, names a `signer`: `{ "name", "role" }`. The fire-safety covers are signed by the
technician, `{{fireSafetyTechnician.name}}` over `Cadru tehnic PSI al {{provider.legalName}}`.
The decisions cover of that set (1.0) lists the nine decisions of the provider's binder, the
four of stage 3 included, as the binder's cover: the sample's listed eight and missed the
appointment of the technician (decision 6). The set has a motto of its own, which the own
instructions cover (2.0) prints above its title, as the sample's did. A cover may carry an `intro`, a
`lead` and its lettered `items` under the client's name: the training themes cover (3.0) says so
how the themes are structured, as the sample's did in a box beside its title.

The hand-over block starts at the same height on every cover of a set, so the covers of a
binder differ only in their title and contents. The builder lays every cover of the set out
first and measures, in LibreOffice, where the block would start; the lowest of them, plus
36 pt, is where it starts on all of them, and each cover gets the space above the block that
puts it there. The sets are measured apart, so a cover of one never moves the other's. A conditional item
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

Three manifests are registered: the pack's, `templates/other/manifest.json`, and the
fire-safety set's, `templates/fire/manifest.json`.

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

Each manifest entry carries a `change`: the `kind` (`legal`, `correction` or `layout`) and
the `note` members read for the newest version of that file
([ADR 017](architecture/adr-017-legislation-monitoring.md)). Change it in the same commit as
the file: a changed file registered under the old `change` tells members about the earlier
change. A file already registered keeps the note it came with, so editing only the note
changes nothing in the database. The script prints the kind of each version it creates.

On `main`, the job "Register document templates" runs the same script after the migrations
when a template, the script or a migration changed since the last deployment. The deployment
workflow compares with the last run that succeeded, so a run that is superseded hands its
templates on to the next. A wiped environment gets everything back from the migrations and this one command.

## Citations

The legal acts the templates quote or refer to are indexed from their text
([ADR 017](architecture/adr-017-legislation-monitoring.md)). `src/citations.ts` reads every
paragraph of `word/document.xml` and finds two forms. A **quoted article** opens with the
marker `(Preluare din <act> – <article>)`, exactly so: `Legea 319/2006`, `H.G. 1425/2006`,
`O.U.G. 158/2005`, `O.G. 1/2000`, `Ordinul 427/2002`, `OMAI 163/2007`, then `Art. 7`,
`Art. 7 alin. (1) lit. c)` (a marker that ends in a letter closes twice), `Anexa 2` or `pct. 5`,
and at most one tail naming the act that amended the article, `– conf. H.G. 767/2016 – pct. 6`.
The quotation runs on over the paragraphs that open with an alineat or a letter, `(2)` or `b)`,
and over the list items a line ending in `:` or `;` introduces, and stops at an empty paragraph,
a table, a chapter heading, the next marker or the next article of the document's own
numbering. A **reference** is any other mention of an act by number and year; its article is the
one after ` – art.` or the `art. N … din` just before it. Each citation records its template,
paragraph and the innermost `{{#…}}` or `{{^…}}` section it sits in.

```bash
pnpm --filter @ssm-usor/document-engine citations   # rewrites templates/citations.json
```

`templates/citations.json` is generated and committed; a test fails when it differs from a fresh
parse, and `pnpm check:generated` regenerates it. `templates/legal-acts.json` is curated: every
act the index names, with its title and the id of its page on legislatie.just.ro
(`/Public/DetaliiDocument/<portalId>`). The portal's search matches the year of publication,
not of the act, so an id is taken only when the page's title carries the act's number and
year. A template that names an act missing from the list fails the tests until it is added.
The API can bundle both through `@ssm-usor/document-engine/citations`.

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

  | Name                                 | Example                                                                                                                                                               |
  | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `riskAssessment.unit.activity`       | `5630 – Baruri și alte activități de servire a băuturilor`, the CAEN class by name; `—` without a code                                                                |
  | `….unit.employeeCount`               | `6`, the current employees                                                                                                                                            |
  | `….unit.workplaces[]`                | `{ label: 'Punct de lucru „Atelier”', address }`, the registered office first, `Sediu social` alone for a name that only repeats the kind; `noWorkplaces` without any |
  | `riskAssessment.evaluationCountText` | `5 posturi de lucru, grupurile sensibile la riscuri specifice și o altă evaluare`; `un post de lucru`, `alte 2 evaluări`                                              |
  | `riskAssessment.globalLevel`         | `2,50`, the unit's: the evaluations' levels, each weighted by itself (Σ Nr² / Σ Nr)                                                                                   |
  | `riskAssessment.evaluations[]`       | One per subchapter of chapter V and per table of the plan, in the order below                                                                                         |

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
  then `Testare.` on the last: `I.P.S.S.M. Art. 1 – 45; I.P.S.S.M. Birou, Art. 1 – 12`, the
  spaces of every range non-breaking so that a narrow cell never splits one. The
  twelve chapters of 3.2 are dealt over the sessions in contiguous groups whose sizes differ by
  at most one, the larger first. The chapter starts and article counts of 3.2, 2.2 and the
  fire-safety IPSU are `ChapterStructure` constants of `apps/api/src/modules/documents/themes.ts`
  (`ownInstructionsChapters`, `generalTrainingChapters`, `fireOwnInstructionsChapters`), which
  `dealChapters(structure, sessions)` deals, held to the templates, and to the ranges 4.2 prints,
  by `apps/api/scripts/lib/theme-chapters.test.ts`. The IPSU's twenty-three chapters count
  257 articles, the 46 of 3.2's first aid among them.

- `fire` is what the fire-safety set's templates of stages 2 and 3 print
  ([ADR 018](architecture/adr-018-fire-safety-means.md),
  [ADR 019](architecture/adr-019-fire-safety-stage-three.md)), built by
  `apps/api/src/modules/documents/fire-safety.ts` beside `client`, `provider`,
  `fireSafetyTechnician` (`name`, `certificate`, and `authorization`, null when not set),
  `issueDate` and `branding`, the only names that set is merged with. A snapshot keeps each
  whole, so any edit of the client's fire-safety data marks the set's drafts that print `fire`,
  and an edit of the technician's certificate or authorization those that print the technician.

  | Name                                                 | Example                                                                                                                                                                                                                                                                                                                                                                                         |
  | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `fire.decisionNumbers`                               | `{ organization: '5 PSI', training: '6 PSI', openFire: '7 PSI', smoking: '8 PSI', seasons: '9 PSI', technician: '10 PSI', instructions: '11 PSI', waste: '12 PSI', control: '13 PSI' }`: the first decision number plus each decision's place in the binder (`fireDecisionOrdinals`) minus one                                                                                                  |
  | `fire.schedule`                                      | `periodicHours`, `periodicLabel` (`2 ore`), `administrativeIntervalMonths`, `administrativeIntervalLabel` (`3 LUNI`), `administrativeMonths` (`lunile februarie, mai, august și noiembrie`), the same for `worker…`, `firstMonth`, `firstMonthLabel` (`februarie`), `dayFrom`, `dayTo`                                                                                                          |
  | `fire.staff`                                         | `{ administrative: ['Manager magazin'], execution: [...], administrativeText: 'Manager magazin', executionText }`: the current posts' names by staff category, a text null for a category without one                                                                                                                                                                                           |
  | `fire.coordinator`, `fire.interventionLeader`        | `{ name, jobTitle }`, the first person in the role in the order they were designated                                                                                                                                                                                                                                                                                                            |
  | `fire.workplaceManagers[]`                           | `{ name, jobTitle, workplaceName }`, `workplaceName` null for a manager of every workplace                                                                                                                                                                                                                                                                                                      |
  | `fire.designated[]`                                  | The coordinator, the leader and the workplace managers, each once, for the acknowledgement tables                                                                                                                                                                                                                                                                                               |
  | `fire.workplaces[]`                                  | The active workplaces by name: `first`, `name`, `activity`, `address`, `floorAreaM2`, `normLabel` (`Clădiri comerciale (1 buc./200 m²)`), `assemblyPoint`, the three texts of section I and `specificMeasures` (empty when unset)                                                                                                                                                               |
  | `…extinguishers[]`, `…extinguisherCount`             | `{ code: 'P6', agentLabel: 'Pulbere', capacityLabel: '6 kg', wheeled, count }`, grouped by agent, capacity and wheels; litres for foam and water                                                                                                                                                                                                                                                |
  | `…otherEquipment[]`, `…installations[]`              | `{ kindLabel: 'Ladă cu nisip', count }`; `{ kindLabel, description }`, with `hasInstallations`, `hasExteriorHydrants`, `hasInteriorHydrants`                                                                                                                                                                                                                                                    |
  | `…manager`, `…firstIntervention[]`                   | The workplace manager tied to it or to none, first by name, or null; the leaders and coordinators tied to it or to none, `{ name, jobTitle, roleLabel }`                                                                                                                                                                                                                                        |
  | `…firstInterventionNames`, `…interventionLeaderName` | `Ioana PETRE și Paul ANDREI`; the first leader there, or the set's leader where none answers for the workplace alone                                                                                                                                                                                                                                                                            |
  | `fire.hasExteriorHydrants`, `fire.waste`             | Whether any workplace has exterior hydrants; `{ kinds: [...], contractor }`, `contractor` null when unset                                                                                                                                                                                                                                                                                       |
  | `fire.hasGasExtinguishers`                           | Whether an active workplace has a CO₂ or clean-agent extinguisher, which decision 9 has weighed every six months                                                                                                                                                                                                                                                                                |
  | `fire.smoking`                                       | `{ policy: 'designated_places', forbiddenEverywhere: false, designatedPlaces: true, place: 'în curtea interioară, lângă poarta de acces auto' }`, `place` null without one and always where smoking is forbidden                                                                                                                                                                                |
  | `fire.themes[]`                                      | One per staff category with current posts, technical-administrative first: `staffCategory`, `label` (`Personal administrativ`, `Personal de execuție`), `posts`, `postsText` (`Contabil, Sudor`), `workplaceTrainers` and `periodicTrainers`, `intervalLabel` (`3 LUNI`), `sessions[]`                                                                                                          |
  | `…workplaceTrainers`, `…periodicTrainers`            | `{ workplaceManagers, technician }`: `Ion POP și Ana RUS – conducătorii locurilor de muncă` or null, and whether the technician trains too, whom the template names from `provider` and `fireSafetyTechnician`. The technician alone trains the administrative staff; the workplace managers the execution staff, and in the periodic training the technician "după caz", as decision 2 says    |
  | `…sessions[]`                                        | `{ month: 'FEBRUARIE', content, duration: '120 min' }`, one per month of the category's schedule, `content` the slice of the IPSU dealt to it, the posted instructions with decision 7's number and the posted sheet: `IPSU Art. 1 – 59; Instrucțiunile afișate la locul de muncă, Decizia nr. 11 PSI; Organizarea apărării împotriva incendiilor la locul de muncă`, `Testare.` after the last |

A test merges every registered template with this context; the engine throws on a placeholder
without a value, so a template that asks for a new name fails there first. The list of
document types in `packages/contracts/src/documents.ts` is checked against the manifest by the
same test.

## Built-in templates

| `type_key`                        | Document                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Data beyond `decisionNumber`, `issueDate`, `client`, `provider`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision_training`               | Decision no. 1: who trains whom, and the periodic training schedule                                                                                                                                                                                                                                                                                                                                                                                                                | `workplaceManagers[]`, `workplaceManagersText`, `training` (`periodicDuration`, `administrativeFrequency`, `administrativeMonths`, `workerFrequency`, `workerMonths`, `dayFrom`, `dayTo`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `decision_risk_evaluation_team`   | Decision no. 2: the risk evaluation team                                                                                                                                                                                                                                                                                                                                                                                                                                           | `evaluationTeam[]`, `specialist` (`name`, `professionalTitle`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `decision_first_aid`              | Decision no. 3: who gives first aid, with its two acknowledgement tables                                                                                                                                                                                                                                                                                                                                                                                                           | `firstAiders[]`, `firstAiderNames`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `control_regulation`              | The internal regulation on the employer's own checks, with its schedule                                                                                                                                                                                                                                                                                                                                                                                                            | `issueYear`, `followingYear` for the schedule's heading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `test_hiring`                     | The test after the general introductory training, with its specimen                                                                                                                                                                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test_periodic`                   | The periodic test, with its specimen                                                                                                                                                                                                                                                                                                                                                                                                                                               | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `event_registers`                 | The four registers of accidents and dangerous incidents, A4 landscape                                                                                                                                                                                                                                                                                                                                                                                                              | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `control_report`                  | The report form filled in by hand at each control visit                                                                                                                                                                                                                                                                                                                                                                                                                            | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `employer_briefing`               | What the law asks of the employer, chapter by chapter, about 30 pages                                                                                                                                                                                                                                                                                                                                                                                                              | `training.periodicDuration`, as decision 1.1 prints it, for the periodic training's duration in Art. 73; `workersRepresentativeDecision`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `general_training_material`       | The material for the general introductory training, about 85 pages                                                                                                                                                                                                                                                                                                                                                                                                                 | `unitRisks[]` (`risk`, `measure`), `hasUnitRisks` and `noUnitRisks` for the closing chapter on the unit's own risks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `own_instructions`                | The common part of the own instructions (ADR 012): chapters I–XII, a table of contents without pages, the positions table, and the list of annexed modules                                                                                                                                                                                                                                                                                                                         | `positions` (`workZoneOrDash`, `intervalLabel`, `trainingDuration`), `annexes` (`number`, `title`, `versionId`, `versionDate`), `noAnnexes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `training_themes`                 | Themes and schedule of the three kinds of training (ADR 014), a block per position in chapters II and III                                                                                                                                                                                                                                                                                                                                                                          | `specialist`, `themes` (`annexTitles`, `positions`: `name`, `trainer`, `intervalLabel`, `modules[]`, `sessions[]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `protective_equipment_list`       | Protective equipment per job, A4 portrait (ADR 011)                                                                                                                                                                                                                                                                                                                                                                                                                                | `positions` (`activities`, `staffCategory`), `equippedPositions`: the positions with entries, with `equipment[]`, which `positions` does not carry; `unequippedPositionsText` beside them, every position when none is equipped: `postul de lucru Contabil`, `posturile de lucru Contabil și Șofer`, null when all are equipped; `hasEquippedPositions` for the closing note on handing equipment over                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `risk_assessment`                 | The risk assessment (ADR 015): the method's chapters and annexes, then the unit, the team, a subchapter per evaluation, and the conclusions                                                                                                                                                                                                                                                                                                                                        | `specialist`, `workplaceManagersList`, `evaluationTeam`, `workersRepresentatives`, `positions`, `riskAssessment`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `prevention_plan`                 | The prevention and protection plan (ADR 015), A4 landscape: a table per evaluation with the columns of annex 7 to H.G. 1425/2006                                                                                                                                                                                                                                                                                                                                                   | `riskAssessment.evaluations[]` (`heading`, `plan[]`, `hasPlan`, `noPlan`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `decision_imminent_danger`        | Decision no. 4: who acts in serious and imminent danger                                                                                                                                                                                                                                                                                                                                                                                                                            | `workplaceManagersText`, `imminentDanger[]`, `imminentDangerText`; exactly one of five, so that no manager designates himself: `workplaceManagersAssumeImminentDanger` when the people designated are exactly the workplace managers, who then "își asumă" the duties; `workplaceManagersAssumeAndDesignateImminentDanger` when every manager is designated beside others, `imminentDangerOthersText`, whom they designate while taking the role on; `workplaceManagersDesignateAlongsideImminentDanger` when only some managers are designated, `imminentDangerManagerNames` (names only), beside others, whom they designate "alături de" those managers; `workplaceManagersAssignImminentDanger` when only some managers are designated and nobody else ("stabilește ca … să își asume"); `workplaceManagersDesignateImminentDanger` when no manager is, designating everyone in `imminentDangerText` |
| `decision_workers_representative` | Decision no. 5: the workers' representatives, from 10 employees                                                                                                                                                                                                                                                                                                                                                                                                                    | `workersRepresentatives[]`, `workersRepresentativesLead`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_cover_decisions`            | The decisions cover, listing the nine decisions of the binder by what they settle, signed for the provider by the technician                                                                                                                                                                                                                                                                                                                                                       | `fireSafetyTechnician.name`, signing for the provider; no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fire_decision_organization`      | Decision 1 PSI: how fire defence is organized, the coordinator in every designation with the technician "după caz", the heads of the workplaces, the first-intervention team                                                                                                                                                                                                                                                                                                       | `fire.decisionNumbers.organization`, `fire.coordinator`, `fire.interventionLeader`, `fire.workplaceManagers[]`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fire_decision_training`          | Decision 2 PSI: who trains whom, and the periodic training by staff category with the posts, the interval, the months and the days                                                                                                                                                                                                                                                                                                                                                 | `fire.decisionNumbers.training`, `fire.schedule`, `fire.staff`, `fire.coordinator`, `fire.workplaceManagers[]`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fire_decision_open_fire`         | Decision 3 PSI: work with open fire, the coordinator answering for it                                                                                                                                                                                                                                                                                                                                                                                                              | `fire.decisionNumbers.openFire`, `fire.coordinator`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_decision_smoking`           | Decision 4 PSI: the smoking rule, forbidden everywhere or allowed only in the places outside the buildings (with the client's place when named), the coordinator and the workplace managers supervising it                                                                                                                                                                                                                                                                         | `fire.decisionNumbers.smoking`, `fire.decisionNumbers.organization`, `fire.smoking`, `fire.coordinator`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `fire_decision_seasons`           | Decision 5 PSI: hot and dry periods and the cold season, a sector per workplace                                                                                                                                                                                                                                                                                                                                                                                                    | `fire.decisionNumbers.seasons`, `fire.workplaces[]` (`name`, `activity`), `fire.coordinator`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `fire_decision_technician`        | Decision 6 PSI: the provider contracted for the technician's duties, its technician with the certificate, the authorization only when set, the coordinator answering for the contract; an annex quoting Legea 307/2006 art. 27 (1) a) to m)                                                                                                                                                                                                                                        | `fire.decisionNumbers.technician`, `fireSafetyTechnician` (`name`, `certificate`, `authorization`), `fire.coordinator`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `fire_decision_instructions`      | Decision 7 PSI: the workplaces, who drafts, checks and approves their instructions, the employees' duties of Legea 307/2006 art. 22; then the posted instructions of each workplace on pages of their own: the duties of art. 19 (1), 21 and 22 quoted, the heads of the workplaces training at the schedule, the means in a sentence and a table, the elements of fire risk, the smoking rule, first aid copied from 3.2, the assembly point, and who drafts, checks and approves | `fire.workplaces[]`, `fire.workplaceManagers[]`, `fire.schedule`, `fire.staff`, `fire.smoking`, `fire.decisionNumbers`, `fireSafetyTechnician.name`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_decision_waste`             | Decision 8 PSI: the waste collected and who collects it                                                                                                                                                                                                                                                                                                                                                                                                                            | `fire.decisionNumbers.waste`, `fire.waste`, `fire.coordinator`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fire_decision_control`           | Decision 9 PSI: who controls what and how often, the written records, the analysis and its report, and the grid of the twelve months with the weighing row only for a client with a CO₂ or clean-agent extinguisher                                                                                                                                                                                                                                                                | `fire.decisionNumbers.control`, `fire.hasGasExtinguishers`, `fire.coordinator`, `fireSafetyTechnician.name`, `fire.designated[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `fire_cover_own_instructions`     | The own instructions cover, under the set's motto, signed for the provider by the technician                                                                                                                                                                                                                                                                                                                                                                                       | `fireSafetyTechnician.name`, signing for the provider; no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fire_own_instructions`           | The fire-safety own instructions (IPSU), drawn from the spec: twenty-three general chapters, every quoted article as the act read on 10.10.2026 says it, a contents list without page numbers, OMAI 135/2023 on extinguishers with its annex 1, and the lay first aid of 3.2 chapter VII copied whole                                                                                                                                                                              | `client.legalName` and the header's `issueDate`, `provider`, `fireSafetyTechnician.name`; the same for every client but its name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `fire_cover_training_themes`      | The training themes cover, with the sample's paragraph on how themes are structured, signed for the provider by the technician                                                                                                                                                                                                                                                                                                                                                     | `fireSafetyTechnician.name`, signing for the provider; no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fire_training_themes`            | The fire-safety training themes, drawn: the introductory general training for the whole staff and the workplace training, each an eight-hour plan of 480 minutes of training with its breaks unnumbered, every IPSU chapter cited once across the two plans; a block per staff category with posts in chapters II and III, its trainers, and in chapter III a row per session                                                                                                      | `fire.themes[]` (`label`, `postsText`, `workplaceTrainers`, `periodicTrainers`, `intervalLabel`, `sessions[]`), `fire.decisionNumbers.instructions`, `fireSafetyTechnician.name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `fire_cover_tests`                | The tests cover, listing the two tests, signed for the provider by the technician                                                                                                                                                                                                                                                                                                                                                                                                  | `fireSafetyTechnician.name`, signing for the provider; no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fire_test_hiring`                | The test at hiring, after the introductory general and the workplace training: the sample's fifteen questions without its 6, 8 and 12, so twelve, an answer sheet of one row per question, and the specimen with the key as a table                                                                                                                                                                                                                                                | The header's names only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `fire_test_annual`                | The annual test: the sample's fourteen questions without its 4, 5, 6 and 14, so ten, the same sheet and key                                                                                                                                                                                                                                                                                                                                                                        |
| `fire_means_list`                 | The list of fire-fighting means, A4 landscape: a table per workplace with its area, its norm and its means counted by kind, annex 6 of OMAI 163/2007, and the exterior-hydrant accessories only where there are exterior hydrants                                                                                                                                                                                                                                                  | `fire.workplaces[]`, `fire.hasExteriorHydrants`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `fire_workplace_organization`     | The posted sheet of annex 1 of OMAI 163/2007, a page per workplace: prevention (section I) and first intervention (section II), drawn up by the head of the workplace and approved by the technician; point I.4 prints the smoking rule and names decision 4                                                                                                                                                                                                                       | `fire.workplaces[]`, `fire.smoking`, `fire.decisionNumbers.smoking`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fire_cover_registers`            | The registers cover, listing the six registers and forms by title, signed for the provider by the technician                                                                                                                                                                                                                                                                                                                                                                       | `fireSafetyTechnician.name`, signing for the provider; no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fire_registers`                  | Three registers, A4 landscape, each on its own page: the exercises (annex 8 of OMAI 163/2007), the own and authority controls (the provider's layout), the fire-work permits by number and date, work, place, issuer and those who did the work                                                                                                                                                                                                                                    | None, and no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_work_permit`                | The fire-work permit, annex 4 of OMAI 163/2007, two pages: its blanks as cells, the norm's count of lines under each measure, the issuing unit printed                                                                                                                                                                                                                                                                                                                             | None, and no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_installation_register`      | The register of one installation, annex 7 of OMAI 163/2007: its sheet on the first page, the table of events and the norm's notes on the second                                                                                                                                                                                                                                                                                                                                    | None, and no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fire_extinguisher_register`      | The monthly extinguisher control, annex 2 of OMAI 135/2023, A4 landscape, one page per control: the day, month and year, a row per extinguisher with checks a) to h) answered yes or no and the date of the remedy, the checks spelt out below; the provider has no model of it to hand over                                                                                                                                                                                       | None, and no `issueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

`templates/fire/manifest.json` lists the fire-safety set
([ADR 016](architecture/adr-016-fire-safety-documents.md)) in the same shape, with the
provider's originals each was made from (`originals`, a list: the registers join three, the
extinguisher register and the posted sheet have none) and the `stage` each belongs to. Its
contracts' list follows the binder: the decisions of section 1, the means and the posted sheet
of section 5, the registers of section 6. The registers of stage 1 are blank pages for the
binder and print no date: no header box, no `issueDate`. They ask for `client` (`legalName`,
and on the cover `representativeName` and `representativeRole`), `provider.legalName`,
`fireSafetyTechnician.name` and `branding`, and nothing else; a test holds them to that list.
The templates of stage 2 ([ADR 018](architecture/adr-018-fire-safety-means.md)) add
`issueDate` and `fire`, and a test merges each with every fact and with the fewest. Decisions
1, 2, 3, 5 and 8 were imported from the sample with their typed articles made a list; the
list of means and the posted sheet are drawn, the posted sheet from annex 1, which the sample
did not have. The templates of stage 3 ([ADR 019](architecture/adr-019-fire-safety-stage-three.md))
merge the same names, with the technician's `certificate` and `authorization`. Decisions 4, 6
and 9 keep the sample's title, legal-basis paragraph, signature and acknowledgement table, and
`sections` rewrite what lies between: their articles, decision 6's annex quoting Legea 307/2006
art. 27 (1) as consolidated on 08.05.2026, and decision 9's grid, drawn without the sample's
row numbers and years, its twelve month columns fixed, the weighing row inside a row loop on
`fire.hasGasExtinguishers`. The posted sheet's point I.4 prints the smoking rule and names
decision 4 since stage 3. Decision 7 is rewritten the same way, its posted instructions a loop on
`fire.workplaces` that opens a page per workplace and labels its own items by hand, with
letters and dashes, and copies four passages of 3.2's chapter VII with their lists made dashes:
the rescuer's conduct to the defibrillator, burns, gases and smoke, and electrocution.
The own instructions (2.1) are a drawn document, `"source": null`, whose spec writes the sample's kept chapters with each quoted
article taken again from the act in force, the left-out chapters and sentences gone, and a
chapter on extinguishers quoting OMAI 135/2023 art. 6 to 9, 12 and 19 and annex 1 in place of
the sample's two tables; it copies 3.2's lay first aid whole, from "Primul ajutor este ajutorul
imediat" to the last thing a rescuer does not do, whose articles join the IPSU's own list. Its
cover (2.0) prints the set's motto, as the occupational safety covers of the instructions do.
The training themes (3.1) and the two tests (4.1, 4.2) are drawn the same way. The themes cite
the IPSU by article ranges written into the template, each chapter once across the two
eight-hour plans, which `apps/api/scripts/lib/theme-chapters.test.ts` holds to the IPSU's
chapters; their blocks of chapters II and III loop on `fire.themes`, the trainers inside nested
sections, `{{#workplaceTrainers}}{{#workplaceManagers}}…`, since a loop's own names stay
undotted. The tests keep the sample's questions as they were asked, their wording corrected,
renumbered after the ones ADR 019 leaves out.

For `decision_training`, `training` has `periodicDuration`, `intervalPhrase`, `dayFrom`, and
`dayTo`. The booleans `administrative` and `worker` say which interval paragraphs print.
Their matching frequency and months values exist only for applicable categories; the months
carry their noun, "luna martie" or "lunile februarie și august", so one month reads right.
They run from the first training month around the year, in calendar order: November every
six months is "lunile mai și noiembrie".

`client` is `legalName`, `representativeName`, `representativeRole`; `provider` is `legalName`
and `representativeName`. A person in a list is `name` and `jobTitle`. Every decision ends with
an acknowledgement table that repeats a row per designated person.
