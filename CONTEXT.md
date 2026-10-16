# Context

The vocabulary of SSM Ușor. One product, one vocabulary: code, documentation, issues and the interface use these terms and avoid the synonyms listed under them. Romanian terms are the ones the interface shows. Decisions behind the terms are in `docs/architecture/`.

## People and organizations

**Organization** (_organizație_): a provider of occupational safety services, the app's customer. Owns everything below it. Avoid: tenant, company, firm.

**Member**: a user who belongs to an organization, as **owner** or **specialist**. Avoid: user (when the role matters), admin.

**Client** (_client_): a company the organization serves. Avoid: customer, which is the organization.

**Lead** (_client potențial_): a company the organization hopes to serve and does not serve yet. An owner promotes it to a client, normally once its service contract is signed, and that cannot be undone; a lead that goes nowhere is archived. Only owners work with leads. ADR 007. Avoid: prospect, opportunity, offer.

**Stage**: how far a company has come with the organization: **lead**, then **client**. One record moves from the first to the second by promotion and never back. The interface never shows the word, only _clienți potențiali_ and _clienți_. Separate from whether the company is active or **archived**, which applies to both stages: an archived lead is restored as a lead. Avoid: status, which is kept for where a record stands in its own life (an employee's, a revision's, a client's being active or archived), and type or kind, which hide that one becomes the other.

**Service contract** (_contract de prestări servicii_): the agreement between the organization and a client for occupational safety services, and for fire safety where that is sold too. It has a place of its own, the client's Contract tab, which only owners see; it is drafted for a lead or for a client and signed outside the app. Not the employment contract behind a contract title.

**Certificate of authorization** (_certificat de abilitare_): what entitles an organization to act as an external prevention and protection service: a number, a date and the directorate that issued it. A service contract cites it and annexes a copy.

**Fire-safety technician** (_cadru tehnic PSI_): the person who carries the organization's fire-safety duties for its clients and signs the fire-safety set for the provider, where the specialist and the legal representative sign the occupational safety one. A name and a certificate kept on the organization; not a member role. Decision 5 of the fire-safety set appoints them for the provider under contract and prints their certificate, which the set requires. ADR 016, ADR 019. Avoid: PSI specialist, which collides with the member role, and _responsabil PSI_, which the old norms used.

**Fire-safety authorization** (_autorizația de cadru tehnic_): the inspectorate's authorization of a provider to act as fire-safety technician under contract, required by Legea 307/2006 art. 12^2 since OUG 17/2026. Optional text on the organization, as the provider writes it; decision 5 prints it when set and never asks for it. ADR 019. Avoid: certificate, which is the technician's own qualification, and _atestat_, which the norms use for firms that service equipment.

**Employee** (_angajat_): a person employed by a client, assigned to a job position and to the workplace they work at. Avoid: worker, staff, user.

**Responsible person** (_persoană responsabilă_): someone who holds a role in a client's safety organization: workplace manager, first-aider, member of the risk evaluation team. One person can hold several roles. May or may not be an employee. A role is not a job position.

**Workers' representative** (_reprezentantul lucrătorilor_): the responsible-person role of an employee chosen by the workers to speak for them on safety and health. Required from 10 current employees, two from 50. Always an employee, never the client's legal representative. ADR 010. Avoid: employee representative, union representative.

**Fire-safety coordinator** (_coordonator privind apărarea împotriva incendiilor_): the responsible-person role of the person who organizes fire defence at a client and holds the designations of its organization decision, with the fire-safety technician beside them where the decision says so. ADR 018. Avoid: _responsabil PSI_, which the old norms used, and fire officer.

**First-intervention leader** (_șef echipă de primă intervenție_): the responsible-person role of the person who leads a client's first-intervention team, the staff on duty who act with the extinguishers and evacuate people and goods when a fire starts. ADR 018. Avoid: fire warden, emergency team leader.

## Work

**Job position** (_post de lucru_): a post at a client as occupational safety sees it: a kind of work with its own risks, equipment and training. Belongs to the client and exists whether or not anyone holds it. An employee is assigned to one. ADR 006. Avoid: job title, role, function, occupation, and "loc de muncă", which the source documents use for three different things.

**Contract title** (_funcția din contract_): the title in a person's employment contract, kept on the employee. Usually the same words as their job position, and not the same fact: two people with one contract title can fill different positions. Documents about a person print it. Avoid: job title on its own, which does not say which of the two is meant.

**Staff category** (_categorie de personal_): one of two kinds of job position, each with its own interval of periodic training: _tehnico-administrativ și conducători de locuri de muncă_, or _personal de execuție_.

**Training schedule** (_program de instruire_): the client's periodic training plan. For each staff category, it records an interval or the specialist's explicit decision that the category does not apply; a blank choice remains undecided.

**Fire-safety training schedule** (_programul de instruire PSI_): the client's periodic fire-safety training plan under OMAI 712/2005: a duration in hours, an interval for each staff category, the first month and its days. Separate from the occupational safety training schedule, which lends it only its first month and days while it is still empty. ADR 018. Avoid: PSI interval as a setting of the training schedule.

**Smoking rule** (_reglementarea fumatului_): how a client regulates smoking against fire: forbidden everywhere on its premises, or allowed only in places set up outside its buildings, with one optional text saying where. Kept on the client's fire-safety card; decision 4 prints it, the posted instructions and the posted workplace sheet repeat it. The fire-safety coordinator supervises it. ADR 018, ADR 019. Avoid: smoking ban, which is one of the two rules, and smoking area.

**Work zone** (_zona de lucru_): the kind of place a job position works in, as free text: "Birou", "Atelier, teren". Not an address. Avoid: workplace.

**Workplace** (_punct de lucru_): an address where a client operates, the registered office included. Its kind is a **fixed space** (_spațiu fix_) or a **temporary or mobile site** (_șantier temporar sau mobil_), which has no floor area and no row in annex 6 of OMAI 163/2007. An employee works at one, by default the only active one a client has. ADR 018, ADR 021. Avoid: location, site on its own, and "loc de muncă".

**Fire-safety means** (_mijloace de apărare împotriva incendiilor_): the equipment and installations a workplace has against fire, recorded one unit per row: each extinguisher, sand box, fire post or fire blanket, and each installation, such as the alarm system or the interior hydrants. They have a tab of their own, _Mijloace PSI_. ADR 018. Avoid: inventory, _dotări_ as a word users see, and PSI equipment, which collides with protective equipment.

**Substances list** (_lista cu substanțele periculoase_): the dangerous substances a client uses, one entry per substance: its name, its classification under the CLP regulation and the quantity held, and the texts copied from its safety data sheet, each of which the document 5.3 prints as a gap to fill in when empty. Kept on the _Mijloace PSI_ tab and asked of every client, whatever its headcount (OMAI 163/2007 art. 18 lit. p) and art. 20 (3) lit. g)). ADR 018. Avoid: chemicals list, inventory of substances, and hazardous materials.

**Substances state** (_starea listei de substanțe periculoase_): whether a client has said if it uses dangerous substances: **undecided**, which blocks the fire-safety set, **none** (_nu se utilizează substanțe periculoase_), a declaration the list 5.3 prints in their place, or **listed**, which needs at least one entry before the set generates. A declared none is a declaration, not an empty list. ADR 018. Avoid: has substances, as a yes or no.

**Maintenance item** (_verificare periodică_): a free row of a workplace's maintenance and check schedules, for a check the fire-safety means do not hold, such as the yearly check of the gas installation or the chimney: what is checked, how often as printed ("anual", "la 6 luni") and who checks it. Typed under "Alte verificări periodice" on the _Mijloace PSI_ tab, optional, never blocking; the schedules 5.4 print them below the rows they derive from the extinguishers and installations. ADR 018, amended 2026-10-11. Avoid: task, maintenance plan.

**Schedules** (_graficele de întreținere și verificare_): document 5.4 of the fire-safety set, one table per active workplace of what is checked, how often, by whom and on what basis: the extinguishers' monthly check, weighing, yearly service and recharge, each installation at its next check, then the maintenance items. Required from ten employees (OMAI 163/2007 art. 18 lit. q), ADR 020).

**Building** (_clădirea_): the building of a fixed-space workplace, one at most: the year built, the built area, the levels, the classification (_civilă_, _de producție_, _de depozitare_, _cu funcțiuni mixte_), the structure, the heating fuel, what gas is used for, who maintains the electrical installation and its last check, the water reserve for extinguishing, and free notes. Every fact optional, typed under "Clădirea" on the _Mijloace PSI_ tab, never asked for by readiness; the detection and alarm, the safety lighting, the hydrants and the lightning protection are installations, not facts of the building. A temporary or mobile site has none. ADR 020. Avoid: premises, site.

**Site sheet** (_fișa obiectivului_): document 7.1 of the fire-safety set, after the model of OMAI 89/2013 annex 4: the operator, its points of work and the technician, the general facts and per building its constructive and technical rows, the dangerous substances and how fire defence is organized, filled from the client's data where the app holds it and printed as a **gap** (`DE COMPLETAT` with the model's own instruction) where it does not. Required from ten employees (OMAI 163/2007 art. 18 lit. b), ADR 020). Avoid: object sheet, fișa obiectului.

**Protective equipment** (_echipament individual de protecție_, EIP): what the holders of a job position wear or use against the risks of the post, recorded as entries on the position. A position is **undecided** about it, **needs none**, or is **equipped**. Its internal list is a document of the set. ADR 011. Avoid: PPE, gear, and work clothing (_îmbrăcăminte de lucru_), which the law excludes.

**Equipment entry** (_articol de echipament_): one item a job position receives: the risk it protects against, the item, the quantity granted at once, its duration of use in months, and its allocation mode. Avoid: line, row.

**Instruction module** (_instrucțiune specifică_): one self-contained own instruction for a work activity, a piece of work equipment or a category of protective equipment: a title, a group, a domain, and a Word file kept as its author made it. Belongs to the organization, kept in versions. A job position is **undecided** about instructions, **needs none** beyond the common part, or **applies** a list of modules, once for each domain: decided for one, it is still undecided for the other. ADR 012. Avoid: chapter, section, block, template (a module is content, not merged), and "instrucțiuni proprii", which is the whole document.

**Module domain** (_domeniul instrucțiunii_): which set's own instructions annex an instruction module: **SSM** (`ssm`), the occupational safety set's 3.2, or **PSI** (`psi`), the fire-safety set's 2.1. Set when the module is uploaded or written; it does not change while a current position applies the module, and a module is applied only in its own domain. ADR 012, amended 2026-10-11. Avoid: library or catalogue for a domain, as there is one library, and type or kind of module.

**Instruction library** (_biblioteca de instrucțiuni_): the organization's instruction modules, uploaded as Word files or written in the app. Starts empty; the app ships no instruction text. Avoid: catalogue, template set.

**Training themes** (_tematica de instruire_): the document of the set that says, per job position, who trains it and what each training phase covers, citing the general training material and the own instructions by article range and the position's instruction modules by title. Generated from the client's newest own instructions revision. ADR 014. Avoid: training plan, syllabus, and "program de instruire", which is the training schedule.

**Fire-safety training themes** (_tematica de instruire în domeniul situațiilor de urgență_): the fire-safety set's training themes and training–testing programme: what the introductory general, workplace and periodic trainings cover and who gives them, a block per staff category, citing the fire-safety own instructions' own chapters by article range as static text and, in each periodic training session, the `psi` instruction modules the category's positions apply by title and article range, as the client's newest fire-safety own instructions revision annexes them, so they need a generated one. ADR 019, ADR 012 amended 2026-10-11. Avoid: training themes on their own, which is the occupational safety document, and training plan.

**Training session** (_ședință de instruire_): one periodic training in one of the months an interval gives from the first training month: a month, a content line and the periodic duration. The training themes of the occupational safety set print one row per session of a job position; the fire-safety training themes, one per session of a staff category (ADR 019). Planned, not held: see training held. Avoid: instructaj, which the law replaced.

**Training held** (_instruire efectuată_): one act of training at a client: in one domain, occupational safety or fire safety, of one phase, on a day, with a duration in minutes, the material taught as text, who trained and, where the form has that signature, who verified. Recorded once with the employees who attended; a hiring training has one attendee. ADR 021. Avoid: session, which is the planned one, event, and instructaj.

**Training record** (_instruire_, on an employee's page under _Instruire_): one employee's attendance at a training held, with the occupation printed for it, the name of their position at the time. What the individual training sheets print, one row each, and what the electronic signature will sign. The workplace training record also carries "admis la lucru". ADR 021. Avoid: attendance, training flag, completion.

**Training phase** (_tipul instruirii_): which of the law's trainings a training held is: **introductory general** (_introductiv-generală_), **workplace** (_la locul de muncă_), **periodic** (_periodică_) or **supplementary** (_periodică suplimentară_), the last with its reason among the cases of HG 1425/2006 art. 98. The first two are the **hiring trainings**. ADR 021. Avoid: kind, level, instructaj introductiv.

**Signer slot** (_semnatar_): a role on a training record that a signature fills: the trainee, the trainer, the verifier, the person who admits to work. Fixed per domain and phase, proposed as the people the app holds, replaceable with who actually trained. Empty until the electronic signature exists; the paper sheet carries the signatures meanwhile. ADR 021. Avoid: signature, which is what fills it.

**Next training due** (_termenul următoarei instruiri_): the day the last periodic training record, else the workplace training record, else the hire date, gives when the interval of the employee's position or staff category is added; computed per domain, never stored. A supplementary training does not move it. Its **training state** (_starea instruirii_): _neinstruit_ with no hiring training recorded, _la zi_, _scadentă_ within the next thirty days, _depășită_ once passed; none for a leaver. ADR 021. Avoid: expiry, deadline, which prevention measures have, and trained as a yes or no.

**Commute** (_traseul de deplasare_): the route an employee takes between home and work, as free text, and its duration in minutes. Kept on the employee, optional on the form, required by the occupational safety sheet, which prints it: an accident on the normal route and within its normal duration is a work accident (Legea 319/2006 art. 30). ADR 021. Avoid: route declaration, which is the paper habit the sheet replaces.

**Own instructions** (_instrucțiuni proprii_, IPSSM): the document of the set that binds the client's workers: a **common part** the app generates, which lists as **annexes** the instruction modules the client's positions apply. Its Word file is the common part; its issued PDF is the common part and the annexes in one file, each module after an **annex title page** that names it "Anexa N" (the module's own file is never written to). ADR 012. Avoid: bound document, assembled document.

**Fire-safety own instructions** (_instrucțiuni proprii în domeniul situațiilor de urgență_, IPSU): the fire-safety set's own instructions: one built-in text the same for every client but its name, made of the norms' general chapters, which lists as **annexes** the PSI instruction modules the client's positions apply, as the own instructions annex the SSM ones: its Word file is the general chapters, its issued PDF adds each module after an annex title page ("Anexa N", "I.P.S.U."). What is specific to a workplace is also printed by the posted instructions and the posted workplace sheet. ADR 019, ADR 012 amended 2026-10-11. Avoid: own instructions on its own, which is the occupational safety document (IPSSM), and PSI instructions.

**Allocation mode** (_mod de acordare_): how an item reaches the worker: **personal inventory** (_inventar personal_), issued and replaced when its duration runs out; **section inventory** (_inventar de secție_), kept at the workplace and shared; or **consumable** (_consum_), used up and restocked, with no duration. Avoid: type of issue, ownership.

**Risk evaluation** (_evaluarea postului_): the record of one evaluated work system by the I.N.C.D.P.M. method: its risk factors with their classes and prevention measures. One per job position; a client also holds evaluations that are not posts, the **sensitive groups** always and others by name. Both the risk assessment and the prevention plan are generated from it. ADR 015. Avoid: risk assessment for the record, which is the document.

**Risk factor** (_factor de risc_): one way the work can harm, recorded on a risk evaluation: the component of the work system it belongs to, its description, a gravity class (1–7) and a probability class (1–6). Its **risk level** (1–7) is read from the method's grid, never typed; above 3 it is **unacceptable**. Avoid: hazard, risk on its own.

**Prevention measure** (_măsură de prevenire_): what is done against a risk factor, of one of four kinds: technical, organizational, hygienic-sanitary, other. A factor's prevention measures, with its actions, deadline and person responsible, are its row in the prevention plan. Avoid: measure on its own.

**Global risk level** (_nivel de risc global_): the weighted mean of an evaluation's risk levels, each weighted by itself. Acceptable up to 3.5.

**Evaluation profile** (_profil de evaluare_): a named set of risk factors with classes and prevention measures, kept by the organization and copied into evaluations. A copied factor remembers the profile it came from, as provenance only: the two change apart. The profiles are the **risk library** (_biblioteca de riscuri_), which starts empty; the app ships no risk text. Avoid: template, catalogue.

## Documents

**Document**: one document type, once, for a client, with its revisions; a dated type once per period. Part of one of the client's two **documentation sets**, or its service contract. ADR 005. Avoid: file (that is what a revision has), pack as something users see, and sheet, which is generated about one employee and never kept.

**Sheet** (_fișă_): what the app generates about one employee: built from the employee and their training records when opened, merged and converted to PDF in one request, streamed, never stored and never revised. Not a document, in no documentation set, on no documents tab; its own readiness names what it lacks. ADR 021. Avoid: document, per-employee document, booklet.

**Individual training sheet** (_fișa individuală de instruire_ for occupational safety, after HG 1425/2006 annex 11; _fișa individuală de instructaj în domeniul situațiilor de urgență_ for fire safety, after the OMAI 712/2005 annex): the sheet of one employee in one domain: the identification block with the workplace and the position's work zone as "locul de muncă", the hiring trainings and "admis la lucru", and the periodic table with a row per periodic or supplementary training record and, while signatures are on paper, blank rows to the end of the page. Blocks on the commute (occupational safety) and on the workplace at a client with several. ADR 021. Avoid: training booklet, fișa de instruire on its own, which does not say which domain, and training sheet of a position.

**Dated document type**: a document type a client holds once per **period** rather than once, each period a document of its own with its own revisions, so that the report of 2025 stays beside the report of 2026, both asked for at a control. Generating it asks for the year, the current one proposed; another year makes another document, never a revision. The annual report is the only one. ADR 020. Avoid: revisions for the years, which say a report replaced the one before it.

**Period** (_anul de referință_): the year a dated document reports on, part of its identity beside the client and the type. Avoid: issue date, which is the date a document carries, and year of the set.

**Annual report** (_raportul anual de evaluare a capacității de apărare împotriva incendiilor_): document 7.2 of the fire-safety set, a dated type: the decisions, the people with duties and the staff, the means of each workplace, the planned training and controls and the state of the set's documents as the app holds them for the year, and a gap for each part of the analysis of OMAI 163/2007 art. 152 the technician writes. Required from ten employees (art. 18 lit. c), ADR 020). Avoid: annual analysis on its own, which is the meeting the report is presented at, and half-yearly report, which is not built.

**Documentation set** (_documentația_): the documents the app generates for a client in one field, with a tab, a generation and a readiness of its own. A client has two: the **occupational safety set** (_Documente SSM_) and the **fire-safety set** (_Documente PSI_). Every client has both; a lead has neither. "The set" on its own, in the ADRs before 016, is the occupational safety one. ADR 016. Avoid: pack and dossier (_dosar PSI_) as something users see, and SU (_situații de urgență_), which the source documents use for the field the interface calls PSI.

**Document that does not apply** (_nu se aplică_): a built-in document a client's set does not hold because of its current employee count: decision 1.5 of the occupational safety set under 10 (ADR 010), and decisions 8 and 9 and the installation register of the fire-safety set under 10, which OMAI 163/2007 art. 20 does not ask of a smaller operator (ADR 020). It is not generated, nothing is asked for it, its tab shows it as "nu se aplică" with the reason, and its cover leaves it out. One that exists stays in the set whatever the count becomes. Avoid: optional, which suggests a choice the provider does not have, and missing, which is a document the client needs.

**Decision ordinal**: a fire-safety decision's fixed place in the binder, 1 to 9, from which its printed number follows: the first decision number plus the ordinal minus one. The two decisions required only from ten employees are last, 8 the hot and cold seasons and 9 the own control, so a smaller client's decisions run 1 to 7 with no gap. ADR 018, ADR 020. Avoid: numbering the decisions in the order they exist, as the occupational safety set does, which renumbers issued decisions when one is added.

**Fire-work permit** (_permis de lucru cu foc_): the form that allows one job with open flame for one day, in the model of the general fire-safety norms. The fire-safety set holds it blank. Avoid: hot-work permit, authorization.

**Own control** (_controlul propriu_): the checks a client makes of its own fire-safety rules, by whom and how often, as decision 9 of the fire-safety set schedules them: the coordinator and the technician quarterly, every extinguisher monthly, the heads of the workplaces and the execution staff daily, the representative yearly. Only a client from ten employees has the decision. ADR 019, ADR 020. Avoid: inspection and control on their own, which are the inspectorate's, and internal audit.

**Posted workplace sheet** (_organizarea apărării împotriva incendiilor la locul de muncă_): the page posted at a workplace that says what can burn there, what can set it alight, and who does what when it does, in the model of OMAI 163/2007 annex 1. Completed by the workplace manager as head of the workplace and approved by the fire-safety technician. One document of the fire-safety set, with a page per workplace. ADR 018. Avoid: posted instructions (_instrucțiuni de afișat_), which are decision 6, and fire plan.

**Posted instructions** (_instrucțiunile de apărare împotriva incendiilor și atribuțiile salariaților la locurile de muncă_): the annex of decision 6 of the fire-safety set, a page set per workplace that says the duties of each kind of person, how to behave in case of fire, the workplace's extinguishers and installations, its fire risks, the smoking rule and first aid; drafted by the workplace manager, checked by the fire-safety technician, approved by the client's representative. ADR 019. Avoid: posted workplace sheet, which is the sheet of OMAI 163/2007 annex 1, and _instrucțiuni de afișat_ as something users see.

**Client file** (_fișier_): a file about a client that the app did not write: uploaded, named, downloaded, deleted. Has no revisions and no type. An owner can keep one **for owners only**. A lead has them too. One can belong to an employee, such as the photograph of a paper training sheet, shown on their page and under the client's files with their name (ADR 021). ADR 013. Avoid: document, which the app generates and issues, and attachment.

**Other documents** (_alte documente_): a client's files together, and the tab that lists them. Neither its documentation set nor its service contract. Avoid: annex, which the contracts use for an annex to a contract.

**Revision** (_revizie_): a version of a document, with its Word file. A **draft** (_ciornă_) can be edited, regenerated, replaced by an upload, or deleted. An **issued** (_emis_) revision is locked with the hash of its file and of its PDF. The one issued before it is **superseded**.

**Signed copy** (_exemplar semnat_): the PDF that comes back signed, on paper and scanned or with the signer's own certificate, attached to the issued revision it is a copy of: by an owner, or through the return link and then confirmed by an owner. The app records that one was attached, not that it is signed.

**Return link** (_linkul de retur_): the address in a contract email through which the recipient sends the signed copy back, without an account. One per send. It stops working once a copy is confirmed, a newer revision is issued, or sixty days pass.

**Received copy** (_exemplar primit_): a signed copy that came through the return link and that no owner has confirmed yet. Until an owner confirms it, the contract counts as not signed. Avoid: pending, unverified.

**Template**: the Word file a document is merged from. Built-in templates live in the repository and are registered in versions. A version carries a **note** for members and a **kind**: **legal**, a quoted or referred legal text changed; **correction**, the template's own content was fixed; **layout**, no words changed. Legal and correction versions prompt regeneration; layout versions do not. ADR 017.

**Uploaded document type**: a document of the pack the app cannot write yet, which comes to exist by uploading a `.docx` written elsewhere. None is left since the risk assessment and the prevention plan are generated (ADR 015); a file can still replace the draft of any document.

## Legislation

**Legal act** (_act normativ_): a law, government decision or ministerial order a built-in template quotes or refers to, named by its number and year: "Legea 319/2006", "H.G. 1425/2006", "OMAI 163/2007". Avoid: law (when the kind matters), legislation entry, regulation.

**Citation** (_citare_): one place in a built-in template that quotes or refers to a legal act. A **quoted article** (_preluare_) is a paragraph that opens "Preluare din" and reproduces the article's text; a **reference** (_trimitere_) is a sentence that names the act, with or without an article. Found in the templates, never written by hand. ADR 017. Avoid: legal basis, source.

**Watched act** (_act urmărit_): a legal act the templates cite, followed on the Portal Legislativ: the consolidated form the templates were verified against and the newest one seen. Avoid: monitored law, tracked act.

**Legal change** (_modificare legislativă_): a newer consolidated form of a watched act, with the act that produced it. **Open** (_în verificare_) until **resolved**: as **no impact** (_fără impact_) when no cited text differs, or by the template version that answers it. ADR 017. Avoid: amendment (which is the act that produced it), update, alert.

**Behind** (_în urmă_): a document whose newest revision was generated from an older template version of a kind that prompts regeneration. Decided by the version alone, never by the document's edits. Avoid: outdated, stale (kept for a draft whose data changed).

## Product feedback

**Problem report** (_raportare a unei probleme_): a member's account of app UI or behavior that failed or behaved unexpectedly. A question, feature idea, or concern about generated document content is not a problem report.
