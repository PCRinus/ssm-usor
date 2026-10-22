"""Builds the test sheet (ADR 024) from `test-sheet.ro.json`.

    pnpm --filter @ssm-usor/document-engine build-test-sheet

The sheet of one passing attempt in the portal: the unit, the title with the test's name, a box
with the employee, the day and the test's code, the questions as the sitting showed them with a
mark before each option the employee chose, the score and the grade, and the two signatures,
the trainee's and the examiner's. It is per employee, like the individual training sheets, and
written the same way, as plain OOXML on the package of the annual report (7.2) without its box
of document details: `build_sheets.write`.

It is always the form a signature goes in (ADR 023): no paper variant, since a paper test is
signed on the printed test itself and has no test sheet. Each signature box is a content
control titled with its field's name, which LibreOffice exports as a PDF text field and the
signer makes a signature field. The examiner's name and function are fields too, filled by the
API after the conversion: a member may change the result's examiner until the examiner signs,
and the attempt behind the sheet is frozen, so the sheet is filled again, never drawn up again.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_sheets import (  # noqa: E402
    ALL, HIRING_SIGNATURE_HEIGHT, SIGNATURE_GUTTER, TEXT_WIDTH, cell, control, escape,
    inline_paragraph, row, rpr, table, write)
from build_tests import spacer  # noqa: E402

SPEC = os.path.join(os.path.dirname(__file__), 'test-sheet.ro.json')
OPTION_LEFT = 1080
OPTION_HANG = 720


def run(text, *, size=10, bold=False, italic=False, tab=False):
    lead = '<w:tab/>' if tab else ''
    return f'<w:r>{rpr(size, bold, italic)}{lead}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(runs, *, size=10, bold=False, italic=False, align='left', before=0, after=0,
              keep=False, left=0, hanging=0, style='Normal'):
    props = (
        f'<w:pStyle w:val="{style}"/>'
        f'<w:keepNext w:val="{"true" if keep else "false"}"/>'
        '<w:pageBreakBefore w:val="false"/>'
        '<w:widowControl/><w:bidi w:val="0"/>'
        f'<w:spacing w:before="{before}" w:after="{after}"/>'
        f'<w:ind w:hanging="{hanging}" w:left="{left}"/>'
        f'<w:jc w:val="{align}"/>{rpr(size, bold, italic)}'
    )
    return f'<w:p><w:pPr>{props}</w:pPr>{"".join(runs)}</w:p>'


def text(content, **options):
    return paragraph([run(content, size=options.get('size', 10), bold=options.get('bold', False),
                          italic=options.get('italic', False))], **options)


def tag(name):
    """A loop tag alone in its paragraph, which the merge removes with it."""
    return paragraph([run(name)])


def cell_text(content, *, bold=False, align='left', keep=False, size=10):
    return text(content, bold=bold, align=align, keep=keep, size=size, style='TableContents')


def identity(spec):
    widths = [2300, 3655, 1800, TEXT_WIDTH - 2300 - 3655 - 1800]
    rows = [
        row([
            cell(width, [cell_text(content, bold=index % 2 == 0, keep=True)], borders=ALL, valign='center')
            for index, (width, content) in enumerate(zip(widths, line))
        ])
        for line in spec['identity']
    ]
    return table(widths, rows)


def option(spec, last):
    # Kept with the next option, the last one with nothing: a question and its options never part
    # at a page break, and the sheet is not one chain of kept paragraphs from start to end.
    mark = f'{{{{#chosen}}}}{spec["chosen"]}{{{{/chosen}}}}{{{{^chosen}}}}{spec["unchosen"]}{{{{/chosen}}}}'
    return paragraph(
        [run(mark), run('{{letter}})', bold=True, tab=True), run(' {{text}}')],
        after=120 if last else 40, keep=not last, left=OPTION_LEFT, hanging=OPTION_HANG,
    )


def questions(spec):
    return ''.join([
        tag('{{#questions}}'),
        text('{{number}}. {{text}}', bold=True, before=120, after=40, keep=True),
        tag('{{#options}}'),
        tag('{{^$last}}'),
        option(spec, False),
        tag('{{/$last}}'),
        tag('{{#$last}}'),
        option(spec, True),
        tag('{{/$last}}'),
        tag('{{/options}}'),
        tag('{{/questions}}'),
    ])


def result(spec):
    label = 3400
    widths = [label, TEXT_WIDTH - label]
    rows = [
        row([
            cell(widths[0], [cell_text(name, bold=True, keep=True)], borders=ALL, valign='center'),
            cell(widths[1], [cell_text(value, bold=index == 1, keep=index == 0)], borders=ALL,
                 valign='center'),
        ])
        for index, (name, value) in enumerate(spec['result'])
    ]
    return table(widths, rows)


def signatures(spec):
    """The two boxes side by side, a gutter between them: the caption, the signature field, then
    the person, printed for the trainee and filled for the examiner."""
    trainee, examiner = spec['signatures']['trainee'], spec['signatures']['examiner']
    width = (TEXT_WIDTH - SIGNATURE_GUTTER) // 2
    widths = [width, SIGNATURE_GUTTER, TEXT_WIDTH - SIGNATURE_GUTTER - width]
    gutter = cell(SIGNATURE_GUTTER, [cell_text('')])

    def pair(left, right, *, height=None):
        return row([cell(widths[0], left), gutter, cell(widths[2], right)], height=height)

    def boxed(name, each):
        return [inline_paragraph(control(name, each, 4, 10), size=10)]

    def filled(name, each):
        return [inline_paragraph(control(name, each, 1, 10), size=10)]

    rows = [
        pair([cell_text(trainee['caption'], bold=True, keep=True)],
             [cell_text(examiner['caption'], bold=True, keep=True)]),
        row([
            cell(widths[0], boxed(trainee['field'], widths[0]), borders=('bottom',)),
            gutter,
            cell(widths[2], boxed(examiner['field'], widths[2]), borders=('bottom',)),
        ], height=HIRING_SIGNATURE_HEIGHT),
        pair([cell_text(trainee['name'], keep=True)],
             filled(examiner['nameField'], widths[2])),
        pair([cell_text(trainee['role'])], filled(examiner['roleField'], widths[2])),
    ]
    return table(widths, rows)


def body(spec):
    return ''.join([
        text(spec['unit'], after=360),
        text(spec['title'], size=12, bold=True, align='center', after=60, keep=True),
        text(spec['subtitle'], bold=True, align='center', after=240),
        identity(spec),
        text(spec['legend'], italic=True, before=240, after=60),
        questions(spec),
        spacer(240),
        result(spec),
        text('', after=360, keep=True),
        signatures(spec),
    ])


if __name__ == '__main__':
    with open(SPEC, encoding='utf-8') as file:
        spec = json.load(file)
    write(spec['file'], body(spec))
