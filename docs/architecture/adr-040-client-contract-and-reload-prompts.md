# ADR 040: Open tabs learn of a new build, and a client whose API contract changed must reload

- Status: accepted
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

The header is required. A request to a client route without it is refused the same way, since a browser that sends none runs a build from before this decision, and the API's own tests and the flow tests go through the clients or set it. The routes no client of ours calls are exempt, listed in one place beside the check: the Stripe webhook, the Supabase auth hooks, the health check, and the waitlist form of the marketing site, which has no generated client. A new route is checked unless it is added to that list.

The admin area is not on the public API: it reaches the API's `Admin` entrypoint through its own Worker (ADR 038), with hand-written calls and no generated client, so it has no fingerprint to send, and it deploys after the API like the others. It stays outside the check until it gets a generated client of its own, which would give it a fingerprint the same way.

A deployment that skips the API (an SPA-only release) leaves the API's fingerprints as they were, and they still match, since the clients did not change either. A rollback redeploys an older API and older clients together, so the newer tabs are refused and reload into the older build.

### Two prompts: a toast when a newer build exists, a dialog when the contract no longer matches

Each build of the app and the portal publishes `/version.json` with its commit, and knows its own commit (`VITE_COMMIT_SHA`). A tab fetches it, without cache, when it becomes visible again and every ten minutes while visible. When the commit differs, it shows a toast in the app's toaster that does not time out: "A apărut o versiune nouă a aplicației. Reîncarcă pagina pentru a o folosi." with **Reîncarcă**. Closing it postpones it until the next newer build. Most tabs reload here, at a moment the user chooses, and never meet the dialog below.

A `client_outdated` answer, or a failed load of a route's code file, opens a dialog that cannot be dismissed, not a page of its own, since a page would replace what the user was looking at and the dialog leaves it in view. It says "Aplicația a fost actualizată. Reîncarcă pagina pentru a continua." with **Reîncarcă**, and that what the user typed in the page stays filled in. It never reloads by itself. If it opens again within a minute of a reload, which happens only in the minute or two between the API's deployment and the app's, it says to try again shortly and **Reîncarcă** counts down to the end of that minute instead of sending the user round in a loop. A 426 is not reported as a failed request.

The request that met the 426 did not save, so what the user typed is kept for them, as GitHub keeps a half-written comment: when the dialog opens, the text typed into the page's text fields is written to the tab's session storage under the page's address, and when the same page opens after the reload it is put back and a toast says "Am păstrat ce ai scris înainte de reîncărcare." This is best effort: choices in lists and fields inside a dialog that is not open after the reload are not restored, and the dialog promises only what was typed in the page. Asking the user to copy their text, with the last field lifted above the dialog, was drawn and rejected as crude.

The portal's dialog is worded for a participant and says what is already safe: during a test, the answers given before the current question, since each is saved on **Continuă**; while signing, that the document is not signed yet.

### The route error page stays inside the app

The canvas of 2026-11-10 compared what established products do when a page fails (GitHub's guidance on degraded experiences, Atlassian's on error messages, Stripe's and Cloudflare's support references) and settled on keeping the app around the failure. A route that fails to load shows its error in the signed-in layout, so the header, the sidebar and the breadcrumb stay: the app's empty-state card with a muted icon, the likely cause first, **Reîncarcă** and **Raportează problema** (the existing report dialog, which receives the version, the time and the page), and a quiet line with the version and the time. The client's, the employee's and the other pages' own error screens take the same look. The full-page error stays only for a failure of the layout itself, with the same content. The not-found page takes the same look. Today's root-level page, which replaced the whole app, goes. No page links to a status page, since there is none.

### The update dialog waits for the release it announces

ADR 026's dialog opens only when the running build is the newest unread release (its `VITE_RELEASE_TAG` equals the release's tag) or newer. A tab on the previous build shows the toast first, and the dialog after the reload. Non-prod builds carry no tag and keep today's behaviour, since non-prod has no published releases to be stale against.

### What is measured

PostHog receives `update_toast_shown`, `client_outdated_shown` (with the client and whether the cause was a 426 or a code file) and `reload_clicked` (with which prompt). How often members are stopped is read, not guessed.

### Not chosen

- **A rule that API changes stay additive for one release (expand, then contract).** It works only while every contributor, human or agent, remembers it on every change, and the numbers above say it would be broken most weeks.
- **A minimum client version set by hand when someone makes a breaking change.** The same dependence on memory.
- **The minimum client is always the newest release.** It stops every open tab at every release, including those that changed only the marketing site, and it is wrong on SPA-only releases, where the API is not redeployed and so does not know the newest release without a deploy-time value of its own.
- **`oasdiff breaking` instead of a fingerprint.** It would have spared one stop in fourteen releases, while needing the spec that runs in each environment as a baseline, across rollbacks and two environments.
- **Reloading by itself.** A user may be halfway through a form or an import review; the reload is theirs to start.
- **A full page load on the next navigation once a newer build is known.** It would reach most tabs without a prompt, but it has to respect the pages that hold unsaved changes. Left for later, once the counts show whether the toast is enough.

## Consequences

- Every release that changes a client's contract stops that client's open tabs once, at their next request, roughly daily for the app at today's pace. The toast is what keeps that from happening in the middle of work.
- A breaking API change needs nothing from its author: the fingerprint follows the generated client.
- The API gains a middleware and the 426 code, the shared HTTP client a header, the app and the portal a toast, a dialog and `/version.json`, and the update dialog a condition. The page shown when a route fails to load is redesigned with the dialog, so the two read as one family.
- The help article on Actualizări describes the toast and the dialog. `docs/api.md`, `docs/api-client.md`, `docs/app.md` and `docs/portal.md` describe the header, the code and the prompts.

## Order of work

1. This ADR, and the glossary terms in `CONTEXT.md`.
2. A design canvas for the toast, the dialog (app and portal, desktop and phone) and a redesign of the route error page. Beside step 3.
3. The fingerprints written by `generate:api` and checked by `check:generated`; the header in the shared HTTP client; the API's check, its 426 code, the exempt routes and the CORS header, with tests. One pull request, since the header must not reach a browser before CORS allows it, which the deployment order (API first) then guarantees. In this first release a request without the header still passes, because every tab open at that moment runs a build that sends none and cannot show the dialog; the release after it refuses one.
4. The app: `/version.json`, the toast, the dialog on 426 and on a failed code file, keeping the typed text, the events. On steps 2 and 3.
   4a. The app: the route error inside the layout, the pages' own error screens and the not-found page in its look. On step 2, beside steps 3 and 4.
5. The portal: the same, worded for a participant. On steps 2 and 3, beside step 4.
6. Refusing a request without the header, one release after step 3.
7. The update dialog's condition and the help article. On step 4.
