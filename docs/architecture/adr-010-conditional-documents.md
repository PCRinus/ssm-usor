# ADR 010: Documents that apply only to some clients

- Status: accepted
- Date: 2026-09-23

## Context

Every document ADR 005 generates belongs in every client's documentation set. Decision 1.5, which names the workers' representatives (_reprezentanții lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă_), does not. H.G. 1425/2006 art. 53(1) sets a minimum of one representative from 10 to 49 workers and two from 50 to 100; above 100, the committee rules of art. 60(3) apply. Representatives are chosen by and from among the workers, so the employer who signs the decision cannot be one of them.

The provider's template (`1.5._Decizie_privind_reprezentantul _lucratorilor.doc`) names the representatives with their contract titles and lists them in the acknowledgement table, like the other decisions.

## Decision

A document of the set can depend on a fact about the client. Decision 1.5 is the first, and depends on the number of the client's current employees in the app; leavers do not count. Under 10 the decision is not generated and nothing is asked for it; from 10 at least one workers' representative is required, from 50 at least two. Clients over 100 employees are out of scope: they normally run an internal prevention service, and the app has nothing for the committee.

The count comes from the employee list, not from a number typed on the client, which would drift from the list. The headcount a client declared at onboarding is therefore dropped from the client: its form no longer asks for it, and its page and the clients list show the list count. A lead keeps it, having no employee list yet, and the value stays in the database after promotion. Since an incomplete list silently drops the decision, the generation form states the count and what it requires, and the Documente tab shows a document that does not apply as "nu se aplică" with the reason, not as missing.

A document that exists is never hidden or deleted because the fact changed: a 1.5 generated at 10 employees stays, draft or issued, when the client falls to 9, and only stops being required.

The workers' representative is a fifth responsible-person role. A person holding it must be linked to a current employee of the client, and must not be the client's legal representative. The legal representative is text on the client, not linked to an employee, so the check compares names, ignoring case, diacritics and word order. A legal representative who is not an employee can never be chosen, so the comparison only has to catch one who is also on the employee list. The responsible-person dialog refuses such a choice on save, and readiness blocks generation when the names come to match later; both say which two names clashed. A linked legal representative was rejected: it needs a picker and a new column for a case the name catches.

A missing or invalid representative blocks the whole generation, as any other missing data does.

Decision 1.5 is numbered last among the decisions, so 1.1 to 1.4 keep their numbers. Cover 1.0 lists it only when it is part of the set.

The template is imported like the others, with the usual fixes: diacritics, no honorifics, singular or plural by the number of representatives. One fix touches a legal sentence: the template's "sub 50 si 100" becomes "între 50 și 100", as art. 53(1) reads.

## Consequences

- The set is no longer the same list for every client; readiness, generation and the Documente tab take the client's facts into account.
- Construction chapters, fire safety and similar documents can follow the same rule when they come.
- The representative's 40-hour training course is not recorded; it belongs with the training records.

## Order of work

1. The role, the employee and legal-representative checks, and readiness by headcount.
2. The template, its data, generation skipping it when it does not apply, and the conditional item on cover 1.0.
3. The count on the generation form and "nu se aplică" in the Documente tab.
