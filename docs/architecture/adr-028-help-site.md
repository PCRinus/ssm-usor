# ADR 028: A help site for members, linked from every field it explains

- Status: accepted
- Date: 2026-10-24

## Context

The app explains itself in field hints. There are 82 of them across the SPA. Many say why a field exists or which rule it feeds, rather than what to type, and the rules behind the validations are written down only in the ADRs, which members never read. Nothing in the app explains a feature as a whole: what the document pack needs before it is generated, how a training becomes _scadentă_, why a position is asked about its protective equipment.

ssm.ro publishes such a guide. Mircea wants one for SSM Ușor that covers every feature, explains the business logic behind the validations, and is reached from the field or message it explains. He does not want it public: competitors should not read our processes and decisions in it. Once subscriptions exist, only a paying member signs in, and only a signed-in member should read the help.

What the code had on 2026-10-24:

- The SPA keeps the Supabase session in `localStorage` on `app.ssmusor.ro` (`apps/app/src/lib/supabase.ts`). No cookie names the user, so no server and no other subdomain can tell that someone is signed in.
- The API runs on `api.ssmusor.ro` and already calls other Workers through service bindings (`apps/mail`, `apps/pdf`).
- The marketing site is Astro 7 with `@ssm-usor/design-tokens`, served by a Worker that runs before its static assets and sends `X-Robots-Tag: noindex`.
- Starlight 0.42 supports Astro 7.

Mircea decided on 2026-10-24:

- The content lives in this repository. It is public today and may become private after the release, and until then hiding the help from search engines and casual visitors is enough.
- The articles are drafted from the ADRs and the code, and they are kept current as the logic changes.
- The help is a separate site on its own subdomain, built with Starlight or similar.
- A link from a field opens the exact article in a new tab.
- Sign-in protection comes before the pricing pages go live.

## Decision

### A Starlight site at `help.ssmusor.ro`

`apps/help` is an Astro site using Starlight. It is served by a Worker with static assets at `help.ssmusor.ro`, and at `help.non-prod.ssmusor.ro` for non-prod. The deploy workflows build and deploy it like the marketing site. Starlight was chosen over Docusaurus because it is Astro, which the marketing site already is. It gives the sidebar, the table of contents, previous and next links and the search (Pagefind, built into static files) without our writing them, and it takes the design tokens through its CSS custom properties.

The site is in Romanian only. Starlight's own interface strings are set to Romanian, and the ones it lacks are overridden in the site's configuration.

The sidebar follows the app's own sidebar, so a member finds an article where they would find the screen:

- **Primii pași**
- **Clienți**: Date firmă, Angajați, Posturi și echipament, Evaluarea riscurilor, Documente SSM, Documente PSI, Fișiere
- **Instrucțiuni**
- **Riscuri**
- **Teste**
- **Semnături și participanți**
- **Legislație**
- **Organizație**
- **Contul meu**

There are also a few **Cum funcționează** pages for logic that spans screens: what makes a set ready to generate, the training and test states and their dates, the signatures and the portal, and the updates of a document behind its template or law.

### What an article holds

Each article is written for the specialist who uses the app:

- what the screen is for;
- each field that needs more than its label;
- the rules the app applies and why it applies them;
- what the specialist sees when a rule is not met, and how to resolve it.

An article that states a legal rule names the act and the article. The article explains how the app applies that rule; it does not give legal advice. Such a statement is listed in its pull request for Mircea to check, as are template changes to legal content.

Articles never name files, endpoints, tables or libraries, and never say how something was built, as in the Actualizări blocks ([ADR 026](adr-026-updates-and-release-review.md)).

### Topics: the ids the app links to

A **topic** is one thing the app can link to: a field, a rule, a message or a whole screen. Each has a stable id, for example `angajati.cnp`, `posturi.durata-instruire-periodica` or `documente.date-lipsa`.

An article lists in its front matter the topics it answers, each with the heading it sits under:

```yaml
topics:
  - id: angajati.cnp
    heading: CNP-ul
```

A build step reads every article. It fails when:

- a listed heading is not in the article;
- an id is listed twice;
- an id stops matching the pattern `area.slug`.

It writes `packages/help-topics/src/topics.ts`, mapping each id to its path and heading anchor, with the ids as a TypeScript union. The file is committed, and CI regenerates it and fails on a difference, as it does for `database.types.ts`.

Because the app only links through that union, a link to a topic that does not exist fails the typecheck. Renaming a heading keeps the id, so the app's links survive a reworded article.

### The links in the app

- **`Field` gains `help?: HelpTopic`.** With it, a small "?" button follows the label. Its accessible name is "Ajutor: <label>", and it opens the topic's address on the help site.
- **`HelpLink`** is the same link for a place that is not a field: a section heading, a `Notice`, an empty state, the readiness list of the documents tabs.
- **Validation messages stay complete.** Each still says what is wrong and how to fix it, and may end with a "De ce?" link to the topic of its rule.
- **The sidebar footer gains "Ajutor"** next to Actualizări. It opens the help site's home.
- **All links open in one named tab, `ssm-usor-ajutor`.** A second click therefore reuses the help tab instead of piling up new ones, and the member's form stays as they left it.

The help site's origin comes from the build environment, as the API's does. The app sends `help_opened` to PostHog with the topic id, which shows which rules people look up.

### Hints get shorter

When an area's articles land, that area's hints are reread, under these rules:

- A hint stays when it tells the member what to type: a format, an example, a unit, a limit.
- The why, the rule and its consequences move to the topic, and the field gets the "?" link.
- A field whose hint is nothing but an explanation loses the hint.

No hint is removed before its topic exists.

### Keeping the articles current

An article's front matter also lists its sources: the ADRs and the paths in the code whose behaviour it describes. Like `topics`, the list is for the tooling and is never rendered: the site's content schema declares both fields, and no page or search index shows them. They sit in the article, not in a separate map, so whoever edits the article sees what it depends on.

```yaml
sources:
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - supabase/migrations/*employee_training_status*
  - packages/contracts/src/employees.ts
```

A CI step on pull requests compares the changed files against every article's sources. When a source changed and its article did not, the step names the article in the job summary and as a warning on the pull request. It does not block the pull request, because most changes to a source do not change what a member sees.

CLAUDE.md gains a rule beside the Actualizări one: a pull request that changes a behaviour an article describes updates the article in the same pull request.

### Hidden for now, signed in before pricing

**Now.** The help Worker sends `X-Robots-Tag: noindex, nofollow, noarchive`, `robots.txt` disallows everything, and neither the marketing site nor any public page links to it. Anyone with the address can read it. That is the obscurity Mircea accepted until the pricing pages.

**Before pricing: a handoff from the app, then a cookie of the help site's own.** The help Worker runs before every asset, the Pagefind index included, and serves nothing without a valid `__Host-help_session` cookie.

1. A request without the cookie is redirected to `app.ssmusor.ro/ajutor?return=<path>`. The return path is kept only if it is a path on the help site (it starts with one `/`).
2. If the member is signed in, the app's `/ajutor` route calls `POST /help/handoffs` with the member's token. If not, it goes to `/login` first and comes back.
3. The API checks that the caller may read the help: today, that they have a membership, and once subscriptions exist, that their organization's subscription is active. It stores the hash of a random code, valid for 30 seconds and usable once, and returns the code.
4. The app redirects to `help.ssmusor.ro/_auth?code=…&return=…`. The help Worker redeems the code with the API through a service binding. The redemption route is not served on the public host.
5. On success, the help Worker sets `__Host-help_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, valid for 8 hours) and redirects to the return path. The cookie is signed with a secret only the help Worker holds, and names the user and the expiry.

When the cookie expires, the member passes through the app again, which they notice only as a redirect. A member removed from their organization keeps reading for at most the cookie's remaining life.

**Two options were rejected.**

- Moving the app's own session into a cookie on `.ssmusor.ro`, which the help Worker would verify itself, changes sign-in for the app and the portal, and would make the help Worker refresh Supabase sessions. That is too much risk for a docs site.
- Putting the access token in the redirect address leaks a credential into history and logs. The code is useless once redeemed or 30 seconds old.

A path under the app's domain (`app.ssmusor.ro/ajutor/*` sent to another Worker) was also considered. It still needs a cookie, because the session is not in one, and it mixes two builds on one address, so it gains nothing over the subdomain.

### The help inside the app, considered

Rendering the articles inside the SPA, as a side panel beside the form, would have needed no handoff. It would also have kept the form in view. It was rejected for now:

- the navigation, search and page structure would have to be built;
- the articles would be served through the API to keep them out of the public bundle.

The named tab keeps most of the panel's benefit. A short summary can still go in a field's own hint.

## What is left out

- A help panel inside the app.
- Versioned help per release: the help describes what is deployed on its environment.
- Analytics on the help site itself.
- An English version.
- Public pages for search engines. Marketing may want some later, written for that purpose.
- The guided tours. The welcome tour and the Setări page are built separately, and later tours may link to topics.

## Consequences

- The repo gains `apps/help` (Starlight, a Worker, two custom domains) and `packages/help-topics` (generated, committed). The deploy workflows build and deploy one more site.
- `Field` gains a prop and the app gains `HelpLink`, an "Ajutor" sidebar item and a help origin in its environment.
- CI gains the topic manifest diff and the sources warning.
- CLAUDE.md gains the rule on updating articles.
- Writing every article is most of the work, and keeping them current is a cost every behaviour change now carries.
- Before pricing: one table for the handoff codes, two API routes, the help Worker's gate and secret, and the app's `/ajutor` route.
- `CONTEXT.md` gains **articol de ajutor** and **subiect** (topic). `docs/app.md` describes the links and the hint rule.

## Order of work

Each step is a pull request stacked on the step it names.

1. This ADR.
2. `apps/help`, on step 1:
   - Starlight with the design tokens and the Romanian interface;
   - the sidebar skeleton and the Primii pași page;
   - the noindex Worker and the deploy to both environments.
3. The topics and their checks, on step 2:
   - the topic front matter and the manifest generator with its checks;
   - `packages/help-topics`;
   - the CI diff and the sources warning.
4. The app's links, on step 3:
   - `Field`'s `help` prop, `HelpLink` and the "Ajutor" sidebar item;
   - the help origin per environment;
   - the `help_opened` event.
5. The **Angajați** articles, on step 4: its topics wired into the employee forms, and its hints shortened. This area sets the voice and depth, and Mircea reads it before the rest are written.
6. The other areas, on step 5, one pull request each, written in parallel:
   - Clienți and Date firmă;
   - Posturi și echipament;
   - Evaluarea riscurilor and Riscuri;
   - Documente SSM;
   - Documente PSI;
   - Instruire and fișe;
   - Teste;
   - Semnături și participanți;
   - Instrucțiuni;
   - Legislație;
   - Organizație and Contul meu;
   - the Cum funcționează pages.
7. The gate, before the pricing pages go live: the handoff table and routes, the help Worker's cookie, and the app's `/ajutor` route.
