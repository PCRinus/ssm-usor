"""Builds document 13, the SSM duties of every post as annexes to the job descriptions (ADR 046).

    pnpm --filter @ssm-usor/document-engine build-ssm-duties

Not one of the provider's originals: the wording is ours, in `ssm-duties.ro.json`, which the API
also reads to fingerprint each annex (`src/ssm-duties.ts`), so a wording change shows every
acknowledgement signed on the old one as out of date. A4 portrait, with the set's box of document
details; the first page carries the hand-over block instead of a cover, as 9.2 does, and each
annex starts on a page of its own, since it is filed with its post's job descriptions.
"""

import json
import re
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    FONT, HANDOVER, LIST_HANG, LIST_TIERS, MARGINS, SMALL_PRINT, TITLE_SIZE, _elements, add_branding,
    all_paragraphs, build_header, fill_section, insert_handover, prop, start_office, sweep,
    write_paragraph)

MARKER = '@@content@@'
ITEM = 635
NESTED = 1270
ROLE_SECTIONS = {
    'workplace_manager': 'workplaceManagerDuties',
    'first_aid': 'firstAidDuties',
    'imminent_danger': 'imminentDangerDuties',
    'workers_representative': 'workersRepresentativeDuties',
}


def set_up_pages(document):
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        style.Width, style.Height = 21000, 29700
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
        # The box of document details sits inside the top margin, as on the set's other pages.
        style.TopMargin = 1200
        style.HeaderBodyDistance = 400
        closing = [item for item in _elements(style.HeaderText)
                   if item.supportsService('com.sun.star.text.Paragraph')][-1]
        closing.CharFontName = FONT
        closing.CharHeight = SMALL_PRINT
        add_branding(style)


def tag(name):
    return {'text': name, 'below': 0}


def section(name, content):
    return [tag(f'{{{{#{name}}}}}'), *content, tag(f'{{{{/{name}}}}}')]


def items(lines, indent=ITEM):
    return [{'text': line, 'indent': indent, 'below': 2} for line in lines]


LABEL = re.compile(r'^(–|[a-z]\)) ')


def hang_items(document):
    """The house's list layout, which `typeset` gives the originals: a typed dash or letter hangs
    from its tier with a tab after it, so a long item's lines run under its text, and a letter is
    bold. The wording keeps its spaces, as the API fingerprints it."""
    tiers = {ITEM: LIST_TIERS[0], NESTED: LIST_TIERS[1]}
    for paragraph, _ in all_paragraphs(document):
        match = LABEL.match(paragraph.getString())
        if not match or paragraph.ParaLeftMargin not in tiers:
            continue
        paragraph.ParaLeftMargin = tiers[paragraph.ParaLeftMargin]
        paragraph.ParaFirstLineIndent = LIST_HANG
        cursor = paragraph.getText().createTextCursorByRange(paragraph.getStart())
        cursor.goRight(len(match.group(1)), True)
        if match.group(1) != '–':
            cursor.CharWeight = 150
        cursor.collapseToEnd()
        cursor.goRight(1, True)
        cursor.setString('\t')


def annex_body(wording, roles_heading):
    """What an annex says, from its basis to its responsibility, which the acknowledgement sheet
    repeats for one worker (`build_duties_acknowledgement.py`)."""
    general, post, roles = wording['general'], wording['post'], wording['roles']
    role_blocks = []
    for key, name in ROLE_SECTIONS.items():
        role = roles[key]
        role_blocks += section(name, [
            {'text': role['title'], 'bold': True, 'above': 4, 'keep': True},
            {'text': role['lead'], 'keep': True},
            *items(role['items']),
        ])
    return [
        {'text': wording['basis']},
        {'text': general['heading'], 'bold': True, 'above': 6, 'keep': True},
        {'text': general['lead'], 'keep': True},
        *items(general['items']),
        {'text': post['heading'], 'bold': True, 'above': 6, 'keep': True},
        {'text': post['lead'], 'keep': True},
        *section('hasInstructions', [
            {'text': post['instructions'], 'indent': ITEM, 'below': 2, 'keep': True},
            *section('instructions', items([post['instruction']], NESTED)),
        ]),
        *section('equipment', items([post['equipment']])),
        *section('hasZones', [
            {'text': post['zones'], 'indent': ITEM, 'below': 2, 'keep': True},
            *section('zones', items([post['zone']], NESTED)),
        ]),
        *items([post['training']]),
        *section('hasRoles', [
            {'text': roles_heading, 'bold': True, 'above': 6, 'keep': True},
        ]),
        *role_blocks,
        {'text': wording['responsibility']['heading'], 'bold': True, 'above': 6, 'keep': True},
        {'text': wording['responsibility']['text']},
    ]


def annex_content(annex):
    return section('dutyAnnexes', [
        {'text': annex['heading'], 'bold': True, 'pageBefore': True, 'keep': True},
        {'text': annex['subheading'], 'bold': True, 'keep': True},
        {'text': annex['approval'], 'below': 12},
        *annex_body(annex['wording'], annex['wording']['roles']['heading']),
    ])


def build(desktop, definition):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    build_header(document, definition['header'])
    set_up_pages(document)
    text = document.Text
    cursor = text.createTextCursor()
    write_paragraph(text, cursor, definition['title'], size=TITLE_SIZE, bold=True, adjust=CENTER,
                    below=3, keep=True, first=True)
    write_paragraph(text, cursor, definition['subtitle'], bold=True, adjust=CENTER, below=12, keep=True)
    write_paragraph(text, cursor, MARKER)
    cursor.gotoStartOfParagraph(False)
    sides = tuple((lines,) + default[1:] for lines, default in zip(definition['handover'], HANDOVER))
    insert_handover(document, text, cursor, sides)
    content = [{'text': line} for line in definition['intro']]
    content += section('dutyAnnexes', items([definition['contents']]))
    content += annex_content(definition['annex'])
    fill_section(document, MARKER, content)
    hang_items(document)

    target = f'/work/templates/{definition["file"]}'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    sweep(target)
    print(definition['file'])


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
