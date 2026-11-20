"""One signing space for every signature of the occupational safety set, without an office.

Each signer gets the line saying who signs, then 25 mm of free space for a signature and a
stamp, labelled small and grey at its foot, then the name in bold. The decisions' block is a
run of paragraphs (the client, the role, the name); a hand-over block is a table of two columns
without lines, one for each side, which this lays out in rows: what the side confirms, the
role, the space and the name, the date. Each row starts at the same height on both sides, so
the two spaces line up when one side's role wraps. Safe to run again.
"""

import re

from table_style import P_PR_ORDER, PARAGRAPH, R_PR_ORDER, RUN, TC_PR_ORDER, element, put, text_of

SIGNING_ROOM = 1417  # twips, 25 mm
LABEL = 'semnătura și ștampila'
LABEL_SIZE = 16  # half-points
LABEL_COLOUR = '8A8A8A'
# The label's line, 8 pt Arial at single spacing: the space above it and the line make 25 mm.
LABEL_LINE = 184
NAME_ABOVE = 40
ROLE_ABOVE = 240
DATE_ABOVE = 240
BLOCK_BELOW = 240
DATE_LINE = 'Data: ____________________'

NAME = re.compile(r'\{\{[\w.]+\.(?:representativeName|name)\}\}')
DECISION_BLOCK = ('{{client.legalName}}', '{{client.representativeRole}}', '{{client.representativeName}}')
TABLE = re.compile(r'<w:tbl>.*?</w:tbl>', re.S)
ROW = re.compile(r'<w:tr\b[^>]*>.*?</w:tr>', re.S)
CELL = re.compile(r'<w:tc\b[^>]*>.*?</w:tc>', re.S)


def paragraph_properties(paragraph):
    return element(paragraph, 'pPr') or '<w:pPr></w:pPr>'


def with_properties(paragraph, change):
    properties = paragraph_properties(paragraph)
    inner = properties[len('<w:pPr>'):-len('</w:pPr>')] if properties != '<w:pPr/>' else ''
    changed = f'<w:pPr>{change(inner)}</w:pPr>'
    if element(paragraph, 'pPr'):
        return paragraph.replace(properties, changed, 1)
    return re.sub(r'^<w:p\b[^>]*>', lambda match: match.group(0) + changed, paragraph, count=1)


def spaced(paragraph, before=None, after=None, keep=True):
    """`paragraph` with the room above and under it set where given, kept with the next or not."""
    def change(inner):
        spacing = element(inner, 'spacing') or '<w:spacing/>'
        for name, value in (('before', before), ('after', after)):
            if value is not None:
                spacing = re.sub(rf' w:{name}(?:Autospacing)?="[^"]*"', '', spacing)
                spacing = spacing.replace('<w:spacing', f'<w:spacing w:{name}="{value}"', 1)
        inner = put(inner, 'spacing', spacing, P_PR_ORDER)
        return put(inner, 'keepNext', f'<w:keepNext w:val="{"true" if keep else "false"}"/>', P_PR_ORDER)
    return with_properties(paragraph, change)


def label_run_properties(properties):
    inner = (properties or '<w:rPr></w:rPr>')[len('<w:rPr>'):-len('</w:rPr>')]
    for tag in ('b', 'bCs', 'i', 'iCs'):
        inner = put(inner, tag, f'<w:{tag} w:val="false"/>', R_PR_ORDER)
    inner = put(inner, 'color', f'<w:color w:val="{LABEL_COLOUR}"/>', R_PR_ORDER)
    inner = put(inner, 'sz', f'<w:sz w:val="{LABEL_SIZE}"/>', R_PR_ORDER)
    inner = put(inner, 'szCs', f'<w:szCs w:val="{LABEL_SIZE}"/>', R_PR_ORDER)
    return f'<w:rPr>{inner}</w:rPr>'


def with_text(paragraph, text, run_properties=None):
    """`paragraph` holding one run of `text`, with the first run's properties or the ones given."""
    first = RUN.search(paragraph)
    properties = run_properties(element(first.group(0), 'rPr') if first else None) if run_properties else (
        element(first.group(0), 'rPr') if first else '') or ''
    head = paragraph[:paragraph.index('</w:pPr>') + len('</w:pPr>')] if '</w:pPr>' in paragraph else \
        re.match(r'<w:p\b[^>]*>', paragraph).group(0)
    escaped = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'{head}<w:r>{properties}<w:t xml:space="preserve">{escaped}</w:t></w:r></w:p>'


def label(like, padding=0):
    """The label at the foot of the signing space, in the place and alignment of `like`;
    `padding` is the cells' own room above and below, which counts towards the space."""
    paragraph = with_text(like, LABEL, label_run_properties)
    paragraph = with_properties(paragraph, lambda inner: put(
        inner, 'rPr', label_run_properties(element(inner, 'rPr')), P_PR_ORDER))
    return spaced(paragraph, SIGNING_ROOM - LABEL_LINE - padding, 0)


def plain(paragraph):
    """`paragraph` without bold, for a line made from the name's paragraph."""
    return re.sub(r'<w:b(?:Cs)?(?: w:val="[^"]*")?/>', '', paragraph)


def paragraphs_with_positions(xml):
    return [(match.start(), match.end(), match.group(0)) for match in PARAGRAPH.finditer(xml)]


def decision_blocks(xml):
    found = paragraphs_with_positions(xml)
    texts = [text_of(paragraph).strip() for _, _, paragraph in found]
    edits = []
    for index, text in enumerate(texts):
        if text != DECISION_BLOCK[1] or index == 0 or texts[index - 1] != DECISION_BLOCK[0]:
            continue
        following = index + 1
        if following < len(texts) and texts[following] == LABEL:
            following += 1
        if following >= len(texts) or texts[following] != DECISION_BLOCK[2]:
            continue
        start, _, role = found[index]
        _, end, name = found[following]
        client = found[index - 1]
        block = spaced(role, after=0) + label(role) + spaced(name, NAME_ABOVE, keep=False)
        if index > 1:
            # The last article goes with the signature: a decision is not signed on a page of its own.
            article = found[index - 2]
            edits.append((article[0], article[1], spaced(article[2])))
        edits.append((client[0], client[1], spaced(client[2])))
        edits.append((start, end, block))
    for start, end, replacement in reversed(edits):
        xml = xml[:start] + replacement + xml[end:]
    return xml


def column_paragraphs(table, column):
    paragraphs = []
    for row in ROW.findall(table):
        cells = CELL.findall(row)
        if column < len(cells):
            paragraphs += PARAGRAPH.findall(cells[column])
    return paragraphs


def has_lines(table):
    return bool(re.search(r'<w:(?:top|left|bottom|right|insideH|insideV)\b[^>]*w:val="(?!nil|none)', table))


def sides(table):
    """For each column: what the side confirms, its role, its name and its date line, or None
    when `table` is not a hand-over block."""
    if has_lines(table) or 'HouseTable' in table or len(re.findall(r'<w:gridCol\b', table)) != 2:
        return None
    found = []
    for column in range(2):
        paragraphs = [(text_of(paragraph).strip(), paragraph) for paragraph in column_paragraphs(table, column)]
        paragraphs = [(text, paragraph) for text, paragraph in paragraphs if text and text != LABEL]
        names = [at for at, (text, _) in enumerate(paragraphs) if NAME.fullmatch(text)]
        if len(names) != 1 or not paragraphs[0][0].startswith('Am '):
            return None
        at = names[0]
        others = [(index, paragraph) for index, (text, paragraph) in enumerate(paragraphs)
                  if index != at and not text.startswith('Data:')]
        after = [paragraph for index, paragraph in others if index > at]
        before = [paragraph for index, paragraph in others if index < at]
        if len(after) > 1 or (not after and len(before) < 2):
            return None
        role = after[0] if after else before.pop()
        dates = [paragraph for text, paragraph in paragraphs if text.startswith('Data:')]
        found.append({'lines': before, 'role': role, 'name': paragraphs[at][1],
                      'date': dates[0] if dates else None})
    return found


def cell_properties(table, column):
    cells = CELL.findall(ROW.search(table).group(0))
    properties = element(cells[column], 'tcPr') or '<w:tcPr></w:tcPr>'
    return properties


def aligned_cell(properties, value):
    inner = properties[len('<w:tcPr>'):-len('</w:tcPr>')]
    inner = put(inner, 'vAlign', f'<w:vAlign w:val="{value}"/>', TC_PR_ORDER)
    return f'<w:tcPr>{inner}</w:tcPr>'


def handover_table(table):
    found = sides(table)
    if found is None:
        return table
    head = table[:table.index('</w:tblGrid>') + len('</w:tblGrid>')]
    margins = element(head, 'tblCellMar') or ''
    padding = sum(int(width) for width in re.findall(r'<w:(?:top|bottom) w:w="(\d+)"', margins))
    columns = [cell_properties(table, column) for column in range(2)]

    def row(contents, align='top'):
        cells = ''.join(f'<w:tc>{aligned_cell(columns[column], align)}{contents[column]}</w:tc>' for column in range(2))
        return f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{cells}</w:tr>'

    lines, roles, signing, dates = [], [], [], []
    for side in found:
        lines.append(''.join(spaced(line, 0, 0) for line in side['lines']) or spaced(side['role'], 0, 0))
        roles.append(spaced(side['role'], ROLE_ABOVE, 0))
        signing.append(label(side['role'], padding) + spaced(side['name'], NAME_ABOVE, 0))
        date = side['date'] or with_text(plain(side['role']), DATE_LINE)
        dates.append(spaced(date, DATE_ABOVE, BLOCK_BELOW, keep=False))
    return (head + row(lines) + row(roles, 'bottom') + row(signing) + row(dates)
            + '</w:tbl>')


def top_level_tables(xml):
    spans, depth, start = [], 0, 0
    for match in re.finditer(r'<(/?)w:tbl>', xml):
        if not match.group(1):
            if depth == 0:
                start = match.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                spans.append((start, match.end()))
    return spans


def handover_tables(xml):
    for start, end in reversed(top_level_tables(xml)):
        xml = xml[:start] + handover_table(xml[start:end]) + xml[end:]
    return xml


def signing_space(xml):
    return handover_tables(decision_blocks(xml))
