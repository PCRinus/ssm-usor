"""Builds the two individual training sheets (ADR 021).

    pnpm --filter @ssm-usor/document-engine build-sheets

The occupational safety sheet follows annex 11 of the methodological norms of H.G. 1425/2006,
the fire-safety one the annex of the general dispositions of OMAI 712/2005: their rubrics,
in their order, typeset to the house style. Both are written as plain OOXML, without
LibreOffice, on the package of the annual report (7.2): its styles, settings, fonts, theme and
footer, without its box of document details, since a sheet is a form and carries no issue
date; in Word 2013's layout (`word_layout`) and the table house style (`table_style`), as the
occupational safety set. The identification block, the hiring trainings and the admission are
form grids (`form_grid`): each rubric a ruled box, its label small at the top, room to write
under it.

Each sheet is also the form of the signed sheet (ADR 023): with `form.on` the hiring blocks, the
admission and the periodic tables print their variant with a content control in every cell a
training or a signature fills, titled with the field's name (packages/contracts signed-sheet.ts),
which LibreOffice exports as a PDF text field.
"""

import itertools
import os
import zipfile

from decision_pages import HEADER_TYPE, HEADER_RELATIONSHIP, header
from table_style import FORM_GRID, draws_house_tables, house_tables_part
from word_layout import lays_out_as_word_2013, word_2013_part

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEMPLATES = os.path.join(ROOT, 'templates')
PACKAGE = os.path.join(TEMPLATES, 'fire', '7.2_fire_annual_report.docx')

TEXT_WIDTH = 11906 - 1417 - 1134
SIGNATURE_HEIGHT = 680
# A periodic row of fields, a little lower than a row on paper, which its fields still fill: a
# training transcribed from paper prints as text above them, taller with a long material, and the
# page must still hold all of the table's rows.
FIELD_ROW_HEIGHT = 640
LINE = '<w:{side} w:val="single" w:sz="8" w:space="0" w:color="000000"/>'
# A form, not a table of data: every line of a grid is 0.5 pt, the frame too.
THIN = '<w:{side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
TABLE_PADDING = 55
GRID_PADDING = 85
# The law's longest captions, „Semnătura celui care a efectuat instruirea”, on one line in a third.
CAPTION_PADDING = 55
GRID_UNITS = 12
RUBRIC_HEIGHT = 620
# The house signing space: 25 mm for a signature and a stamp.
SIGNING_ROOM = 1417
# The signer never wraps a value, it sets a line too long for its field smaller: a name, a job title,
# a place or an occupation gets two lines, which the API wraps it to (`form.ts`).
TWO_LINE_FIELDS = ('trainer', 'trainer_job_title', 'place', 'occupation', 'name', 'job_title')
# The rows of a periodic table the signed sheet holds, those of a page (rowCapacity in contracts).
ROW_CAPACITY = 17
# The signed sheet's rows of test results: the five the paper sheet prints at the least.
TEST_ROW_CAPACITY = 5
FIELD_SIZE = 8
TRANSCRIPTION_LINE_FIELD = 'transcription_line'
CONTROL_IDS = itertools.count(1)
# Apple's viewers draw a multiline field's text at about 1.2 times the size plus 1.2 pt a line, and
# take 3.5 pt more for the field (APPLE_LEADING, APPLE_LINE_GAP, APPLE_PADDING in the signer),
# where LibreOffice gives a 10 pt line 11.7 pt: a field of several lines at the body size has its
# lines spaced to Apple's and a 7 pt line after them (the smallest size of the house style), so
# that the signer sets its text at the body size and no smaller.
MERGED_FIELD_LINE = 272
MERGED_FIELD_PADDING_SIZE = 7
HEADER_LINES = {'ssm': 'Fișa SSM · {{employee.headerName}}', 'su': 'Fișa SU · {{employee.headerName}}'}
HEADER_ID = 'rIdSheetHeader'
FIRST_HEADER_ID = 'rIdSheetFirstHeader'


def escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def rpr(size=10, bold=False, italic=False):
    half = int(size * 2)
    weight = '<w:b/>' if bold else '<w:b w:val="false"/>'
    slant = '<w:i/>' if italic else '<w:i w:val="false"/>'
    return (
        '<w:rPr><w:rFonts w:eastAsia="Arial" w:cs="Arial" w:ascii="Arial" w:hAnsi="Arial"/>'
        f'{weight}{slant}'
        '<w:color w:val="auto"/><w:spacing w:val="0"/><w:w w:val="100"/>'
        f'<w:sz w:val="{half}"/><w:szCs w:val="{half}"/><w:lang w:val="ro-RO"/></w:rPr>'
    )


def run(text, size=FIELD_SIZE, bold=False):
    return f'<w:r>{rpr(size, bold)}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(
    text='',
    *,
    size=10,
    bold=False,
    italic=False,
    align='left',
    before=0,
    after=120,
    line=None,
    keep=False,
    page=False,
    style='Normal',
    runs=None,
    ends_section='',
):
    spacing = f' w:line="{line[0]}" w:lineRule="{line[1]}"' if line else ''
    props = (
        f'<w:pStyle w:val="{style}"/>'
        f'<w:keepNext w:val="{"true" if keep else "false"}"/>'
        f'<w:pageBreakBefore w:val="{"true" if page else "false"}"/>'
        '<w:widowControl/><w:bidi w:val="0"/>'
        f'<w:spacing w:before="{before}" w:after="{after}"{spacing}/>'
        '<w:ind w:hanging="0" w:left="0"/>'
        f'<w:jc w:val="{align}"/>{rpr(size, bold, italic)}{ends_section}'
    )
    if runs is None:
        runs = f'<w:r>{rpr(size, bold, italic)}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ''
    return f'<w:p><w:pPr>{props}</w:pPr>{runs}</w:p>'


def cell_paragraph(text='', *, size=10, bold=False, align='left', before=0, after=0):
    return paragraph(text, size=size, bold=bold, align=align, before=before, after=after, style='TableContents')


def inline_paragraph(inner, *, size=FIELD_SIZE, align='left', line=None, after=0):
    return paragraph(size=size, align=align, after=after, line=line and (line, 'auto'), style='TableContents',
                     runs=inner)


def cell(width, content, *, borders=(), span=1, merge=None, valign='top', line=LINE, sides=None):
    """`content` is a list of paragraphs; `borders` the sides that draw a line."""
    lines = ''.join(line.format(side=side) for side in ('top', 'left', 'bottom', 'right') if side in borders)
    props = f'<w:tcW w:w="{width}" w:type="dxa"/>'
    if span > 1:
        props += f'<w:gridSpan w:val="{span}"/>'
    if merge == 'restart':
        props += '<w:vMerge w:val="restart"/>'
    elif merge == 'continue':
        props += '<w:vMerge/>'
    props += f'<w:tcBorders>{lines}</w:tcBorders>'
    if sides is not None:
        props += f'<w:tcMar><w:left w:w="{sides}" w:type="dxa"/><w:right w:w="{sides}" w:type="dxa"/></w:tcMar>'
    props += f'<w:vAlign w:val="{valign}"/>'
    return f'<w:tc><w:tcPr>{props}</w:tcPr>{"".join(content) or cell_paragraph()}</w:tc>'


def row(cells, *, height=None, header=False):
    props = '<w:cantSplit/>'
    if height:
        props += f'<w:trHeight w:val="{height}" w:hRule="atLeast"/>'
    if header:
        props += '<w:tblHeader/>'
    return f'<w:tr><w:trPr>{props}</w:trPr>{"".join(cells)}</w:tr>'


def table(widths, rows, *, padding=TABLE_PADDING, caption=''):
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="left"/>'
        '<w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        f'<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="{padding}" w:type="dxa"/>'
        f'<w:bottom w:w="40" w:type="dxa"/><w:right w:w="{padding}" w:type="dxa"/></w:tblCellMar>'
        f'{caption}</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>'
    )


ALL = ('top', 'left', 'bottom', 'right')


def heading(text, *, page=False, before=360):
    return paragraph(text, size=11, bold=True, before=before, after=120, keep=True, page=page)


def block_title(text):
    return paragraph(text, bold=True, before=240, after=80, keep=True)


def control(name, room, lines=1, size=FIELD_SIZE, placeholder=None, spaced=False):
    """A plain-text content control titled `name`, in a cell whose text is `room` twips wide.
    LibreOffice exports it as a text field as wide and as tall as its placeholder, so the
    placeholder is lines of en spaces across the cell, or `placeholder`, a tag the merge fills
    with as many such lines as the field is to hold. `spaced` lines are set to Apple's leading
    (MERGED_FIELD_LINE), as a placeholder's are."""
    r = rpr(size)

    def filler(size):
        count = max(1, int((room - 60) // (size * 10)))
        return f'<w:r>{rpr(size)}<w:t xml:space="preserve">{chr(0x2002) * count}</w:t></w:r>'

    # The last line as wide as the others: LibreOffice takes the field's width from it.
    padding = f'<w:r>{rpr(MERGED_FIELD_PADDING_SIZE)}<w:br/></w:r>{filler(MERGED_FIELD_PADDING_SIZE)}'
    if placeholder:
        content = f'<w:r>{r}<w:t xml:space="preserve">{placeholder}</w:t></w:r>{padding}'
    else:
        content = f'<w:r>{r}<w:br/></w:r>'.join([filler(size)] * lines) + (padding if spaced else '')
    multiline = ' w:multiLine="1"' if lines > 1 or placeholder else ''
    return (
        f'<w:sdt><w:sdtPr>{r}<w:alias w:val="{name}"/><w:tag w:val="{name}"/>'
        f'<w:id w:val="{next(CONTROL_IDS)}"/><w:showingPlcHdr/><w:text{multiline}/></w:sdtPr>'
        f'<w:sdtContent>{content}</w:sdtContent></w:sdt>'
    )


GRID = [TEXT_WIDTH // GRID_UNITS] * (GRID_UNITS - 1) + [TEXT_WIDTH - TEXT_WIDTH // GRID_UNITS * (GRID_UNITS - 1)]


def rubric(label, units, value, height=RUBRIC_HEIGHT):
    """A box of a form grid `units` twelfths wide: `value(room)` gives the paragraph under the
    label, `room` the width its text has."""
    return {'units': units, 'height': height, 'sides': ALL, 'valign': 'top',
            'content': lambda room: [cell_paragraph(label, size=8, after=30), value(room)]}


def text_value(value):
    return lambda room: cell_paragraph(value)


def field_value(name, placeholder=None):
    lines = 2 if name.split('_', 1)[1] in TWO_LINE_FIELDS else 1
    spaced = bool(placeholder) or lines > 1
    return lambda room: inline_paragraph(
        control(name, room, lines, size=10, placeholder=placeholder, spaced=spaced), size=10,
        line=MERGED_FIELD_LINE if spaced else None)


def signature_rows(slots):
    """The signature boxes of a block across the grid: the law's caption at the top, then the
    signing room, whose `content(room)` stands at its foot."""
    units = GRID_UNITS // len(slots)
    captions = [{'units': units, 'sides': ('top', 'left', 'right'), 'valign': 'top', 'padding': CAPTION_PADDING,
                 'content': lambda room, caption=caption: [cell_paragraph(caption, size=8, align='center')]}
                for caption, _ in slots]
    rooms = [{'units': units, 'height': SIGNING_ROOM, 'sides': ('left', 'bottom', 'right'), 'valign': 'bottom',
              'content': content} for _, content in slots]
    return [captions, rooms]


def signed_by(note, name):
    """A paper signing room's foot: the merge's mark of a training transcribed from a paper sheet
    (ADR 042), empty for the pen, and the name of who signs; the trainee's is never printed."""
    return lambda room: [cell_paragraph(note, size=7, align='center'),
                         cell_paragraph(name or '', size=8, bold=True, align='center')]


def signature_field(name):
    return lambda room: [inline_paragraph(control(name, room, 4, 10), size=10, align='center')]


def form_grid(lines):
    """`lines` of boxes (`rubric`, `signature_rows`) on a grid of twelve units."""
    drawn = []
    for line in lines:
        cells, at = [], 0
        for box in line:
            width = sum(GRID[at:at + box['units']])
            padding = box.get('padding')
            content = box['content'](width - 2 * (padding or GRID_PADDING))
            cells.append(cell(width, content, borders=box['sides'], span=box['units'], valign=box['valign'],
                              line=THIN, sides=padding))
            at += box['units']
        heights = [box['height'] for box in line if 'height' in box]
        drawn.append(row(cells, height=max(heights, default=None)))
    kept = [each.replace('<w:keepNext w:val="false"/>', '<w:keepNext w:val="true"/>') for each in drawn[:-1]]
    return table(GRID, kept + drawn[-1:], padding=GRID_PADDING, caption=FORM_GRID)


def grid_table(columns, loops, *, blank_rows=0, size=8, row_height=SIGNATURE_HEIGHT, extra_rows=()):
    """A printed table: its heading, the rows of each loop, then `blank_rows` empty ones.

    `columns` is a list of `(width, heading, value)`; a heading may be a `(group, own)` pair
    for the signature columns grouped under one caption. A loop is `(name, values)` where
    values replace the column values.
    """
    widths = [width for width, _, _ in columns]
    grouped = any(isinstance(title, tuple) for _, title, _ in columns)
    if grouped:
        first, second = [], []
        index = 0
        while index < len(columns):
            width, title, _ = columns[index]
            if isinstance(title, tuple):
                group = title[0]
                members = [c for c in columns[index:] if isinstance(c[1], tuple) and c[1][0] == group]
                span_width = sum(c[0] for c in members)
                first.append(
                    cell(span_width, [cell_paragraph(group, size=size, bold=True, align='center')],
                         borders=ALL, span=len(members), valign='center')
                )
                for member in members:
                    second.append(
                        cell(member[0], [cell_paragraph(member[1][1], size=size, bold=True, align='center')],
                             borders=ALL, valign='center')
                    )
                index += len(members)
            else:
                first.append(
                    cell(width, [cell_paragraph(title, size=size, bold=True, align='center')],
                         borders=ALL, merge='restart', valign='center')
                )
                second.append(cell(width, [cell_paragraph(size=size)], borders=ALL, merge='continue'))
                index += 1
        header_rows = [row(first, header=True), row(second, header=True)]
    else:
        header_rows = [
            row(
                [
                    cell(width, [cell_paragraph(title, size=size, bold=True, align='center')],
                         borders=ALL, valign='center')
                    for width, title, _ in columns
                ],
                header=True,
            )
        ]
    body = []
    for name, values in loops:
        cells = []
        last = len(columns) - 1
        for index, ((width, _, _), value) in enumerate(zip(columns, values)):
            text, small = value if isinstance(value, tuple) else (value, False)
            if index == 0:
                text = f'{{{{#{name}}}}}{text}'
            if index == last:
                text = f'{text}{{{{/{name}}}}}'
            cells.append(
                cell(width, [cell_paragraph(text, size=7 if small else size,
                                            align='center' if small else 'left')],
                     borders=ALL, valign='bottom' if small else 'top')
            )
        body.append(row(cells, height=row_height))
    for _ in range(blank_rows):
        body.append(row([cell(width, [cell_paragraph(size=size)], borders=ALL) for width in widths],
                        height=row_height))
    return table(widths, header_rows + body + list(extra_rows))


def boxes(title, closing, count, footnote=None):
    half = (TEXT_WIDTH - 455) // 2
    left = half // 2
    right = half - left
    widths = [left, right, 455, left, right]
    rows = []
    for index in range(count):
        if index:
            rows.append(row([cell(w, [cell_paragraph()]) for w in widths], height=240))
        rows.append(row([
            cell(half, [cell_paragraph(title, size=8, bold=True)], borders=('top', 'left', 'right'), span=2),
            cell(455, [cell_paragraph()]),
            cell(half, [cell_paragraph(title, size=8, bold=True)], borders=('top', 'left', 'right'), span=2),
        ]))
        rows.append(row([
            cell(half, [cell_paragraph()], borders=('left', 'right'), span=2),
            cell(455, [cell_paragraph()]),
            cell(half, [cell_paragraph()], borders=('left', 'right'), span=2),
        ], height=1100))
        signed = [
            cell(left, [cell_paragraph(closing[0], size=8)], borders=('left', 'bottom')),
            cell(right, [cell_paragraph(closing[1], size=8, align='right')], borders=('right', 'bottom')),
        ]
        rows.append(row([*signed, cell(455, [cell_paragraph()]), *signed]))
    if footnote:
        rows.append(row([cell(TEXT_WIDTH, [cell_paragraph(footnote, size=8, before=60)], span=5)]))
    return table(widths, rows)


def section(flag, xml, inverted=False):
    """`xml` where the data's `flag` holds (or does not, `inverted`); the merge removes the tags'
    paragraphs."""
    mark = '^' if inverted else '#'
    return paragraph(f'{{{{{mark}{flag}}}}}', after=0) + xml + paragraph(f'{{{{/{flag}}}}}', after=0)


def paper(xml):
    return section('form.on', xml, inverted=True)


def form(xml):
    return section('form.on', xml)


def form_rows(prefix, columns, capacity=ROW_CAPACITY, height=FIELD_ROW_HEIGHT):
    """The field rows `{prefix}1` to `{prefix}{capacity}` of a table, each printed where
    `form.rows.{key}` holds. `columns` are `(width, cell)`, `cell(key, room)` giving the inline
    content of the cell's paragraphs."""
    rows = []
    for index in range(1, capacity + 1):
        key = f'{prefix}{index}'
        cells = []
        for position, (width, content) in enumerate(columns):
            paragraphs = content(key, width - 2 * TABLE_PADDING)
            if position == 0:
                paragraphs[0] = run(f'{{{{#form.rows.{key}}}}}') + paragraphs[0]
            if position == len(columns) - 1:
                paragraphs[-1] = paragraphs[-1] + run(f'{{{{/form.rows.{key}}}}}')
            cells.append(cell(width, [inline_paragraph(each) for each in paragraphs], borders=ALL))
        rows.append(row(cells, height=height))
    return rows


def field_cell(column, lines=1):
    return lambda key, room: [control(f'{key}_{column}', room, lines)]


def dated_cell(key, room):
    # Two lines of note: "transcris; semnat pe hârtie" on one is set too small to read.
    return [control(f'{key}_date', room), control(f'{key}_note', room, 2)]


def number_cell(key, room):
    return [run(key[1:])]


SSM_PERIODIC_COLUMNS = [
    (1100, 'Data instruirii', '{{heldOn}}'),
    (700, 'Durata (h)', '{{hours}}'),
    (1300, 'Ocupația', '{{occupation}}'),
    (2555, 'Materialul predat', '{{material}}'),
    (1200, ('Semnătura celui', 'instruit'), ('{{note}}', True)),
    (1250, ('Semnătura celui', 'care a instruit'), ('{{trainer}}', True)),
    (1250, ('Semnătura celui', 'care a verificat instruirea'), ('{{verifier}}', True)),
]


def ssm_periodic(title, first_heading, loop, prefix):
    columns = [(SSM_PERIODIC_COLUMNS[0][0], first_heading, '{{heldOn}}'), *SSM_PERIODIC_COLUMNS[1:]]
    values = [value for _, _, value in columns]
    widths = [width for width, _, _ in columns]
    fields = form_rows(prefix, list(zip(widths, [
        dated_cell,
        field_cell('duration'),
        field_cell('occupation', 3),
        field_cell('material', 3),
        field_cell('sig_trainee', 3),
        field_cell('sig_trainer', 3),
        field_cell('sig_verifier', 3),
    ])))
    return (
        heading(title, page=True, before=0)
        + paper(grid_table(columns, [(loop, values), (f'blankRows.{loop}', [''] * len(columns))]))
        + form(grid_table(columns, [(loop, values)], extra_rows=fields))
    )


def hiring(title, key, line, layout, rubrics, slots):
    """A hiring training's block: `layout` lines of `(label, units)` or `(label, units, height)`,
    `rubrics` each label's `(value, column)`, `slots` each signature's `(caption, signer, slot)`.
    As text on the paper sheet and, on the signed sheet, for a training recorded from a paper
    sheet, each signing room with the block's note; else every value and signature a field, and
    a box for the block's note."""
    def grid(lines, value, signature):
        boxes = [[rubric(label, units, value(label), *height) for label, units, *height in each] for each in lines]
        return form_grid(boxes + signature_rows([(caption, signature(signer, slot))
                                                 for caption, signer, slot in slots]))

    note = f'{{{{hiring.{line}.note}}}}'
    as_text = grid(layout, lambda label: text_value(f'{{{{hiring.{line}.{rubrics[label][0]}}}}}'),
                   lambda signer, slot: signed_by(note, signer and f'{{{{signers.{signer}}}}}'))

    def field(label):
        if label == NOTE:
            return field_value(f'{key}_note')
        column = rubrics[label][1]
        return field_value(f'{key}_{column}',
                           f'{{{{form.{key}.materialPlaceholder}}}}' if column == 'material' else None)

    as_fields = grid([*layout, [(NOTE, GRID_UNITS)]], field,
                     lambda signer, slot: signature_field(f'{key}_sig_{slot}'))
    return (
        block_title(title)
        + paper(as_text)
        + form(section(f'form.{key}.paper', as_text) + section(f'form.{key}.paper', as_fields, inverted=True))
    )


NOTE = 'Mențiuni'
MATERIAL_HEIGHT = 1100


def ssm_hiring(number, title, line, workplace=False):
    key = 'h2' if workplace else 'h1'
    if workplace:
        layout = [[('A fost efectuată la data', 3), ('Loc de muncă/post de lucru', 9)],
                  [('Timp de (ore)', 2), ('De către', 4), ('Având funcția de', 6)]]
    else:
        layout = [[('A fost efectuată la data', 3), ('Timp de (ore)', 2), ('De către', 3), ('Având funcția de', 4)]]
    layout.append([('Conținutul instruirii', GRID_UNITS, MATERIAL_HEIGHT)])
    rubrics = {
        'A fost efectuată la data': ('heldOn', 'date'),
        'Loc de muncă/post de lucru': ('place', 'place'),
        'Timp de (ore)': ('hours', 'duration'),
        'De către': ('trainer', 'trainer'),
        'Având funcția de': ('trainerJobTitle', 'trainer_job_title'),
        'Conținutul instruirii': ('material', 'material'),
    }
    slots = [
        ('Semnătura celui instruit', None, 'trainee'),
        ('Semnătura celui care a efectuat instruirea', f'{line}.trainer', 'trainer'),
        ('Semnătura celui care a verificat însușirea cunoștințelor', f'{line}.verifier', 'verifier'),
    ]
    return hiring(f'{number}) {title}', key, line, layout, rubrics, slots)


SSM_TEST_COLUMNS = [
    (1500, 'Data', '{{date}}'),
    (3955, 'Materialul examinat', '{{material}}'),
    (1700, 'Calificativ', '{{grade}}'),
    (2200, 'Examinator', '{{examiner}}'),
]


def ssm_test_results():
    """Annex 11's block of test results (ADR 024), a row per pass and blank rows after them; on the
    signed sheet the passes known when it is made as text, then a row of fields per `t` key."""
    values = [value for _, _, value in SSM_TEST_COLUMNS]
    widths = [width for width, _, _ in SSM_TEST_COLUMNS]
    fields = form_rows('t', list(zip(widths, [
        dated_cell,
        field_cell('material', 3),
        field_cell('grade'),
        field_cell('examiner', 2),
    ])), capacity=TEST_ROW_CAPACITY, height=SIGNATURE_HEIGHT)
    return (
        paper(grid_table(SSM_TEST_COLUMNS, [('testResults', values),
                                            ('blankRows.testResults', [''] * len(values))], row_height=480))
        + form(grid_table(SSM_TEST_COLUMNS, [('testResults', values)], row_height=480, extra_rows=fields))
    )


def empty_table(columns, rows=5, height=480):
    return grid_table([(width, title, '') for width, title in columns], [], blank_rows=rows, row_height=height)


def continuation():
    return section('form.continuation', paragraph('{{form.continuation}}', italic=True, align='center',
                                                  after=240))


def transcription_line():
    """The line on transcribed rows (ADR 042): text where the merge gives it; on the signed sheet a
    field, filled when the sheet is drawn up with paper rows or when one is filled on it later."""
    def boxed(content):
        # A table, as the house style sets text under the body size only in one.
        return table([TEXT_WIDTH], [row([cell(TEXT_WIDTH, [content])])]) + paragraph(after=0)

    return (
        paper(section('transcriptionLine', boxed(cell_paragraph('{{transcriptionLine}}', size=9))))
        + form(boxed(inline_paragraph(control(TRANSCRIPTION_LINE_FIELD, TEXT_WIDTH - 2 * TABLE_PADDING, 1, 9),
                                      size=9)))
    )


def unit_line(label, after):
    return paragraph(after=after, runs=run(label, 10) + run('{{client.legalName}}', 10, bold=True))


def text_grid(layout, values):
    """A grid of rubrics printed as text: `layout` lines of `(label, units)` or `(label, units,
    height)`, `values` each label's."""
    return form_grid([[rubric(label, units, text_value(values[label]), *height) for label, units, *height in line]
                      for line in layout])


def admission(as_text, as_fields):
    """The admission, as text on the paper sheet and where the workplace training is transcribed
    from paper, else filled by the workplace training's fields."""
    return (
        paper(as_text)
        + form(section('form.h2.paper', as_text) + section('form.h2.paper', as_fields, inverted=True))
    )


ADMITTED_ON = '{{admission.admittedOn}}{{#admission.note}}, {{admission.note}}{{/admission.note}}'


def ssm_admission():
    names = [('Numele și prenumele', 6, '{{admission.name}}', 'adm_name'),
             ('Funcția (șef secție, atelier, șantier etc.)', 6, '{{admission.jobTitle}}', 'adm_job_title')]
    as_text = form_grid([
        [rubric(label, units, text_value(value)) for label, units, value, _ in names],
        [rubric('Data și semnătura', GRID_UNITS, text_value(ADMITTED_ON), MATERIAL_HEIGHT)],
    ])
    as_fields = form_grid([
        [rubric(label, units, field_value(name)) for label, units, _, name in names],
        [rubric('Data', 3, field_value('adm_date'), MATERIAL_HEIGHT),
         rubric('Semnătura', 9, lambda room: inline_paragraph(control('adm_sig', room, 3, 10), size=10),
                MATERIAL_HEIGHT)],
    ])
    return block_title('3) Admis la lucru') + admission(as_text, as_fields)


def ssm_body():
    return ''.join([
        unit_line('Întreprinderea/unitatea: ', after=360),
        paragraph('FIȘĂ DE INSTRUIRE INDIVIDUALĂ', size=12, bold=True, align='center', after=60, keep=True),
        paragraph('privind securitatea și sănătatea în muncă', bold=True, align='center', after=60, keep=True),
        paragraph('conform anexei nr. 11 la normele metodologice aprobate prin H.G. 1425/2006',
                  align='center', after=240),
        continuation(),
        transcription_line(),
        text_grid([
            [('Numele și prenumele', 8), ('Legitimația, marca', 4)],
            [('Grupa sanguină', 3), ('Domiciliul', 9)],
            [('Data și locul nașterii', 4), ('Calificarea', 4), ('Funcția', 4)],
            [('Locul de muncă', 12)],
            [('Autorizații (ISCIR ș.a.)', 12)],
            [('Traseul de deplasare la/de la serviciu', 12, 760)],
        ], {
            'Numele și prenumele': '{{employee.name}}',
            'Legitimația, marca': '{{employee.employeeNumber}}',
            'Grupa sanguină': '{{employee.bloodGroup}}',
            'Domiciliul': '{{employee.homeAddress}}',
            'Data și locul nașterii': '{{employee.birth}}',
            'Calificarea': '{{employee.qualification}}',
            'Funcția': '{{employee.contractTitle}}',
            'Locul de muncă': '{{employee.workplace}}',
            'Autorizații (ISCIR ș.a.)': '{{employee.authorizations}}',
            'Traseul de deplasare la/de la serviciu': '{{employee.commute}}',
        }),
        heading('Instruirea la angajare'),
        ssm_hiring(1, 'Instruirea introductiv-generală', 'introductory'),
        ssm_hiring(2, 'Instruirea la locul de muncă', 'workplace', workplace=True),
        ssm_admission(),
        ssm_periodic('Instruirea periodică', 'Data instruirii', 'periodic', 'p'),
        ssm_periodic('Instruirea periodică suplimentară', 'Data efectuării', 'supplementary', 's'),
        heading('Rezultatele testărilor', page=True, before=0),
        ssm_test_results(),
        heading('Accidente de muncă sau îmbolnăviri profesionale suferite'),
        empty_table([
            (2000, 'Data producerii evenimentului'),
            (3555, 'Diagnosticul medical'),
            (2600, 'Nr. și data PV de cercetare a evenimentului'),
            (1200, 'Nr. zile ITM'),
        ]),
        heading('Sancțiuni aplicate pentru nerespectarea reglementărilor de securitate și sănătate în muncă'),
        empty_table([(4000, 'Abaterea săvârșită'), (2855, 'Sancțiunea administrativă'), (2500, 'Nr. și data deciziei')]),
        heading('Control medical periodic', page=True, before=0),
        boxes('Observații de specialitate',
              ('Semnătura și parafa medicului de medicina muncii', 'Data vizei'), 2),
        heading('Testarea psihologică periodică'),
        boxes('Apt psihologic pentru:*', ('Semnătura psihologului', 'Data'), 2,
              footnote='* lucru la înălțime, lucru în condiții de izolare, conducători auto etc.'),
    ])


def su_hiring(number, title, line, workplace=False):
    key = 'h2' if workplace else 'h1'
    if workplace:
        layout = [[('Efectuat la data de', 3), ('Pentru locul de muncă', 6), ('Specialitatea (meseria)', 3)],
                  [('Timp de (ore)', 2), ('De către', 4), ('Având funcția de', 6)]]
    else:
        layout = [[('Efectuat la data de', 3), ('Timp de (ore)', 2), ('De către', 3), ('Având funcția de', 4)]]
    layout.append([('Conținutul instructajului', GRID_UNITS, MATERIAL_HEIGHT)])
    rubrics = {
        'Efectuat la data de': ('heldOn', 'date'),
        'Pentru locul de muncă': ('place', 'place'),
        'Specialitatea (meseria)': ('occupation', 'occupation'),
        'Timp de (ore)': ('hours', 'duration'),
        'De către': ('trainer', 'trainer'),
        'Având funcția de': ('trainerJobTitle', 'trainer_job_title'),
        'Conținutul instructajului': ('material', 'material'),
    }
    # The record names who verified as its trainer when it has no verifier (ADR 021).
    slots = [
        ('Semnătura salariatului (persoanei care a verificat însușirea cunoștințelor)', f'{line}.verifier',
         'trainer'),
        ('Semnătura persoanei instruite', None, 'trainee'),
    ]
    return hiring(f'{number}. {title}', key, line, layout, rubrics, slots)


SU_PERIODIC_COLUMNS = [
    (600, 'Nr. crt.', '{{$index}}'),
    (1100, 'Data', '{{heldOn}}'),
    (1500, 'Specialitatea', '{{occupation}}'),
    (2855, 'Materialul predat', '{{material}}'),
    (800, 'Durata (ore)', '{{hours}}'),
    (1250, 'Semnătura persoanei instruite', ('{{note}}', True)),
    (1250, 'Semnătura celui care a instruit', ('{{trainer}}', True)),
]


def warning():
    """The cover's back: the model's warning alone, low on the page, without a frame. A spacer
    rather than room above the title: LibreOffice drops the space before a paragraph at the top
    of a page."""
    lines = ('Nicio persoană nu va fi admisă la lucru', 'fără efectuarea instructajului introductiv general',
             'și a instructajului la locul de muncă.')
    breaks = f'<w:r>{rpr(13)}<w:br/></w:r>'.join(run(each, 13) for each in lines)
    return [
        paragraph(page=True, after=0, line=(5200, 'exact')),
        paragraph('ATENȚIE!', size=18, bold=True, align='center', after=300, keep=True),
        paragraph(size=13, align='center', after=0, line=(400, 'auto'), runs=breaks,
                  ends_section=section_properties()),
    ]


def su_admission():
    rubrics = [('Data', 3, '{{admission.admittedOn}}', 'adm_date'),
               ('Numele și prenumele', 5, '{{admission.name}}', 'adm_name'),
               ('Funcția (șef secție, atelier, șantier etc.)', 4, '{{admission.jobTitle}}', 'adm_job_title')]
    as_text = form_grid([[rubric(label, units, text_value(value)) for label, units, value, _ in rubrics]])
    as_fields = form_grid([[rubric(label, units, field_value(name)) for label, units, _, name in rubrics]])
    return block_title('3. Admis la lucru') + admission(as_text, as_fields)


def su_body():
    values = [value for _, _, value in SU_PERIODIC_COLUMNS]
    widths = [width for width, _, _ in SU_PERIODIC_COLUMNS]
    fields_rows = form_rows('p', list(zip(widths, [
        number_cell,
        dated_cell,
        field_cell('occupation', 3),
        field_cell('material', 3),
        field_cell('duration'),
        field_cell('sig_trainee', 3),
        field_cell('sig_trainer', 3),
    ])))
    return ''.join([
        unit_line('Unitatea: ', after=0),
        paragraph('FIȘĂ INDIVIDUALĂ', size=16, bold=True, align='center', before=3000, after=120, keep=True),
        paragraph('de instructaj în domeniul situațiilor de urgență', size=12, bold=True, align='center',
                  after=60, keep=True),
        paragraph('conform anexei la dispozițiile generale aprobate prin OMAI 712/2005', align='center',
                  after=1200),
        continuation(),
        transcription_line(),
        text_grid([[('Numele și prenumele', 9), ('Marca', 3)], [('Domiciliul', 12)]], {
            'Numele și prenumele': '{{employee.name}}',
            'Marca': '{{employee.employeeNumber}}',
            'Domiciliul': '{{employee.homeAddress}}',
        }),
        *warning(),
        heading('Date personale', before=0),
        text_grid([
            [('Data și locul nașterii', 4), ('Studii', 4), ('Calificarea (specialitatea, meseria)', 4)],
            [('Locul de muncă', 8), ('Funcția', 4)],
        ], {
            'Data și locul nașterii': '{{employee.birth}}',
            'Studii': '{{employee.education}}',
            'Calificarea (specialitatea, meseria)': '{{employee.qualification}}',
            'Locul de muncă': '{{employee.workplace}}',
            'Funcția': '{{employee.contractTitle}}',
        }),
        heading('Instructaj la angajare'),
        su_hiring(1, 'Instructajul introductiv general', 'introductory'),
        su_hiring(2, 'Instructajul la locul de muncă', 'workplace', workplace=True),
        su_admission(),
        heading('Instructaj periodic', page=True, before=0),
        paper(grid_table(SU_PERIODIC_COLUMNS,
                         [('periodic', values), ('blankRows.periodic', [''] * len(SU_PERIODIC_COLUMNS))])),
        form(grid_table(SU_PERIODIC_COLUMNS, [('periodic', values)], extra_rows=fields_rows)),
    ])


def section_properties(headers=''):
    return (
        f'<w:sectPr>{headers}<w:footerReference w:type="default" r:id="rId5"/><w:type w:val="nextPage"/>'
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:left="1417" w:right="1134" w:gutter="0" w:header="680" w:top="1134" '
        'w:footer="680" w:bottom="1151"/><w:pgNumType w:fmt="decimal"/>'
        f'<w:formProt w:val="false"/>{"<w:titlePg/>" if "first" in headers else ""}'
        '<w:textDirection w:val="lrTb"/></w:sectPr>'
    )


def has_covers(body):
    return '<w:sectPr>' in body


def document_xml(body, namespaces):
    # Word needs a paragraph after a closing table; at 1 pt it cannot spill onto a page of its own.
    closing = (
        '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="0" w:line="20" '
        'w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/><w:lang w:val="ro-RO"/>'
        '</w:rPr></w:pPr></w:p>'
    )
    running = f'<w:headerReference w:type="default" r:id="{HEADER_ID}"/>'
    if has_covers(body):
        last = section_properties(running)
    else:
        # A first page of its own takes no footer from the default one, so it names it again.
        last = section_properties(
            running
            + f'<w:headerReference w:type="first" r:id="{FIRST_HEADER_ID}"/>'
            + '<w:footerReference w:type="first" r:id="rId5"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<w:document {namespaces}><w:body>{body}{closing}{last}</w:body></w:document>'
    )


RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
    '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>'
    '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
    '</Relationships>'
)


def write(name, domain, body):
    with zipfile.ZipFile(PACKAGE) as source:
        parts = {item: source.read(item) for item in source.namelist() if not item.startswith('word/header')}
    original = parts['word/document.xml'].decode('utf-8')
    namespaces = original[original.index('<w:document ') + len('<w:document '):original.index('>', original.index('<w:document '))]
    headers = {'header1.xml': (HEADER_ID, header(HEADER_LINES[domain]))}
    if not has_covers(body):
        headers['header2.xml'] = (FIRST_HEADER_ID, header())
    types = parts['[Content_Types].xml'].decode('utf-8')
    for part in ('header1', 'header2', 'header3'):
        types = types.replace(f'<Override PartName="/word/{part}.xml" ContentType="{HEADER_TYPE}"/>', '')
    types = types.replace('</Types>', ''.join(f'<Override PartName="/word/{part}" ContentType="{HEADER_TYPE}"/>'
                                              for part in headers) + '</Types>')
    rels = RELS.replace('</Relationships>', ''.join(
        f'<Relationship Id="{identifier}" Type="{HEADER_RELATIONSHIP}" Target="{part}"/>'
        for part, (identifier, _) in headers.items()) + '</Relationships>')
    document = document_xml(body, namespaces)
    parts.update({f'word/{part}': xml.encode('utf-8') for part, (_, xml) in headers.items()})
    parts['word/document.xml'] = document.encode('utf-8')
    parts['word/_rels/document.xml.rels'] = rels.encode('utf-8')
    parts['[Content_Types].xml'] = types.encode('utf-8')
    target = os.path.join(TEMPLATES, name)
    house = draws_house_tables(document)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for item, data in parts.items():
            if lays_out_as_word_2013(target) and item.endswith('.xml'):
                data = house_tables_part(item, word_2013_part(item, data.decode('utf-8')), house).encode('utf-8')
            info = zipfile.ZipInfo(item, date_time=(2026, 10, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
    print(f'wrote {os.path.relpath(target, ROOT)}')


if __name__ == '__main__':
    write('fisa_instruire_ssm.docx', 'ssm', ssm_body())
    CONTROL_IDS = itertools.count(1)
    write(os.path.join('fire', 'fisa_instructaj_su.docx'), 'su', su_body())
