"""The occupational safety set's tables in one house style, without an office.

Black lines, the frame and the rule under the header 1 pt and every inside line 0.5 pt; a
header that is bold, centred, filled with the app's table-header grey-green and repeated on
every page; 1.5 mm of padding beside the text and 0.7 mm above and below it; a body row of
single lines centred from top to bottom, one with more lines anywhere read from the top, never
mixed; a column of short values centred, one of names or text from the left; row numbers
regular; one mark, a centred dash, for a cell left empty in a table of data. Then the rule that keeps a table together (`keep_together`).

A table drawn this way names the table style `HOUSE_TABLE`, which holds nothing: the merge
(`src/table-keep.ts`) lays the rule over again once a loop has repeated the rows, and touches
no other table.

Left as they are: a table with no line or with lines on some sides only (the signature blocks,
the covers' handover, the sheets' lines to write on, the sign catalogues of 2.2 and 11), and the
scales of 9's method (Anexa 3 to 5), whose 1.5 pt contours and grey levels say which class a
cell belongs to. Their header fill turns to the house one, and their text reads on every grey
(`readable_grid`). The consequence matrix
(9's Anexa 2) takes the house style with an X for every consequence and nothing elsewhere
(`consequence_cell`).
"""

import math
import re
from collections import Counter

FRAME = 8  # eighths of a point
INSIDE = 4
HEADER_FILL = 'E3E8E0'
# A row of one cell across the table in this fill names the group of rows under it (6's posts)
# and keeps with the row after it, so a group never starts at a page's foot.
GROUP_FILL = 'F1F4EF'
WIDE_COLUMNS = 6
PADDING = (('top', 40), ('left', 85), ('bottom', 40), ('right', 85))  # twips
HOUSE_TABLE = 'HouseTable'
HOUSE_TABLE_STYLE = (f'<w:style w:type="table" w:customStyle="1" w:styleId="{HOUSE_TABLE}">'
                     '<w:name w:val="Tabel SSM Ușor"/><w:uiPriority w:val="99"/></w:style>')
EMPTY_MARK = '—'
DASHES = ('-', '--', '–', '—', '---')
# A column of these holds short values whatever they are; one of these, names and text.
VALUE_COLUMN = re.compile(
    r'^(nr\.?\s*(crt|întreb)|data\b|durata|nivel\b|nivelul|clas[ae]\b|cantitate|număr|nr\. bucăți|cod risc|'
    r'termen|lunile|punctaj|răspunsul)', re.I)
TEXT_COLUMN = re.compile(r'^(nume|numele|denumire|persoan|semnătur|observa|cine)', re.I)
SHORT_WORDS = 3
SHORT_TEXT = 24
ROW_NUMBER_COLUMN = re.compile(r'^nr\.?\s*crt', re.I)

# Rule A of the keep-together decision. A table of up to `WHOLE_ROWS` body rows moves whole; a
# longer one keeps its header with its first two body rows. A row longer than `TALL_ROW_TEXT`
# characters, or estimated taller than `TALL_ROW_ROOM`, may split and the table keeps nothing:
# LibreOffice silently leaves out of the PDF the content of a row that may not split when the
# rows tied to it do not fit on a page.
WHOLE_ROWS = 6
TALL_ROW_TEXT = 700
TALL_ROW_ROOM = 280 * 20  # twips
# A landscape page holds some 410 pt under its box of document details; the line that
# introduces the table and the guess's error take the rest.
KEEP_ROOM = 340 * 20  # twips
# Arial's average advance, rounded towards too wide, so a guess errs on the side of a shorter chain.
CHARACTER_WIDTH = 0.55
LINE_HEIGHT = 1.15
LEAD_IN_TEXT = 400
# Above and below the text together, in twips: more than the house padding leaves is room to write.
ROOM_TO_WRITE = 110

TBL_PR_ORDER = ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize',
                'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd',
                'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription']
TC_PR_ORDER = ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap',
               'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark']
P_PR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl',
              'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku',
              'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi',
              'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
              'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap',
              'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']
TR_PR_ORDER = ['cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter', 'cantSplit', 'trHeight',
               'tblHeader', 'tblCellSpacing', 'jc', 'hidden', 'ins', 'del', 'trPrChange']
R_PR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike',
              'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden',
              'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect',
              'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
              'specVanish', 'oMath']

ROW = re.compile(r'<w:tr\b[^>]*>.*?</w:tr>', re.S)
CELL = re.compile(r'<w:tc\b[^>]*>.*?</w:tc>', re.S)
PARAGRAPH = re.compile(r'<w:p\b[^>]*/>|<w:p\b[^>]*>.*?</w:p>', re.S)
RUN = re.compile(r'<w:r\b[^>]*>.*?</w:r>', re.S)
BOLD_RUN = re.compile(r'<w:rPr>(?:(?!</w:rPr>).)*<w:b(?: w:val="(?:true|1|on)")?/>', re.S)
TEXT = re.compile(r'(<w:t\b[^>]*>)([^<]*)(</w:t>)')
LOOP_TAGS_ONLY = re.compile(r'(\{\{[#/^][^}]*\}\})+')
ON = r'(?: w:val="(?:true|1|on)")?'


NESTED_PROPERTIES = re.compile(r'<w:(rPr|pPrChange|rPrChange|tcPrChange|tblPrChange|sectPr)\b[^>]*>.*?</w:\1>', re.S)


def own_children(inner, tag):
    """The `tag` children of a properties element, not the ones of the run properties or the
    revisions it holds: a paragraph mark's `w:spacing` is character spacing."""
    nested = [match.span() for match in NESTED_PROPERTIES.finditer(inner)] if tag != 'rPr' else []
    return [match for match in re.finditer(rf'<w:{tag}\b[^>]*/>|<w:{tag}\b[^>]*>.*?</w:{tag}>', inner, re.S)
            if not any(start <= match.start() < end for start, end in nested)]


def element(inner, tag):
    found = own_children(inner, tag)
    return found[0].group(0) if found else None


def without(inner, tag):
    for match in reversed(own_children(inner, tag)):
        inner = inner[:match.start()] + inner[match.end():]
    return inner


def put(inner, tag, xml, order):
    """`inner` with its `tag` child replaced by `xml`, in the schema's place."""
    inner = without(inner, tag)
    positions = [match.start() for later in order[order.index(tag) + 1:]
                 for match in [re.search(rf'<w:{later}\b', inner)] if match]
    at = min(positions) if positions else len(inner)
    return inner[:at] + xml + inner[at:]


def edit_properties(xml, tag, change):
    """`xml` with the inner XML of the `tag` properties that open it passed through `change`,
    created where there are none and dropped where nothing is left."""
    if xml.endswith('/>') and xml.count('<') == 1:
        name = re.match(r'<(w:\w+)', xml).group(1)
        xml = f'{xml[:-2]}></{name}>'
    opening = re.match(r'<w:\w+\b[^>]*>(<w:tblPrEx>.*?</w:tblPrEx>)?', xml, re.S).end()
    rest = xml[opening:]
    found = re.match(rf'<w:{tag}>(.*?)</w:{tag}>|<w:{tag}/>', rest, re.S)
    inner = (found.group(1) or '') if found else ''
    after = opening + (found.end() if found else 0)
    changed = change(inner)
    return xml[:opening] + (f'<w:{tag}>{changed}</w:{tag}>' if changed else '') + xml[after:]


def text_of(xml):
    return ''.join(match.group(2) for match in TEXT.finditer(xml))


def unescaped_length(text):
    return len(re.sub(r'&\w+;', '_', text))


def is_bold(run_properties):
    return re.search(rf'<w:b{ON}/>', run_properties or '') is not None


def runs_with_text(xml):
    return [run for run in RUN.findall(xml) if text_of(run).strip()]


def all_bold(cell):
    runs = runs_with_text(cell)
    return bool(runs) and all(is_bold(element(run, 'rPr')) for run in runs)


def cell_properties(cell):
    match = re.match(r'<w:tc\b[^>]*>\s*<w:tcPr>(.*?)</w:tcPr>', cell, re.S)
    return match.group(1) if match else ''


def span(cell):
    match = re.search(r'<w:gridSpan w:val="(\d+)"', cell_properties(cell))
    return int(match.group(1)) if match else 1


def continues_merge(cell):
    merge = re.search(r'<w:vMerge(?: w:val="(\w+)")?/>', cell_properties(cell))
    return merge is not None and merge.group(1) != 'restart'


def row_properties(row):
    match = re.match(r'<w:tr\b[^>]*>\s*<w:trPr>(.*?)</w:trPr>', row, re.S)
    return match.group(1) if match else ''


def is_marked_header(row):
    return re.search(rf'<w:tblHeader{ON}/>', row_properties(row)) is not None


def is_grey_band(row):
    cells = [cell for cell in CELL.findall(row) if not continues_merge(cell)]
    fills = [re.search(r'<w:shd w:val="clear"[^>]*w:fill="(\w+)"|<w:shd\b[^>]*w:fill="(\w+)"[^>]*w:val="clear"',
                       cell_properties(cell)) for cell in cells]
    return len(cells) > 1 and all(fill and neutral(fill.group(1) or fill.group(2)) for fill in fills)


def header_count(rows):
    """The rows marked as the header, or else the leading rows of bold text, merged cells of a
    row above included. A key and value form has no header: its values are not bold. The header
    takes in the rows its cells are merged down into, which LibreOffice would otherwise repeat
    over the rows under them on the next page, and a row of grey sub-headings under it, not a
    band across the table that opens a section."""
    count = 0
    for row in rows:
        if not is_marked_header(row):
            break
        count += 1
    if not count:
        for row in rows[:-1]:
            if not all(continues_merge(cell) or (text_of(cell).strip() and all_bold(cell))
                       for cell in CELL.findall(row)):
                break
            count += 1
    while 0 < count < len(rows) - 1 and (any(continues_merge(cell) for cell in CELL.findall(rows[count]))
                                         or is_grey_band(rows[count])):
        count += 1
    return count


def grid_of(table):
    return [int(width) for width in re.findall(r'<w:gridCol w:w="(\d+)"', table)]


def columns_of(row):
    """Each cell with the first grid column it covers."""
    column, placed = 0, []
    for cell in CELL.findall(row):
        placed.append((column, cell))
        column += span(cell)
    return placed


def size_of(xml):
    match = re.search(r'<w:sz w:val="(\d+)"/>', xml or '')
    return int(match.group(1)) if match else None


def paragraph_size(paragraph):
    """In half-points: the first run's with text, else the paragraph mark's."""
    runs = runs_with_text(paragraph)
    return (size_of(element(runs[0], 'rPr')) if runs else None) or size_of(element(paragraph, 'pPr')) or 20


def body_size(rows, header):
    sizes = Counter(size_of(element(run, 'rPr')) for row in rows[header:] for run in runs_with_text(row))
    sizes.pop(None, None)
    if not sizes:
        marks = [size_of(element(paragraph, 'pPr')) for row in rows[header:] for paragraph in PARAGRAPH.findall(row)]
        sizes = Counter(size for size in marks if size)
    if not sizes:
        sizes = Counter(size_of(element(run, 'rPr')) for row in rows[:header] for run in runs_with_text(row))
        sizes.pop(None, None)
    return sizes.most_common(1)[0][0] if sizes else 20


def drawn_sides(cell):
    borders = element(cell_properties(cell), 'tcBorders') or ''
    return {({'start': 'left', 'end': 'right'}).get(side, side)
            for side, value in re.findall(r'<w:(top|left|bottom|right|start|end) w:val="(\w+)"', borders)
            if value not in ('nil', 'none')}


def fully_ruled(rows):
    """Whether a line runs along every edge of every cell, drawn by the cell or its neighbour:
    LibreOffice saves each line once, on one of the two cells it divides."""
    owner, sides = {}, {}
    width = None
    for row_index, row in enumerate(rows):
        placed = columns_of(row)
        columns = sum(span(cell) for _, cell in placed)
        if width is None:
            width = columns
        if columns != width:
            return False
        for column, cell in placed:
            for covered in range(column, column + span(cell)):
                merged = continues_merge(cell) and (row_index - 1, covered) in owner
                owner[(row_index, covered)] = owner[(row_index - 1, covered)] if merged else (row_index, column)
                sides[(row_index, covered)] = drawn_sides(cell)
    last_row = len(rows) - 1
    for (row_index, column), own in sides.items():
        if row_index == 0 and 'top' not in own:
            return False
        if row_index == last_row and 'bottom' not in own:
            return False
        if column == 0 and 'left' not in own:
            return False
        if column == width - 1 and 'right' not in own:
            return False
        if row_index and owner[(row_index - 1, column)] != owner[(row_index, column)] \
                and 'top' not in own and 'bottom' not in sides[(row_index - 1, column)]:
            return False
        if column and owner[(row_index, column - 1)] != owner[(row_index, column)] \
                and 'left' not in own and 'right' not in sides[(row_index, column - 1)]:
            return False
    return True


def kind_of(table):
    """'house', 'consequences' (9's Anexa 2), 'scale' (9's Anexa 3 to 5) or None for a table left
    as it is."""
    if table.count('<w:tbl>') > 1:
        return None
    rows = ROW.findall(table)
    if not rows:
        return None
    first = text_of(rows[0]).replace('\u00ad', '')
    if f'<w:tblStyle w:val="{HOUSE_TABLE}"/>' in table:
        return 'consequences' if first.startswith('Nr.crt.CONSECINȚE') else 'house'
    if re.search(r'<w:(?:top|left|bottom|right) w:val="single" w:sz="12"', table):
        return 'consequences' if first.startswith('Nr.crt.CONSECINȚE') else 'scale'
    if not fully_ruled(rows):
        return None
    return 'house'


def border(side, size):
    return f'<w:{side} w:val="single" w:sz="{size}" w:space="0" w:color="000000"/>'


HOUSE_BORDERS = ('<w:tblBorders>' + ''.join(border(side, FRAME) for side in ('top', 'left', 'bottom', 'right'))
                 + border('insideH', INSIDE) + border('insideV', INSIDE) + '</w:tblBorders>')


def house_padding(side_padding):
    return ('<w:tblCellMar>' + ''.join(
        f'<w:{side} w:w="{side_padding if side in ("left", "right") else width}" w:type="dxa"/>'
        for side, width in PADDING) + '</w:tblCellMar>')


def house_table_properties(side_padding):
    def change(inner):
        inner = put(inner, 'tblStyle', f'<w:tblStyle w:val="{HOUSE_TABLE}"/>', TBL_PR_ORDER)
        inner = put(inner, 'tblBorders', HOUSE_BORDERS, TBL_PR_ORDER)
        return put(inner, 'tblCellMar', house_padding(side_padding), TBL_PR_ORDER)
    return change


def old_padding(table):
    margins = element(element(table, 'tblPr') or '', 'tblCellMar') or ''
    return {side: int(width) for side, width in re.findall(r'<w:(top|bottom) w:w="(\d+)"', margins)}


def set_paragraph(paragraph, change):
    return edit_properties(paragraph, 'pPr', change)


def mark_properties(change):
    def edit(inner):
        mark = element(inner, 'rPr')
        mark_inner = mark[len('<w:rPr>'):-len('</w:rPr>')] if mark and mark != '<w:rPr/>' else ''
        return put(inner, 'rPr', f'<w:rPr>{change(mark_inner)}</w:rPr>', P_PR_ORDER)
    return edit


def edit_runs(paragraph, change):
    """Every run's properties and the paragraph mark's."""
    paragraph = set_paragraph(paragraph, mark_properties(change))
    return RUN.sub(lambda match: edit_properties(match.group(0), 'rPr', change), paragraph)


def bold(on):
    def change(inner):
        for tag in ('b', 'bCs'):
            inner = put(inner, tag, f'<w:{tag}/>', R_PR_ORDER) if on else without(inner, tag)
        return inner
    return change


def sized(size):
    def change(inner):
        inner = put(inner, 'sz', f'<w:sz w:val="{size}"/>', R_PR_ORDER)
        return put(inner, 'szCs', f'<w:szCs w:val="{size}"/>', R_PR_ORDER)
    return change


def coloured(colour):
    return lambda inner: put(inner, 'color', f'<w:color w:val="{colour}"/>', R_PR_ORDER)


def aligned(value):
    return lambda paragraph: set_paragraph(
        paragraph, lambda inner: put(inner, 'jc', f'<w:jc w:val="{value}"/>', P_PR_ORDER))


def with_text(paragraph, text):
    """The paragraph's text replaced, in its first run's formatting."""
    found = [False]

    def replace(match):
        if found[0]:
            return f'{match.group(1)}{match.group(3)}'
        found[0] = True
        return f'{match.group(1)}{text}{match.group(3)}'
    replaced = TEXT.sub(replace, paragraph)
    if found[0] or not text:
        return replaced
    mark = element(element(paragraph, 'pPr') or '', 'rPr') or ''
    run = f'<w:r>{mark}<w:t>{text}</w:t></w:r>'
    if paragraph.endswith('/>'):
        return f'{paragraph[:-2]}>{run}</w:p>'
    return paragraph[:-len('</w:p>')] + run + '</w:p>'


def edit_cell(cell, change):
    return edit_properties(cell, 'tcPr', change)


def edit_paragraphs(xml, change):
    return PARAGRAPH.sub(lambda match: change(match.group(0)), xml)


def keep_next(paragraph, on):
    def change(inner):
        return put(inner, 'keepNext', '<w:keepNext/>', P_PR_ORDER) if on else without(inner, 'keepNext')
    return set_paragraph(paragraph, change)


def edit_row_properties(row, change):
    return edit_properties(row, 'trPr', change)


def row_height(row):
    match = re.search(r'<w:trHeight w:val="(\d+)"(?: w:hRule="(\w+)")?/>', row_properties(row))
    return int(match.group(1)) if match and match.group(2) != 'auto' else 0


def estimated_height(row, grid):
    """A row's height in twips, guessed from its text: enough to tell a row that may take a page."""
    padding = sum(width for side, width in PADDING if side in ('top', 'bottom'))
    across = sum(width for side, width in PADDING if side in ('left', 'right'))
    tallest = 0
    for column, cell in columns_of(row):
        if continues_merge(cell):
            continue
        width = max(sum(grid[column:column + span(cell)]) - across, 200)
        rotated = '<w:textDirection' in cell_properties(cell)
        height = padding
        for paragraph in PARAGRAPH.findall(cell):
            size = paragraph_size(paragraph) / 2
            pieces = re.split(r'<w:(?:br|cr)\b[^>]*/>', paragraph)
            lines = 1 if rotated else sum(
                max(1, math.ceil(unescaped_length(text_of(piece)) * CHARACTER_WIDTH * size * 20 / width))
                for piece in pieces)
            height += lines * LINE_HEIGHT * size * 20
        tallest = max(tallest, height)
    return max(tallest, row_height(row))


CLOSING_LENGTH = 300


def closes_its_page(following):
    """Whether the paragraph after a table is a short sentence that ends the page with a page
    break: alone it would fill a page of its own, so the table keeps its last row with it."""
    paragraph = re.match(r'<w:p(?:\s[^>]*[^/])?>(?:(?!</w:p>).)*</w:p>', following, re.S)
    if not paragraph or '<w:br w:type="page"/>' not in paragraph.group(0):
        return False
    length = unescaped_length(text_of(paragraph.group(0)).strip())
    return 0 < length <= CLOSING_LENGTH


def keep_together(rows, header, grid, closing=False):
    """For each row, whether it may not split and whether it keeps with the next row (rule A).
    A list people sign by hand may start under the text that asks for the signatures rather
    than move whole to the next page; a table kept whole keeps its last row with a `closing`
    sentence."""
    heights = [estimated_height(row, grid) for row in rows]
    tall = [unescaped_length(text_of(row)) > TALL_ROW_TEXT or height > TALL_ROW_ROOM
            for row, height in zip(rows, heights)]
    groups = [header <= index < len(rows) - 1 and is_group_row(row, grid) for index, row in enumerate(rows)]
    if any(tall):
        # LibreOffice keeps a row with a next one that may split, so a group's name never ends a page.
        return [not each for each in tall], groups
    keeps = [False] * len(rows)
    signed_by_hand = any('Semnătura' in text_of(row) for row in rows[:header])
    if not signed_by_hand and len(rows) - header <= WHOLE_ROWS and sum(heights) <= KEEP_ROOM:
        chain = len(rows) - 1
    else:
        # A row keeps with the next one: the header and the first body row tie the second to them.
        chain = min(header + 1, len(rows) - 1)
        while chain > 0 and sum(heights[:chain + 1]) > KEEP_ROOM:
            chain -= 1
    for index in range(chain):
        keeps[index] = True
    keeps = [keep or group for keep, group in zip(keeps, groups)]
    if closing and all(keeps[:-1]):
        keeps[-1] = True
    return [True] * len(rows), keeps


def is_group_row(row, grid):
    """A row of one cell across the table that names the rows under it: on the group fill, or
    in bold."""
    cells = CELL.findall(row)
    if len(cells) != 1 or span(cells[0]) != len(grid):
        return False
    if f'w:fill="{GROUP_FILL}"' in cell_properties(cells[0]):
        return True
    said = [run for run in RUN.findall(row) if text_of(run).strip()]
    return bool(said) and all(BOLD_RUN.search(run) for run in said)


def apply_keep(row, cant_split, keeps):
    def change(inner):
        return put(inner, 'cantSplit', '<w:cantSplit/>', TR_PR_ORDER) if cant_split else without(inner, 'cantSplit')
    row = edit_row_properties(row, change)
    return edit_paragraphs(row, lambda paragraph: keep_next(paragraph, keeps))


def with_cells(row, change):
    placed = columns_of(row)
    pieces, at = [], 0
    for (column, cell), match in zip(placed, CELL.finditer(row)):
        pieces.append(row[at:match.start()])
        pieces.append(change(column, cell))
        at = match.end()
    pieces.append(row[at:])
    return ''.join(pieces)


def neutral(fill):
    return fill and len(fill) == 6 and fill[0:2] == fill[2:4] == fill[4:6] and fill.upper() not in ('FFFFFF', '000000')


def header_cell(size, last):
    def change(column, cell):
        def properties_change(inner):
            inner = without(inner, 'tcBorders')
            if last:
                inner = put(inner, 'tcBorders', f'<w:tcBorders>{border("bottom", FRAME)}</w:tcBorders>', TC_PR_ORDER)
            if '<w:textDirection' not in inner:
                inner = without(inner, 'tcMar')
            inner = put(inner, 'shd', f'<w:shd w:val="clear" w:color="auto" w:fill="{HEADER_FILL}"/>', TC_PR_ORDER)
            return put(inner, 'vAlign', '<w:vAlign w:val="center"/>', TC_PR_ORDER)
        cell = edit_cell(cell, properties_change)
        return edit_paragraphs(cell, lambda paragraph: aligned('center')(
            edit_runs(paragraph, lambda inner: sized(size)(bold(True)(inner)))))
    return change


def body_cell(row_numbers, empty_mark=True):
    def change(column, cell):
        def properties_change(inner):
            inner = without(inner, 'tcBorders')
            if '<w:textDirection' not in inner:
                inner = without(inner, 'tcMar')
            fill = re.search(r'<w:shd\b[^>]*w:fill="(\w+)"', inner)
            if fill and neutral(fill.group(1)) and 'w:val="clear"' in fill.group(0):
                inner = put(inner, 'shd', f'<w:shd w:val="clear" w:color="auto" w:fill="{HEADER_FILL}"/>', TC_PR_ORDER)
            return inner
        cell = edit_cell(cell, properties_change)
        if column in row_numbers:
            cell = edit_paragraphs(cell, lambda paragraph: edit_runs(paragraph, bold(False)))
        if empty_mark and not continues_merge(cell) and text_of(cell).strip() in DASHES:
            cell = edit_empty_mark(cell)
        return cell
    return change


def edit_empty_mark(cell):
    paragraphs = PARAGRAPH.findall(cell)
    first = paragraphs[0]
    marked = aligned('center')(with_text(first, EMPTY_MARK))
    cell = cell.replace(first, marked, 1)
    for extra in paragraphs[1:]:
        cell = cell.replace(extra, '', 1)
    return cell


# Arial Bold's advance widths in thousandths of an em (Liberation Sans Bold has the same), a
# letter with a diacritic as wide as its letter.
BOLD_WIDTHS = dict(zip(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;-()/%',
    [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
     611, 556, 778, 556, 556, 500, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722,
     778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611] + [556] * 10 + [278, 278, 333, 333, 333,
                                                                              333, 333, 278, 889]))
BASE_LETTERS = str.maketrans('ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststAAISTST')


# Arial's, rounded up as `src/content-widths.ts` has them.
REGULAR_WIDTHS = dict(zip(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;-()/%',
    [557, 557, 500, 557, 557, 278, 557, 557, 223, 223, 500, 223, 834, 557, 557, 557, 557, 334, 500, 278,
     557, 500, 723, 500, 500, 500, 667, 667, 723, 723, 667, 611, 778, 723, 278, 500, 667, 557, 834, 723,
     778, 667, 778, 723, 667, 611, 723, 667, 944, 667, 667, 611] + [557] * 10 + [278, 278, 278, 278, 334,
                                                                              334, 334, 278, 890]))


def bold_width(word, size):
    """In twips, at `size` half-points."""
    return sum(BOLD_WIDTHS.get(letter, 611) for letter in word.translate(BASE_LETTERS)) * size / 2 * 20 / 1000


def regular_width(word, size):
    return sum(REGULAR_WIDTHS.get(letter, 611) for letter in word.translate(BASE_LETTERS)) * size / 2 * 20 / 1000


def header_floors(rows, header, size, side_padding):
    """The width each grid column needs so that no word of its header breaks inside the word."""
    across = 2 * side_padding
    floors = {}
    for row in rows[:header]:
        for column, cell in columns_of(row):
            if span(cell) > 1 or '<w:textDirection' in cell_properties(cell):
                continue
            said = ' '.join(text_of(re.sub(r'<w:(?:br|cr|tab)\b[^>]*/>', '<w:t> </w:t>', paragraph))
                            for paragraph in PARAGRAPH.findall(cell))
            words = re.split(r'[\s\u00ad/]+|(?<=-)', said)
            need = max((bold_width(word, size) for word in words if word), default=0)
            if need:
                floors[column] = max(floors.get(column, 0), math.ceil(need) + across + 20)
    return floors


def body_floors(rows, header, side_padding):
    """As `header_floors`, for the words of the body that the template holds."""
    across = 2 * side_padding
    floors = {}
    for row in rows[header:]:
        for column, cell in columns_of(row):
            if span(cell) > 1 or '<w:textDirection' in cell_properties(cell):
                continue
            for paragraph in PARAGRAPH.findall(cell):
                said = re.sub(r'&\w+;', '_', text_of(paragraph))
                if '{{' in said:
                    continue
                size = paragraph_size(paragraph)
                left = re.search(r'<w:ind\b[^>]*w:left="(\d+)"', element(paragraph, 'pPr') or '')
                need = max((regular_width(word, size) for word in re.split(r'[\s/]+|(?<=-)', said) if word), default=0)
                if need:
                    floors[column] = max(floors.get(column, 0), math.ceil(need) + across + 20 + int(left.group(1) if left else 0))
    return floors


def fits(grid, floors):
    return sum(floors.get(column, 0) for column in range(len(grid))) <= sum(grid)


def fitted(grid, floors):
    """`grid` with every column at its floor at least, the room taken from the widest columns."""
    grid = list(grid)
    if not fits(grid, floors):
        return grid
    for column, floor in sorted(floors.items()):
        while grid[column] < floor:
            widest = max(range(len(grid)), key=lambda each: grid[each] - floors.get(each, 0))
            spare = grid[widest] - floors.get(widest, 0)
            if widest == column or spare <= 0:
                return grid
            taken = min(floor - grid[column], spare)
            grid[widest] -= taken
            grid[column] += taken
    return grid


def column_headers(rows, header):
    """Grid column -> the texts of the header cells over it."""
    names = {}
    for row in rows[:header]:
        for column, cell in columns_of(row):
            label = text_of(cell).replace('\u00ad', '').strip()
            if label:
                for covered in range(column, column + span(cell)):
                    names.setdefault(covered, []).append(label)
    return names


def kept_room(rows, padding):
    """A row whose padding made room to write by hand keeps that room as its least height."""
    room = []
    for row in rows:
        tallest = 0
        for cell in CELL.findall(row):
            margins = element(cell_properties(cell), 'tcMar') or ''
            own = dict(re.findall(r'<w:(top|bottom) w:w="(\d+)"', margins))
            cell_padding = int(own.get('top', padding.get('top', 0))) + int(own.get('bottom', padding.get('bottom', 0)))
            if cell_padding > ROOM_TO_WRITE:
                sizes = [size_of(element(paragraph, 'pPr') or '') or 20 for paragraph in PARAGRAPH.findall(cell)] or [20]
                tallest = max(tallest, cell_padding + round(max(sizes) / 2 * LINE_HEIGHT * 20))
        room.append(tallest)
    return room


def at_least(height):
    def change(inner):
        current = re.search(r'<w:trHeight w:val="(\d+)"(?: w:hRule="(\w+)")?/>', inner)
        if current and current.group(2) == 'exact':
            return inner
        if current and int(current.group(1)) >= height:
            return inner
        return put(inner, 'trHeight', f'<w:trHeight w:val="{height}" w:hRule="atLeast"/>', TR_PR_ORDER)
    return change


def on_the_scale(size, wide):
    """The house sizes: 10 pt, 8 pt in a table too wide for 10. 9 and 7 pt were neither, and a
    table narrow enough for 10 pt prints nothing smaller, whatever size its text came in."""
    if not wide:
        return 20
    return 16 if size in (14, 18) else size


def snapped(row, wide):
    def change(inner):
        size = size_of(inner)
        return sized(on_the_scale(size, wide))(inner) if size is not None and on_the_scale(size, wide) != size else inner
    return RUN.sub(lambda match: edit_properties(match.group(0), 'rPr', change), set_paragraphs_marks(row, change))


def set_paragraphs_marks(row, change):
    return edit_paragraphs(row, lambda paragraph: set_paragraph(paragraph, mark_properties(change)))


def house_table(table, kind, header_size=None, snap=True, closing=False):
    rows = ROW.findall(table)
    if snap:
        wide = len(grid_of(table)) > WIDE_COLUMNS
        rows = [snapped(row, wide) for row in rows]
        table = rebuilt(table, ROW.findall(table), rows)
    header = header_count(rows)
    size = body_size(rows, header)
    grid = grid_of(table)
    if kind == 'consequences':
        grid = even_locations(grid)
    side_padding = dict(PADDING)['left']
    floors = header_floors(rows, header, size, side_padding)
    if snap and not wide:
        body = body_floors(rows, header, side_padding)
        floors = {column: max(floors.get(column, 0), body.get(column, 0)) for column in floors.keys() | body.keys()}
    grid = fitted(grid, floors)
    regridded = grid != grid_of(table)
    if regridded:
        table = re.sub(r'<w:tblGrid>.*?</w:tblGrid>',
                       '<w:tblGrid>' + ''.join(f'<w:gridCol w:w="{width}"/>' for width in grid) + '</w:tblGrid>',
                       table, count=1, flags=re.S)
    room = kept_room(rows, old_padding(table))
    names = column_headers(rows, header)
    row_numbers = {column for column, labels in names.items() if any(ROW_NUMBER_COLUMN.match(label) for label in labels)}
    styled = []
    for index, row in enumerate(rows):
        if index < header:
            row = edit_row_properties(row, lambda inner: put(inner, 'tblHeader', '<w:tblHeader/>', TR_PR_ORDER))
            row = with_cells(row, header_cell(header_size or size, index == header - 1))
        else:
            row = edit_row_properties(row, lambda inner: without(inner, 'tblHeader'))
            row = with_cells(row, body_cell(row_numbers, kind != 'consequences'))
            if kind == 'consequences':
                row = with_cells(row, consequence_cell)
        if room[index]:
            row = edit_row_properties(row, at_least(room[index]))
        if regridded:
            row = with_cells(row, lambda column, cell: with_widths(cell, column, grid))
        styled.append(row)
    alignments = column_alignments(styled, header)
    styled = styled[:header] + [aligned_row(row, grid, alignments, merged_onto(row, styled[index + 1] if index + 1 < len(styled) else ''))
                                for index, row in enumerate(styled) if index >= header]
    cant_split, keeps = keep_together(styled, header, grid, closing)
    styled = [apply_keep(row, cant, keep) for row, cant, keep in zip(styled, cant_split, keeps)]
    table = edit_properties(table, 'tblPr', house_table_properties(side_padding))
    return rebuilt(table, rows, styled)


def cell_lines(cell, column, grid):
    """The lines of text a cell holds, an empty paragraph none."""
    if '<w:textDirection' in cell_properties(cell):
        return 1
    across = sum(width for side, width in PADDING if side in ('left', 'right'))
    width = max(sum(grid[column:column + span(cell)]) - across, 200)
    lines = 0
    for paragraph in PARAGRAPH.findall(cell):
        if not text_of(paragraph).strip():
            continue
        size = paragraph_size(paragraph) / 2
        lines += sum(max(1, math.ceil(unescaped_length(text_of(piece)) * CHARACTER_WIDTH * size * 20 / width))
                     for piece in re.split(r'<w:(?:br|cr)\b[^>]*/>', paragraph))
    return lines


def is_short(text):
    return (text == EMPTY_MARK or re.match(r'\d', text) is not None or re.fullmatch(r'[IVXL]+\.', text) is not None
            or (len(text.split()) <= SHORT_WORDS and len(text) <= SHORT_TEXT))


def column_alignments(rows, header):
    """Per grid column, centred for short values and left for names and text; none where the
    values are unknown until the merge, which decides then."""
    names = column_headers(rows, header)
    values = {}
    for row in rows[header:]:
        for column, cell in columns_of(row):
            if span(cell) > 1 or continues_merge(cell) or values.get(column, []) is None:
                continue
            text = text_of(cell).strip()
            said = [paragraph for paragraph in PARAGRAPH.findall(cell) if text_of(paragraph).strip()]
            values[column] = None if '{{' in text else values.get(column, []) + [text + '\n' if len(said) > 1 else text]
    alignments = {}
    for column, said in values.items():
        labels = names.get(column, [])
        if any(VALUE_COLUMN.match(label) for label in labels):
            alignments[column] = 'center'
        elif any(TEXT_COLUMN.match(label) for label in labels):
            alignments[column] = 'left'
        elif said:
            filled = [text for text in said if text and text != EMPTY_MARK]
            if filled:
                alignments[column] = 'center' if all(not text.endswith('\n') and is_short(text) for text in filled) else 'left'
    return alignments


def merged_onto(row, following):
    """The columns where a cell of `row` starts a merge that `following` continues."""
    continued = {column for column, cell in columns_of(following) if continues_merge(cell)}
    return {column for column, cell in columns_of(row) if column in continued and not continues_merge(cell)}


def aligned_row(row, grid, alignments, merged_on=frozenset()):
    """A row of single lines reads centred; a row with more lines anywhere, or with a cell merged
    down over the next row, reads from the top, so a group's name stands beside its first row."""
    single = not merged_on and all(continues_merge(cell) or cell_lines(cell, column, grid) <= 1 for column, cell in columns_of(row))

    def change(column, cell):
        cell = edit_cell(cell, lambda inner: put(
            inner, 'vAlign', f'<w:vAlign w:val="{"center" if single else "top"}"/>', TC_PR_ORDER))
        alignment = alignments.get(column)
        if alignment and span(cell) == 1 and not continues_merge(cell):
            cell = edit_paragraphs(cell, lambda paragraph: aligned(
                'center' if text_of(paragraph).strip() == EMPTY_MARK else alignment)(paragraph))
        return cell
    return with_cells(row, change)


def rebuilt(table, rows, styled):
    pieces, at = [], 0
    for match, row in zip(ROW.finditer(table), styled):
        pieces.append(table[at:match.start()])
        pieces.append(row)
        at = match.end()
    pieces.append(table[at:])
    return ''.join(pieces)


LOCATIONS = slice(2, None)
LOCATION_WIDTH = 520


def even_locations(grid):
    """The 22 places of the body, one column each, as wide as one another; the consequences'
    names take what is left."""
    locations = len(grid[LOCATIONS])
    spare = sum(grid) - grid[0] - locations * LOCATION_WIDTH
    return [grid[0], spare] + [LOCATION_WIDTH] * locations


def with_widths(cell, column, grid):
    width = sum(grid[column:column + span(cell)])
    return edit_cell(cell, lambda inner: put(inner, 'tcW', f'<w:tcW w:w="{width}" w:type="dxa"/>', TC_PR_ORDER))


def consequence_cell(column, cell):
    """A consequence a place may suffer is an X; the dash that said it may not is left out."""
    if column < 2:
        return cell
    value = text_of(cell).strip()
    if value in DASHES:
        return edit_paragraphs(cell, lambda paragraph: with_text(paragraph, ''))
    if value.lower() == 'x':
        return edit_paragraphs(cell, lambda paragraph: edit_runs(with_text(paragraph, 'X'), bold(True)))
    return cell


def luminance(colour):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4
    red, green, blue = (int(colour[index:index + 2], 16) for index in (0, 2, 4))
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)


def shading_colour(shading):
    """The colour a cell's shading prints: a percentage of its pattern colour over its fill."""
    value = re.search(r'w:val="(\w+)"', shading).group(1)
    fill = re.search(r'w:fill="(\w+)"', shading)
    pattern = re.search(r'w:color="(\w+)"', shading)
    fill = fill.group(1) if fill and fill.group(1) != 'auto' else 'FFFFFF'
    pattern = pattern.group(1) if pattern and pattern.group(1) != 'auto' else '000000'
    share = 1.0 if value == 'solid' else int(value[3:]) / 100 if value.startswith('pct') else 0.0
    mixed = [round(int(fill[index:index + 2], 16) * (1 - share) + int(pattern[index:index + 2], 16) * share)
             for index in (0, 2, 4)]
    return ''.join(f'{channel:02X}' for channel in mixed)


def readable_text(background):
    """Black or white, whichever stands out more against `background`."""
    light = luminance(background)
    return '000000' if (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) else 'FFFFFF'


def readable_grid(table):
    """The text of a shaded cell in the colour that reads on its grey, the header fill the house
    one, and the rows of the level scale at one least height."""
    def cell_change(column, cell):
        shading = re.search(r'<w:shd\b[^>]*/>', cell_properties(cell))
        if not shading:
            return cell
        fill = re.search(r'w:fill="(\w+)"', shading.group(0))
        if 'w:val="clear"' in shading.group(0):
            if not fill or not neutral(fill.group(1)):
                return cell
            return edit_cell(cell, lambda inner: put(
                inner, 'shd', f'<w:shd w:val="clear" w:color="auto" w:fill="{HEADER_FILL}"/>', TC_PR_ORDER))
        colour = readable_text(shading_colour(shading.group(0)))
        return edit_paragraphs(cell, lambda paragraph: edit_runs(paragraph, coloured(colour)))
    rows = ROW.findall(table)
    styled = [with_cells(row, cell_change) for row in rows]
    if text_of(rows[0]).startswith('NIVEL DE'):
        styled = styled[:1] + [edit_row_properties(row, at_least(480)) for row in styled[1:]]
    return rebuilt(table, rows, styled)


def top_level_tables(xml):
    depth, start = 0, 0
    for match in re.finditer(r'<(/?)w:tbl>', xml):
        if not match.group(1):
            if depth == 0:
                start = match.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                yield start, match.end()


def body_blocks(xml):
    """The top-level paragraphs and tables of a part, as (kind, start, end)."""
    depth, start, kind = 0, 0, None
    for match in re.finditer(r'<(/?)w:(p|tbl)\b[^>]*?(/?)>', xml):
        closing, name, empty = match.groups()
        if empty:
            if depth == 0:
                yield name, match.start(), match.end()
        elif closing:
            depth -= 1
            if depth == 0:
                yield kind, start, match.end()
        else:
            if depth == 0:
                start, kind = match.start(), name
            depth += 1


def spaced(side, least):
    def change(inner):
        spacing = element(inner, 'spacing')
        if spacing is None:
            return put(inner, 'spacing', f'<w:spacing w:{side}="{least}"/>', P_PR_ORDER)
        current = re.search(rf' w:{side}="(\d+)"', spacing)
        if current and int(current.group(1)) >= least:
            return inner
        changed = (spacing.replace(current.group(0), f' w:{side}="{least}"') if current
                   else spacing.replace('<w:spacing', f'<w:spacing w:{side}="{least}"', 1))
        return inner.replace(spacing, changed, 1)
    return change


def around_tables(xml):
    """The line that introduces a house table keeps with it and stands 6 pt above it; the text
    after it stands 6 pt below. Loop tags in between leave nothing once merged."""
    blocks = list(body_blocks(xml))
    edits = {}

    def edit(index, change):
        edits.setdefault(index, []).append(change)
    for index, (kind, start, end) in enumerate(blocks):
        if kind != 'tbl' or f'<w:tblStyle w:val="{HOUSE_TABLE}"/>' not in xml[start:end]:
            continue
        before = index - 1
        tags = []
        while before >= 0 and blocks[before][0] == 'p' and LOOP_TAGS_ONLY.fullmatch(text_of(xml[blocks[before][1]:blocks[before][2]]).strip() or '-'):
            tags.append(before)
            before -= 1
        if before >= 0 and blocks[before][0] == 'p':
            said = text_of(xml[blocks[before][1]:blocks[before][2]]).strip()
            if said and len(said) <= LEAD_IN_TEXT:
                edit(before, lambda paragraph: set_paragraph(keep_next(paragraph, True), spaced('after', 120)))
                for tag in tags:
                    edit(tag, lambda paragraph: keep_next(paragraph, True))
        after = index + 1
        while after < len(blocks) and blocks[after][0] == 'p' and LOOP_TAGS_ONLY.fullmatch(text_of(xml[blocks[after][1]:blocks[after][2]]).strip() or '-'):
            after += 1
        if after < len(blocks) and blocks[after][0] == 'p' and text_of(xml[blocks[after][1]:blocks[after][2]]).strip():
            edit(after, lambda paragraph: set_paragraph(paragraph, spaced('before', 120)))
    for index in sorted(edits, reverse=True):
        _, start, end = blocks[index]
        paragraph = xml[start:end]
        for change in edits[index]:
            paragraph = change(paragraph)
        xml = xml[:start] + paragraph + xml[end:]
    return xml


def house_tables(xml, file_name=None):
    header_size = SMALL_HEADERS.get(file_name)
    snap = file_name is not None and file_name not in DENSE_FORMS
    for start, end in reversed(list(top_level_tables(xml))):
        table = xml[start:end]
        kind = kind_of(table)
        if kind in ('house', 'consequences'):
            table = house_table(table, kind, header_size, snap, closes_its_page(xml[end:]))
        elif kind == 'scale':
            table = readable_grid(table)
        xml = xml[:start] + table + xml[end:]
    return around_tables(xml)


# The merge shares the width among these tables' columns by what the client's data puts in them
# (`src/content-widths.ts`), one set for the document: the prevention plan keeps the columns of
# annex 7 to H.G. 1425/2006, whose kinds of measure are filled very unevenly from client to client.
CONTENT_WIDTHS = 'ContentWidths'
# The registers' headers name up to 18 columns: 7 pt, in all four, over an 8 pt body.
SMALL_HEADERS = {'7.2_event_registers.docx': 14}
# The sheets fit a training's rows and signatures on one page in 7 and 9 pt.
DENSE_FORMS = ('fisa_instruire_ssm.docx', 'fisa_test.docx')
CONTENT_WIDTH_TABLES = {'10_prevention_plan.docx': '{{#plan}}'}


def marked_for_content_widths(xml, file_name):
    loop = CONTENT_WIDTH_TABLES.get(file_name)
    if not loop:
        return xml
    for start, end in reversed(list(top_level_tables(xml))):
        table = xml[start:end]
        if loop in table:
            table = edit_properties(table, 'tblPr', lambda inner: put(
                inner, 'tblCaption', f'<w:tblCaption w:val="{CONTENT_WIDTHS}"/>', TBL_PR_ORDER))
            xml = xml[:start] + table + xml[end:]
    return xml


def with_house_style(styles):
    if f'w:styleId="{HOUSE_TABLE}"' in styles:
        return styles
    return styles.replace('</w:styles>', f'{HOUSE_TABLE_STYLE}</w:styles>', 1)


def draws_house_tables(document):
    return any(kind_of(document[start:end]) in ('house', 'consequences') for start, end in top_level_tables(document))


def house_tables_part(name, xml, house=True, file_name=None):
    """`house` says whether the document draws a house table, which its styles then define."""
    if name == 'word/document.xml':
        return house_tables(xml, file_name)
    if name == 'word/styles.xml' and house:
        return with_house_style(xml)
    return xml


SECT_PR_ORDER = ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar',
                 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote',
                 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange']
BORDER_ORDER = ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV', 'tl2br', 'tr2bl']
PARAGRAPH_BORDER_ORDER = ['top', 'left', 'bottom', 'right', 'between', 'bar']
SCHEMA_ORDERS = {'rPr': R_PR_ORDER, 'pPr': P_PR_ORDER, 'tblPr': TBL_PR_ORDER, 'tcPr': TC_PR_ORDER,
                 'sectPr': SECT_PR_ORDER, 'tblBorders': BORDER_ORDER, 'tcBorders': BORDER_ORDER,
                 'tblCellMar': BORDER_ORDER, 'tcMar': BORDER_ORDER, 'pBdr': PARAGRAPH_BORDER_ORDER}
TAG = re.compile(r'<(/?)([\w:]+)[^>]*?(/?)>')


def top_level(inner):
    """The child elements of `inner` as (name, xml), or None when it holds text between them."""
    children, depth, start, name = [], 0, 0, None
    for match in TAG.finditer(inner):
        closing, tag, empty = match.group(1), match.group(2), match.group(3)
        if depth == 0:
            if inner[start:match.start()].strip():
                return None
            start, name = match.start(), tag
        if empty:
            if depth == 0:
                children.append((name, inner[start:match.end()]))
                start = match.end()
        elif closing:
            depth -= 1
            if depth == 0:
                children.append((name, inner[start:match.end()]))
                start = match.end()
        else:
            depth += 1
    return children if depth == 0 and not inner[start:].strip() else None


def in_schema_order(xml):
    """Every property element's children in the order the schema requires: Word refuses a file
    whose `w:numPr` follows `w:spacing`, or whose `w:b` comes before `w:rFonts`. An element of
    another name keeps its place after the one before it. Safe to run again."""
    def ordered(match):
        tag, attributes, inner = match.group(1), match.group(2) or '', match.group(3)
        children = top_level(inner)
        if not children:
            return match.group(0)
        sequence = SCHEMA_ORDERS[tag]
        keys, last = [], -1
        for name, _ in children:
            local = name.split(':')[-1]
            last = sequence.index(local) if name.startswith('w:') and local in sequence else last
            keys.append(last)
        children = [child for _, child in sorted(zip(keys, children), key=lambda pair: pair[0])]
        return f'<w:{tag}{attributes}>' + ''.join(child for _, child in children) + f'</w:{tag}>'
    # Inner elements first, so a paragraph's mark properties are in order before the paragraph's.
    for tag in ['rPr', 'pBdr', 'tblBorders', 'tcBorders', 'tblCellMar', 'tcMar', 'tcPr', 'tblPr', 'sectPr', 'pPr']:
        xml = re.sub(rf'<w:({tag})(\s[^>]*)?>((?:(?!<w:{tag}[\s>]).)*?)</w:{tag}>', ordered, xml, flags=re.S)
    return xml


FONTS = re.compile(r'<w:rFonts\b[^>]*>')
FONT_ATTRIBUTE = re.compile(r'(\bw:(?:ascii|hAnsi|cs|eastAsia)=")([^"]*;[^"]*)(")')


def in_schema_values(xml):
    """Attribute values the schema accepts: a table header row's on/off takes only "on" or
    "off", so the "true" LibreOffice writes there makes the file invalid, and a font name is at
    most 31 characters, so the "PostScript;family" pair an original carried is cut to the
    family. Safe to run again."""
    xml = re.sub(r'<w:(tblHeader|cantSplit) w:val="(?:true|1|on)"/>', r'<w:\1/>', xml)
    xml = re.sub(r'<w:(?:tblHeader|cantSplit) w:val="(?:false|0|off)"/>', '', xml)
    family = lambda match: match.group(1) + match.group(2).split(';')[-1].strip() + match.group(3)
    return FONTS.sub(lambda fonts: FONT_ATTRIBUTE.sub(family, fonts.group(0)), xml)
