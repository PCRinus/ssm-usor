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
import re
import subprocess
import sys
import time
import traceback

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.lang import Locale
from com.sun.star.style.BreakType import NONE as NO_BREAK
from com.sun.star.style.ParagraphAdjust import BLOCK, CENTER, LEFT
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
    'decision': {
        'title': [r'^DECIZIA$'],
        'subtitle': [r'^Nr\. ?:'],
        'headings': [r'^DECIDE ?:?$', r'^PROCES[ -]VERBAL'],
    },
}

SIGNATURE_BLOCK = [
    '{{client.legalName}}',
    '{{client.representativeRole}}',
    '{{client.representativeName}}',
]

LETTER = r'\p{L}'

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
        search.ReplaceString = replacement['replace'].replace('\\', '\\\\').replace('$', '\\$').replace('&', '\\&')
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
        for paragraph, _ in paragraphs(document.Text):
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


def wording_replacements(wording):
    """Phrases first, written against the original text; then whole words in three cases."""
    replacements = [dict(phrase, min=0) for phrase in wording['phrases']]
    for source, target in wording['words'].items():
        variants = {source: target, source.capitalize(): target[0].upper() + target[1:],
                    source.upper(): target.upper()}
        for find, replace in variants.items():
            replacements.append({
                # Never the inside of a longer word or of a placeholder's dotted name.
                'pattern': rf'(?<![{LETTER}{{])(?<![A-Za-z]\.){re.escape(find)}(?![{LETTER}}}])(?!\.[A-Za-z])',
                'replace': replace,
                'min': 0,
            })
    return replacements


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


def normalise_characters(document):
    """One font, one size, one language, no colour, over everything including the paragraph
    marks, which keep formatting of their own that a paragraph's properties do not reach. The
    originals also carry dead internal hyperlinks ("#"), which is where stray underlines and
    languages hide."""
    for text in texts(document):
        cursor = text.createTextCursor()
        cursor.gotoStart(False)
        cursor.gotoEnd(True)
        cursor.CharFontName = FONT
        cursor.CharFontNameAsian = FONT
        cursor.CharFontNameComplex = FONT
        cursor.CharHeight = BODY_SIZE
        cursor.CharHeightAsian = BODY_SIZE
        cursor.CharHeightComplex = BODY_SIZE
        cursor.CharLocale = ROMANIAN
        cursor.CharColor = -1

    # The dead internal links ("#") of the originals, one portion at a time. Writing an empty
    # address over everything does the opposite: it is saved as a link to nowhere around all
    # the text, which some viewers then draw as links.
    for paragraph, _ in paragraphs(document.Text):
        portions = paragraph.createEnumeration()
        while portions.hasMoreElements():
            portion = portions.nextElement()
            if portion.HyperLinkURL or portion.HyperLinkName or portion.HyperLinkTarget:
                for name in ('HyperLinkURL', 'HyperLinkName', 'HyperLinkTarget',
                             'UnvisitedCharStyleName', 'VisitedCharStyleName', 'CharStyleName'):
                    portion.setPropertyToDefault(name)
                portion.CharUnderline = 0
        cursor.CharUnderline = 0


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


def typeset(document, kind, align):
    rules = KINDS[kind]
    running_text = LEFT if align == 'left' else BLOCK

    # One page setup.
    page_styles = document.StyleFamilies.getByName('PageStyles')
    # Every page style, not only the ones in use: an unused one still exports its footer.
    for name in page_styles.getElementNames():
        if name:
            style = page_styles.getByName(name)
            for margin, value in MARGINS.items():
                setattr(style, margin, value)
            # An empty header or footer still takes its height off every page.
            # Shared, or the first and the even pages keep a header and footer of their own.
            for shared in ('HeaderIsShared', 'FooterIsShared', 'FirstIsShared'):
                setattr(style, shared, True)
            if style.HeaderIsOn and not style.HeaderText.getString().strip():
                style.HeaderIsOn = False
            if style.FooterIsOn and not style.FooterText.getString().strip():
                style.FooterIsOn = False

    # Empty paragraphs were the spacing. Paragraph margins replace them. One that carries a
    # page break hands it to the paragraph after it.
    body = []
    elements = document.Text.createEnumeration()
    while elements.hasMoreElements():
        body.append(elements.nextElement())
    removed = 0
    for index, element in enumerate(body[:-1]):
        if not element.supportsService('com.sun.star.text.Paragraph') or element.getString().strip():
            continue
        if element.createContentEnumeration('com.sun.star.text.TextContent').hasMoreElements():
            continue
        following = body[index + 1]
        if element.BreakType != NO_BREAK and following.supportsService('com.sun.star.text.Paragraph'):
            following.BreakType = element.BreakType
        document.Text.removeTextContent(element)
        removed += 1

    previous = None
    for element in [item for item in _elements(document.Text)]:
        if element.supportsService('com.sun.star.text.TextTable'):
            # A short table moves to the next page whole, with the paragraph that introduces it.
            element.RepeatHeadline = True
            element.HoriOrient = FULL_WIDTH
            if element.getRows().getCount() <= 25:
                element.Split = False
            element.TopMargin = round(6 * POINT)
            element.BottomMargin = round(6 * POINT)
            if previous is not None:
                previous.ParaKeepTogether = True
        previous = element if element.supportsService('com.sun.star.text.Paragraph') else None

    normalise_characters(document)

    # A list of one item is not a list: the lone "1." in front of it goes.
    items = {}
    for paragraph, _ in paragraphs(document.Text):
        if paragraph.NumberingIsNumber and paragraph.ListLabelString:
            items.setdefault(paragraph.ListId, []).append(paragraph)
    for listed in items.values():
        if len(listed) == 1 and not listed[0].ListLabelString.startswith('Art.'):
            listed[0].NumberingIsNumber = False
            listed[0].ParaLeftMargin = 0
            listed[0].ParaFirstLineIndent = 0

    for paragraph, in_table in paragraphs(document.Text):
        text = paragraph.getString().strip()
        # Again on the paragraph: its end mark keeps formatting of its own, out of a cursor's
        # reach, and that is where a stray language or size survives.
        paragraph.CharFontName = FONT
        paragraph.CharHeight = BODY_SIZE
        paragraph.CharLocale = ROMANIAN
        paragraph.CharColor = -1
        paragraph.ParaWidows = 2
        paragraph.ParaOrphans = 2
        if in_table:
            paragraph.ParaTopMargin = 0
            paragraph.ParaBottomMargin = 0
            continue

        paragraph.ParaTopMargin = 0
        paragraph.ParaBottomMargin = round(6 * POINT)
        # Running text and list items; titles, headings and the signature block centre below.
        paragraph.ParaAdjust = running_text
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
        elif paragraph.ParaLeftMargin:
            # A note inside a list: "(Preluare din H.G. 1425/2006 – Art. 98)".
            paragraph.ParaBottomMargin = round(2 * POINT)
        else:
            paragraph.ParaFirstLineIndent = 0

        if matches(text, rules['title']):
            paragraph.CharHeight = TITLE_SIZE
            paragraph.CharWeight = 150
            paragraph.ParaAdjust = CENTER
            paragraph.ParaBottomMargin = 0
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

    # Word wants a paragraph after a closing table. Small, it cannot be what spills onto an
    # empty last page.
    last = body[-1]
    if last.supportsService('com.sun.star.text.Paragraph') and not last.getString().strip():
        last.CharHeight = 1.0
        last.ParaTopMargin = 0
        last.ParaBottomMargin = 0
    return removed


def _elements(text):
    elements = text.createEnumeration()
    while elements.hasMoreElements():
        yield elements.nextElement()


def import_template(desktop, spec_path, wording, align, output):
    with open(spec_path, encoding='utf8') as file:
        spec = json.load(file)
    name = os.path.basename(spec_path)[: -len('.spec.json')]
    source = f'{ROOT}/originals/{spec["source"]}'
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(source), '_blank', 0, (prop('Hidden', True),))
    try:
        problems = []
        for replacement in spec['replacements']:
            count = apply(document, replacement)
            if count < replacement.get('min', 1):
                label = replacement.get('find') or f'/{replacement["pattern"]}/'
                problems.append(f'{label!r} found {count} times, expected at least {replacement.get("min", 1)}')
        strip_spacing(document)
        fixes = sum(apply(document, replacement) for replacement in wording)
        removed = typeset(document, spec.get('kind', 'decision'), align)
        if problems:
            raise RuntimeError('; '.join(problems))
        os.makedirs(f'{ROOT}/{output}', exist_ok=True)
        target = f'{ROOT}/{output}/{name}.docx'
        document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
        print(f'{name}: {fixes} wording fixes, {removed} empty paragraphs removed')
    finally:
        document.close(True)


def main():
    # import_templates.py [--align left|justify] [--out DIR] [name ...]
    # The alignment of running text is a house style choice; `--out` writes a variant next to
    # the real templates, to compare.
    arguments = sys.argv[1:]
    align, output, names = 'justify', 'templates', []
    while arguments:
        argument = arguments.pop(0)
        if argument == '--align':
            align = arguments.pop(0)
        elif argument == '--out':
            output = arguments.pop(0)
        else:
            names.append(argument)
    specs = sorted(glob.glob(f'{ROOT}/originals/*.spec.json'))
    if names:
        specs = [path for path in specs if os.path.basename(path)[: -len('.spec.json')] in names]
    if not specs:
        sys.exit('No specs in originals/. They live outside the repository; see docs/document-engine.md.')
    with open(f'{ROOT}/tools/import/wording.ro.json', encoding='utf8') as file:
        wording = wording_replacements(json.load(file))

    process, desktop = start_office()
    failed = False
    try:
        for path in specs:
            try:
                import_template(desktop, path, wording, align, output)
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
