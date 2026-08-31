# SSM Ușor — Product Scope

Status: working product brief  
Last updated: 31 August 2026  
Audience: founders, product, design, engineering, SSM/SU specialists, and legal/compliance reviewers

> This document defines a product direction, not a legal opinion. Romanian SSM, employment, electronic-signature, fire-safety, and archival requirements must be validated by qualified specialists before implementation and before each production release.

## 1. Executive summary

SSM Ușor should be a multi-tenant operating system for Romanian external prevention and protection services (_servicii externe de prevenire și protecție_, abbreviated below as “external SSM providers”). It should help one provider manage many client companies, their workplaces, employees, recurring obligations, documentation, training, signatures, visits, findings, and evidence from one portfolio-level workspace.

The product should not begin as a generic HR system or as an AI that claims to “do compliance.” Its strongest initial promise is:

> An external SSM provider can run every client’s work from one system—creating, editing, reviewing, issuing, signing, and maintaining the necessary records without moving documents through Word, PDF tools, email, and paper.

The first release should prove one complete loop:

1. onboard a provider and a client company;
2. import and organize workplaces, roles, and employees;
3. determine and schedule the recurring work that has been configured by the SSM specialist;
4. generate, edit, review, and approve controlled documents in the platform;
5. deliver training and tests remotely;
6. collect signatures through an appropriate trust-service provider;
7. chase incomplete work automatically;
8. record visits, findings, and corrective actions;
9. export a traceable client/employee evidence pack.

Evacuation-plan authoring, risk-assessment engines, accident investigation, and AI-proposed document changes are valuable extensions, but should not delay validation of this core loop.

### Confirmed product direction

The following decisions are now treated as settled unless new customer evidence contradicts them:

- the paying customer and product center is the external SSM provider, not an individual employer;
- each provider must be able to manage clients from many industries in the same workspace;
- the long-term product is a one-stop system of work for the external service;
- the document studio is a core product pillar and initial wedge, not a later accessory;
- the platform should eliminate the routine Word → PDF → email → signature tool → archive workflow for the supported document set.

“One-stop” describes the product destination and the unity of the workflow. It does not mean shipping shallow versions of every SSM/SU capability in the first release. Modules can be added progressively while sharing the same client data, document model, permissions, tasks, and evidence trail.

## 2. Product thesis

### 2.1 The problem

External SSM providers commonly coordinate work across many legal entities, workplaces, responsible managers, and employee populations. The work is recurrent, event-driven, evidence-heavy, and split between the provider and the employer. Typical failure modes include:

- employee lists diverging between HR, the client, and the SSM provider;
- recurring training or medical/authorization deadlines being tracked in spreadsheets or calendars;
- repeated manual replacement of the same company and employee data in documents;
- specialists editing a Word file, exporting a PDF, circulating it by email, signing it in another product, and filing it in yet another location;
- client-specific changes being copied into documents with no reliable connection back to the shared template;
- unclear responsibility for the next signature, approval, visit, or corrective measure;
- multiple versions of instructions and training topics with weak traceability;
- paper collection and physical travel becoming the operational bottleneck;
- evidence for an ITM/ISU control being assembled under time pressure;
- legislative changes being discovered late or interpreted without a clear impact trail;
- the owner of the external service lacking a portfolio view of workload, risk, and service quality.

### 2.2 The proposed solution

SSM Ușor combines four products in one controlled system:

- a **provider operations workspace** for managing many clients, obligations, visits, assignments, and corrective work;
- a **specialized SSM document studio** for authoring, generating, editing, reviewing, rendering, signing, and revising provider and client documents without leaving the platform;
- a **compliance evidence platform** for document versions, approvals, training, testing, signatures, and exports;
- a **client and employee portal** for supplying data, completing assigned actions, signing documents, and viewing relevant records.

Later, a fifth layer—the **legislation and document intelligence assistant**—can monitor authoritative sources, map changes to affected clients and documents, and propose review tasks with citations. It must remain decision support for an authorized human specialist.

### 2.3 Product principles

1. **Provider-first, employee-simple.** The buyer needs portfolio control; the employee should need almost no training to complete an assignment.
2. **Evidence before convenience.** Every important action needs actor, time, version, result, and provenance.
3. **Human responsibility remains explicit.** Automation can prepare and route; the authorized specialist and employer approve.
4. **Configuration, not opaque legal inference.** The system applies reviewed rules and templates and shows why an obligation exists.
5. **One source, many outputs.** Company, workplace, role, risk group, and employee data should flow into documents, training, tasks, and reports.
6. **Structured authoring over file shuffling.** Documents should be editable business objects with fields, clauses, responsibilities, and lifecycle—not opaque files passed between disconnected tools.
7. **Mobile web first for participants.** Employees and managers should complete simple actions from a phone without requiring a native app.
8. **Interoperability over lock-in.** Structured import, DOCX/PDF export, provider abstraction, and an API should be part of the architecture even when delivered later.

## 3. Target market and positioning

### 3.1 Primary customer

The target customer is an authorized Romanian external SSM provider. Its client portfolio may span multiple industries, risk profiles, company sizes, and workplace types. SSM Ușor should be sold to the provider as its system of work, not sold as separate software for each industry.

The target provider:

- manages multiple client companies;
- currently relies on a mix of Word templates, spreadsheets, email, messaging, cloud folders, and paper;
- sells recurring SSM and usually some SU/PSI services;
- wants to increase clients per specialist without weakening service quality;
- needs a credible digital process for remote or distributed workforces.

The product architecture should therefore support heterogeneous client portfolios from the beginning. Industry-specific rules, clauses, checklists, and document packs should be modular content layered on the same provider, client, employee, task, document, training, and evidence model.

This does not require the first release to ship expert content for every Romanian industry. The platform can be cross-industry while the reviewed template library grows in controlled packs. Providers must also be able to import and maintain their own specialized documents for industries the platform library does not yet cover.

### 3.2 Product position

**Category:** vertical SaaS / external-provider operating system and document automation platform.  
**Buyer:** external SSM provider owner or operations lead.  
**Daily user:** SSM/SU specialist or technician.  
**Participants:** client administrator/HR, workplace manager, employee, auditor/inspector.

Recommended positioning:

> Create, edit, deliver, sign, and manage every client’s SSM work from one place.

### 3.3 What makes this different

Electronic training, signatures, templates, and employee files are already market expectations. The differentiation should be the operating layer around them:

- one continuous document workflow replacing Word editing, PDF export, email circulation, third-party signing, and manual filing;
- a provider-owned template and clause system that supports client and industry variations without copy-paste forks;
- portfolio-level view across all client organizations;
- explicit responsibility split between external provider and employer;
- service contracts and configured deliverables tied to operational tasks;
- field visits, observations, findings, measures, evidence, and follow-up;
- controlled client requests and data collection;
- workload and exception management for the provider team;
- legislation-change impact review across clients and document versions;
- fast, well-structured migration from existing Word/PDF/Excel archives.

### 3.4 The document studio as the product wedge

Document work is not a supporting utility; it is the daily surface through which the provider delivers much of its value. The document studio should connect professional authoring with operational data and evidence.

The intended lifecycle is:

```text
Provider template or imported DOCX
        ↓
Reusable clauses + variables + conditional sections
        ↓
Generated client-specific draft
        ↓
Specialist edits + comments + proposed changes
        ↓
Internal/client review and approval
        ↓
Deterministic PDF rendering
        ↓
Ordered electronic signatures
        ↓
Locked revision, distribution, retention, and later review
```

The goal is not to reproduce every Microsoft Word capability. It is to provide the subset external SSM specialists repeatedly need, with much stronger structure and automation:

- headings, paragraphs, lists, tables, images, page breaks, headers/footers, and numbered sections;
- variables populated from provider, client, workplace, role, and employee records;
- reusable clause library and industry/client-specific content blocks;
- conditional sections selected by the specialist or deterministic reviewed rules;
- comments, suggestions, comparison, and approval history;
- client-specific editing without silently changing the provider template;
- controlled propagation: publishing a template revision identifies affected documents and creates review drafts rather than overwriting issued records;
- accurate PDF preview, page layout, and signature placement;
- DOCX and PDF export so customers retain ownership and can handle exceptional work outside the platform.

The durable advantage is the connection between the document and the rest of the system. A workplace address changes once; the specialist sees which drafts can be refreshed and which signed documents require review. A training topic links to the exact approved instruction revision. A legal change creates an impact queue against clauses and document versions instead of a generic chatbot answer.

## 4. Users and jobs to be done

### 4.1 Provider owner / operations manager

Needs to know which clients are healthy, which obligations are late, where the team is overloaded, and whether contracted work is being delivered.

Key jobs:

- configure service packages and responsibility boundaries;
- assign specialists and substitute coverage;
- see overdue work and upcoming workload across clients;
- standardize templates while allowing controlled client variants;
- review service performance and export client reports.

### 4.2 SSM/SU specialist

Needs to perform and prove professional work with less repetitive administration.

Key jobs:

- maintain the client structure, roles, risk groups, and document inventory;
- generate, upload, review, approve, and revise documents;
- schedule training and test sessions;
- perform visits/audits and issue corrective measures;
- triage legislation changes and decide which documents require review;
- prepare evidence for a control or incident.

### 4.3 Client administrator / HR contact

Needs a clear list of data and actions owed by the employer.

Key jobs:

- provide or update employee and workplace data;
- initiate joiner, mover, leaver, and return-from-suspension events;
- nominate responsible persons and approve documents;
- see incomplete training, signatures, and corrective actions;
- download records belonging to the company.

### 4.4 Workplace manager / conducător al locului de muncă

Needs to deliver or verify the parts of the process assigned to the employer and supervise the team.

Key jobs:

- see direct reports and pending actions;
- perform/confirm workplace-specific instruction where applicable;
- verify knowledge and sign the correct version of the record;
- close corrective measures with evidence.

### 4.5 Employee / contractor / visitor

Needs a short, clear, mobile flow.

Key jobs:

- open an invitation securely;
- consume assigned material in the required order;
- complete a test and see whether another attempt is permitted;
- review and sign the resulting document;
- access personal records that the employer makes available.

### 4.6 Auditor / inspector / client reviewer

Needs scoped, read-only, time-limited access or a verifiable export without browsing unrelated personal data.

## 5. Core domain model

The product should model the domain explicitly rather than hiding it in folders:

```text
External provider tenant
├── Team members and roles
├── Service packages, contracts, and responsibility matrix
└── Client organization
    ├── Legal entity and contacts
    ├── Workplaces / points of work
    │   ├── Departments
    │   ├── Responsible managers
    │   └── SSM posts / groups of roles with similar exposure
    ├── Employees / contractors / visitors
    │   └── Employment or workplace assignment history
    ├── Obligations, tasks, visits, findings, and measures
    ├── Document inventory
    │   ├── Template and template version
    │   ├── Client document and revision
    │   └── approval / signature workflow
    ├── Training program, session, assignment, attempt, and result
    ├── Equipment / PPE / authorization records (later)
    ├── Floor plans and evacuation-plan revisions (later)
    └── Applicable legal profile and impact reviews (later)
```

Important modeling decisions:

- A person and an employment/assignment are separate so history is preserved across moves, suspensions, and rehires.
- A COR occupation and an SSM “post” or exposure group are separate; several COR occupations may share a reviewed instruction set.
- A document template, a generated client document, and a signed immutable revision are separate records.
- A due date always has a source: configured recurrence, employee event, document validity, finding, contract deliverable, or legislation review.
- A “compliant” status is not a single magic flag. The interface should expose the underlying completed, missing, expired, blocked, or awaiting-client evidence.

## 6. Scope of the first commercial release

### 6.1 Provider workspace and multi-client management — Must

- Create and manage multiple client organizations under one provider tenant.
- Store legal entity details, workplaces, contacts, service status, contract period, and configured service package.
- Assign a primary specialist and collaborators per client.
- Define a simple responsibility matrix: provider, employer administrator, workplace manager, or shared.
- Portfolio dashboard with upcoming, overdue, blocked, and awaiting-client items.
- Client health view based on transparent underlying exceptions, not an unexplained score.
- Global search and filters by client, site, owner, due date, and status.
- Strict tenant isolation and client-scoped permissions.

Minimum acceptance outcome: a provider manager can answer “what must my team or my clients do this week?” without opening every company.

### 6.2 Client structure and employee management — Must

- Legal entity, workplace, department, manager, COR occupation, and SSM post/exposure group.
- Employee record with only the personal and employment fields needed for configured workflows.
- Manual entry and CSV/XLSX import with preview, validation, duplicate detection, and error report.
- Bulk update and effective-dated joiner, mover, suspension/return, and leaver events.
- Employee status history; leaving must not destroy completed evidence.
- Reconciliation report between a new import and existing data.
- Invitations and reminders by email; SMS/WhatsApp only after consent, cost, and provider evaluation.
- Romanian-first interface with diacritics and correct date/time handling.

Product note: as of 1 January 2026, REGES-ONLINE replaced REVISAL. The product should call the import “employee import” until an officially supported REGES-ONLINE export or API integration has been verified; it should not market a “Revisal integration.”

### 6.3 Obligation calendar and task engine — Must

- Rules configured by an authorized specialist for a client, workplace, SSM post, or document type.
- Recurring tasks and event-triggered tasks for employee or workplace changes.
- Due date, owner, responsibility, priority, status, evidence, comments, and audit trail.
- Dependencies and blocked status, especially “awaiting client data/approval.”
- Automated reminders and escalation rules.
- Calendar and list views plus iCalendar export.
- Reusable service-package checklist applied during onboarding.

The MVP rules engine should be deterministic and reviewed. It should not infer legal applicability from a company name or CAEN code without human confirmation.

### 6.4 Document studio, control, and generation — Must

- Client document inventory showing present, missing, draft, awaiting approval/signature, approved, superseded, expiring, and expired.
- Upload existing DOCX/PDF/image files and preserve the original source.
- Convert supported DOCX structures into an editable platform draft, with an import report that identifies unsupported or visually changed content.
- Create provider-wide templates and reusable clause/content-block libraries.
- Organize templates and clauses into optional industry, activity, hazard, service, and client packs without hard-coding the entire application by industry.
- Edit headings, paragraphs, numbered sections, lists, tables, images, page breaks, headers/footers, and basic page layout in the browser.
- Insert typed merge fields for provider, client, workplace, manager, post, and employee data, with clear indication of source and any document-specific override.
- Add specialist-selected or deterministic conditional sections, with every included/excluded condition visible during review.
- Generate individual and bulk documents from the same versioned template.
- Allow a generated client draft to be edited without changing the shared provider template.
- Support comments, suggested changes, assigned reviewers, comparison between revisions, and recorded accept/reject decisions.
- Draft → internal review → client approval → signature → final/locked lifecycle.
- Revision history with author, reason, effective date, validity, approvers, and superseded version.
- When a template or reusable clause changes, identify potentially affected client documents and create review tasks; never overwrite an issued or signed revision.
- Configurable signature order and participants.
- Deterministic PDF rendering with page preview and supported signature-placement anchors.
- DOCX export for continued interoperability and PDF export with checksum/hash for final evidence.
- Download one document or a structured ZIP evidence pack.
- Full audit log for generation, viewing, approval, sending, signing, rejection, and export.

Minimum acceptance outcome: for a document inside the supported layout subset, the specialist can move from template to final signed PDF without opening Word, a desktop PDF tool, email, or a separate signing portal.

Initial template scope should be agreed with a domain specialist. Recommended first set:

- SSM/SU training themes and programs;
- individual training records for the supported training types;
- annual knowledge-testing record;
- a small set of high-frequency decisions and declarations;
- document receipt/acknowledgement records;
- visit report and corrective-action report.

Existing risk assessments, prevention and protection plans, internal instructions, medical fitness sheets, authorizations, and fire-safety documents can initially be imported or uploaded, versioned, assigned validity, and included in the evidence inventory. Providers can use the studio for any document that fits the supported authoring model, but the platform will not initially claim to generate legally complete professional content for every document and industry.

### 6.5 Remote training and testing — Must

- Build a training program from text, PDF, image, and video lessons.
- Assign by client, workplace, department, SSM post, employee status, or selected people.
- Create a session with availability dates, deadline, required order, and reminders.
- Question bank with single/multiple choice, randomization, pass threshold, attempt limit, and configurable feedback.
- Capture material version, invitation, access events, time spent, answers, score, attempts, completion, and signer events.
- Generate the correct training record from the completed session.
- Accessible mobile-web employee flow and resume capability.
- Manager/provider dashboards for not started, in progress, failed, passed, and signed.
- Manual exception flow for people without email or reliable digital access.

Out of the first release: webcam proctoring, biometric identification, and AI judging free-text answers.

### 6.6 Electronic signature and evidentiary record — Must

- Integrate one qualified trust-service provider through a provider abstraction layer.
- Support the signature type and signing sequence approved for each document category.
- Preserve the final PDF, signature validation result, certificate metadata supplied by the provider, trusted time information, document hash, signer, and workflow audit trail.
- Verify status on callback and make failed, declined, expired, and cancelled states explicit.
- Allow bring-your-own qualified certificate later; do not require it for MVP unless demanded by the pilot.
- Provide a verification page/report for an exported signed document.
- Keep signature costs visible to the provider tenant.

Do not build a custom OTP click flow and market it as an advanced or qualified signature. The platform should orchestrate a regulated provider’s signing flow and obtain specialist legal review of each production use case.

### 6.7 Visits, findings, and corrective measures — Must, basic version

- Schedule a client/workplace visit and assign a specialist.
- Mobile-friendly visit checklist with notes and photos.
- Record an observation or nonconformity, severity, responsible party, due date, and recommended measure.
- Request client response and closure evidence.
- Provider review before final closure.
- Generate and sign a visit report.
- Show overdue measures in the client and portfolio dashboards.

Offline capture, custom audit-form builders, and advanced scoring can follow after the first release.

### 6.8 Notifications, reporting, and control pack — Must

- Configurable email templates, reminders, digest frequency, and escalation.
- Dashboard and export for training completion, unsigned documents, expiring/missing documents, open measures, and overdue tasks.
- Client monthly/quarterly activity report showing completed services and open items.
- Employee dossier export.
- ITM/ISU control data room or time-limited read-only link only after privacy and authorization design review; structured export is sufficient for MVP.
- Audit log export and signature verification evidence.

### 6.9 Administration, security, and privacy — Must

- Roles at provider, client, workplace/department, participant, and read-only audit levels.
- Mandatory MFA for provider users and configurable MFA for client users.
- Least-privilege access and explicit support-access workflow.
- Encryption in transit and at rest, managed secrets, malware scanning, and secure file preview.
- EU/EEA data residency preference and documented subprocessors.
- Automated backups, restore tests, disaster-recovery procedure, and defined RPO/RTO before paid launch.
- Append-only security/audit events with retention controls.
- Data-processing agreement support, privacy notices, data-subject request tooling, retention/anonymization rules, and export on contract termination.
- No sensitive document or personal data in application logs, analytics payloads, or AI prompts by default.

## 7. Explicitly outside the first release

- General-purpose HR, payroll, time tracking, recruiting, or REGES-ONLINE reporting.
- Automated legal determination that a company is compliant.
- Automatic generation of a complete risk assessment without specialist work.
- Full accident investigation and official reporting workflow.
- CAD/BIM-grade floor-plan creation or automatic interpretation of architectural drawings.
- Native iOS/Android applications.
- Multiple signature or qualified-archive providers.
- Marketplace for third-party templates or consultants.
- Provider invoicing, accounting, payment collection, or full CRM pipeline.
- Equipment maintenance, PPE stock, medical-clinic integration, and contractor permit-to-work workflows.
- Public API beyond the endpoints required by the first integrations.
- Pixel-perfect import and editing of every Microsoft Word feature, including macros, embedded applications, complex floating layouts, and arbitrary legacy formatting.

These exclusions are sequencing decisions, not a judgment that the features lack value.

## 8. Product phases after the first release

### Phase 0 — Discovery and legal design

Release gate: evidence that the workflow and buyer are real before committing to a broad build.

- Interview at least 8 external providers of different sizes and shadow 3 real recurring workflows.
- Interview at least 5 client administrators/managers and test the employee invitation flow with 10 participants.
- Collect anonymized examples of the actual spreadsheets, folders, document packs, visit reports, and training records used today.
- Map responsibility for every proposed signature and approval with a Romanian SSM specialist and employment/e-signature counsel.
- Select one trust-service provider and validate price, onboarding, identity, callback, evidence, sandbox, and volume limits.
- Choose a representative provider cohort and agree the initial document set and supported editor layout subset.
- Test document migration using real provider Word templates from at least three different client industries.

### Phase 1 — Core commercial release

Contains the scope in section 6. Pilot with 2–3 external providers, then expand when the release gates in section 14 are met.

### Phase 2 — Operational depth

- configurable audit/checklist builder and offline visit mode;
- incident and near-miss intake, investigation tasks, and accident registers;
- medical fitness document import/OCR with human verification and expiry tracking;
- competencies, authorizations, PPE issuance, equipment checks, and drill records;
- contractor and visitor induction;
- more trust-service and qualified-archive integrations;
- HR/ERP API and webhooks;
- provider capacity, contract deliverable, and profitability views;
- client self-service request and secure messaging center.

### Phase 3 — Evacuation and fire-safety plan authoring

Treat this as a specialist authoring product, not as a generic drawing canvas.

- upload a source PDF/image/DWG-derived background;
- establish page, floor, orientation, and scale metadata;
- controlled symbol library for exits, routes, extinguishers, hydrants, alarm/manual call points, first aid, hazards, “you are here,” and assembly points;
- route and zone drawing with snap, layers, legend, title block, and print-safe colors;
- validation checklist for missing legend, destination, route continuity, or outdated floor revision;
- A4/A3 and larger PDF export with version, author, approver, and approval date;
- link each plan revision to a workplace and display location;
- comparison and required-review workflow when the layout changes.

AI may assist with symbol suggestions or source-plan cleanup later, but a qualified person must validate the plan. The platform must not claim that an automatically generated route is safe or legally sufficient.

### Phase 4 — Legislation and document intelligence

Build in controlled increments:

1. **Curated legislation library:** authoritative source, act identifier, publication/effective dates, consolidated-history metadata, topics, and links.
2. **Search with citations:** answer only from the controlled corpus and quote the exact provision/context used.
3. **Legislation watch:** detect a new or amended act, generate a structured diff, and open an expert review task.
4. **Applicability mapping:** specialists maintain mappings from legal provisions to configured activities, hazards, workplaces, document types, and service rules.
5. **Impact queue:** show potentially affected clients, templates, and document revisions with confidence and rationale.
6. **Document review assistant:** suggest a redline against a controlled template or client document; never publish or replace a document automatically.
7. **Approval and provenance:** reviewer accepts, edits, rejects, records rationale, and publishes a new version through the normal approval/signature workflow.

Required safeguards:

- prefer official Romanian and EU sources; show source URL, retrieval time, act version, provision, and effective date;
- never hide uncertainty or infer an obligation solely from free-form company data;
- no silent template or client-document changes;
- isolate client documents from general model training and apply strict retrieval authorization;
- evaluate citation correctness, change recall, false-positive rate, and reviewer agreement before expanding access;
- state clearly that answers are specialist decision support, not legal advice.

## 9. Market viability assessment

### 9.1 Current verdict

The opportunity is credible, but the market should be described as **underserved by a deeply integrated provider workflow**, not as having no competitors.

Current qualitative confidence: **6.5–7 out of 10**, before primary customer discovery.

- The likelihood of building a useful product and winning the first 10–20 paying external providers is reasonably high if the team has direct domain access, assisted migration, and a reliable document-to-signature workflow.
- The likelihood of building a sustainable Romania-focused vertical SaaS business is moderate and attractive.
- The likelihood of a very large venture-scale outcome from Romania alone is lower; expansion into adjacent compliance modules or other EU jurisdictions may eventually be required.

This score should move materially only after observed workflow evidence, paid pilots, retention, and provider-level economics—not after more desk research.

Subjective outcome ranges under competent execution, direct access to providers, and no major adverse legal change:

| Outcome                                            | Current subjective likelihood |                         Time horizon |
| -------------------------------------------------- | ----------------------------: | -----------------------------------: |
| Five paying design partners using real client data |                        60–75% | 12 months after a credible prototype |
| 100 retained paying providers                      |                        35–50% |                              3 years |
| More than €1 million Romania-only ARR              |                        25–40% |                              5 years |
| More than €5 million Romania-only ARR              |                        10–20% |                              5 years |

These ranges are judgment calls, not statistical forecasts. A paid-pilot conversion rate, six-month retention, and measured time savings would be much stronger predictors.

### 9.2 Evidence that supports the market

1. **The downstream business base is large.** The European Commission's 2025 SME fact sheet estimates 929,463 Romanian SMEs in the non-financial business sector in 2024, employing about 3.2 million people. This is not the product's direct TAM—many have no employees, use internal arrangements, or are not commercially reachable—but it demonstrates the breadth of the client base served by SSM providers.
2. **There is a meaningful specialist-provider population.** ITM publishes county-level lists rather than a convenient national commercial dataset. Recent official lists for Maramureș and Bihor each contain roughly 100 enabled external services. These cannot be extrapolated mechanically because activity, duplicates, suspensions, and county mix need validation, but they suggest the direct buyer population is likely in the low thousands rather than only dozens.
3. **The pain is recurrent and non-discretionary.** Client and employee changes, instruction, records, signatures, visits, corrective measures, and evidence recur regardless of economic fashion.
4. **The workflow is demonstrably monetizable.** SSM.ro publicly lists €0.40 per employee per month for its shared-cloud product plus signature usage, while pricing for external services is customized. Exact willingness to pay for SSM Ușor must still be tested.
5. **Digital adoption is moving but incomplete.** A 2026 European Commission country report states that about 44% of Romanian SMEs had reached at least basic digital intensity in 2025, still among the lowest shares in the EU. This creates both demand for productivity software and real onboarding, training, and change-management friction.
6. **Electronic instruction and signature have a legal path.** Romanian law allows online instruction and electronic evidence under defined conditions, enabling an end-to-end digital workflow when implementation and responsibility are legally reviewed.

### 9.3 Competitive reality

There are already Romanian products addressing external SSM providers or adjacent parts of the workflow:

- SSM.ro offers customized external-service accounts with unlimited organizations and contacts and combines documents, training, signatures, reports, optional operational modules, APIs, and archival integrations.
- SafeHub explicitly markets to SEPP/SIPP users and describes multi-company management, document generation, training, signing, incidents, and audit access.
- EasySSM publishes testimonials from external-service users and describes document generation, online instruction, signing, and deadline monitoring across many industries.
- WikiDoc explicitly addresses specialists managing many client companies and focuses on fast, centrally versioned document generation.
- SSMatic states that it works with external protection services and offers digital SSM/PSI workflows.

Therefore, “multi-client SSM SaaS” is not sufficient differentiation. The narrower gap to validate is:

> Does any current product let an external provider perform the deep day-to-day work—portfolio operations, client requests, structured document editing, review, PDF rendering, signatures, visits, measures, communications, and evidence—without returning to Word, spreadsheets, email threads, and separate signing tools?

Public materials do not clearly demonstrate that complete experience, particularly a robust in-platform document studio and provider practice-management layer. Only product demos and interviews with current users can establish whether this is a real gap or merely absent from marketing pages.

### 9.4 What “never leave the platform” should mean

This should become the product experience north star:

> All digital administrative work related to a provider's clients has one system of record and can be completed there.

Inside SSM Ușor:

- clients, contacts, workplaces, employees, and responsibility matrix;
- service packages, obligations, calendar, tasks, and team assignment;
- document authoring, client-specific editing, review, approval, PDF rendering, signing, revision, and retention;
- instruction, testing, reminders, and employee evidence;
- visits, observations, findings, corrective measures, and photos;
- client requests, approvals, messages, attachments, and activity reports;
- legislation impact reviews and document update tasks;
- exports, audit access, and service reporting;
- eventually contracts, renewals, invoicing context, and provider analytics.

Email should be a delivery and capture channel, not the database. Notifications can go out by email; replies and attachments should eventually be routed back to the relevant client, task, document, or finding. Building a full email client is unnecessary initially.

Some work will remain outside the product by nature: physical workplace inspection, practical exercises, medical examinations, official authority portals without supported APIs, specialist engineering/CAD tools, and exceptional documents outside the supported editor model. The promise must concern digital workflow continuity, not the elimination of professional fieldwork.

### 9.5 Illustrative business scale

The following are scenario calculations, not a market forecast:

| Paying providers | Average recurring revenue/provider/month | Illustrative ARR |
| ---------------: | ---------------------------------------: | ---------------: |
|              100 |                                     €300 |         €360,000 |
|              300 |                                     €500 |       €1,800,000 |
|              750 |                                     €700 |       €6,300,000 |

Revenue per provider can combine a platform base fee, managed-employee tier, provider seats or modules, and transparent signing/archive usage. The critical economic questions are provider acquisition cost, migration/onboarding cost, signature gross margin, support load, and churn—not the theoretical number of Romanian employers.

### 9.6 Conditions for success

1. Sell to the external provider and make it the administrator of the client relationship.
2. Prove hard ROI: more managed clients per specialist, faster document turnaround, fewer reminders, and fewer external-tool steps.
3. Make migration a product: import existing client structures, spreadsheets, Word templates, PDFs, and historical evidence with assisted mapping.
4. Make the document studio materially better than Word for repeat SSM work, while preserving DOCX/PDF escape routes.
5. Support mixed-industry portfolios through provider-owned templates and modular content packs rather than claiming universal automatic expertise.
6. Earn trust through evidence integrity, predictable PDF output, appropriate signatures, security, responsive support, and transparent failures.
7. Keep client and employee participation simple enough that the provider does not become first-line technical support for every action.
8. Avoid trying to ship every module before the core document and recurring-work loop creates paid retention.

### 9.7 Validation thresholds before a full build

Proceed from prototype to full core-product investment only if discovery produces most of the following:

- at least 12 provider interviews, including solo, small-team, and larger providers;
- at least 8 providers demonstrate the workflow with real anonymized documents rather than only describing it;
- at least 5 confirm that Word/PDF/signature/email fragmentation is among their top three operational problems;
- at least 3 agree to a paid or contractually committed pilot;
- providers can quantify at least 5 hours/month of recoverable administrative time or capacity for additional clients;
- the supported editor model covers at least 80% of document instances used by pilot providers without desktop Word;
- at least one signature integration validates downloaded documents reliably;
- at least two providers complete two recurring monthly/quarterly cycles and keep using the system.

Negative signal: providers like the concept but will not supply sample documents, migrate one real client, commit money, or replace an existing step. Compliments are not validation.

## 10. SSM.ro public capability review

Research date: 31 August 2026. This is based only on publicly accessible marketing pages and documentation, not a paid-account product test. “Not publicly evidenced” does not mean the feature is absent.

| Capability publicly evidenced for SSM.ro                                                             | What the public material shows                                                                     | Scope decision for SSM Ușor                                                 |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Organization, departments, posts, COR grouping, and responsible managers                             | Company data drives documents; departments and posts drive managers and training themes            | Baseline; include in the first release                                      |
| Employee/contact management and HR/ERP API                                                           | Manual/import flows plus API endpoints for contacts and reports                                    | Baseline; start with strong import/reconciliation, add API later            |
| Document inventory, custom types, versions, validity, and attachments to employees/posts/departments | Controlled employee and organization document records                                              | Baseline; include                                                           |
| Standard DOCX generators and interactive forms                                                       | Decisions, declarations, contracts, themes, training records, tests, and risk-identification forms | Include a deliberately small, reviewed first template set                   |
| Individual, bulk, scheduled, and event-triggered document generation                                 | Joiner, reactivation, role, department/location, and post changes can trigger packages             | Include bulk in MVP; add richer automation after workflow validation        |
| SSM/SU instruction materials, themes, and questionnaires                                             | Files and multimedia feed training themes and tests                                                | Baseline; include                                                           |
| Courses, sessions, lessons, testing, certificates, and training records                              | Course content is separated from participant sessions and results                                  | Include the narrower compliance-training subset first                       |
| Employee email invitation, mobile access, reminders, supervisor alerts, and personal dossier         | Employee completes materials, tests, and signature remotely                                        | Baseline; include                                                           |
| Electronic signatures, timestamps, seals, signing workflows, and verification                        | Public materials describe advanced/qualified signing integrations and traceability                 | Integrate one provider; do not build the trust service                      |
| Reports and expiry notifications                                                                     | Missing/required documents, training expiry, approvals, filing, and other deadlines                | Baseline; extend to provider-wide portfolio exceptions                      |
| Roles for super user, operator, audit/control, administrator, employee, and visitor                  | Differentiated management, personal, and read-only access                                          | Baseline; add provider/client scopes                                        |
| Qualified/managed electronic archival integrations                                                   | Namirial and Iron Mountain integrations are documented                                             | Later integration; preserve exportability from day one                      |
| Audits/questionnaires and corrective measures                                                        | Optional application is listed publicly                                                            | Include a basic visit/finding/measure workflow as a provider differentiator |
| Accident register and HSE reporting                                                                  | Optional applications are listed publicly                                                          | Later                                                                       |
| Hiring calendar, team view, and employee self-service document issuance                              | Optional applications are listed publicly                                                          | Selectively later; avoid broad HR scope                                     |
| RFID access/authentication                                                                           | Optional application and API endpoint are documented                                               | Not relevant to initial wedge                                               |
| Email/OCR import of medical fitness sheets                                                           | Enterprise-only workflow extracts fields and routes by CNP                                         | Later, with human verification                                              |
| Bilingual documents, local accounts, configurable MFA                                                | Listed in setup guidance                                                                           | Romanian first; add bilingual based on pilot demand                         |

Publicly documented workflow highlights worth matching:

- SSM.ro describes the employee flow as invitation → material → test → signature → personal dossier.
- Its generator documentation ties approved themes to the corresponding introductory, workplace, periodic, and additional SSM/SU records.
- It records traceability such as sender, access, time spent, test performance, and signing time.
- It supports document generation in bulk and from employee lifecycle events.
- Its public API is narrow but demonstrates that HR/ERP synchronization is a market expectation.

Capabilities central to this proposal that were not clearly demonstrated in the reviewed public material:

- provider-level contracts, service packages, deliverables, and team capacity;
- a strong cross-client portfolio command center;
- explicit provider-versus-employer responsibility and “awaiting client” workflows;
- specialist field-visit workflow as the product’s main operating loop;
- integrated evacuation-plan drawing/validation;
- legislation-change detection mapped to affected client documents;
- AI-generated, cited document redlines with expert approval.

Two other public products reinforce that multi-client external-provider management is already becoming part of the category: SafeHub advertises managing dozens of client companies from one account, and WikiDoc markets document generation for specialists managing many client companies. Provider-first workflow therefore needs to be executed deeply; it is not differentiation by label alone.

## 11. Feature opportunities beyond the stated idea

Prioritized additions that fit the external-provider job:

### Strong candidates

- client request inbox with owner, deadline, attachments, and SLA;
- visit/audit findings and corrective-measure closure;
- medical fitness and authorization expiry tracking;
- incident/near-miss intake and follow-up;
- contractor and visitor induction;
- fire-drill scheduling, attendance, findings, and report;
- extinguisher/hydrant/emergency-light inspection inventory and reminders;
- PPE assignment, acknowledgement, replacement, and stock integration;
- competence and authorization matrix per SSM post;
- secure control data room or one-click evidence package;
- client quarterly service report and contract-deliverable history;
- migration assistant for existing folders, Word templates, and spreadsheets.

### Useful later

- integrations with occupational-medicine clinics;
- public API, webhooks, SSO/SCIM, and HRIS connectors;
- benchmark insights using anonymized aggregates, only with a strong privacy model;
- provider proposal, contract renewal, invoicing, and profitability;
- template marketplace curated by verified specialists;
- branded/white-label employee and client portal.

## 12. Key workflow definitions

### 12.1 New client onboarding

1. Provider creates the client and chooses a reviewed onboarding checklist/service package.
2. Client administrator confirms company, workplace, responsible-person, and employee data.
3. Specialist maps COR occupations into SSM posts/exposure groups and confirms the applicable profile.
4. System imports existing documents and reports missing or expiring inventory items.
5. Specialist chooses templates, owners, recurrences, and signature workflows.
6. Client and provider approve the responsibility matrix.
7. Dashboard activates only after unresolved setup exceptions are shown.

### 12.2 New employee / change event

1. Client imports or enters the change with an effective date.
2. System shows the deterministic document/training package that the configured rules would create.
3. Authorized user confirms the package and responsible people.
4. Documents are generated; assignments are sent in sequence.
5. Employee completes material and test; designated people verify/sign.
6. Final evidence is locked, indexed, and reflected in dashboards.
7. Failures and exceptions become owned tasks, never silent gaps.

### 12.3 Periodic training

1. Approved theme/material version and eligible population are frozen into a session.
2. Participants are invited and reminders/escalations run.
3. Every attempt is retained under the configured policy.
4. Passing generates the correct record and signature workflow.
5. Failed, missing, or unsigned cases remain visible until resolved or explicitly waived with reason and authority.

### 12.4 Visit and corrective action

1. Specialist opens the scheduled visit on mobile web.
2. Checklist entries, photos, observations, and context are captured.
3. Findings create measures with responsibility and due date.
4. Client submits closure evidence.
5. Provider accepts, rejects, or reopens the measure.
6. Signed visit report and measure history enter the client evidence pack.

### 12.5 Control response

1. Authorized user selects client, site, period, employee population, and requested categories.
2. Platform previews included records and privacy exclusions.
3. Export contains an index, final documents, revision/signature validation data, training/test evidence, and relevant logs.
4. Export action itself is audited.

## 13. Non-functional requirements

### Security and privacy

- Every data access path must enforce provider tenant and client scope server-side.
- Sensitive identifiers such as CNP must be optional unless a verified process requires them, field-level protected, masked in normal views, and excluded from broad search/analytics.
- Files require antivirus/malware scanning, content-type validation, isolated preview, and signed short-lived download URLs.
- Administrative actions and evidence transitions require durable audit records.
- Production access by staff must be approved, time-bound, logged, and visible to the customer where appropriate.
- AI retrieval must apply the same document authorization as the product UI.

### Reliability and evidence integrity

- Idempotent document generation and signing callbacks.
- Immutable final revisions; corrections create a new revision.
- Time zone stored consistently and displayed as Europe/Bucharest where relevant.
- Background job monitoring and visible retry/dead-letter handling for signing, email, generation, and exports.
- Backup restore exercises and documented recovery targets.
- Full customer export that does not depend on keeping the subscription active.

### Accessibility and usability

- WCAG 2.2 AA target for participant flows.
- Employee assignments usable on common low-end phones and narrow screens.
- Plain Romanian wording, clear progress, low cognitive load, and no dark patterns around signing.
- Accessible alternatives for media and a supported manual process for digitally excluded workers.

### Scale assumptions to validate

- 100 client organizations per typical provider tenant;
- 10,000 active employees per provider tenant;
- bulk session of 2,000 participants;
- burst signing/reminder workloads around recurring deadlines;
- long retention and high document counts despite modest interactive traffic.

These are design hypotheses, not contractual limits.

## 14. Success measures and release gates

### North-star outcome

Median number of actively managed client organizations per provider specialist, while keeping overdue critical work and evidence exceptions below an agreed threshold.

### Activation

- time from tenant creation to first client imported;
- time to first complete employee training-and-signature cycle;
- percentage of imported rows resolved without support;
- percentage of pilots that configure at least three recurring obligations.

### Operational value

- percentage of supported documents completed without opening Word, a desktop PDF tool, email, or a separate signing portal;
- median time from opening a client draft to issuing the final signed revision;
- time to produce a standard document/training package;
- reduction in manual reminders and duplicate data entry;
- percentage of tasks completed before due date;
- median time to close corrective measures;
- time to assemble a requested evidence pack.

### Participant quality

- assignment-open and completion rates;
- test pass/fail/abandonment rate by content version;
- signature completion and failure rate;
- mobile completion time and support requests.

### Guardrails

- zero cross-tenant access incidents;
- successful restore and export tests;
- signature evidence validation success rate;
- AI citation correctness and unsupported-claim rate before any customer-facing AI release;
- number of tasks incorrectly generated by configured rules;
- employee complaints or privacy requests caused by excessive data collection.

Recommended pilot exit gate:

- two providers complete at least two recurring cycles for five or more real clients each;
- at least 90% of eligible participant assignments finish without staff intervention other than reminders;
- every final signed record validates after download;
- a provider can assemble the agreed control pack in under 15 minutes;
- no unresolved high-severity security, legal, or evidence-integrity defect.

## 15. Commercial model hypotheses

Test, do not assume:

- base fee per external provider plus a tier of active managed employees;
- signatures and qualified archival charged transparently as usage or bundled allowance;
- higher tier for white label, API/SSO, advanced audit, OCR, and dedicated retention/support;
- avoid pricing primarily per client company, which may discourage providers from centralizing small clients;
- pilot price should include migration and template setup so willingness to pay is measured against a usable system.

## 16. Major risks and mitigations

| Risk                                                         | Why it matters                                                                    | Mitigation                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Product is treated as the legally responsible SSM service    | Automation can create false confidence and liability                              | Explicit responsibility model, human approval, transparent rule source, careful claims, specialist/legal review                         |
| Signature implementation is evidentially weak                | A click/OTP alone must not be misrepresented                                      | Integrate a qualified trust-service provider, preserve validation evidence, review each document flow                                   |
| Templates are too generic for real workplaces                | A fast generator may output unsafe or irrelevant documents                        | Provider-owned and specialist-reviewed templates, modular industry/hazard packs, exposure groups, client review, and versioning         |
| Imported Word documents lose important formatting or meaning | Providers will return to Word if migration is unreliable                          | Supported layout contract, import report, side-by-side preview, real-template test corpus, DOCX export and exception workflow           |
| The editor becomes an endless attempt to clone Word          | General-purpose desktop publishing would consume the roadmap                      | Optimize for recurring SSM structures, variables, clauses, review, PDF output, and signatures; explicitly reject unsupported edge cases |
| Employee data becomes stale                                  | Everything downstream becomes unreliable                                          | Effective-dated import, reconciliation, client-owned change tasks, API later                                                            |
| Provider and employer responsibilities are blurred           | Tasks can appear completed while real-world instruction/control was not performed | Responsibility matrix, ordered signers, verification steps, explicit exceptions                                                         |
| AI misses or hallucinates legislation                        | Incorrect advice can harm people and customers                                    | Controlled corpus, citations, change detection, evaluation, human review, no automatic publication                                      |
| Evacuation editor implies engineering validation             | Geometry alone cannot prove a safe/legal route                                    | Specialist authoring workflow, validation checklist, source revision, approval and disclaimers                                          |
| Scope expands into HR/ERP/accounting                         | Delays the SSM wedge and increases complexity                                     | Maintain explicit exclusions and integrate later                                                                                        |
| Migration cost blocks adoption                               | Providers have years of inconsistent files                                        | Import preview, folder/document mapping, assisted onboarding, customer export                                                           |
| Employees lack email or digital confidence                   | Digital-only flow can exclude part of the workforce                               | Local/manual exception workflow, manager-assisted mode after legal/privacy review                                                       |

## 17. Decisions that need founder and domain validation

These are the questions most likely to change the product substantially:

1. Which provider profile should be the first design partner: solo specialist, small provider team, or larger regional/national external service?
2. Is the first commercial promise SSM-only, or SSM plus basic SU/PSI? Recommendation: support the shared organization/document/training model for both, but keep specialized SU content promises narrow.
3. Which documents will the pilot author end-to-end, and which Word structures must the initial editor support to eliminate the provider’s external-tool workflow?
4. Who owns and professionally reviews the template library, and how often?
5. Which steps are performed by the external provider versus the employer’s workplace manager for each training type?
6. Which signature provider and signature type will be used for each initial document flow?
7. How will workers without individual email/phone access complete a valid flow?
8. Is white-labeling a must-have for the first paying providers?
9. What existing data source is most common: Excel, Word folders, a current competitor export, HRIS, or REGES-ONLINE-derived files?
10. What will the provider pay for: active employee, client, provider seat, module, or a hybrid?
11. What evidence do real ITM/ISU controls request across the design partners’ actual client mix?
12. Does the business intend to provide only software, or also templates, legal monitoring, signature credits, and qualified archival as resold services?

## 18. Recommended next product work

1. Recruit three design-partner external providers before choosing the technical stack.
2. Run a 90-minute workflow-mapping session with each using one real client and one recent employee change.
3. Obtain anonymized examples of the exact first 10 document types from at least three client industries and map every field, clause, condition, approval, signer, recurrence, and exception.
4. Build a representative document-import and rendering test corpus before choosing the editor architecture.
5. Produce clickable prototypes for the document studio, portfolio dashboard, employee change preview, participant training flow, and control-pack export.
6. Test one signature provider end-to-end in its sandbox, including failed callbacks and downloaded validation.
7. Have SSM and legal specialists sign off the responsibility/signature matrix, product claims, and template governance.
8. Convert the accepted portion of this brief into a release PRD with user stories, acceptance criteria, and an event/data dictionary.

## 19. Research sources

### Product and competitor sources

- [SSM.ro — How the platform works](https://www.ssm.ro/cum-functioneaza)
- [SSM.ro — Public product page](https://www.ssm.ro/)
- [SSM.ro — Public pricing, including external-service offering](https://www.ssm.ro/preturi)
- [SSM.ro documentation — Getting started](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/primii-pasi)
- [SSM.ro documentation — Document generators](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/generatoare-documente)
- [SSM.ro documentation — Document management](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/gestionare-documente)
- [SSM.ro documentation — Roles](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/roluri-in-aplicatie)
- [SSM.ro documentation — Courses and tests](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/aplicatii/cursuri-si-testari)
- [SSM.ro documentation — Optional applications](https://ghid.ssm.ro/docs/02-ghiduri/utilizator/aplicatii)
- [SSM.ro documentation — API](https://ghid.ssm.ro/docs/03-api)
- [SSM.ro documentation — Employee training sessions](https://ghid.ssm.ro/docs/02-ghiduri/angajat/sesiunile-de-instruire)
- [SafeHub — public product page](https://safehub.ro/)
- [WikiDoc — public product page](https://wikidoc.ro/)
- [EasySSM — public partner and customer page](https://www.easyssm.ro/parteneri)
- [SSMatic — public digitalization offering](https://www.ssmatic.ro/servicii-digitalizare-protectia-muncii)

### Market sources

- [European Commission — Romania 2025 SME Country Fact Sheet](https://single-market-economy.ec.europa.eu/document/download/6ce36fb1-36e9-469d-a62f-b80a33841242_en?filename=Romania+-+SME+Fact+Sheet+2025.pdf)
- [European Commission — 2025 Country Report for Romania, including SME digital intensity](https://economy-finance.ec.europa.eu/economic-surveillance-eu-member-states/country-pages-including-country-reports/country-report-romania_en)
- [European Commission — Romania 2025 Digital Decade Country Report](https://digital-strategy.ec.europa.eu/en/factpages/romania-2025-digital-decade-country-report)
- [ITM Maramureș — enabled external prevention and protection services, May 2026](https://www.inspectiamuncii.ro/documents/752245/1288889/LISTA%2BSERVICII%2BEXTERNE%2BABILITATE%2BMARAMURES%2B-%2Bactualizata%2Bla%2B08.05.2026.pdf/568b1637-d379-4269-ba56-8c8e1dd0fe9a)
- [ITM Bihor — enabled external prevention and protection services](https://itmbihor.ro/media/filer_public/67/be/67be12dc-738a-4e0c-8694-a743a33e82f0/lista_sepp.pdf)

### Official/legal starting points

- [Law no. 319/2006 on occupational safety and health — Romanian Legislative Portal](https://legislatie.just.ro/Public/DetaliiDocumentAfis/241426)
- [Government Decision no. 1425/2006 — Romanian Legislative Portal](https://legislatie.just.ro/Public/DetaliiDocumentAfis/76337)
- [Emergency Ordinance no. 36/2021 on electronic signatures in employment relations](https://legislatie.just.ro/Public/DetaliiDocument/242068)
- [Government Decision no. 259/2022, including electronic training-record changes](https://legislatie.just.ro/Public/DetaliiDocument/252418)
- [Law no. 214/2024 on electronic signatures, timestamps, and trust services](https://legislatie.just.ro/Public/DetaliiDocument/285178)
- [Law no. 135/2007 on electronic archiving](https://legislatie.just.ro/Public/DetaliiDocument/284306)
- [Law no. 307/2006 on fire protection — current page](https://legislatie.just.ro/Public/DetaliiDocumentAfis/307734)
- [Order no. 163/2007 approving general fire-protection rules](https://legislatie.just.ro/Public/DetaliiDocumentAfis/80730)
- [Instructions no. 569/2008 concerning evacuation plans](https://legislatie.just.ro/Public/DetaliiDocument/99846)
- [Government Decision no. 295/2025 on REGES-ONLINE](https://legislatie.just.ro/public/DetaliiDocument/295995)
- [Romanian Labour Inspection notice confirming REGES-ONLINE replaced REVISAL from 1 January 2026](https://www.inspectiamuncii.ro/documents/632396/632901/Comunicat%2BREGES%2BONLINE%2B21012026.pdf/ecfc7d55-e596-44aa-aa61-3d05de9604ec)

Source note: the Legislative Portal itself states that consolidated electronic versions are consultative and that the official _Monitorul Oficial_ text prevails. Production legal content needs a formal source and review policy rather than ad-hoc web retrieval.
