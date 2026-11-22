"""Builds document 9.2, the record of high and specific risk zones (ADR 045).

    pnpm --filter @ssm-usor/document-engine build-risk-zones

Not one of the provider's originals: the wording is ours, in `risk-zones.ro.json`. It is laid out
as the prevention plan, document 10, is imported: A4 landscape bound on its top edge, the set's
box of document details, the title, the plan's hand-over block, then the content written and its
table drawn by the importer's own `fill_section`, so the sweep finishes both alike.
"""

import json
import sys
import zipfile

import uno
from com.sun.star.style.ParagraphAdjust import CENTER

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    FONT, HANDOVER, MARGINS, SMALL_PRINT, TITLE_SIZE, _elements, add_branding, build_header,
    fill_section, insert_handover, prop, start_office, sweep, write_paragraph)
from table_style import TBL_PR_ORDER, edit_properties, put, top_level_tables  # noqa: E402

MARKER = '@@content@@'
# The merge keeps a short table whole and moves it, with the sentence before it, to the next
# page, which would leave the first page with little but the hand-over block
# (`src/table-keep.ts`).
FLOWING_ROWS = '<w:tblCaption w:val="FlowingRows"/>'


def set_up_pages(document):
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        style.IsLandscape = True
        style.Width, style.Height = 29700, 21000
        # Bound on the left as drawn; the sweep moves the binding margin to the top edge.
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
        style.TopMargin = 1200
        style.HeaderBodyDistance = 400
        closing = [item for item in _elements(style.HeaderText)
                   if item.supportsService('com.sun.star.text.Paragraph')][-1]
        closing.CharFontName = FONT
        closing.CharHeight = SMALL_PRINT
        add_branding(style)


def build(desktop, definition):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    build_header(document, definition['header'])
    set_up_pages(document)
    text = document.Text
    cursor = text.createTextCursor()
    write_paragraph(text, cursor, definition['title'], size=TITLE_SIZE, bold=True, adjust=CENTER,
                    below=12, keep=True, first=True)
    write_paragraph(text, cursor, MARKER)
    cursor.gotoStartOfParagraph(False)
    sides = tuple((lines,) + default[1:] for lines, default in zip(definition['handover'], HANDOVER))
    insert_handover(document, text, cursor, sides)
    fill_section(document, MARKER, definition['content'])

    target = f'/work/templates/{definition["file"]}'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    let_rows_flow(target)
    print(definition['file'])


def let_rows_flow(path):
    with zipfile.ZipFile(path) as archive:
        entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item, data in entries:
            if item.filename == 'word/document.xml':
                xml = data.decode('utf8')
                for start, end in reversed(list(top_level_tables(xml))):
                    if '{{#riskZones.zones}}' in xml[start:end]:
                        table = edit_properties(xml[start:end], 'tblPr', lambda inner: put(
                            inner, 'tblCaption', FLOWING_ROWS, TBL_PR_ORDER))
                        xml = xml[:start] + table + xml[end:]
                data = xml.encode('utf8')
            archive.writestr(item, data)


def main():
    with open('/work/tools/import/risk-zones.ro.json', encoding='utf8') as file:
        definition = json.load(file)
    process, desktop = start_office()
    try:
        build(desktop, definition)
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)


if __name__ == '__main__':
    main()
