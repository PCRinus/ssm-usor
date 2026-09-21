# ADR 008: Explicitly choose the staff categories in a training schedule

- Status: accepted
- Date: 2026-09-21

## Context

ADR 005 stores two category intervals on the client and gates generation on a complete schedule. ADR 006 describes the intervals as defaults for job positions and says the training decision prints both. A provider's test exposed a client with only technical-administrative personnel: the form accepted a blank execution interval, but document generation required it. A blank value alone cannot distinguish an unfinished schedule from a category that does not apply.

## Decision

The specialist explicitly chooses an interval or "Nu se aplică" for each of the two staff categories. A blank choice stays undecided, including on existing clients; saved intervals still mean their categories apply. The schedule can be saved unfinished. Document generation requires decisions for both categories, at least one applicable category, and an interval for every category held by an active employee. An employee's job position supplies the category; the legal representative's title or responsible-person role does not. A newly assigned employee never silently changes a saved schedule.

The training decision prints only the paragraphs for applicable categories. Position-specific interval exceptions remain outside this decision until the provider supplies wording ([issue #155](https://github.com/PCRinus/ssm-usor/issues/155)). This amends the assumption in ADR 006 that both category paragraphs always print.

## Consequences

An excluded category has a distinct saved state rather than a fabricated interval. A single-category client can generate documents after the specialist confirms the other category does not apply. Issued revisions remain locked; later schedule changes affect only newly generated drafts.
