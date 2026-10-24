---
name: product-design
description: How design work runs in SSM Ușor. Use when designing, redesigning or mocking up a screen of the app, the portal or the marketing site, and on every round of design feedback.
---

# Product design

Design work runs in **rounds**. Each round agrees on content, writes and reviews a plan, builds boards inside the **real shell**, and records the feedback. Load `frontend-design` before the first board of a session, and run its plan → review → build → critique pass on every round, not only the first. Load `dataviz` before drawing any chart.

## Each round

1. **Agree on content.** For a new screen, settle with Mircea what it shows before any visuals: sections, numbers, links, empty states. Trace every number to a table, view or endpoint, and name the ones that have no source yet. Done when he has confirmed the list. Later rounds of the same screen skip this unless the feedback changes the content.
2. **Read the real shell.** Rebuild the surface the screen lives in from code:
   - app: `apps/app/src/app/app-shell.tsx` and `packages/ui/src/components/sidebar.tsx` (header, sidebar, nav, footer, account button); breadcrumb and page heading from an existing route
   - portal: `apps/portal/src/app/portal-shell.tsx`, `portal-header.tsx`, `portal-footer.tsx`
   - marketing: `apps/marketing/src/layouts/BaseLayout.astro` and `apps/marketing/src/components/site/`
   - colours, radius and font: `packages/design-tokens/src/tokens.css`
   - logo: `apps/app/public/brand/logo.png`, uploaded as a canvas asset

   Done when every shell size, colour and label on the board traces to a class or token read in this session.
3. **Plan and review.** Write the plan in the reply: palette as named hexes from the tokens, type scale, an ASCII wireframe per board, and the one element where the round spends its boldness. Review it against the brief and the house taste below, and say what the review changed.
4. **Build the boards** on a design canvas (Artifact quickstart, intent `design`). Give each round its own canvas page and keep earlier rounds; a title note on the page names the round's idea. Desktop boards are 1440 wide; add a 390-wide phone board once a direction is chosen. Use real-looking Romanian content in the terms of `CONTEXT.md`, and put real route paths in the links.
5. **Critique** every board against the house taste and fix what fails before presenting.
6. **Record the feedback.** When Mircea answers, add taste that will hold for other screens to the house taste below. Verdicts that only concern this screen go in the memory note for the screen.

## House taste

Mircea's accepted and rejected choices so far. Each holds for every screen until he says otherwise.

- Calm working pages, not showcases. Colour carries meaning: red for overdue or blocked, amber for due soon, forest and cream for everything else.
- Calm is not bare. Neutral rows without icons read as "plain, boring, sad". Give each item a pictogram badge and a large tabular number with tight tracking.
- Spend the brand lime in one place per screen. The accepted example is the dashboard's "Ce ai de făcut" panel: a `#eef5dc` panel holding white tiles with solid lime badges.
- Show totals and put the breakdown one click away in a filtered list. Layouts that grow with the number of clients (client × area matrices, per-client timelines) were rejected.
- Trends are single-series monthly bars. Rejected: rising lines, stacked weekly timelines, donut rings, big dark hero bands.
- Headings are full Romanian phrases that read correctly on their own: "Ce ai de făcut", "Situația clienților", "Așteptăm de la angajați". Fragments like "La clienți" were rejected.
- An empty section disappears. When everything is done, the screen shows a friendly empty state.
