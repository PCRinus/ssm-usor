"""Builds the cover pages of a client's documentation (ADR 005).

    pnpm --filter @ssm-usor/document-engine build-covers [number or type key ...]

The provider's covers are text boxes on an empty page, with the provider's name pushed into
place in the header by nine empty lines. LibreOffice cannot even read the boxes as text, and
every cover is the same page with another title, so they are not imported: they are built here
to the house style, with the wording corrected, from one definition per documentation set:
`covers.ro.json` into `templates/`, `covers.fire.ro.json` into `templates/fire/` (ADR 016).
"""

import json
import re
import sys

import uno
from com.sun.star.style import LineSpacing
from com.sun.star.style.LineSpacingMode import FIX, PROP as PROPORTIONAL
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT
from com.sun.star.table import BorderLine2
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    FONT, MARGINS, POINT, ROMANIAN, add_branding, prop, start_office, sweep)

BODY = 10.0
TITLE = 16.0
CLIENT = 14.0
# The least room above the hand-over block, on the cover whose title and contents reach lowest.
HANDOVER_GAP = 36
DEFINITIONS = ('covers.ro.json', 'covers.fire.ro.json')
REPRESENTATIVE = {
    'name': '{{provider.representativeName}}',
    'role': '{{provider.representativeRole}} al {{provider.legalName}}',
}


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
    cursor.ParaLineSpacing = LineSpacing(PROPORTIONAL, 100)
    text.insertString(cursor, content, False)


def tops(document):
    """Where each paragraph of the body starts, in 1/100 mm from the top of the text, by its text."""
    view = document.getCurrentController().getViewCursor()
    found = []
    elements = document.Text.createEnumeration()
    while elements.hasMoreElements():
        element = elements.nextElement()
        if element.supportsService('com.sun.star.text.Paragraph'):
            view.gotoRange(element.getStart(), False)
            found.append((element.getString(), view.getPosition().Y))
    return found


def compose(desktop, definition, cover, placing=None):
    """The cover as a document. Without `placing` it is laid out to be measured: no condition
    tags, and the hand-over block straight after the contents. With it, `placing` holds the
    space above the hand-over heading and the height of each conditional item."""
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
        # An item for a document only some clients have sits inside a condition of the merge
        # data, its tags alone in their paragraphs so the merge leaves no empty line behind.
        condition = item.get('when') if isinstance(item, dict) and placing else None
        if condition:
            paragraph(text, cursor, f'{{{{#{condition}}}}}', adjust=LEFT, below=0)
        # A tab after the number, so a long item's lines run under its text and not under the number.
        paragraph(text, cursor, f'{index}.\t{item["text"] if isinstance(item, dict) else item}',
                  adjust=LEFT, below=3)
        cursor.gotoStartOfParagraph(False)
        cursor.ParaLeftMargin = 1270
        cursor.ParaFirstLineIndent = -635
        cursor.gotoEndOfParagraph(False)
        if condition:
            paragraph(text, cursor, f'{{{{/{condition}}}}}', adjust=LEFT, below=0)
            # Without the item, a line of its height in its place, so the hand-over block
            # does not move up on this cover only.
            paragraph(text, cursor, f'{{{{^{condition}}}}}', adjust=LEFT, below=0)
            paragraph(text, cursor, '', size=1, adjust=LEFT, below=0)
            cursor.ParaLineSpacing = LineSpacing(FIX, placing['items'][index])
            paragraph(text, cursor, f'{{{{/{condition}}}}}', adjust=LEFT, below=0)

    intro = cover.get('intro')
    if intro:
        paragraph(text, cursor, intro['lead'], adjust=LEFT, above=12, below=2, keep=True)
        for line in intro['items']:
            paragraph(text, cursor, re.sub(r'^(\S+\)) ', '\\1\t', line), adjust=LEFT, below=0)
            cursor.gotoStartOfParagraph(False)
            cursor.ParaLeftMargin = 1270
            cursor.ParaFirstLineIndent = -635
            cursor.gotoEndOfParagraph(False)

    handover = definition['handover']
    # The block starts at the same height on every cover, whatever the title and the contents
    # above it take, so the covers of a binder differ only in those.
    paragraph(text, cursor, handover['heading'], bold=True, above=0, below=6, keep=True)
    cursor.ParaTopMargin = placing['above'] if placing else 0

    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(2, 2)
    text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    text.insertTextContent(cursor, table, False)
    table.Split = False
    none = BorderLine2()
    border = table.TableBorder2
    for side in ('TopLine', 'BottomLine', 'LeftLine', 'RightLine', 'HorizontalLine', 'VerticalLine'):
        setattr(border, side, none)
    table.TableBorder2 = border
    signer = cover.get('signer') or handover.get('signer') or REPRESENTATIVE
    sides = (
        ('A', handover['client'], '{{client.representativeName}}',
         '{{client.representativeRole}} al {{client.legalName}}'),
        ('B', handover['provider'], signer['name'], signer['role']),
    )
    for column, lines, name, role in sides:
        cell = table.getCellByName(f'{column}1')
        cell_cursor = cell.createTextCursor()
        for index, line in enumerate(lines):
            paragraph(cell, cell_cursor, line, below=0, first=index == 0)
        paragraph(cell, cell_cursor, name, bold=True, above=42, below=0)
        paragraph(cell, cell_cursor, role, below=0)
        # A row of its own, so the two dates line up when one side's name or role wraps.
        cell = table.getCellByName(f'{column}2')
        paragraph(cell, cell.createTextCursor(), handover['date'], above=12, below=0, first=True)

    # The paragraph after the table, which a text document always ends with.
    tail = text.createTextCursor()
    tail.gotoEnd(False)
    tail.CharHeight = 1.0
    tail.ParaTopMargin = 0
    tail.ParaBottomMargin = 0
    return document


def measure(desktop, definition, cover):
    """How far down the hand-over heading starts with no space of its own above it, and the height each
    conditional item takes, both in 1/100 mm."""
    document = compose(desktop, definition, cover)
    found = tops(document)
    document.close(True)
    heading = next(top for said, top in found if said == definition['handover']['heading'])
    items = {}
    for index, item in enumerate(cover.get('items', []), start=1):
        if isinstance(item, dict) and item.get('when'):
            position = next(at for at, (said, _) in enumerate(found) if said.startswith(f'{index}.\t'))
            items[index] = found[position + 1][1] - found[position][1]
    return heading, items


def build(desktop, definition, cover, placing):
    document = compose(desktop, definition, cover, placing)
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        add_branding(styles.getByName(name))
    folder = '/'.join(filter(None, ('/work/templates', definition.get('folder'))))
    target = f'{folder}/{cover["number"]}_{cover["typeKey"]}.docx'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    print(f'{cover["number"]}_{cover["typeKey"]}: hand-over heading {placing["above"] / POINT:.1f} pt '
          f'below the contents')


def main():
    # build_covers.py [number or type key ...]: only the covers named.
    names = sys.argv[1:]
    process, desktop = start_office()
    try:
        for definition_file in DEFINITIONS:
            with open(f'/work/tools/import/{definition_file}', encoding='utf8') as file:
                definition = json.load(file)
            # Every cover of a set is measured, also when only some are built: the lowest of
            # them decides where the hand-over block sits on all the covers of that set.
            measured = {cover['typeKey']: measure(desktop, definition, cover) for cover in definition['covers']}
            line = max(heading for heading, _ in measured.values()) + round(HANDOVER_GAP * POINT)
            for cover in definition['covers']:
                if not names or cover['number'] in names or cover['typeKey'] in names:
                    heading, items = measured[cover['typeKey']]
                    build(desktop, definition, cover, {'above': line - heading, 'items': items})
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)


if __name__ == '__main__':
    main()
