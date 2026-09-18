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

## Making a template

What is committed under `packages/document-engine/templates` is the template alone. The
provider's original files, and the specs that say how each template is made from its
original, live in `packages/document-engine/originals/`, which git ignores: both quote real
people by name. Whoever makes templates keeps that folder; losing it loses no template, only
the shortcut for remaking one when the provider changes the wording. A spec:

```json
{
  "source": "1.3._Decizie_privind_responsabili_primul_ajutor.doc",
  "replacements": [
    { "find": "Nr. : 3 SSM", "replace": "Nr. : {{decisionNumber}} SSM" },
    {
      "find": "Paolo - Antonio LUCA",
      "replace": "{{#firstAiders}}{{name}}",
      "whole": true,
      "min": 2
    }
  ]
}
```

```bash
# The text of a file, to write the spec from
pnpm --filter @ssm-usor/document-engine author -- --text originals/x.docx
# Apply a spec
pnpm --filter @ssm-usor/document-engine author -- originals/x.docx originals/x.spec.json templates/x.docx
```

Why a tool and not find-and-replace in Word: Word stores what reads as one phrase in several
runs, one per formatting change or editing session. "S.C. VELOCITA URBANA S.R.L." was three
runs in the sample, so a search over the XML never finds it. `authorTemplate` works on a
paragraph's text as a reader sees it, maps each character back to its run, puts the
placeholder in the run where the match starts, and empties the matched characters from the
runs after it. Formatting is untouched.

- Replacements apply in order, so a longer text goes before a shorter one it contains.
- `whole` matches only a paragraph whose entire text is `find`: a table cell holding a name,
  as opposed to that name inside a sentence.
- `loopParagraph` wraps the matched paragraph in loop tags of their own paragraphs, which is
  what makes the paragraph repeat per item.
- `pattern` is a regular expression instead of `find`, for a phrase the original spells
  several ways: the samples write one company as "S.C. X S.R.L.", "S.C. X SRL", and
  "S.C. X S.R.L,".
- `removeColors`, next to `replacements`, drops font colours. The provider marks in red what
  they replace by hand; a generated document should not carry that.
- `min` is how many times the text must be found, default 1. A text that is not found fails
  the run, so a spec cannot silently stop matching when the original changes.
- Honorifics go: "D-na Adnana – Valentina POPA in calitate de Administrator" becomes
  `{{client.representativeName}} in calitate de {{client.representativeRole}}`.

## Wording

The provider's originals carry years of small defects: most words without diacritics and some
with, the old cedilla letters (ş, ţ) instead of comma-below ones (ș, ț), typos, double
spaces, spaces before punctuation, and sentences that are only right for one person
("Subsemnatul am luat cunoștință… ne obligăm"). Templates fix them instead of reproducing
them. The rule: **reword once in the template rather than add a case at generation time.**
A sentence that must read correctly for one designated person or for five is rewritten so it
does ("fiecare persoană desemnată confirmă că a luat cunoștință…"), not branched on a count.

`packages/document-engine/templates/wording.ro.json` is that editorial pass, shared by every
template and committed, because it quotes no one. A spec opts in with
`"wording": "../templates/wording.ro.json"`, and it runs after the spec's own replacements:

- `words` is a dictionary, `"securitatii": "securității"`, applied as whole words in lower,
  Capitalised, and UPPER case. Whole words only, so placeholder names and longer words are
  safe, and word by word, so a bold or italic phrase keeps its formatting. A word whose
  diacritics depend on its meaning ("munca" or "muncă") goes in only after every occurrence
  in the documents has been read in context; "pe de alta parte" is a phrase for that reason,
  since "la alta" elsewhere is correct as it is.
- `phrases` are replacements like a spec's, none of which has to occur: rewordings, typos
  that span words, the old letters, and spacing. Leading spaces are left alone, because the
  originals align their signature blocks with them.

What the pass does not touch is what the documents say: article references, durations, who
decides what. That is the provider's professional content. Nor does it remove the empty
numbered rows of the acknowledgement tables: the training decision has newly appointed
people sign that same table later.

One thing can only be fixed when values are in: a company name ending in a full stop that
closes a sentence gives "S.R.L..". `renderDocument` drops the second full stop after
merging, across runs, and leaves an ellipsis alone.

After changing the wording file, remake the templates and read the result: render with the
other sample client's data, convert to PDF, and read it through. The tests then pin it: no
old letters, no double spaces, no space before punctuation, none of the known typos.

Legacy `.doc` originals are converted to `.docx` first with LibreOffice, for example inside
the Gotenberg image that will also make the PDFs:

```bash
docker run --rm --entrypoint soffice -v "$PWD:/work" gotenberg/gotenberg:8 \
  --headless --convert-to 'docx:MS Word 2007 XML' --outdir /work/out /work/original.doc
```

The tests render every committed template's text against a list of what the originals printed
(the two sample clients, the provider, their people, any date), so a template that still
carries a real name fails.

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
