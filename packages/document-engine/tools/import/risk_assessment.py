"""9's own typesetting, over the saved XML, after the set's typography. Safe to run again: every
rule finds its place by the text around it and writes the same result whatever it finds there.

Formulas are Word formulas in the subset every reader of the set lays out: the in-app editor
draws a formula only when no run of it carries properties, no `m:ctrlPr` stands in it, and it
uses fractions, scripts, radicals and n-ary operators; a delimiter, a matrix, a limit or an
equation array falls back to its letters run together ("Ng=p=1nrp·Nspp=1nrp"). So a
submatrix reads M₂,ₚ = ‖(2,2) (2,3) (2,4)‖, p = 2,…,4, and the 7 × 6 matrix of the pairs is a
small table between double lines. A display formula is centred on its own line, kept with the
sentence that introduces it; the two the text refers back to, N_r and N_g, carry (1) and (2)
at the right margin, in a borderless row of three cells: the editor sets a formula after a
centre tab where the tab is, not around it. Their legend is "unde:", then a symbol, an en dash
and its meaning in three columns, the symbols italic text like every symbol in the running text.

The lists the original typed as paragraphs become house lists: a typed label, bold, a tab, and
the text hanging from its tier; the posts' factors read 1. → a) → F-code. The evaluation team
is a dash list, each member's name bold, the client named once in the line above.
"""

import re

from table_style import P_PR_ORDER, R_PR_ORDER, RUN, edit_properties, element, put
from typography import body_blocks, bold, edit_run, edit_text_range, escaped, spoken, text_of, unescaped
from typography import lists as lists_spacing

NAME = '9_risk_assessment.docx'
TIER = 360  # 6.35 mm
HANG = 567  # 1 cm, the hang of a label wider than a tier ("VI.II.", "F10.")
GAP = 40
ROOM = 120
TEXT_COLUMN = 9354  # A4 less 25 and 20 mm
DASH = '–'
FORMULA_SIDE = 851  # 15 mm, the cells beside a numbered formula

ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'


def r(text):
    return f'<m:r><m:t xml:space="preserve">{escaped(text)}</m:t></m:r>'


def sub(base, index):
    return f'<m:sSub><m:e>{r(base)}</m:e><m:sub>{r(index)}</m:sub></m:sSub>'


def frac(numerator, denominator):
    return f'<m:f><m:num>{numerator}</m:num><m:den>{denominator}</m:den></m:f>'


def total(lower, upper, body):
    return (f'<m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr>'
            f'<m:sub>{lower}</m:sub><m:sup>{upper}</m:sup><m:e>{body}</m:e></m:nary>')


def omath(content):
    return f'<m:oMath>{content}</m:oMath>'


def display_math(content):
    return f'<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>{omath(content)}</m:oMathPara>'


def submatrix(index, pairs, counter):
    """M with its row and column index, the pairs between double bars, then the range."""
    cells = '  '.join(f'({pair})' for pair in pairs)
    return omath(sub('M', index) + r('=') + r('‖') + r(cells) + r('‖') + r(',') + r(' ') + r(counter))


N_R = (sub('N', 'r') + r('=') +
       frac(total(r('i=1'), r('n'), sub('r', 'i') + r('·') + sub('R', 'i')),
            total(r('i=1'), r('n'), sub('r', 'i'))))
N_G = (sub('N', 'g') + r('=') +
       frac(total(r('p=1'), r('n'), sub('r', 'p') + r('·') + sub('N', 'sp')),
            total(r('p=1'), r('n'), sub('r', 'p'))))
R_SET = total(r('R=1'), r('7'), sub('N', 'R'))
LIMITS = (r('y') + r('=') + frac(r('1'), r('0')) + r('→+∞;'), r('y') + r('=') + frac(r('1'), r('+∞')) + r('→0.'))

NR_LEGEND = [(('N', 'r'), 'nivelul de risc global pe locul de muncă;'),
             (('r', 'i'), 'rangul factorului de risc „i”;'),
             (('R', 'i'), 'nivelul de risc pentru factorul de risc „i”;'),
             (('n', None), 'numărul factorilor de risc identificați la locul de muncă.')]
NG_LEGEND = [(('r', 'p'), 'rangul locului de muncă „p” (egal ca valoare cu nivelul de risc al locului);'),
             (('n', None), 'numărul de locuri de muncă analizate;'),
             (('N', 'sp'), 'nivelul mediu de securitate a muncii pentru locul de muncă „p”.')]

# The submatrices of the risk levels, as the method's figure 1.5 b reads them: the level, then
# (row index, pairs, range) for each, then what follows them.
LEVEL_ONE = ('1,p', ['1,1', '1,2', '1,3', '1,4', '1,5', '1,6'], 'p=1,…,6')
LEVELS = [
    (2, [('2,p', ['2,2', '2,3', '2,4'], 'p=2,…,4')], ' și elementul (4,1);'),
    (3, [('2,p', ['2,5', '2,6'], 'p=5, 6'), ('3,p', ['3,3', '3,4'], 'p=3, 4')], ' și elementul (4,2);'),
    (4, [('3,p', ['3,5', '3,6'], 'p=5, 6'), ('4,p', ['4,3', '4,4'], 'p=3, 4'), ('5,p', ['5,2', '5,3'], 'p=2, 3'),
         ('g,2', ['6,2', '7,2'], 'g=6, 7')], ';'),
    (5, [('4,p', ['4,5', '4,6'], 'p=5, 6'), ('5,p', ['5,4', '5,5'], 'p=4, 5')], ';'),
    (6, [('6,p', ['6,4', '6,5'], 'p=4, 5')], ' și elementele (5,6), (7,4);'),
    (7, [('7,p', ['7,5', '7,6'], 'p=5, 6')], '.'),
]


def run(text, *, b=False, i=False, script=None, size=20):
    props = ARIAL + ('<w:b/><w:bCs/>' if b else '') + ('<w:i/><w:iCs/>' if i else '')
    props += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    if script:
        props += f'<w:vertAlign w:val="{script}"/>'
    props += '<w:lang w:val="ro-RO"/>'
    return f'<w:r><w:rPr>{props}</w:rPr><w:t xml:space="preserve">{escaped(text)}</w:t></w:r>'


TAB = f'<w:r><w:rPr>{ARIAL}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/></w:r>'


def symbol(base, index=None):
    """A symbol in the text: its letter italic, its index upright and lowered."""
    return run(base, i=True) + (run(index, script='subscript') if index else '')


def paragraph(content, *, left=0, hanging=0, before=0, after=ROOM, jc='left', keep=False, tabs=()):
    stops = ''.join(f'<w:tab w:val="left" w:pos="{tab}"/>' for tab in tabs)
    return (f'<w:p><w:pPr><w:pStyle w:val="Normal"/>{"<w:keepNext/>" if keep else ""}<w:widowControl/>'
            f'{f"<w:tabs>{stops}</w:tabs>" if stops else ""}<w:spacing w:before="{before}" w:after="{after}"/>'
            f'<w:ind w:left="{left}" w:hanging="{hanging}"/><w:jc w:val="{jc}"/>'
            f'<w:rPr>{ARIAL}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>{content}</w:p>')


def display(content):
    return paragraph(display_math(content), before=ROOM, after=ROOM, jc='center')


def numbered_display(content, number):
    """A formula centred on the text column with its number at the right margin, in a row of
    three cells without lines."""
    middle = TEXT_COLUMN - 2 * FORMULA_SIDE

    def cell(width, body, jc):
        return (f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>'
                f'{paragraph(body, after=0, jc=jc, keep=True)}</w:tc>')
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{TEXT_COLUMN}" w:type="dxa"/><w:jc w:val="left"/>'
            f'<w:tblInd w:w="0" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/>'
            f'<w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>'
            f'</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="{ROOM}" w:type="dxa"/>'
            f'<w:left w:w="0" w:type="dxa"/><w:bottom w:w="{ROOM}" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>'
            f'</w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="{FORMULA_SIDE}"/>'
            f'<w:gridCol w:w="{middle}"/><w:gridCol w:w="{FORMULA_SIDE}"/></w:tblGrid>'
            f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{cell(FORMULA_SIDE, "", "left")}'
            f'{cell(middle, display_math(content), "center")}{cell(FORMULA_SIDE, run(f"({number})"), "right")}'
            f'</w:tr></w:tbl>')


def legend(entries):
    """"unde:", then the symbols one tier in, their dashes and meanings in two columns."""
    dash_at = 3 * TIER
    text_at = dash_at + 227
    lines = paragraph(run('unde:'), after=GAP, keep=True)
    for index, ((base, index_text), meaning) in enumerate(entries):
        last = index == len(entries) - 1
        lines += paragraph(symbol(base, index_text) + TAB + run(DASH) + TAB + run(meaning),
                           left=text_at, hanging=text_at - TIER, after=ROOM if last else GAP, keep=not last,
                           tabs=(TIER, dash_at, text_at))
    return lines


def pairs_matrix():
    """The 7 × 6 pairs of gravity and probability classes, a row per gravity class, between
    double bars: a table, since the editor lays out no matrix."""
    label_width, pair_width = 1077, 680
    side = (TEXT_COLUMN - label_width - 6 * pair_width) // 2
    widths = [side, label_width] + [pair_width] * 6 + [TEXT_COLUMN - 2 * side - label_width - 6 * pair_width + side]
    bar = '<w:{side} w:val="double" w:sz="4" w:space="0" w:color="000000"/>'

    def cell(width, body, *, borders='', merge='', jc='center'):
        return (f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{merge}'
                f'{f"<w:tcBorders>{borders}</w:tcBorders>" if borders else ""}<w:vAlign w:val="center"/></w:tcPr>'
                f'{paragraph(body, after=0, jc=jc, keep=True)}</w:tc>')
    rows = ''
    for gravity in range(1, 8):
        merge = '<w:vMerge w:val="restart"/>' if gravity == 1 else '<w:vMerge/>'
        # LibreOffice prints a formula that ends in "=" with a "¿" for the missing side.
        label = symbol('M', 'g,p') + run(' =') if gravity == 1 else ''
        cells = cell(widths[0], '') + cell(widths[1], label, merge=merge, jc='right')
        for probability in range(1, 7):
            borders = (bar.format(side='left') if probability == 1 else '') + (bar.format(side='right') if probability == 6 else '')
            cells += cell(pair_width, run(f'({gravity},{probability})'), borders=borders)
        cells += cell(widths[-1], '')
        rows += f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{cells}</w:tr>'
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{TEXT_COLUMN}" w:type="dxa"/><w:jc w:val="left"/>'
            f'<w:tblInd w:w="0" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/>'
            f'<w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>'
            f'</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
            f'<w:left w:w="57" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="57" w:type="dxa"/>'
            f'</w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{rows}</w:tbl>')


def level_items():
    items = ''
    for index, (level, matrices, tail) in enumerate(LEVELS):
        content = run(DASH) + TAB + run(f'nivelul {level}: ')
        if level == 7:
            content += run('elementul (6,6) și submatricea ')
        for position, (row_index, pairs, counter) in enumerate(matrices):
            if position:
                content += run('; ')
            content += submatrix(row_index, pairs, counter)
        content += run(tail)
        last = index == len(LEVELS) - 1
        items += paragraph(content, left=2 * TIER, hanging=TIER, after=ROOM if last else GAP, keep=not last,
                           tabs=(2 * TIER,))
    return items


def italic(inner):
    for tag in ('i', 'iCs'):
        inner = put(inner, tag, f'<w:{tag}/>', R_PR_ORDER)
    return inner


def blocks(document):
    return list(body_blocks(document))


def said(document, block):
    return unescaped(spoken(document[block[1]:block[2]])).strip()


def find(document, pattern, after=0):
    for index, block in enumerate(blocks(document)):
        if block[1] >= after and block[0] == 'p' and re.search(pattern, said(document, block)):
            return index
    raise ValueError(f'9: no paragraph matches {pattern!r}')


def replace_blocks(document, first, last, xml):
    """Blocks first..last (inclusive) replaced by `xml`."""
    found = blocks(document)
    return document[:found[first][1]] + xml + document[found[last][2]:]


def has_math(document, block):
    return '<m:oMath' in document[block[1]:block[2]]


def formulas(document):
    at = find(document, r'^În realitate, datorită trăsăturilor oricărui sistem')
    last = at + 2 if has_math(document, blocks(document)[at + 2]) else at + 1
    if has_math(document, blocks(document)[at + 1]):
        document = replace_blocks(document, at + 1, last, display(LIMITS[0]) + display(LIMITS[1]))
    at = find(document, r'^Dacă luăm în considerare toate combinațiile posibile')
    end = find(document, r'^Reprezentând grafic \(figura 1\.4\)')
    document = replace_blocks(document, at + 1, end - 1, pairs_matrix())
    document = set_gap(document, at, after=ROOM, keep=True)
    document = set_gap(document, find(document, r'^Reprezentând grafic \(figura 1\.4\)'), before=ROOM)
    # The second set of risk levels shared its paragraph with figure 1.4.
    at = find(document, r'^Reprezentând grafic \(figura 1\.4\)')
    document = replace_blocks(document, at + 1, at + 1, display(R_SET))
    at = find(document, r'^De asemenea, cu ajutorul fiecăruia dintre cupluri')
    found = blocks(document)
    block = found[at + 1]
    xml = document[block[1]:block[2]]
    if '<w:drawing' in xml and '<m:oMath' in xml:
        figure = re.sub(r'<m:oMathPara\b.*?</m:oMathPara>|<m:oMath\b.*?</m:oMath>', '', xml, flags=re.S)
        figure = re.sub(r'<w:r>(?:<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?<w:br/></w:r>', '', figure, flags=re.S)
        document = document[:block[1]] + display(R_SET) + figure + document[block[2]:]
    elif '<m:oMath' in xml:
        document = replace_blocks(document, at + 1, at + 1, display(R_SET))
    at = find(document, r'nivelului 1 de risc îi corespunde submatricea:$')
    document = replace_blocks(document, at + 1, at + 1, paragraph(
        submatrix(*LEVEL_ONE) + run(' și elementul (2,1).')))
    at = find(document, r'^Interpretând reprezentarea din figura 1\.5 b')
    end = find(document, r'^Din relația risc – securitate definită se deduce')
    document = replace_blocks(document, at + 1, end - 1, level_items())
    document = set_gap(document, at, after=GAP, keep=True)
    at = find(document, r'^Formula de calcul al nivelului de risc global este următoarea:')
    end = find(document, r'^Nivelul de securitate \(NS\) pe loc de muncă')
    document = replace_blocks(document, at + 1, end - 1, numbered_display(N_R, 1) + legend(NR_LEGEND))
    document = set_gap(document, at, after=0, keep=True)
    at = find(document, r'întreprinderea investigată – N')
    end = find(document, r'^E\. Stabilirea măsurilor de prevenire:')
    document = replace_blocks(document, at + 1, end - 1, numbered_display(N_G, 2) + legend(NG_LEGEND))
    document = set_gap(document, at, after=0, keep=True)
    return document


def set_gap(document, index, *, before=None, after=None, keep=None):
    block = blocks(document)[index]
    xml = document[block[1]:block[2]]

    def change(inner):
        spacing = element(inner, 'spacing') or '<w:spacing/>'
        for name, value in (('before', before), ('after', after)):
            if value is None:
                continue
            spacing = re.sub(rf'\s*w:{name}="[^"]*"', '', spacing).replace('<w:spacing', f'<w:spacing w:{name}="{value}"', 1)
        inner = put(inner, 'spacing', spacing, P_PR_ORDER)
        if keep is not None:
            inner = put(inner, 'keepNext', '<w:keepNext/>' if keep else '<w:keepNext w:val="false"/>', P_PR_ORDER)
        return inner
    return document[:block[1]] + edit_properties(xml, 'pPr', change) + document[block[2]:]


def strip_lead(xml, count):
    """The paragraph without the first `count` characters of its spoken text (tabs count one)."""
    def cut(match):
        nonlocal count
        piece = match.group(0)
        if count <= 0:
            return piece
        if piece == '<w:tab/>':
            count -= 1
            return ''
        opening, text, closing = re.match(r'(<w:t\b[^>]*>)([^<]*)(</w:t>)', piece).groups()
        plain = unescaped(text)
        taken = min(count, len(plain))
        count -= taken
        rest = plain[taken:]
        opening = opening if 'xml:space' in opening else opening.replace('<w:t', '<w:t xml:space="preserve"', 1)
        return f'{opening}{escaped(rest)}{closing}'
    head = re.match(r'<w:p\b[^>]*>(?:<w:pPr>.*?</w:pPr>)?', xml, re.S).end()
    body = re.sub(r'<w:t\b[^>]*>[^<]*</w:t>|<w:tab/>', cut, xml[head:])
    return xml[:head] + body


def first_run_properties(xml):
    head = re.match(r'<w:p\b[^>]*>(?:<w:pPr>.*?</w:pPr>)?', xml, re.S).end()
    for match in RUN.finditer(xml, head):
        if '<w:t' in match.group(0):
            return element(match.group(0)[len('<w:r>'):], 'rPr') or '<w:rPr></w:rPr>'
    return '<w:rPr></w:rPr>'


def labelled(xml, pattern, label, *, left, hanging, after=None, before=None, keep=None, tabs=None):
    """The paragraph led by `label`, bold, and a tab, its text hanging from the label: whatever
    `pattern` matched at its head (an old label and the room after it) goes."""
    text = unescaped(spoken(xml))
    lead = len(text) - len(text.lstrip())
    found = re.match(pattern, text[lead:])
    assert found, (pattern, text[:80])
    original = first_run_properties(xml)
    xml = strip_lead(xml, lead + found.end())
    xml = re.sub(r'<w:r>(?:<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?(?:<w:t(?: xml:space="preserve")?></w:t>)?</w:r>', '', xml,
                 flags=re.S)
    properties = first_run_properties(xml) if re.search(r'<w:t\b', xml) else original
    properties = re.sub(r'<w:(?:b|bCs|i|iCs)(?: w:val="\w+")?/>|<w:vertAlign [^>]*/>', '', properties)
    label_run = edit_run(f'<w:r>{properties}<w:t xml:space="preserve">{escaped(label)}</w:t></w:r>', bold(True)) if label else ''
    tab_run = f'<w:r>{properties}<w:tab/></w:r>'
    head = re.match(r'<w:p\b[^>]*>(?:<w:pPr>.*?</w:pPr>)?', xml, re.S).end()
    xml = xml[:head] + label_run + tab_run + xml[head:]
    xml = re.sub(r'<w:r>(?:<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?(?:<w:t(?: xml:space="preserve")?></w:t>)?</w:r>', '', xml,
                 flags=re.S)
    return indented(xml, left=left, hanging=hanging, after=after, before=before, keep=keep,
                    tabs=tabs if tabs is not None else (left,), unnumbered=True)


def indented(xml, *, left, hanging, after=None, before=None, keep=None, tabs=None, unnumbered=False):
    def change(inner):
        if unnumbered and element(inner, 'numPr'):
            inner = put(inner, 'numPr', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>', P_PR_ORDER)
        inner = put(inner, 'ind', f'<w:ind w:left="{left}" w:hanging="{hanging}"/>', P_PR_ORDER)
        if tabs is not None:
            stops = ''.join(f'<w:tab w:val="left" w:pos="{tab}"/>' for tab in tabs)
            inner = put(inner, 'tabs', f'<w:tabs>{stops}</w:tabs>', P_PR_ORDER) if stops else inner
        spacing = element(inner, 'spacing') or '<w:spacing/>'
        for name, value in (('before', before), ('after', after)):
            if value is not None:
                spacing = re.sub(rf'\s*w:{name}="[^"]*"', '', spacing).replace('<w:spacing', f'<w:spacing w:{name}="{value}"', 1)
        inner = put(inner, 'spacing', spacing, P_PR_ORDER)
        if keep is not None:
            inner = put(inner, 'keepNext', '<w:keepNext/>' if keep else '<w:keepNext w:val="false"/>', P_PR_ORDER)
        return inner
    return edit_properties(xml, 'pPr', change)


def edit_paragraphs(document, pattern, change, *, after=0, before=None, count=None):
    """Every top-level paragraph whose spoken text matches `pattern`, passed through `change(xml,
    match, position, total)`; `count` checks how many there are."""
    found = [(start, end) for kind, start, end in blocks(document)
             if kind == 'p' and start >= after and (before is None or start < before) and re.search(pattern, unescaped(spoken(document[start:end])).strip())]
    if count is not None:
        assert len(found) == count, (pattern, len(found))
    for position, (start, end) in reversed(list(enumerate(found))):
        xml = document[start:end]
        match = re.search(pattern, unescaped(spoken(xml)).strip())
        document = document[:start] + change(xml, match, position, len(found)) + document[end:]
    return document


def lead_in(document, pattern):
    return edit_paragraphs(document, pattern, lambda xml, *_: indented(xml, left=0, hanging=0, after=GAP, keep=True),
                           count=1)


def lists(document):
    document = edit_paragraphs(document, r'^[-–]?\s*clasa [1-7]: consecințe', lambda xml, match, position, total: bold_lead(
        labelled(xml, r'[-–]?\s*', DASH, left=2 * TIER, hanging=TIER, before=0,
                 after=ROOM if position == total - 1 else GAP, keep=position < total - 1), r'clasa \d:'), count=7)
    document = edit_paragraphs(document, r'^[-–]?\s*N[1-7] – nivel ', lambda xml, match, position, total: labelled(
        xml, r'[-–]?\s*', DASH, left=2 * TIER, hanging=TIER, before=0,
        after=ROOM if position == total - 1 else GAP, keep=position < total - 1), count=7)
    document = edit_paragraphs(document, r'^[-–]?\s*Nivelul de risc [1-7] – cuplurile g-p:', lambda xml, match, position, total:
                               labelled(xml, r'[-–]?\s*', DASH, left=2 * TIER, hanging=TIER, before=0,
                                        after=ROOM if position == total - 1 else GAP, keep=position < total - 1),
                               count=7)
    document = lead_in(document, r'^Metoda cuprinde următoarele etape obligatorii:$')
    document = lead_in(document, r'^Procedura de lucru a metodei de evaluare prin analiză sistematică cuprinde')
    document = lead_in(document, r'putem stabili și pentru gravitatea consecințelor mai multe clase, după cum urmează:$')
    document = lead_in(document, r'relația invers proporțională între cele două stări \(risc – securitate\):$')
    document = edit_paragraphs(document, r'^([IVX]+)\.\s+(?=[a-zăâîșț])', lambda xml, match, *_: labelled(
        xml, r'[IVX]+\.\s*', f'{match.group(1)}.', left=2 * TIER, hanging=TIER, before=0, after=GAP,
        keep=spoken(xml).rstrip().endswith(':')), count=11)
    document = edit_paragraphs(document, r'^([IVX]+\.(?:[IVX]+|\d)\.)\s+(?=[a-zăâîșț])', lambda xml, match, *_: labelled(
        xml, r'[IVX]+\.(?:[IVX]+|\d)\.\s*', match.group(1), left=2 * TIER + HANG, hanging=HANG, before=0, after=GAP),
        count=6)
    for last in (r'^VI\.III\.\s+determinarea', r'^V\.3\.\s+determinarea'):
        document = edit_paragraphs(document, last, lambda xml, *_: indented(xml, left=2 * TIER + HANG, hanging=HANG,
                                                                             after=ROOM), count=1)
    for letter in 'ab':
        document = edit_paragraphs(document, rf'^{letter}[.)]\s+(?:În timpul evaluării|Gestiunea computerizată)',
                                   lambda xml, match, *_, letter=letter: labelled(
                                       xml, r'[a-z][.)]\s*', f'{letter})', left=TIER, hanging=TIER, before=ROOM,
                                       after=GAP if letter == 'a' else ROOM, keep=letter == 'a'), count=1)
    uses = [r'^(?:\d\.\s*)?constituirea unor bănci de date privind:', r'^(?:\d\.\s*)?calculul automat al nivelurilor de risc']
    for number, pattern in enumerate(uses, 1):
        document = edit_paragraphs(document, pattern, lambda xml, match, *_, number=number: labelled(
            xml, r'(?:\d\.\s*)?', f'{number}.', left=2 * TIER, hanging=TIER, before=0, after=GAP if number == 1 else ROOM,
            keep=number == 1), count=1)
    banks = ['durata de viață a echipamentelor tehnice', 'timpul de funcționare', 'numărul de persoane expuse',
             'timpul de expunere', 'statistica accidentelor de muncă']
    for index, start in enumerate(banks):
        letter = 'abcde'[index]
        document = edit_paragraphs(document, rf'^(?:[a-e]\)\s*)?{start}', lambda xml, match, *_, letter=letter: labelled(
            xml, r'(?:[a-e]\)\s*)?', f'{letter})', left=3 * TIER, hanging=TIER, before=0, after=GAP), count=1)
    document = lead_in(document, r'^În ceea ce privește clasele de probabilitate')
    document = edit_paragraphs(document, r'^[-–]?\s*clasa ([1-6])\s*→\s*(.*)$', probability_class, count=6)
    document = edit_paragraphs(document, r'^(?:[1-4]\.\s*)?MĂSURI (PRIMARE|SECUNDARE|TERȚIARE|CUATERNARE) \(', lambda xml, match, position, total:
                               labelled(xml, r'(?:[1-4]\.\s*)?', f'{position + 1}.', left=TIER, hanging=TIER, before=0,
                                        after=ROOM if position == total - 1 else GAP), count=4)
    document = edit_paragraphs(document, r'^[^:]{3,90}:$', lambda xml, *_: indented_keep(xml))
    document = edit_paragraphs(document, r'^LA NIVELUL UNITĂȚII SE VOR AVEA ÎN VEDERE URMĂTOARELE:$',
                               lambda xml, *_: indented(xml, left=0, hanging=0, before=ROOM, after=GAP, keep=True), count=1)
    return document


def indented_keep(xml):
    return edit_properties(xml, 'pPr', lambda inner: put(inner, 'keepNext', '<w:keepNext/>', P_PR_ORDER))


def bold_lead(xml, pattern):
    text = unescaped(text_of(xml))
    found = re.search(pattern, text)
    return edit_text_range(xml, found.start(), found.end(), bold(True)) if found else xml


def probability_class(xml, match, position, total):
    number, rest = match.group(1), match.group(2).strip()
    dash_at, arrow_at, text_at = TIER, 2 * TIER, 2 * TIER + 964
    content = run(DASH) + TAB + run(f'clasa {number}', b=True) + TAB + run('→') + TAB + run(rest)
    return paragraph(content, left=text_at + 283, hanging=text_at + 283 - dash_at, before=0,
                     after=ROOM if position == total - 1 else GAP, keep=position < total - 1,
                     tabs=(arrow_at, text_at, text_at + 283))


def anexa_one(document):
    """The factor checklist: its typed numbers hang, every tier one step in from its parent."""
    start = find(document, r'^Anexa Nr\. 1\.')
    end = find(document, r'^Anexa Nr\. 2\.', blocks(document)[start][2])
    edits, parent = [], 0
    for kind, block_start, block_end in blocks(document)[start + 1:end]:
        if kind != 'p':
            continue
        xml = document[block_start:block_end]
        text = unescaped(spoken(xml)).strip()
        typed = re.match(r'^(\d+(?:\.\d+){0,2}\.)\s+', text)
        letter = re.match(r'^[A-E]\.\s', text)
        if letter:
            parent = 0
            continue
        if typed:
            depth = typed.group(1).count('.')
            label = depth * TIER
            hang = TIER if depth == 1 else HANG + (227 if depth == 3 else 0)
            edits.append((block_start, block_end, labelled(xml, r'\d+(?:\.\d+){0,2}\.\s*', typed.group(1),
                                                           left=label + hang, hanging=hang)))
            parent = label
            continue
        level = re.search(r'<w:numPr><w:ilvl w:val="(\d)"/>', xml)
        if level and '<w:numId w:val="0"/>' not in xml:
            label = parent + TIER * (1 + int(level.group(1)))
            edits.append((block_start, block_end, indented(xml, left=label + TIER, hanging=TIER)))
    for block_start, block_end, changed in reversed(edits):
        document = document[:block_start] + changed + document[block_end:]
    return document


def lettered_instruments(numbering, document):
    """The instruments of the method, a) to g): Word's letters with a full stop, as the original
    wrote them, become the house's letters."""
    at = find(document, r'^Lista de identificare a factorilor de risc;$')
    block = blocks(document)[at]
    num_id = re.search(r'<w:numId w:val="(\d+)"/>', document[block[1]:block[2]]).group(1)
    abstract = re.search(rf'<w:num w:numId="{num_id}"[^>]*>.*?<w:abstractNumId w:val="(\d+)"/>', numbering, re.S).group(1)
    definition = re.search(rf'<w:abstractNum\b[^>]*w:abstractNumId="{abstract}"[^>]*>.*?</w:abstractNum>', numbering, re.S)
    relettered = re.sub(r'(<w:lvl w:ilvl="0"[^>]*>.*?<w:lvlText w:val=")%1\.("/>)', r'\1%1)\2', definition.group(0), count=1,
                        flags=re.S)
    return numbering[:definition.start()] + relettered + numbering[definition.end():]


def posts(document):
    for field in ('Executant', 'Sarcina de muncă', 'Mijloacele de producție', 'Mediul de muncă'):
        document = edit_paragraphs(document, rf'^{field}: \{{\{{workSystem\.', lambda xml, *_: indented(
            xml, left=0, hanging=0, before=0, after=ROOM if field == 'Mediul de muncă' else GAP), count=1)
    document = edit_paragraphs(document, r'^(?:\{\{\$index\}\}\.)\s*Factori de risc proprii \{\{of\}\}:$', lambda xml, *_:
                               labelled(xml, r'\{\{\$index\}\}\.\s*', '{{$index}}.', left=2 * TIER, hanging=TIER,
                                        before=0, after=GAP, keep=True), count=1)
    document = edit_paragraphs(document, r'^Nu au fost identificați factori de risc proprii \{\{of\}\}\.$',
                               lambda xml, *_: indented(xml, left=2 * TIER, hanging=0, before=0, after=GAP), count=1)
    document = edit_paragraphs(document, r'^\{\{letter\}\}\)\s*\{\{name\}\}:$', lambda xml, *_: labelled(
        xml, r'\{\{letter\}\}\)\s*', '{{letter}})', left=3 * TIER, hanging=TIER, before=0, after=GAP, keep=True), count=1)
    document = edit_paragraphs(document, r'^\{\{code\}\}\.\s*\{\{description\}\}$', lambda xml, *_: labelled(
        xml, r'\{\{code\}\}\.\s*', '{{code}}.', left=3 * TIER + HANG, hanging=HANG, before=0, after=GAP), count=1,
        before=blocks(document)[find(document, r'^III\. FIȘA DE EVALUARE')][1])
    document = edit_paragraphs(document, r', (?:după formula prezentată în|conform formulei \(1\) din) capitolul II', lambda xml, *_: replaced_tail(
        xml, ', după formula prezentată în capitolul II:', ', conform formulei (1) din capitolul II.'), count=1)
    document = edit_paragraphs(document, r'^\{\{code\}\}(?: –|\.)\s*\{\{description\}\}$', lambda xml, *_: labelled(
        xml, r'\{\{code\}\}(?: –|\.)\s*', '{{code}}.', left=TIER + HANG, hanging=HANG, before=0, after=GAP),
        count=1, after=blocks(document)[find(document, r'^V\.2\. Nivelul de risc global al locului')][1])
    document = edit_paragraphs(document, r'^\{\{measuresSentence\}\}$',
                               lambda xml, *_: indented(xml, left=0, hanging=0, before=ROOM), count=1)
    return document


def replaced_tail(xml, marker, tail):
    """`xml` with its text from `marker` on replaced by `tail`, in the run that holds it."""
    def change(match):
        text = unescaped(match.group(2))
        at = text.find(marker)
        if at < 0:
            return match.group(0)
        return f'{match.group(1)}{escaped(text[:at] + tail)}{match.group(3)}'
    return re.sub(r'(<w:t\b[^>]*>)([^<]*)(</w:t>)', change, xml)


def people(document):
    """The evaluation team and the workers' representatives: dash lists, each name bold."""
    document = edit_paragraphs(document, r'^(?:–\s*)?\{\{name\}\}(?: –|,) \{\{jobTitle\}\}(?:, \{\{client\.legalName\}\})?;?$',
                               lambda xml, *_: person(xml, '{{name}}', ', {{jobTitle}};'), count=1)
    lead = blocks(document)[find(document, r'alcătuită din:$')][1]
    document = edit_paragraphs(
        document, r'^(?:–\s*)?\{\{riskEvaluator\.name\}\}(?: –|,) \{\{riskEvaluator\.professionalTitle\}\}',
        lambda xml, *_: person(xml, '{{riskEvaluator.name}}', ', {{riskEvaluator.professionalTitle}}'
                               '{{#riskEvaluator.certificate}}, certificat {{riskEvaluator.certificate}}'
                               '{{/riskEvaluator.certificate}}, {{provider.legalName}}.', after=ROOM),
        count=1, after=lead)
    document = edit_paragraphs(
        document, r'^(?:–\s*)?Reprezentant al lucrătorilor cu răspunderi specifice în domeniul securității și '
                  r'sănătății lucrătorilor: \{\{name\}\}, \{\{jobTitle\}\}\.$',
        lambda xml, *_: paragraph(run(DASH) + TAB + run('Reprezentant al lucrătorilor cu răspunderi specifice în '
                                                         'domeniul securității și sănătății lucrătorilor: ')
                                  + run('{{name}}', b=True) + run(', {{jobTitle}}.'),
                                  left=2 * TIER, hanging=TIER, after=GAP, tabs=(2 * TIER,)), count=1)
    document = lead_in(document, r'^Sediu social și puncte de lucru:$')
    document = edit_paragraphs(document, r'^Unitatea nu are înregistrat un sediu sau un punct de lucru\.$',
                               lambda xml, *_: indented(xml, left=2 * TIER, hanging=0, before=0, after=GAP), count=1)
    document = edit_paragraphs(document, r'^(?:–\s*)?\{\{label\}\}: \{\{address\}\}$', lambda xml, *_: labelled(
        xml, r'–?\s*', DASH, left=2 * TIER, hanging=TIER, before=0, after=GAP), count=1)
    return edit_paragraphs(document, r'alcătuită din:$', lambda xml, *_: indented(xml, left=0, hanging=0, after=GAP,
                                                                                    keep=True), count=1)


def person(xml, name, rest, after=GAP):
    return paragraph(run(DASH) + TAB + run(name, b=True) + run(rest), left=2 * TIER, hanging=TIER, after=after,
                     tabs=(2 * TIER,))


SHEET_WIDTHS = [1588, 3090, 1361, 1106, 1417, 792]  # mm: 28, 54.5, 24, 19.5, 25, 14


def sheet(document):
    """The evaluation sheet in six columns at the house's 10 pt: a component is a row across the
    table, as 6 names its posts, instead of a first column of its own."""
    for kind, start, end in blocks(document):
        table = document[start:end]
        if kind != 'tbl' or '{{#sheet}}' not in table and '{{#sheetComponents}}' not in table:
            continue
        rows = re.findall(r'<w:tr\b[^>]*>.*?</w:tr>', table, re.S)
        header, body = rows[0], rows[-1]
        header_cells = re.findall(r'<w:tc>.*?</w:tc>', header, re.S)
        body_cells = re.findall(r'<w:tc>.*?</w:tc>', body, re.S)
        if '{{#sheet}}' in table:
            header_cells = header_cells[1:]
            body_cells = body_cells[1:]
            body_cells[0] = body_cells[0].replace('{{group}}', '{{#rows}}{{group}}', 1)
            body_cells[-1] = body_cells[-1].replace('{{/sheet}}', '{{/rows}}{{/sheetComponents}}', 1)
            header_cells = [cell.replace('probabi-litate', 'probabilitate') for cell in header_cells]
        header_cells = [width_of(cell, width) for cell, width in zip(header_cells, SHEET_WIDTHS)]
        body_cells = [width_of(cell, width) for cell, width in zip(body_cells, SHEET_WIDTHS)]
        header_row = re.match(r'<w:tr\b[^>]*>(?:<w:trPr>.*?</w:trPr>)?', header, re.S).group(0) + ''.join(header_cells) + '</w:tr>'
        body_row = re.match(r'<w:tr\b[^>]*>(?:<w:trPr>.*?</w:trPr>)?', body, re.S).group(0) + ''.join(body_cells) + '</w:tr>'
        group_row = ('<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="9354" w:type="dxa"/>'
                     '<w:gridSpan w:val="6"/><w:shd w:val="clear" w:color="auto" w:fill="F1F4EF"/>'
                     '<w:vAlign w:val="center"/></w:tcPr>'
                     + paragraph(run('{{#sheetComponents}}{{label}}', b=True), after=0, keep=True)
                     + '</w:tc></w:tr>')
        grid = '<w:tblGrid>' + ''.join(f'<w:gridCol w:w="{width}"/>' for width in SHEET_WIDTHS) + '</w:tblGrid>'
        opening = re.sub(r'<w:tblGrid>.*?</w:tblGrid>', grid, table[:table.index('<w:tr')], flags=re.S)
        changed = (opening + header_row + group_row + body_row + '</w:tbl>').replace('w:val="16"/>', 'w:val="20"/>')
        document = document[:start] + changed + document[end:]
        break
    return document


def width_of(cell, width):
    return re.sub(r'<w:tcW w:w="\d+" w:type="dxa"/>', f'<w:tcW w:w="{width}" w:type="dxa"/>', cell, count=1)


def symbols(document):
    """A symbol's letter italic where the text writes it with a lowered index (M_g,p, N_r, E_1)."""
    def paragraph_symbols(match):
        xml = match.group(0)
        if '<m:oMath' in xml:
            return xml
        runs = list(RUN.finditer(xml))
        for index in range(len(runs) - 1, 0, -1):
            current, previous = runs[index].group(0), runs[index - 1].group(0)
            if '<w:vertAlign w:val="subscript"/>' not in current or '<w:vertAlign' in previous:
                continue
            text = re.search(r'<w:t\b[^>]*>([^<]*)</w:t>', previous)
            if not text or not re.search(r'(?:^|[\s(„])[A-Za-z]$', unescaped(text.group(1))):
                continue
            plain = unescaped(text.group(1))
            letter_run = previous.replace(text.group(0), f'<w:t xml:space="preserve">{escaped(plain[-1])}</w:t>')
            letter_run = edit_run(letter_run, italic)
            rest = previous.replace(text.group(0), f'<w:t xml:space="preserve">{escaped(plain[:-1])}</w:t>') if len(plain) > 1 else ''
            start, end = runs[index - 1].span()
            xml = xml[:start] + rest + letter_run + xml[end:]
        return xml
    return re.sub(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', paragraph_symbols, document, flags=re.S)


def global_level_symbols(document):
    """"(Nr)" and "Nrg" written flat in chapter V and VI: the letter italic, the index lowered."""
    def change(xml, *_):
        text = unescaped(text_of(xml))
        for found in reversed(list(re.finditer(r'(?<=\()N(rg|r)(?=\))|^N(rg)(?= =)', text))):
            index_start = found.start() + 1
            xml = edit_text_range(xml, index_start, found.end(), lambda inner: put(
                inner, 'vertAlign', '<w:vertAlign w:val="subscript"/>', R_PR_ORDER))
            xml = edit_text_range(xml, found.start(), index_start, italic)
        return xml
    return edit_paragraphs(document, r'\(Nrg?\)|^Nrg =', change)


MATH_NAMESPACE = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'


def risk_assessment(document, numbering, styles):
    if MATH_NAMESPACE not in document[:document.index('>', document.index('<w:document')) + 1]:
        document = document.replace('<w:document ', f'<w:document {MATH_NAMESPACE} ', 1)
    document = formulas(document)
    document = lists(document)
    document = anexa_one(document)
    document = posts(document)
    document = people(document)
    document = sheet(document)
    document = symbols(global_level_symbols(document))
    # The set's list spacing reads the lists these rules make: run once more here, it would move
    # the room around them on the next sweep.
    return lists_spacing(document, styles, lettered_instruments(numbering, document))


def sized_breaks(document):
    """A line break in a run of its own, without properties, takes those of the run before it:
    the in-app editor sizes it from the document's defaults (Times New Roman 12 pt), so the line
    it ends stood 4 pt taller than its neighbours."""
    def paragraph_breaks(match):
        xml = match.group(0)
        if '<w:r><w:br/></w:r>' not in xml:
            return xml
        out, last = [], None
        for piece in re.split(r'(<w:r\b[^>]*>.*?</w:r>)', xml, flags=re.S):
            if piece == '<w:r><w:br/></w:r>' and last is not None:
                piece = f'<w:r>{last}<w:br/></w:r>'
            elif piece.startswith('<w:r'):
                properties = element(piece[piece.index('>') + 1:], 'rPr')
                if properties and '<w:t' in piece:
                    last = re.sub(r'<w:vertAlign [^>]*/>', '', properties)
            out.append(piece)
        if last is None:
            paragraph_mark = re.search(r'<w:pPr>.*?(<w:rPr>.*?</w:rPr>).*?</w:pPr>', xml, re.S)
            if paragraph_mark:
                return xml.replace('<w:r><w:br/></w:r>', f'<w:r>{paragraph_mark.group(1)}<w:br/></w:r>')
        return ''.join(out)
    return re.sub(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', paragraph_breaks, document, flags=re.S)
