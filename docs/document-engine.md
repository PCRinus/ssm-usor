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

`originals/` is git-ignored, specs included, because both quote real people by name.

**2. Wording.** `tools/import/wording.ro.json`, committed because it quotes no one, is an
editorial pass shared by every template. The originals carry years of small defects: most
words without diacritics and some with, the old cedilla letters (ş, ţ), typos, double spaces,
spaces before punctuation, and sentences that are only right for one person ("Subsemnatul am
luat cunoștință… ne obligăm"). The rule is to **reword once in the template rather than add a
case at generation time**: a sentence that must read right for one person or five is rewritten
so it does. `words` is a dictionary applied as whole words in lower, Capitalised, and UPPER
case; a word whose diacritics depend on meaning goes in only after every occurrence has been
read in context. `phrases` are replacements, none of which has to occur. What the documents
_say_ is not touched: article references, durations, who decides what. Nor are the empty
numbered rows of the acknowledgement tables, where newly appointed people sign later.

**3. Typesetting**, to one house style:

|                  |                                                                                                                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text             | Arial 10 pt; the document title bold 12 pt; headings ("DECIDE:", "PROCES VERBAL…") bold 10 pt, centred                                                                                                                                                                                                                      |
| Page             | A4, margins 25 mm left for binding and 20 mm elsewhere; an empty header or footer is switched off                                                                                                                                                                                                                           |
| Alignment        | Running text and list items are left-aligned, never justified: without hyphenation a justified line opens uneven gaps between words. Titles, headings, and the signature block are centred                                                                                                                                  |
| Spacing          | Paragraph margins, 6 pt between paragraphs and 2 pt between list items. Every empty paragraph used as spacing is removed, and so are the spaces paragraphs were aligned with                                                                                                                                                |
| Lists            | Items snapped to three indent tiers, in the list's own definition, whatever list they came from. The originals build one hierarchy from a dozen unrelated lists with paragraph indents on top. A list of one item loses its lone "1.". Article labels ("Art. 1.") stay automatic list numbers                               |
| Signature block  | The client's name, the representative's role and name: centred, so a long name grows both ways instead of drifting off a column of spaces                                                                                                                                                                                   |
| Staying together | From a heading to the table it introduces, everything moves to the next page together; a short table does not split; two lines at least stay together at a page break                                                                                                                                                       |
| Characters       | Romanian as the language, no font colours (the provider marks in red what they replace by hand), no dead internal hyperlinks and the underline they left                                                                                                                                                                    |
| Footer           | Every footer ends with `{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}`, Arial 7.5 pt, grey, centred: alone where the document had no footer, one more paragraph where it had one. `branding: [{}]` in the merge data prints it; empty or missing prints nothing. See [branding](document-branding.md) |
| The end          | A document that closes with a table keeps the one paragraph Word needs after it, at 1 pt, so it cannot spill onto an empty last page                                                                                                                                                                                        |

Then **read the result**. `preview` renders every template twice, with one person and short
names and with three people and names long enough to test the layout, converts to PDF, and
prints the page counts. No check replaces reading the pages.

One thing can only be fixed when values are in: a company name ending in a full stop that
closes a sentence gives "S.R.L..". `renderDocument` drops the second full stop after merging,
across runs, and leaves an ellipsis alone.

`templates/manifest.json` lists all 23 originals of the provider's pack under their own
numbers, ported or not, with the stage each belongs to. A ported template is named
`<number>_<type_key>.docx`, so the folder shows what is still to do.

## Built-in templates

| `type_key`                      | Document                                                                 | Data beyond `decisionNumber`, `issueDate`, `client`, `provider`                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision_training`             | Decision no. 1: who trains whom, and the periodic training schedule      | `workplaceManagers[]`, `training` (`periodicDuration`, `administrativeFrequency`, `administrativeMonths`, `workerFrequency`, `workerMonths`, `dayFrom`, `dayTo`) |
| `decision_risk_evaluation_team` | Decision no. 2: the risk evaluation team                                 | `evaluationTeam[]`, `specialist` (`name`, `professionalTitle`)                                                                                                   |
| `decision_first_aid`            | Decision no. 3: who gives first aid, with its two acknowledgement tables | `firstAiders[]`, `firstAiderNames`                                                                                                                               |
| `decision_imminent_danger`      | Decision no. 4: who acts in serious and imminent danger                  | `workplaceManager`, `imminentDanger[]`, `imminentDangerText`                                                                                                     |

`client` is `legalName`, `representativeName`, `representativeRole`; `provider` is `legalName`
and `representativeName`. A person in a list is `name` and `jobTitle`. Every decision ends with
an acknowledgement table that repeats a row per designated person.
