"""The occupational safety set's chapters read like a book's. A chapter, a subchapter or an
annex title typed in capitals ("CAPITOLUL II. PREZENTAREA METODEI") reads in sentence case
("Capitolul II. Prezentarea metodei"), as 2.2's, 3.2's and 11's always did; the contents are
written from the headings, so they read the same way. Every contents is headed "Cuprins".
Every chapter, annex and bibliography starts a page, the first after the contents too; a
subchapter stays in the flow. In a document without contents the first chapter stays under the
document's title. A contents after other text starts a page too, and a paragraph before it that
the original numbered as an article (11's „Odată cu prezentul material informativ, s-au predat
…”) loses its number, so the articles count from chapter I.
"""

import re

from table_style import P_PR_ORDER, edit_properties, put
from typography import body_blocks

LABEL = re.compile(r'^((?:SUB)?CAPITOLUL [IVXLC]+\.(?:(?:[IVXLC]+|\{\{roman\}\})\.)?|Anexa Nr\. \d+\.)')
TAG = re.compile(r'\{\{[^}]*\}\}')
ABBREVIATION = re.compile(r'(?<![^\W\d_])(?:[^\W\d_]\.){2,}')
# "d.p.d.v." stands for "din punctul de vedere", words written in small letters.
SMALL_ABBREVIATIONS = {'D.P.D.V.'}
PROPER_NAMES = {'BUCUREȘTI': 'București'}
CONTENTS_TITLE = 'Cuprins'
# The merge data's `heading` is in capitals for the template versions registered before; a
# heading in sentence case reads `subject`, the same words as they are typed.
RENAMED_TAGS = {'{{heading}}': '{{subject}}'}


def in_capitals(text):
    letters = [character for character in TAG.sub('', text) if character.isalpha()]
    return bool(letters) and all(character.isupper() for character in letters)


def sentence_case(text):
    """`text` in sentence case when it is written in capitals, otherwise unchanged; as many
    characters either way, so the runs it spans keep their lengths."""
    label = LABEL.match(text)
    title_start = label.end() if label else 0
    if not in_capitals(text[title_start:]):
        return text
    kept = [(match.start(), match.group(0)) for match in TAG.finditer(text)]
    kept += [(match.start(), match.group(0)) for match in ABBREVIATION.finditer(text)
             if match.start() >= title_start and match.group(0) not in SMALL_ABBREVIATIONS]
    for name, written in PROPER_NAMES.items():
        kept += [(match.start(), written) for match in re.finditer(rf'(?<!\w){name}(?!\w)', text)]
    word = re.match(r'\w*', text).end() if label else 0
    cased = list(text[:word].capitalize() + text[word:title_start] + text[title_start:].lower())
    first = next((index for index in range(title_start, len(text)) if text[index].isalpha()), None)
    if first is not None:
        cased[first] = text[first]
    for start, written in kept:
        cased[start:start + len(written)] = written
    return ''.join(cased)


def unescaped(text):
    return text.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&')


def escaped(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


TEXT = re.compile(r'(<w:t\b[^>]*>)([^<]*)(</w:t>)')


def in_sentence_case(paragraph):
    """A heading paragraph with its text in sentence case, run by run."""
    for tag, renamed in RENAMED_TAGS.items():
        paragraph = paragraph.replace(tag, renamed)
    pieces = [unescaped(match.group(2)) for match in TEXT.finditer(paragraph)]
    whole = ''.join(pieces)
    cased = sentence_case(whole)
    if cased == whole:
        return paragraph
    parts = iter(range(len(pieces)))
    offsets = []
    at = 0
    for piece in pieces:
        offsets.append((at, at + len(piece)))
        at += len(piece)

    def recased(match):
        start, end = offsets[next(parts)]
        return match.group(1) + escaped(cased[start:end]) + match.group(3)
    return TEXT.sub(recased, paragraph)


def titled_contents(paragraph):
    """The line over a contents, whatever it said ("Cuprins:", "CUPRINS IPSSM – client"), as
    "Cuprins", in the look of its first run."""
    runs = list(re.finditer(r'<w:r>(?:(?!</w:r>).)*?<w:t\b[^>]*>[^<]*</w:t>(?:(?!</w:r>).)*?</w:r>', paragraph, re.S))
    if not runs:
        return paragraph
    first = re.sub(r'<w:t\b[^>]*>[^<]*</w:t>', f'<w:t>{CONTENTS_TITLE}</w:t>', runs[0].group(0), count=1)
    first = re.sub(r'<w:rStyle w:val="[^"]*"/>', '', first)
    for run in reversed(runs[1:]):
        paragraph = paragraph[:run.start()] + paragraph[run.end():]
    return paragraph[:runs[0].start()] + first + paragraph[runs[0].end():]


TYPED_CHAPTER = re.compile(r'^(?i:capitolul) [IVXLC]+\.\s')
TYPED_HEADING = re.compile(r'^(?i:(?:sub)?capitolul) [IVXLC]+\.')
UNDOTTED_SUBCHAPTER = re.compile(r'(>(?i:subcapitolul) [IVXLC]+\.[IVXLC]+)(?= )')


def typed_heading(paragraph):
    """A chapter or subchapter typed as text ("SUBCAPITOLUL I.I PLANUL") in sentence case, its
    label closed by a dot as the contents' labels are."""
    return in_sentence_case(UNDOTTED_SUBCHAPTER.sub(r'\1.', paragraph, count=1))
HEADING_1 = '<w:pStyle w:val="Heading1"/>'


def text_of(paragraph):
    return ''.join(unescaped(match.group(2)) for match in TEXT.finditer(paragraph))


def on_a_new_page(paragraph):
    return edit_properties(paragraph, 'pPr', lambda inner: put(inner, 'pageBreakBefore', '<w:pageBreakBefore/>', P_PR_ORDER))


def chapters_on_new_pages(xml):
    """Each chapter on a page of its own: in a document with contents its "heading 1"
    paragraphs, in one without the paragraphs that open with "Capitolul N.", but the first."""
    contents = xml.find('docPartGallery w:val="Table of Contents"')
    paragraphs = [(start, end) for kind, start, end in body_blocks(xml) if kind == 'p' and start > contents]
    if contents >= 0:
        chapters = [(start, end) for start, end in paragraphs if HEADING_1 in xml[start:end]]
    else:
        chapters = [(start, end) for start, end in paragraphs if TYPED_CHAPTER.match(text_of(xml[start:end]))][1:]
    edits = {}
    if contents < 0:
        for start, end in paragraphs:
            if TYPED_HEADING.match(text_of(xml[start:end])):
                edits[(start, end)] = [typed_heading]
    for start, end in chapters:
        edits.setdefault((start, end), []).append(on_a_new_page)
        for kept in before_the_last_lines(xml, start):
            edits.setdefault(kept, []).append(kept_with_next)
    for (start, end), changes in sorted(edits.items(), reverse=True):
        paragraph = xml[start:end]
        for change in changes:
            paragraph = change(paragraph)
        xml = xml[:start] + paragraph + xml[end:]
    return xml


LOOP_TAGS_ONLY = re.compile(r'(\{\{[#/^][^}]*\}\})*')


def before_the_last_lines(xml, chapter):
    """The paragraphs that keep with the last one ahead of `chapter`, until the page before the
    chapter ends on three lines at least: widow control holds the lines of one paragraph
    together, and a last paragraph of one line ("Activități subterane miniere.") would otherwise
    stand alone on the page before the next chapter."""
    said = [(kind, start, end) for kind, start, end in body_blocks(xml[:chapter])
            if kind != 'p' or not LOOP_TAGS_ONLY.fullmatch(text_of(xml[start:end]).strip())
            or '<w:drawing' in xml[start:end] or '<m:oMath' in xml[start:end]]
    if not said or said[-1][0] != 'p' or '<w:sectPr' in xml[said[-1][1]:said[-1][2]]:
        return []
    lines = estimated_lines(xml[said[-1][1]:said[-1][2]])
    kept = []
    for kind, start, end in reversed(said[:-1]):
        if kind != 'p' or '<w:sectPr' in xml[start:end]:
            break
        # A line that introduces what follows ("Agenți chimici:") goes with it.
        if (lines >= TAIL_LINES or len(kept) == TAIL_LINES) and not text_of(xml[start:end]).rstrip().endswith(':'):
            break
        kept.append((start, end))
        lines += estimated_lines(xml[start:end])
    return kept


TAIL_LINES = 3
LINE_CHARACTERS = 95  # a body line of 10 pt Arial across the text column


def estimated_lines(paragraph):
    return max(1, -(-len(text_of(paragraph)) // LINE_CHARACTERS))


def kept_with_next(paragraph):
    return edit_properties(paragraph, 'pPr', lambda inner: put(inner, 'keepNext', '<w:keepNext/>', P_PR_ORDER))


def article_lists(numbering):
    """The lists whose first level prints "Art. N."."""
    abstracts = set(re.findall(
        r'<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>(?:(?!</w:abstractNum>).)*?<w:lvl w:ilvl="0"[^>]*>'
        r'(?:(?!</w:lvl>).)*?<w:lvlText w:val="Art\. %1\."/>', numbering, re.S))
    return {number for number, abstract in re.findall(
        r'<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/>', numbering) if abstract in abstracts}


def articles_from_chapter_one(xml, numbering):
    contents = xml.find('docPartGallery w:val="Table of Contents"')
    if contents < 0:
        return xml
    lists = article_lists(numbering)
    numbered = re.compile(r'<w:numPr>(?:(?!</w:numPr>).)*?<w:numId w:val="(\d+)"/>(?:(?!</w:numPr>).)*?</w:numPr>', re.S)
    for kind, start, end in reversed(list(body_blocks(xml[:contents]))):
        found = numbered.search(xml[start:end]) if kind == 'p' else None
        if found and found.group(1) in lists:
            xml = xml[:start + found.start()] + xml[start + found.end():]
    return xml


def contents_on_its_own_page(xml):
    contents = xml.find('docPartGallery w:val="Table of Contents"')
    if contents < 0:
        return xml
    control = xml.rindex('<w:sdt>', 0, contents)
    before = [(kind, start, end) for kind, start, end in body_blocks(xml[:control])]
    if len(before) < 2 or not any(kind == 'tbl' or text_of(xml[start:end]).strip() for kind, start, end in before[:-1]):
        return xml
    _, start, end = before[-1]
    xml = xml[:start] + on_a_new_page(xml[start:end]) + xml[end:]
    for kept_start, kept_end in before_the_last_lines(xml, start):
        xml = xml[:kept_start] + kept_with_next(xml[kept_start:kept_end]) + xml[kept_end:]
    return xml
