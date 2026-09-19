"""Builds the seven cover pages of a client's documentation (ADR 005).

    pnpm --filter @ssm-usor/document-engine build-covers

The provider's covers are text boxes on an empty page, with the provider's name pushed into
place in the header by nine empty lines. LibreOffice cannot even read the boxes as text, and
every cover is the same page with another title, so they are not imported: they are built here
from `covers.ro.json`, to the house style, with the wording corrected.
"""

import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT
from com.sun.star.table import BorderLine2
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    FONT, MARGINS, POINT, ROMANIAN, add_branding, prop, start_office)

BODY = 10.0
TITLE = 16.0
CLIENT = 14.0


def paragraph(text, cursor, content, *, size=BODY, bold=False, italic=False, adjust=CENTER,
              above=0, below=6, keep=False, first=False):
    if not first:
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    cursor.CharFontName = FONT
    cursor.CharFontNameAsian = FONT
    cursor.CharFontNameComplex = FONT
    cursor.CharHeight = size
    cursor.CharWeight = 150 if bold else 100
    cursor.CharPosture = 2 if italic else 0
    cursor.CharLocale = ROMANIAN
    cursor.ParaAdjust = adjust
    cursor.ParaTopMargin = round(above * POINT)
    cursor.ParaBottomMargin = round(below * POINT)
    cursor.ParaLeftMargin = 0
    cursor.ParaFirstLineIndent = 0
    cursor.ParaKeepTogether = keep
    text.insertString(cursor, content, False)


def build(desktop, definition, cover):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
    text = document.Text
    cursor = text.createTextCursor()

    # Who prepared the documentation, at the head of the page, where the originals had it.
    paragraph(text, cursor, '{{provider.legalName}}', bold=True, below=0, first=True)
    if cover.get('motto'):
        paragraph(text, cursor, definition['motto'], italic=True, above=90, below=0)
    paragraph(text, cursor, cover['title'], size=TITLE, bold=True,
              above=36 if cover.get('motto') else 120, below=12, keep=True)
    items = cover.get('items', [])
    if items and not cover.get('itemsAfterClient'):
        paragraph(text, cursor, cover['subtitle'], below=6, keep=True)
        paragraph(text, cursor, '{{client.legalName}}', size=CLIENT, bold=True, below=18)
    else:
        paragraph(text, cursor, cover['subtitle'], below=6, keep=True)
        paragraph(text, cursor, '{{client.legalName}}', size=CLIENT, bold=True, below=18 if items else 0)
    for index, item in enumerate(items, start=1):
        paragraph(text, cursor, f'{index}. {item}', adjust=LEFT, below=3)
        cursor.gotoStartOfParagraph(False)
        cursor.ParaLeftMargin = 1270
        cursor.ParaFirstLineIndent = -635
        cursor.gotoEndOfParagraph(False)

    handover = definition['handover']
    paragraph(text, cursor, handover['heading'], bold=True, above=72, below=6, keep=True)

    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(1, 2)
    text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    text.insertTextContent(cursor, table, False)
    table.Split = False
    none = BorderLine2()
    border = table.TableBorder2
    for side in ('TopLine', 'BottomLine', 'LeftLine', 'RightLine', 'HorizontalLine', 'VerticalLine'):
        setattr(border, side, none)
    table.TableBorder2 = border
    sides = (
        ('A1', handover['client'], '{{client.representativeName}}',
         '{{client.representativeRole}} al {{client.legalName}}'),
        ('B1', handover['provider'], '{{provider.representativeName}}',
         '{{provider.representativeRole}} al {{provider.legalName}}'),
    )
    for cell_name, lines, name, role in sides:
        cell = table.getCellByName(cell_name)
        cell_cursor = cell.createTextCursor()
        for index, line in enumerate(lines):
            paragraph(cell, cell_cursor, line, below=0, first=index == 0)
        paragraph(cell, cell_cursor, name, bold=True, above=42, below=0)
        paragraph(cell, cell_cursor, role, below=0)

    # The paragraph after the table, which a text document always ends with.
    tail = text.createTextCursor()
    tail.gotoEnd(False)
    tail.CharHeight = 1.0
    tail.ParaTopMargin = 0
    tail.ParaBottomMargin = 0

    for name in styles.getElementNames():
        add_branding(styles.getByName(name))
    target = f'/work/templates/{cover["number"]}_{cover["typeKey"]}.docx'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    print(f'{cover["number"]}_{cover["typeKey"]}')


def main():
    with open('/work/tools/import/covers.ro.json', encoding='utf8') as file:
        definition = json.load(file)
    process, desktop = start_office()
    try:
        for cover in definition['covers']:
            build(desktop, definition, cover)
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)


if __name__ == '__main__':
    main()
