"""Page numbers and a running header for the occupational safety set's decisions, without an office.

The first page keeps its own layout: "Pag. X din Y" stands right, over the branding line of
every footer. From the second page a slim header names the decision and the client, with the
page number on the right and a thin rule under it, so a page that comes loose still says what it
belongs to. Safe to run again: each part is written whole, the same every time.
"""

import re

DECISION_TITLE = re.compile(r'Nr\. \{\{decisionNumber\}\} SSM din \{\{issueDate\}\}')
HEADER = 'word/header1.xml'
FIRST_HEADER = 'word/header2.xml'
HEADER_ID = 'rIdDecisionHeader'
FIRST_HEADER_ID = 'rIdDecisionFirstHeader'
HEADER_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
HEADER_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
TEXT_WIDTH = 11906 - 1417 - 1134
PAGE_COLUMN = 1200
GREY = '555555'
SIZE = 16
NAMESPACES = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
              'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
LINE = 'Decizia nr. {{decisionNumber}} SSM din {{issueDate}} · {{client.legalName}}'


def run_properties():
    return (f'<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
            f'<w:b w:val="false"/><w:color w:val="{GREY}"/><w:sz w:val="{SIZE}"/><w:szCs w:val="{SIZE}"/>'
            '<w:lang w:val="ro-RO"/></w:rPr>')


def run(text):
    return f'<w:r>{run_properties()}<w:t xml:space="preserve">{text}</w:t></w:r>'


def field(code, shown):
    # The bare keyword: with LibreOffice's "\* ARABIC" the in-app editor paints the cached
    # number on every page.
    parts = ['<w:fldChar w:fldCharType="begin"/>', f'<w:instrText xml:space="preserve"> {code} </w:instrText>',
             '<w:fldChar w:fldCharType="separate"/>', f'<w:t>{shown}</w:t>', '<w:fldChar w:fldCharType="end"/>']
    return ''.join(f'<w:r>{run_properties()}{part}</w:r>' for part in parts)


def page_of_pages():
    return run('Pag. ') + field('PAGE', '1') + run(' din ') + field('NUMPAGES', '1')


def paragraph(content, align, style, after=0):
    return (f'<w:p><w:pPr><w:pStyle w:val="{style}"/><w:spacing w:before="0" w:after="{after}"/>'
            f'<w:ind w:left="0" w:right="0" w:hanging="0"/><w:jc w:val="{align}"/>{run_properties()}</w:pPr>'
            f'{content}</w:p>')


# Word wants a paragraph after a table, here as small as it gets.
CLOSING = ('<w:p><w:pPr><w:pStyle w:val="Header"/><w:spacing w:before="0" w:after="0" w:line="20" '
           'w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>')


def header():
    # Two cells rather than a right tab: a long client name wraps inside its own cell instead of
    # pushing the page number onto a line of its own.
    widths = (TEXT_WIDTH - PAGE_COLUMN, PAGE_COLUMN)
    cells = ''.join(
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>'
        f'{paragraph(content, align, "Header")}</w:tc>'
        for width, content, align in zip(widths, (run(LINE), page_of_pages()), ('left', 'right')))
    table = (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="left"/>'
        '<w:tblInd w:w="0" w:type="dxa"/>'
        f'<w:tblBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="{GREY}"/></w:tblBorders>'
        '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
        '<w:left w:w="0" w:type="dxa"/><w:bottom w:w="45" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>'
        '</w:tblCellMar></w:tblPr>'
        f'<w:tblGrid><w:gridCol w:w="{widths[0]}"/><w:gridCol w:w="{widths[1]}"/></w:tblGrid>'
        f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{cells}</w:tr></w:tbl>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr {NAMESPACES}>{table}{CLOSING}</w:hdr>'


def first_header():
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr {NAMESPACES}>{CLOSING}</w:hdr>'


PAGE_PARAGRAPH = re.compile(r'<w:p\b(?:(?!</w:p>).)*?<w:instrText[^>]*>\s*PAGE\s*</w:instrText>.*?</w:p>', re.S)


def footer(xml):
    """Every footer opens with the page number, right, over the branding line."""
    numbered = paragraph(page_of_pages(), 'right', 'Footer')
    if PAGE_PARAGRAPH.search(xml):
        return PAGE_PARAGRAPH.sub(lambda _: numbered, xml, count=1)
    body = re.search(r'<w:ftr\b[^>]*>', xml).end()
    return xml[:body] + numbered + xml[body:]


def relationships(xml):
    for identifier, target in ((HEADER_ID, HEADER), (FIRST_HEADER_ID, FIRST_HEADER)):
        if f'Id="{identifier}"' not in xml:
            xml = xml.replace('</Relationships>', f'<Relationship Id="{identifier}" Type="{HEADER_RELATIONSHIP}" '
                                                  f'Target="{target[len("word/"):]}"/></Relationships>')
    return xml


def content_types(xml):
    for part in (HEADER, FIRST_HEADER):
        if f'PartName="/{part}"' not in xml:
            xml = xml.replace('</Types>', f'<Override PartName="/{part}" ContentType="{HEADER_TYPE}"/></Types>')
    return xml


def section(xml):
    def change(match):
        properties = re.sub(r'<w:headerReference\b[^>]*/>|<w:titlePg(?: w:val="[^"]*")?/>', '', match.group(0))
        opening = re.match(r'<w:sectPr\b[^>]*>', properties).end()
        references = (f'<w:headerReference w:type="default" r:id="{HEADER_ID}"/>'
                      f'<w:headerReference w:type="first" r:id="{FIRST_HEADER_ID}"/>')
        properties = properties[:opening] + references + properties[opening:]
        properties = re.sub(r'(<w:pgMar\b[^>]*?) w:header="\d+"', r'\1 w:header="680"', properties)
        # titlePg comes after formProt and vAlign and before textDirection (CT_SectPr).
        later = re.search(r'<w:(?:textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b', properties)
        at = later.start() if later else properties.rindex('</w:sectPr>')
        return properties[:at] + '<w:titlePg/>' + properties[at:]
    return re.sub(r'<w:sectPr\b[^>]*>.*?</w:sectPr>', change, xml, flags=re.S)


def is_decision(document):
    return any(DECISION_TITLE.fullmatch(''.join(re.findall(r'<w:t\b[^>]*>([^<]*)</w:t>', paragraph)).strip())
               for paragraph in re.findall(r'<w:p\b[^>]*>.*?</w:p>', document, re.S))


def decision_pages(parts):
    """`parts`, name to text, with the decision's header and page numbers; `parts` unchanged for
    any other document."""
    if not is_decision(parts['word/document.xml']):
        return parts
    parts = dict(parts)
    parts[HEADER] = header()
    parts[FIRST_HEADER] = first_header()
    parts['word/_rels/document.xml.rels'] = relationships(parts['word/_rels/document.xml.rels'])
    parts['[Content_Types].xml'] = content_types(parts['[Content_Types].xml'])
    parts['word/document.xml'] = section(parts['word/document.xml'])
    for name in parts:
        if re.fullmatch(r'word/footer\d*\.xml', name):
            parts[name] = footer(parts[name])
    return parts
