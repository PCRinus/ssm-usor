"""The occupational safety set's chapters read like a book's. A chapter, a subchapter or an
annex title typed in capitals ("CAPITOLUL II. PREZENTAREA METODEI") reads in sentence case
("Capitolul II. Prezentarea metodei"), as 2.2's, 3.2's and 11's always did; the contents are
written from the headings, so they read the same way. Every contents is headed "Cuprins".
"""

import re

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
