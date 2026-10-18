"""Builds the two templates of the electronic signature (ADR 023).

    pnpm --filter @ssm-usor/document-engine build-signing

Neither is one of the provider's originals: the wording is ours, in `signing.ro.json`, and goes
to the provider's SSM contact before it ships. The annex to the regulament intern is document 13
of the occupational safety set, with the set's box of document details; the signing agreement
is a per-employee act adițional, with no box, like the individual training sheets. Articles are
a list, as in the service contract, so no article refers to another by its number. The JSON's
`contract_clause`, the agreement's terms for a new hire's contract, is no template: the engine
reads it as text (`signingContractClauseText`).
"""

import json
import re
import sys
import zipfile

import uno
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT
from com.sun.star.table import BorderLine2
from com.sun.star.text.HoriOrientation import FULL as FULL_WIDTH

sys.path.insert(0, '/work/tools/import')
from build_contract import article, article_numbering, plain  # noqa: E402
from build_sheets import control, run  # noqa: E402
from import_templates import (  # noqa: E402
    BODY_SIZE, FONT, MARGINS, POINT, SMALL_PRINT, TITLE_SIZE, _elements, add_branding,
    build_header, insert_handover, prop, start_office, sweep, write_paragraph)

DATE_LINE = 'Data: ____________________'
FIELD_MARK = 'SIGNATURE_FIELD:'
DATE_MARK = 'DATE_FIELD:'
EMPHASIS = '**'
# Half the text width, from hundredths of a millimetre to twips.
FIELD_WIDTH = round((21000 - MARGINS['LeftMargin'] - MARGINS['RightMargin']) / 2 * 1440 / 2540)
# Room for a day, "18.10.2026", at the body size, so the date sits by its label.
DATE_WIDTH = 1300


def signature_fields(path):
    """Turns each marker paragraph into a paragraph holding a plain-text content control named
    after the field, which LibreOffice exports as a PDF text field the signer makes a signature
    field (ADR 023), as on the training sheets."""
    with zipfile.ZipFile(path) as archive:
        entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item, data in entries:
            if item.filename == 'word/document.xml':
                xml = data.decode('utf8')
                pattern = re.compile(
                    r'<w:p\b(?:(?!<w:p\b).)*?' + re.escape(FIELD_MARK) + r'(\w+).*?</w:p>', re.S)
                while match := pattern.search(xml):
                    properties = re.search(r'<w:pPr>.*?</w:pPr>', match.group(0), re.S)
                    drawn = (f'<w:p>{properties.group(0) if properties else ""}'
                             f'{control(match.group(1), FIELD_WIDTH, 5, BODY_SIZE)}</w:p>')
                    xml = xml[:match.start()] + drawn + xml[match.end():]
                # "Data:" keeps its label; the field after it is filled with the day of the
                # signature, so a paper copy has a blank and the electronic one its date.
                pattern = re.compile(
                    r'<w:p\b(?:(?!<w:p\b).)*?' + re.escape(DATE_MARK) + r'(\w+).*?</w:p>', re.S)
                while match := pattern.search(xml):
                    properties = re.search(r'<w:pPr>.*?</w:pPr>', match.group(0), re.S)
                    drawn = (f'<w:p>{properties.group(0) if properties else ""}'
                             f'{run("Data: ", BODY_SIZE)}{control(match.group(1), DATE_WIDTH, 1, BODY_SIZE)}</w:p>')
                    xml = xml[:match.start()] + drawn + xml[match.end():]
                data = xml.encode('utf8')
            archive.writestr(item, data)


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


def emphasized(text, cursor, content, **options):
    """`plain`, with the stretches between `**` in bold: the parties' names."""
    pieces = content.split(EMPHASIS)
    plain(text, cursor, ''.join(pieces), **options)
    cursor.gotoStartOfParagraph(False)
    for index, piece in enumerate(pieces):
        cursor.goRight(len(piece), True)
        if index % 2:
            cursor.CharWeight = 150
        cursor.collapseToEnd()
    cursor.gotoEndOfParagraph(False)


def signature_table(document, text, cursor, sides):
    """The agreement's block: one row per line, so the two sides line up whatever the length of
    their headings, with a signature field, the name, the role and a date field each."""
    rows = (
        [side['lines'][0] for side in sides],
        [FIELD_MARK + side['field'] for side in sides],
        [side['name'] for side in sides],
        [side['role'] for side in sides],
        [DATE_MARK + side['dateField'] for side in sides],
    )
    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(len(rows), len(sides))
    text.insertTextContent(cursor, table, False)
    table.Split = False
    table.HoriOrient = FULL_WIDTH
    border = table.TableBorder2
    for edge in ('TopLine', 'BottomLine', 'LeftLine', 'RightLine', 'HorizontalLine', 'VerticalLine'):
        setattr(border, edge, BorderLine2())
    table.TableBorder2 = border
    table.TopMargin = round(14 * POINT)
    table.BottomMargin = round(12 * POINT)
    for row_index, values in enumerate(rows):
        for column, value in enumerate(values):
            cell = table.getCellByName(f'{chr(ord("A") + column)}{row_index + 1}')
            cell_cursor = cell.createTextCursor()
            write_paragraph(cell, cell_cursor, value, bold=row_index == 2, above=0,
                            below=6 if row_index == 0 else 0, first=True)
    return table


def signatures(document, text, cursor, definition):
    sides = definition['signatures']
    compact = definition.get('compact')
    plain(text, cursor, '', adjust=LEFT, below=0)
    fields = any('field' in side for side in sides)
    if fields:
        signature_table(document, text, cursor, sides)
        tail = text.createTextCursor()
        tail.gotoEnd(False)
        tail.NumberingStyleName = ''
        tail.CharHeight = 1.0
        tail.ParaTopMargin = 0
        tail.ParaBottomMargin = 0
        return
    # A signature field brings its own room; the annex has less than the set's hand-over blocks,
    # to keep to one page.
    room = 4 if fields else compact['signingRoom'] if compact else 34
    table = insert_handover(document, text, cursor, tuple(
        (side['lines'] + ([FIELD_MARK + side['field']] if 'field' in side else []), side['name'], side['role'])
        for side in sides), signing_room=room)
    if compact:
        table.BottomMargin = round(compact['spacing'] * POINT)
    else:
        for cell_name in ('A1', 'B1'):
            cell = table.getCellByName(cell_name)
            cell_cursor = cell.createTextCursor()
            cell_cursor.gotoEnd(False)
            write_paragraph(cell, cell_cursor, DATE_LINE, above=6, below=0)

    tail = text.createTextCursor()
    tail.gotoEnd(False)
    tail.NumberingStyleName = ''
    if 'after' in definition:
        write_paragraph(text, tail, definition['after'], adjust=LEFT, below=0, first=True)
        return
    tail.CharHeight = 1.0
    tail.ParaTopMargin = 0
    tail.ParaBottomMargin = 0


def tighten(text, compact):
    # The annex keeps to one page under a box of document details as tall as long names make it.
    for paragraph in _elements(text):
        if (paragraph.supportsService('com.sun.star.text.Paragraph')
                and paragraph.ParaBottomMargin == round(6 * POINT)):
            paragraph.ParaBottomMargin = round(compact['spacing'] * POINT)


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
    if 'number' in definition:
        write_paragraph(text, cursor, definition['subtitle'], bold=True, adjust=CENTER, below=3)
        write_paragraph(text, cursor, definition['number'], adjust=CENTER, below=0)
        write_paragraph(text, cursor, definition['numberNote'], italic=True, adjust=CENTER,
                        below=definition.get('spacingAfterHeading', 12))
    else:
        write_paragraph(text, cursor, definition['subtitle'], bold=True, adjust=CENTER, below=12)
    for content in definition.get('parties', []):
        emphasized(text, cursor, content, adjust=LEFT, below=6)
    for item in definition['articles']:
        article(text, cursor, item)
    if 'compact' in definition:
        tighten(text, definition['compact'])
    signatures(document, text, cursor, definition)

    target = f'/work/templates/{definition["file"]}'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    signature_fields(target)
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
