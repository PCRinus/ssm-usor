# ADR 015: The risk assessment and the prevention plan

- Status: accepted
- Date: 2026-10-01

## Context

[ADR 005](adr-005-document-generation.md) left two documents to a third stage: the risk assessment (9, _evaluarea riscurilor de accidentare și îmbolnăvire profesională_) and the prevention and protection plan (10, _planul de prevenire și protecție_). They are the last two the app cannot write; a provider uploads them. Their templates are imported and carry the first client's content: its posts, its risk factors, its measures.

The provider's assessment is about 75 pages. Chapters I and II and the annexes present the method of I.N.C.D.P.M. București and are the same for every client. Chapter III presents the unit, chapter IV the evaluation team of decision 1.2. Chapter V has one subchapter per post: the work system (executant, work task, means of production, work environment), the risk factors found under each of the four, the evaluation sheet that gives each factor a gravity class, a probability class and a risk level, the measures proposed for the factors above the acceptable level, and an interpretation with the post's global risk level. Two more subchapters evaluate "sensitive groups" and "visitors" as if they were posts. The plan is one table per group of posts: the risk, its technical, organizational, hygienic-sanitary and other measures, the actions, the deadline, the person responsible, and observations.

The law is uneven about the two. The employer must hold a risk assessment, "inclusiv pentru acele grupuri sensibile la riscuri specifice" (Legea 319/2006, art. 12 (1) a), done for each component of the work system, per workplace or post (H.G. 1425/2006, art. 15 (1) pt. 1). No act prescribes a method or a form. The Labour Inspectorate's brochure for small enterprises (2015) says there is no single right method and asks for a short document with at least: who evaluated, how the workers were involved, the hazards and risks found, the groups of workers with specific risks, the measures, and how the assessment is monitored and reviewed. The plan is prescribed: it follows from the assessment per workplace or post, holds at least the columns of annex 7 to H.G. 1425/2006, which are the provider's columns exactly, is reviewed when conditions change, a new risk appears or an event happens, is put to the workers or their representatives, and is signed by the employer (art. 46).

Other providers' files were read. A published assessment for a programmer's post runs to 84 pages with the same skeleton and many of the same sentences, so the method chapters are common stock. Its measures sheet already splits each factor's measures into the four kinds of annex 7. The I.N.C.D.P.M. method is what the trade uses and inspectors expect; others exist and none is required.

Tools were read too. ssm.ro's documentation says posts group the functions with the same risks and that risk evaluations are associated with a post, and nothing about how an evaluation is produced. EU-OSHA's OiRA tools are a library of risks and measures per sector that the user works through; none exists for Romania. One Romanian desktop product lets the user enter risks and measures per post and prints both documents. In the files read, what a provider reuses between clients is a whole evaluated post, the office worker or the shop assistant, not a single factor.

## Decision

### One evaluation feeds both documents

A **risk evaluation** is recorded once and both documents are generated from it. The method is the I.N.C.D.P.M. one and is not a choice: the template's static chapters describe it, and its grid and formula are code. A provider who works by another method keeps uploading.

An evaluation belongs to a **job position**, one per position. A client can also hold evaluations that are not posts, each with a name: one for the **sensitive groups**, which the law asks for and readiness requires, and any others the provider wants, such as visitors. Modelling these as job positions was rejected, since they would appear in the positions table, the training themes and the equipment list; a fixed chapter of text on sensitive groups was rejected as weaker than the evaluation art. 12 names.

### What an evaluation records

About the work system, beside what the position already says (its name, its activities, its work zone, its equipment, the number of current employees in it):

- the **means of production**, free text;
- the **work environment**, free text;
- the **exposure**, free text, "8 h / schimb" unless said otherwise.

A client-level evaluation also records its **work task** and the **persons exposed**, as texts, since it has no position to read them from.

And its **risk factors**. Each records:

- the **component** of the work system it belongs to: executant, work task, means of production, or work environment;
- a **group** under the component, free text with suggestions: "Factori de risc mecanic", "Acțiuni greșite";
- its **description**, the concrete form it takes: "Electrocutare prin atingere indirectă – deteriorarea sau inexistența instalațiilor de împământare";
- a **gravity class**, 1 to 7, and a **probability class**, 1 to 6, chosen by the evaluator;
- its **prevention measures**, each a text of one of four kinds: technical, organizational, hygienic-sanitary, other;
- for the plan: the **actions**, the **deadline**, the **person responsible**, and **observations**, all free text with suggestions from what the organization typed before.

The maximum foreseeable consequence is not a field: the sheet prints the wording of the gravity class, from "Minore reversibile" to "Deces". The risk level is not stored: it is read from the method's grid of gravity against probability. The global risk level of an evaluation is the method's weighted mean, each factor's level weighted by itself, Σ R² / Σ R, to two decimals; the published sample's 2.79 was recomputed this way. A factor above level 3 is unacceptable, and an evaluation above 3.5 is over the acceptable limit. The grid, the mean, the shares per component and the list of unacceptable factors live in one pure module with the method's own figures as its tests.

### The library holds evaluated posts

The organization keeps **evaluation profiles**: a name and a set of risk factors with their classes, measures and plan fields. The library starts empty, as the instruction library does ([ADR 012](adr-012-own-instructions.md)); the app ships no risk text, and the two sample packs are not imported as a seed, which would put one provider's judgement into every tenant. Any evaluation can be saved as a profile. Applying a profile to an evaluation copies its factors in beside those already there, so an office profile and a driving profile can be combined; an evaluation can also copy another evaluation of the same client. Nothing flows back: a copy is the client's, and the evaluator adjusts its classes to the client. A library of single factors was rejected as the wrong unit, since picking forty factors one by one is the work the profile exists to save; copying without a library was rejected because reuse across clients would mean finding the right client first.

### Readiness

Generation requires: every current position evaluated, with at least one factor; the sensitive groups evaluated; every unacceptable factor with at least one measure; every factor that has measures with a deadline and a person responsible. The generation form names what is missing with a link, as it does for equipment and instructions. A position cannot declare that it needs no evaluation.

### What the assessment prints

The template is the provider's, with these departures:

- Chapter III prints what the app knows: the client's identity, its CAEN class by name, its workplaces, its employee count, and the table of positions with their activities. The questionnaire about the premises (changing rooms, heating, water, surface area, smoking area) and the accident counts are dropped; no act asks for them in this document, and the provider can write them in the editor.
- Chapter V loops over the positions in the order of the positions table, then the sensitive groups, then the other client-level evaluations. The description of the post is built from the position and the evaluation's three texts; the long lists of aptitudes, attitudes and responsibilities copied from job descriptions are not reproduced.
- The interpretation prints the global level, the unacceptable factors, and the share of factors per component as sentences and a table. The charts are dropped: the engine does not draw, and they restate the sheet.
- A short section is added with the two items of the Inspectorate's minimum content the original lacks: how the workers were involved, naming the workers' representatives where the client has them ([ADR 010](adr-010-conditional-documents.md)), and when the assessment is reviewed, in the words of art. 46 (1).
- The contents table loses its typed page numbers, as in the own instructions.

### What the plan prints

One table per evaluation, in the same order, with the columns of annex 7. A row is a risk factor that has at least one measure, the unacceptable ones first, then by level. Every such factor enters, not only the unacceptable ones, as the provider's plan does. Merging posts with identical risks into one table, as the original does, was rejected: one differing word would split them again, and each row should trace to one evaluation.

### The general training material

The closing chapter of the general training material (2.2) on the unit's own risks, one "DE COMPLETAT" row today, prints the unacceptable factors of all the client's evaluations, each once, with their measures.

### In the app

The position page gains a card "Evaluare de risc" with the post's state, its global level and the count of factors, opening a page of its own for the evaluation: a list this long does not fit a card. The positions table gains a column for the state. The client-level evaluations sit on the client's document data. The library is a sidebar entry of the organization, "Riscuri", beside "Instrucțiuni". Owners and specialists both edit.

### One assessment per client

A document belongs to the client, not to a workplace, and that stays. The Inspectorate's guidance asks for an assessment per point of work; positions are not tied to a workplace, so this is a known gap, tracked as issue #257.

## Consequences

- No document of the provider's pack is left that the app cannot write; the two leave the uploaded document types, and a file uploaded before this stays as it is until regenerated.
- A client's first generation now needs every post evaluated, which is the largest amount of data entry in the product. Profiles make the second client of a kind cheap; the first is typed.
- The evaluation is the evaluator's professional judgement. The app computes levels and copies profiles; it never proposes a class on its own.
- The snapshot grows by the evaluations, so a changed factor marks the assessment, the plan and the general training material as changed.
- An equipment entry's risk and a risk factor are separate texts. Linking them was left out; the equipment list is not derived from the assessment.
- A provider who evaluates by another method, or per point of work, uploads or edits the generated file.

## Order of work

1. This ADR, the glossary in `CONTEXT.md`, and the amendment to ADR 005.
2. The evaluations, factors and measures tables, the contracts, the computation module with its tests, and the API for evaluations of positions and of the client.
3. In parallel, both on step 2:
   - the evaluation page, the card and column on positions, and the client-level evaluations in the app;
   - the merge context, the readiness codes and the snapshot.
4. In parallel, on step 3:
   - the assessment template reauthored around loops, and its move from uploaded to generated;
   - the plan template, its move, and the unit risks of the general training material;
   - the profiles: table, API, library page, save-as and apply.
5. Registration of the templates on hosted after the merge.
