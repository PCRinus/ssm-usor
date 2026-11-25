"""Builds the acknowledgement sheet of SSM duties, one worker's copy of their post's annex of
document 13 with the role blocks they hold, which they sign (ADR 046).

    pnpm --filter @ssm-usor/document-engine build-duties-acknowledgement

The annex's text is document 13's own, from `ssm-duties.ro.json`, so the sheet says what the
revision it names says; the sheet's own lines are under `acknowledgement` there. A per-employee
document, like the signing agreement: no box of document details, and no number in the binder.
"""

import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER

sys.path.insert(0, '/work/tools/import')
from build_ssm_duties import annex_body, hang_items  # noqa: E402
from import_templates import (  # noqa: E402
    MARGINS, TITLE_SIZE, add_branding, fill_section, prop, start_office, sweep,
    write_paragraph)

MARKER = '@@content@@'


def set_up_pages(document):
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        style.Width, style.Height = 21000, 29700
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
        add_branding(style)


def build(desktop, definition):
    sheet = definition['acknowledgement']
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    set_up_pages(document)
    text = document.Text
    cursor = text.createTextCursor()
    write_paragraph(text, cursor, sheet['title'], size=TITLE_SIZE, bold=True, adjust=CENTER,
                    below=3, keep=True, first=True)
    write_paragraph(text, cursor, sheet['subtitle'], bold=True, adjust=CENTER, below=12, keep=True)
    write_paragraph(text, cursor, MARKER)
    content = [{'text': line, 'below': 2} for line in sheet['details']]
    content[-1]['below'] = 12
    content += annex_body(definition['annex']['wording'], sheet['rolesHeading'])
    content.append({'text': sheet['statement'], 'bold': True, 'above': 18, 'keep': True})
    content += [{'text': line, 'above': 6, 'below': 2, 'keep': True} for line in sheet['signature']]
    content[-1]['keep'] = False
    fill_section(document, MARKER, content)
    hang_items(document)

    target = f'/work/templates/{sheet["file"]}'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    print(sheet['file'])


def main():
    with open('/work/tools/import/ssm-duties.ro.json', encoding='utf8') as file:
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
