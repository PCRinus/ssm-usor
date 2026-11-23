# House style

Concrete rules, each checkable against code. Where a note and the code on `main` disagree, the code wins and the rule says so. Rules hold on every screen until Mircea says otherwise.

## Palette and tokens

Source: `packages/design-tokens/src/tokens.css`; dashboard and panel tokens are in `apps/app/src/styles.css`. Never hard-code a hex that has a token.

| Token | Value | Use |
| --- | --- | --- |
| `--brand-forest`, `--primary` | #18342e | text, the main action, the back arrow tint |
| `--brand-lime`, `--accent` | #b6d86f | spent once per screen: the dashboard "Ce ai de făcut" panel, sidebar count pills |
| `--brand-cream`, `--background` | #f8f7f1 | page background |
| `--card` | #ffffff | sheets, panels, tables |
| `--secondary`, `--muted` | #edf0eb | in-card actions, quiet fills |
| `--muted-foreground` | #65736d | second line under a value, the em dash of an empty cell |
| `--section-tab`, `-hover`, `-foreground` | #e3e8e0, #d8dfd4, #4d5c55 | tab strip, table header, summary-list labels |
| `--border`, `--input` | #d4ddd5, #ccd6ce | hairlines, field borders |
| `--folder`, `--folder-border`, `-hover` | #edf2ea, #cdd8c9, #9fb5a8 | folder tiles of the documentation tabs |
| `--warning` family | #fdf2d3, border #e9c46a, text #66470a | to do, something to decide (amber) |
| `--destructive` family | #b42318; soft #fdecea, border #efb3ad, text #8c1c13 | overdue, blocked, wrong (red) |
| `--success` family | #eff6dc, border #bfd98a, text #2e4712 | done, "La zi", "Are acces" |
| `--dashboard-panel` | #eef5dc, border #d3e5a6 | the one lime panel: white tiles with solid lime badges |

- Colour carries meaning: red = overdue, blocked or wrong; amber = to do or to decide; green = done; everything else forest, cream, white and grey-green.
- Marketing keeps the settled palette and logo (`apps/marketing/public/brand/`): iterate on copy and layout, not brand.
- Radius is `--radius` (0.75rem). Shadows belong to panels only (see Record pages); elsewhere flat.

## Typography

- Top-level page h1: `text-3xl font-semibold tracking-tight` (`features/clients/clients-page.tsx`).
- Record h1 (client, worker): `text-xl font-semibold tracking-tight`, facts under it at `text-sm` (`features/clients/record-header.tsx`).
- Section headings inside a `TabSheet` (`section-card-title`): 20/600, tracking -0.01em (`apps/app/src/styles.css`). Why: at a squint the headings must beat the save button and the table header.
- Values 14/400 in the normal text colour. Labels 14/400 in `--section-tab-foreground`. Table header 13/600 on `--table-head`, at least 48 px high. About four type sizes per sheet.
- No in-sheet heading that repeats the tab name, and none on a sheet whose only content is one list.
- Dashboard counts: large tabular numbers with tight tracking.

## Buttons

Variants live in `packages/ui/src/components/button.tsx`.

- `default` (dark forest): the single main action of a page, tab or panel. One dark button per tab or panel, and only when there is a step to take. A second action beside it is not dark.
- `secondary` (#edf0eb, pencil or plus icon): in-card actions such as Modifică and Adaugă (`EditAction` in `components/section-card.tsx`; `SheetAction` in `features/clients/details/sheet-action.tsx`). Never lime for add.
- Filtre and the selection bar are the only lime. The Filtre look in code is the success-token outline recipe in `components/list-filters/list-filters.tsx` (pale lime, subtle border), not `tonal`.
- `bordered` (no fill, a visible `--input` border, the ghost's hover): a dismissing action that must still read as a button beside secondary ones, such as "Ignoră" on a suggested zone (`features/risk-zones/risk-zones-card.tsx`). Not for the main or the in-card add and edit actions.
- No plain white `outline` as a design choice. Existing outlines stay where a convention holds: the no-results "Șterge filtrele" and the shared failed-load retry. Do not sweep them.
- Consequential but not destructive (move a worker to former workers): the red Filtre recipe, `destructive-soft` (or `destructive-outline`): red border, soft red fill, red text and icon; the dialog's confirm too. The reverse action stays neutral.
- A `⋯` menu only with two or more actions. One action is a visible button.
- Add and create buttons appear only on the tab where the new item lands, never on Arhivate or Foști. Do not copy a precedent's placement.
- Phones: panel actions leave the heading row and become full-width buttons under the content (`max-sm:w-full`).
- Name every button in words that say its outcome ("Descarcă pentru semnare pe hârtie"), never a bare symbol. An edit button carries its label; a pencil means only "edit".

## Record pages (client, worker, organization)

- Shape: record header, then `SectionNav variant="folder"` (`components/section-nav.tsx`) joined to one white `TabSheet` (`components/tab-sheet.tsx`). The strip's line is the sheet's top edge: square top corners, the open tab covers the line, no gap, no stacked cards, no rounded corner under the strip on a non-first tab.
- Phones: the sheet bleeds to the screen edge and the strip scrolls sideways (`phoneBleed`, `phoneStripInset`, `sheetPadding` in `components/page-spacing.ts`). Never replace the strip with a single-tab menu.
- Panels inside a sheet ("Ridicat"): forest ring plus contact and lift shadow, no border (`--panel-shadow` in `styles.css`, applied to cards and `[data-sheet-panel]` in a non-flush sheet). A flush sheet (a list or table running edge to edge) has no inner panel.
- Summary list (`features/clients/details/summary-list.tsx`): a `dl` with labels in a 12.5rem column beside the value on desktop and above it on phones, faint row rules, a `?` help icon where a field confuses people, an em dash for an empty value, Modifică or Adaugă on the row it edits.
- Settings forms (organization Date firmă and Abilitări) stay form-like, wrapped in the sheet. Do not turn a form into read-only summary rows with Modifică; no Completat or Necompletat badges.
- A record whose role matters shows it as a badge beside the name ("Rolul tău: Admin") with a help icon.
- Back: an icon-only arrow in a tinted rounded square left of the title (`components/back-link.tsx`, `BackSlot`). It goes up one record, not one tab. Every nested page has it; sidebar-level pages and their tabs never do. No visible label (the aria-label names the destination), no tooltip, no breadcrumbs, no record icon tile in the header.
- Client tabs show lists; what opens from a list gets its own full page.
- A page whose content splits by kind (SSM and SU) uses `SectionNav` tabs, child routes and a folding sidebar group, never a column plus a select filter.
- Tabs are named "Documentație SSM" and "Documentație SU"; "document" belongs to Alte documente.
- Folders (documentation overview, `features/documents/pack-folders.tsx`): each tile has its own sage fill (`--folder`) and outline (`--folder-border`), and its tab is cut from the same piece: sloped right edge, no line between tab and body, square corner under the tab, no shadow. Number chip and the bar's empty part are white on it. Phones keep a plain row list.

## Lists and tables

- One layout, the shared `Table` (`packages/ui/src/components/table.tsx`): edge to edge in its card, outer columns at the card's inset, sideways scroll on phones with an edge shade. Never stack rows into cards, never set edge paddings, `max-sm:` stacking or phone-only labels per page. A wrapping text column gets a min width.
- Header: slate `--table-head`, 13/600, sort icon 6 px after the label.
- Cell colour: the primary value is always the normal text colour, whatever it says. Grey only for the second, smaller line under a value and for the em dash. States that need action are coloured text (amber to do, red wrong), not badges. Existing badges stay; "has access" is a green success badge with a check.
- Filters: one `Filtre` button opening a panel (a sheet on phones) with groups, an applied-filters strip and a search box, as in the clients list. Not the old `FilterChips` pills.
- Active and Arhivate (Actuali and Foști) are tabs inside the sheet; the main button sits in the sheet toolbar.
- Long histories (Actualizări): one month per view with a picker, not one endless list.

## Empty states

- Friendly: say what will appear and what to do. Use `components/empty-state.tsx`, plus the lime panel where the screen's first step is a call to action, or a numbered steps panel where setup has equal-weight steps.
- An empty section disappears; when everything is done the screen shows the friendly state. Not-applicable documents are hidden completely, with no "Nu se aplică" row.
- Inside a card, panels, tables and bars span the full inner width; cap text runs (about 68ch), never the container.

## Copy

- Romanian, full phrases that read correctly alone: "Ce ai de făcut", "Situația clienților", "Așteptăm de la angajați". Never fragments such as "La clienți".
- What a field means goes into the help article behind its `?` icon (`apps/help/src/content/docs`), not into an inline hint. Inline hints are for formats such as "zz.ll.aaaa".
- Nothing hides in a tooltip: an edited field's original value, a resend hint, an explanation must be visible on a phone.
- Naming: "Fișa de evaluare a riscurilor" on the client side, "Evaluări de risc" in the library. "SU" (situații de urgență) in the UI and public copy, not PSI.
- Marketing and public copy sell outcomes: no document or section counts, formulas, thresholds, pass marks or archive and format mechanics. Lead with the specialist's day.

## Dashboard

- One item anatomy per screen: badge, number and title on one line; never stacked tiles beside inline rows.
- Show totals; the breakdown is one click away in a filtered list. Nothing whose layout grows with the number of clients.
- Per-domain state is one segmented strip; the bar counts each document once by its most urgent state.
- Trends are single-series monthly bars with readable month labels; the portfolio is a small side card, never the hero.

## Import and review screens

Reuse the client import's review anatomy (`features/imports/review-fields.tsx`: `DecisionRow`, `StatusDot`, `PendingNote`, `EditedTag`, `EditAction`): a status dot per row, an amber row for something to decide, "Modificat de tine" with the original value on the line under it, empty fields kept as "Necompletat" rows. Do not argue for compactness over consistency.

## Rejected, do not propose again

- Bold, cluttered or colourful dashboards; dark hero bands; rising lines, stacked weekly timelines, donut rings, client by area matrices.
- Plain neutral rows without pictograms ("plain, sad").
- Breadcrumbs, a record icon tile in the header, labelled back arrows.
- Chip-row filters; a domain column plus select for split content.
- Coloured state texts as badges; Completat and Necompletat badges on forms; read-only summaries with Modifică for settings forms.
- Boxes inside boxes; row hairlines and section edges in one line weight; a shared group header over two columns.
- White folder tiles on the white sheet, and a folder tab in a different colour that reads as a separate strip.
- Stacking table rows on phones; a left contents column that forces scrolling (documents layout A is being replaced).
- Tooltip-only information; inline explanatory hints; one-item `⋯` menus; add buttons on archived tabs.
- Implementation details in marketing copy.
