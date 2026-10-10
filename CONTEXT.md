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

**Fire-safety technician** (_cadru tehnic PSI_): the person who carries the organization's fire-safety duties for its clients and signs the fire-safety set for the provider, where the specialist and the legal representative sign the occupational safety one. A name and a certificate kept on the organization; not a member role. Decision 6 of the fire-safety set appoints them for the provider under contract and prints their certificate, which the set requires. ADR 016, ADR 019. Avoid: PSI specialist, which collides with the member role, and _responsabil PSI_, which the old norms used.

**Fire-safety authorization** (_autorizația de cadru tehnic_): the inspectorate's authorization of a provider to act as fire-safety technician under contract, required by Legea 307/2006 art. 12^2 since OUG 17/2026. Optional text on the organization, as the provider writes it; decision 6 prints it when set and never asks for it. ADR 019. Avoid: certificate, which is the technician's own qualification, and _atestat_, which the norms use for firms that service equipment.

**Employee** (_angajat_): a person employed by a client. Avoid: worker, staff, user.

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

**Workplace** (_punct de lucru_): an address where a client operates, the registered office included. Avoid: location, site, and "loc de muncă".

**Fire-safety means** (_mijloace de apărare împotriva incendiilor_): the equipment and installations a workplace has against fire, recorded one unit per row: each extinguisher, sand box, fire post or fire blanket, and each installation, such as the alarm system or the interior hydrants. They have a tab of their own, _Mijloace PSI_. ADR 018. Avoid: inventory, _dotări_ as a word users see, and PSI equipment, which collides with protective equipment.

**Protective equipment** (_echipament individual de protecție_, EIP): what the holders of a job position wear or use against the risks of the post, recorded as entries on the position. A position is **undecided** about it, **needs none**, or is **equipped**. Its internal list is a document of the set. ADR 011. Avoid: PPE, gear, and work clothing (_îmbrăcăminte de lucru_), which the law excludes.

**Equipment entry** (_articol de echipament_): one item a job position receives: the risk it protects against, the item, the quantity granted at once, its duration of use in months, and its allocation mode. Avoid: line, row.

**Instruction module** (_instrucțiune specifică_): one self-contained own instruction for a work activity, a piece of work equipment or a category of protective equipment: a title, a group, and a Word file kept as its author made it. Belongs to the organization, kept in versions. A job position is **undecided** about instructions, **needs none** beyond the common part, or **applies** a list of modules. ADR 012. Avoid: chapter, section, block, template (a module is content, not merged), and "instrucțiuni proprii", which is the whole document.

**Instruction library** (_biblioteca de instrucțiuni_): the organization's instruction modules, uploaded as Word files or written in the app. Starts empty; the app ships no instruction text. Avoid: catalogue, template set.

**Training themes** (_tematica de instruire_): the document of the set that says, per job position, who trains it and what each training phase covers, citing the general training material and the own instructions by article range and the position's instruction modules by title. Generated from the client's newest own instructions revision. ADR 014. Avoid: training plan, syllabus, and "program de instruire", which is the training schedule.

**Fire-safety training themes** (_tematica de instruire în domeniul situațiilor de urgență_): the fire-safety set's training themes and training–testing programme: what the introductory general, workplace and periodic trainings cover and who gives them, a block per staff category, citing the fire-safety own instructions by article range as static text. ADR 019. Avoid: training themes on their own, which is the occupational safety document, and training plan.

**Training session** (_ședință de instruire_): one periodic training in one of the months an interval gives from the first training month: a month, a content line and the periodic duration. The training themes of the occupational safety set print one row per session of a job position; the fire-safety training themes, one per session of a staff category (ADR 019). Avoid: instructaj, which the law replaced.

**Own instructions** (_instrucțiuni proprii_, IPSSM): the document of the set that binds the client's workers: a **common part** the app generates, which lists as **annexes** the instruction modules the client's positions apply. Its Word file is the common part; its issued PDF is the common part and the annexes in one file, each module after an **annex title page** that names it "Anexa N" (the module's own file is never written to). ADR 012. Avoid: bound document, assembled document.

**Fire-safety own instructions** (_instrucțiuni proprii în domeniul situațiilor de urgență_, IPSU): the fire-safety set's own instructions: one built-in text the same for every client but its name, made of the norms' general chapters, with no annexes and no instruction modules. What is specific to a workplace is printed by the posted instructions and the posted workplace sheet. ADR 019. Avoid: own instructions on its own, which is the occupational safety document (IPSSM), and PSI instructions.

**Allocation mode** (_mod de acordare_): how an item reaches the worker: **personal inventory** (_inventar personal_), issued and replaced when its duration runs out; **section inventory** (_inventar de secție_), kept at the workplace and shared; or **consumable** (_consum_), used up and restocked, with no duration. Avoid: type of issue, ownership.

**Risk evaluation** (_evaluarea postului_): the record of one evaluated work system by the I.N.C.D.P.M. method: its risk factors with their classes and prevention measures. One per job position; a client also holds evaluations that are not posts, the **sensitive groups** always and others by name. Both the risk assessment and the prevention plan are generated from it. ADR 015. Avoid: risk assessment for the record, which is the document.

**Risk factor** (_factor de risc_): one way the work can harm, recorded on a risk evaluation: the component of the work system it belongs to, its description, a gravity class (1–7) and a probability class (1–6). Its **risk level** (1–7) is read from the method's grid, never typed; above 3 it is **unacceptable**. Avoid: hazard, risk on its own.

**Prevention measure** (_măsură de prevenire_): what is done against a risk factor, of one of four kinds: technical, organizational, hygienic-sanitary, other. A factor's prevention measures, with its actions, deadline and person responsible, are its row in the prevention plan. Avoid: measure on its own.

**Global risk level** (_nivel de risc global_): the weighted mean of an evaluation's risk levels, each weighted by itself. Acceptable up to 3.5.

**Evaluation profile** (_profil de evaluare_): a named set of risk factors with classes and prevention measures, kept by the organization and copied into evaluations. A copied factor remembers the profile it came from, as provenance only: the two change apart. The profiles are the **risk library** (_biblioteca de riscuri_), which starts empty; the app ships no risk text. Avoid: template, catalogue.

## Documents

**Document**: one document type, once, for a client, with its revisions. Part of one of the client's two **documentation sets**, or its service contract. ADR 005. Avoid: file (that is what a revision has), pack as something users see.

**Documentation set** (_documentația_): the documents the app generates for a client in one field, with a tab, a generation and a readiness of its own. A client has two: the **occupational safety set** (_Documente SSM_) and the **fire-safety set** (_Documente PSI_). Every client has both; a lead has neither. "The set" on its own, in the ADRs before 016, is the occupational safety one. ADR 016. Avoid: pack and dossier (_dosar PSI_) as something users see, and SU (_situații de urgență_), which the source documents use for the field the interface calls PSI.

**Fire-work permit** (_permis de lucru cu foc_): the form that allows one job with open flame for one day, in the model of the general fire-safety norms. The fire-safety set holds it blank. Avoid: hot-work permit, authorization.

**Own control** (_controlul propriu_): the checks a client makes of its own fire-safety rules, by whom and how often, as decision 9 of the fire-safety set schedules them: the coordinator and the technician quarterly, every extinguisher monthly, the heads of the workplaces and the execution staff daily, the representative yearly. Avoid: inspection and control on their own, which are the inspectorate's, and internal audit.

**Posted workplace sheet** (_organizarea apărării împotriva incendiilor la locul de muncă_): the page posted at a workplace that says what can burn there, what can set it alight, and who does what when it does, in the model of OMAI 163/2007 annex 1. Completed by the workplace manager as head of the workplace and approved by the fire-safety technician. One document of the fire-safety set, with a page per workplace. ADR 018. Avoid: posted instructions (_instrucțiuni de afișat_), which are decision 7, and fire plan.

**Posted instructions** (_instrucțiunile de apărare împotriva incendiilor și atribuțiile salariaților la locurile de muncă_): the annex of decision 7 of the fire-safety set, a page set per workplace that says the duties of each kind of person, how to behave in case of fire, the workplace's extinguishers and installations, its fire risks, the smoking rule and first aid; drafted by the workplace manager, checked by the fire-safety technician, approved by the client's representative. ADR 019. Avoid: posted workplace sheet, which is the sheet of OMAI 163/2007 annex 1, and _instrucțiuni de afișat_ as something users see.

**Client file** (_fișier_): a file about a client that the app did not write: uploaded, named, downloaded, deleted. Has no revisions and no type. An owner can keep one **for owners only**. A lead has them too. ADR 013. Avoid: document, which the app generates and issues, and attachment.

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
