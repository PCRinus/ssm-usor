"""A landscape page of the occupational safety set is bound on its top edge, without an office.

The set is filed in a portrait binder, so a landscape page goes in turned, its top edge on the
holes: the 25 mm left for binding moves from the left edge to the top. The left margin becomes
20 mm like the others and the top margin, with the header in it, grows by 5 mm. The text column
is 5 mm wider, and every table that filled it, the header's box of document details included,
widens with it.

The rule acts on a landscape section still bound on the left, so a second sweep leaves it as
the first left it.
"""

import re

from table_style import CELL, ROW, columns_of, grid_of, span, top_level_tables

LEFT_BINDING = 1417  # twips, 25 mm
MARGIN = 1134  # 20 mm
MOVED = LEFT_BINDING - MARGIN
# A table drawn across the text column is this close to its width, LibreOffice's rounding.
ACROSS = 3

SECTION = re.compile(r'<w:sectPr\b[^>]*>.*?</w:sectPr>', re.S)
PAGE_SIZE = re.compile(r'<w:pgSz\b[^>]*/>')
PAGE_MARGINS = re.compile(r'<w:pgMar\b[^>]*/>')
REFERENCE = re.compile(r'<w:(?:header|footer)Reference\b[^>]*\br:id="([^"]+)"')
RELATIONSHIP = re.compile(r'<Relationship\b[^>]*/>')


def attribute(xml, name):
    match = re.search(rf'\bw:{name}="(-?\d+)"', xml)
    return int(match.group(1)) if match else None


def with_attribute(xml, name, value):
    return re.sub(rf'\bw:{name}="-?\d+"', f'w:{name}="{value}"', xml, count=1)


def is_bound_on_the_left(section):
    size = PAGE_SIZE.search(section)
    margins = PAGE_MARGINS.search(section)
    return (size is not None and margins is not None and 'w:orient="landscape"' in size.group(0)
            and attribute(margins.group(0), 'left') == LEFT_BINDING)


def bound_on_top(section):
    margins = PAGE_MARGINS.search(section).group(0)
    moved = with_attribute(margins, 'left', MARGIN)
    moved = with_attribute(moved, 'top', attribute(margins, 'top') + MOVED)
    header = attribute(margins, 'header')
    if header:
        moved = with_attribute(moved, 'header', header + MOVED)
    return section.replace(margins, moved, 1)


def text_width(section):
    size = PAGE_SIZE.search(section).group(0)
    margins = PAGE_MARGINS.search(section).group(0)
    return attribute(size, 'w') - attribute(margins, 'left') - attribute(margins, 'right')


def scaled(grid, width):
    """`grid` stretched to `width` exactly, the twips rounding leaves going to the columns that
    lost most, the first of equals first."""
    total = sum(grid)
    exact = [column * width / total for column in grid]
    widths = [int(value) for value in exact]
    order = sorted(range(len(grid)), key=lambda index: (widths[index] - exact[index], index))
    for index in order[:width - sum(widths)]:
        widths[index] += 1
    return widths


def widened_table(table, width):
    widths = scaled(grid_of(table), width)
    table = re.sub(r'<w:tblGrid>.*?</w:tblGrid>',
                   '<w:tblGrid>' + ''.join(f'<w:gridCol w:w="{each}"/>' for each in widths) + '</w:tblGrid>',
                   table, count=1, flags=re.S)
    table = re.sub(r'<w:tblW w:w="\d+" w:type="dxa"/>', f'<w:tblW w:w="{width}" w:type="dxa"/>', table, count=1)

    def row(match):
        cells = iter(columns_of(match.group(0)))

        def cell(found):
            column, each = next(cells)
            covered = sum(widths[column:column + span(each)])
            return re.sub(r'<w:tcW w:w="\d+" w:type="dxa"/>', f'<w:tcW w:w="{covered}" w:type="dxa"/>', each, count=1)
        return CELL.sub(cell, match.group(0))
    return ROW.sub(row, table)


def widened(xml, old, new):
    pieces, at = [], 0
    for table_start, table_end in top_level_tables(xml):
        table = xml[table_start:table_end]
        # The nested table's columns would be read as the outer one's.
        if table.count('<w:tbl>') > 1 or abs(sum(grid_of(table)) - old) > ACROSS:
            continue
        pieces += [xml[at:table_start], widened_table(table, new)]
        at = table_end
    pieces.append(xml[at:])
    return ''.join(pieces)


def landscape_bound_on_top(texts):
    """The parts of a template `texts` (name -> XML) its landscape sections change."""
    document = texts.get('word/document.xml')
    if not document:
        return {}
    targets = {re.search(r'\bId="([^"]+)"', each).group(1): re.search(r'\bTarget="([^"]+)"', each).group(1)
               for each in RELATIONSHIP.findall(texts.get('word/_rels/document.xml.rels', ''))}
    sections = list(SECTION.finditer(document))
    kept_parts, moved_parts = set(), {}
    pieces, at, begin = [], 0, document.index('<w:body>')
    for match in sections:
        section = match.group(0)
        parts = {f'word/{targets[ref]}' for ref in REFERENCE.findall(section) if ref in targets}
        if not is_bound_on_the_left(section):
            kept_parts |= parts
            begin = match.end()
            continue
        old = text_width(section)
        bound = bound_on_top(section)
        new = text_width(bound)
        pieces += [document[at:begin], widened(document[begin:match.start()], old, new), bound]
        at = begin = match.end()
        for part in parts:
            moved_parts[part] = (old, new)
    if not moved_parts:
        return {}
    shared = kept_parts & set(moved_parts)
    if shared:
        raise ValueError(f'a header or footer serves pages of both bindings: {sorted(shared)}')
    pieces.append(document[at:])
    changed = {'word/document.xml': ''.join(pieces)}
    for part, (old, new) in moved_parts.items():
        if part in texts:
            changed[part] = widened(texts[part], old, new)
    return changed
