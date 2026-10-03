"""Builds the title page printed before each instruction module the own instructions annex (ADR 012).

    pnpm --filter @ssm-usor/document-engine build-annex-title

A module is the organization's file and the app writes nothing inside it, so what ties it to
"Anexa N" of chapter XIII is a page of its own before it, with the same box of document details
as the common part. That box is built by the import's own code, so the two cannot drift apart;
only its last cell differs: "Pag. X din Y" would read "Pag. 1 din 1" on a page that stands
alone, so it names the annex instead. The page lands in `src/annex-title.ts`, base64 like the
module skeleton, so the API needs no file and no registry entry for it.
"""

import base64
import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    BODY_SIZE, FONT, MARGINS, SMALL_PRINT, _elements, add_branding, build_header, prop, start_office,
    sweep, write_paragraph)

TARGET = '/tmp/annex_title.docx'


def build(desktop, definition):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    build_header(document, definition['header'])
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
        cell = next(table.getCellByName(name) for name in table.getCellNames()
                    if table.getCellByName(name).getString().startswith('Pag.'))
        cell.setString('')
        write_paragraph(cell, cell.createTextCursor(), definition['header']['annex'],
                        size=SMALL_PRINT, below=0, first=True)
        # The import's typesetting later sets the whole header in small print, this gap
        # included; the body then starts where it does on the common part's pages.
        closing = [item for item in _elements(style.HeaderText)
                   if item.supportsService('com.sun.star.text.Paragraph')][-1]
        closing.CharFontName = FONT
        closing.CharHeight = SMALL_PRINT
        add_branding(style)

    text = document.Text
    cursor = text.createTextCursor()
    for index, line in enumerate(definition['lines']):
        write_paragraph(text, cursor, line['text'], size=line.get('size', BODY_SIZE),
                        bold=line.get('bold', False), adjust=CENTER, above=line.get('above', 0),
                        below=line.get('below', 6), keep=True, first=index == 0)

    document.storeToURL(uno.systemPathToFileUrl(TARGET), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(TARGET)


def main():
    with open('/work/tools/import/annex-title.ro.json', encoding='utf8') as file:
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

    with open(TARGET, 'rb') as file:
        encoded = base64.b64encode(file.read()).decode('ascii')
    lines = [encoded[index:index + 100] for index in range(0, len(encoded), 100)]
    with open('/work/src/annex-title.ts', 'w', encoding='utf8') as file:
        file.write('// Written by tools/import/build_annex_title.py from tools/import/annex-title.ro.json.\n')
        file.write('// The page printed before each module the own instructions annex (ADR 012).\n\n')
        file.write('const encoded =\n')
        file.write('\n'.join(f"  '{line}'{' +' if index < len(lines) - 1 else ';'}" for index, line in enumerate(lines)))
        file.write('\n\nexport function annexTitlePage(): Uint8Array {\n')
        file.write('  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));\n}\n')
    print('src/annex-title.ts')


if __name__ == '__main__':
    main()
