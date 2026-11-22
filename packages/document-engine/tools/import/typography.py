"""The occupational safety set's typography, over a template's saved XML, without an office.

Only an article's labels are bold ("Art. N.", "(2)", "a)"), never its body: the originals set
their articles in a copy of a bold 16 pt heading style, so every paragraph that never switched
bold off printed bold. A "(Preluare din …)" note is italic. "Art. N." stands on the margin with
a tab to its text, and over numbered paragraphs or a list it and its note are a line of their
own (`heading_line_of_its_own`). Headings follow one scale, a chapter
12 pt and a subchapter 11 pt, both centred, each nearer its own text than what comes before it
(`heading_scale`), and only real headings reach the outline. A
sub-list hangs one tier deeper than the item that introduces it, a list's number or letter is
bold and its bullet an en dash; a list sits 2 pt under its lead-in, its items 2 pt apart, and
the room comes after its last item. Dash lines a table cell joined with line breaks become
paragraphs that hang from the dash. Safe to run again.
"""

import re

from table_style import (P_PR_ORDER, R_PR_ORDER, RUN, TEXT, edit_properties, element, put,
                         without)

LOOP_TAGS_ONLY = re.compile(r'(\{\{[#/^][^}]*\}\})+')
BLOCK_TAG = re.compile(r'<(/?)w:(p|tbl|sdt)\b[^>]*?(/?)>')
ON = r'(?: w:val="(?:true|1|on)")?'
BOLD_ON = re.compile(rf'<w:b{ON}/>')
BOLD = re.compile(r'<w:b(?: w:val="(\w+)")?/>')

BODY = 20  # half-points
# Mircea (2026-11-22), after a textbook's sections at a 10 pt body: a chapter starts a page, so a
# breath under the header box is all it needs above.
CHAPTER = {'size': 24, 'before': 120, 'after': 200}
SUBCHAPTER = {'size': 22, 'before': 240, 'after': 120}
HEADINGS = {'Heading1': CHAPTER, 'Heading2': SUBCHAPTER}

ITEM_GAP = 40  # twips: between list items, and under the line that introduces a list
ROOM = 120  # twips: between paragraphs, and after a list
# In twips: a sub-list's label stands one step in from its parent's, whatever kinds the two are,
# and a label hangs as far as a step.
STEP = 360
HANG = 360
# An item whose label stands this close to its parent's text, or further in, is nested already.
NESTED = 120
ARTICLE_TAB = 720
WIDE_ARTICLE_TAB = 1080
CELL_HANG = 170  # 3 mm, a typed dash's hang from a table cell's edge
DASH = '–'

NOTE = re.compile(r'\((?:Preluare din|Conform\b|Conf\.)')
ALINEAT = re.compile(r'^\(\d+\)')
# A title that runs on into the first alineat: "Acțiuni în caz de incendiu: (1) Odată …".
TITLED = re.compile(r':\s+(?=\(1\)\s)')
LABELLED = re.compile(r'^(\(\d+\)|[a-z]\)|[A-Z]\.|\d{1,2}\.)\s')
LABEL = re.compile(r'^(\(\d+\)|[a-z]\)|\d{1,2}\.(?!\d))')
TYPED_ITEM = re.compile(r'^([a-z]\)|\d{1,2}[.)](?=\s)|[-–•»▪](?=\s))')
LABEL_FORMATS = {'decimal': 'number', 'lowerLetter': 'letter', 'upperLetter': 'letter',
                 'lowerRoman': 'roman', 'upperRoman': 'roman', 'bullet': 'bullet'}


def body_blocks(xml):
    depth, start, kind = 0, 0, None
    for match in BLOCK_TAG.finditer(xml):
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


def own_properties(paragraph):
    match = re.match(r'<w:p\b[^>]*>\s*(<w:pPr>.*?</w:pPr>)', paragraph, flags=re.S)
    return match.group(1) if match else ''


def spoken(paragraph):
    """The text with its tabs, which a typed list label is followed by ("–⇥Verificați")."""
    return ''.join(match.group(1) or '\t' for match in re.finditer(r'<w:t\b[^>]*>([^<]*)</w:t>|<w:tab/>', paragraph))


def text_of(paragraph):
    return ''.join(match.group(2) for match in TEXT.finditer(paragraph))


def attribute(xml, name):
    match = re.search(rf'\bw:{name}="([^"]*)"', xml or '')
    return match.group(1) if match else None


def number(xml, name):
    value = attribute(xml, name)
    return int(value) if value not in (None, '') else None


class Styles:

    def __init__(self, styles):
        self.xml = styles
        self.definitions, self.default = {}, None
        for match in re.finditer(r'<w:style\b([^>]*)>(.*?)</w:style>', styles, flags=re.S):
            attributes, body = match.groups()
            if 'w:type="paragraph"' not in attributes:
                continue
            name = attribute(attributes, 'styleId')
            based_on = re.search(r'<w:basedOn w:val="([^"]+)"', body)
            properties = re.search(r'<w:pPr>.*?</w:pPr>', body, flags=re.S)
            self.definitions[name] = (based_on and based_on.group(1), properties.group(0) if properties else '')
            if re.search(r'w:default="(1|true)"', attributes):
                self.default = name

    def lookup(self, name, find):
        seen = set()
        name = name or self.default
        while name in self.definitions and name not in seen:
            seen.add(name)
            based_on, properties = self.definitions[name]
            found = find(properties)
            if found is not None:
                return found
            name = based_on
        return None


class Numbering:

    def __init__(self, numbering):
        self.xml = numbering or ''
        self.abstracts = {match.group(1): match.group(0) for match in re.finditer(
            r'<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>.*?</w:abstractNum>', self.xml, re.S)}
        self.nums = {match.group(1): match.group(0) for match in re.finditer(
            r'<w:num w:numId="(\d+)"[^>]*>.*?</w:num>', self.xml, re.S)}

    def key(self, num_id, level):
        num = self.nums.get(num_id)
        if num is None:
            return None
        if re.search(rf'<w:lvlOverride w:ilvl="{level}">(?:(?!</w:lvlOverride>).)*?<w:lvl\b', num, re.S):
            return ('num', num_id, level)
        abstract = re.search(r'<w:abstractNumId w:val="(\d+)"', num)
        return ('abstract', abstract.group(1), level) if abstract and abstract.group(1) in self.abstracts else None

    def level(self, key):
        if key is None:
            return None
        container = self.nums[key[1]] if key[0] == 'num' else self.abstracts[key[1]]
        match = re.search(rf'<w:lvl w:ilvl="{key[2]}"[^>]*>.*?</w:lvl>', container, re.S)
        return match.group(0) if match else None


def numbering_of(properties, styles):
    """(numId, ilvl) of a paragraph, its own or its style's; None outside a list."""
    def find(xml):
        num = re.search(r'<w:numPr>(.*?)</w:numPr>', xml, re.S)
        if not num:
            return None
        num_id = re.search(r'<w:numId w:val="(\d+)"', num.group(1))
        level = re.search(r'<w:ilvl w:val="(\d)"', num.group(1))
        return (num_id.group(1) if num_id else None, level.group(1) if level else '0')
    found = find(properties)
    style = re.search(r'<w:pStyle w:val="([^"]+)"', properties)
    from_style = styles.lookup(style.group(1) if style else None, find)
    if found is None:
        found = from_style
    elif found[0] is None and from_style:
        found = (from_style[0], found[1])
    if not found or found[0] in (None, '0'):
        return None
    return found


def indent_of(xml):
    """(left, hanging) in twips from a `w:ind`, None for what it leaves out."""
    ind = re.search(r'<w:ind\b[^>]*/>', xml or '')
    if not ind:
        return None, None
    ind = ind.group(0)
    left = number(ind, 'left')
    left = number(ind, 'start') if left is None else left
    hanging = number(ind, 'hanging')
    first = number(ind, 'firstLine')
    if hanging is None and first is not None:
        hanging = -first
    return left, hanging


class Item:

    def __init__(self, kind, label, text, typed, level_key):
        self.kind, self.label, self.text, self.typed, self.level_key = kind, label, text, typed, level_key


def list_item(paragraph, styles, numbering):
    properties = own_properties(paragraph)
    said = unescaped(spoken(paragraph)).strip()
    found = numbering_of(properties, styles)
    style = re.search(r'<w:pStyle w:val="([^"]+)"', properties)
    style_left, style_hanging = styles.lookup(style.group(1) if style else None,
                                              lambda xml: indent_of(xml) if '<w:ind' in xml else None) or (None, None)
    own_left, own_hanging = indent_of(properties)
    if found:
        key = numbering.key(*found)
        level = numbering.level(key)
        if level is None or '<w:numFmt w:val="none"/>' in level or '<w:lvlText w:val=""/>' in level:
            return None
        text = attribute(re.search(r'<w:lvlText\b[^>]*/>', level).group(0), 'val') if '<w:lvlText' in level else ''
        if text.startswith('Art'):
            return None
        kind = LABEL_FORMATS.get(attribute(re.search(r'<w:numFmt\b[^>]*/>', level).group(0), 'val')
                                 if '<w:numFmt' in level else 'decimal', 'other')
        if kind != 'bullet':
            kind += re.sub(r'%\d', '%', text)
        level_left, level_hanging = indent_of(level)
        left = own_left if own_left is not None else level_left if level_left is not None else style_left or 0
        hanging = own_hanging if own_hanging is not None else level_hanging if level_hanging is not None else style_hanging or 0
        return Item(kind, left - hanging, left, False, key)
    typed = TYPED_ITEM.match(said)
    if not typed:
        return None
    mark = typed.group(1)
    kind = 'bullet' if not mark[0].isalnum() else ('letter%' if mark[0].isalpha() else 'number%') + mark[-1]
    left = own_left if own_left is not None else style_left or 0
    hanging = own_hanging if own_hanging is not None else style_hanging or 0
    return Item(kind, left - hanging, left, True, None)


def spacing_of(paragraph, styles):
    properties = own_properties(paragraph)
    own = re.search(r'<w:spacing\b[^>]*/>', properties)
    style = re.search(r'<w:pStyle w:val="([^"]+)"', properties)

    def side(name):
        if own and attribute(own.group(0), name) is not None:
            return int(attribute(own.group(0), name))
        found = styles.lookup(style.group(1) if style else None,
                              lambda xml: number(re.search(r'<w:spacing\b[^>]*/>', xml).group(0), name)
                              if re.search(rf'<w:spacing\b[^>]*w:{name}=', xml) else None)
        return found or 0
    return side('before'), side('after')


def set_spacing(paragraph, before=None, after=None):
    def change(inner):
        current = element(inner, 'spacing') or '<w:spacing/>'
        for name, value in (('before', before), ('after', after)):
            if value is None:
                continue
            if re.search(rf'\bw:{name}="', current):
                current = re.sub(rf'\bw:{name}="[^"]*"', f'w:{name}="{value}"', current)
            else:
                current = current.replace('<w:spacing', f'<w:spacing w:{name}="{value}"', 1)
            # A paragraph's own number counts; Word's automatic spacing would override it.
            current = re.sub(rf'\s*w:{name}Autospacing="[^"]*"', '', current)
        return put(inner, 'spacing', current, P_PR_ORDER)
    return edit_properties(paragraph, 'pPr', change)


def set_indent(paragraph, left, hanging, tab=True):
    def change(inner):
        inner = put(inner, 'ind', f'<w:ind w:left="{left}" w:hanging="{hanging}"/>', P_PR_ORDER)
        if tab:
            # The label's tab goes to the text: a stop of the paragraph's own before it would
            # catch it, and one of its list's may stand where the label now is.
            inner = put(inner, 'tabs', f'<w:tabs><w:tab w:val="left" w:pos="{left}"/></w:tabs>', P_PR_ORDER)
        return inner
    return edit_properties(paragraph, 'pPr', change)


def edit_run(run, change):
    return edit_properties(run, 'rPr', change)


def bold(on):
    def change(inner):
        for tag in ('b', 'bCs'):
            inner = put(inner, tag, f'<w:{tag}/>' if on else f'<w:{tag} w:val="false"/>', R_PR_ORDER)
        return inner
    return change


def italic(inner):
    for tag in ('i', 'iCs'):
        inner = put(inner, tag, f'<w:{tag}/>', R_PR_ORDER)
    return bold(False)(inner)


def sized(size):
    def change(inner):
        inner = put(inner, 'sz', f'<w:sz w:val="{size}"/>', R_PR_ORDER)
        return put(inner, 'szCs', f'<w:szCs w:val="{size}"/>', R_PR_ORDER)
    return change


def text_runs(paragraph):
    """The runs of a paragraph that hold one piece of text and nothing else, with where their
    text starts within the paragraph's: only those can be cut in two."""
    found, at = [], 0
    for match in RUN.finditer(paragraph):
        run = match.group(0)
        pieces = TEXT.findall(run)
        said = ''.join(piece[1] for piece in pieces)
        simple = len(pieces) == 1 and not re.search(r'<w:(tab|br|cr|drawing|fldChar|instrText|sym|object)\b', run)
        found.append((match.start(), match.end(), at, said, simple))
        at += len(unescaped(said))
    return found


def unescaped(text):
    return text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&quot;', '"').replace('&apos;', "'")


def escaped(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def cut_runs(paragraph, positions):
    for start, end, at, said, simple in reversed(text_runs(paragraph)):
        plain = unescaped(said)
        inside = sorted({position - at for position in positions if at < position < at + len(plain)}, reverse=True)
        if not inside or not simple:
            continue
        run = paragraph[start:end]
        pieces, rest = [], plain
        for cut in inside:
            pieces.insert(0, rest[cut:])
            rest = rest[:cut]
        pieces.insert(0, rest)
        text = TEXT.search(run)
        opening = re.sub(r'\s*xml:space="preserve"', '', text.group(1)).replace('<w:t', '<w:t xml:space="preserve"', 1)
        runs = ''.join(run[:text.start()] + opening + escaped(piece) + text.group(3) + run[text.end():] for piece in pieces)
        paragraph = paragraph[:start] + runs + paragraph[end:]
    return paragraph


def edit_text_range(paragraph, start, end, change):
    paragraph = cut_runs(paragraph, [start, end])
    for run_start, run_end, at, said, _ in reversed(text_runs(paragraph)):
        length = len(unescaped(said))
        if said and at >= start and at + length <= end:
            paragraph = paragraph[:run_start] + edit_run(paragraph[run_start:run_end], change) + paragraph[run_end:]
    return paragraph


def run_bold(run, styled_bold):
    explicit = BOLD.search(element(run, 'rPr') or '')
    if explicit is None:
        return styled_bold
    return explicit.group(1) not in ('false', '0', 'off')


def balanced_end(text, start):
    """The end of the bracket that opens at `start`. A letter's label ("lit. c) și d))") closes
    nothing it opened."""
    depth = 0
    for index in range(start, len(text)):
        if text[index] == '(':
            depth += 1
        elif text[index] == ')' and not re.search(r'(?:^|[\s,])[a-z]$', text[start:index]):
            depth -= 1
            if depth == 0:
                return index + 1
    return None


def note_span(text):
    head = re.match(r'\s*(?:\(\d+\)\s*)?', text).end()
    if not NOTE.match(text, head):
        return None
    end = balanced_end(text, head)
    return (head, end) if end else None


def body_styles(document, styles_xml, bold_only=True):
    """The copies of the originals' heading styles that hold body text, never centred. 9's
    "Paragraph 1" is its title's, centred, and stays."""
    found = []
    styles = Styles(styles_xml)
    for name in sorted(set(re.findall(r'<w:pStyle w:val="(Paragraph\d)"/>', document))):
        definition = re.search(rf'<w:style\b[^>]*w:styleId="{name}"[^>]*>.*?</w:style>', styles_xml, re.S)
        if not definition or (bold_only and not re.search(r'<w:rPr>(?:(?!</w:rPr>).)*<w:b/>', definition.group(0), re.S)):
            continue
        centred = False
        for match in re.finditer(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', document, re.S):
            properties = own_properties(match.group(0))
            if f'<w:pStyle w:val="{name}"/>' not in properties:
                continue
            own = re.search(r'<w:jc w:val="(\w+)"/>', properties)
            alignment = own.group(1) if own else styles.lookup(name, lambda xml: attribute(
                re.search(r'<w:jc\b[^>]*/>', xml).group(0), 'val') if '<w:jc' in xml else None)
            centred = centred or alignment == 'center'
        if not centred:
            found.append(name)
    return found


def plain_articles(document, styles_xml):
    names = body_styles(document, styles_xml)

    def paragraph(match):
        xml = match.group(0)
        properties = own_properties(xml)
        style = re.search(r'<w:pStyle w:val="(Paragraph\d)"/>', properties)
        styled = style is not None and style.group(1) in names
        said = unescaped(text_of(xml))
        if styled:
            label = LABEL.match(said)
            if label:
                runs = [run for run in text_runs(xml) if run[3]]
                if runs and not BOLD.search(element(xml[runs[0][0]:runs[0][1]], 'rPr') or ''):
                    xml = edit_text_range(cut_runs(xml, [label.end()]), 0, label.end(), bold(True))
        span = note_span(said)
        if span:
            xml = edit_text_range(xml, span[0], span[1], italic)
            if styled:
                rest = said[span[1]:]
                label = re.match(r'\s*(\(\d+\))?', rest)
                after = span[1] + label.end()
                if label.group(1):
                    xml = edit_text_range(xml, span[1], after, bold(True))
                xml = edit_text_range(xml, after, len(said), bold(False))
        return xml

    document = re.sub(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', paragraph, document, flags=re.S)
    for name in names:
        def plain(match):
            definition = match.group(0)
            definition = re.sub(r'<w:keepNext(?: w:val="\w+")?/>', '', definition)
            definition = re.sub(r'<w:b(?:Cs)?/>', '', definition)
            definition = re.sub(r'<w:sz w:val="\d+"/>', f'<w:sz w:val="{BODY}"/>', definition)
            return re.sub(r'<w:szCs w:val="\d+"/>', f'<w:szCs w:val="{BODY}"/>', definition)
        styles_xml = re.sub(rf'<w:style\b[^>]*w:styleId="{name}"[^>]*>.*?</w:style>', plain, styles_xml, flags=re.S)
    return document, styles_xml


# The long documents quote the law article by article: an alineat's or a letter's label typed
# at the head of a paragraph is bold, as the articles' are, and an article's body regular even
# where a run of the original says bold.
ARTICLE_DOCUMENTS = ('2.2_general_training_material.docx', '3.2_own_instructions.docx', '11_employer_briefing.docx')
LEADING_LABEL = re.compile(r'\s*(\(\d+\)|[a-z]\))(?=\s)')


def leading_label(said):
    note = note_span(said)
    found = LEADING_LABEL.match(said, note[1] if note else 0)
    if found:
        return (found.start(1), found.end(1)), found.end(1)
    return None, note[1] if note else 0


def explicitly_bold(xml, start, end):
    return any(BOLD_ON.search(element(xml[run_start:run_end], 'rPr') or '')
               for run_start, run_end, at, said, _ in text_runs(xml)
               if said.strip() and at >= start and at + len(unescaped(said)) <= end)


def bold_label(xml):
    said = unescaped(text_of(xml))
    label, _ = leading_label(said)
    if label and not explicitly_bold(xml, *label):
        xml = edit_text_range(xml, label[0], label[1], bold(True))
    return xml


def article_labels(document, styles_xml):
    body = body_styles(document, styles_xml, bold_only=False)
    edits = []
    for kind, start, end in body_blocks(document):
        xml = document[start:end]
        if kind == 'p':
            changed = bold_label(xml)
            style = re.search(r'<w:pStyle w:val="(Paragraph\d)"/>', own_properties(changed))
            if style and style.group(1) in body:
                said = unescaped(text_of(changed))
                _, after = leading_label(said)
                if explicitly_bold(changed, after, len(said)):
                    changed = cut_runs(changed, [after])
                    for run_start, run_end, at, piece, _ in reversed(text_runs(changed)):
                        run = changed[run_start:run_end]
                        if at >= after and BOLD_ON.search(element(run, 'rPr') or ''):
                            changed = changed[:run_start] + edit_run(run, bold(False)) + changed[run_end:]
        elif kind == 'tbl' and '<w:tblStyle w:val="HouseTable"/>' in xml:
            changed = re.sub(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', lambda match: bold_label(match.group(0)), xml, flags=re.S)
        else:
            continue
        if changed != xml:
            edits.append((start, end, changed))
    for start, end, changed in reversed(edits):
        document = document[:start] + changed + document[end:]
    return document


def heading_scale(document):
    """Every heading on the scale. A subchapter right under its chapter is only the chapter's
    room below it, not the larger of the two, and a chapter that opens a section has nothing
    above it: LibreOffice drops the room above a chapter at the top of a page, but not after a
    section break, where 9's annex 3 stood 18 pt lower than its other pages. An empty paragraph
    beside a heading goes, as it would add its line and both rooms."""
    document = without_spacers_by_headings(document)
    edits, previous = [], None
    for kind, start, end in body_blocks(document):
        xml = document[start:end]
        if kind == 'p' and is_loop_tags(xml):
            continue
        style = re.search(r'<w:pStyle w:val="(Heading[12])"/>', own_properties(xml)) if kind == 'p' else None
        if style:
            scale = HEADINGS[style.group(1)]
            under_chapter = style.group(1) == 'Heading2' and previous == 'Heading1'
            opens_section = previous == 'section'
            changed = scaled_heading(xml, scale, 0 if under_chapter or opens_section else scale['before'])
            edits.append((start, end, changed))
        previous = style.group(1) if style else 'section' if kind == 'p' and '<w:sectPr' in own_properties(xml) else kind
    for start, end, changed in reversed(edits):
        document = document[:start] + changed + document[end:]
    return document


def scaled_heading(xml, scale, before):
    xml = set_spacing(xml, before, scale['after'])
    xml = edit_properties(xml, 'pPr', lambda inner: put(inner, 'spacing', re.sub(
        r'\s*w:line(?:Rule)?="[^"]*"', '', element(inner, 'spacing')), P_PR_ORDER))
    xml = edit_properties(xml, 'pPr', lambda inner: put(without(inner, 'ind'), 'jc', '<w:jc w:val="center"/>', P_PR_ORDER))
    xml = edit_properties(xml, 'pPr', lambda inner: without(inner, 'tabs'))
    change = lambda inner: sized(scale['size'])(bold(True)(inner))  # noqa: E731
    xml = edit_properties(xml, 'pPr', lambda inner: put(inner, 'rPr', f'<w:rPr>{change(rpr_inner(inner))}</w:rPr>', P_PR_ORDER))
    return RUN.sub(lambda run: edit_run(run.group(0), change), xml)


SPACER_KEPT = re.compile(r'<w:(?:t|drawing|pict|object|sectPr|bookmarkStart|fldChar|instrText|br|numPr)\b|<m:oMath')


def without_spacers_by_headings(document):
    blocks = list(body_blocks(document))
    empty = [kind == 'p' and not SPACER_KEPT.search(document[start:end]) for kind, start, end in blocks]
    dropped = set()
    for index, (kind, start, end) in enumerate(blocks):
        if kind != 'p' or not re.search(r'<w:pStyle w:val="Heading[12]"/>', own_properties(document[start:end])):
            continue
        for step in (-1, 1):
            beside = index + step
            while 0 <= beside < len(blocks) and empty[beside]:
                dropped.add(beside)
                beside += step
    for index in sorted(dropped, reverse=True):
        document = document[:blocks[index][1]] + document[blocks[index][2]:]
    return document


def rpr_inner(inner):
    mark = element(inner, 'rPr')
    return mark[len('<w:rPr>'):-len('</w:rPr>')] if mark and mark != '<w:rPr/>' else ''


def house_heading_style(level):
    scale = HEADINGS[f'Heading{level}']
    return (f'<w:style w:type="paragraph" w:styleId="Heading{level}"><w:name w:val="heading {level}"/>'
            '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
            f'<w:pPr><w:keepNext/><w:spacing w:before="{scale["before"]}" w:after="{scale["after"]}"/>'
            f'<w:jc w:val="center"/><w:outlineLvl w:val="{level - 1}"/></w:pPr>'
            f'<w:rPr><w:b/><w:bCs/><w:sz w:val="{scale["size"]}"/><w:szCs w:val="{scale["size"]}"/></w:rPr></w:style>')


def out_of_the_outline(xml, styles):
    """Body text the originals set in the heading styles moves to a copy of each under another
    name, "Paragraph N", without an outline level: it keeps its look and leaves the outline and
    the PDF's bookmarks."""
    return paragraph_styles(without_headings(xml), styles)


def without_headings(xml):
    return re.sub(r'<w:outlineLvl w:val="\d"/>', '', re.sub(r'<w:pStyle w:val="Heading(\d)"/>', r'<w:pStyle w:val="Paragraph\1"/>', xml))


def paragraph_styles(xml, styles):
    for level in sorted(set(re.findall(r'<w:pStyle w:val="Paragraph(\d)"/>', xml))):
        if re.search(rf'<w:style\b[^>]*w:styleId="Paragraph{level}"', styles):
            continue
        copy = re.search(rf'<w:style\b[^>]*w:styleId="Heading{level}"[^>]*>.*?</w:style>', styles, re.S).group(0)
        copy = copy.replace(f'w:styleId="Heading{level}"', f'w:styleId="Paragraph{level}"')
        copy = copy.replace(f'<w:name w:val="heading {level}"/>', f'<w:name w:val="Paragraph {level}"/>')
        copy = re.sub(r'<w:outlineLvl w:val="\d"/>', '', re.sub(r'<w:link w:val="[^"]*"/>', '', copy))
        styles = styles.replace('</w:styles>', f'{copy}</w:styles>')
    return xml, styles


def dash_bullets(numbering):
    def level(match):
        xml = match.group(0)
        if '<w:numFmt w:val="bullet"/>' not in xml:
            return xml
        glyph = re.search(r'<w:lvlText w:val="([^"]*)"/>', xml)
        if not glyph or glyph.group(1) == '':
            return xml
        xml = xml.replace(glyph.group(0), f'<w:lvlText w:val="{DASH}"/>')
        properties = element(xml, 'rPr')
        inner = properties[len('<w:rPr>'):-len('</w:rPr>')] if properties and properties != '<w:rPr/>' else ''
        inner = put(inner, 'rFonts', '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>', R_PR_ORDER)
        inner = bold(False)(without(without(inner, 'i'), 'iCs'))
        if properties:
            return xml.replace(properties, f'<w:rPr>{inner}</w:rPr>', 1)
        return xml.replace('</w:lvl>', f'<w:rPr>{inner}</w:rPr></w:lvl>')
    return re.sub(r'<w:lvl w:ilvl="\d"[^>]*>.*?</w:lvl>', level, numbering, flags=re.S)


def article_levels(numbering, wide):
    """"Art. N." on the text margin and the text after it at a tab, 1.27 cm in as in the
    decisions, or 1.9 cm in a document with articles past 99, whose three digits are wider; the
    wrapped lines go back to the margin."""
    tab = WIDE_ARTICLE_TAB if wide else ARTICLE_TAB

    def level(match):
        xml = match.group(0)
        if not re.search(r'<w:lvlText w:val="Art\.', xml):
            return xml
        xml = xml.replace('<w:suff w:val="space"/>', '')
        properties = f'<w:pPr><w:tabs><w:tab w:val="num" w:pos="{tab}"/></w:tabs><w:ind w:left="0" w:hanging="0"/></w:pPr>'
        if '<w:pPr>' in xml:
            return re.sub(r'<w:pPr>.*?</w:pPr>', properties, xml, count=1, flags=re.S)
        return re.sub(r'(?=<w:rPr>|</w:lvl>)', properties, xml, count=1)
    return re.sub(r'<w:lvl w:ilvl="0"[^>]*>.*?</w:lvl>', level, numbering, flags=re.S)


def is_article(paragraph, styles, numbering):
    found = numbering_of(own_properties(paragraph), styles)
    level = numbering.level(numbering.key(*found)) if found else None
    return bool(level and re.search(r'<w:lvlText w:val="Art\.', level))


def heading_line_of_its_own(first, following, following_is_item, alineat_follows):
    """Whether an article's "Art. N." and its "(Preluare din …)" note stand as a line of their
    own, with the article's text from the next line at the margin. Mircea's rule (2026-11-21):
    an article of numbered paragraphs, so "(1)", "(2)" line up, or whose first paragraph
    introduces a list; any other article runs on after its label and note. `first` is the
    first paragraph's text after the note, `following` the next paragraph's after its own,
    `alineat_follows` whether a later paragraph of the article opens with "(n)"."""
    if not first or ALINEAT.match(first) or TITLED.search(first) or alineat_follows:
        return True
    return first.endswith(':') and (following_is_item or LABELLED.match(following or '') is not None)


def note_end(said):
    note = note_span(said)
    return note[1] if note else 0


def after_note(said):
    return said[note_end(said):].strip()


def split_paragraph(paragraph, end, start):
    """`paragraph` as two, its text up to `end` and from `start` in a paragraph of its own
    without the list number; what lies between, the spaces after a note, goes."""
    paragraph = cut_runs(paragraph, [end, start])
    for run_start, run_end, at, said, _ in reversed(text_runs(paragraph)):
        if said and at >= end and at + len(unescaped(said)) <= start:
            paragraph = paragraph[:run_start] + paragraph[run_end:]
    cut = next(run_start for run_start, _, at, said, _ in text_runs(paragraph) if said and at >= end)
    opening = re.match(r'<w:p\b[^>]*>', paragraph).group(0)
    properties = own_properties(paragraph)
    head = paragraph[:cut] + '</w:p>'
    # Word repairs a file in which two paragraphs share an id.
    second = re.sub(r'\s+w14:(paraId|textId)="[^"]*"', '', opening)
    second += edit_properties(f'<w:p>{properties}</w:p>', 'pPr', lambda inner: without(inner, 'numPr'))[len('<w:p>'):-len('</w:p>')]
    return head, second + paragraph[cut:]


def article_heading(paragraph):
    """An article's heading line keeps with its text, a paragraph's distance above it."""
    paragraph = edit_properties(paragraph, 'pPr', lambda inner: put(inner, 'keepNext', '<w:keepNext/>', P_PR_ORDER))
    return set_spacing(paragraph, after=ROOM)


def articles(document, styles_xml, numbering_xml):
    styles, numbering = Styles(styles_xml), Numbering(numbering_xml)
    return sum(1 for kind, start, end in body_blocks(document)
               if kind == 'p' and is_article(document[start:end], styles, numbering))


def alineat_follows(document, blocks, index, styles, numbering):
    for kind, start, end in blocks[index + 1:]:
        xml = document[start:end]
        if kind != 'p' or is_loop_tags(xml) or list_item(xml, styles, numbering) is not None:
            continue
        if is_article(xml, styles, numbering) or re.search(r'<w:pStyle w:val="Heading[12]"/>', own_properties(xml)):
            return False
        if ALINEAT.match(after_note(unescaped(text_of(xml)))):
            return True
    return False


def article_paragraphs(document, styles_xml, numbering_xml):
    """Every article laid out by `heading_line_of_its_own`: an article that opens with its
    "(1)", holds alineats further on or opens with the line introducing its list is cut after
    its note, or after its label where it has none; a title that runs on into "(1)" ("Acțiuni
    în caz de incendiu: (1) Odată …") keeps its own paragraph above it."""
    styles, numbering = Styles(styles_xml), Numbering(numbering_xml)
    blocks = list(body_blocks(document))
    edits = []
    for index, (kind, start, end) in enumerate(blocks):
        xml = document[start:end]
        if kind != 'p' or not is_article(xml, styles, numbering):
            continue
        following = next(((next_kind, document[next_start:next_end]) for next_kind, next_start, next_end in blocks[index + 1:]
                          if next_kind != 'p' or not is_loop_tags(document[next_start:next_end])), (None, ''))
        is_item = following[0] == 'p' and list_item(following[1], styles, numbering) is not None
        said = unescaped(text_of(xml))
        if not heading_line_of_its_own(after_note(said), after_note(unescaped(text_of(following[1]))) if following[0] == 'p' else None,
                                       is_item, alineat_follows(document, blocks, index, styles, numbering)):
            continue
        end_of_head = note_end(said)
        first = len(said) - len(said[end_of_head:].lstrip())
        if first < len(said):
            head, body = split_paragraph(xml, end_of_head, first)
            body = set_spacing(body, before=0)
            titled = TITLED.search(said[first:])
            if titled:
                title, alineat = split_paragraph(body, titled.start() + 1, titled.end())
                body = set_spacing(title, after=ROOM) + set_spacing(alineat, before=0)
            changed = article_heading(head) + body
        else:
            changed = article_heading(xml)
        if changed != xml:
            edits.append((start, end, changed))
    for start, end, changed in reversed(edits):
        document = document[:start] + changed + document[end:]
    return document


# The house order of a nested list's labels, tier by tier: 1., a), –.
HOUSE_TIERS = (('decimal', '%{}.'), ('lowerLetter', '%{})'), ('bullet', DASH))
HOUSE_KINDS = ('number', 'letter', 'bullet')


def label_kind(item):
    return 'bullet' if item.kind == 'bullet' else item.kind.rstrip('%.)(').replace('%', '')


def list_groups(document, styles, numbering, start=0, end=None):
    """The body's lists, each a run of numbered items with its sub-lists, as (paragraph start,
    item, tier) for every item; a typed label leaves its list out."""
    groups, group, stack = [], [], []
    for kind, block_start, block_end in body_blocks(document):
        if block_start < start or (end is not None and block_start >= end):
            continue
        xml = document[block_start:block_end] if kind == 'p' else ''
        if kind == 'p' and is_loop_tags(xml):
            continue
        item = list_item(xml, styles, numbering) if kind == 'p' else None
        if item is None:
            if kind != 'p' or text_of(xml).strip():
                groups.append(group)
                group, stack = [], []
            continue
        while stack and stack[-1] >= item.label - NESTED:
            stack.pop()
        group.append((block_start, item, len(stack)))
        stack.append(item.label)
    groups.append(group)
    return [group for group in groups if group and not any(item.typed for _, item, _ in group)]


def out_of_order(group):
    """A list whose letters hold numbers: 2.2's evacuation rules, "a)" over "1." over "–"."""
    parents = {}
    for _, item, tier in group:
        parents[tier] = label_kind(item)
        if tier and parents.get(tier - 1) == 'letter' and parents[tier] == 'number':
            return True
    return False


def relabelled(document, numbering_xml, groups):
    """`groups` labelled in the house order, each tier by its own kind, through copies of their
    numbering, so a list elsewhere that shares it keeps its labels."""
    numbering = Numbering(numbering_xml)
    taken = [int(found) for found in re.findall(r'w:(?:abstractNumId|numId)="(\d+)"', numbering_xml)]
    next_id = max(taken, default=0) + 1
    paragraphs = {start: document[start:end] for kind, start, end in body_blocks(document) if kind == 'p'}
    abstracts, nums, renumbered = [], [], {}
    for group in groups:
        tiers, kinds = {}, {}
        for start, item, tier in group:
            own = re.search(r'<w:numId w:val="(\d+)"/>', own_properties(paragraphs[start]))
            level = re.search(r'<w:ilvl w:val="(\d)"/>', own_properties(paragraphs[start]))
            if not own or own.group(1) not in numbering.nums or \
                    tiers.setdefault(own.group(1), {}).setdefault(level.group(1) if level else '0', tier) != tier:
                break
            kinds.setdefault(own.group(1), set()).add(label_kind(item) == HOUSE_KINDS[min(tier, 2)])
        else:
            copies = {}
            for num_id, levels in tiers.items():
                if all(kinds[num_id]):
                    continue
                num = numbering.nums[num_id]
                abstract = numbering.abstracts[re.search(r'<w:abstractNumId w:val="(\d+)"/>', num).group(1)]
                for level, tier in levels.items():
                    fmt, text = HOUSE_TIERS[min(tier, 2)]

                    def relabel(match, fmt=fmt, text=text.format(int(level) + 1)):
                        xml = re.sub(r'<w:numFmt w:val="\w+"/>', f'<w:numFmt w:val="{fmt}"/>', match.group(0))
                        return re.sub(r'<w:lvlText w:val="[^"]*"/>', f'<w:lvlText w:val="{text}"/>', xml)
                    pattern = rf'<w:lvl w:ilvl="{level}"[^>]*>.*?</w:lvl>'
                    abstract = re.sub(pattern, relabel, abstract, count=1, flags=re.S)
                    num = re.sub(rf'<w:lvlOverride w:ilvl="{level}">.*?</w:lvlOverride>',
                                 lambda match: re.sub(pattern, relabel, match.group(0), flags=re.S), num, flags=re.S)
                abstract = re.sub(r'w:abstractNumId="\d+"', f'w:abstractNumId="{next_id}"', abstract, count=1)
                # Word joins the lists of two definitions that share an id.
                abstract = re.sub(r'<w:nsid w:val="[0-9A-Fa-f]+"/>', f'<w:nsid w:val="{0x5A000000 + next_id:08X}"/>', abstract)
                num = re.sub(r'w:numId="\d+"', f'w:numId="{next_id}"', num, count=1)
                num = re.sub(r'<w:abstractNumId w:val="\d+"/>', f'<w:abstractNumId w:val="{next_id}"/>', num)
                abstracts.append(abstract)
                nums.append(num)
                copies[num_id] = str(next_id)
                next_id += 1
            for start, _, _ in group:
                renumbered[start] = copies
    if not renumbered:
        return document, numbering_xml
    for kind, start, end in reversed(list(body_blocks(document))):
        if start in renumbered:
            paragraph = document[start:end]
            num_id = re.search(r'<w:numId w:val="(\d+)"/>', own_properties(paragraph)).group(1)
            if num_id not in renumbered[start]:
                continue
            changed = paragraph.replace(f'<w:numId w:val="{num_id}"/>', f'<w:numId w:val="{renumbered[start][num_id]}"/>', 1)
            document = document[:start] + changed + document[end:]
    last_abstract = list(re.finditer(r'</w:abstractNum>', numbering_xml))[-1].end()
    numbering_xml = numbering_xml[:last_abstract] + ''.join(abstracts) + numbering_xml[last_abstract:]
    last_num = list(re.finditer(r'</w:num>', numbering_xml))[-1].end()
    numbering_xml = numbering_xml[:last_num] + ''.join(nums) + numbering_xml[last_num:]
    return document, numbering_xml


def typed_hyphens(document):
    """A hyphen typed as a list's mark at the head of a body paragraph prints as the house's en
    dash, as a list's bullet does (9's probability classes and risk levels)."""
    edits = []
    for kind, start, end in body_blocks(document):
        xml = document[start:end]
        if kind != 'p' or not re.match(r'\s*-[\t ]+[^\W\d_]', unescaped(spoken(xml))):
            continue
        said = unescaped(text_of(xml))
        at = len(said) - len(said.lstrip())
        edits.append((start, end, replace_text_range(xml, at, at + 1, DASH)))
    for start, end, changed in reversed(edits):
        document = document[:start] + changed + document[end:]
    return document


def house_order(document, styles_xml, numbering_xml, name=None):
    styles, numbering = Styles(styles_xml), Numbering(numbering_xml)
    groups = [group for group in list_groups(document, styles, numbering) if out_of_order(group)]
    if name == '6_protective_equipment_list.docx':
        groups += annex_two_lists(document, styles, numbering)
    return relabelled(document, numbering_xml, groups)


def annex_two_lists(document, styles, numbering):
    """6's copy of annex 2 to H.G. 1048/2006 numbers its equipment and letters what each
    protects against, though the act prints both as dashes (Mircea's call, 2026-11-21)."""
    said = [(start, unescaped(text_of(document[start:end]))) for kind, start, end in body_blocks(document) if kind == 'p']
    begin = next((start for start, text in said if text.startswith('Anexa nr. 2 la H.G. 1048/2006')), None)
    end = next((start for start, text in said if text.startswith('Anexa nr. 3 la H.G. 1048/2006')), None)
    if begin is None or end is None:
        return []
    return list_groups(document, styles, numbering, begin, end)


def bold_level(numbering, key):
    container_pattern = (rf'<w:num w:numId="{key[1]}"[^>]*>.*?</w:num>' if key[0] == 'num'
                         else rf'<w:abstractNum\b[^>]*w:abstractNumId="{key[1]}"[^>]*>.*?</w:abstractNum>')

    def container(match):
        def level(found):
            xml = found.group(0)
            properties = element(xml, 'rPr')
            inner = properties[len('<w:rPr>'):-len('</w:rPr>')] if properties and properties != '<w:rPr/>' else ''
            inner = bold(True)(inner)
            if properties:
                return xml.replace(properties, f'<w:rPr>{inner}</w:rPr>', 1)
            return xml.replace('</w:lvl>', f'<w:rPr>{inner}</w:rPr></w:lvl>')
        return re.sub(rf'<w:lvl w:ilvl="{key[2]}"[^>]*>.*?</w:lvl>', level, match.group(0), count=1, flags=re.S)
    return re.sub(container_pattern, container, numbering, count=1, flags=re.S)


def is_loop_tags(paragraph):
    return LOOP_TAGS_ONLY.fullmatch(text_of(paragraph).strip() or '-') is not None


def lists(document, styles_xml, numbering_xml):
    styles, numbering = Styles(styles_xml), Numbering(numbering_xml)
    blocks = [(kind, start, end) for kind, start, end in body_blocks(document)]
    paragraphs = [(start, end) for kind, start, end in blocks if kind == 'p']
    in_cells = set()
    for kind, start, end in blocks:
        if kind == 'tbl':
            for match in re.finditer(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', document[start:end], re.S):
                found = numbering_of(own_properties(match.group(0)), styles)
                if found:
                    in_cells.add(numbering.key(*found))

    edits = {}
    order = []
    for kind, start, end in blocks:
        if kind != 'p':
            order.append(None)
            continue
        xml = document[start:end]
        if is_loop_tags(xml):
            continue
        # A spacer before a table or one set at 1 pt: it ends a list and keeps its own room.
        if not text_of(xml).strip() and not re.search(r'<w:(drawing|object|pict)\b|<m:oMath', xml):
            order.append(None)
            continue
        order.append((start, end, xml, list_item(xml, styles, numbering)))

    stack, previous = [], None
    for entry in order:
        if entry is None or entry[3] is None:
            stack, previous = [], None
            continue
        start, end, xml, item = entry
        said = spoken(xml).strip()
        sibling = next((index for index in range(len(stack) - 1, -1, -1)
                        if stack[index]['kind'] == item.kind and stack[index]['was'] == item.label), None)
        if sibling is not None:
            stack = stack[:sibling + 1]
            level = stack[-1]
            if level['moved']:
                edits[start] = ('indent', level['label'], level['label'] + level['hang'])
        elif stack and (item.label >= stack[-1]['text'] - NESTED
                        or previous is not None and previous.endswith(':')):
            label = stack[-1]['label'] + STEP
            if item.label == label:
                stack.append({'kind': item.kind, 'was': item.label, 'label': item.label, 'text': item.text,
                              'hang': item.text - item.label, 'moved': False})
            else:
                hang = max(item.text - item.label, HANG)
                edits[start] = ('indent', label, label + hang)
                stack.append({'kind': item.kind, 'was': item.label, 'label': label, 'text': label + hang,
                              'hang': hang, 'moved': True})
        else:
            stack = [{'kind': item.kind, 'was': item.label, 'label': item.label, 'text': item.text,
                      'hang': item.text - item.label, 'moved': False}]
        previous = said

    to_bold = set()
    for entry in order:
        if entry is None or entry[3] is None or entry[3].kind == 'bullet':
            continue
        start, end, xml, item = entry
        if item.typed:
            edits.setdefault(start, None)
            edits[('label', start)] = True
        elif item.level_key not in in_cells:
            to_bold.add(item.level_key)
    for key in to_bold:
        level = numbering.level(key)
        properties = element(level, 'rPr') or ''
        if not BOLD_ON.search(properties):
            numbering_xml = bold_level(numbering_xml, key)

    spacing = {}
    sequence = order
    for index, entry in enumerate(sequence):
        if entry is None:
            continue
        start, end, xml, item = entry
        following = sequence[index + 1] if index + 1 < len(sequence) else None
        if following is None:
            continue
        next_start, _, next_xml, next_item = following
        before, after = spacing_of(xml, styles)
        next_before, _ = spacing_of(next_xml, styles)
        said = spoken(xml).strip()
        if next_item is not None and (said.endswith(':') or item is not None):
            if after > ITEM_GAP:
                spacing.setdefault(start, {})['after'] = ITEM_GAP
            if next_before > ITEM_GAP:
                spacing.setdefault(next_start, {})['before'] = ITEM_GAP
        elif item is not None and next_item is None:
            continuation = numbering_of(own_properties(next_xml), styles) is None and \
                (indent_of(own_properties(next_xml))[0] or 0) >= item.text
            if not continuation and max(after, next_before) < ROOM:
                spacing.setdefault(next_start, {})['before'] = ROOM
        elif item is None and next_item is None and ALINEAT.match(text_of(next_xml).strip()) \
                and not text_of(next_xml).strip().startswith('(1)') and max(after, next_before) < ROOM:
            spacing.setdefault(next_start, {})['before'] = ROOM

    for start, end in reversed(paragraphs):
        xml = document[start:end]
        changed = xml
        edit = edits.get(start)
        if edit and edit[0] == 'indent':
            changed = set_indent(changed, edit[2], edit[2] - edit[1])
        if edits.get(('label', start)):
            said = unescaped(text_of(changed))
            lead = len(said) - len(said.lstrip())
            label = TYPED_ITEM.match(unescaped(spoken(changed)).strip())
            if not explicitly_bold(changed, lead, lead + len(label.group(1))):
                changed = edit_text_range(changed, lead, lead + len(label.group(1)), bold(True))
        if start in spacing:
            changed = set_spacing(changed, spacing[start].get('before'), spacing[start].get('after'))
        if changed != xml:
            document = document[:start] + changed + document[end:]
    return document, numbering_xml


def dash_lines_in_cells(document):
    """Dash items a table cell joined with line breaks, each a paragraph of its own that hangs
    from its dash, so a wrapped line runs under the text and not under the next dash."""
    def paragraph(match):
        xml = match.group(0)
        if not re.search(r'<w:br/>', xml):
            return hung_dash(xml)
        lines = re.split(r'<w:br/>', xml)
        said = [line for line in (unescaped(text_of(piece)).strip() for piece in lines) if line]
        if len(said) < 2 or not all(re.match(r'[–-]\s+[^\W\d_]', line) for line in said):
            return xml
        return split_at_breaks(xml)
    def cell(match):
        return re.sub(r'<w:p\b[^>]*>(?:(?!</w:p>).)*</w:p>', paragraph, match.group(0), flags=re.S)
    return re.sub(r'<w:tc\b[^>]*>.*?</w:tc>', cell, document, flags=re.S)


def hung_dash(paragraph):
    said = unescaped(text_of(paragraph))
    dash = re.match(r'\s*[–-][ \t]+(?=[^\W\d_])', said)
    if not dash:
        return paragraph
    paragraph = set_indent(paragraph, CELL_HANG, CELL_HANG, tab=False)
    return replace_text_range(paragraph, 0, dash.end(), f'{DASH}\t')


def split_at_breaks(paragraph):
    opening = re.match(r'<w:p\b[^>]*>', paragraph).group(0)
    properties = own_properties(paragraph)
    body = paragraph[len(opening) + len(properties):-len('</w:p>')]
    pieces, current = [], ''
    for match in re.finditer(r'<w:r\b[^>]*>.*?</w:r>|<w:[^>]*/>|<w:(\w+)\b[^>]*>.*?</w:\1>', body, re.S):
        run = match.group(0)
        if '<w:br/>' in run and run.startswith('<w:r'):
            parts = run.split('<w:br/>')
            run_open = re.match(r'<w:r\b[^>]*>(<w:rPr>.*?</w:rPr>)?', run, re.S).group(0)
            for index, part in enumerate(parts):
                piece = part if index == 0 else run_open + part
                if index > 0:
                    pieces.append(current)
                    current = ''
                if TEXT.search(piece) or index == 0:
                    current += piece if piece.endswith('</w:r>') else piece + '</w:r>'
        else:
            current += run
    pieces.append(current)
    hung = set_indent(f'{opening}{properties}</w:p>', CELL_HANG, CELL_HANG, tab=False)
    hung_properties = own_properties(hung)
    out = []
    for piece in pieces:
        if not TEXT.search(piece):
            continue
        out.append(hung_dash(f'{opening}{hung_properties}{piece}</w:p>'))
    return ''.join(out)


def replace_text_range(paragraph, start, end, replacement):
    paragraph = cut_runs(paragraph, [start, end])
    done = False
    for run_start, run_end, at, said, _ in reversed(text_runs(paragraph)):
        length = len(unescaped(said))
        if said and at >= start and at + length <= end:
            run = paragraph[run_start:run_end]
            if at == start:
                text = TEXT.search(run)
                parts = replacement.split('\t')
                inner = ''.join(
                    (f'<w:t xml:space="preserve">{escaped(part)}</w:t>' if part else '') + ('<w:tab/>' if index < len(parts) - 1 else '')
                    for index, part in enumerate(parts))
                run = run[:text.start()] + inner + run[text.end():]
                done = True
            else:
                run = ''
            paragraph = paragraph[:run_start] + run + paragraph[run_end:]
    return paragraph


def typography(document, styles, numbering, contents, name=None):
    if contents:
        document = heading_scale(document)
    else:
        document, styles = out_of_the_outline(document, styles)
    if numbering is not None:
        document = article_paragraphs(document, styles, numbering)
    document, styles = plain_articles(document, styles)
    if name in ARTICLE_DOCUMENTS:
        document = article_labels(document, styles)
    document = typed_hyphens(document)
    if numbering is not None:
        document, numbering = house_order(document, styles, numbering, name)
        numbering = article_levels(dash_bullets(numbering), wide=articles(document, styles, numbering) > 99)
        document, numbering = lists(document, styles, numbering)
    return dash_lines_in_cells(document), styles, numbering
