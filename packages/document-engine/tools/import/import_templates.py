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
from com.sun.star.style.BreakType import PAGE_AFTER, PAGE_BEFORE
from com.sun.star.style.PageStyleLayout import ALL as ALL_PAGES
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT
from com.sun.star.table import BorderLine2
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK
from com.sun.star.text.HoriOrientation import FULL as FULL_WIDTH

ROOT = '/work'
PORT = 2002
# One folder per documentation set (ADR 016), the same under `originals/` and `templates/`: a
# spec in `originals/fire/` reads its original there and writes to `templates/fire/`.
SET_FOLDERS = ('', 'fire')

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
                     r'^Tabel(ul)? \d+', r'^Loc de munc[aă] / Post de lucru:'],
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
# Who signs for the provider, where a spec names someone other than the legal representative:
# the fire-safety set is signed by the technician (ADR 016).
PROVIDER_SIGNERS = {
    'representative': ('{{provider.representativeName}}', '{{provider.representativeRole}} al {{provider.legalName}}'),
    'fireSafetyTechnician': ('{{fireSafetyTechnician.name}}', 'Cadru tehnic PSI al {{provider.legalName}}'),
}
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


def rebuild_table(document, definition, following=None):
    """Replaces a table of the body with one drawn from a definition, where the original is
    beyond tidying: columns a letter wide, cells aligned with tabs. `rows` holds the cells as
    text or as {text, colspan, rowspan}; a cell another one spans over is an empty string.
    With `following`, draws the table before that paragraph instead."""
    body = list(_elements(document.Text))
    if following is not None:
        pass
    elif 'replaceTable' in definition:
        tables = [item for item in body if item.supportsService('com.sun.star.text.TextTable')]
        old = tables[definition['replaceTable']]
        if definition.get('remove'):
            # A table the document does not get at all: the grid of risks against body parts,
            # copy-pasted unchanged between clients (ADR 011).
            old.dispose()
            return None
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
            counts = collections.Counter(int(cell_name[1:]) - 1 for cell_name in names)
            definition = dict(definition)
            if definition.get('headingFromColumn') is not None:
                # A column with one value for the whole table says it once, above the table:
                # "Loc de muncă / Post de lucru: …". Drop the column with `dropColumns`.
                column = definition['headingFromColumn']
                values = [row[column] for index, row in sorted(rows_read.items())
                          if index >= definition.get('headerRows', 1) and row[column]
                          and index not in definition.get('dropRows', [])]
                lines = [line.strip() for line in values[0].split('\n') if line.strip()]
                value = re.sub(definition.get('headingStrip', '^$'), '', ', '.join(lines).replace(', /, ', ' / '))
                definition['heading'] = f'{rows_read[0][column]}: {value}'
            for dropped in sorted(definition.get('dropColumns', []), reverse=True):
                # A column that cannot stay true: page numbers typed by hand.
                for row in rows_read.values():
                    del row[dropped]
            for dropped in definition.get('dropRows', []):
                # A row that numbers the columns means nothing once one of them is gone.
                del rows_read[dropped]
            definition['rows'] = [rows_read[index] for index in sorted(rows_read)]
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
    elif 'replaceFrame' in definition:
        frame = frame_texts(document)[definition['replaceFrame']]
        anchor = frame.getAnchor()
        following = next(item for item in body if item.supportsService('com.sun.star.text.Paragraph')
                         and document.Text.compareRegionStarts(item.getStart(), anchor.getStart()) >= 0
                         and document.Text.compareRegionEnds(item.getEnd(), anchor.getEnd()) <= 0)
        frame.dispose()
    else:
        # A table of its own, at the end.
        following = body[-1]

    text = document.Text
    cursor = text.createTextCursorByRange(following.getStart())
    if definition.get('loop'):
        # Loop tags alone in paragraphs of their own, around the heading and the table, are what
        # makes the engine repeat both per item: one section per job position.
        text.insertString(cursor, f'{{{{#{definition["loop"]}}}}}', False)
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
    if definition.get('heading'):
        text.insertString(cursor, definition['heading'], False)
        text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        heading = list(_elements(text))[list(_elements(text)).index(following) - 1]
        heading.CharWeight = 150
        heading.ParaAdjust = CENTER
        heading.ParaKeepTogether = True
        heading.NumberingIsNumber = False
        if definition.get('pageBreak'):
            heading.BreakType = PAGE_BEFORE
        following.CharWeight = 100

    rows = definition['rows']
    columns = len(definition['widths'])
    table = document.createInstance('com.sun.star.text.TextTable')
    table.initialize(len(rows), columns)
    text.insertTextContent(text.createTextCursorByRange(following.getStart()), table, False)
    table.HoriOrient = FULL_WIDTH
    if definition.get('loop'):
        closing = text.createTextCursorByRange(following.getStart())
        text.insertString(closing, f'{{{{/{definition["loop"]}}}}}', False)
        text.insertControlCharacter(closing, PARAGRAPH_BREAK, False)
    if definition.get('after'):
        # Said once after the table, and after every repetition of it: a note that would be
        # left alone on a page as a last row of the table.
        trailing = text.createTextCursorByRange(following.getStart())
        write_paragraph(text, trailing, definition['after'], adjust=LEFT, above=6, first=True)
        text.insertControlCharacter(trailing, PARAGRAPH_BREAK, False)
    # A register may run over pages; a form stays whole. A heading with cells merged downwards
    # is not repeated on the next page: LibreOffice draws the repeat over the rows under it.
    spans_rows = any(isinstance(cell, dict) and cell.get('rowspan', 1) > 1 for row in definition['rows'] for cell in row)
    flags = ('Split' if definition.get('split') else '') + \
        ('Once' if spans_rows or not definition.get('headerRows', 1) else '') + \
        ('Loop' if definition.get('loop') else '')
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
            # Centred in its row, or from the top where a row of long text runs over pages.
            cell.VertOrient = 1 if definition.get('top') and row_index >= definition.get('headerRows', 1) else 2
            lines = cell_definition['text'].split('\n')
            cell_cursor = cell.createTextCursor()
            for index, line in enumerate(lines):
                aligned = cell_definition.get('align')
                write_paragraph(cell, cell_cursor, line, size=size,
                                bold=row_index < header_rows or column_index in bold_columns
                                or cell_definition.get('bold', False),
                                # A row whose paragraphs keep with the next stays on the page of
                                # the row below it: with every row but the last marked, a short
                                # table stays whole and a long one never leaves its last row alone.
                                keep=row_index in definition.get('keepWithNext', []),
                                adjust={'left': LEFT, 'center': CENTER}[aligned] if aligned else
                                LEFT if column_index in left and row_index >= header_rows
                                and not re.fullmatch(r'-+', line) else CENTER,
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
    if definition.get('wholeRows'):
        # A row of a few lines reads better moved to the next page than cut in two.
        for row in table.getRows():
            row.IsSplitAllowed = False
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
    for row_number, height in definition.get('rowHeights', {}).items():
        # After `rowHeight`, which it overrides for one row: the blank space of a form, or a
        # line to write on.
        padding = max(0, round((height * 100 - size * POINT * 1.2) / 2))
        for cell_name in table.getCellNames():
            if re.sub(r'^[A-Za-z]+', '', cell_name).split('.')[0] == row_number:
                cell = table.getCellByName(cell_name)
                cell.TopBorderDistance = padding
                cell.BottomBorderDistance = padding
    return table


def replace_handover(document, sides=None):
    """Returns whether it found the hand-over lines."""
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
    'fireSafetyTechnician': ['{{provider.legalName}}', 'Cadru tehnic PSI', '{{fireSafetyTechnician.name}}'],
    'client': ['{{client.legalName}}', '{{client.representativeRole}}', '{{client.representativeName}}'],
}


def build_header(document, details):
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
    cursor.CharHeightComplex = BRANDING_SIZE
    cursor.CharColor = BRANDING_COLOR
    cursor.CharWeight = 100
    cursor.CharLocale = ROMANIAN
    cursor.ParaAdjust = CENTER
    cursor.ParaTopMargin = round(3 * POINT)
    cursor.ParaBottomMargin = 0
    cursor.ParaLeftMargin = 0
    cursor.ParaRightMargin = 0
    cursor.ParaFirstLineIndent = 0


def snap_list_indent(paragraph, tier=None):
    """Moves a list item to the nearest tier, or to `tier`, in the list's own definition, and
    drops the paragraph indents laid over it. Articles ("Art. 1.") keep their flush-left form."""
    if paragraph.ListLabelString.startswith('Art.'):
        return
    numbering = paragraph.NumberingRules
    level = paragraph.NumberingLevel
    properties = list(numbering.getByIndex(level))
    current = paragraph.ParaLeftMargin or next(
        (item.Value for item in properties if item.Name == 'IndentAt'), 0)
    if tier is None:
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
    # Its style's too: the originals' "HTML Preformatted" sets one every 16 mm.
    stops = paragraph.ParaTabStops
    if any(0 < stop.Position < tier for stop in stops):
        paragraph.ParaTabStops = tuple(stop for stop in stops if stop.Position >= tier)


def matches(text, patterns):
    return any(re.search(pattern, text) for pattern in patterns)


def kind_rules(spec):
    """The rules of the spec's kind, with the patterns the spec adds to them."""
    rules = dict(KINDS[spec.get('kind', 'decision')])
    for key, plural in (('title', 'titles'), ('subtitle', 'subtitles'), ('headings', 'headings'),
                        ('answers', 'answers')):
        if plural in spec:
            rules[key] = rules.get(key, []) + spec[plural]
    return rules


def typeset(document, rules, shrink_empty=False, subheadings=()):
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
                    # In the list's definition, not on the paragraph: an indent laid over a list
                    # leaves its tab behind the label, which then touches the text.
                    snap_list_indent(paragraph, LIST_TIERS[1])
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
        elif matches(text, subheadings):
            paragraph.CharWeight = 150
            paragraph.ParaTopMargin = round(12 * POINT)
            paragraph.ParaKeepTogether = True
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
                if 'Loop' in element.Name:
                    # Repeated per item, the heading comes right after the previous item's table.
                    before.ParaTopMargin = round(12 * POINT)
        if index + 1 < len(elements) and elements[index + 1].supportsService('com.sun.star.text.Paragraph'):
            after = elements[index + 1]
            if after.getString().strip():
                after.ParaTopMargin = max(after.ParaTopMargin, round(6 * POINT))
            # A loop's closing tag leaves no trace when merged: the paragraph after it is what
            # follows the table, and gets the room.
            if after.getString().strip().startswith('{{/') and index + 2 < len(elements) \
                    and elements[index + 2].supportsService('com.sun.star.text.Paragraph'):
                elements[index + 2].ParaTopMargin = max(elements[index + 2].ParaTopMargin, round(12 * POINT))

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
    closing = list(_elements(document.Text))
    if len(closing) > 1 and closing[-1].getString().strip().startswith('{{/'):
        # Merged, loop tags leave nothing behind, and a table inside or before them would end
        # the file.
        cursor = document.Text.createTextCursorByRange(closing[-1].getEnd())
        document.Text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        end = list(_elements(document.Text))[-1]
        end.CharHeight = 1.0
        end.ParaTopMargin = 0
        end.ParaBottomMargin = 0
        end.ParaKeepTogether = False
    return removed


def _elements(text):
    elements = text.createEnumeration()
    while elements.hasMoreElements():
        yield elements.nextElement()


# Fonts LibreOffice writes as the defaults of every file it saves. No text uses them, and a
# viewer that lacks them warns about substitutes.
OFFICE_DEFAULT_FONTS = re.compile(r'"(Liberation (Serif|Sans)|Noto (Serif|Sans)( Mono)? CJK SC|Noto Sans Devanagari)"')


def inline_drawing(match):
    """A picture that floats above and below the text stands on a line of its own anyway. As
    a character it stays where it is, and the in-app editor can lay the page out."""
    anchor = match.group(0)
    if '<wp:wrapTopAndBottom' not in anchor:
        return anchor
    # Only one that already sits at the left of its column, or it would jump there.
    horizontal = re.search(r'<wp:positionH\b.*?</wp:positionH>', anchor, flags=re.S).group(0)
    offset = re.search(r'<wp:posOffset>(-?\d+)</wp:posOffset>', horizontal)
    if not offset or abs(int(offset.group(1))) > 360000:  # 10 mm, in EMU
        return anchor
    extent = re.search(r'<wp:extent [^>]*/>', anchor).group(0)
    rest = anchor[anchor.index('<wp:docPr'):].replace('</wp:anchor>', '</wp:inline>')
    return f'<wp:inline distT="0" distB="0" distL="0" distR="0">{extent}<wp:effectExtent l="0" t="0" r="0" b="0"/>{rest}'


# A heading, the paragraph that introduces a table, and a loop tag between them that disappears
# once merged. A longer run kept together moves to the next page whole: the import kept
# everything from a heading to its table, and left pages two thirds empty before a long one.
KEEP_CHAIN = 3

BLOCK_TAG = re.compile(r'<(/?)w:(p|tbl)\b[^>]*?(/?)>')
KEEP_NEXT = re.compile(r'<w:keepNext(?: w:val="(\w+)")?/>')
KEEP_NEXT_OFF = '<w:keepNext w:val="false"/>'
KEEP_NEXT_ON = '<w:keepNext/>'
LOOP_TAG_OR_NOTHING = re.compile(r'(\{\{[#/^][^}]*\}\})?')
CHAPTER = re.compile(r'(sub)?capitolul\b', re.I)
TYPED_LIST_ITEM = re.compile(r'([a-z]\)|\d{1,2}[.)]\s|[-–•]\s)')


def keeps_next(properties):
    """True or False where `properties` say so, None where they leave it to the style."""
    match = KEEP_NEXT.search(properties)
    return None if match is None else match.group(1) not in ('false', '0', 'off')


def styles_keeping_next(styles):
    """The paragraph styles that keep with the next paragraph, through what they are based on,
    and the one a paragraph without a style takes."""
    definitions, default = {}, None
    for match in re.finditer(r'<w:style\b([^>]*)>(.*?)</w:style>', styles, flags=re.S):
        attributes, body = match.groups()
        if 'w:type="paragraph"' not in attributes:
            continue
        name = re.search(r'w:styleId="([^"]+)"', attributes).group(1)
        based_on = re.search(r'<w:basedOn w:val="([^"]+)"', body)
        properties = re.search(r'<w:pPr>.*?</w:pPr>', body, flags=re.S)
        definitions[name] = (based_on and based_on.group(1),
                             keeps_next(properties.group(0)) if properties else None)
        if re.search(r'w:default="(1|true)"', attributes):
            default = name
    defaults = re.search(r'<w:pPrDefault>.*?</w:pPrDefault>', styles, flags=re.S)

    def resolve(name, seen=()):
        if name not in definitions or name in seen:
            return bool(defaults and keeps_next(defaults.group(0)))
        based_on, own = definitions[name]
        if own is not None:
            return own
        return resolve(based_on, seen + (name,)) if based_on else resolve(None)

    return {name for name in definitions if resolve(name)}, default


def body_blocks(xml):
    """The top-level paragraphs and tables of a part, as (kind, start, end). A paragraph inside
    a table or a text box belongs to the block around it."""
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
    """A paragraph's own `w:pPr`, not one of a text box inside it, or ''."""
    match = re.match(r'<w:p\b[^>]*>\s*(<w:pPr>.*?</w:pPr>)', paragraph, flags=re.S)
    return match.group(1) if match else ''


def set_keep_next(paragraph, element):
    properties = own_properties(paragraph)
    if paragraph.endswith('/>') and '</w:p>' not in paragraph:
        return f'{paragraph[:-2]}><w:pPr>{element}</w:pPr></w:p>'
    if not properties:
        opening = re.match(r'<w:p\b[^>]*>', paragraph).group(0)
        return f'{opening}<w:pPr>{element}</w:pPr>{paragraph[len(opening):]}'
    if KEEP_NEXT.search(properties):
        changed = KEEP_NEXT.sub(element, properties, count=1)
    else:
        # Second in the schema's order, after the style.
        style = re.match(r'<w:pPr>(<w:pStyle\b[^>]*/>)?', properties)
        changed = properties[:style.end()] + element + properties[style.end():]
    return paragraph.replace(properties, changed, 1)


def paragraph_keeps_next(paragraph, keeping, default):
    """Counts what the paragraph says and, where it says nothing, what its style says: the
    Heading styles of the imported files keep every article with the next one."""
    properties = own_properties(paragraph)
    own = keeps_next(properties)
    style = re.search(r'<w:pStyle w:val="([^"]+)"', properties)
    return own if own is not None else (style.group(1) if style else default) in keeping


def paragraph_text(paragraph):
    return ''.join(re.findall(r'<w:t\b[^>]*>([^<]*)</w:t>', paragraph)).strip()


def is_list_item(paragraph):
    # The originals typed many of their lists' letters and dashes by hand.
    return '<w:numPr>' in own_properties(paragraph) or TYPED_LIST_ITEM.match(paragraph_text(paragraph)) is not None


def keep_lead_ins(xml, styles):
    """A line that introduces a list ("Tipuri de pansamente:") keeps with the list's first item."""
    keeping, default = styles_keeping_next(styles)
    blocks = list(body_blocks(xml))
    lead_ins = [(start, end) for (kind, start, end), (following, item_start, item_end) in zip(blocks, blocks[1:])
                if kind == following == 'p'
                and paragraph_text(xml[start:end]).endswith(':')
                and is_list_item(xml[item_start:item_end])
                and not paragraph_keeps_next(xml[start:end], keeping, default)]
    for start, end in reversed(lead_ins):
        xml = xml[:start] + set_keep_next(xml[start:end], KEEP_NEXT_ON) + xml[end:]
    return xml


def cap_keep_chains(xml, styles):
    keeping, default = styles_keeping_next(styles)
    run, cuts = [], []

    def close():
        if len(run) > KEEP_CHAIN:
            said = [paragraph_text(xml[start:end]) for start, end in run]
            kept = [False] * len(run)

            def keep(index):
                left = next((count for count in range(index) if not kept[index - 1 - count]), index)
                after = len(run) - 1 - index
                right = next((count for count in range(after) if not kept[index + 1 + count]), after)
                if kept[index] or left + 1 + right > KEEP_CHAIN:
                    return
                kept[index] = True
                # It takes no room, and the keep reaches the paragraph after it only through it.
                if index < len(run) - 1 and LOOP_TAG_OR_NOTHING.fullmatch(said[index + 1]):
                    keep(index + 1)

            # Cut down to its last three, the run left a chapter heading, a line that introduces
            # a list ("Dacă victima prezintă:") or the article that opens it ("(1) Mijloacele de
            # semnalizare rutieră sunt") alone at the foot of a page.
            last = len(run) - 1
            for index in [index for index, text in enumerate(said) if text.endswith(':') or CHAPTER.match(text)] \
                    + [0, last, last - 1, last - 2, 1]:
                keep(index)
            cuts.extend(span for span, keeps in zip(run, kept) if not keeps)
        run.clear()

    for kind, start, end in body_blocks(xml):
        if kind == 'p' and paragraph_keeps_next(xml[start:end], keeping, default):
            run.append((start, end))
        else:
            close()
    close()
    for start, end in reversed(cuts):
        xml = xml[:start] + set_keep_next(xml[start:end], KEEP_NEXT_OFF) + xml[end:]
    return xml


RUN_PROPERTIES = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
                  'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
                  'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs',
                  'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs',
                  'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath']
BRANDING_RUN = {
    'color': f'<w:color w:val="{BRANDING_COLOR:06X}"/>',
    'sz': f'<w:sz w:val="{round(BRANDING_SIZE * 2)}"/>',
    'szCs': f'<w:szCs w:val="{round(BRANDING_SIZE * 2)}"/>',
}


def set_run_property(properties, name, element):
    """Writes one child of a `w:rPr`, where the schema orders it: Word refuses a file whose
    run properties are out of order."""
    existing = re.compile(rf'<w:{name}\b[^>]*/>')
    if existing.search(properties):
        return existing.sub(element, properties, count=1)
    rank = RUN_PROPERTIES.index(name)
    for child in re.finditer(r'<w:(\w+)\b', properties):
        if child.group(1) in RUN_PROPERTIES and RUN_PROPERTIES.index(child.group(1)) > rank:
            return properties[:child.start()] + element + properties[child.start():]
    return properties + element


def style_branding_properties(match):
    inner = match.group(1)
    for name, element in BRANDING_RUN.items():
        inner = set_run_property(inner, name, element)
    return f'<w:rPr>{inner}</w:rPr>'


def style_branding_run(match):
    run = match.group(0)
    if '<w:rPr>' in run:
        return re.sub(r'<w:rPr>(.*?)</w:rPr>', style_branding_properties, run, count=1, flags=re.S)
    opening = re.match(r'<w:r\b[^>]*>', run).group(0)
    return f'{opening}<w:rPr>{"".join(BRANDING_RUN.values())}</w:rPr>{run[len(opening):]}'


def style_branding(xml):
    """The branding line is set small and grey; the import's pass over every character of a
    footer sets it back to the footer's size and to no colour."""
    def paragraph(match):
        text = ''.join(re.findall(r'<w:t\b[^>]*>([^<]*)</w:t>', match.group(0)))
        if '{{#branding}}' not in text:
            return match.group(0)
        styled = re.sub(r'<w:pPr>.*?</w:pPr>',
                        lambda mark: re.sub(r'<w:rPr>(.*?)</w:rPr>', style_branding_properties,
                                            mark.group(0), flags=re.S),
                        match.group(0), count=1, flags=re.S)
        return re.sub(r'<w:r\b[^>]*>(?:(?!</w:r>).)*</w:r>', style_branding_run, styled, flags=re.S)
    return re.sub(r'<w:p(?:\s[^>]*)?(?<!/)>(?:(?!</w:p>).)*</w:p>', paragraph, xml, flags=re.S)


# A paragraph holding only this marker becomes a page break of its own. A break set on a
# paragraph is saved as a break run at the end of the paragraph before it, which may be a loop
# tag's: inside a section of its own, the break can be left out for one item of a loop.
PAGE_BREAK_MARKER = '@@page-break@@'
PAGE_BREAK_PARAGRAPH = re.compile(
    rf'<w:p\b(?:(?!</w:p>).)*?<w:t\b[^>]*>{PAGE_BREAK_MARKER}</w:t>(?:(?!</w:p>).)*?</w:p>', re.S)
PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def sweep(path):
    """A last pass over the saved file, for what LibreOffice's API reaches in most places and
    not in all, or not at all: a dead link that survives clearing, an empty paragraph it writes
    as justified though its own model says otherwise, a picture floating between two lines,
    and its own fonts as the defaults of the styles. Then three rules every template keeps: a
    line ending in ":" keeps with the list item after it, no run of paragraphs kept with the
    next longer than `KEEP_CHAIN`, and the branding line small and grey. Safe to run again."""
    with zipfile.ZipFile(path) as archive:
        entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
        styles = archive.read('word/styles.xml').decode('utf8')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item, data in entries:
            if re.fullmatch(r'word/(document|header\d*|footer\d*)\.xml', item.filename):
                xml = data.decode('utf8')
                xml = re.sub(r'<w:hyperlink\b[^>]*>(.*?)</w:hyperlink>', r'\1', xml, flags=re.S)
                xml = xml.replace('<w:jc w:val="both"/>', '<w:jc w:val="left"/>')
                xml = re.sub(r'<wp:anchor .*?</wp:anchor>', inline_drawing, xml, flags=re.S)
                # LibreOffice writes the page fields as "PAGE \* ARABIC", the default format
                # spelled out. The in-app editor evaluates a page field only when its code is
                # the bare keyword; with the switch it paints the result cached in the file, the
                # last page's number, on every page.
                xml = re.sub(r'(<w:instrText[^>]*>\s*(?:PAGE|NUMPAGES|SECTIONPAGES))\s+\\\* ARABIC\s*(?=<)', r'\1 ', xml)
                # A section that restarts its page numbers keeps the number the original had
                # there, and "Pag. X din Y" then counts wrong once the pages before it change.
                # The API's PageNumberOffset does not let go of it.
                xml = re.sub(r'(<w:pgNumType\b[^>]*?) w:start="\d+"', r'\1', xml)
                if item.filename == 'word/document.xml':
                    xml = cap_keep_chains(keep_lead_ins(xml, styles), styles)
                    xml = PAGE_BREAK_PARAGRAPH.sub(PAGE_BREAK, xml)
                elif item.filename.startswith('word/footer'):
                    xml = style_branding(xml)
                data = xml.encode('utf8')
            elif item.filename == 'word/styles.xml':
                data = OFFICE_DEFAULT_FONTS.sub(f'"{FONT}"', data.decode('utf8')).encode('utf8')
            archive.writestr(item, data)


ARTICLES = 'Articles'
ARTICLE_LABEL = 'ArticleLabel'
TYPED_ARTICLE = re.compile(r'^[\s\u00a0]*Art\.[\s\u00a0]*\d+[\s\u00a0]*\.[\s\u00a0]*')


def number_articles(document):
    """Article labels, typed ("Art. 3.") or numbered by a list of the original's own ("Art.3"),
    become one list, as the other decisions' are: an article deleted or added in the editor
    leaves no gap, and a label the original typed twice ("Art. 6." after "Art. 7.") is numbered
    right. Returns how many it found."""
    characters = document.StyleFamilies.getByName('CharacterStyles')
    label = document.createInstance('com.sun.star.style.CharacterStyle')
    characters.insertByName(ARTICLE_LABEL, label)
    label.CharWeight = 150
    label.CharFontName = FONT
    label.CharHeight = BODY_SIZE
    numbering = document.createInstance('com.sun.star.style.NumberingStyle')
    document.StyleFamilies.getByName('NumberingStyles').insertByName(ARTICLES, numbering)
    rules = numbering.NumberingRules
    level = {item.Name: item for item in rules.getByIndex(0)}
    for name, value in (
        ('NumberingType', 4),  # Arabic numerals
        # Not Prefix and Suffix, which this version of the office reads and then drops on export.
        ('ListFormat', 'Art. %1%.'),
        ('CharStyleName', ARTICLE_LABEL),
        ('LabelFollowedBy', 1),  # a space
        ('IndentAt', 0),
        ('FirstLineIndent', 0),
        ('ListtabStopPosition', 0),
    ):
        level[name] = prop(name, value)
    uno.invoke(rules, 'replaceByIndex',
               (0, uno.Any('[]com.sun.star.beans.PropertyValue', tuple(level.values()))))
    numbering.NumberingRules = rules
    found = 0
    for element in list(_elements(document.Text)):
        if not element.supportsService('com.sun.star.text.Paragraph'):
            continue
        typed = TYPED_ARTICLE.match(element.getString())
        listed = element.NumberingIsNumber and re.fullmatch(r'Art\.\s*\d+\.?', element.ListLabelString or '')
        if not typed and not listed:
            continue
        if typed:
            cursor = document.Text.createTextCursorByRange(element.getStart())
            cursor.goRight(len(typed.group(0)), True)
            cursor.setString('')
        element.NumberingStyleName = ARTICLES
        element.NumberingLevel = 0
        element.ParaLeftMargin = 0
        element.ParaFirstLineIndent = 0
        found += 1
    return found


def cut_tail(document, pattern):
    """Removes everything from the first paragraph matching `pattern` to the end of the body:
    the chapter a document no longer carries, annexed as separate files instead (ADR 012)."""
    text = document.Text
    elements = list(_elements(text))
    start = next((index for index, element in enumerate(elements)
                  if element.supportsService('com.sun.star.text.Paragraph')
                  and re.search(pattern, element.getString())), None)
    if start is None:
        raise RuntimeError(f'cut: no paragraph matches {pattern!r}')
    for element in elements[start:]:
        if element.supportsService('com.sun.star.text.TextTable'):
            element.dispose()
    cursor = text.createTextCursorByRange(elements[start].getStart())
    cursor.gotoEnd(True)
    cursor.setString('')
    return len(elements) - start


def append_paragraphs(document, items):
    """Writes paragraphs at the end of the body, into the empty paragraph a cut leaves."""
    text = document.Text
    cursor = text.createTextCursor()
    cursor.gotoEnd(False)
    first = cursor.getString() == '' and text.getString().endswith('\n') is False and \
        list(_elements(text))[-1].getString() == ''
    for item in items:
        write_paragraph(text, cursor, item['text'], bold=item.get('bold', False),
                        italic=item.get('italic', False), adjust=LEFT,
                        above=item.get('above', 0), below=item.get('below', 6),
                        keep=item.get('keep', False), first=first)
        first = False


def clear_section(document, section, marker):
    """Removes the body from the paragraph matching `from`, the first after the one matching
    `after` where there is one, up to the one matching `to`, or to the end without one, and
    leaves `marker` in a paragraph where it was, for `fill_section`. The risk assessment's
    chapters about the unit and its evaluations, and the prevention plan's tables, are
    rewritten this way around the merge context's loops (ADR 015)."""
    text = document.Text
    elements = list(_elements(text))

    def find(pattern, start):
        return next((index for index in range(start, len(elements))
                     if elements[index].supportsService('com.sun.star.text.Paragraph')
                     and re.search(pattern, elements[index].getString())), None)

    after = find(section['after'], 0) if section.get('after') else -1
    if after is None:
        raise RuntimeError(f'section: no paragraph matches {section["after"]!r}')
    start = find(section['from'], after + 1)
    if start is None:
        raise RuntimeError(f'section: no paragraph matches {section["from"]!r}')
    end = find(section['to'], start + 1) if section.get('to') else len(elements)
    if end is None:
        raise RuntimeError(f'section: no paragraph matches {section["to"]!r}')
    first, last = elements[start], elements[end - 1]

    # A frame anchored in the range would move to the paragraph left. One anchored as a
    # character goes with its text.
    for frames in (document.TextFrames, document.GraphicObjects):
        for frame in [frames.getByIndex(index) for index in range(frames.getCount())]:
            try:
                anchor = frame.getAnchor()
                inside = frame.AnchorType.value != 'AS_CHARACTER' \
                    and text.compareRegionStarts(first.getStart(), anchor.getStart()) >= 0 \
                    and text.compareRegionEnds(anchor.getEnd(), last.getEnd()) >= 0
            except Exception:  # noqa: BLE001 - anchored in a header, a frame or a table cell
                inside = False
            if inside:
                frame.dispose()
    for element in elements[start:end]:
        if element.supportsService('com.sun.star.text.TextTable'):
            element.dispose()
    elements = list(_elements(text))
    start = find(section['from'], after + 1)
    end = find(section['to'], start + 1) if section.get('to') else len(elements)
    cursor = text.createTextCursorByRange(elements[start].getStart())
    cursor.gotoRange(elements[end - 1].getEnd(), True)
    cursor.setString(marker)
    # The paragraph left keeps the list and the style of the first one removed, which every
    # paragraph written over it would inherit.
    cursor.ParaStyleName = 'Standard'
    cursor.NumberingStyleName = ''


def fill_section(document, marker, content):
    """Writes `content` over the paragraph holding `marker`: paragraphs as `append` writes
    them, with `indent`, `pageBefore` and `pageAfter`, and tables drawn from a definition with
    `rows` ({"table": …})."""
    text = document.Text
    holder = next(element for element in _elements(text)
                  if element.supportsService('com.sun.star.text.Paragraph') and element.getString() == marker)
    cursor = text.createTextCursorByRange(holder.getStart())
    cursor.gotoEndOfParagraph(True)
    cursor.setString('')
    tables = []
    for index, item in enumerate(content):
        if 'table' in item:
            tables.append((f'{marker} table {index}', item['table']))
            write_paragraph(text, cursor, tables[-1][0], adjust=LEFT, below=0, first=index == 0)
            cursor.ParaLeftMargin = 0
            cursor.BreakType = NO_BREAK
            continue
        write_paragraph(text, cursor, item['text'], bold=item.get('bold', False),
                        italic=item.get('italic', False), adjust=LEFT,
                        above=item.get('above', 0), below=item.get('below', 6),
                        keep=item.get('keep', False), first=index == 0)
        cursor.ParaLeftMargin = item.get('indent', 0)
        cursor.BreakType = PAGE_BEFORE if item.get('pageBefore') else \
            PAGE_AFTER if item.get('pageAfter') else NO_BREAK

    for table_marker, definition in tables:
        anchor = next(element for element in _elements(text)
                      if element.supportsService('com.sun.star.text.Paragraph')
                      and element.getString() == table_marker)
        rebuild_table(document, definition, following=anchor)
        set_text(anchor, '')
        flow = list(_elements(text))
        position = next(index for index, element in enumerate(flow)
                        if element.supportsService('com.sun.star.text.Paragraph')
                        and text.compareRegionStarts(element.getStart(), anchor.getStart()) == 0)
        # The paragraph stays only between two tables, which Word would otherwise save as one;
        # the next table may still be its marker, drawn on the next round.
        following = flow[position + 1] if position + 1 < len(flow) else None
        if following is not None and following.supportsService('com.sun.star.text.Paragraph') \
                and not following.getString().startswith(f'{marker} table '):
            text.removeTextContent(anchor)


def reloaded(desktop, document, name):
    """The same document, through a file and back. After a long range is removed, charts and
    formulas among it, LibreOffice fails to save the file once the document grows past where
    that range was, and says nothing more; a round trip drops whatever it kept."""
    path = f'/tmp/{name}.reloaded.docx'
    document.storeToURL(uno.systemPathToFileUrl(path), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    return desktop.loadComponentFromURL(uno.systemPathToFileUrl(path), '_blank', 0, (prop('Hidden', True),))


def clear_properties(document):
    """The author, company and title the original was saved with: the provider's staff and
    whoever wrote the file before them."""
    properties = document.DocumentProperties
    for name in ('Author', 'ModifiedBy', 'Title', 'Subject', 'Description', 'Generator'):
        setattr(properties, name, '')
    properties.Keywords = ()
    properties.Language = ROMANIAN
    custom = properties.getUserDefinedProperties()
    for item in custom.getPropertySetInfo().getProperties():
        custom.removeProperty(item.Name)


def draw_landscape(document):
    style = document.StyleFamilies.getByName('PageStyles').getByName(
        next(_elements(document.Text)).PageStyleName)
    style.IsLandscape = True
    style.Width, style.Height = 29700, 21000


def import_template(desktop, spec_path, wording, output):
    with open(spec_path, encoding='utf8') as file:
        spec = json.load(file)
    name = os.path.basename(spec_path)[: -len('.spec.json')]
    folder = os.path.dirname(spec_path)
    # Without a source the document starts empty and the spec draws all of it: an original
    # laid out in text frames, which LibreOffice cannot read back as a table.
    source = uno.systemPathToFileUrl(f'{folder}/{spec["source"]}') if spec.get('source') \
        else 'private:factory/swriter'
    document = desktop.loadComponentFromURL(source, '_blank', 0, (prop('Hidden', True),))
    DRAWN_SIZES.clear()
    try:
        problems = []
        if spec.get('content'):
            document.Text.setString('@@content@@')
            fill_section(document, '@@content@@', spec['content'])
        if spec.get('landscape'):
            draw_landscape(document)
        for replacement in spec['replacements']:
            count = apply(document, replacement)
            if count < replacement.get('min', 1):
                label = replacement.get('find') or f'/{replacement["pattern"]}/'
                problems.append(f'{label!r} found {count} times, expected at least {replacement.get("min", 1)}')
        if spec.get('cut'):
            cut_tail(document, spec['cut'])
        if spec.get('append'):
            append_paragraphs(document, spec['append'])
        markers = [f'@@section {index}@@' for index in range(len(spec.get('sections', [])))]
        for section, marker in zip(spec.get('sections', []), markers):
            clear_section(document, section, marker)
        if markers:
            document = reloaded(desktop, document, name)
        for section, marker in zip(spec.get('sections', []), markers):
            fill_section(document, marker, section['content'])
        if spec.get('header'):
            build_header(document, spec['header'])
        strip_spacing(document)
        if spec.get('articles') and number_articles(document) == 0:
            problems.append('no article label was found')
        parts = kind_rules(spec)
        if 'answers' in parts:
            join_typed_answers(document, parts)
        for definition in spec.get('tables', []):
            rebuild_table(document, definition)
        rules = wording_replacements(wording, document_words(document))
        fixes = sum(apply(document, replacement) for replacement in rules)
        # After the shared pass, for what its dictionary gets wrong in one document: it reads
        # every "afara" as the adverb, also in "din afara unității".
        for replacement in spec.get('corrections', []):
            count = apply(document, replacement)
            if count < replacement.get('min', 1):
                label = replacement.get('find') or f'/{replacement["pattern"]}/'
                problems.append(f'correction {label!r} found {count} times, expected at least {replacement.get("min", 1)}')
        removed = typeset(document, parts, spec.get('emptyParagraphs') == 'shrink',
                          spec.get('subheadings', []))
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
            signer = spec['handover'].get('signer')
            if signer:
                sides = ((sides[0][0],) + PROVIDER_SIGNERS[signer], sides[1])
        if spec.get('handover') and not replace_handover(document, sides):
            problems.append('the hand-over block was not found')
        if problems:
            raise RuntimeError('; '.join(problems))
        clear_properties(document)
        os.makedirs(f'{ROOT}/{output}', exist_ok=True)
        target = f'{ROOT}/{output}/{name}.docx'
        document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
        sweep(target)
        print(f'{name}: {fixes} wording fixes, {removed} empty paragraphs removed')
    finally:
        document.close(True)


def main():
    # import_templates.py [--out DIR] [--sweep] [name ...]
    # `--out` writes next to the real templates, to try a change of style before adopting it.
    # `--sweep` only runs the last pass over the templates that exist, covers included: a
    # change to it then needs no originals and no office.
    arguments = sys.argv[1:]
    output, names, sweep_only = 'templates', [], False
    while arguments:
        argument = arguments.pop(0)
        if argument == '--out':
            output = arguments.pop(0)
        elif argument == '--sweep':
            sweep_only = True
        else:
            names.append(argument)
    if sweep_only:
        for set_folder in SET_FOLDERS:
            for path in sorted(glob.glob(os.path.join(f'{ROOT}/{output}', set_folder, '*.docx'))):
                if not names or os.path.basename(path)[: -len('.docx')] in names:
                    sweep(path)
                    print(f'{os.path.basename(path)}: swept')
        return
    specs = [(set_folder, path) for set_folder in SET_FOLDERS
             for path in sorted(glob.glob(os.path.join(f'{ROOT}/originals', set_folder, '*.spec.json')))]
    if names:
        specs = [(set_folder, path) for set_folder, path in specs
                 if os.path.basename(path)[: -len('.spec.json')] in names]
    if not specs:
        sys.exit('No specs in originals/. They live outside the repository; see docs/document-engine.md.')
    with open(f'{ROOT}/tools/import/wording.ro.json', encoding='utf8') as file:
        wording = json.load(file)

    process, desktop = start_office()
    failed = False
    try:
        for set_folder, path in specs:
            try:
                import_template(desktop, path, wording, os.path.join(output, set_folder).rstrip('/'))
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
