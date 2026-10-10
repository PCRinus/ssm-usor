# ADR 019: The fire-safety set's third stage: decisions 4, 6, 7 and 9, the own instructions, the training themes and the tests

- Status: proposed
- Date: 2026-10-10

## Context

[ADR 016](adr-016-fire-safety-documents.md) built the fire-safety set in three stages and left the third to the provider's answers: "the smoking decision, the appointment of the technician with its annex, the posted instructions of decision 7, the control decision, the own instructions, the training themes that cite them, and the tests". [ADR 018](adr-018-fire-safety-means.md) built the second stage: the client's fire-safety facts, the fire-safety means per workplace, eight documents, and decision numbers fixed by their place in the binder. The provider has not answered ADR 016's thirteen questions; on 2026-10-10 Mircea approved a provisional default for each of them, every one tracked by an issue (#372, #380 to #388), so that the stage can be built now and the wording changed later.

The stage holds eleven documents, the last ones the _Documente PSI_ tab still lists as "În pregătire":

| Number | Type key                      | Document                                                                             |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| 1.4    | `fire_decision_smoking`       | Decision 4, how smoking is regulated                                                 |
| 1.6    | `fire_decision_technician`    | Decision 6, the appointment of the fire-safety technician                            |
| 1.7    | `fire_decision_instructions`  | Decision 7, the fire-safety instructions and the employees' duties at the workplaces |
| 1.9    | `fire_decision_control`       | Decision 9, the own control of the fire-safety rules                                 |
| 2.0    | `fire_cover_own_instructions` | The own instructions cover                                                           |
| 2.1    | `fire_own_instructions`       | The fire-safety own instructions (IPSU)                                              |
| 3.0    | `fire_cover_training_themes`  | The training themes cover                                                            |
| 3.1    | `fire_training_themes`        | The fire-safety training themes and the training–testing programme                   |
| 4.0    | `fire_cover_tests`            | The tests cover                                                                      |
| 4.1    | `fire_test_hiring`            | The test at hiring                                                                   |
| 4.2    | `fire_test_annual`            | The annual test                                                                      |

The covers take the set's own numbering, a section's cover at `.0` as 1.0 and 6.0 already are; the sample numbers them 2.1, 3.1 and 4.0 and its own documents after them.

The legal texts were read on legislatie.just.ro on 2026-10-10. Legea 307/2006, republished in 2019, in its consolidated form of 08.05.2026: OUG 17/2026 (in force 13.03.2026) rewrote art. 12 (3), so that an operator not bound to employ a technician designates one of its employees or contracts "o persoană fizică sau juridică autorizată, în condițiile prevăzute la art. 12^2"; added art. 12^2, under which the inspectorates authorize persons acting as technicians on a methodology approved by order of the minister; rewrote art. 27 (1), the technician's duties, now letters a) to m), among them the exercises (f), the content of the training documents (h), the training itself (i) and the half-yearly evaluation report (j); and added art. 27^1, which makes an authorized person register every contract on the inspectorate's platform within ten days. Art. VIII of OUG 17/2026 gives the methodology ninety days and the persons already under contract twelve months from its entry into force to be authorized. OUG 38/2026 (08.05.2026) rewrote art. 19 (1) r^16), which bans open flame for ambience in public food service and trade spaces. The authorization methodology could not be found on the portal or the web on 2026-10-10; whether it is in force, and so when the twelve months run out, is not known.

OMAI 163/2007, whose norms the portal shows in their base form: art. 17 lists the acts of authority, among them (b) the instructions and duties at the workplaces, (c) open fire and smoking as one disposition, and (i) the appointment of the technician; art. 33 says what instructions contain, that the head of the sector writes them, the technician checks them and the administrator approves them, and that they are posted whole or in summary; art. 35 (3) asks each to carry its drafting and approval dates; art. 106 (3) asks the smoking disposition to name the forbidden places, the places for smoking and the persons who supervise, (5) to (7) the sign and the equipment of a smoking place and its distances outdoors; art. 149 has the own control done by the structures with fire-safety duties on an annual, quarterly, monthly or daily schedule and by the heads of the workplaces daily or per shift, ending in written records, and a quarterly control of third parties on the premises; art. 151 and 152 the half-yearly or yearly analysis and its report. Legea 349/2002, consolidated 11.11.2024, art. 3 (1): no smoking in enclosed workplaces. OMAI 712/2005 as amended by OMAI 786/2005: eight hours at least for the introductory general training (art. 13) and the workplace training (art. 18), a test after each (art. 14 and art. 20), two hours at least for a periodic training (art. 21), on annual themes and a schedule approved by the employer (art. 22 to 25), art. 26's intervals, a yearly test of the periodic training (art. 30), and art. 65: whoever makes training materials for sale needs the inspectorate's approval. OMAI 135/2023 (Monitorul Oficial 796 of 04.09.2023), base form: art. 8 has the technician or the designated person check every extinguisher at most monthly, weigh CO₂ and clean-agent units at most every six months, and record both in the annex 2 register; art. 9 an attested firm's verification every twelve months after the warranty; art. 12 a recharge at most every three years; art. 19 a service life of twenty years; annex 1 which agent fits which class of fire. OMAI 1184/2006 was searched for a colour code for rooms and has none.

The sample pack shows the documents as follows; the review of 2026-10-03 found the faults.

- **Decision 4** cites Legea 307/2006 art. 19 a) and OMAI 163/2007 art. 5 b), 17 c) and 106, names the shop's manager as responsible for the rules, and then contradicts itself: smoking is allowed "în locurile special amenajate de la poarta unității", "pe toată incinta … fumatul este interzis", and employees leave the premises to smoke. It names a "comisie pentru situații de urgență" the client does not have.
- **Decision 6** contracts the provider, "reprezentată de" its technician, and names the manager as answering for the contract on the client's side. Its legal basis is copied from decision 5 (OMAI 163/2007 art. 17 j), 95, 96, the hot-season articles) and from Legea 307/2006 art. 12 (1) and (2), the paragraphs that oblige employment. Its annex is a job description of a "responsabil p.s.i." from before 2006 ("2/3 din timpul de lucru", "Serviciul Prevenirea Incendiilor").
- **Decision 7** is three short chapters (the workplaces, who writes the instructions, the employees' duties) and then the posted instructions: the duties of the administrator, the heads of the workplaces, the user, the employees and the technician, behaviour in case of fire, the extinguishers in a sentence and a table that disagree (ADR 018), smoking, access routes, waste, transport, extinguishing and rescue, and first aid at 50 to 60 compressions a minute. The heads train "1/3 luni"; the technician's duties are an older text than art. 27.
- **Decision 9** has a text and a twelve-month grid that disagree: the text has the director yearly, the technician quarterly and the execution staff daily; the grid has the execution staff monthly, the heads of the workplaces daily with no marks, the technician quarterly and the director yearly in January.
- **The IPSU** is thirty-two chapters and an annex, almost all quoted norms: Legea 307/2006, Legea 481/2004, OMAI 712/2005 and OMAI 163/2007 chapter by chapter, then reference tables. Chapter III sets the periodic training at sixty minutes and announces three tests; chapter XIV is for households, XVI for boiler rooms, XVII has a sentence on barracks, XIX hypermarket alarm codes and the old first aid, XXII firefighters' tactics, XXV to XXVIII construction effects, stored-material and liquid classes and hydrant kits, XXX halon, XXXI a fire-panel kit of an older norm. Annex 1, food service, is listed and cited for forty-five minutes of training, and missing.
- **The themes** have three chapters: the introductory general training for the whole staff, trained by the technician; the workplace training in one block for every post, trained by the manager, and a second block for the manager, trained by the technician; the periodic training in one block for every post, quarterly, each of four sessions citing an IPSU article range, two IPSU chapters, "Anexa 1" and a topic, 120 minutes each. Both eight-hour plans reach 480 minutes only by counting the breaks.
- **The tests** are fifteen questions at hiring and fourteen yearly, with an answer key typed as a grid. At hiring, question 6 asks the interval "pentru personalul muncitor cu funcţii de execuţie sau operative" and keys one month, which is art. 26's interval only for staff "care sprijină serviciile de urgență" and contradicts decision 2; question 8 asks a P6 extinguisher's "termen de valabilitate" and keys one year, where OMAI 135/2023 has a service life of twenty years, a recharge at most every three and a check every twelve months, so none of ten, one or two years is right; question 12 keys the signs of cardiac arrest from the old first aid, a heartbeat that cannot be heard among them. Yearly, questions 4 to 6 ask what red, yellow and green mean on a room at an evacuation, a code no act read and no chapter of the IPSU teaches. Question 14, foam for liquids and for solids that form embers, was flagged by the review against the IPSU's own table; annex 1 of OMAI 135/2023 says foam fits classes A and B, so the key is right and the table is out of date.

The first set already holds corrected first aid: commit 70b59ab (#280, #312) rewrote 3.2 chapter VII and 2.2 chapter XIV at the ERC 2021/2025 guidance, with Legea 95/2006 art. 92 to 94 quoted and no medication or drinks for a casualty. The engine has no way for one template to include another's text.

## Decision

### Decision 4 prints the client's smoking rule

Decision 4 prints the **smoking rule** (_reglementarea fumatului_) the client's "Instruire PSI" card already stores, `client_fire_safety.smoking_policy`, and nothing the sample contradicts itself with. Both policies forbid smoking in enclosed workplaces (Legea 349/2002 art. 3 (1)) and keep the sample's general rules: ashtrays, butts, closing time, the electrical appliances.

- `forbidden_everywhere`: smoking is forbidden in every space and on the whole premises of the client; the article on the places for smoking and its distances is left out.
- `designated_places`: smoking is allowed only in places set up outside the buildings, marked "LOC PENTRU FUMAT" and equipped as art. 106 (7) says, at the distances of art. 106 (6). One optional text, `client_fire_safety.smoking_place` (up to 240 characters, "în curtea interioară, lângă poarta de acces auto"), says where; without it the decision says the places are those marked so. The text is allowed only with this policy, and saving the card with the other policy, or with none, clears it. A place per workplace was rejected for now: the sample has one place, and the posted instructions of decision 7 can say the client's rule at every workplace.

The **fire-safety coordinator** supervises the rule (art. 106 (3) c)), with the workplace managers at their workplaces; the sample's "comisie pentru situații de urgență" becomes them, as the bodies the client has. The legal basis is Legea 307/2006 art. 19 (1) a), OMAI 163/2007 art. 5 b), 17 c) and 106, and Legea 349/2002 art. 3 (1). The acknowledgement table lists the coordinator and the workplace managers. Provisional, waiting on ADR 016's question 3, issue #380.

Merging decisions 3 and 4 into the one disposition art. 17 c) describes, as the review proposed, was rejected: the binder's ordinals are fixed (ADR 018), the decisions cover lists nine, and decision 3 is already issued at clients.

The smoking policy joins the set's readiness as `fire.smokingPolicy`, since a document now prints it and a data field is never left blank; ADR 018 left it out only because nothing printed it. The place stays optional. The posted workplace sheet (5.2), whose point I.4 says "fumatul este permis numai în condițiile stabilite de conducerea unității", prints the rule instead and names decision 4.

### Decision 6 appoints the provider and quotes art. 27 as it is now

Decision 6 records that the client, not bound to employ a technician, contracts the provider to carry the technician's duties (Legea 307/2006 art. 12 (3)), through the organization's **fire-safety technician**, named with the certificate the organization already keeps. The coordinator answers on the client's side for the contract, where the sample named the manager (ADR 018 makes the coordinator the holder of decision 1's designations, provisional on question 4). The legal basis is Legea 307/2006 art. 12 (3), art. 19 (1) a) and art. 27, and OMAI 163/2007 art. 17 i). The obsolete annex is replaced by the technician's duties quoted from Legea 307/2006 art. 27 (1) a) to m) in the consolidated form of 08.05.2026, marked "(Preluare din Legea 307/2006 – Art. 27 alin. (1))", so the citation index ([ADR 017](adr-017-legislation-monitoring.md)) records it and the Legislație page reports the next change to the article. Provisional on question 9, issue #384.

The technician's certificate becomes required for the set, `provider.fireSafetyTechnicianCertificate`: the decision prints it, and it is what qualifies the person it appoints.

The organization gains one optional text, `organizations.fire_safety_authorization` (up to 200 characters), on the Abilitări tab beside the technician: the inspectorate's authorization of the provider under art. 12^2, as the provider writes it ("nr. 12 din 15.09.2026, ISU Cluj"). When set, decision 6 says the provider is authorized under art. 12^2 and prints it; when not, the decision says nothing about authorization, and readiness does not ask for it. Asking for it was rejected: the methodology could not be found in force on 2026-10-10, providers already under contract have twelve months from it, and a provider who is not yet authorized cannot be one by filling a field. Printing that an authorization is pending was rejected too: it is a statement the app cannot vouch for. Number, date and issuer as three columns, as the occupational safety certificate has, were rejected while the form of the document the methodology will issue is unknown. The registration of each contract on the inspectorate's platform (art. 27^1) is the provider's own act and is not recorded.

The decision does not cite the service contract by number: only owners read contracts (ADR 007), and a specialist must be able to generate the set.

### Decision 7: a short decision and the posted instructions, a page set per workplace

Decision 7 keeps the sample's two parts. The decision lists the active workplaces by name and activity, has the workplace managers write the instructions, the technician check them and the client's representative approve them (OMAI 163/2007 art. 33 (3)), and quotes the employees' duties (Legea 307/2006 art. 22). Its legal basis becomes Legea 307/2006 art. 19 (1) g) and art. 22 and OMAI 163/2007 art. 17 b), 23 c) and 33 to 35, where the sample cited "art. 23 litera c și art. 33" and the wrong article of the law.

The posted instructions repeat per active workplace, each opening a page as the posted sheet does: the workplace, its address and activity; the duties of the administrator (Legea 307/2006 art. 19 (1)), the heads of the workplaces, the user (art. 21) and the employees; behaviour in case of fire; the workplace's extinguishers grouped by agent and capacity and its installations, from the fire-safety means, in the sentence and in the table alike, so the two can no longer disagree; the workplace's combustible materials, ignition sources, and equipment and means of work, and its specific measures when set, as the elements that make up the fire risk (art. 33 (2) d)); the client's smoking rule; access and evacuation routes, waste, transport, extinguishing and rescue as the sample has them; first aid; the assembly point; and a signature block in which the workplace manager drafts, the technician checks and the representative approves, with the issue date (art. 35 (3)). The heads of the workplaces train at the client's fire-safety intervals, from the schedule, where the sample typed "1/3 luni". The technician's duties are not quoted again: the instructions refer to decision 6, which quotes them as in force.

First aid is the corrected text of the first set, issue #382 (question 7): see below.

Making decision 7 the posted workplace sheet as well, as the review proposed, was rejected: ADR 018 built that sheet as 5.2, in the model of OMAI 163/2007 annex 1, and the two say different things, one who acts and the other how to act.

### Decision 9: the norm's interval where a norm sets one, the shorter of the sample's two otherwise

Decision 9 keeps the sample's text on how controls end in written records, the monthly report of the heads to the technician, the half-yearly and yearly analysis and its report (OMAI 163/2007 art. 149, 151 and 152; Legea 307/2006 art. 27 (1) j)), and the list of resulting documents. "Directorul" becomes the client's representative by role, "structura cu atribuții" the coordinator and the technician, as decision 1 designates them for own controls. Its legal basis adds OMAI 135/2023 art. 8. The text and the grid say the same intervals:

| Who controls                                               | Interval                         | Source                                                                | Months marked    |
| ---------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- | ---------------- |
| The coordinator and the technician                         | Quarterly                        | Text and grid agree                                                   | III, VI, IX, XII |
| The coordinator, the technician "după caz"                 | Monthly, every extinguisher      | OMAI 135/2023 art. 8 (1), the register of annex 2                     | Every month      |
| The same                                                   | At most six-monthly, by weighing | OMAI 135/2023 art. 8 (3); printed only with a CO₂ or clean-agent unit | VI, XII          |
| The heads of the workplaces                                | Daily or per shift               | OMAI 163/2007 art. 149 (1) c)                                         | Every month      |
| The execution staff, at the end of their work              | Daily                            | The text's daily, shorter than the grid's monthly                     | Every month      |
| The representative with the coordinator and the technician | Yearly                           | Text and grid agree                                                   | I                |

The grid keeps twelve fixed columns, I to XII, with marks the template holds, and drops the sample's "2024 / 2025": the engine cannot loop table columns, and computing the months from the issue date would print a grid that differs per client for no reason a norm gives. The weighing row is the one condition, `fire.hasGasExtinguishers`, read from the fire-safety means. The coordinator does the monthly check as the designated person of OMAI 135/2023 art. 8 (1), with the technician "după caz", as ADR 018 prints the technician beside the coordinator in decision 1. Provisional on question 10, issue #385.

### The own instructions are one built-in template with its general chapters

The **fire-safety own instructions** (_instrucțiunile proprii în domeniul situațiilor de urgență_, IPSU) are one template the same for every client but its name, generated like any document. They hold the general chapters only and no activity annexes: what is specific to a workplace is what is already stored on it (its activity, combustible materials, ignition sources, equipment and means of work, specific measures, means and assembly point), and decision 7 and the posted sheet print it. Provisional on questions 6 and 8, issues #381 and #383.

The chapters kept are I to XIII, XV, XVII to XXI, XXIII, XXIV and XXXII of the sample, renumbered in that order, plus one chapter in place of XXIX and XXX. Left out: XIV (households), XVI (boiler rooms), XXII (firefighters' tactics), XXV to XXVIII (effects on constructions, stored-material and liquid classes, hydrant kits; the list of means prints the exterior-hydrant table where a workplace has exterior hydrants) and XXXI (a fire-panel kit of a repealed annex), and annex 1, which never existed. Within the kept chapters, the barracks sentence of XVII and the hypermarket alarm codes of XIX go; XIX's first aid is replaced by the first set's corrected text. XVII's passages on chemical-foam extinguishers (type "S") and on extinguishers that work by being turned over go too, since OMAI 135/2023 art. 20 bans both (#391, amended in the review pass). XXIX and XXX, the extinguishing agents and the extinguishers with halon and pre-EN 3 colours, become one chapter that quotes OMAI 135/2023 art. 6 to 9, 12 and 19 and annex 1: the act in force says what the provider's tables said. Every quoted article is checked against the act in force at import, as ADR 016 asked; chapter III quotes OMAI 712/2005 art. 21 and 22, two hours, in place of its sixty minutes, and names the set's two tests in place of three. The table of contents loses its page numbers, as 3.2's did. The cover (2.0) is signed by the technician.

The organization's **instruction library** ([ADR 012](adr-012-own-instructions.md)) plays no part. A fire-safety module per activity was considered, with a domain on each module: the provider has no such modules (the one annex the pack cites was never written), the default says none, and every fact an annex would vary is already on the workplace. If a provider brings fire-safety modules, giving a module a domain and annexing them as 3.2 does is a later decision. Printing a chapter per workplace in the IPSU was rejected too: it would print the same facts a third time, beside decision 7 and the posted sheet.

### First aid has one source: 3.2 chapter VII

Decision 7's posted instructions and the IPSU's chapter on intervention, rescue and first aid take their first aid from the own instructions of the first set, chapter VII, as corrected in 70b59ab. The IPSU takes its whole lay first-aid part; the posted instructions take the articles a posted page needs: the rescuer's conduct, the call to 112, examining the victim, the recovery position, resuscitation and the defibrillator, burns, smoke and gas, electrocution. The organizational articles on first-aiders and kits stay in 3.2, as they rest on Legea 319/2006 and Ordinul 427/2002.

The text is copied at import: a fire-safety spec names the passage of `3.2_own_instructions.docx` by its first and last paragraphs, and the import writes those paragraphs into its section. A test in the document engine compares each copied passage with 3.2, paragraph by paragraph, and fails when they differ, so a later correction to 3.2 cannot reach one set and not the other. Typing the text into the fire-safety templates was rejected: two copies that drift apart are what the first set's audit found. A shared fragment merged at generation was rejected as an engine feature for one chapter.

### The training themes: the first set's sessions, the staff categories, static citations

The **fire-safety training themes** keep the sample's three chapters as one document per client.

- Chapter I, the introductory general training: one block for the whole staff, trained by the technician, then a plan citing the IPSU by article range, a test and the signing of the training sheets.
- Chapter II, the workplace training: one block per staff category that has current posts, naming the posts from `fire.staff`. The technical-administrative category is trained by the technician and the execution category by every workplace manager, "Name și Name – conducători loc de muncă", as decision 2 designates them. The material cites the IPSU by article range, the workplace's posted instructions (decision 7 by its number) and its posted sheet, where the sample cited the missing annex 1, then the practical demonstrations and the test.
- Chapter III, the periodic training: one block per staff category with posts, its interval and trainer as decision 2 prints them, then one row per **training session**: the months decision 2 prints, each citing a group of IPSU chapters dealt out as ADR 014 deals 3.2's, plus the posted instructions and the posted sheet, each lasting the client's periodic duration, "Testare." on the last.

Both eight-hour plans count training only: their rows add up to 480 minutes and the breaks are listed without minutes, where the sample counted 120 to 130 minutes of breaks towards OMAI 712/2005 art. 13 and 18. The household topic and the firefighters' tactics go with their chapters.

ADR 014's session arithmetic is reused: `dealChapters` takes the chapter starts and article count of the document it deals, and the IPSU's are held to its template by the test that holds 3.2's and 2.2's. ADR 014's citation of an own instructions revision is not reused: that mechanism exists because 3.2's annexes are library modules that change between revisions, and the IPSU has none, so every IPSU citation is static text of the template, like the first set's citations of 3.2's common part, and the themes need no IPSU revision to be generated. One block per job position, as the first set's themes print, was rejected: the fire-safety schedule has an interval per staff category and none per position (#371), decision 2 names posts by category, and the sample is written so.

### The tests drop the questions they get wrong

The two tests are the sample's questions with three left out at hiring (6, 8, 12) and four yearly (4, 5, 6, 14), for the reasons in the Context: a key that is wrong or a question no act in force answers. Question 14 asks what chemical or mechanical foam puts out; the review pass left it out (#391), as OMAI 135/2023 art. 20 bans chemical-foam extinguishers and the IPSU no longer teaches them. No question is rewritten and none is added; the test at hiring keeps twelve questions and the annual test ten, decision 2's minimum. The answer sheets have one row per question, which corrects the annual sheet's fifteen rows for fourteen questions, and the key is a table of its own, not a grid of letters. Provisional on question 11, issue #386.

There is no workplace test. OMAI 712/2005 asks a test after the introductory general training (art. 14) and before admitting someone to work after the workplace training (art. 20); the test at hiring is given at the end of both, and the IPSU and the themes say so. That is a reading of the two articles the provider has not confirmed (#386).

### The themes and the tests stay the provider's documents

The themes and the tests are presented as the provider's own documents for its client, drafted by the technician, as every document of the set is: no inspectorate approval is claimed and none is printed. Whether OMAI 712/2005 art. 65, which asks the inspectorate's approval for training materials made for sale, reaches materials a provider generates for its own client with this app is not known; no reading of the article settles it, and no one has asked the inspectorate. Recorded as question 13, issue #388. No provider models are needed for anything this stage builds (question 12, issue #387).

### Readiness stays whole, with two codes more

The set is still generated whole or not at all (ADR 018). It asks, besides what it asks today, `fire.smokingPolicy` and `provider.fireSafetyTechnicianCertificate`, each leading to the field that fixes it. Nothing else of this stage needs data the set does not already require: decision 7 reads the workplaces and means, decision 9 the coordinator, the technician and the means, the themes the schedule, the posts and the workplace managers, the IPSU and the tests only the client's name. A stage's documents asking nothing new was preferred to idea #369, which stays parked.

### What the merge data gains

- `fire.decisionNumbers` gains `smoking`, `technician`, `instructions` and `control`, at ordinals 4, 6, 7 and 9. The binder's numbers have no gaps from this stage on.
- `fire.smoking`: the policy, a flag for each, and the place or null.
- `fire.hasGasExtinguishers`: some active workplace has a CO₂ or clean-agent extinguisher.
- `fire.themes`: per staff category with current posts, its posts, its trainer for the workplace and the periodic training, its interval label, and its sessions with their month and content line.
- `fireSafetyTechnician` gains `certificate` and `authorization` (null when not set).

The snapshot keeps the whole value of each, as before. A certificate or authorization edit therefore marks every fire-safety draft that prints the technician "Date modificate", the covers included.

### Covers and the binder

The three covers are built with their sections, as ADR 016 asked: 2.0 for the own instructions, 3.0 for the themes with the sample's paragraph on how themes are structured, 4.0 listing the two tests. They are signed by the technician from the set's cover definition. The decisions cover already lists all nine decisions and does not change.

Each type key moves from planned to built on the _Documente PSI_ tab in the step that adds its template, and the contracts' list of fire-safety type keys grows in the binder's order. After the last step the tab plans nothing.

### The review pass

Once all eleven exist, the set gets the pass ADR 016 planned and the first set had: generate the whole set locally, with the PDF converter, for at least four seeded clients that differ where the templates branch (one workplace and three; smoking forbidden and allowed with and without a place; a CO₂ unit and none; both staff categories and only one; long names), read every PDF, and fix the templates. Findings that are content, not layout or wording, become issues for the provider rather than edits.

## What is left out

- A workplace test, the monthly sessions of the first-intervention team and the half-yearly evacuation exercise in the themes. Decision 2 already says the team is updated monthly; the exercises are a living record.
- The individual training sheet (OMAI 712/2005 annex), one per employee: a document that exists many times per client (ADR 005), and the training records of #183 come first.
- The half-yearly evaluation report, the list of dangerous substances, fire-safety duties in job descriptions (OMAI 163/2007 art. 9) and the evacuation plan.
- The registration of each contract on the inspectorate's platform, and any check that the provider is authorized.
- A client bound to employ a technician under OMAI 106/2007: decision 6 is written for a contracted provider.
- The shorter list of OMAI 163/2007 art. 20 for clients under ten employees (question 5): every client still gets the whole set.
- A smoking place per workplace.
- The instruction library for fire safety, and any activity annex.
- Computing decision 9's months from the issue date.

## Consequences

- Every document of the fire-safety binder is generated. The tab's planned rows and the "În pregătire" state are left with nothing to show.
- A client ready for the set after stage 2 needs its smoking policy set and the organization its technician's certificate before the next generation.
- The IPSU's article numbers are fixed by its template, and the themes cite them as static text held by a test: an edit that adds or removes an IPSU article fails the test until the themes' ranges move with it.
- One first-aid text is printed by three templates. A correction to 3.2 chapter VII fails the engine's test until 1.7 and 2.1 are imported again, and each gets a version of its own.
- Decision 7 is the longest decision, and it grows by a page set with every workplace.
- Two stage-2 documents change: the posted sheet prints the smoking rule, and the decisions cover moves only if the new covers lower the line where the hand-over block starts on every cover of the set. Their new versions are of the kinds `correction` and `layout`.
- Two acts join the index and the Legislație page: Legea 349/2002 and OMAI 135/2023. The decisions and the IPSU quote Legea 307/2006 at the form of 08.05.2026, so its next change is reported against these templates.
- The wording of decisions 4, 6, 7 and 9, the IPSU's chapter set, the tests and the first aid follow provisional defaults. When the provider answers issues #380 to #388, the templates change; the data added here, two optional texts, stays.
- Two questions stay open in law, not with the provider: when the authorization methodology of art. 12^2 takes effect, and whether OMAI 712/2005 art. 65 applies to generated themes and tests.

## Order of work

1. This ADR, the amendments to ADR 016 (stage 3's documents) and ADR 018 (the smoking policy printed and required), the glossary in `CONTEXT.md`, and `docs/data-model.md`.
2. The data: the migration for `client_fire_safety.smoking_place` and `organizations.fire_safety_authorization` with their pgTAP tests; the contracts, the API routes of the fire-safety card and the organization, their tests, the seed and `docs/api.md`.
3. The screens: the smoking place on the "Instruire PSI" card, shown with the designated-places policy; the authorization on the Abilitări tab; unit tests and the flow.
4. The merge data: the four decision ordinals, `fire.smoking`, `fire.hasGasExtinguishers`, `fire.themes` with `dealChapters` generalized, the technician's certificate and authorization, the two readiness codes and their rows in the generation dialog, and the snapshot.
5. The import tool: copying a passage from another template, and the test that holds the copies to 3.2.
6. Templates, decisions 4, 6 and 9, with the posted sheet's smoking line, the two acts in `legal-acts.json`, and their type keys moved to built.
7. Template, decision 7.
8. Templates, the IPSU and its cover, with the test that holds its chapter starts.
9. Templates, the themes, the two tests and their covers.
10. The review pass over several clients' PDFs, with the fixes it finds. After the merge, the templates are registered on hosted.
