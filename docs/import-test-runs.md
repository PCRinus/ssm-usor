# Import test runs

The test runner reads the improvement copies of confirmed imports again with today's reading and
compares each new proposal with what the member confirmed ([ADR 037](architecture/adr-037-import-quality-and-alerts.md),
"Test cases"). A copy's files are the question and the member's confirmed result is the answer, so
a change to a prompt, a schema, a model or the code after the model can be measured on real
packs before it ships.

It reads client data from the environment it names, production included, with that project's
secret key, and sends it to the models through the AI Gateway as an import does. **Only Mircea
runs it, from his machine.** It never runs in CI or on a server.

```sh
pnpm --filter @ssm-usor/api import:test-run --env production --kind client --limit 5
pnpm --filter @ssm-usor/api import:test-run --env production --kind client --limit 5 --trial --yes
pnpm --filter @ssm-usor/api import:test-run --env production --kind client --limit 5 --yes
```

The script is `apps/api/scripts/import-test-run.ts`; its parts are in
`apps/api/scripts/lib/import-test-run/`.

## Flags

| Flag                                                         | What it does                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `--env non-prod\|production`                                 | The project read. Required.                                                                                    |
| `--import <id>`                                              | A copy of this import and of its parts. Repeatable.                                                            |
| `--organization <id>`                                        | The copies of one organization.                                                                                |
| `--kind client\|employees`                                   | Imports of this kind. With `--kind` alone no part is read.                                                     |
| `--part instructions_ssm\|instructions_su\|risk_evaluations` | Library parts of this kind. Repeatable. With `--part` alone no import is read; with neither, both are.         |
| `--confirmed-only` (default), `--no-confirmed-only`          | Only a confirmed copy has an answer. A copy that ended otherwise is compared with its proposal as it was left. |
| `--limit <n>`                                                | The newest `n` copies of the selection.                                                                        |
| `--rescan`                                                   | Reads the page images again too (below).                                                                       |
| `--trial`                                                    | Reads the first copy alone and prints its real tokens and cost by model.                                       |
| `--yes`                                                      | Spends. Without it the run stops after the estimate.                                                           |
| `--out <path>`                                               | Where the report goes; by default `import-test-run-<env>-<time>.json` in the system's temporary folder.        |
| `--show-values`                                              | Prints each difference with its two values on the terminal. They are never written to the report.              |

## Environment

Read from the shell or from `apps/api/.env.test-run`, which git ignores:

| Variable                                                                            | For                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `IMPORT_TEST_SUPABASE_URL_NON_PROD`, `IMPORT_TEST_SUPABASE_SECRET_KEY_NON_PROD`     | `--env non-prod`                                                                           |
| `IMPORT_TEST_SUPABASE_URL_PRODUCTION`, `IMPORT_TEST_SUPABASE_SECRET_KEY_PRODUCTION` | `--env production`                                                                         |
| `AI_GATEWAY_URL`, `AI_GATEWAY_TOKEN`                                                | The gateway and token the API uses; needed only to spend.                                  |
| `EXTRACTOR_URL`                                                                     | Optional: a local extractor (`pnpm dev:pdf`), to draw the scanned pages of a client's PDF. |

The project's variables are named apart from `SUPABASE_URL` so that a run reads production only
when it says so, never because the shell kept another script's project.

## The cost guard

Before any model is asked, the run prints the copies selected, the characters of their extracted
text, their scanned pages and the expected cost by model, with the total:

```text
Environment: production.
2 copies, 32,500 characters of extracted text, 2 scanned pages (their kept readings reused).
  gpt-6-luna        $0.0013  (8,000 input, 1,000 output tokens)
  gpt-6.1-terra     $0.2800  (110,000 input, 34,000 output tokens)
  total             $0.2813
Nothing was sent to a model. Run again with --yes to spend about $0.2813, or with --trial --yes to read the first copy alone.
```

The estimate is each step's stored usage (`usage_by_step` of an import, the tokens of a part)
priced at today's rates of the step's current model, a cached token counted as a fresh one.
A step that stored no usage is guessed from the copy's characters at 3.25 a token, its output
left out, and the estimate says so. Nothing is spent without `--yes`; `--trial --yes` reads the
first copy alone. An employee copy without `--rescan` sends nothing to a model and runs without
`--yes`.

## How a copy is read again

The run gives the pipeline's own steps an import held in memory: the import and its files as
rows, the copy's objects read from the bucket as a step asks for them, and a queue drained in
order. A client import runs `sort`, `scan`, `read` and `check`; an employee import `sort`, `scan`,
`read` and `check` on its sheets; a part `read-instructions` or `read-risks`, on its import's files
as that import left them and on the client proposal the import's copy kept. Nothing is written
to the database or to Storage.

- **From the kept text.** Each file starts prepared, from the text extracted at the first
  reading, so nothing is extracted again.
- **No scan again without `--rescan`.** A scanned page's reading is kept in the copy and used
  as it is; a file with no text keeps the kind the first reading gave it from its first page. A
  request that would send a page image to the scan or to the sorting is refused and counted
  ("page images not read again"). With `--rescan` the readings are dropped and the pages are read
  again: a photograph from its upright copy, an employee PDF's page from the image kept beside
  it. A client import keeps no image of a scanned PDF page, so `--rescan` and a risk reading of
  such a page draw it with `EXTRACTOR_URL`, or the file fails.
- **The same models and gateway.** The requests go through the API's model client, tagged with
  the gateway metadata `purpose: test-run` beside the organization and the import.
- **What is left empty.** The organization's library, the client's risk sheets and the client's
  employees, posts and workplaces: after a confirm they hold what this very import wrote. ANAF is
  not asked. The provider's name and people, an existing client's name and CUI and the client's
  training themes are read from the database, as they are today.

## The comparison

Both sides are put through the code that confirming uses, and compared value by value:

| Kind             | The answer                                                                                                                                   | The new reading                                                   | Sections                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client import    | `toClientPayload` of the kept proposal and changes, as for a new client                                                                      | `toClientPayload` of the new proposal, no changes                 | `client`, `fireSafety`, `workplaces`, `jobPositions`, `protectiveEquipment`, `employees`, `responsiblePersons`, `fireEquipment`, `fireInstallations` |
| Employee import  | `toEmployeePayload` of the kept proposal and changes, with no match to the client's employees: the sheets' values as the member settled them | `toEmployeePayload` of the new proposal with every person checked | `people`, `trainings` (one row per person and training), `tests`                                                                                     |
| Own instructions | the instructions the member kept, with their title, category, text and posts (`reviewedInstructions`)                                        | the new proposal's, unchanged                                     | `instructions`                                                                                                                                       |
| Risk evaluations | each sheet that writes factors, with its texts and posts, and its factors as the member left them (`reviewedRiskFactors`)                    | the new proposal's, unchanged                                     | `sheets`, `factors`                                                                                                                                  |

A post, a workplace or a person's employer is named by its name, not by an id. A post, a
workplace, an employee or a sheet is paired with its namesake; a person by name, then CNP; an
instruction by its file and number, then title; a factor by its sheet, component and
description; a training by person, domain, phase and day, and when no day matches, with the
person's next training of that domain and phase. A pair's values are then:

- **found**: both hold it, alike once case and diacritics are folded;
- **missed**: the answer holds it, the reading does not;
- **wrong**: both hold it, and they differ;
- **extra**: the reading holds it, the answer does not (a row the member unticked is extra).

A row of either side with no partner counts each of its values missed or extra. The **score** is
found over everything counted. Each copy prints its line, its sections, and its spending; the run
ends with the summary.

## The reading versions

Each copy's line names its stored reading version and today's, `prompts (step model, …)`, so a
run says what changed between the first reading and this one. The report keeps both.

## The report and the disk

The report is JSON: the run's environment and flags, today's reading versions, and for each copy
its status (`compared`, `failed` with its reason, or `skipped` when it kept no proposal), its
spending by model, the counts by section and field, and the differences by section, row, field
and outcome. It holds **no value read**: no name, CNP or text. It is written to `--out`, owner
read and write only, through a file beside it renamed into place, and the run refuses a path
inside the repository, which is public.

The copies are read from Storage into memory, one copy at a time, and only the objects a step
asks for. Nothing else of a copy reaches the disk.

## Not yet

ADR 037 shuffles a test case kept past its 12 months: names, CNPs, birth dates and places,
addresses, phone numbers and emails replaced consistently, and the case kept under
`import-copies/<organization>/test-cases/`. That is a later step. Until it is built, a copy is a
test case only during its 12 months, and the 12-month clean-up removes it with the rest.
