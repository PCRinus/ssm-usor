"""Builds the annex template: one instruction module printed as an annex of the own
instructions, from its body of headings and articles (ADR 034).

    pnpm --filter @ssm-usor/document-engine build-annex

An annex is a title page, then its text, under a box of document details that names the annex
and counts its pages within it. The box is built by the import's own code, so it cannot drift
from the common part's. The text is a loop the engine fills from the body: a paragraph style
per kind of paragraph, so the sweep's left alignment of running text does not reach it and an
annex appended to the common part brings its look along. The templates land in
`src/annex-template.ts`, base64, so the API needs no file and no registry entry for them.
"""

import base64
import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import BLOCK, CENTER, LEFT
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    BODY_SIZE, FONT, MARGINS, PAGE_BREAK_MARKER, POINT, ROMANIAN, SMALL_PRINT, _elements,
    add_branding, build_header, prop, start_office, sweep, write_paragraph)

HANG = 635
STYLES = {
    'AnnexHeading': {'bold': True, 'above': 9, 'below': 3, 'adjust': LEFT, 'keep': True},
    'AnnexArticle': {'above': 6},
    'AnnexParagraph': {'above': 2},
    'AnnexItem1': {'above': 2, 'left': HANG},
    'AnnexItem2': {'above': 2, 'left': 2 * HANG},
    'AnnexItem3': {'above': 2, 'left': 3 * HANG},
    'AnnexActs': {'above': 12, 'adjust': LEFT},
}


def add_styles(document):
    family = document.StyleFamilies.getByName('ParagraphStyles')
    for name, spec in STYLES.items():
        style = document.createInstance('com.sun.star.style.ParagraphStyle')
        family.insertByName(name, style)
        style.CharFontName = FONT
        style.CharFontNameAsian = FONT
        style.CharFontNameComplex = FONT
        style.CharHeight = BODY_SIZE
        style.CharWeight = 150 if spec.get('bold') else 100
        style.CharLocale = ROMANIAN
        style.ParaAdjust = spec.get('adjust', BLOCK)
        style.ParaLastLineAdjust = LEFT
        style.ParaTopMargin = round(spec['above'] * POINT)
        style.ParaBottomMargin = round(spec.get('below', 0) * POINT)
        style.ParaLeftMargin = spec.get('left', 0)
        style.ParaFirstLineIndent = -HANG if 'left' in spec else 0
        style.ParaKeepTogether = False
        style.ParaSplit = True
        if spec.get('keep'):
            style.ParaKeepTogether = True


def styled(text, cursor, content, style, bold=''):
    text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    text.insertString(cursor, content, False)
    cursor.gotoStartOfParagraph(True)
    cursor.ParaStyleName = style
    if bold:
        cursor.gotoStartOfParagraph(False)
        cursor.goRight(len(bold), True)
        cursor.CharWeight = 150
    cursor.gotoEndOfParagraph(False)


def write_cell(cell, lines, adjust):
    cell.setString('')
    cursor = cell.createTextCursor()
    for index, runs in enumerate(lines):
        write_paragraph(cell, cursor, ''.join(content for content, _ in runs), size=SMALL_PRINT,
                        adjust=adjust, below=0, first=index == 0)
        cursor.gotoStartOfParagraph(False)
        for content, bold in runs:
            if content == '':
                continue
            cursor.goRight(len(content), True)
            cursor.CharWeight = 150 if bold else 100
            cursor.collapseToEnd()
        cursor.gotoEndOfParagraph(False)


def add_page_fields(document, cell):
    cursor = cell.createTextCursor()
    cursor.gotoEnd(False)
    for service, after in (('PageNumber', ' din '), ('PageCount', '')):
        field = document.createInstance(f'com.sun.star.text.TextField.{service}')
        field.NumberingType = 4  # Arabic numerals
        if service == 'PageNumber':
            field.SubType = uno.Enum('com.sun.star.text.PageNumberType', 'CURRENT')
        cell.insertTextContent(cursor, field, False)
        cell.insertString(cursor, after, False)


def build(desktop, definition, target):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    header = definition['header']
    build_header(document, header)
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        style.Width, style.Height = 21000, 29700
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
        style.TopMargin = 1200
        style.HeaderBodyDistance = 400
        table = next(item for item in _elements(style.HeaderText)
                     if item.supportsService('com.sun.star.text.TextTable'))
        page = next(table.getCellByName(name) for name in table.getCellNames()
                    if table.getCellByName(name).getString().startswith('Pag.'))
        write_cell(table.getCellByName('A2'), [
            [(header['annexOf'], False)],
            [(header['annexTitle'], True), (' · versiunea din {{versionDate}}', False)],
        ], LEFT)
        write_cell(page, [[('Anexa {{number}}', True)], [('Pag. ', False)]], CENTER)
        add_page_fields(document, page)
        page.VertOrient = 2  # centred in the height of the row
        closing = [item for item in _elements(style.HeaderText)
                   if item.supportsService('com.sun.star.text.Paragraph')][-1]
        closing.CharFontName = FONT
        closing.CharHeight = SMALL_PRINT
        add_branding(style)

    add_styles(document)
    text = document.Text
    cursor = text.createTextCursor()
    for index, line in enumerate(definition['lines']):
        write_paragraph(text, cursor, line['text'], size=line.get('size', BODY_SIZE),
                        bold=line.get('bold', False), adjust=CENTER, above=line.get('above', 0),
                        below=line.get('below', 6), keep=True, first=index == 0)
    write_paragraph(text, cursor, PAGE_BREAK_MARKER, adjust=LEFT, below=0)

    tags = 'AnnexParagraph'
    styled(text, cursor, '{{#paragraphs}}', tags)
    for key, style, content, bold in (
        ('heading', 'AnnexHeading', '{{heading}}', ''),
        ('article', 'AnnexArticle', 'Art. {{number}}. {{text}}', 'Art. {{number}}.'),
        ('paragraph', 'AnnexParagraph', '{{paragraph}}', ''),
        ('item1', 'AnnexItem1', '{{marker}}\t{{text}}', ''),
        ('item2', 'AnnexItem2', '{{marker}}\t{{text}}', ''),
        ('item3', 'AnnexItem3', '{{marker}}\t{{text}}', ''),
    ):
        styled(text, cursor, f'{{{{#{key}}}}}', tags)
        styled(text, cursor, content, style, bold)
        styled(text, cursor, f'{{{{/{key}}}}}', tags)
    styled(text, cursor, '{{/paragraphs}}', tags)
    styled(text, cursor, definition['acts'], 'AnnexActs')

    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)


def main():
    with open('/work/tools/import/annex.ro.json', encoding='utf8') as file:
        definitions = json.load(file)
    targets = {domain: f'/tmp/annex_{domain}.docx' for domain in definitions}
    process, desktop = start_office()
    try:
        for domain, definition in definitions.items():
            build(desktop, definition, targets[domain])
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)

    encoded = {}
    for domain, target in targets.items():
        with open(target, 'rb') as file:
            text = base64.b64encode(file.read()).decode('ascii')
        encoded[domain] = [text[index:index + 100] for index in range(0, len(text), 100)]
    with open('/work/src/annex-template.ts', 'w', encoding='utf8') as file:
        file.write('// Written by tools/import/build_annex.py from tools/import/annex.ro.json.\n\n')
        file.write("export type AnnexDomain = 'ssm' | 'psi';\n\n")
        file.write('const encoded: Record<AnnexDomain, string> = {\n')
        for domain, lines in encoded.items():
            file.write(f'  {domain}:\n')
            file.write('\n'.join(f"    '{line}'{' +' if index < len(lines) - 1 else ','}" for index, line in enumerate(lines)))
            file.write('\n')
        file.write('};\n\nexport function annexTemplate(domain: AnnexDomain): Uint8Array {\n')
        file.write('  return Uint8Array.from(atob(encoded[domain]), (char) => char.charCodeAt(0));\n}\n')
    print('src/annex-template.ts')


if __name__ == '__main__':
    main()
