# ADR 039: A training schedule's staff categories come from the client's job positions

- Status: accepted
- Date: 2026-11-08
- Supersedes [ADR 008](adr-008-applicable-training-categories.md). Amends the fire-safety starting state of [ADR 018](adr-018-fire-safety-means.md).

## Context

ADR 008 made the specialist choose, for each of the two staff categories, an interval or "Nu se aplică", and made generation check that no category held by an active employee was excluded. Every job position already carries its staff category, and the column is required (ADR 006). The choice asked the specialist for a fact the app holds, and a mistake surfaced only as a warning under the form or a refused generation.

Seven provider packs read for the redesign of the training card agree. Their training decision names only the categories the client has posts in and leaves the other out; none writes that a category does not apply. The five small companies, one to three posts each, have one category; the two with posts in both give both intervals.

The legal limits differ by category. HG 1425/2006 art. 96 sets the periodic training of execution personnel at six months at most and of technical-administrative personnel at twelve. OMAI 712/2005 art. 26 sets six months at most for every category of the fire-safety training.

ADR 008 also decided presence by active employees. A post with no one in it yet still belongs in the decision: the client hires into the posts it has, and the fire-safety training themes already list every post.

## Decision

A staff category applies to a client when the client has at least one job position in it. The same rule holds for the occupational safety training schedule and the fire-safety one.

The client sets one interval for each category that applies. The duration, the first month and the days are shared by both categories. "Nu se aplică" disappears from both forms. The card shows each category that applies as a block with its posts and its result, and a client with no posts sets only the calendar and the duration until it has some.

Nothing is stored about which categories apply. `administrative_training_not_applicable` and `worker_training_not_applicable` stay in the schema and the API so this needs no migration, and nothing reads them. An interval saved for a category the client has no posts in stays saved and is ignored: it is neither printed nor asked for, and it is there again if a post in that category comes back. A client whose category was marked "Nu se aplică" while it had posts now shows the category without an interval, and generation asks for one.

Generating the occupational safety set needs the shared fields and an interval for every category with posts. The training decision prints the paragraph of each category with posts. A client with no posts already lacks `positions.any`, which now also leaves out the training decision's data, so the decision cannot print without a category. The fire-safety set asks the same of its schedule, and its decisions name the categories with posts as they already did.

A category that applies with no saved interval starts at its legal maximum: six months for execution personnel and twelve for technical-administrative personnel in occupational safety, six months for both in fire safety. The specialist saves it or picks a shorter one. This replaces the three months of the fire-safety starting state in ADR 018; the two hours and the calendar carried over from the occupational safety schedule are unchanged.

## Consequences

The specialist no longer decides which categories apply, and a post added in a new category shows its block with the legal maximum on the next visit. Deleting the last post of a category removes the category from the decision on the next generation, and the draft shows as changed.

A draft generated before this change can show as changed where a category without posts had an interval, because the decision no longer prints that paragraph.

The import still proposes "Nu se aplică" for a category the documents leave out and saves it as before; nothing reads it. Its review is being redrawn separately and will drop the choice.

The two columns can be dropped once the import stops writing them.
