# Building a design canvas

A canvas must look like the app, because Mircea judges joins, widths and colours at pixel level. Draw only the new pieces; everything around them comes from code.

## Setup

1. Artifact `quickstart` with `intent: design`, then publish from the type. Load `artifact-design` and `frontend-design` first.
2. Decide the page split before drawing: one page per topic (see `SKILL.md`), each a row per proposal.
3. Publish early, then refine in place by the same URL. Replace superseded boards; never keep archive pages.

## Read the real shell

Read these in the session; every size, colour and label on a board traces to a class or token.

| Surface | Files |
| --- | --- |
| App shell | `apps/app/src/app/app-shell.tsx` (header 64 px, 256 px sidebar, main `max-w-7xl` with 40 px padding on desktop, 20 px gutter on phones, footer), `packages/ui/src/components/sidebar.tsx` |
| Tokens | `packages/design-tokens/src/tokens.css`, `apps/app/src/styles.css` (panel shadow, tab-sheet rules, dashboard tokens) |
| Page header | `features/clients/clients-page.tsx` (list page), `features/clients/record-header.tsx` (record) |
| Tabs and sheet | `components/section-nav.tsx` (`variant="folder"`), `components/tab-sheet.tsx`, `components/page-spacing.ts` |
| Pieces | `packages/ui/src/components/button.tsx`, `badge.tsx`, `table.tsx`, `components/section-card.tsx`, `components/empty-state.tsx`, `components/list-filters/`, `features/clients/details/summary-list.tsx`, `components/back-link.tsx` |
| Portal | `apps/portal/src/app/portal-shell.tsx`, `portal-header.tsx`, `portal-footer.tsx` |
| Marketing | `apps/marketing/src/layouts/FluxLayout.astro`, `apps/marketing/src/components/site/` |
| Logo | `apps/app/public/brand/logo.png`, uploaded as an asset |

Also look at the running page for the screen being redesigned, and read its route and feature files for the real tab names, columns, buttons and states.

## Build

- One shared stylesheet holds the tokens and the component classes (shell, strip, sheet, panel, table, buttons, badges). Upload it as an asset and link it from every board. Boards stay small and consistent.
- The sidebar is the same on every board: render it once to an image (headless Chrome screenshot) and use the image, so boards stay light.
- Board sizes: desktop 1440 wide, including the 256 px sidebar; phone 390 wide with the real phone header and the 20 px gutter. Desktop beside phone in one row. Show a phone board for every proposal that reaches phones.
- The main area uses the full width of its card; cap text runs only.
- Real-looking Romanian data in the terms of `CONTEXT.md`: firm names with forms and CUI (S.C. Exemplu Construct S.R.L., RO 12345678), worker names with diacritics, believable dates, counts and deadlines, real route paths in links. No lorem ipsum, no "Client 1".
- Every row has a title note naming the idea and, where relevant, what it changes against today. Put an "Azi" reference row first when the screen exists, drawn in the real current look. Mark the chosen proposal "aleasă" once decided.
- Decided or shared states (empty, no results, archived, error, filter open) get rows of their own below the proposals.

## Check before presenting

- Render every board in local headless Chrome at its real size. Look at heights, text wrapping at 390, and clipped content.
- Crop joins at 3x: folder tab to sheet (no seam, no floating curve, no stray corner, no shadow halo), panel edges and shadows, table header edges. Fix, then present.
- Verify every colour against `tokens.css` and every button against `house-style.md`.
- Keep the run short: publish, check once, hand over. Report the URL and which rows are new.

## After the verdict

Delete boards the verdict removed, mark the winner, and write the verdict in the screen's memory note. Builders get the chosen row, the rules by name and the page's real components, not the canvas HTML.
