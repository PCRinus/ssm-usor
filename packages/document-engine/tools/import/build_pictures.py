"""Writes the pictures of `pictures/` into the occupational safety set, without an office.

2.2's safety signs and 11's sign types become a catalogue (`pictures/catalogue.ro.json`): under
a short heading per kind, two signs to a row of a table without lines, each sign 14 mm wide
beside its name in bold and, where it says more than the name, one line of its meaning in 9 pt.
2.2's chapters XIV and XV open with an illustration, and its Fig. 1 shows the two hazard bands
and a drawn barrier. 9's method figures are plotted (`pictures/make_pictures.py`), and its two
formulas that were pictures of an old equation editor are formulas like the others.

Each place is found by the text around it, so a template already built is built again the same
way. Run from the package, before the sweep: python3 tools/import/build_pictures.py
"""

import json
import os
import re
import struct
import zipfile
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
PICTURES = os.path.join(HERE, 'pictures')
TEMPLATES = os.path.join(HERE, '..', '..', 'templates')
EMU_PER_INCH = 914400
DPI = 600
TEXT_WIDTH = 9355
SIGN_COLUMN = 1021
# Pictures this script writes number from here, so building again gives them the same ids.
FIRST_PICTURE_ID = 1000
IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
OLE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject'
TEXT = re.compile(r'<w:t\b[^>]*>([^<]*)</w:t>')


def png_size(path):
    with open(path, 'rb') as file:
        head = file.read(24)
    return struct.unpack('>II', head[16:24])


class Package:
    def __init__(self, name):
        self.path = os.path.join(TEMPLATES, name)
        with zipfile.ZipFile(self.path) as archive:
            self.entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
        self.parts = {item.filename: data for item, data in self.entries}
        self.document = self.text('word/document.xml')
        self.rels = self.text('word/_rels/document.xml.rels')
        self.types = self.text('[Content_Types].xml')
        self.added = {}
        self.next_id = FIRST_PICTURE_ID

    def text(self, name):
        return self.parts[name].decode('utf8')

    def relationship(self, picture):
        rid = 'pic_' + re.sub(r'\W', '_', picture)
        target = f'media/{picture}.png'
        if f'Id="{rid}"' not in self.rels:
            self.rels = self.rels.replace(
                '</Relationships>', f'<Relationship Id="{rid}" Type="{IMAGE}" Target="{target}"/></Relationships>')
        with open(os.path.join(PICTURES, 'png', picture + '.png'), 'rb') as file:
            self.added['word/' + target] = file.read()
        return rid

    def drawing(self, picture, name, width_mm=None, height_mm=None):
        """An inline picture, `width_mm` wide or `height_mm` tall, or at its 600 dpi size."""
        width, height = png_size(os.path.join(PICTURES, 'png', picture + '.png'))
        if width_mm:
            cx = round(width_mm / 25.4 * EMU_PER_INCH)
            cy = round(cx * height / width)
        elif height_mm:
            cy = round(height_mm / 25.4 * EMU_PER_INCH)
            cx = round(cy * width / height)
        else:
            cx, cy = round(width / DPI * EMU_PER_INCH), round(height / DPI * EMU_PER_INCH)
        rid = self.relationship(picture)
        number = self.next_id
        self.next_id += 1
        alt = escape(name, {'"': '&quot;'})
        return ('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
                f'<wp:docPr id="{number}" name="Picture {number}" descr="{alt}"/>'
                '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'noChangeAspect="1"/></wp:cNvGraphicFramePr>'
                '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                f'<pic:nvPicPr><pic:cNvPr id="{number}" name="Picture {number}" descr="{alt}"/><pic:cNvPicPr>'
                '<a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>'
                f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
                f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>'
                '</wp:inline></w:drawing></w:r>')

    def save(self):
        """Drops the pictures and embedded objects the document no longer shows, then writes."""
        used = set(re.findall(r'r:(?:embed|id)="([^"]+)"', self.document))
        dropped = []
        for match in re.finditer(r'<Relationship\b[^>]*/>', self.rels):
            relation = match.group(0)
            rid = re.search(r'Id="([^"]+)"', relation).group(1)
            kind = re.search(r'Type="([^"]+)"', relation).group(1)
            if kind in (IMAGE, OLE) and rid not in used:
                dropped.append(relation)
        for relation in dropped:
            self.rels = self.rels.replace(relation, '')
        targets = {'word/' + target for target in re.findall(r'Target="([^"]+)"', self.rels)}
        gone = {'word/' + re.search(r'Target="([^"]+)"', relation).group(1) for relation in dropped} - targets
        for name in gone:
            self.types = re.sub(rf'<Override PartName="/{re.escape(name)}"[^>]*/>', '', self.types)
        if 'Extension="png"' not in self.types:
            self.types = self.types.replace(
                '<Default Extension="rels"', '<Default Extension="png" ContentType="image/png"/><Default Extension="rels"')
        changed = {'word/document.xml': self.document, 'word/_rels/document.xml.rels': self.rels,
                   '[Content_Types].xml': self.types}
        stamp = next(item for item, _ in self.entries if item.filename == 'word/document.xml').date_time
        names = [item.filename for item, _ in self.entries]
        with zipfile.ZipFile(self.path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for item, data in self.entries:
                if item.filename in gone:
                    continue
                if item.filename in changed:
                    data = changed[item.filename].encode('utf8')
                elif item.filename in self.added:
                    data = self.added[item.filename]
                archive.writestr(item, data)
            for name in sorted(set(self.added) - set(names)):
                entry = zipfile.ZipInfo(name, stamp)
                entry.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(entry, self.added[name])


def body_elements(xml):
    """The body's top-level paragraphs, tables and content controls as (tag, start, end)."""
    position = xml.index('<w:body>') + len('<w:body>')
    opening = re.compile(r'<w:(p|tbl|sdt|sectPr)\b')
    elements = []
    while True:
        match = opening.search(xml, position)
        if not match or match.group(1) == 'sectPr':
            return elements
        tag = match.group(1)
        nested = re.compile(rf'<w:{tag}[ >]|</w:{tag}>')
        depth = 0
        for inner in nested.finditer(xml, match.start()):
            depth += -1 if inner.group(0).startswith('</') else 1
            if depth == 0:
                end = inner.end()
                break
        elements.append((tag, match.start(), end))
        position = end


def text_of(xml):
    return ''.join(TEXT.findall(xml))


def find(elements, xml, pattern, start=0):
    for index in range(start, len(elements)):
        tag, begin, end = elements[index]
        if tag == 'p' and re.search(pattern, text_of(xml[begin:end])):
            return index
    raise RuntimeError(f'no paragraph matches {pattern!r}')


def run(text, bold=False, size=20):
    properties = ('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
                  + ('<w:b/><w:bCs/>' if bold else '<w:b w:val="false"/>')
                  + f'<w:color w:val="auto"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:lang w:val="ro-RO"/>')
    return f'<w:r><w:rPr>{properties}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(content, before=0, after=0, keep=False, jc='left', size=20):
    properties = ('<w:pStyle w:val="Normal"/>' + ('<w:keepNext/>' if keep else '<w:keepNext w:val="false"/>')
                  + f'<w:widowControl/><w:spacing w:before="{before}" w:after="{after}"/><w:ind w:left="0" w:hanging="0"/>'
                  f'<w:jc w:val="{jc}"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
                  f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:lang w:val="ro-RO"/></w:rPr>')
    return f'<w:p><w:pPr>{properties}</w:pPr>{content}</w:p>'


NO_BORDERS = ('<w:tblBorders>' + ''.join(f'<w:{side} w:val="nil"/>' for side in
                                         ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')) + '</w:tblBorders>')
ROW_GAP = 170


def catalogue(package, signs):
    """Two signs to a row, read across: a group runs over pages, so a row is read whole before
    the next, which an order down the columns would not survive."""
    text_column = (TEXT_WIDTH - 2 * SIGN_COLUMN) // 2
    widths = [SIGN_COLUMN, text_column, SIGN_COLUMN, TEXT_WIDTH - 2 * SIGN_COLUMN - text_column]
    rows = ''
    for first in range(0, len(signs), 2):
        cells = ''
        keep = first == 0
        for column in range(2):
            sign = signs[first + column] if first + column < len(signs) else None
            pictures = ''
            text = ''
            if sign:
                for index, picture in enumerate(sign['pictures']):
                    last = index == len(sign['pictures']) - 1
                    pictures += paragraph(package.drawing(picture, sign['name'], width_mm=14),
                                          after=ROW_GAP if last else 57, keep=keep)
                meaning = sign.get('meaning')
                text = paragraph(run(sign['name'], bold=True), after=20 if meaning else ROW_GAP, keep=keep)
                if meaning:
                    text += paragraph(run(meaning, size=18), after=ROW_GAP, keep=keep, size=18)
            else:
                pictures = text = paragraph('', keep=keep, size=2)
            for width, content in ((widths[2 * column], pictures), (widths[2 * column + 1], text)):
                cells += (f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>'
                          f'{content}</w:tc>')
        rows += f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{cells}</w:tr>'
    properties = (f'<w:tblW w:w="{TEXT_WIDTH}" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="0" w:type="dxa"/>'
                  f'{NO_BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
                  '<w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="113" w:type="dxa"/>'
                  '</w:tblCellMar><w:tblLook w:val="0000"/>')
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    return f'<w:tbl><w:tblPr>{properties}</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{rows}</w:tbl>'


def replace_between(package, after, before, content):
    """Puts `content` in place of everything between the paragraph matching `after` and the
    next one matching `before`."""
    xml = package.document
    elements = body_elements(xml)
    first = find(elements, xml, after)
    last = find(elements, xml, before, first + 1)
    package.document = xml[:elements[first][2]] + content + xml[elements[last][1]:]


def replace_pictures(paragraph_xml, drawing):
    """The paragraph's pictures and embedded objects give way to one picture."""
    runs = list(re.finditer(r'<w:r>(?:(?!</w:r>).)*?<w:(?:drawing|object|pict)\b.*?</w:r>', paragraph_xml, re.S))
    assert runs, paragraph_xml[:200]
    start, end = runs[0].start(), runs[-1].end()
    return paragraph_xml[:start] + drawing + paragraph_xml[end:]


# Where 2.2 quotes each kind of sign from H.G. 971/2006, annex 2: the catalogue of a kind
# stands between the last line of the law's description and what follows it.
SIGN_GROUPS = [
    ('pictogramă neagră pe fond alb, margine și bandă diagonală roșii', r'^\(4\) Panouri utilizate'),
    ('se utilizează și în lipsa unui panou specific pentru temperaturi', r'^\*\) Acest panou de avertizare'),
    ('pictogramă albă pe fond albastru', r'^\(6\) Panouri utilizate'),
    ('pictogramă albă pe fond verde', r'^\(7\) Panouri privind'),
    ('pictogramă albă pe fond roșu', r'Cerințe minime privind identificarea și localizarea'),
]


def general_training_material(package, data):
    for (after, before), group in zip(SIGN_GROUPS, data['2.2']):
        heading = paragraph(run(group['heading'], bold=True), before=240, after=120, keep=True)
        replace_between(package, after, before, heading + catalogue(package, group['signs']))
    for chapter, picture, alt, size in (('^Capitolul XIV\\. ', 'illustration-cpr', 'Prim ajutor', {'width_mm': 45}),
                                         ('^Capitolul XV\\. ', 'illustration-extinguisher', 'Stingător', {'height_mm': 40})):
        xml = package.document
        elements = body_elements(xml)
        index = find(elements, xml, chapter)
        _, begin, end = elements[index + 1]
        assert '<w:drawing' in xml[begin:end] or '<w:object' in xml[begin:end] or '<w:pict' in xml[begin:end]
        package.document = xml[:begin] + replace_pictures(xml[begin:end], package.drawing(picture, alt, **size)) + xml[end:]
    figure = (paragraph(package.drawing('stripes-yellow-black', 'Bandă galben-negru'), after=120, keep=True, jc='center')
              + paragraph(package.drawing('stripes-red-white', 'Bandă roșu-alb'), after=120, keep=True, jc='center')
              + paragraph(package.drawing('illustration-barrier', 'Mijloc de împrejmuire sistem barieră', width_mm=90),
                          after=120, keep=True, jc='center'))
    replace_between(package, r'^Exemplu:$', r'^Fig\. 1\. Mijloc de împrejmuire', figure)


def employer_briefing(package, data):
    replace_between(package, r'^Stoc de mijloace de semnalizare', r'^Panouri informative',
                    catalogue(package, data['11']))


MATH_RUN = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>'


def m(text, plain=False):
    literal = '<m:rPr><m:lit/><m:nor/></m:rPr>' if plain else ''
    return f'<m:r>{literal}{MATH_RUN}<m:t xml:space="preserve">{escape(text)}</m:t></m:r>'


def fraction(numerator, denominator):
    return f'<m:f><m:num>{numerator}</m:num><m:den>{denominator}</m:den></m:f>'


def bars(rows):
    matrix = ''.join('<m:mr>' + ''.join(f'<m:e>{m("(")}{m(cell, plain=True)}{m(")")}</m:e>' for cell in row) + '</m:mr>'
                     for row in rows)
    return f'<m:d><m:dPr><m:begChr m:val="‖"/><m:endChr m:val="‖"/></m:dPr><m:e><m:m>{matrix}</m:m></m:e></m:d>'


def submatrix(upper, lower, index, rows):
    """M with the bounds of its index above and below it, as 9's other submatrices are written."""
    return (f'<m:sSub><m:e><m:limLow><m:e><m:limUpp><m:e>{m("M")}</m:e><m:lim>{m(upper)}</m:lim></m:limUpp></m:e>'
            f'<m:lim>{m(lower)}</m:lim></m:limLow></m:e><m:sub>{m(index, plain=True)}</m:sub></m:sSub>'
            f'{m("=")}{bars(rows)}')


def omath(content):
    return f'<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">{content}</m:oMath>'


def paragraph_content(paragraph_xml, content):
    properties = re.match(r'<w:p\b[^>]*>(<w:pPr>.*?</w:pPr>)?', paragraph_xml, re.S)
    return properties.group(0) + content + '</w:p>'


FIGURES = [('1.1', None), ('1.2', None), ('1.3', None), ('1.4', None), ('1.5. a', '1.5a'), ('1.5. b', '1.5b')]


def risk_assessment(package):
    xml = package.document
    for caption, picture in FIGURES:
        elements = body_elements(xml)
        index = find(elements, xml, rf'^Fig\. {re.escape(caption)}\.')
        while not re.search(r'<w:(drawing|object|pict)\b', xml[elements[index][1]:elements[index][2]]):
            index -= 1
        _, begin, end = elements[index]
        figure = replace_pictures(xml[begin:end], package.drawing(f'figure-{picture or caption}', f'Fig. {caption}'))
        # A picture on a line of 1.5 lines stands under the room of half its height.
        figure = re.sub(r'<w:spacing w:lineRule="auto" w:line="\d+"', '<w:spacing', figure, count=1)
        # The Body Text style draws a box around its paragraph, which no other figure has.
        figure = figure.replace('<w:pStyle w:val="BodyText"/>', '<w:pStyle w:val="Normal"/>', 1)
        xml = xml[:begin] + figure + xml[end:]
    elements = body_elements(xml)
    figure = find(elements, xml, r'^Fig\. 1\.1\.')
    while '<w:drawing' not in xml[elements[figure][1]:elements[figure][2]]:
        figure -= 1
    _, begin, end = elements[figure - 1]
    limit = omath(m('y') + m('=') + fraction(m('1'), m('0')) + m('→+∞'))
    zero = omath(m('y') + m('=') + fraction(m('1'), m('+∞')) + m('→0'))
    xml = xml[:begin] + paragraph_content(xml[begin:end], limit + run(';   ') + zero + run('.')) + xml[end:]
    elements = body_elements(xml)
    _, begin, end = elements[find(elements, xml, r'^- nivelul 4:\s*$') + 1]
    rows = [submatrix('6', 'p=5', '3,p', [['3,5', '3,6']]), submatrix('4', 'p=3', '4,p', [['4,3', '4,4']]),
            submatrix('3', 'p=2', '5,p', [['5,2', '5,3']]), submatrix('7', 'g=6', 'g,2', [['6,2'], ['7,2']]) + m(';')]
    block = ('<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>'
             + ''.join(f'<m:e>{row}</m:e>' for row in rows) + '</m:eqArr></m:e></m:d>')
    xml = xml[:begin] + paragraph_content(xml[begin:end], omath(block)) + xml[end:]
    # A bound left empty prints as a placeholder box.
    xml = xml.replace('<m:lim></m:lim></m:limLow>', f'<m:lim>{m("p=1")}</m:lim></m:limLow>')
    package.document = xml


def main():
    with open(os.path.join(PICTURES, 'catalogue.ro.json'), encoding='utf8') as file:
        data = json.load(file)
    for name, build in (('2.2_general_training_material.docx', lambda package: general_training_material(package, data)),
                        ('11_employer_briefing.docx', lambda package: employer_briefing(package, data)),
                        ('9_risk_assessment.docx', risk_assessment)):
        package = Package(name)
        build(package)
        package.save()
        print(name)


if __name__ == '__main__':
    main()
