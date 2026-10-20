"""Builds the bodies of the three knowledge tests (ADR 024) from `tests.ro.json`.

    pnpm --filter @ssm-usor/document-engine build-tests

The questions are the organization's question bank, merged in as `questions`, so a test's body
is the same for every test but its title and the heading of its key: the title and the line
saying that a question may have several correct answers, the questions, the table for the name,
the date, the two signatures and the result, the empty answer sheet, then on a new page the same
questions again and the key. Only `word/document.xml` is written, as plain OOXML: each file keeps
its own package, the box of document details in its header and the branding footer included, and
loses the pictures its original body held.
"""

import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from build_sheets import ALL, TEMPLATES, cell, escape, row, rpr  # noqa: E402

SPEC = os.path.join(os.path.dirname(__file__), 'tests.ro.json')
TEXT_WIDTH = 11906 - 1417 - 1134
# Tier 0 of the import's list tiers (LIST_TIERS, in 1/100 mm), the letter hanging from it.
OPTION_INDENT = 720
OPTION_HANG = 360


def run(text, *, size=10, bold=False, italic=False, tab=False):
    lead = '<w:tab/>' if tab else ''
    return f'<w:r>{rpr(size, bold, italic)}{lead}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(runs, *, size=10, bold=False, italic=False, align='left', before=0, after=0,
              keep=False, page=False, left=0, hanging=0, style='Normal'):
    props = (
        f'<w:pStyle w:val="{style}"/>'
        f'<w:keepNext w:val="{"true" if keep else "false"}"/>'
        f'<w:pageBreakBefore w:val="{"true" if page else "false"}"/>'
        '<w:widowControl/><w:bidi w:val="0"/>'
        f'<w:spacing w:before="{before}" w:after="{after}"/>'
        f'<w:ind w:hanging="{hanging}" w:left="{left}"/>'
        f'<w:jc w:val="{align}"/>{rpr(size, bold, italic)}'
    )
    return f'<w:p><w:pPr>{props}</w:pPr>{"".join(runs)}</w:p>'


def text(content, **options):
    size = options.get('size', 10)
    return paragraph([run(content, size=size, bold=options.get('bold', False),
                          italic=options.get('italic', False))], **options)


def tag(name):
    """A loop tag alone in its paragraph, which the merge removes with it."""
    return paragraph([run(name)])


# Where a loop's closing tag stands right above a table, merged tags leave no room behind: a
# paragraph at 1 pt asks for the 12 pt above the table.
def spacer(before):
    return (
        '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:keepNext w:val="true"/><w:widowControl/>'
        f'<w:spacing w:before="{before}" w:after="0" w:line="20" w:lineRule="exact"/>'
        '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/><w:lang w:val="ro-RO"/></w:rPr></w:pPr></w:p>'
    )


def option(last):
    # Kept with the next option, the last one with nothing: a question and its options never part
    # at a page break, and the test is not one chain of kept paragraphs from start to end.
    return paragraph(
        [run('{{letter}})', bold=True), run('{{text}}', tab=True)],
        before=0, after=120 if last else 40, keep=not last, left=OPTION_INDENT, hanging=OPTION_HANG,
    )


def questions():
    return ''.join([
        tag('{{#questions}}'),
        text('{{number}}. {{text}}', bold=True, before=120, after=40, keep=True),
        tag('{{#options}}'),
        tag('{{^$last}}'),
        option(False),
        tag('{{/$last}}'),
        tag('{{#$last}}'),
        option(True),
        tag('{{/$last}}'),
        tag('{{/options}}'),
        tag('{{/questions}}'),
    ])


def table(widths, rows, margin=55):
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="left"/>'
        '<w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        f'<w:tblCellMar><w:top w:w="{margin}" w:type="dxa"/><w:left w:w="55" w:type="dxa"/>'
        f'<w:bottom w:w="{margin}" w:type="dxa"/><w:right w:w="55" w:type="dxa"/></w:tblCellMar>'
        f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>'
    )


def cell_text(content, *, bold=False, align='left', keep=False):
    return text(content, bold=bold, align=align, keep=keep, style='TableContents')


def identity(spec):
    wide = (TEXT_WIDTH - 2059) // 3
    widths = [wide, wide, TEXT_WIDTH - 2059 - 2 * wide, 2059]
    rows = []
    for index, (first, second) in enumerate(spec['identity']):
        rows.append(row([
            cell(widths[0], [cell_text(first, bold=True, keep=True)], borders=ALL, valign='center'),
            cell(widths[1], [cell_text('')], borders=ALL, valign='center'),
            cell(widths[2], [cell_text(second, bold=True, keep=True)], borders=ALL, valign='center'),
            cell(widths[3], [cell_text('')], borders=ALL, valign='center'),
        ]))
    label, value = spec['result']
    rows.append(row([
        cell(widths[0], [cell_text(label, bold=True, keep=True)], borders=ALL, valign='center'),
        cell(sum(widths[1:]), [cell_text(value)], borders=ALL, span=3, valign='center'),
    ]))
    return table(widths, rows, margin=220)


def numbered(heading, value):
    """A row per question under a heading row repeated on every page: its number and `value`."""
    widths = [4251, TEXT_WIDTH - 4251]
    head = row([
        cell(width, [cell_text(title, bold=True, align='center', keep=True)], borders=ALL, valign='center')
        for width, title in zip(widths, heading)
    ], header=True)
    body = row([
        cell(widths[0], [cell_text('{{#questions}}{{number}}', align='center', keep=True)], borders=ALL,
             valign='center'),
        cell(widths[1], [cell_text(f'{value}{{{{/questions}}}}', align='center')], borders=ALL,
             valign='center'),
    ])
    return table(widths, [head, body], margin=80)


def body(spec, test):
    title = dict(size=12, bold=True, align='center', keep=True)
    several = dict(italic=True, align='center', keep=True)
    closing = (
        '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="0" w:line="20" '
        'w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/><w:lang w:val="ro-RO"/>'
        '</w:rPr></w:pPr></w:p>'
    )
    return ''.join([
        text(test['title'], **title),
        text(spec['several'], **several),
        questions(),
        spacer(240),
        identity(spec),
        text('', after=120, keep=True),
        numbered(spec['answers'], ''),
        text(test['title'], page=True, **title),
        text(spec['several'], **several),
        questions(),
        text(test['keyTitle'], bold=True, align='center', before=240, after=120, keep=True),
        numbered(spec['key'], '{{key}}'),
        closing,
    ])


def write(spec, test):
    target = os.path.join(TEMPLATES, test['file'])
    with zipfile.ZipFile(target) as source:
        parts = {item: source.read(item) for item in source.namelist()}
    original = parts['word/document.xml'].decode('utf-8')
    opening = original[:original.index('<w:body>')]
    section = re.search(r'<w:sectPr>.*?</w:sectPr>', original, re.S).group(0)
    document = f'{opening}<w:body>{body(spec, test)}{section}</w:body></w:document>'
    rels = re.sub(
        r'<Relationship [^>]*relationships/image"[^>]*/>', '',
        parts['word/_rels/document.xml.rels'].decode('utf-8'),
    )
    types = re.sub(
        r'<Override PartName="/word/media/[^"]*"[^>]*/>', '', parts['[Content_Types].xml'].decode('utf-8'),
    )
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for item, data in parts.items():
            if item.startswith('word/media/'):
                continue
            if item == 'word/document.xml':
                data = document.encode('utf-8')
            elif item == 'word/_rels/document.xml.rels':
                data = rels.encode('utf-8')
            elif item == '[Content_Types].xml':
                data = types.encode('utf-8')
            info = zipfile.ZipInfo(item, date_time=(2026, 10, 20, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
    print(f'wrote templates/{test["file"]}')


if __name__ == '__main__':
    with open(SPEC, encoding='utf-8') as file:
        spec = json.load(file)
    for test in spec['tests']:
        write(spec, test)
