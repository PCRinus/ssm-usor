# Document editor trial

Status: trial done, recommendation to embed; nothing built in the app yet  
Date: 19 September 2026  
Audience: founders, product, engineering

[ADR 005](architecture/adr-005-document-generation.md) makes editing a generated file inside
the app a requirement and asks for a trial before building it: open our documents, edit a wide
table, save, open the result again. The first candidate was the browser-only DOCX editor from
eigenpal, with Collabora Online and ONLYOFFICE Docs, servers we would host, only if it failed.

**It did not fail. Recommendation: embed it, and do not trial the two servers.**

## What was tried

The package is now `@docx-editor.dev/react` with `@docx-editor.dev/core`, version 2.21.0,
Apache-2.0, released the day before the trial. It has moved a long way since the ADR called it
young: it paginates, draws headers and footers, and keeps what it does not understand.

A throwaway page outside the repository mounted `<DocxEditor>` and a Playwright script drove it
over all 23 documents, as the preview tool renders them for the short sample client:

1. open the file and wait for the editor to report ready;
2. type a phrase at the caret;
3. take the bytes from `save()`;
4. compare the saved file with the original: the text of every paragraph, the count of tables,
   rows, merged cells, numbered paragraphs, sections, drawings, keep-with-next and
   keep-row-whole settings, fields, page size and margins, header and footer parts;
5. convert the saved file to PDF with LibreOffice and compare the page count with the PDF of
   the original.

Two edits were then made by hand in the script: text in a cell of the prevention plan's
ten-column table, and a new article after "Art. 2." of the first aid decision.

## Results

| What                                    | Result                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opens, takes the edit, saves            | **20 of 23**. All 18 documents we generate today except one, see below                                                                                                       |
| Time to ready                           | 0.4 to 0.7 s for a decision or a cover, 1.3 s for the 31 pages of the employer briefing, 2.4 s for the 75 pages of the own instructions                                      |
| Time to save                            | 15 to 270 ms                                                                                                                                                                 |
| Text after saving                       | Identical in all 20, apart from the phrase typed                                                                                                                             |
| Structure after saving                  | Identical counts in all 20. Page size and margins are the same values with their attributes in another order. `numbering.xml` and `styles.xml` are rewritten, not byte-equal |
| Headers and footers                     | Same parts, same text, the same six page fields. The details box, a table in the header that Pages flattens, is drawn correctly                                              |
| Page count after LibreOffice            | **Equal to the original in all 20**, from 1 page to 75                                                                                                                       |
| "Art. 1." as list numbering             | Drawn as in Word. Enter after "Art. 2." makes "Art. 3." and the old one becomes "Art. 4.", live and in the saved file. This is what keeping the labels as numbering was for  |
| Lettered and dashed lists under a point | Drawn with the right indents                                                                                                                                                 |
| Landscape, wide table                   | Drawn correctly; typing in a cell lands in that cell in the saved file                                                                                                       |
| View mode                               | `mode="view"` shows the document with the toolbar disabled: what an issued revision needs                                                                                    |

## What failed, and why

Three documents never became ready. The editor throws a layout error and shows nothing, so
there is no partial rendering to fall back on.

| Document                      | Error                                                               | Cause                                                                                       | What to do                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2.2 General training material | "wrap exclusion reflow did not converge within 8 passes"            | One image of 112 floats with top-and-bottom wrapping and a negative offset                  | Anchor images as characters in the import. With that one image inline the document opens in 2.1 s and saves. Ours to fix |
| 6 Protective equipment list   | "Table row … has content that cannot fit a page content box"        | 42 cells merged downwards; a merged group is taller than a page                             | Content pending anyway. When it is rebuilt from job titles: no cell merged down a long table                             |
| 9 Risk assessment             | "Table row … has w:cantSplit and is taller than the available page" | 445 cells merged downwards and 11 floating drawings; removing keep-row-whole was not enough | Stage 3, its own module. Until then it is uploaded, not generated, and is downloaded rather than edited in the app       |

The lesson is the one the prevention plan already taught with another viewer: **a cell merged
down a long table is what breaks**. It is now a rule for every template we build.

## Smaller findings

- **The page field in the header shows the last page on the first page** ("Pag. 13 din 13" on
  page 1) until the field is refreshed. Word and LibreOffice recompute it, and the saved file is
  unchanged, so it is cosmetic. Worth reporting upstream.
- **A banner says some fonts are missing** (Liberation Serif, Noto Serif CJK SC). They come from
  the defaults LibreOffice writes into `styles.xml`, not from any text. Cleaning those defaults
  in the import removes the banner; the editor also takes a `fonts` configuration.
- **Tab in a table cell does not move to the next cell.** Clicking does.
- **No Romanian interface.** Ten languages ship, Romanian is not one. The `i18n` prop takes our
  own strings over English, about 30 KB of them. We can translate them, and offer them upstream.
- **Size**: about 3.1 MB of JavaScript (0.9 MB gzipped) and a 0.4 MB WebAssembly text shaper.
  It has to be its own lazily loaded route, so nobody pays for it before opening a document.
- The title bar, the File menu, the rulers and the outline pane can each be switched off
  (`menu`, `rulers`, `navigation`), which leaves a toolbar and the page: the right amount for
  correcting a name or a sentence.

## Why not the two servers

Collabora Online and ONLYOFFICE Docs were the fallback if the browser editor lost content or
could not draw our documents. It loses nothing in 20 of 20, draws the header box, the
numbering and the landscape tables, and the three failures are ours to avoid in the templates.
A server editor would add a machine with about 4 GB of memory to run, a license question for
ONLYOFFICE, a callback protocol for saving, and LibreOffice's own layout drift for Collabora,
to fix problems we do not have.

Because the file is the source of truth and the editor takes bytes and returns bytes, this
choice stays cheap to reverse: replacing it touches one screen and no stored data.

## What building it takes

1. **API**: `PUT /documents/{documentId}/draft/file` takes the edited bytes, writes them over
   the draft's file through `src/lib/files.ts`, and sets `edited_at` and `edited_by`. The
   storage policies already only accept the file of a draft. A size limit and a check that the
   bytes are a `.docx` belong here.
2. **SPA**: a full-page route `/clients/:clientId/documents/:documentId`, lazily loaded, that
   fetches the draft through the signed link, mounts the editor in `edit` mode for a draft and
   `view` mode for an issued revision, saves with a button and with Ctrl+S, warns before
   leaving with unsaved changes, and offers the download when the editor throws.
3. **The list**: "Deschide" on a row, and "Modificat" on a draft with `editedAt`, so
   "Generează din nou" can say exactly what would be lost.
4. **Templates**: images anchored as characters, the style defaults cleaned, then re-import the
   general training material.
5. **Romanian strings** for the parts of the interface we keep.

The "DE COMPLETAT" warning at issuing fits the same work: the editor's document model can be
searched for the phrase before the draft is issued.
