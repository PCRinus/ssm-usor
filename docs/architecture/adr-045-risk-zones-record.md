# ADR 045: The record of high and specific risk zones, document 9.2

- Status: accepted
- Date: 2026-11-22
- Amends [ADR 015](adr-015-risk-assessment.md) (the risk assessment becomes 9.1 and its folder holds a second document) and the numbering of the occupational safety set.

## Context

The legal review of 2026-11-22 (issue #278) checked the pack against the current texts of Legea 319/2006 (form of 25.07.2021) and H.G. 1425/2006 (form of 07.03.2022). Every document the app generates matches its legal model, but the law asks every employer, whatever its headcount, for three records the pack does not hold. The first is the record of the zones with high and specific risk:

- Legea 319/2006 art. 13 lit. k): the employer must "să țină evidența zonelor cu risc ridicat și specific".
- H.G. 1425/2006 art. 15 (1) pt. 10 lists that record among the prevention activities the employer, the designated worker or the external service carries out.
- Art. 105 sets its content: "nominalizarea și localizarea acestor zone în cadrul întreprinderii și/sau unității și măsurile stabilite în urma evaluării riscurilor pentru aceste zone".
- Art. 106 asks the employer to make the zones known to all workers, and the measures to the heads of the workplaces and the workers who work in them.
- Art. 107 makes the actions for these zones a priority of the prevention plan.

The employer briefing (11.1) quotes art. 13 lit. k) and art. 15 (1) pt. 10, so the client is told the record is due, but nothing produces it. Issue #278 had listed it among the documents other providers hold.

The app has no zone. It knows each position's work zone as free text, the client's places of work, and each risk factor's level and measures. A high level on a factor does not make a zone: an electrical panel room or a chemicals store is a specific-risk zone whatever the scores of the posts that pass through it. The law also gives no threshold.

## Decision

### Document 9.2 in the risk assessment's folder

The record is document 9.2, "Evidența zonelor cu risc ridicat și specific", in section 9 beside the assessment, which becomes 9.1. A section without a cover numbers its documents X.1, X.2, as the fire-safety set's sections 5 and 7 do. The number of the assessment changes wherever it shows: list rows, editor titles, file names and zip entries, the Legislație lists, and the help articles that quote document 9. Template versions are keyed by type and content, so renaming the file makes no new version.

Every client gets it; it depends on no headcount.

### A risk zone is the specialist's call

A **risk zone** belongs to the client and records:

- its **name**, required: "Tabloul electric general", "Depozitul de substanțe de curățenie";
- its **place of work**, optional, one of the client's places of work;
- its **location** in it, optional text: "parter, camera tehnică de lângă intrare";
- the **risk factors** it is linked to, any number, from any of the client's risk evaluations;
- **measures** of its own, optional text.

A zone needs at least one linked factor or its own measures, since art. 105 asks for the measures. The record prints each zone's measures from its linked factors, each measure once and by kind, followed by its own text. Linking rather than copying keeps a measure changed on the evaluation and the record in step. Copying the measures into the zone was rejected because the two would drift. A zone that only links factors and is never edited shows the evaluation's current measures.

The app suggests and never decides, as with the risk classes. The suggestions are the client's unacceptable factors (level above 3) that no zone links yet, grouped by the position's work zone, or by the evaluation's name for an evaluation outside the posts. Each group is offered as a zone named after that work zone with those factors linked; the specialist adds it as it is, edits it first, or ignores it. Zones the scores cannot show are added by hand. Deriving the zones with no input was rejected: a score is not a zone, and the specialist could not add the panel room.

### Declared, never left open

The client's **risk zones state** follows the sensitive groups' pattern of ADR 015 (amendment of 2026-10-19): `undecided` by default, `none` when the client declares it has no such zones, `listed` while it has at least one, kept by the database. Adding a zone replaces the declaration; deleting the last zone returns the state to `undecided`. The gap `risk_zones.decided` stands while the state is `undecided` and blocks only document 9.2: the rest of the set generates without it.

### What the record prints

The house style of document 10: the record's title with the client's name, the handover table (prepared by the provider, approved by the client's representative), then the basis, Legea 319/2006 art. 13 lit. k) and H.G. 1425/2006 art. 105–107. For `listed`, a table with the columns Nr. crt., Zona, Localizare (place of work and location), Riscuri (each linked factor's description and level) and Măsuri. After the table, art. 106 in two sentences: the zones are made known to all workers at training, and the measures to the heads of the workplaces and the workers who work in them. For `none`, one sentence: "În urma evaluării riscurilor nu au fost identificate zone cu risc ridicat și specific."

The snapshot carries the zones with their linked factors, so changing a zone or a linked factor marks 9.2 as changed.

### In the app

A card "Zone cu risc ridicat și specific" on the client's Posturi tab, beside "Fișe de evaluare a riscurilor în afara posturilor": the zones, the suggestions, the button that adds a zone, and the declaration that there are none. Its look is drawn on the design canvas before it is built. Owners and specialists both edit. The question mark beside the card opens a help section that explains what counts as such a zone, with examples.

### Left out

- The prevention plan does not yet mark the zones' factors as priorities (art. 107); its rows stay as ADR 015 orders them.
- The general training material does not yet list the zones; art. 106 is stated in the record. Listing them in 2.1's chapter on the unit's own risks is a small follow-up.
- The client import (ADR 030) does not read zones from an uploaded pack.

## Consequences

- A client's 9.2 waits for one decision: zones listed, or none declared. Most small clients declare none in one click.
- The assessment's number changes from 9 to 9.1 in every place that shows it.
- The record never names a zone the specialist did not confirm.

## Order of work

1. This ADR and the glossary in `CONTEXT.md`.
2. Renumbering: the assessment to 9.1 in the contracts, the manifest, the template's file name, the help articles and the tests.
3. The zones table, the link to risk factors, the state on the client, the contracts and the API (zones, state, suggestions).
4. In parallel, both on step 3:
   - the card on the Posturi tab, after the canvas verdict;
   - the merge context, the readiness gap, the snapshot, template 9.2 and section 9's second document.
5. The help articles, the update's lines, and registering the template on hosted after the merge.
