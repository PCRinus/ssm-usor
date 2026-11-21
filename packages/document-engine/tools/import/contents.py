"""The occupational safety set's table of contents read like its articles: an entry's label
("Capitolul IV.", "Subcapitolul XV.I.", "Anexa Nr. 2.") in bold, a tab, and the title, its
wrapped lines under the title's first word; a subchapter one tier in. The label column of a
level is as wide as the document's widest label of that level and a little room, so every
title of the level starts on one line.

The merge writes the entries (`src/toc.ts`) and sets each labelled one's tab and hang from a
style of its own, "Contents labels N", which nothing else uses. The entry styles "toc N" keep
the plain hang: Word, the in-app editor and LibreOffice rebuild a contents from the headings'
plain text in those styles, and a label column there would send a title without a label, or
a label without its tab, to the column, and the page number of "BIBLIOGRAFIE" with it.
"""

import math
import re

from table_style import bold_width

LABEL = re.compile(r'^((?:sub)?capitolul [IVXLC]+\.(?:(?:[IVXLC]+|\{\{roman\}\})\.)?|anexa(?: nr\.)? (?:\d+|\{\{number\}\})\.)(?=\s)',
                   re.I)
# A loop's number measured as one of the widest it can print.
PLACEHOLDERS = {'{{roman}}': 'XVIII', '{{number}}': '99'}
LABEL_ROOM = 142  # twips: 2.5 mm between the widest label and its title
TIER = 567  # twips
BODY_SIZE = 20  # half-points


def label_of(text):
    match = LABEL.match(text)
    return match.group(1) if match else None


def label_width(label):
    for placeholder, widest in PLACEHOLDERS.items():
        label = label.replace(placeholder, widest)
    return bold_width(label, BODY_SIZE)


def label_columns(labelled):
    """Each level's title column, in twips from where its labels start: `labelled` gives
    (level, text) for every heading and typed entry."""
    widest = {}
    for level, text in labelled:
        label = label_of(text)
        if label:
            widest[level] = max(widest.get(level, 0), label_width(label))
    return {level: math.ceil((width + LABEL_ROOM) / 57) * 57 for level, width in widest.items()}


def entry_geometry(level, column):
    """(where the label starts, where the title starts), in twips from the margin."""
    start = (level - 1) * TIER
    return start, start + column


def column_style_id(level):
    return f'ContentsLabels{level}'


def column_style(level, column, right):
    start, title = entry_geometry(level, column)
    return (f'<w:style w:type="paragraph" w:customStyle="1" w:styleId="{column_style_id(level)}">'
            f'<w:name w:val="Contents labels {level}"/><w:basedOn w:val="TOC{level}"/><w:semiHidden/><w:pPr>'
            f'<w:tabs><w:tab w:val="left" w:pos="{title}"/></w:tabs>'
            f'<w:ind w:left="{title}" w:right="{right}" w:hanging="{title - start}"/></w:pPr></w:style>')
