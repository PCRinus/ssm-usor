# ADR 041: What the client import adds to the SU record: one count of the means, facts to confirm, the substances, an office with no activity, and suggested values

- Status: accepted
- Date: 2026-11-10
- Amends [ADR 030](adr-030-import-from-documents.md) (what the reading proposes and how the review treats it) and [ADR 018](adr-018-fire-safety-means.md) (the substances list, and which workplaces carry SU data).

## Context

On 2026-11-10 the SU set was compared with the five reference archives of ADR 030 and with what the client import reads from them. The hand-written SU folder is the same 24 or 25 files for every client. Between clients it changes names, dates, one workplace label, the waste kinds, a few extinguisher counts, the training intervals and the activity annex of the own instructions. It holds no site sheet, no annual report, no substances list, no schedule and no filled register, so nothing in a pack fills the gaps those documents print. The import already reads nearly everything the SU folder states.

The same five packs, imported on non-prod on 2026-10-30, left 44 SU rows missing. Five kinds of row stayed open in most packs, and each has a cause this ADR decides on:

- **The means are counted once per file.** A fact with one value becomes a choice when files disagree. A list does not: the entries each file gives are appended. One pack gave its extinguishers in three documents, 4 and 1 in decision 7, 3 in the list of means, 5 in the risk evaluation, and the proposal held all four entries, thirteen units for a client that has three to five.
- **Site facts arrive as copied wording.** All five packs, a market stand included, give the assembly point as "parcarea din fața obiectivului" and the smoking place as "de la poarta unității". The import proposed the car park as read, with its quote, and the posted instructions would have printed it. One pack cannot show that a sentence is copied; five packs of two providers did.
- **The substances are never asked.** The import writes neither the client's answer nor the list, so the SU set stays blocked on "Nedecis" after every import. Two packs name substances in passing (detergents, cleaning products and used oil in a waste decision; disinfectants).
- **The registered office always carries SU data.** A workplace is an address, the registered office included (ADR 018), and every active workplace needs its SU card and an extinguisher. Two packs put every post and every extinguisher at a point of work, and their registered office, a home address, then blocks the set.
- **The workplace's texts are written nowhere.** Floor area and the extinguisher norm are blank in every list of means. What can burn, what can set it alight and the specific measures are stated in one pack of five, on a posted sheet. The other four name the client's equipment, waste and activity in other documents, and the specialist types the card from them by hand.

### What the law asks of a registered office

Read on 2026-11-10 in the consolidated texts of the legislative portal, and through ONRC's guidance for the trade-register law.

- OMAI 163/2007 art. 131 sets the type and number of extinguishers per construction, by technical regulations or specific norms. Annex 6 gives an orientative number for categories with no such provision, and its note leaves the choice to the designer or, for an existing construction, to the fire scenario or the person with fire-safety duties, by the fire risk and what can burn in the space. Row 3 of the annex, dwellings, is "cu caracter de recomandare".
- Legea 307/2006 art. 19 gives the administrator duties "în unitatea sa", and art. 21 gives a user of a space the duty to follow the measures its owner or administrator set. Art. 9 asks any lease or loan of a building to say who answers for fire defence, and art. 20 asks those who hold parts of one building to cooperate.
- Legea 265/2022 art. 121 and 122 have the operating declaration given for the registered office and for each secondary office, and ONRC's guidance covers a firm that carries on no declared activity at its registered office.

No article ties an extinguisher or a posted sheet to a registered address. A registered office where someone works is a workplace like any other. One where nothing is done, a home address or a hosted one, is not a space the client equips: in a dwelling the count is a recommendation, and in a host's office the host equips it.

How inspectorates apply this was searched the same day. Neither IGSU nor a county inspectorate has published a position on a registered office with no activity. OMAI 89/2013 has inspectorates plan their controls by objective, with priority to operators of high and very high fire risk, and a control ends in a written report. The only practitioner reading found, an occupational safety specialist answering for a firm registered in an apartment, puts the measures on the building's owner or administrator and leaves the firm's people the duties of a user under art. 21. Providers' own pages say "every company" needs the documentation, which is true of the firm and says nothing of the address. So practice gives no rule beyond the text, and the app must make the client's answer visible to an inspector, not only skip the address.

The decisions come from Mircea in conversation on 2026-11-10.

## Decision

### One count of the means per workplace

The entries of a kind of means that several files give for one workplace are one statement per file, not units to add. Per workplace and kind (for an extinguisher, per agent, capacity and wheeled), the reading's entries are totalled by file. An extinguisher a file gives without its agent or capacity is the same means as the workplace's extinguishers when they are all of one type (amended 2026-11-11). Where the files' totals agree, the entries of the file that names the most rooms are kept, the first on a tie (amended 2026-11-11). Where they differ, the proposal holds a choice between the files, each with its total and its source, and the chosen file's entries, rooms included, are what confirm writes. It blocks confirming like any choice.

A row that names a space and a type with no count is proposed as one unit, with a note that the document gives no number.

Adding the entries was the fault. Taking the highest, or the list of means over the others, was rejected: which document is current is the specialist's knowledge, and a pack's documents are often written years apart.

### Site facts are confirmed, never accepted

The assembly point of a workplace and the smoking place are proposed as read, with their source, and are a decision the member takes: keep it, change it, or leave it empty. They are never accepted by default, as other read values are. Both print on what is posted at the workplace, and both are what a provider copies from one client's pack to the next.

Detecting copied wording was rejected. A list of known sentences holds one provider's habits, and a sentence the model flags as generic may be true: some clients do gather in the car park in front.

### The substances join the fire-safety section

The review's section "Apărarea împotriva incendiilor" gains a group "Substanțe periculoase", beside the rules, the means and the installations, as the substances sit beside the means on the client's page.

- The reading returns each substance the documents name, with its file and quote, and any statement that the client uses none.
- Where substances are named, the answer is proposed as "utilizează", with one entry per name, each with the switch that leaves it out. Where a document says none are used, the answer is proposed as "nu utilizează". Where the documents say nothing, no answer is proposed and the client stays "Nedecis". Silence is never read as "none": ADR 018 made "none" a declaration the representative signs.
- A substance is proposed only from a passage that names it. One the activity merely implies is not proposed.
- An entry carries its name only. The classification and the quantity are read off the product and counted on site, and no pack holds them. They become optional on `fire_substances`, and an entry without them is **incomplete**: the client's card says so, and the readiness code `fire.substances` asks for them by the substance's name. The set is still not generated with a classification or a quantity missing, as ADR 018 decided.

Having the model propose a classification for a category of product was rejected. The class is a property of the product bought, the list is sent to the inspectorate (Legea 307/2006 art. 19 lit. f)), and a class guessed from the word "detergent" is a false statement in it.

### A registered office with no activity

The registered-office workplace gains one answer, **activity at the registered office** (_La sediul social se desfășoară activitate_), yes by default, asked in its dialog. With "no":

- the workplace carries no SU card, means, installations, building or checks, and neither readiness nor the Mijloace de apărare tab asks for them;
- the set leaves it out wherever it lists workplaces (the list of means, the posted sheet and the posted instructions, the seasons decision, the schedules, the annual report), and the list of means says in one line that no activity takes place at the registered office, with its address, so the document shows why the address has no extinguisher;
- the address stays the client's identity everywhere it prints as one.

Only the registered office can be answered "no". A point of work with no activity is archived, as today. A client whose only workplace is its registered office cannot answer "no": it would have nowhere to work.

The import proposes "no" as a suggested value (below) where the documents name a separate point of work and place no post, means or room at the registered office.

Dropping the registered office from the workplaces was rejected: most small clients work at it. Exempting it from the extinguisher alone was rejected: a posted sheet for a room nobody works in is the same fiction.

### Suggested values

A proposal gains a third kind of value beside the read and the inferred. A **suggested value** (_sugestie_) is one the model drafts from passages about the client's activity where no document states the value itself.

- **What may be suggested.** A workplace's combustible materials, ignition sources, equipment and means of work, and specific measures; its extinguisher norm; that the registered office has no activity. Nothing else. Never a floor area, a count, a date, a name, an address, a place, or anything about a person.
- **What it is drawn from.** The work equipment and materials of the risk evaluation, the waste kinds, the activity and the posts, the activity annex the training themes cite, the CAEN code. Each suggested value carries the passages it was drawn from, and "Sursa" steps through them as it does for a person's roles.
- **A stated value wins.** Where a document states the value, it is read, and nothing is suggested for it.
- **It is seen before it is confirmed.** A suggested value is marked "Sugestie din activitate" and is a decision: keep it, change it, or leave the field empty. It blocks confirming like a choice, one decision per workplace for the card's suggested values. A value left empty is asked for later by readiness, as today.
- **It rides in the one reading request**, which already holds every passage it needs and gains only output. If the schema no longer compiles at the provider with these fields, the suggestions move to a request of their own after the reading, at the cost of a second read of the text.

Once confirmed the value is the member's, like any other. That it began as a suggestion stays in the import's proposal and its improvement copy (ADR 037), not on the client.

Accepting suggested values by default, as spelling corrections are, was rejected: a corrected spelling changes how a read value is written, while a suggested value is text nobody wrote, printed on a sheet posted at the workplace.

### How it is checked

Before the suggestions are merged, the five reference packs are imported once on non-prod with them, one pack first. A full run costs about $1.20. The measure is the SU rows missing after confirming, 44 on 2026-10-30, and how many suggested values a reader keeps unchanged.

## What is left out

- A second import for the papers a client holds outside the pack: the extinguishers' service report, safety data sheets, the electrical check bulletin, the inspectorate's authorisation, building papers, a floor plan. They are what would fill the substances' texts, the schedules' firms and dates and the building. None is in the reference archives, so nothing can be designed or measured until a provider sends some.
- The records of a year (drills, controls, checks, incidents), which are what the annual report's gaps ask for.
- Fields for the site sheet's rows that are always gaps (ADR 020).
- The control checklist every pack carries (_tematica de control_), which the set has no template for.
- A suggested value for anything but the list above; a suggestion made outside an import, on a client typed in by hand.
- A mark on the client that a value began as a suggestion (#715).
- Extinguisher counts reconciled against what the client already holds, in an import into an existing client. The existing-client rule of ADR 030 stays: what the app holds is kept.

## Consequences

- An import of a pack can end with a client whose SU set generates, where the pack states or implies enough: the means once, the substances answered, the workplace's card drafted, the office that is only an address left out.
- A member confirms more by hand than before: the assembly point, the smoking place, and each workplace's suggested values. That is the price of text on a posted sheet that nobody read.
- `fire_substances` holds entries that are not yet printable, and readiness, the card and document 5.3 must tell them apart.
- A workplace is no longer always a place where the SU set applies. Every loop over active workplaces in the SU merge data, readiness and the Mijloace de apărare tab takes the new answer into account; the SSM documents are checked for the same and change only if they list the registered office as a place of work.
- The reading schema and prompt grow. The provider's limit on a compiled schema was reached once (ADR 030), so the suggestions' fields are added with that in view.
- The glossary gains the suggested value, and the proposal's entry stops listing "suggestion" as a word to avoid.

## Order of work

Each step is a pull request in one stack, on this ADR. A step that changes what members see carries its help article and its `## Actualizări` lines.

1. This ADR; the glossary; the notes in ADR 018 and ADR 030.
2. One count of the means: totals by file, the choice, the unit with no count.
3. The assembly point and the smoking place as decisions.
4. The substances: optional classification and quantity, the incomplete entry on the card and in readiness, the reading, the review's group, confirming.
5. The registered office with no activity: the answer and its dialog, readiness, the Mijloace de apărare tab, the SU merge data and the line in the list of means.
6. Suggested values: the schema and the prompt, the decision in the review, confirming, the office's suggested answer, then the check on the reference packs.

## Defaults taken instead of asking

- **Where the line about the registered office prints.** In the list of means only. The site sheet names the address in its identity rows already.
- **One decision per workplace** for its suggested values, not one per field, so a client with three workplaces confirms three cards.
- **The review's screens** reuse the parts it has: the choice for the means, the decision row for the facts to confirm, the include switch for a substance, the stacked pair of the spelling correction for a suggested value. The suggested card is judged on step 6's screenshots: Mircea asked on 2026-11-10 for the whole stack to be built before he looks at it.
