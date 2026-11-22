"""2.1's chapters XIV and XV open with what the law asks of them: a note "Conform Legii
319/2006 – …:" and the letters and paragraphs it quotes, typed under it. They read like the
set's "(Preluare din …)" notes: on the text margin, the citation in italics, the quoted text
regular and its labels ("(1)", "a)") bold.
"""

import re

NOTE = re.compile(r'^Conform (?:Legii|H\.G\.|O\.U\.G\.|O\.G\.)[^:]{0,120}:')
LABEL = re.compile(r'^(\s*)(\(\d+\)|[a-z]\))(?=\s)')
PARAGRAPH = re.compile(r'<w:p\b[^>]*>(?:(?!<w:p\b).)*?</w:p>', re.S)
PROPERTIES = re.compile(r'^<w:p\b[^>]*>(<w:pPr>.*?</w:pPr>)?', re.S)
TEXT_RUN = re.compile(r'<w:r>(<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?<w:t(?: xml:space="preserve")?>([^<]*)</w:t></w:r>', re.S)
BOOKMARK = re.compile(r'<w:bookmark(?:Start|End)\b[^>]*/>')
DROPPED = re.compile(r'<w:(?:rStyle|b|bCs|i|iCs|u)\b[^>]*/>')


def text_runs(paragraph):
    """The paragraph's runs, when it holds nothing but runs of text and bookmarks, as
    (properties, text)."""
    head = PROPERTIES.match(paragraph).group(0)
    body = BOOKMARK.sub('', paragraph[len(head):-len('</w:p>')])
    runs = list(TEXT_RUN.finditer(body))
    if not runs or ''.join(run.group(0) for run in runs) != body:
        return None
    return [(run.group(1) or '', run.group(2)) for run in runs]


def segments(text, note):
    """The text in (piece, look) pieces: 'i' the citation, 'b' a label, '' the quoted text."""
    pieces = []
    if note:
        citation = NOTE.match(text).group(0)
        pieces.append((citation, 'i'))
        text = text[len(citation):]
    label = LABEL.match(text)
    if label:
        pieces += [(label.group(1), ''), (label.group(2), 'b')]
        text = text[label.end():]
    pieces.append((text, ''))
    merged = []
    for piece, look in pieces:
        if not piece:
            continue
        if merged and merged[-1][1] == look:
            merged[-1] = (merged[-1][0] + piece, look)
        else:
            merged.append((piece, look))
    return merged


def run(properties, piece, look):
    inner = DROPPED.sub('', properties[len('<w:rPr>'):-len('</w:rPr>')] if properties else '')
    marks = {'b': '<w:b/><w:bCs/>', 'i': '<w:i/><w:iCs/>'}.get(look, '')
    fonts = re.match(r'<w:rFonts\b[^>]*/>', inner)
    inner = inner[:fonts.end()] + marks + inner[fonts.end():] if fonts else marks + inner
    space = ' xml:space="preserve"' if piece != piece.strip() else ''
    return f'<w:r><w:rPr>{inner}</w:rPr><w:t{space}>{piece}</w:t></w:r>'


def rewritten(paragraph, note):
    runs = text_runs(paragraph)
    if runs is None:
        return paragraph
    head = PROPERTIES.match(paragraph).group(0)
    head = re.sub(r'<w:ind\b[^>]*/>', '<w:ind w:left="0" w:hanging="0"/>', head, count=1)
    properties = runs[0][0]
    text = ''.join(piece for _, piece in runs)
    return head + ''.join(BOOKMARK.findall(paragraph)) + ''.join(run(properties, piece, look) for piece, look in segments(text, note)) + '</w:p>'


def plain_text(paragraph):
    return ''.join(re.findall(r'<w:t\b[^>]*>([^<]*)</w:t>', paragraph))


def citation_notes(xml):
    """Each note and the labelled paragraphs typed under it. Safe to run again."""
    edits = []
    passage = False
    for match in PARAGRAPH.finditer(xml):
        paragraph = match.group(0)
        listed = '<w:numPr>' in paragraph or '<w:pStyle w:val="Heading' in paragraph
        text = plain_text(paragraph)
        if not listed and NOTE.match(text):
            edits.append((match.start(), match.end(), rewritten(paragraph, True)))
            passage = True
        elif passage and not listed and LABEL.match(text):
            edits.append((match.start(), match.end(), rewritten(paragraph, False)))
        else:
            passage = False
    for start, end, paragraph in reversed(edits):
        xml = xml[:start] + paragraph + xml[end:]
    return xml
