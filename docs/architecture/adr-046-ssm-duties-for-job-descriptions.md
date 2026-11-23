# ADR 046: The SSM duties for the job descriptions, document 14

- Status: proposed
- Date: 2026-11-24

## Context

The legal review of 2026-11-22 (issue #278) found three records the law asks of every employer, whatever its headcount, that the pack did not hold. The first, the record of high and specific risk zones, shipped as document 9.2 ([ADR 045](adr-045-risk-zones-record.md)). This ADR covers the second:

- Legea 319/2006 art. 13 lit. d): the employer must "să stabilească pentru lucrători, prin fișa postului, atribuțiile și răspunderile ce le revin în domeniul securității și sănătății în muncă, corespunzător funcțiilor exercitate".
- H.G. 1425/2006 art. 15 (1) pt. 4 makes it a prevention activity: "propunerea atribuțiilor și răspunderilor în domeniul securității și sănătății în muncă, ce revin lucrătorilor, corespunzător funcțiilor exercitate, care se consemnează în fișa postului, cu aprobarea angajatorului". Pt. 5 adds the check that every worker knows and applies them.
- Codul muncii art. 17 (3) lit. d) names the job description among what an employee is told before hiring.

The job description is the employer's own human-resources document, and an external service does not write it. What the service proposes, and the employer approves, is the SSM part. Providers hand it over as an annex to the job description, one per post, signed by the employees who hold it.

The pack already points at this missing piece:

- Decision 1.3 says the first-aiders' duties "vor fi prezentate în fișa postului".
- The control regulation (12) asks controllers to check that workers "cunosc și respectă atribuțiile și responsabilitățile ce le revin în domeniul securității și sănătății în muncă stabilite în fișa postului".
- The employer briefing (11.1) quotes both articles.

Everything the annex needs is already in the app:

- **Positions:** each client's job positions, with their staff category, their current employees, the own instructions each applies, and whether they need protective equipment.
- **Responsible persons:** each person's roles (workplace manager, first aid, imminent danger, workers' representative), linked to the employee who holds them.
- **Zones:** the zones of document 9.2 and the factors linked to each.

## Decision

### Document 14: one annex per position

The document is 14, "Atribuții și răspunderi în domeniul securității și sănătății în muncă – anexe la fișele posturilor". It is a section of its own after 13, with no cover, numbered 14 like the other single-document sections. Every client gets it; it depends on no headcount.

It holds one annex per current position, in the order of the positions table, each beginning on a new page. The page heads "Anexă la fișa postului: <position>". It is not one per employee, because a job description belongs to a post and every holder of the post signs the same text. Per employee would repeat the same pages for a shop with six cashiers.

### What an annex prints

Each annex prints the following, in this order.

1. **The basis**: Legea 319/2006 art. 13 lit. d) and H.G. 1425/2006 art. 15 (1) pt. 4.

2. **The duties of every worker**: Legea 319/2006 art. 22 and art. 23 (1) lit. a)–i), in the law's words lightly adapted to the second person of a job description. They are the same for every post and fixed in the template.

3. **The duties of this post**, built from its data:
   - **Own instructions:** to know and apply the own instructions the post applies, named by their number and title as document 3.1 prints them (H.G. 1425/2006 art. 15 (1) pt. 3).
   - **Protective equipment:** for a post that needs it, to use the protective equipment of document 6 and return it after use (Legea 319/2006 art. 23 (1) lit. b)). A post that needs none prints no line.
   - **Risk zones:** for a post whose risk factors a zone of 9.2 links, to know that zone and apply its measures (H.G. 1425/2006 art. 106 (2)). A post linked to no zone prints no line.
   - **Training:** to take part in the trainings at the interval of its staff category, as decision 1.1 sets them.

4. **The duties of a role**, for each current employee of the post who holds one, named:
   - **Workplace manager:** training its workers at the workplace and periodically (H.G. 1425/2006 art. 91 (1) and 96 (1)), and not letting anyone start work untrained (art. 94). Also passing on the zones' measures (art. 106 (2)).
   - **First aid:** decision 1.3 names the first-aiders and says their duties "vor fi prezentate în fișa postului", but lists none. So this block is written for the annex, in our own wording on the basis of Legea 319/2006 art. 10: giving first aid as trained, calling the emergency services, keeping the first-aid kit stocked, and telling the employer what was used.
   - **Imminent danger:** the duties decision 1.4 assigns to its designated personnel.
   - **Workers' representative:** the duties decision 1.5 lists.

   The imminent-danger and representative blocks reuse the texts their decisions already print, so the annex and the decision never disagree, and each cites its decision: "conform deciziei nr. 4 SSM din …". A person with two roles gets both blocks. The wording written for the annex (the common duties adapted from art. 23, the first-aid and workplace-manager blocks) goes to the SSM contact for review, as the other templates' wording did.

5. **A sentence on responsibility**: failing these duties is answered for under the internal regulation and the law, with no list of penalties.

6. **The approval and the signatures**: the employer's approval, as on every document of the set; the provider as the one who proposed it ("Am propus" / "Am aprobat"); and a table of the post's current employees, each with "Am luat cunoștință", the date and the signature, as the decisions' tables are drawn.

### Readiness

The document needs no data the set does not already require: current positions, with the instructions and equipment ADR 012 and ADR 011 already check. A post with no current employee still gets its annex, with an empty signature table to fill in by hand. Since 9.2 may wait for the zones (ADR 045), the zone line reads the zones only when they are decided. While they are not, the annex prints no zone line, and its snapshot marks it as changed once they are.

### Who changes what

The annex is generated and edited like any document of the set. A provider who wants other wording for the common duties edits the generated file, as with every template. A post-specific duty that is neither a module, nor equipment, nor a zone is typed in the editor; there is no field for it. Fields for free post duties were rejected: the four sources above cover what the law ties to a post, and a field would be one more thing to fill for every post of every client.

### In the app

Nothing new to fill in. The document appears in the SSM documentation as section 14 and is generated with the set. The help article on the documentation says what it holds and where its duties come from.

### Left out

- **Fire-safety duties in the job description** belong to the fire-safety set. They are not covered here.
- **The job description itself**, the human-resources document, is the employer's own; the annex is attached to it, not merged into it.
- **Electronic signing** of the annex through the portal can come later, as for the training sheets ([ADR 023](adr-023-advanced-electronic-signature.md)).

## Consequences

- Every client gains document 14, generated from data it already has, with no new screen.
- Decision 1.3's sentence that the first-aiders' duties go in the job description becomes true.
- A change to a post's instructions, equipment, employees or roles, or to a zone linked to it, marks 14 as changed.

## Order of work

1. This ADR.
2. The contracts (the type, its number 14, its section), the merge context for the annexes, the snapshot, and the clients list's applicability row.
3. The template, built like 9.2's from our own wording, with the role blocks taken from the decisions' texts. Then rendered and checked against the law.
4. The help article and the update's lines.
