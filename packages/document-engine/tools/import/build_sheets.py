"""Builds the two individual training sheets (ADR 021).

    pnpm --filter @ssm-usor/document-engine build-sheets

The occupational safety sheet follows annex 11 of the methodological norms of H.G. 1425/2006,
the fire-safety one the annex of the general dispositions of OMAI 712/2005: their rubrics,
in their order, typeset to the house style. Both are written as plain OOXML, without
LibreOffice, on the package of the annual report (7.2): its styles, settings, fonts, theme and
footer, without its box of document details, since a sheet is a form and carries no issue
date. A blank is a cell with a line under it, never a run of dots.
"""

import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEMPLATES = os.path.join(ROOT, 'templates')
PACKAGE = os.path.join(TEMPLATES, 'fire', '7.2_fire_annual_report.docx')

TEXT_WIDTH = 11906 - 1417 - 1134
SIGNATURE_HEIGHT = 680
LINE = '<w:{side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>'


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


def paragraph(
    text='',
    *,
    size=10,
    bold=False,
    italic=False,
    align='left',
    before=0,
    after=120,
    keep=False,
    page=False,
    style='Normal',
):
    props = (
        f'<w:pStyle w:val="{style}"/>'
        f'<w:keepNext w:val="{"true" if keep else "false"}"/>'
        f'<w:pageBreakBefore w:val="{"true" if page else "false"}"/>'
        '<w:widowControl/><w:bidi w:val="0"/>'
        f'<w:spacing w:before="{before}" w:after="{after}"/>'
        '<w:ind w:hanging="0" w:left="0"/>'
        f'<w:jc w:val="{align}"/>{rpr(size, bold, italic)}'
    )
    run = f'<w:r>{rpr(size, bold, italic)}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ''
    return f'<w:p><w:pPr>{props}</w:pPr>{run}</w:p>'


def cell_paragraph(text='', *, size=10, bold=False, align='left', before=0, after=0, keep=False):
    return paragraph(
        text, size=size, bold=bold, align=align, before=before, after=after, keep=keep,
        style='TableContents',
    )


def cell(width, content, *, borders=(), span=1, merge=None, valign='top'):
    """`content` is a list of paragraphs; `borders` the sides that draw a line."""
    lines = ''.join(LINE.format(side=side) for side in ('top', 'left', 'bottom', 'right') if side in borders)
    props = f'<w:tcW w:w="{width}" w:type="dxa"/>'
    if span > 1:
        props += f'<w:gridSpan w:val="{span}"/>'
    if merge == 'restart':
        props += '<w:vMerge w:val="restart"/>'
    elif merge == 'continue':
        props += '<w:vMerge/>'
    props += f'<w:tcBorders>{lines}</w:tcBorders><w:vAlign w:val="{valign}"/>'
    return f'<w:tc><w:tcPr>{props}</w:tcPr>{"".join(content) or cell_paragraph()}</w:tc>'


def row(cells, *, height=None, header=False, split=False):
    props = '' if split else '<w:cantSplit/>'
    if height:
        props += f'<w:trHeight w:val="{height}" w:hRule="atLeast"/>'
    if header:
        props += '<w:tblHeader/>'
    return f'<w:tr><w:trPr>{props}</w:trPr>{"".join(cells)}</w:tr>'


def table(widths, rows):
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="left"/>'
        '<w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="55" w:type="dxa"/>'
        '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="55" w:type="dxa"/></w:tblCellMar>'
        f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>'
    )


ALL = ('top', 'left', 'bottom', 'right')


def heading(text, *, page=False, before=360):
    return paragraph(text, bold=True, before=before, after=120, keep=True, page=page)


def fields(rows, label_width=3400, height=360):
    value_width = TEXT_WIDTH - label_width
    drawn = []
    for label, value, *rest in rows:
        tall = rest[0] if rest else height
        drawn.append(
            row(
                [
                    cell(label_width, [cell_paragraph(label)], valign='bottom'),
                    cell(value_width, [cell_paragraph(value)], borders=('bottom',), valign='bottom'),
                ],
                height=tall,
            )
        )
    return table([label_width, value_width], drawn)


def signatures(slots):
    width = TEXT_WIDTH // len(slots)
    widths = [width] * (len(slots) - 1) + [TEXT_WIDTH - width * (len(slots) - 1)]
    room = [
        cell(each, [cell_paragraph()], borders=('bottom',))
        for each in widths
    ]
    captions = []
    for each, (caption, name) in zip(widths, slots):
        content = [cell_paragraph(caption, size=8, align='center')]
        if name:
            content.append(cell_paragraph(name, size=7, align='center'))
        captions.append(cell(each, content))
    return table(widths, [row(room, height=SIGNATURE_HEIGHT), row(captions)])


def grid_table(columns, loops, *, blank_rows=0, size=8, row_height=SIGNATURE_HEIGHT):
    """A printed table: its heading, the rows of each loop, then `blank_rows` empty ones.

    `columns` is a list of `(width, heading, value)`; a heading may be a `(group, own)` pair
    for the signature columns grouped under one caption. A loop is `(name, values)` where
    values replace the column values.
    """
    widths = [width for width, _, _ in columns]
    grouped = any(isinstance(title, tuple) for _, title, _ in columns)
    header_rows = []
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
    return table(widths, header_rows + body)


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


SSM_PERIODIC_COLUMNS = [
    (1100, 'Data instruirii', '{{heldOn}}'),
    (700, 'Durata (h)', '{{hours}}'),
    (1300, 'Ocupația', '{{occupation}}'),
    (2555, 'Materialul predat', '{{material}}'),
    (1200, ('Semnătura celui', 'instruit'), ''),
    (1250, ('Semnătura celui', 'care a instruit'), ('{{trainer}}', True)),
    (1250, ('Semnătura celui', 'care a verificat instruirea'), ('{{verifier}}', True)),
]


def ssm_periodic(title, first_heading, loop, page=True):
    columns = [(SSM_PERIODIC_COLUMNS[0][0], first_heading, '{{heldOn}}'), *SSM_PERIODIC_COLUMNS[1:]]
    values = [value for _, _, value in columns]
    return heading(title, page=page, before=0) + grid_table(
        columns, [(loop, values), (f'blankRows.{loop}', [''] * len(columns))]
    )


def ssm_hiring(number, title, line, signer, workplace=False):
    rows = [('A fost efectuată la data', f'{{{{hiring.{line}.heldOn}}}}')]
    if workplace:
        rows.append(('Loc de muncă/post de lucru', f'{{{{hiring.{line}.place}}}}'))
    rows += [
        ('Timp de (ore)', f'{{{{hiring.{line}.hours}}}}'),
        ('De către', f'{{{{hiring.{line}.trainer}}}}'),
        ('Având funcția de', f'{{{{hiring.{line}.trainerJobTitle}}}}'),
        ('Conținutul instruirii', f'{{{{hiring.{line}.material}}}}', 720),
    ]
    return (
        paragraph(f'{number}) {title}', bold=True, before=0 if workplace else 240, after=60,
                  keep=True, page=workplace)
        + fields(rows)
        + signatures([
            ('Semnătura celui instruit', None),
            ('Semnătura celui care a efectuat instruirea', f'{{{{signers.{signer}.trainer}}}}'),
            ('Semnătura celui care a verificat însușirea cunoștințelor', f'{{{{signers.{signer}.verifier}}}}'),
        ])
    )


def empty_table(columns, rows=5, height=480):
    return grid_table([(width, title, '') for width, title in columns], [], blank_rows=rows, row_height=height)


def ssm_body():
    return ''.join([
        paragraph('Întreprinderea/unitatea: {{client.legalName}}', after=360),
        paragraph('FIȘĂ DE INSTRUIRE INDIVIDUALĂ', size=12, bold=True, align='center', after=60, keep=True),
        paragraph('privind securitatea și sănătatea în muncă', bold=True, align='center', after=60, keep=True),
        paragraph('conform anexei nr. 11 la normele metodologice aprobate prin H.G. 1425/2006',
                  align='center', after=240),
        fields([
            ('Numele și prenumele', '{{employee.name}}'),
            ('Legitimația, marca', '{{employee.employeeNumber}}'),
            ('Grupa sanguină', '{{employee.bloodGroup}}'),
            ('Domiciliul', '{{employee.homeAddress}}'),
            ('Data și locul nașterii', '{{employee.birth}}'),
            ('Calificarea', '{{employee.qualification}}'),
            ('Funcția', '{{employee.contractTitle}}'),
            ('Locul de muncă', '{{employee.workplace}}'),
            ('Autorizații (ISCIR ș.a.)', '{{employee.authorizations}}'),
            ('Traseul de deplasare la/de la serviciu', '{{employee.commute}}', 600),
        ]),
        heading('Instruirea la angajare'),
        ssm_hiring(1, 'Instruirea introductiv-generală', 'introductory', 'introductory'),
        ssm_hiring(2, 'Instruirea la locul de muncă', 'workplace', 'workplace', workplace=True),
        paragraph('3) Admis la lucru', bold=True, before=240, after=60, keep=True),
        fields([
            ('Numele și prenumele', '{{admission.name}}'),
            ('Funcția (șef secție, atelier, șantier etc.)', '{{admission.jobTitle}}'),
            ('Data și semnătura', '{{admission.admittedOn}}', SIGNATURE_HEIGHT),
        ]),
        ssm_periodic('Instruirea periodică', 'Data instruirii', 'periodic'),
        ssm_periodic('Instruirea periodică suplimentară', 'Data efectuării', 'supplementary'),
        heading('Rezultatele testărilor', page=True, before=0),
        empty_table([(1500, 'Data'), (3955, 'Materialul examinat'), (1700, 'Calificativ'), (2200, 'Examinator')]),
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


def psi_hiring(number, title, line, workplace=False):
    rows = [('Efectuat la data de', f'{{{{hiring.{line}.heldOn}}}}')]
    if workplace:
        rows += [
            ('Pentru locul de muncă', f'{{{{hiring.{line}.place}}}}'),
            ('Specialitatea (meseria)', f'{{{{hiring.{line}.occupation}}}}'),
        ]
    rows += [
        ('Timp de (ore)', f'{{{{hiring.{line}.hours}}}}'),
        ('De către', f'{{{{hiring.{line}.trainer}}}}'),
        ('Având funcția de', f'{{{{hiring.{line}.trainerJobTitle}}}}'),
        ('Conținutul instructajului', f'{{{{hiring.{line}.material}}}}', 720),
    ]
    return (
        paragraph(f'{number}. {title}', bold=True, before=0 if workplace else 240, after=60,
                  keep=True, page=workplace)
        + fields(rows)
        + signatures([
            ('Semnătura salariatului (persoanei care a verificat însușirea cunoștințelor)',
             f'{{{{signers.{line}.verifier}}}}'),
            ('Semnătura persoanei instruite', None),
        ])
    )


PSI_PERIODIC_COLUMNS = [
    (600, 'Nr. crt.', '{{$index}}'),
    (1100, 'Data', '{{heldOn}}'),
    (1500, 'Specialitatea', '{{occupation}}'),
    (2855, 'Materialul predat', '{{material}}'),
    (800, 'Durata (ore)', '{{hours}}'),
    (1250, 'Semnătura persoanei instruite', ''),
    (1250, 'Semnătura celui care a instruit', ('{{trainer}}', True)),
]


def psi_body():
    values = [value for _, _, value in PSI_PERIODIC_COLUMNS]
    return ''.join([
        paragraph('Unitatea: {{client.legalName}}', after=0),
        paragraph('FIȘĂ INDIVIDUALĂ', size=16, bold=True, align='center', before=3000, after=120, keep=True),
        paragraph('de instructaj în domeniul situațiilor de urgență', size=12, bold=True, align='center',
                  after=60, keep=True),
        paragraph('conform anexei la dispozițiile generale aprobate prin OMAI 712/2005', align='center',
                  after=1200),
        fields([
            ('Numele și prenumele', '{{employee.name}}'),
            ('Marca', '{{employee.employeeNumber}}'),
            ('Domiciliul', '{{employee.homeAddress}}'),
        ], label_width=2400, height=480),
        paragraph('ATENȚIE!', size=12, bold=True, align='center', page=True, before=2400, after=120, keep=True),
        table([TEXT_WIDTH], [row([cell(TEXT_WIDTH, [cell_paragraph(
            'Nicio persoană nu va fi admisă la lucru fără efectuarea instructajului introductiv general '
            'și a instructajului la locul de muncă.', bold=True, align='center', before=240, after=240)],
            borders=ALL)])]),
        heading('Date personale', page=True, before=0),
        fields([
            ('Data și locul nașterii', '{{employee.birth}}'),
            ('Studii', '{{employee.education}}'),
            ('Calificarea (specialitatea, meseria)', '{{employee.qualification}}'),
            ('Locul de muncă', '{{employee.workplace}}'),
            ('Funcția', '{{employee.contractTitle}}'),
        ]),
        heading('Instructaj la angajare'),
        psi_hiring(1, 'Instructajul introductiv general', 'introductory'),
        psi_hiring(2, 'Instructajul la locul de muncă', 'workplace', workplace=True),
        paragraph('3. Admis la lucru', bold=True, before=240, after=60, keep=True),
        fields([
            ('Data', '{{admission.admittedOn}}'),
            ('Numele și prenumele', '{{admission.name}}'),
            ('Funcția (șef secție, atelier, șantier etc.)', '{{admission.jobTitle}}'),
        ]),
        heading('Instructaj periodic', page=True, before=0),
        grid_table(PSI_PERIODIC_COLUMNS,
                   [('periodic', values), ('blankRows.periodic', [''] * len(PSI_PERIODIC_COLUMNS))]),
    ])


def document_xml(body, namespaces):
    # Word needs a paragraph after a closing table; at 1 pt it cannot spill onto a page of its own.
    closing = (
        '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="0" w:line="20" '
        'w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/><w:lang w:val="ro-RO"/>'
        '</w:rPr></w:pPr></w:p>'
    )
    section = (
        '<w:sectPr><w:footerReference w:type="default" r:id="rId5"/><w:type w:val="nextPage"/>'
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:left="1417" w:right="1134" w:gutter="0" w:header="680" w:top="1134" '
        'w:footer="680" w:bottom="1151"/><w:pgNumType w:fmt="decimal"/>'
        '<w:formProt w:val="false"/><w:textDirection w:val="lrTb"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<w:document {namespaces}><w:body>{body}{closing}{section}</w:body></w:document>'
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


def write(name, body):
    with zipfile.ZipFile(PACKAGE) as source:
        parts = {item: source.read(item) for item in source.namelist()}
    original = parts['word/document.xml'].decode('utf-8')
    namespaces = original[original.index('<w:document ') + len('<w:document '):original.index('>', original.index('<w:document '))]
    types = parts['[Content_Types].xml'].decode('utf-8')
    for header in ('header1', 'header2', 'header3'):
        types = types.replace(
            f'<Override PartName="/word/{header}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
            '',
        )
    target = os.path.join(TEMPLATES, name)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for item, data in parts.items():
            if item.startswith('word/header'):
                continue
            if item == 'word/document.xml':
                data = document_xml(body, namespaces).encode('utf-8')
            elif item == 'word/_rels/document.xml.rels':
                data = RELS.encode('utf-8')
            elif item == '[Content_Types].xml':
                data = types.encode('utf-8')
            info = zipfile.ZipInfo(item, date_time=(2026, 10, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
    print(f'wrote {os.path.relpath(target, ROOT)}')


if __name__ == '__main__':
    write('fisa_instruire_ssm.docx', ssm_body())
    write(os.path.join('fire', 'fisa_instructaj_psi.docx'), psi_body())
