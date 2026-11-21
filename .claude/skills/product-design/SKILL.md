---
name: product-design
description: How design work runs in SSM Ușor and what the house style is. Use when designing, redesigning or mocking up any screen of the app, the portal or the marketing site, when drawing a design canvas, and on every round of design feedback.
---

# Product design

Design runs in rounds: agree content, build boards in the real shell, get a verdict, record it. Load `frontend-design` and `artifact-design` before the first board of a session, `dataviz` before any chart, and `copywriting` and `copy-editing` for marketing or public copy.

Read `house-style.md` before planning any board: it holds the checkable rules (tokens, type, buttons, tabs, tables, copy, rejected looks). Read `canvas.md` before building a canvas.

## Each round

1. **Agree content first.** For a new screen, settle with Mircea what it shows before any visuals: sections, numbers, links, empty states. Trace every number to a table, view or endpoint and name the ones with no source. Later rounds of the same screen skip this unless the feedback changes the content.
2. **Read the real shell and the page's current code.** Rebuild both from the components, never from memory or guessed markup. Paths are in `canvas.md`. Done when every size, colour and label on a board traces to a class or token read in this session.
3. **Plan, critique, build.** Write the plan in the reply: decisions already taken, one row per proposal with an ASCII wireframe, and what the critique changed. Check it against `house-style.md` before drawing. Proposals differ in a structural idea, not in colour.
4. **One canvas page per topic.** Each page is a row per proposal: title note, desktop board 1440 wide, phone boards 390 wide beside it. Empty states and decided items get rows of their own below. A canvas that covers several topics (a tab's directions, another tab's states, a rename) gets one page per topic, planned up front. Never dump boards on one page.
5. **Replace, never archive.** When a round supersedes a board, delete the old board. No archive pages, no earlier rounds kept beside the new one. Mark the chosen proposal with a note ("aleasă").
6. **Publish early.** Publish as soon as the main rows render, then refine. Cap the run: no extra verification passes once the boards are right.
7. **Check before presenting.** Render each board locally in headless Chrome: heights, wrapping at 390, and every join at 3x crop (folder tab to sheet, panel edges, shadows). He inspects joins at pixel level.
8. **Record the verdict.** What concerns one screen goes in that screen's memory note (canvas URL, chosen, rejected and why, open questions). Taste that holds for other screens goes into `house-style.md` in the pull request that ships the change.

## Who draws

Whoever draws (the main session, or an Opus subagent when Mircea asks for one) first rebuilds the real layout from code, as `canvas.md` describes; nobody draws boards from approximate markup. A subagent gets a brief with the decisions taken, the rows, the rules from `house-style.md`, the page split and a time cap.

## Building from a verdict

- Build in a git worktree, one pull request per step. The pull request carries screenshots under Evidence and, when members see the change, the `## Actualizări` block (CLAUDE.md "Pull requests").
- Brief builders with the pattern by name: `SectionNav`, `TabSheet`, `Table`, the button variants, the list text colour rule, add-button placement. A brief that names a filter or a precedent instead of the pattern gets the wrong pattern.
- Do not copy a precedent's button placement or phone layout blindly; check it against `house-style.md`.
- A behaviour a help article describes is updated in the same pull request.

## Calm first

Working pages, not showcases. Colour carries meaning and the brand lime is spent once per screen. When a proposal adds a box, a badge, a tooltip or a second place for the same fact, ask what it removes.
