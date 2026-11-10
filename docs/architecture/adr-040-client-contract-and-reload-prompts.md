# ADR 040: Open tabs learn of a new build, and a client whose API contract changed must reload

- Status: proposed
- Date: 2026-11-10
- Amends [ADR 026](adr-026-updates-and-release-review.md) on when the update dialog opens.

## Context

The app and the portal are static builds (ADR 001). A tab runs the build it loaded until the page is loaded again: nothing tells it that a newer one exists. A deployment changes what the next page load gets, not what open tabs run, and members keep a tab open for days.

The API deploys before the app, the portal and the admin area (`deploy-environment.yml`), which is right for a page loaded after the deployment and does nothing for one loaded before it. From the moment the API Worker switches, every open tab talks to the new API with the old client. The app sends no version and the API checks none, so an old client receives whatever the new contract returns: a 4xx where an endpoint was removed or a request field became required, and, worse, a response whose fields it reads as missing, which shows as a blank or a crash with nothing that says why.

The contract changes most releases. Between the fourteen releases from 2026.10.28 to 2026.11.10, `apps/api/openapi.json` changed in eleven, and `oasdiff breaking` reports a breaking change in ten of those eleven: removed paths (`/me/guides`, a client-file download), removed required response fields (the SU rename of ADR 035, a usage limit), removed request enum values (`termsVersion`, the import library choices) and new enum values in responses that an old screen does not know. Only one release changed the contract additively. Split by client, the app's generated client changed in eleven releases and the portal's in three.

Three more effects of the stale tab:

- Routes are split into files named by their content (`autoCodeSplitting`), and the hosting serves only the newest build's files. An old tab that opens a section it has not loaded yet requests a file that no longer exists, and the route ends on "Pagina nu a putut fi încărcată".
- The releases list is refetched when its five minutes run out and the tab regains focus, so the update dialog of ADR 026 can open in a tab that still runs the previous build, and announce a feature the user cannot find.
- A participant in the portal may keep a test or a signing open across a release.

## Decision

### A contract fingerprint per client, generated with the client

`pnpm generate:api` already writes the app's and the portal's clients from the API's OpenAPI document. It also writes their **contract fingerprints**: the SHA-256 of each generated client file, shortened, in one generated module that the API, the app and the portal import. `check:generated` covers it like the clients, so a fingerprint can never disagree with the client it describes, and nobody sets or bumps anything by hand.

The fingerprint is per client because the clients cover different parts of the API: an API change that only the app uses must not stop a participant in the portal.

### The client sends it, the API refuses a stale one

Every request of the app and the portal carries `X-Client-Contract: app:<fingerprint>` or `portal:<fingerprint>`, set in the shared HTTP client. The API compares it with the fingerprint of the same client in its own build. When they differ it answers **426 Upgrade Required** with the usual error body and the code `client_outdated`, before authentication and before any handler, so a refused write has changed nothing. CORS allows the header.

A request without the header passes: the admin area (hand-written calls, one user), scripts, tests, `curl`, webhooks and local development. The check therefore only stops a client that says which contract it was built against and was built against another one.

A deployment that skips the API (an SPA-only release) leaves the API's fingerprints as they were, and they still match, since the clients did not change either. A rollback redeploys an older API and older clients together, so the newer tabs are refused and reload into the older build.

### Two prompts: a banner when a newer build exists, a dialog when the contract no longer matches

Each build of the app and the portal publishes `/version.json` with its commit, and knows its own commit (`VITE_COMMIT_SHA`). A tab fetches it, without cache, when it becomes visible again and every ten minutes while visible. When the commit differs, it shows a banner that stays until acted on and can be postponed: "A apărut o versiune nouă a aplicației. Reîncarcă pagina pentru a o folosi." with **Reîncarcă**. Most tabs reload here, at a moment the user chooses, and never meet the dialog below.

A `client_outdated` answer, or a failed load of a route's code file, opens a dialog that cannot be dismissed: "Aplicația a fost actualizată. Reîncarcă pagina pentru a continua." with **Reîncarcă**. It never reloads by itself, and the page stays visible behind it, so a user who was typing can copy their text first: the request that met the 426 did not save. The portal words it for a participant. If the dialog opens again within a minute of a reload, which happens only in the minute or two between the API's deployment and the app's, it says to try again in a minute instead of sending the user round in a loop. A 426 is not reported as a failed request.

### The update dialog waits for the release it announces

ADR 026's dialog opens only when the running build is the newest unread release (its `VITE_RELEASE_TAG` equals the release's tag) or newer. A tab on the previous build shows the banner first, and the dialog after the reload. Non-prod builds carry no tag and keep today's behaviour, since non-prod has no published releases to be stale against.

### What is measured

PostHog receives `update_banner_shown`, `client_outdated_shown` (with the client and whether the cause was a 426 or a code file) and `reload_clicked` (with which prompt). How often members are stopped is read, not guessed.

### Not chosen

- **A rule that API changes stay additive for one release (expand, then contract).** It works only while every contributor, human or agent, remembers it on every change, and the numbers above say it would be broken most weeks.
- **A minimum client version set by hand when someone makes a breaking change.** The same dependence on memory.
- **The minimum client is always the newest release.** It stops every open tab at every release, including those that changed only the marketing site, and it is wrong on SPA-only releases, where the API is not redeployed and so does not know the newest release without a deploy-time value of its own.
- **`oasdiff breaking` instead of a fingerprint.** It would have spared one stop in fourteen releases, while needing the spec that runs in each environment as a baseline, across rollbacks and two environments.
- **Reloading by itself.** A user may be halfway through a form or an import review; the reload is theirs to start.
- **A full page load on the next navigation once a newer build is known.** It would reach most tabs without a prompt, but it has to respect the pages that hold unsaved changes. Left for later, once the counts show whether the banner is enough.

## Consequences

- Every release that changes a client's contract stops that client's open tabs once, at their next request, roughly daily for the app at today's pace. The banner is what keeps that from happening in the middle of work.
- A breaking API change needs nothing from its author: the fingerprint follows the generated client.
- The API gains a middleware and the 426 code, the shared HTTP client a header, the app and the portal a banner, a dialog and `/version.json`, and the update dialog a condition.
- The help article on Actualizări describes the banner and the dialog. `docs/api.md`, `docs/api-client.md`, `docs/app.md` and `docs/portal.md` describe the header, the code and the prompts.

## Order of work

1. This ADR, and the glossary terms in `CONTEXT.md`.
2. The fingerprints written by `generate:api` and checked by `check:generated`; the header in the shared HTTP client; the API's check, its 426 code and the CORS header, with tests. One pull request, since the header must not reach a browser before CORS allows it, which the deployment order (API first) then guarantees.
3. The app: `/version.json`, the banner, the dialog on 426 and on a failed code file, the events. On step 2.
4. The portal: the same, worded for a participant. On step 2, beside step 3.
5. The update dialog's condition and the help article. On step 3.
