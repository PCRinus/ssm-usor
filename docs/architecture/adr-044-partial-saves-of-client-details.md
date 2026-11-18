# ADR 044: A client's document details and fire-safety facts are saved field by field

- Status: accepted
- Date: 2026-11-19
- Amends [ADR 039](adr-039-training-categories-from-job-positions.md) (the cards no longer send the schedule again, so an interval from outside the list is refused even when it is the one already saved).
- Relates to [ADR 004](adr-004-registration-and-onboarding.md), whose organization company-details route stays a full replace, and to [ADR 040](adr-040-client-contract-and-reload-prompts.md), which decides what an open tab with the old client meets.

## Context

Two rows of a client are each edited by two cards that save apart:

- the client's document details (`clients`): the legal representative's card on **Detalii** and the occupational safety schedule's card on **Instruire și responsabili**;
- the client's fire-safety facts (`client_fire_safety`): the SU schedule's card and the smoking and waste card, side by side on **Instruire și responsabili**.

The legal representative's name and role have a third writer: saving the service contract (`PUT /clients/{clientId}/service-contract`) writes them to the client, and already writes only those of the two it is sent.

Both routes were a `PUT` that replaced the whole row: a field left out or null was cleared. A card that sent only its own fields would have cleared the other card's, so each card built the whole body from the latest cached copy of the row with its own fields over it, and a queue in the app (`inTurn`) held a card's save until a save of the other card still on its way had updated the cache. The trap was contained, but every new card on these rows, every other client of the API and every test had to know it, and a save could still undo another tab's or another member's change made since the page loaded.

[ADR 004](adr-004-registration-and-onboarding.md) met the same question for the organization's company details and kept the full replace, because the setup steps read the record when they open and the new organization's owner is the only one writing it.

## Decision

`PATCH /clients/{clientId}/document-details` and `PATCH /clients/{clientId}/fire-safety` replace the two `PUT` routes, under the same operation ids.

- A field left out stays as saved; `null` clears it. The yes-or-no fields and the kinds of waste take no `null`, since false and an empty list are what clears them.
- A body with no field is `400`.
- Fields the database checks against each other are sent together, so a rule never compares the body with the saved row: the first and the last training day on both routes, and a category's interval with its not-applicable choice on the document details. The smoking place is sent only with the smoking policy; a policy other than designated places clears the place, as ADR 019 has the full save do.
- The fire-safety row is still created by the first save, now holding only what that save sent and the database defaults for the rest.
- Each card sends only its own fields. The app's queue and the merge over the cached row are removed.

The organization's `PUT /organization/company-details` stays a full replace, as ADR 004 decided: the setup steps read the record when they open and send it back with their own fields over it, and the new organization's owner is the only one writing it, so it has no second writer to take back.

### No `PUT` kept for outdated tabs

Under [ADR 040](adr-040-client-contract-and-reload-prompts.md) the change to the app's generated client changes its contract fingerprint, so an open tab of the previous build is answered `426` before any handler and asked to reload: a `PUT` kept beside the `PATCH` would never be reached by it. A tab old enough to send no fingerprint at all, from before ADR 040's third step, still passes the check for now; its save meets a route that no longer exists, fails, and changes nothing. That is rare enough, and harmless enough, not to keep a second route.

## Alternatives considered

- **Keep the full replace and the queue.** Contained and documented, but the trap stays for every new card and caller, and it never covered a change made in another tab.
- **A generic hook in the app that merges any card's fields over the cached row.** The same trap moved into a shared place; the two hooks differ in their errors, invalidations and refusals, so it would save little.
- **Compare a partial body with the saved row in the API** (for example a single day against the other day as saved). Possible, but it needs a read before every write and errors that point at a field the request did not send; sending the pair together keeps every rule on the body.

## Consequences

- One release stops the app's open tabs once, as every contract change does under ADR 040.
- The cards look and save as before. What changes for members is that saving one card no longer takes back what another member, or another tab, saved on the other card in the meantime.
- `docs/api.md` and `docs/app.md` describe the two `PATCH` routes.
