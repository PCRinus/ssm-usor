"""Builds the two templates of the electronic signature (ADR 023).

    pnpm --filter @ssm-usor/document-engine build-signing

Neither is one of the provider's originals: the wording is ours, in `signing.ro.json`, and goes
to the provider's SSM contact before it ships. The annex to the regulament intern is document 13
of the occupational safety set, with the set's box of document details; the signing agreement
is a per-employee act adițional, with no box, like the individual training sheets. Articles are
a list, as in the service contract, so no article refers to another by its number.
"""

import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT

sys.path.insert(0, '/work/tools/import')
from build_contract import article, article_numbering, plain  # noqa: E402
from import_templates import (  # noqa: E402
    FONT, MARGINS, SMALL_PRINT, TITLE_SIZE, _elements, add_branding, build_header,
    insert_handover, prop, start_office, sweep, write_paragraph)

DATE_LINE = 'Data: ____________________'


def set_up_pages(document, with_header):
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        style.Width, style.Height = 21000, 29700
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
        if with_header:
            # The box of document details sits inside the top margin, as on the set's other pages.
            style.TopMargin = 1200
            style.HeaderBodyDistance = 400
            closing = [item for item in _elements(style.HeaderText)
                       if item.supportsService('com.sun.star.text.Paragraph')][-1]
            closing.CharFontName = FONT
            closing.CharHeight = SMALL_PRINT
        add_branding(style)


def signatures(document, text, cursor, sides):
    plain(text, cursor, '', adjust=LEFT, below=0)
    # Less room to sign than the set's hand-over blocks, so that the annex keeps to one page.
    table = insert_handover(document, text, cursor, tuple(
        (side['lines'], side['name'], side['role']) for side in sides), signing_room=34)
    for cell_name in ('A1', 'B1'):
        cell = table.getCellByName(cell_name)
        cell_cursor = cell.createTextCursor()
        cell_cursor.gotoEnd(False)
        write_paragraph(cell, cell_cursor, DATE_LINE, above=6, below=0)

    tail = text.createTextCursor()
    tail.gotoEnd(False)
    tail.NumberingStyleName = ''
    tail.CharHeight = 1.0
    tail.ParaTopMargin = 0
    tail.ParaBottomMargin = 0


def build(desktop, definition, with_header):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    if with_header:
        build_header(document, definition['header'])
    set_up_pages(document, with_header)
    article_numbering(document)
    text = document.Text
    cursor = text.createTextCursor()

    write_paragraph(text, cursor, definition['title'], size=TITLE_SIZE, bold=True, adjust=CENTER,
                    below=3, keep=True, first=True)
    write_paragraph(text, cursor, definition['subtitle'], bold=True, adjust=CENTER, below=12)
    for content in definition.get('parties', []):
        plain(text, cursor, content, adjust=LEFT, below=6)
    for item in definition['articles']:
        article(text, cursor, item)
    signatures(document, text, cursor, definition['signatures'])

    target = f'/work/templates/{definition["file"]}'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    print(definition['file'])


def main():
    with open('/work/tools/import/signing.ro.json', encoding='utf8') as file:
        definitions = json.load(file)
    process, desktop = start_office()
    try:
        build(desktop, definitions['annex'], with_header=True)
        build(desktop, definitions['agreement'], with_header=False)
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)


if __name__ == '__main__':
    main()
