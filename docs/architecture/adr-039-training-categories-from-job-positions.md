# ADR 039: A training schedule's staff categories come from the client's job positions

- Status: accepted
- Date: 2026-11-08
- Supersedes [ADR 008](adr-008-applicable-training-categories.md). Amends the fire-safety starting state of [ADR 018](adr-018-fire-safety-means.md).

## Context

ADR 008 made the specialist choose, for each of the two staff categories, an interval or "Nu se aplică", and made generation check that no category held by an active employee was excluded. Every job position already carries its staff category, and the column is required (ADR 006). The choice asked the specialist for a fact the app holds, and a mistake surfaced only as a warning under the form or a refused generation.

Seven provider packs read for the redesign of the training card agree. Their training decision names only the categories the client has posts in and leaves the other out; none writes that a category does not apply. The five small companies, one to three posts each, have one category; the two with posts in both give both intervals.

The legal limits differ by category. HG 1425/2006 art. 96 sets the periodic training of execution personnel at six months at most and of technical-administrative personnel at twelve. OMAI 712/2005 art. 26 sets the interval between two fire-safety periodic trainings by what the staff does, not by these two categories: at most one month (30 days) for staff with execution or operative duties who support the emergency services when an emergency happens; one to three months for staff who work directly with apparatus, machines, equipment and technological installations, and for analysts, researchers and laboratory staff; three to six months for auxiliary staff in production, technical control, research, design, maintenance and repairs, investments and transport, and for staff of public institutions; one to six months for auxiliary staff with organization, management and control duties, for the management of the operator or institution, and for the staff of public authorities. None of the ranges goes past six months.

ADR 008 also decided presence by active employees. A post with no one in it yet still belongs in the decision: the client hires into the posts it has, and the fire-safety training themes already list every post.

## Decision

A staff category applies to a client when the client has at least one job position in it. The same rule holds for the occupational safety training schedule and the fire-safety one.

The client sets one interval for each category that applies. The duration, the first month and the days are shared by both categories. "Nu se aplică" disappears from both forms. The card shows each category that applies as a block with its posts and its result, and a client with no posts sets only the calendar and the duration until it has some.

Nothing is stored about which categories apply. `administrative_training_not_applicable` and `worker_training_not_applicable` stay in the schema and the API so this needs no migration, and nothing reads them. An interval saved for a category the client has no posts in stays saved and is ignored: it is neither printed nor asked for, and it is there again if a post in that category comes back. A client whose category was marked "Nu se aplică" while it had posts now shows the category without an interval, and generation asks for one.

Generating the occupational safety set needs the shared fields and an interval for every category with posts. The training decision prints the paragraph of each category with posts. A client with no posts already lacks `positions.any`, which now also leaves out the training decision's data, so the decision cannot print without a category. The fire-safety set asks the same of its schedule, and its decisions name the categories with posts as they already did.

A category that applies with no saved interval starts at a starting interval, which the specialist saves or replaces. In occupational safety it is the legal maximum: six months for execution personnel and twelve for technical-administrative personnel. In fire safety, where art. 26 gives no maximum per category, it is three months for execution personnel, the one value inside both the one-to-three months of staff working machines and the three-to-six of auxiliary staff, and six months for technical-administrative personnel, inside the three-to-six and the one-to-six ranges. The card and the import cite art. 26 and its ranges, not a legal maximum; staff who support the emergency services need one month, which the specialist picks. This replaces the three months for both categories of the fire-safety starting state in ADR 018; the two hours and the calendar carried over from the occupational safety schedule are unchanged.

The app, the API and the import offer the same intervals, one list per schedule and category (`trainingIntervalChoices`): every month from one to six for execution personnel in both schedules and for technical-administrative personnel in fire safety, and 1, 2, 3, 4, 6 or 12 months for technical-administrative personnel in occupational safety. Saving refuses any other value. Its column takes any month up to twelve, so a client may hold one from before; it still loads, the card shows it as outside the list and asks for one from it, and the API takes it back unchanged, since every card of the client's details sends the schedule again.

## Consequences

The specialist no longer decides which categories apply, and a post added in a new category shows its block with the legal maximum on the next visit. Deleting the last post of a category removes the category from the decision on the next generation, and the draft shows as changed.

A draft generated before this change can show as changed where a category without posts had an interval, because the decision no longer prints that paragraph.

The import follows the same rule. Its review shows the client form's blocks for the categories with kept posts, and confirming writes no exclusion: a category with posts gets the documents' interval, the member's, or its starting interval, in both schedules, which the review shows as chosen and confirming waits on until the member confirms it. A document's interval outside the list waits for a pick as well. A fire-safety schedule the import writes for a client that had none also takes the card's other starting values where the documents give none, two hours and the occupational safety calendar, because the client's card shows its starting values only while nothing of the schedule is saved. An existing client's exclusion of a category with posts gives way to the interval. The reader no longer proposes "Nu se aplică" for a category none of the posts is in.

Nothing writes the two columns any more apart from the client form's pass-through of what was saved, so they can be dropped in a later migration.
