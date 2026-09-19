"""Makes the built-in templates from the provider's original Word files (ADR 005).

Runs inside the Gotenberg image, which ships LibreOffice with its Python bindings, so nothing
is installed on the host:

    pnpm --filter @ssm-usor/document-engine import-templates [name ...]

For every spec in `originals/` (git-ignored: the originals and their specs quote real people)
it opens the original as a document, not as XML, and:

  1. replaces the text that varies with `{{ }}` placeholders, as the spec says;
  2. applies the shared wording pass (`wording.ro.json`): diacritics, typos, neutral phrasing;
  3. typesets it to the house style: real spacing instead of empty paragraphs and leading
     spaces, one font and size, one page setup, Romanian as the language, blocks that stay
     together across pages.

The result in `templates/` is the source of truth from then on. This script is a one-time
import, not part of the product; the engine in `src/` only fills placeholders.
"""

import glob
import json
import os
import collections
import re
import zipfile
import subprocess
import sys
import time
import traceback

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.lang import Locale
from com.sun.star.style.BreakType import NONE as NO_BREAK
from com.sun.star.style.BreakType import PAGE_BEFORE
from com.sun.star.style.PageStyleLayout import ALL as ALL_PAGES
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT
from com.sun.star.table import BorderLine2
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK
from com.sun.star.text.HoriOrientation import FULL as FULL_WIDTH

ROOT = '/work'
PORT = 2002

# The house style. Lengths are in 1/100 mm, as LibreOffice counts them; 35 is about a point.
FONT = 'Arial'
BODY_SIZE = 10.0
TITLE_SIZE = 12.0
POINT = 35.28
MARGINS = {'LeftMargin': 2500, 'RightMargin': 2000, 'TopMargin': 2000, 'BottomMargin': 2000}
ROMANIAN = Locale('ro', 'RO', '')

# What counts as a title or a heading, per kind of document. Matched on a whole paragraph.
KINDS = {
    # The training materials: chapters of articles, no title of their own (the cover has it).
    'material': {
        'title': [r'^PLANUL DE PREVENIRE', r'^LISTA INTERN[AĂ]', r'^EVALUAREA\s+RISCURILOR\s+DE\s+ACCIDENTARE'],
        'subtitle': [r'^DIN CADRUL', r'^PENTRU$', r'^\{\{client\.legalName\}\}$'],
        'headings': [r'^(Capitolul|CAPITOLUL|Subcapitolul|SUBCAPITOLUL|Cuprins|CUPRINS)', r'^TABEL \d+\.',
                     r'^Tabel(ul)? \d+'],
        'answers': [r'^[a-z]\)\s'],
    },
    'briefing': {
        'title': [r'^MATERIAL DE INFORMARE'],
        'subtitle': [],
        'headings': [r'^Capitolul', r'^Subcapitolul', r'^Cuprins ', r'^TABEL \d+\.'],
        # Items of a list typed with their letter, inside an article.
        'answers': [r'^[a-z]\)\s'],
    },
    # A form drawn from its spec, on an empty document.
    'form': {'title': [], 'subtitle': [], 'headings': []},
    'register': {
        # A second title opens a second part, on a new page.
        'titleOpensPart': True,
        'title': [r'^REGISTRUL UNIC'],
        'subtitle': [r'^PENTRU '],
        'headings': [],
    },
    'test': {
        # A second title opens a second part, on a new page.
        'titleOpensPart': True,
        'title': [r'^TESTARE DE VERIFICARE'],
        'subtitle': [r'^\((ANGAJARE|PERIODIC)'],
        'headings': [r'^SPECIMEN'],
        # A question, typed with its number, and an answer typed with its letter, its lines
        # broken with the Enter key.
        'questions': [r'^\d+\. '],
        'answers': [r'^[a-z]\)\s'],
        'joinWrapped': True,
    },
    'regulation': {
        'title': [r'^REGULAMENT INTERN'],
        'subtitle': [],
        'headings': [r'^Tabel \d+\.'],
    },
    'decision': {
        'title': [r'^DECIZIA$'],
        'subtitle': [r'^Nr\. ?:'],
        'headings': [r'^DECIDE ?:?$', r'^PROCES[ -]VERBAL'],
    },
}

# The hand-over block most documents open with: who prepared and handed over the document, who
# received it. The originals lay it out with tabs and runs of spaces, five lines deep.
HANDOVER = (
    (['Am întocmit și predat un exemplar', 'Am informat angajatorul'],
     '{{provider.representativeName}}', '{{provider.representativeRole}} al {{provider.legalName}}'),
    (['Am primit un exemplar', 'Am luat la cunoștință'],
     '{{client.representativeName}}', '{{client.representativeRole}} al {{client.legalName}}'),
)
# Tables wider than this are set in the small print: a register with twenty columns does not
# fit at 10 pt.
WIDE_TABLE_COLUMNS = 6
# ParaAdjust reads back as a number: justified, and justified with a stretched last line.
JUSTIFIED = (2, 4)
SMALL_PRINT = 8.0
# A table drawn from a definition has the sizes it was given.
DRAWN = 'Drawn'
DRAWN_SIZES = {}

SIGNATURE_BLOCK = [
    '{{client.legalName}}',
    '{{client.representativeRole}}',
    '{{client.representativeName}}',
]

LETTER = r'\p{L}'

# The last line of every footer. The engine removes it when the merge data has no `branding`,
# or an empty one, which is how a plan without it would be served. It is text in the Word file
# on purpose: nothing is stamped onto a PDF, least of all onto one a user uploaded.
BRANDING = '{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}'
BRANDING_SIZE = 7.5
BRANDING_COLOR = 0x7A7A7A

# Where list items sit, whatever list they came from: numbered items, lettered items under
# them, dashes under those. The originals build one hierarchy out of a dozen unrelated lists,
# some with paragraph indents on top, so each level drifts. The label hangs 6.35 mm to the left.
LIST_TIERS = [1270, 1905, 3175]
LIST_HANG = -635


def prop(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def start_office():
    process = subprocess.Popen(
        ['soffice', '--headless', '--invisible', '--norestore', '--nologo',
         f'--accept=socket,host=localhost,port={PORT};urp;'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        'com.sun.star.bridge.UnoUrlResolver', local)
    for _ in range(120):
        try:
            context = resolver.resolve(
                f'uno:socket,host=localhost,port={PORT};urp;StarOffice.ComponentContext')
            desktop = context.ServiceManager.createInstanceWithContext(
                'com.sun.star.frame.Desktop', context)
            return process, desktop
        except Exception:
            time.sleep(0.5)
    raise RuntimeError('LibreOffice did not start.')


def paragraphs(text, in_table=False):
    """Every paragraph of a text, with the tables' cells, in reading order."""
    elements = text.createEnumeration()
    while elements.hasMoreElements():
        element = elements.nextElement()
        if element.supportsService('com.sun.star.text.Paragraph'):
            yield element, in_table
        elif element.supportsService('com.sun.star.text.TextTable'):
            for name in element.getCellNames():
                yield from paragraphs(element.getCellByName(name), True)


def frame_texts(document):
    """What Word calls a floating table arrives inside a text frame, outside the body's flow."""
    frames = document.TextFrames
    # A frame is a text itself; its getText() is the text it is anchored in.
    return [frames.getByIndex(index) for index in range(frames.getCount())]


def all_paragraphs(document):
    """The body's paragraphs, then the frames', which are set like the inside of a table."""
    yield from paragraphs(document.Text)
    for text in frame_texts(document):
        yield from paragraphs(text, True)


def set_text(paragraph, text):
    """Replaces a paragraph's text, keeping the formatting it starts with."""
    cursor = paragraph.getText().createTextCursorByRange(paragraph.getStart())
    cursor.gotoEndOfParagraph(True)
    cursor.setString(text)


def descriptor(document, replacement):
    search = document.createReplaceDescriptor()
    search.SearchCaseSensitive = True
    if 'pattern' in replacement:
        search.SearchRegularExpression = True
        search.SearchString = replacement['pattern']
        # "$" and "&" mean something in a regular expression replacement.
        # `groups` lets the replacement name what the pattern captured ("$1").
        search.ReplaceString = replacement['replace'] if replacement.get('groups') else \
            replacement['replace'].replace('\\', '\\\\').replace('$', '\\$').replace('&', '\\&')
    else:
        search.SearchString = replacement['find']
        search.ReplaceString = replacement['replace']
    return search


def python_pattern(replacement):
    if 'pattern' in replacement:
        return re.compile(replacement['pattern'])
    return re.compile(re.escape(replacement['find']))


def apply(document, replacement):
    """Applies one replacement and returns how many times it matched."""
    if replacement.get('whole'):
        # A paragraph that holds nothing else: a table cell with just a name.
        pattern = python_pattern(replacement)
        count = 0
        for paragraph, _ in all_paragraphs(document):
            if pattern.fullmatch(paragraph.getString().strip()):
                set_text(paragraph, replacement['replace'])
                count += 1
        return count

    loop = replacement.get('loopParagraph')
    if not loop:
        return document.replaceAll(descriptor(document, replacement))

    # Loop tags in paragraphs of their own are what makes the engine repeat the paragraph. The
    # new paragraphs inherit a list number, which does not matter: the engine removes them.
    search = descriptor(document, replacement)
    count = 0
    match = document.findFirst(search)
    while match is not None:
        count += 1
        match.setString(replacement['replace'])
        text = match.getText()
        cursor = text.createTextCursorByRange(match)
        cursor.gotoStartOfParagraph(False)
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        cursor.gotoPreviousParagraph(False)
        cursor.setString(f'{{{{#{loop}}}}}')
        cursor.gotoNextParagraph(False)
        cursor.gotoEndOfParagraph(False)
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        cursor.setString(f'{{{{/{loop}}}}}')
        cursor.gotoEndOfParagraph(False)
        match = document.findNext(cursor, search)
    return count


def document_words(document):
    """Every word of the document, lowercased, to apply only the corrections it needs. The
    dictionary holds thousands; a document uses a few hundred of them."""
    chunks = []
    roots = [document.Text] + frame_texts(document)
    page_styles = document.StyleFamilies.getByName('PageStyles')
    for name in page_styles.getElementNames():
        style = page_styles.getByName(name)
        roots += [style.HeaderText] if style.HeaderIsOn else []
        roots += [style.FooterText] if style.FooterIsOn else []
    for root in roots:
        # Paragraph by paragraph: a frame that holds only a table has no string of its own.
        chunks.extend(paragraph.getString() for paragraph, _ in paragraphs(root))
    # As the letters will read once the old code-page ones are replaced.
    text = ' '.join(chunks).translate(str.maketrans('şţŞŢãÃ', 'șțȘȚăĂ'))
    return {word.lower() for word in re.findall(r"[^\W\d_]+", text)}


# A word that is right both with and without its diacritics is decided by what stands beside
# it. The rules are written against the original text, where the neighbours may or may not have
# their diacritics yet.
WORD_START = rf'(?<![{LETTER}{{.])'
WORD_END = rf'(?![{LETTER}}}])'
AUXILIARIES = ('va|vor|a|ar|poate|pot|putea|poată|poata|putut|puteți|puteti|putem|voi|vom|vă|va fi|se va|se vor|se poate|se pot|nu va|nu vor|își va|isi va|'
               'le va|îl va|il va|o va|a se|a le|a-și|a-si|a-i|a-l|de a|nu se va')
INDEFINITE_BEFORE = 'o|nicio|nici o|orice|fiecare|aceasta|această|aceeasi|aceeași|alta|altă|vreo|cate o|câte o'
PREPOSITIONS = ('de|în|in|la|pe|cu|din|prin|pentru|sub|fără|fara|după|dupa|ca|spre|către|catre|peste|între|intre|'
                'fata de|față de')
NOT_A_NOUN = ('către|catre|după|dupa|fără|fara|despre|între|intre|asupra|împotriva|impotriva|contra|dintre|printre|'
              'care|este|trebuie|poate|spre')


def grammar_replacements(grammar, present):
    rules = []
    for source, target in grammar.get('verbs', {}).items():
        if source in present:
            # The infinitive after an auxiliary ("va asigura"); the present tense otherwise.
            rules.append({'pattern': rf'(?<!(?<!{LETTER})(?:{AUXILIARIES}) ){WORD_START}{source}{WORD_END}',
                          'replace': target})
    for source, target in grammar.get('adjectives', {}).items():
        if source in present:
            # After its noun an adjective never takes the article, so never ends in "-a".
            for find, replace in ((source, target), (source.upper(), target.upper())):
                rules.append({'pattern': rf'{WORD_START}{find}{WORD_END}', 'replace': replace})
    for source, target in grammar.get('adjectivesAfterNoun', {}).items():
        if source in present:
            # Also a noun ("tehnica securității"): an adjective only right after a feminine noun.
            rules.append({'pattern': rf'(?<!(?<!{LETTER})(?:{NOT_A_NOUN}) )(?<={LETTER}{{3}}[aăe] ){source}{WORD_END}',
                          'replace': target})
    for source, (definite, indefinite) in grammar.get('nouns', {}).items():
        if source not in present:
            continue
        rules.append({'pattern': rf'(?<=(?<!{LETTER})(?:{INDEFINITE_BEFORE}) ){source}{WORD_END}', 'replace': indefinite})
        # "în perioadă." is wrong less often than "în perioada." is: a noun after a preposition,
        # with nothing after it to make it definite.
        rules.append({'pattern': rf'(?<=(?<!{LETTER})(?:{PREPOSITIONS}) ){source}(?=[.,;:)!?]|$| (?:și|si|sau|ori)(?!{LETTER}))',
                      'replace': indefinite})
        if definite != source:
            rules.append({'pattern': rf'{WORD_START}{source}{WORD_END}', 'replace': definite})
    return [dict(rule, min=0) for rule in rules]


def wording_replacements(wording, present):
    """Phrases first, written against the original text; then the rules that need context;
    then whole words in three cases."""
    replacements = [dict(phrase, min=0) for phrase in wording['phrases']]
    replacements += [dict(rule, min=0) for rule in wording.get('context', [])]
    replacements += grammar_replacements(wording.get('grammar', {}), present)
    for source, target in wording['words'].items():
        if source not in present:
            continue
        variants = {source: target, source.capitalize(): target[0].upper() + target[1:]}
        # "II" is a number before it is the word "îi" in capitals.
        if not re.fullmatch(r'[IVXLCDM]+', source.upper()):
            variants[source.upper()] = target.upper()
        for find, replace in variants.items():
            replacements.append({
                # Never the inside of a longer word or of a placeholder's dotted name.
                'pattern': rf'(?<![{LETTER}{{])(?<![A-Za-z]\.){re.escape(find)}(?![{LETTER}}}])(?!\.[A-Za-z])',
                'replace': replace,
                'min': 0,
            })
    return replacements


def write_paragraph(text, cursor, content, *, size=BODY_SIZE, bold=False, italic=False,
                    adjust=CENTER, above=0, below=6, keep=False, first=False):
    """Appends a paragraph in the house style at the cursor."""
    if not first:
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    text.insertString(cursor, content, False)
    # Over the text once it is there: what is set on an empty cursor does not reach it.
    cursor.gotoStartOfParagraph(True)
    cursor.CharFontName = FONT
    cursor.CharFontNameAsian = FONT
    cursor.CharFontNameComplex = FONT
    cursor.CharHeight = size
    cursor.CharWeight = 150 if bold else 100
    cursor.CharPosture = 2 if italic else 0
    cursor.CharLocale = ROMANIAN
    cursor.CharColor = -1
    cursor.ParaAdjust = adjust
    cursor.ParaTopMargin = round(above * POINT)
    cursor.ParaBottomMargin = round(below * POINT)
    cursor.ParaLeftMargin = 0
    cursor.ParaFirstLineIndent = 0
    cursor.ParaKeepTogether = keep
    cursor.gotoEndOfParagraph(False)


def insert_handover(document, text, cursor, sides, signing_room=42):
    """Two columns without borders: what each side confirms, room to sign, who signs."""
    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(1, 2)
    text.insertTextContent(cursor, table, False)
    table.Split = False
    table.HoriOrient = FULL_WIDTH
    border = table.TableBorder2
    for side in ('TopLine', 'BottomLine', 'LeftLine', 'RightLine', 'HorizontalLine', 'VerticalLine'):
        setattr(border, side, BorderLine2())
    table.TableBorder2 = border
    for cell_name, (lines, name, role) in zip(('A1', 'B1'), sides):
        cell = table.getCellByName(cell_name)
        cell_cursor = cell.createTextCursor()
        for index, line in enumerate(lines):
            write_paragraph(cell, cell_cursor, line, below=0, first=index == 0)
        write_paragraph(cell, cell_cursor, name, bold=True, above=signing_room, below=0)
        write_paragraph(cell, cell_cursor, role, below=0)
    table.BottomMargin = round(12 * POINT)
    return table


def rebuild_table(document, definition):
    """Replaces a table of the body with one drawn from a definition, where the original is
    beyond tidying: columns a letter wide, cells aligned with tabs. `rows` holds the cells as
    text or as {text, colspan, rowspan}; a cell another one spans over is an empty string."""
    body = list(_elements(document.Text))
    if 'replaceTable' in definition:
        tables = [item for item in body if item.supportsService('com.sun.star.text.TextTable')]
        old = tables[definition['replaceTable']]
        following = body[body.index(old) + 1]
        if 'rows' not in definition:
            # The original's own text, in columns that fit it. `number` writes the first column
            # out, where the original numbered its rows with a list.
            names = old.getCellNames()
            width = len(definition['widths']) + len(definition.get('dropColumns', []))
            rows_read = {}
            for cell_name in names:
                column = ord(cell_name[0]) - ord('A')
                row = int(cell_name[1:]) - 1
                rows_read.setdefault(row, [None] * width)[column] = old.getCellByName(cell_name).getString().strip()
            for dropped in sorted(definition.get('dropColumns', []), reverse=True):
                # A column that cannot stay true: page numbers typed by hand.
                for row in rows_read.values():
                    del row[dropped]
            counts = collections.Counter(int(cell_name[1:]) - 1 for cell_name in names)
            definition = dict(definition, rows=[rows_read[index] for index in sorted(rows_read)])
            if definition.get('keepRows') is not None:
                definition['rows'] = definition['rows'][:definition['keepRows']] + definition.get('addRows', [])
            if counts[0] == 1 and width > 1:
                # A first row merged across the table is its caption: a heading above it.
                definition['heading'] = definition['rows'].pop(0)[0]
            # A cell the original does not have is covered by the one above it.
            for row_index, row in enumerate(definition['rows']):
                for column_index, content in enumerate(row):
                    if content is not None:
                        continue
                    row[column_index] = ''
                    above = next((index for index in range(row_index - 1, -1, -1)
                                  if definition['rows'][index][column_index] != ''), None)
                    if above is not None:
                        cell = definition['rows'][above][column_index]
                        cell = cell if isinstance(cell, dict) else {'text': cell}
                        cell['rowspan'] = row_index - above + 1
                        definition['rows'][above][column_index] = cell
            if definition.get('number'):
                for index, row in enumerate(definition['rows'][definition.get('headerRows', 1):]):
                    row[0] = f'{index + 1}.'
        old.dispose()
    else:
        # A table of its own, at the end.
        following = body[-1]

    text = document.Text
    cursor = text.createTextCursorByRange(following.getStart())
    if definition.get('heading'):
        text.insertString(cursor, definition['heading'], False)
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        heading = list(_elements(text))[list(_elements(text)).index(following) - 1]
        heading.CharWeight = 150
        heading.ParaAdjust = CENTER
        heading.ParaKeepTogether = True
        heading.NumberingIsNumber = False
        following.CharWeight = 100

    rows = definition['rows']
    columns = len(definition['widths'])
    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(len(rows), columns)
    text.insertTextContent(text.createTextCursorByRange(following.getStart()), table, False)
    table.HoriOrient = FULL_WIDTH
    # A register may run over pages; a form stays whole. A heading with cells merged downwards
    # is not repeated on the next page: LibreOffice draws the repeat over the rows under it.
    spans_rows = any(isinstance(cell, dict) and cell.get('rowspan', 1) > 1 for row in definition['rows'] for cell in row)
    flags = ('Split' if definition.get('split') else '') + \
        ('Once' if spans_rows or not definition.get('headerRows', 1) else '')
    table.Name = f"{DRAWN}{flags}{definition.get('replaceTable', len(DRAWN_SIZES) + 100)}"
    DRAWN_SIZES[table.Name] = definition.get('size', BODY_SIZE)
    total, position = sum(definition['widths']), 0
    separators = table.TableColumnSeparators
    for separator, width in zip(separators, definition['widths']):
        position += width
        separator.Position = round(position / total * table.TableColumnRelativeSum)
    table.TableColumnSeparators = separators

    size = definition.get('size', BODY_SIZE)
    header_rows = definition.get('headerRows', 1)
    left = set(definition.get('left', []))
    bold_columns = set(definition.get('boldColumns', []))
    merges = []
    for row_index, row in enumerate(rows):
        for column_index, content in enumerate(row):
            cell_definition = content if isinstance(content, dict) else {'text': content}
            cell = table.getCellByPosition(column_index, row_index)
            cell.VertOrient = 2
            lines = cell_definition['text'].split('\n')
            cell_cursor = cell.createTextCursor()
            for index, line in enumerate(lines):
                aligned = cell_definition.get('align')
                write_paragraph(cell, cell_cursor, line, size=size,
                                bold=row_index < header_rows or column_index in bold_columns
                                or cell_definition.get('bold', False),
                                adjust={'left': LEFT, 'center': CENTER}[aligned] if aligned else
                                LEFT if column_index in left and row_index >= header_rows else CENTER,
                                below=0, first=index == 0)
            spans = (cell_definition.get('colspan', 1), cell_definition.get('rowspan', 1))
            if spans != (1, 1):
                merges.append((column_index, row_index, *spans))
    # From the end, so a merge never renames a cell still to be merged.
    for column_index, row_index, colspan, rowspan in reversed(merges):
        merge = table.createCursorByCellName(table.getCellByPosition(column_index, row_index).CellName)
        if colspan > 1:
            merge.goRight(colspan - 1, True)
        if rowspan > 1:
            merge.goDown(rowspan - 1, True)
        merge.mergeRange()
    if header_rows > 1 and not spans_rows:
        table.HeaderRowCount = header_rows
    for row_number, height in definition.get('rowHeights', {}).items():
        # One row taller than the rest: the blank space of a form.
        padding = max(0, round((height * 100 - size * POINT * 1.2) / 2))
        for cell_name in table.getCellNames():
            if re.sub(r'^[A-Za-z]+', '', cell_name).split('.')[0] == row_number:
                cell = table.getCellByName(cell_name)
                cell.TopBorderDistance = padding
                cell.BottomBorderDistance = padding
    if definition.get('rowHeight'):
        # Room to write by hand, as padding: a row's least height is not something the API
        # offers, and padding reads the same in every viewer.
        padding = max(0, round((definition['rowHeight'] * 100 - size * POINT * 1.2) / 2))
        for cell_name in table.getCellNames():
            if int(re.sub(r'^[A-Za-z]+', '', cell_name).split('.')[0]) <= header_rows:
                continue
            cell = table.getCellByName(cell_name)
            cell.TopBorderDistance = padding
            cell.BottomBorderDistance = padding
    return table


def replace_handover(document, sides=None):
    """Swaps the tab-aligned hand-over lines for the two-column block. Returns whether it
    found them."""
    body = list(_elements(document.Text))
    for index, element in enumerate(body):
        if not element.supportsService('com.sun.star.text.Paragraph'):
            continue
        if not re.match(r'\s*Am ([iî]ntocmit|predat)', element.getString()):
            continue
        # The opening line and what follows it, up to the line with the two names.
        block = [element]
        for following in body[index + 1:index + 8]:
            if not following.supportsService('com.sun.star.text.Paragraph'):
                break
            block.append(following)
            if len([item for item in block if item.getString().strip()]) == 5:
                break
        cursor = document.Text.createTextCursorByRange(block[0].getStart())
        insert_handover(document, document.Text, cursor, sides or HANDOVER)
        if index and body[index - 1].supportsService('com.sun.star.text.Paragraph'):
            # The title above: a Word file has no space around a table.
            body[index - 1].ParaBottomMargin = round(12 * POINT)
        after = body[index + len(block)] if index + len(block) < len(body) else None
        if after is not None and after.supportsService('com.sun.star.text.TextTable'):
            # Straight into a table: one line stays between them, or they are saved as one.
            spacer = block.pop()
            set_text(spacer, '')
            spacer.CharHeight = 6.0
            spacer.ParaTopMargin = 0
            spacer.ParaBottomMargin = 0
        for paragraph in block:
            document.Text.removeTextContent(paragraph)
        return True
    return False


# The box of document details the provider prints at the head of every page. Rebuilt, because
# the originals fill it with runs of spaces and a page number typed by hand.
HEADER_COLUMNS = (2000, 5000, 8000)  # separators, out of 10000
HEADER_PARTIES = {
    'provider': ['{{provider.legalName}}', '{{provider.representativeRole}}', '{{provider.representativeName}}'],
    'specialist': ['{{provider.legalName}}', '{{specialist.professionalTitle}}', '{{specialist.name}}'],
    'client': ['{{client.legalName}}', '{{client.representativeRole}}', '{{client.representativeName}}'],
}


def build_header(document, details):
    """Writes the document details into the header of every page style."""
    page_styles = document.StyleFamilies.getByName('PageStyles')
    for style_name in page_styles.getElementNames():
        style = page_styles.getByName(style_name)
        # Off and on again empties it, tables included.
        style.HeaderIsOn = False
        style.HeaderIsOn = True
        for shared in ('HeaderIsShared', 'FirstIsShared'):
            setattr(style, shared, True)
        header = style.HeaderText
        table = document.createInstance('com.sun.star.text.TextTable')
        table.initialize(2, 4)
        header.insertTextContent(header.createTextCursor(), table, False)
        table.HoriOrient = FULL_WIDTH
        separators = table.TableColumnSeparators
        for separator, position in zip(separators, HEADER_COLUMNS):
            separator.Position = position
        table.TableColumnSeparators = separators

        cells = {
            'A1': ['Data întocmirii documentului:', '{{issueDate}}'],
            'B1': ['Întocmit de:'] + HEADER_PARTIES[details.get('preparedBy', 'provider')],
            'C1': ['Întocmit pentru:'] + HEADER_PARTIES['client'],
            'D1': ['Cod document:', details['code']],
            'A2': ['Denumire document:', details['title']],
        }
        for cell_name, lines in cells.items():
            cell = table.getCellByName(cell_name)
            cursor = cell.createTextCursor()
            for index, line in enumerate(lines):
                write_paragraph(cell, cursor, line, size=SMALL_PRINT, bold=index == 1,
                                adjust=LEFT if cell_name == 'A2' else CENTER, below=0, first=index == 0)
        page = table.getCellByName('D2')
        cursor = page.createTextCursor()
        write_paragraph(page, cursor, 'Pag. ', size=SMALL_PRINT, below=0, first=True)
        for service, after in (('PageNumber', ' din '), ('PageCount', '')):
            field = document.createInstance(f'com.sun.star.text.TextField.{service}')
            field.NumberingType = 4  # Arabic numerals
            if service == 'PageNumber':
                field.SubType = uno.Enum('com.sun.star.text.PageNumberType', 'CURRENT')
            page.insertTextContent(cursor, field, False)
            page.insertString(cursor, after, False)
        page.VertOrient = 2  # centred in the height of the row
        merge = table.createCursorByCellName('A2')
        merge.gotoCellByName('C2', True)
        merge.mergeRange()

        # The paragraph a header keeps after its table is the gap down to the text.
        closing = [item for item in _elements(header) if item.supportsService('com.sun.star.text.Paragraph')][-1]
        closing.CharHeight = 2.0
        closing.ParaTopMargin = 0
        closing.ParaBottomMargin = 0


def join_typed_answers(document, rules):
    """A test typed by hand: "a) …" with the letter typed, and a long answer broken into lines
    with the Enter key. The lines go back into their answer and the letter gets a tab, so the
    typesetting can hang the answer from it."""
    previous = None
    for element in list(_elements(document.Text)):
        if not element.supportsService('com.sun.star.text.Paragraph'):
            previous = None
            continue
        text = element.getString().strip()
        listed = element.NumberingIsNumber and element.ListLabelString
        if not text or listed:
            previous = None
        elif matches(text, rules['answers']):
            previous = element
        elif matches(text, rules.get('questions', []) + rules['title'] + rules['subtitle'] + rules['headings']):
            previous = None
        elif previous is not None and rules.get('joinWrapped'):
            end = document.Text.createTextCursorByRange(previous.getEnd())
            document.Text.insertString(end, ' ' + text, False)
            document.Text.removeTextContent(element)
    for element in _elements(document.Text):
        if element.supportsService('com.sun.star.text.Paragraph') and not element.ListLabelString \
                and matches(element.getString(), rules['answers']):
            cursor = document.Text.createTextCursorByRange(element.getStart())
            cursor.goRight(2, False)
            cursor.goRight(1, True)
            cursor.setString('\t')


def strip_spacing(document):
    """Spaces were doing the work of alignment and of spacing. Without them a paragraph of
    spaces is an empty one, which the typesetting removes with the rest."""
    for pattern in (r'^[ \x{00A0}\t]+', r'[ \x{00A0}\t]+$'):
        document.replaceAll(descriptor(document, {'pattern': pattern, 'replace': ''}))


def texts(document):
    """The body and every table cell: each is a text of its own to a cursor."""
    yield document.Text
    for element in _elements(document.Text):
        if element.supportsService('com.sun.star.text.TextTable'):
            for name in element.getCellNames():
                yield element.getCellByName(name)


def column_count(table):
    """The cells of the fullest row. A table with merged cells reports the columns of its first
    row only."""
    rows = {}
    for name in table.getCellNames():
        row = re.sub(r'^[A-Za-z]+', '', name)
        rows[row] = rows.get(row, 0) + 1
    return max(rows.values())


def normalise_characters(document):
    """One font, one size, one language, no colour, over everything including the paragraph
    marks, which keep formatting of their own that a paragraph's properties do not reach. A
    wide table is set smaller, like the small print of a header or footer."""
    def apply(text, size):
        cursor = text.createTextCursor()
        cursor.gotoStart(False)
        cursor.gotoEnd(True)
        cursor.CharFontName = FONT
        cursor.CharFontNameAsian = FONT
        cursor.CharFontNameComplex = FONT
        if size:
            cursor.CharHeight = size
            cursor.CharHeightAsian = size
            cursor.CharHeightComplex = size
        cursor.CharLocale = ROMANIAN
        cursor.CharColor = -1
        # Letters spread apart or squeezed to make a line fit.
        cursor.CharKerning = 0
        cursor.CharScaleWidth = 100

    def apply_tables(text, size):
        for element in _elements(text):
            if element.supportsService('com.sun.star.text.TextTable'):
                wide = column_count(element) > WIDE_TABLE_COLUMNS
                # The cursor over the body reaches into the tables, so a drawn one is set again.
                drawn = DRAWN_SIZES.get(element.Name)
                for name in element.getCellNames():
                    apply(element.getCellByName(name), drawn or (SMALL_PRINT if wide else size))
                    # A table inside a cell.
                    apply_tables(element.getCellByName(name), SMALL_PRINT if wide else size)

    apply(document.Text, BODY_SIZE)
    apply_tables(document.Text, BODY_SIZE)
    for text in frame_texts(document):
        try:
            apply(text, BODY_SIZE)
        except Exception:  # noqa: BLE001 - a frame that starts with a table gives no cursor
            pass
        apply_tables(text, BODY_SIZE)
    page_styles = document.StyleFamilies.getByName('PageStyles')
    for name in page_styles.getElementNames():
        style = page_styles.getByName(name)
        for enabled, part in ((style.HeaderIsOn, 'HeaderText'), (style.FooterIsOn, 'FooterText')):
            if enabled:
                apply(getattr(style, part), SMALL_PRINT)
                apply_tables(getattr(style, part), SMALL_PRINT)

    # The dead internal links ("#") of the originals, one portion at a time. Writing an empty
    # address over everything does the opposite: it is saved as a link to nowhere around all
    # the text, which some viewers then draw as links.
    for paragraph, _ in all_paragraphs(document):
        portions = paragraph.createEnumeration()
        while portions.hasMoreElements():
            portion = portions.nextElement()
            if portion.HyperLinkURL or portion.HyperLinkName or portion.HyperLinkTarget:
                for name in ('HyperLinkURL', 'HyperLinkName', 'HyperLinkTarget',
                             'UnvisitedCharStyleName', 'VisitedCharStyleName', 'CharStyleName'):
                    portion.setPropertyToDefault(name)
                portion.CharUnderline = 0


def has_content(text):
    """Text or a table: a header holding only a table reads as an empty string."""
    return any(element.supportsService('com.sun.star.text.TextTable') or element.getString().strip()
               for element in _elements(text))


def add_branding(page_style):
    """Ends the footer with the branding line: alone where the document had no footer, as one
    more paragraph under what a footer already holds."""
    page_style.FooterIsOn = True
    # The footer lives inside the 20 mm bottom margin of the house style: 12 mm from the edge
    # to the footer, then the line, then 4 mm to the text.
    page_style.BottomMargin = 1200
    page_style.FooterBodyDistance = 400
    # As tall as what it holds: an original's fixed height would push the text up or clip it.
    page_style.FooterIsDynamicHeight = True
    # At least the line and its distance to the text, so the text ends 20 mm from the edge.
    page_style.FooterHeight = 800
    footer = page_style.FooterText
    for paragraph in list(_elements(footer)):
        # Empty lines the original spaced its footer with.
        # And a page number of the original's: the box of document details has "Pag. X din Y".
        if paragraph.supportsService('com.sun.star.text.Paragraph') \
                and re.fullmatch(r'\d*', paragraph.getString().strip()) and len(list(_elements(footer))) > 1:
            footer.removeTextContent(paragraph)
    if BRANDING in footer.getString():
        return
    cursor = footer.createTextCursor()
    cursor.gotoEnd(False)
    if has_content(footer):
        footer.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    else:
        footer.setString('')
        cursor = footer.createTextCursor()
    footer.insertString(cursor, BRANDING, False)
    cursor.gotoStartOfParagraph(True)
    cursor.CharFontName = FONT
    cursor.CharHeight = BRANDING_SIZE
    cursor.CharColor = BRANDING_COLOR
    cursor.CharWeight = 100
    cursor.CharLocale = ROMANIAN
    cursor.ParaAdjust = CENTER
    cursor.ParaTopMargin = round(3 * POINT)
    cursor.ParaBottomMargin = 0
    cursor.ParaLeftMargin = 0
    cursor.ParaFirstLineIndent = 0


def snap_list_indent(paragraph):
    """Moves a list item to the nearest tier, in the list's own definition, and drops the
    paragraph indents laid over it. Articles ("Art. 1.") keep their flush-left form."""
    if paragraph.ListLabelString.startswith('Art.'):
        return
    numbering = paragraph.NumberingRules
    level = paragraph.NumberingLevel
    properties = list(numbering.getByIndex(level))
    current = paragraph.ParaLeftMargin or next(
        (item.Value for item in properties if item.Name == 'IndentAt'), 0)
    tier = min(LIST_TIERS, key=lambda candidate: abs(candidate - current)) if current <= 2500 else LIST_TIERS[2]
    for item in properties:
        if item.Name in ('IndentAt', 'ListtabStopPosition'):
            item.Value = tier
        elif item.Name == 'FirstLineIndent':
            item.Value = LIST_HANG
        elif item.Name == 'LabelFollowedBy':
            item.Value = 0  # a tab, to the tier
        elif item.Name == 'PositionAndSpaceMode':
            item.Value = 1  # position by alignment and indent; the older mode ignores IndentAt
    uno.invoke(numbering, 'replaceByIndex',
               (level, uno.Any('[]com.sun.star.beans.PropertyValue', tuple(properties))))
    paragraph.NumberingRules = numbering
    # Indents laid over the list, and tab stops of the paragraph's own that would catch the
    # label's tab before it reaches the tier.
    for name in ('ParaLeftMargin', 'ParaFirstLineIndent', 'ParaTabStops'):
        paragraph.setPropertyToDefault(name)


def matches(text, patterns):
    return any(re.search(pattern, text) for pattern in patterns)


def typeset(document, kind, shrink_empty=False):
    rules = KINDS[kind]

    # One page setup.
    page_styles = document.StyleFamilies.getByName('PageStyles')
    # Every page style, not only the ones in use: an unused one still exports its footer.
    for name in page_styles.getElementNames():
        if name:
            style = page_styles.getByName(name)
            # A4, whichever way it is turned: some originals are on Letter.
            long_side, short_side = 29700, 21000
            style.Width, style.Height = (long_side, short_side) if style.IsLandscape else (short_side, long_side)
            # The same margins on every page: mirrored ones move the text from side to side.
            style.PageStyleLayout = ALL_PAGES
            for margin, value in MARGINS.items():
                setattr(style, margin, value)
            # An empty header or footer still takes its height off every page.
            # Shared, or the first and the even pages keep a header and footer of their own.
            for shared in ('HeaderIsShared', 'FooterIsShared', 'FirstIsShared'):
                setattr(style, shared, True)
            if style.HeaderIsOn and not has_content(style.HeaderText):
                style.HeaderIsOn = False
            if style.HeaderIsOn:
                # Like the footer, a header lives inside its margin: 12 mm, the box, then 4 mm.
                style.TopMargin = 1200
                style.HeaderBodyDistance = 400
            add_branding(style)

    # Boxes drawn behind a title for decoration. One that holds text stays.
    page = document.DrawPage
    shapes = [page.getByIndex(index) for index in range(page.getCount())]
    for shape in shapes:
        try:
            if shape.ShapeType in ('com.sun.star.drawing.CustomShape', 'com.sun.star.drawing.RectangleShape') \
                    and not shape.getString().strip():
                page.remove(shape)
        except Exception:  # noqa: BLE001 - a shape that went with its group
            pass

    # Empty paragraphs were the spacing. Paragraph margins replace them. One that carries a
    # page break hands it to the paragraph after it.
    body = []
    elements = document.Text.createEnumeration()
    while elements.hasMoreElements():
        body.append(elements.nextElement())
    removed = 0
    for index, element in enumerate(body[:-1]):
        if element is None or not element.supportsService('com.sun.star.text.Paragraph') or element.getString().strip():
            continue
        if element.createContentEnumeration('com.sun.star.text.TextContent').hasMoreElements():
            # It anchors a picture or a frame, so it stays; where empties are shrunk, so is it.
            if shrink_empty:
                element.CharHeight = 1.0
                element.ParaTopMargin = 0
                element.ParaBottomMargin = 0
            continue
        following = body[index + 1]
        before = next((item for item in reversed(body[:index]) if item is not None), None)
        if before is not None and before.supportsService('com.sun.star.text.TextTable') \
                and following.supportsService('com.sun.star.text.TextTable'):
            # Two tables with nothing between them are saved as one.
            element.CharHeight = 4.0
            element.ParaTopMargin = 0
            element.ParaBottomMargin = 0
            continue
        if shrink_empty:
            # Where removing them breaks the file (LibreOffice then fails to save one original,
            # for no reason it gives): left in place at 1 pt, where they take no room.
            element.CharHeight = 1.0
            element.ParaTopMargin = 0
            element.ParaBottomMargin = 0
            continue
        if element.PageDescName:
            # It switches the page style, to landscape and back: what follows takes that over,
            # and where it cannot, the paragraph stays.
            try:
                following.PageDescName = element.PageDescName
            except Exception:  # noqa: BLE001
                continue
        elif element.BreakType != NO_BREAK and following.supportsService('com.sun.star.text.Paragraph'):
            following.BreakType = element.BreakType
        document.Text.removeTextContent(element)
        body[index] = None
        removed += 1

    body = [item for item in body if item is not None]
    previous = None
    for element in [item for item in _elements(document.Text)]:
        if element.supportsService('com.sun.star.text.TextTable'):
            # A short table moves to the next page whole, with the paragraph that introduces it.
            element.RepeatHeadline = 'Once' not in element.Name
            element.HoriOrient = FULL_WIDTH
            # Up to a dozen rows; a longer one kept whole leaves most of a page empty before it.
            if element.getRows().getCount() <= 12 and not element.Name.startswith(f'{DRAWN}Split'):
                element.Split = False
            element.TopMargin = round(6 * POINT)
            element.BottomMargin = round(6 * POINT)
            if not element.Name.startswith(DRAWN):
                # Text that touches the rules of its cell: some originals have no padding at all.
                for cell_name in element.getCellNames():
                    cell = element.getCellByName(cell_name)
                    for side, least in (('Left', 80), ('Right', 80), ('Top', 30), ('Bottom', 30)):
                        if getattr(cell, f'{side}BorderDistance') < least:
                            setattr(cell, f'{side}BorderDistance', least)
            if previous is not None:
                previous.ParaKeepTogether = True
        previous = element if element.supportsService('com.sun.star.text.Paragraph') else None

    normalise_characters(document)
    # A list label takes its colour from a character style, out of a cursor's reach.
    character_styles = document.StyleFamilies.getByName('CharacterStyles')
    for name in character_styles.getElementNames():
        character_styles.getByName(name).setPropertyToDefault('CharColor')

    # A list of one item is not a list: the lone "1." in front of it goes.
    items = {}
    for paragraph, _ in all_paragraphs(document):
        if paragraph.NumberingIsNumber and paragraph.ListLabelString:
            items.setdefault(paragraph.ListId, []).append(paragraph)
    for listed in items.values():
        if len(listed) == 1 and not listed[0].ListLabelString.startswith('Art.'):
            listed[0].NumberingIsNumber = False
            listed[0].ParaLeftMargin = 0
            listed[0].ParaFirstLineIndent = 0

    seen_title = False
    after_question = False
    under_number = False
    letter_tier = None
    for paragraph, in_table in all_paragraphs(document):
        text = paragraph.getString().strip()
        if not in_table and after_question and paragraph.NumberingIsNumber and paragraph.ListLabelString:
            # Each question's answers start again from a): the originals run one list through
            # the whole test, so the specimen's answers read d), e), f).
            paragraph.ParaIsNumberingRestart = True
            paragraph.NumberingStartValue = 1
        if not in_table:
            after_question = False
        # Again on the paragraph: its end mark keeps formatting of its own, out of a cursor's
        # reach, and that is where a stray language or size survives.
        paragraph.CharFontName = FONT
        if not in_table:
            # In a table the size went on with the rest of the characters: a wide one is smaller.
            paragraph.CharHeight = BODY_SIZE
        paragraph.CharLocale = ROMANIAN
        paragraph.CharColor = -1
        paragraph.ParaWidows = 2
        paragraph.ParaOrphans = 2
        try:
            # What the paragraph's end mark was formatted with, kept apart from the paragraph's
            # own attributes: a font and a language nothing else reaches.
            paragraph.setPropertyToDefault('ListAutoFormat')
        except Exception:  # noqa: BLE001 - older LibreOffice has no such property
            pass
        # No boxes, shadows or shading around a paragraph.
        for name in ('LeftBorder', 'RightBorder', 'TopBorder', 'BottomBorder', 'ParaShadowFormat',
                     'ParaBackColor', 'ParaBackTransparent'):
            paragraph.setPropertyToDefault(name)
        if in_table:
            paragraph.ParaTopMargin = 0
            paragraph.ParaBottomMargin = 0
            if paragraph.ParaAdjust in JUSTIFIED:
                paragraph.ParaAdjust = LEFT
            continue

        paragraph.ParaTopMargin = 0
        paragraph.ParaBottomMargin = round(6 * POINT)
        # Running text and list items are left-aligned, never justified: without hyphenation a
        # justified line opens uneven gaps between words. Titles, headings and the signature
        # block centre below.
        paragraph.ParaAdjust = LEFT
        if not (paragraph.NumberingIsNumber and paragraph.ListLabelString) or paragraph.ListLabelString.startswith('Art.'):
            under_number = False
            letter_tier = None
        listed = paragraph.NumberingIsNumber and paragraph.NumberingRules is not None and (
            paragraph.ListLabelString or paragraph.ParaLeftMargin
            or any(item.Name == 'IndentAt' and item.Value for item in
                   paragraph.NumberingRules.getByIndex(paragraph.NumberingLevel)))
        if listed and paragraph.ListLabelString.startswith('Art.'):
            # An article gets air above it; what is listed under it sits close together.
            paragraph.ParaTopMargin = round(6 * POINT)
            paragraph.ParaBottomMargin = round(3 * POINT)
        elif listed:
            snap_list_indent(paragraph)
            paragraph.ParaBottomMargin = round(2 * POINT)
            label = paragraph.ListLabelString
            if re.fullmatch(r'\d+[.)]', label):
                under_number = True
                letter_tier = None
            elif re.fullmatch(r'[a-z][.)]', label):
                # Letters under a numbered point: one tier in, which the originals leave flush
                # with the numbers. On the paragraph, because both may share one list.
                letter_tier = 1 if under_number else 0
                if under_number:
                    paragraph.ParaLeftMargin = LIST_TIERS[1]
                    paragraph.ParaFirstLineIndent = LIST_HANG
            elif letter_tier is not None and not re.search(r'[\w]', label):
                # Dashes under a letter: one tier further in.
                paragraph.ParaLeftMargin = LIST_TIERS[letter_tier + 1]
                paragraph.ParaFirstLineIndent = LIST_HANG
        elif paragraph.ParaLeftMargin:
            # A note inside a list: "(Preluare din H.G. 1425/2006 – Art. 98)".
            paragraph.ParaBottomMargin = round(2 * POINT)
        else:
            paragraph.ParaFirstLineIndent = 0

        if matches(text, rules['title']):
            paragraph.CharHeight = TITLE_SIZE
            paragraph.CharWeight = 150
            paragraph.ParaAdjust = CENTER
            paragraph.ParaBottomMargin = 0 if rules['subtitle'] else round(12 * POINT)
            paragraph.ParaKeepTogether = True
            if seen_title and rules.get('titleOpensPart'):
                # A second title opens a second part: the specimen of a test.
                paragraph.BreakType = PAGE_BEFORE
            seen_title = True
        elif matches(text, rules.get('questions', [])) and not listed:
            paragraph.CharWeight = 150
            paragraph.ParaTopMargin = round(6 * POINT)
            paragraph.ParaBottomMargin = round(2 * POINT)
            paragraph.ParaKeepTogether = True
            after_question = True
            continue
        elif matches(text, rules.get('answers', [])) and not listed:
            paragraph.ParaLeftMargin = LIST_TIERS[0]
            paragraph.ParaFirstLineIndent = LIST_HANG
            paragraph.ParaBottomMargin = round(2 * POINT)
            paragraph.setPropertyToDefault('ParaTabStops')
            label = paragraph.getText().createTextCursorByRange(paragraph.getStart())
            label.goRight(2, True)
            label.CharWeight = 150
        elif matches(text, rules['subtitle']):
            paragraph.ParaAdjust = CENTER
            paragraph.ParaBottomMargin = round(12 * POINT)
        elif matches(text, rules['headings']):
            paragraph.CharWeight = 150
            paragraph.ParaAdjust = CENTER
            paragraph.ParaTopMargin = round(12 * POINT)
            paragraph.ParaKeepTogether = True
        elif text in SIGNATURE_BLOCK:
            # Centred, so a long name grows both ways instead of drifting off a column of spaces.
            position = SIGNATURE_BLOCK.index(text)
            paragraph.ParaAdjust = CENTER
            paragraph.ParaLeftMargin = 0
            paragraph.ParaRightMargin = 0
            paragraph.ParaFirstLineIndent = 0
            paragraph.ParaTopMargin = round(24 * POINT) if position == 0 else 0
            paragraph.ParaBottomMargin = [0, round(12 * POINT), round(24 * POINT)][position]
            paragraph.ParaKeepTogether = position < 2

    # A list sits close under the paragraph that introduces it, and what follows a list starts
    # at a paragraph's distance.
    flow = [item for item in _elements(document.Text)]
    for index, element in enumerate(flow[:-1]):
        following = flow[index + 1]
        if not (element.supportsService('com.sun.star.text.Paragraph')
                and following.supportsService('com.sun.star.text.Paragraph')):
            continue
        is_item = lambda item: bool(item.NumberingIsNumber and item.ListLabelString
                                    and not item.ListLabelString.startswith('Art.')) or \
            (item.ParaFirstLineIndent == LIST_HANG and item.ParaLeftMargin == LIST_TIERS[0])
        if not is_item(element) and is_item(following) and element.ParaBottomMargin > round(3 * POINT):
            element.ParaBottomMargin = round(3 * POINT)
        elif is_item(element) and not is_item(following) and following.getString().strip():
            element.ParaBottomMargin = round(6 * POINT)

    # A Word file has no space around a table: it comes from the paragraphs beside it.
    elements = list(_elements(document.Text))
    for index, element in enumerate(elements):
        if not element.supportsService('com.sun.star.text.TextTable'):
            continue
        if index and elements[index - 1].supportsService('com.sun.star.text.Paragraph'):
            before = elements[index - 1]
            if before.getString().strip():
                before.ParaBottomMargin = max(before.ParaBottomMargin, round(6 * POINT))
        if index + 1 < len(elements) and elements[index + 1].supportsService('com.sun.star.text.Paragraph'):
            after = elements[index + 1]
            if after.getString().strip():
                after.ParaTopMargin = max(after.ParaTopMargin, round(6 * POINT))

    # From a heading to the table it introduces, everything moves to the next page together.
    block = []
    for element in _elements(document.Text):
        if element.supportsService('com.sun.star.text.TextTable'):
            for paragraph in block:
                paragraph.ParaKeepTogether = True
            block = []
        elif matches(element.getString().strip(), rules['headings']):
            block = [element]
        elif block:
            block.append(element)

    if shrink_empty:
        # Last, so nothing above gives them their size and spacing back.
        for element in _elements(document.Text):
            if element.supportsService('com.sun.star.text.Paragraph') and not element.getString().strip():
                cursor = document.Text.createTextCursorByRange(element.getStart())
                cursor.gotoEndOfParagraph(True)
                cursor.CharHeight = 1.0
                element.CharHeight = 1.0
                element.ParaTopMargin = 0
                element.ParaBottomMargin = 0

    # Word wants a paragraph after a closing table. Small, it cannot be what spills onto an
    # empty last page.
    last = body[-1]
    closing = [item for item in _elements(document.Text)]
    if len(closing) > 1 and closing[-2].supportsService('com.sun.star.text.Paragraph') \
            and last.supportsService('com.sun.star.text.Paragraph') and not last.getString().strip():
        # An empty last line after text, not after a table, has no reason to stay.
        document.Text.removeTextContent(last)
    elif last.supportsService('com.sun.star.text.Paragraph') and not last.getString().strip():
        last.CharHeight = 1.0
        last.ParaTopMargin = 0
        last.ParaBottomMargin = 0
    return removed


def _elements(text):
    elements = text.createEnumeration()
    while elements.hasMoreElements():
        yield elements.nextElement()


def sweep(path):
    """A last pass over the saved file, for the two things LibreOffice's API reaches in most
    places and not in all: a dead link that survives clearing, and an empty paragraph it
    writes as justified though its own model says otherwise."""
    with zipfile.ZipFile(path) as archive:
        entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item, data in entries:
            if re.fullmatch(r'word/(document|header\d*|footer\d*)\.xml', item.filename):
                xml = data.decode('utf8')
                xml = re.sub(r'<w:hyperlink\b[^>]*>(.*?)</w:hyperlink>', r'\1', xml, flags=re.S)
                xml = xml.replace('<w:jc w:val="both"/>', '<w:jc w:val="left"/>')
                data = xml.encode('utf8')
            archive.writestr(item, data)


def import_template(desktop, spec_path, wording, output):
    with open(spec_path, encoding='utf8') as file:
        spec = json.load(file)
    name = os.path.basename(spec_path)[: -len('.spec.json')]
    # Without a source the document starts empty and the spec draws all of it: an original
    # laid out in text frames, which LibreOffice cannot read back as a table.
    source = uno.systemPathToFileUrl(f'{ROOT}/originals/{spec["source"]}') if spec.get('source') \
        else 'private:factory/swriter'
    document = desktop.loadComponentFromURL(source, '_blank', 0, (prop('Hidden', True),))
    DRAWN_SIZES.clear()
    try:
        problems = []
        for replacement in spec['replacements']:
            count = apply(document, replacement)
            if count < replacement.get('min', 1):
                label = replacement.get('find') or f'/{replacement["pattern"]}/'
                problems.append(f'{label!r} found {count} times, expected at least {replacement.get("min", 1)}')
        if spec.get('header'):
            build_header(document, spec['header'])
        strip_spacing(document)
        if 'answers' in KINDS[spec.get('kind', 'decision')]:
            join_typed_answers(document, KINDS[spec['kind']])
        for definition in spec.get('tables', []):
            rebuild_table(document, definition)
        rules = wording_replacements(wording, document_words(document))
        fixes = sum(apply(document, replacement) for replacement in rules)
        removed = typeset(document, spec.get('kind', 'decision'), spec.get('emptyParagraphs') == 'shrink')
        # A table that still does not fit at the small print, by its place in the body.
        body_tables = [item for item in _elements(document.Text) if item.supportsService('com.sun.star.text.TextTable')]
        for index, size in spec.get('tableSizes', {}).items():
            for cell_name in body_tables[int(index)].getCellNames():
                cell = body_tables[int(index)].getCellByName(cell_name)
                cell.LeftBorderDistance = 50
                cell.RightBorderDistance = 50
                cursor = cell.createTextCursor()
                cursor.gotoEnd(True)
                cursor.CharHeight = size
                for paragraph, _ in paragraphs(cell):
                    paragraph.CharHeight = size
        # After the typesetting, which would flatten the room left for signatures.
        sides = None
        if isinstance(spec.get('handover'), dict):
            # The same block under other words: "Am predat", "Am primit și aprobat".
            sides = tuple((spec['handover'].get(side, list(default[0])),) + default[1:]
                          for side, default in zip(('provider', 'client'), HANDOVER))
        if spec.get('handover') and not replace_handover(document, sides):
            problems.append('the hand-over block was not found')
        if problems:
            raise RuntimeError('; '.join(problems))
        os.makedirs(f'{ROOT}/{output}', exist_ok=True)
        target = f'{ROOT}/{output}/{name}.docx'
        document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
        sweep(target)
        print(f'{name}: {fixes} wording fixes, {removed} empty paragraphs removed')
    finally:
        document.close(True)


def main():
    # import_templates.py [--out DIR] [name ...]
    # `--out` writes next to the real templates, to try a change of style before adopting it.
    arguments = sys.argv[1:]
    output, names = 'templates', []
    while arguments:
        argument = arguments.pop(0)
        if argument == '--out':
            output = arguments.pop(0)
        else:
            names.append(argument)
    specs = sorted(glob.glob(f'{ROOT}/originals/*.spec.json'))
    if names:
        specs = [path for path in specs if os.path.basename(path)[: -len('.spec.json')] in names]
    if not specs:
        sys.exit('No specs in originals/. They live outside the repository; see docs/document-engine.md.')
    with open(f'{ROOT}/tools/import/wording.ro.json', encoding='utf8') as file:
        wording = json.load(file)

    process, desktop = start_office()
    failed = False
    try:
        for path in specs:
            try:
                import_template(desktop, path, wording, output)
            except Exception as error:  # noqa: BLE001 - report every document, then fail
                failed = True
                print(f'{os.path.basename(path)}: FAILED: {error!r}')
                traceback.print_exc()
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
