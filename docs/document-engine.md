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
