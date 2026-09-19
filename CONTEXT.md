# Context

The vocabulary of SSM Ușor. One product, one vocabulary: code, documentation, issues and the interface use these terms and avoid the synonyms listed under them. Romanian terms are the ones the interface shows. Decisions behind the terms are in `docs/architecture/`.

## People and organizations

**Organization** (_organizație_): a provider of occupational safety services, the app's customer. Owns everything below it. Avoid: tenant, company, firm.

**Member**: a user who belongs to an organization, as **owner** or **specialist**. Avoid: user (when the role matters), admin.

**Client** (_client_): a company the organization serves. Avoid: customer, which is the organization.

**Employee** (_angajat_): a person employed by a client. Avoid: worker, staff, user.

**Responsible person** (_persoană responsabilă_): someone who holds a role in a client's safety organization: workplace manager, first-aider, member of the risk evaluation team. One person can hold several roles. May or may not be an employee. A role is not a job position.

## Work

**Job position** (_post de lucru_): a post at a client as occupational safety sees it: a kind of work with its own risks, equipment and training. Belongs to the client and exists whether or not anyone holds it. An employee is assigned to one. ADR 006. Avoid: job title, role, function, occupation, and "loc de muncă", which the source documents use for three different things.

**Contract title** (_funcția din contract_): the title in a person's employment contract, kept on the employee. Usually the same words as their job position, and not the same fact: two people with one contract title can fill different positions. Documents about a person print it. Avoid: job title on its own, which does not say which of the two is meant.

**Staff category** (_categorie de personal_): one of two kinds of job position, each with its own interval of periodic training: _tehnic-administrativ și conducători de locuri de muncă_, or _personal de execuție_.

**Work zone** (_zona de lucru_): the kind of place a job position works in, as free text: "Birou", "Atelier, teren". Not an address. Avoid: workplace.

**Workplace** (_punct de lucru_): an address where a client operates, the registered office included. Avoid: location, site, and "loc de muncă".

## Documents

**Document**: one document type, once, in a client's documentation set, with its revisions. ADR 005. Avoid: file (that is what a revision has), pack as something users see.

**Revision** (_revizie_): a version of a document, with its Word file. A **draft** (_ciornă_) can be edited, regenerated, replaced by an upload, or deleted. An **issued** (_emis_) revision is locked with the hash of its file and of its PDF. The one issued before it is **superseded**.

**Template**: the Word file a document is merged from. Built-in templates live in the repository and are registered in versions.

**Uploaded document type**: a document of the pack the app cannot write yet, which comes to exist by uploading a `.docx` written elsewhere.
