# Context

The vocabulary of SSM Ușor. One product, one vocabulary: code, documentation, issues and the interface use these terms and avoid the synonyms listed under them. Romanian terms are the ones the interface shows. Decisions behind the terms are in `docs/architecture/`.

## People and organizations

**Organization** (_organizație_): a provider of occupational safety services, the app's customer. Owns everything below it. Avoid: tenant, company, firm.

**Member**: a user who belongs to an organization, as **owner** or **specialist**. Avoid: user (when the role matters), admin.

**Participant** (_participant_): a person of a client with an account: an employee of that client, or its client administrator. Made by a member from the employee's page or the client's Portal tab, invited to one address, email or phone, and signed in with a code sent there; no password. One per person and client, and one account can be a participant at several clients. Never a member, and a member never acts as one: the app's routes act on the membership, the portal's on the participations. ADR 022. Avoid: user, portal user, external user, and client user, which does not say which person.

**Portal** (_portal_): what a participant sees, an application of its own at `portal.ssmusor.ro` beside the app at `app.ssmusor.ro`: one column, phone first, a bar of at most four places, nothing of the provider's workspace. ADR 022. Avoid: client area, employee app, self-service.

**Client** (_client_): a company the organization serves. Avoid: customer, which is the organization.

**Lead** (_client potențial_): a company the organization hopes to serve and does not serve yet. An owner promotes it to a client, normally once its service contract is signed, and that cannot be undone; a lead that goes nowhere is archived. Only owners work with leads. ADR 007. Avoid: prospect, opportunity, offer.

**Stage**: how far a company has come with the organization: **lead**, then **client**. One record moves from the first to the second by promotion and never back. The interface never shows the word, only _clienți potențiali_ and _clienți_. Separate from whether the company is active or **archived**, which applies to both stages: an archived lead is restored as a lead. Avoid: status, which is kept for where a record stands in its own life (an employee's, a revision's, a client's being active or archived), and type or kind, which hide that one becomes the other.

**Service contract** (_contract de prestări servicii_): the agreement between the organization and a client for occupational safety services, and for fire safety where that is sold too. It has a place of its own, the client's Contract tab, which only owners see; it is drafted for a lead or for a client and signed outside the app. Not the employment contract behind a contract title.

**Certificate of authorization** (_certificat de abilitare_): what entitles an organization to act as an external prevention and protection service: a number, a date and the directorate that issued it. A service contract cites it and annexes a copy.

**Fire-safety technician** (_cadru tehnic PSI_): the person who carries the organization's fire-safety duties for its clients and signs the fire-safety set for the provider, where the specialist and the legal representative sign the occupational safety one. A name and a certificate kept on the organization; not a member role. Decision 5 of the fire-safety set appoints them for the provider under contract and prints their certificate, which the set requires. ADR 016, ADR 019. Avoid: PSI specialist, which collides with the member role, and _responsabil PSI_, which the old norms used.

**Fire-safety authorization** (_autorizația de cadru tehnic_): the inspectorate's authorization of a provider to act as fire-safety technician under contract, required by Legea 307/2006 art. 12^2 since OUG 17/2026. Optional text on the organization, as the provider writes it; decision 5 prints it when set and never asks for it. ADR 019. Avoid: certificate, which is the technician's own qualification, and _atestat_, which the norms use for firms that service equipment.

**Risk evaluator** (_evaluator de riscuri_): the person the organization names as coordinator of the risk evaluation in decision 1.2 and on the risk assessment: a name, a qualification printed after it and, optionally, a certificate, kept on the organization's Abilitări tab like the fire-safety technician; not a member role. Without one the documents name the member who generates, with the professional title from their profile, and the generation form says so without blocking. ADR 015, amendment of 2026-10-22. Avoid: specialist, which is the member who generates and still trains and signs.

**Employee** (_angajat_): a person employed by a client, assigned to a job position and to the workplace they work at. Avoid: worker, staff, user.

**Responsible person** (_persoană responsabilă_): someone who holds a role in a client's safety organization: workplace manager, first-aider, member of the risk evaluation team. One person can hold several roles. May or may not be an employee. A role is not a job position.

**Legal representative** (_reprezentantul legal_): the person who signs for a client, usually its administrator, kept as a name and a role on the client and printed in every decision. In a firm whose owner also works in it, the representative is **linked to an employee** (`legal_representative_employee_id`), and the documents, the responsible-person dialog and the trainers then treat the two as one person; without the link, the name match of ADR 010 is the fallback. Not a responsible-person role. Avoid: administrator on its own, which the client administrator also says.

**Client administrator** (_administratorul clientului_): the participant who runs a client's safety records on the employer's side, the administrator, the HR person or the legal representative, and sees the client's employees, their training states and their sheets, and the client's responsible persons. Not a responsible-person role and not a job position; may be an employee too. ADR 022. Avoid: HR, client user, manager, and administrator on its own, which the legal representative's role also says.

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

**Training held** (_instruire ținută_, the client's tab _Instruiri ținute_): one act of training at a client: in one domain, occupational safety or fire safety, of one phase, on a day, with a duration in minutes, the material taught as text, who trained and, where the form has that signature, who verified. Recorded once with the employees who attended; a hiring training has one attendee. ADR 021. Avoid: session, which is the planned one, event, and instructaj.

**Training record** (_instruire_, on an employee's page under _Instruire_): one employee's attendance at a training held, with the occupation printed for it, the name of their position at the time. What the individual training sheets print, one row each, and what the electronic signature will sign. The workplace training record also carries "admis la lucru". ADR 021. Avoid: attendance, training flag, completion.

**Training phase** (_tipul instruirii_): which of the law's trainings a training held is: **introductory general** (_introductiv-generală_), **workplace** (_la locul de muncă_), **periodic** (_periodică_) or **supplementary** (_periodică suplimentară_), the last with its reason among the cases of HG 1425/2006 art. 98. The first two are the **hiring trainings**. ADR 021. Avoid: kind, level, instructaj introductiv.

**Signer slot** (_rubrica de semnătură_): a role on a training record that a signature fills: the trainee, the trainer, the verifier, the person who admits to work, labelled **Instruit**, **Instructor**, **Verificator** and **Admite la lucru** wherever the app and the portal name them. Fixed per domain and phase: the fire-safety sheet has no verifier and no admission signature, so its records have the trainee and the trainer only. Proposed as the people the app holds, replaceable with who actually trained. ADR 021, ADR 023. Avoid: signature, which is what fills it, and _semnatar_, which is the person.

**Advanced electronic signature** (_semnătură electronică avansată_): the signature the app makes itself: a PAdES signature in a PDF, under a certificate the app issues to the signer, created only after a fresh code proves the signer holds their address, and backed by an evidence row. The level of eIDAS art. 26, accepted on the training sheet by HG 1425/2006 art. 81. ADR 023. Avoid: digital signature, qualified signature, which needs a trust service provider, and e-signature on its own.

**Signer** (_semnatar_): the member or participant a signer slot is addressed to. A slot whose person has no account is a **paper slot**, signed by hand: a member marks it so with the name printed on the sheet, typed, and may mark any slot paper, a pending one included. ADR 023. Avoid: signer for the slot itself, which is the signer slot.

**Signing identity** (_identitatea de semnare_): a signer's key pair and certificate, made by the app at their first signature, under the account's own name, and reissued at expiry or when the authority or the key-encryption key is replaced. A reissue adds an identity and keeps the earlier ones, so every signature's certificate stays on record. Never shown to the signer. ADR 023. Avoid: certificate on its own, which is half of it.

**Signing session** (_sesiune de semnare_): one act of signing: the list on the signer's screen, at most 30 items, one fresh code to their address, and the signatures it creates, one per listed item. The code signs only what was listed when it was asked for. ADR 023. Avoid: batch, which does not say a code was involved.

**Signed sheet** (_fișa semnată_): an individual training sheet once it is stored for signing: the PDF with its cells as form fields, stored at the first signature on it and certified by that signature, grown by one filled row per training and signed row by row, continued on a second sheet when full. Each version is a file of its own. What the signatures are in; the on-demand sheet stays for the unsigned. Never PDF/A. ADR 023. Avoid: signed record, which was the one-page-per-training draft.

**Signature request** (_cerere de semnare_): one slot of one record addressed to one signer, pending until signed or void. Issued when the training is saved, told to the signer once per save, voided when the record or the signer changes. ADR 023. Avoid: task, envelope.

**Signing agreement** (_actul adițional privind semnarea electronică_; in the interface's running text _actul adițional_): the addendum to an employee's employment contract by which they agree to sign training records electronically, kept with the employee's documents. The employee signs it first, in the portal, where it awaits them from their first sign-in, and the client administrator then countersigns it for the employer; or both sign it by hand. It is `generated`, `signed_electronically`, `signed_on_paper`, `withdrawn` once the employee asked in writing to sign by hand again, or `in_contract` for a new hire whose contract holds its clause instead. Unsigned, it warns and does not block. The employer's side of the choice is the **annex to the regulament intern**, document 13 of the SSM pack, which applies to a client with participants. ADR 023. Avoid: consent, which GDPR means differently, signing consent, and act adițional de semnare.

**Frozen record** (_instruire înghețată_): a training record with a live electronic signature: what its row prints, the training's day, duration, material and names and the record's occupation and admission, cannot change, and neither it nor its training can be deleted while any signature row exists. A paper signature does not freeze. The way out is a void. ADR 023. Avoid: locked, which is what a signature does to the fields of its row in the PDF.

**Void** (_anulare_): undoing a record's signatures and requests with a reason: the row stays on the sheet as signed, its note reads _anulat_, the evidence rows stay marked void, and the corrected record takes the next empty row and is requested again. The app voids by itself, with a reason of its own, a pending request whose record changed (`record_changed`), whose signer changed (`signer_changed`) or became a paper slot (`paper`), whose signer left (`signer_left`), whose client was archived (`archived`), and an employee's pending requests once their agreement is withdrawn (`withdrawn`). ADR 023. Avoid: delete, cancel and revoke, which a participant's access uses.

**Semnături**: the place, in the app and in the portal, that lists the requests waiting for the person signed in, and in the client administrator's places the client's unsigned records. ADR 023. Avoid: inbox, tasks.

**Reading copy** (_copie de citire_): the merged PDF of an employee's sheet and its continuation sheets, made for reading and printing. It carries no valid signature: the signed originals are the stored sheets, served one per sequence. ADR 023. Avoid: signed copy, which is a returned contract.

**Next training due** (_termenul următoarei instruiri_): the day the last periodic training record, else the workplace training record, else the hire date, gives when the interval of the employee's position or staff category is added; computed per domain, never stored; none before a hiring training is recorded. A supplementary training does not move it. Its **training state** (_starea instruirii_): _neinstruit_ with no hiring training recorded, _la zi_, _scadentă_ within the next thirty days, _depășită_ once passed; none for a leaver. ADR 021. Avoid: expiry, deadline, which prevention measures have, and trained as a yes or no.

**Commute** (_traseul de deplasare_): the route an employee takes between home and work, as free text, and its duration in minutes. Kept on the employee, optional on the form, required by the occupational safety sheet, which prints it: an accident on the normal route and within its normal duration is a work accident (Legea 319/2006 art. 30). ADR 021. Avoid: route declaration, which is the paper habit the sheet replaces.

**Knowledge test** (_test de verificare a cunoștințelor_): one of three the law asks for: the **hiring test** (_testul la angajare_) of each domain, which closes the hiring trainings (HG 1425/2006 art. 89; OMAI 712/2005 art. 14 and 20), and the fire-safety **annual test** (_testul anual_, OMAI 712/2005 art. 30). A **sitting** (_o susținere_) in the portal is ten of the test's active questions, drawn at random and shuffled; the printed test of the set prints them all. There is no periodic occupational safety test. ADR 024. Avoid: quiz, exam, and testare periodică SSM, which the law does not ask for.

**Question bank** (_banca de întrebări_, the sidebar entry _Teste_): the organization's library of **test questions** (_întrebări_), each of one domain and one test, with its options, which of them are correct, an optional **explanation** (_explicație_) in plain words and an optional citation of the article it rests on. **Built-in questions** (_întrebări predefinite_) are the app's, read by every organization, edited by none, and **hidden** per organization; **own questions** (_întrebări proprii_) are the provider's, beside them. A test keeps at least ten active questions. The content is the provider's. ADR 024. Avoid: template, question library, and test for the bank itself.

**Pass mark** (_pragul de promovare_): 70%, seven of a sitting's ten questions answered fully right. Retakes are free and immediate, drawn and shuffled again each time. ADR 024. Avoid: threshold, score when the mark is meant.

**Test attempt** (_încercarea_): one sitting of a test by a participant in the portal: the questions and options as shown, the answers chosen, the score, whether it passed, when, and from where. Saved answer by answer, so that it resumes where it stopped, and frozen at the finish. ADR 024. Avoid: submission, session, which is a signing session.

**Test result** (_rezultatul testării_): a pass, from a passing attempt or from the printed test (_de pe hârtie_): the day, the material examined, the grade _admis_ and the **examiner** (_examinatorul_), the specialist or the fire-safety technician by default. What the occupational safety sheet prints in its test block and the fire-safety sheet prints as a periodic row. ADR 024. Avoid: grade on its own, which is one column, and score, which is the attempt's.

**Test sheet** (_fișa de test_): the PDF of a passing attempt, the questions with the answers chosen, the score and the grade, signed by the trainee and the examiner through the signing pipeline and kept with the employee's documents. ADR 024. Avoid: test document, which is the printed test of the set, and certificate.

**Test state** (_starea testării_): per employee and domain, computed, never stored: _fără test_ before a hiring training is recorded, _de susținut_ while a test awaits, _promovat_ once passed, _anual scadent_ once twelve months have passed since the last fire-safety pass; none for a leaver. A test awaits by itself, from the hiring training record or from the date; nothing is sent. ADR 024. Avoid: tested as a yes or no, assignment.

**Study card** (_ce trebuie să știi_): the screen before a test in the portal: the explanations of the test's questions that have one, and the issued material the test closes. ADR 024. Avoid: course, lesson.

**Own instructions** (_instrucțiuni proprii_, IPSSM): the document of the set that binds the client's workers: a **common part** the app generates, which lists as **annexes** the instruction modules the client's positions apply. Its Word file is the common part; its issued PDF is the common part and the annexes in one file, each module after an **annex title page** that names it "Anexa N" (the module's own file is never written to). ADR 012. Avoid: bound document, assembled document.

**Fire-safety own instructions** (_instrucțiuni proprii în domeniul situațiilor de urgență_, IPSU): the fire-safety set's own instructions: one built-in text the same for every client but its name, made of the norms' general chapters, which lists as **annexes** the PSI instruction modules the client's positions apply, as the own instructions annex the SSM ones: its Word file is the general chapters, its issued PDF adds each module after an annex title page ("Anexa N", "I.P.S.U."). What is specific to a workplace is also printed by the posted instructions and the posted workplace sheet. ADR 019, ADR 012 amended 2026-10-11. Avoid: own instructions on its own, which is the occupational safety document (IPSSM), and PSI instructions.

**Allocation mode** (_mod de acordare_): how an item reaches the worker: **personal inventory** (_inventar personal_), issued and replaced when its duration runs out; **section inventory** (_inventar de secție_), kept at the workplace and shared; or **consumable** (_consum_), used up and restocked, with no duration. Avoid: type of issue, ownership.

**Risk evaluation** (_evaluarea postului_): the record of one evaluated work system by the I.N.C.D.P.M. method: its risk factors with their classes and prevention measures. One per job position; a client also holds evaluations that are not posts, the **sensitive groups** when it employs them (otherwise it declares it has none, its **sensitive groups state**) and others by name. Both the risk assessment and the prevention plan are generated from it. ADR 015. Avoid: risk assessment for the record, which is the document.

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

**Client file** (_fișier_): a file about a client that the app did not write: uploaded, named, downloaded, deleted. Has no revisions and no type. An owner can keep one **for owners only**. A lead has them too. One can belong to an employee, such as the photograph of a paper training sheet, shown on their page only; the client's own list holds the files of no employee (ADR 021). ADR 013. Avoid: document, which the app generates and issues, and attachment.

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

**Behind** (_în urmă_): a document whose newest revision was generated from an older template version of a kind that prompts regeneration, or, for the own instructions and the training themes of either set, built from instruction module versions the library has since replaced or citing another set of modules than the client's positions apply (ADR 014, amendment of 2026-10-22). Decided by the versions and the applied modules alone, never by the document's edits; an issued revision counts as much as a draft. Avoid: outdated, stale (kept for a draft whose data changed).

## Product feedback

**Problem report** (_raportare a unei probleme_): a member's account of app UI or behavior that failed or behaved unexpectedly. A question, feature idea, or concern about generated document content is not a problem report.

## Releases

**Release** (_versiune_): a commit on `main` tagged with the date it was deployed to production, `2026.10.23`, or `2026.10.23.2` for a second one that day. The app prints it as "Versiune 2026.10.23". ADR 025. Avoid: deploy or deployment (which non-prod also gets, without a tag), version number.

**Update** (_actualizare_): what members read about one release: a **headline** (_titlu_), a **lead** (_rezumat_), and items under **Ce e nou** (new features, each with where to find it), **Îmbunătățiri** (improvements) and **Remedieri** (fixes), in Romanian and written for the specialist. The feature that shows them is **Actualizări**. A release with nothing a member sees is **silent** (_fără actualizare_). ADR 026. Avoid: changelog, release notes (the developer list on the GitHub release), news or _noutăți_, what's new, patch notes.

**Unread** (_necitită_): a release published after the member's account was created and after the release they last **acknowledged** (_am înțeles_, _marcată ca citită_). Acknowledging covers everything published so far. ADR 026. Avoid: new (which is a section), seen, dismissed (closing the dialog dismisses it for the session and acknowledges nothing).

## Imports

**Import** (_import din documente_): a client's files read by a model into a proposal that a member reviews and confirms. A **client import** reads a documentation pack and creates a client or completes an existing one; an **employee import** (_import din fișe_) reads photographs of individual training sheets into employees and their training records. One client per import. ADR 030. Avoid: migration, upload (which is one step of it), AI import, scan.

**Proposal** (_propunere_): what an import's reading returns: every value with the file and the quote it came from, the choices where documents disagree, and what is missing. Nothing of it is written until the member confirms. ADR 030. Avoid: draft (which is a document's revision), suggestion, extraction.

**Source** (_sursa_): the file and the passage a proposed value came from, shown in the file itself. ADR 030. Avoid: evidence, citation (which is a template quoting a legal act).

**Possibly from another client** (_posibil de la alt client_): a proposed value found only in passages copied from another company's documents, proposed unticked. ADR 030. Avoid: wrong data, error.

**Import folder** (_dosar importat_): the files of a confirmed import in "Alte documente", grouped under the day of the import with the upload's folders. ADR 030. Avoid: archive, which is what an archived client is.

**Credit** (_credit_): the unit an import's reading is counted in, one for both imports, included monthly with a plan or a trial. ADR 030. Avoid: token, which is the model's unit, and import as a unit.

## Billing

**Plan** (_plan_): what an organization pays for: **Start**, **Profesional** or **Enterprise**. A plan sets scale and team (employees, members, SMS codes), never which documents, trainings or signatures exist. ADR 029. Avoid: tier, package, which is an add-on.

**Pack** (_pachet_): an add-on bought on top of a plan: 50 or 500 more employees, or one more member. Never added on the owner's behalf. ADR 029. Avoid: add-on in the interface, upgrade.

**Trial** (_perioadă de probă_): the first 30 days of a new organization, with what Profesional includes except SMS, and no card. A tester's is extended, never discounted, and may include SMS. ADR 029. Avoid: free plan, demo.

**Subscription** (_abonament_): an organization's plan, billing interval, status and dates, kept in our database and mirrored by Stripe once a plan is chosen. An organization without one has full access indefinitely. ADR 029. Avoid: account, license.

**Access** (_acces_): what an organization may do, derived from its subscription's dates: **full**, then **read-only** (_doar citire_) for 30 days after a trial, a paid period or a failed payment ends, then deleted. ADR 029. Avoid: suspended, locked, frozen (which archived clients are).
