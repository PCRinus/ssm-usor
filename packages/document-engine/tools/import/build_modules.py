"""Builds the skeleton of an instruction module and the fixture modules (ADR 012).

    pnpm --filter @ssm-usor/document-engine build-modules

A module is a Word file the provider writes or uploads; the app ships no instruction text. It
does ship the skeleton a new module starts from, in the house style with the Labour
Inspection's headings and one numbered article, and the dev seed and the flow tests need a
few small modules to work with. Both are written here from `modules.ro.json`, as plain
OOXML, with no LibreOffice: a module has no header, no footer and no page furniture, so
there is nothing a typesetter would add.
"""

import base64
import json
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT = 'Arial'
BODY_HALF_POINTS = 20
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def run(text, bold=False, italic=False):
    props = ''.join(['<w:b/>' if bold else '', '<w:i/>' if italic else ''])
    return f'<w:r><w:rPr>{props}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(text, *, style=None, level=None, bold=False, italic=False, keep=False):
    props = ''
    if style:
        props += f'<w:pStyle w:val="{style}"/>'
    if keep:
        props += '<w:keepNext/>'
    if level is not None:
        props += f'<w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="1"/></w:numPr>'
    return f'<w:p><w:pPr>{props}</w:pPr>{run(text, bold=bold, italic=italic)}</w:p>'


def body(module):
    parts = []
    for section in module['sections']:
        parts.append(paragraph(section['heading'], style='Titlu', keep=True))
        for text in section.get('paragraphs', []):
            parts.append(paragraph(text))
        for article in section.get('articles', []):
            if isinstance(article, str):
                parts.append(paragraph(article, level=0))
            else:
                parts.append(paragraph(article['text'], level=0))
                for item in article.get('items', []):
                    parts.append(paragraph(item, level=2))
    return ''.join(parts)


def document_xml(module):
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document {W} {R}><w:body>{body(module)}'
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1417" w:header="709" w:footer="709" w:gutter="0"/>'
        '</w:sectPr></w:body></w:document>'
    )


def styles_xml():
    fonts = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}" w:eastAsia="{FONT}"/>'
    size = f'<w:sz w:val="{BODY_HALF_POINTS}"/><w:szCs w:val="{BODY_HALF_POINTS}"/>'
    lang = '<w:lang w:val="ro-RO" w:eastAsia="ro-RO" w:bidi="ro-RO"/>'
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:styles {W}>'
        f'<w:docDefaults><w:rPrDefault><w:rPr>{fonts}{size}{lang}</w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:pPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Titlu"><w:name w:val="Titlu"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
        '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>'
        '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>'
        '</w:styles>'
    )


def numbering_xml():
    # The article list of the own instructions: "Art. 1." flush left, then "1." and "a)" tiers,
    # the shape the templates keep after import.
    def level(index, fmt, text, left, hanging, bold):
        weight = '<w:b/>' if bold else '<w:b w:val="0"/>'
        return (
            f'<w:lvl w:ilvl="{index}"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{text}"/>'
            f'<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="{left}" w:hanging="{hanging}"/></w:pPr><w:rPr>{weight}</w:rPr></w:lvl>'
        )
    levels = ''.join([
        level(0, 'decimal', 'Art. %1.', 0, 0, True),
        level(1, 'decimal', '%2.', 720, 360, False),
        level(2, 'lowerLetter', '%3)', 720, 360, False),
    ])
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:numbering {W}><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>{levels}</w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>'
    )


CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    '</Types>'
)

ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    '</Relationships>'
)

DOCUMENT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    '</Relationships>'
)

SETTINGS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<w:settings {W}><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/>'
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
    '</w:settings>'
)


def build(module, target):
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', CONTENT_TYPES)
        archive.writestr('_rels/.rels', ROOT_RELS)
        archive.writestr('word/document.xml', document_xml(module))
        archive.writestr('word/_rels/document.xml.rels', DOCUMENT_RELS)
        archive.writestr('word/styles.xml', styles_xml())
        archive.writestr('word/numbering.xml', numbering_xml())
        archive.writestr('word/settings.xml', SETTINGS)


def main():
    with open(os.path.join(ROOT, 'tools', 'import', 'modules.ro.json'), encoding='utf8') as file:
        definition = json.load(file)

    skeleton = os.path.join(ROOT, 'src', 'skeleton.docx.tmp')
    build(definition['skeleton'], skeleton)
    with open(skeleton, 'rb') as file:
        encoded = base64.b64encode(file.read()).decode('ascii')
    os.remove(skeleton)
    lines = [encoded[index:index + 100] for index in range(0, len(encoded), 100)]
    with open(os.path.join(ROOT, 'src', 'skeleton.ts'), 'w', encoding='utf8') as file:
        file.write('// Written by tools/import/build_modules.py from tools/import/modules.ro.json.\n')
        file.write('// A new instruction module starts from this file (ADR 012).\n\n')
        file.write('const encoded =\n')
        file.write('\n'.join(f"  '{line}'{' +' if index < len(lines) - 1 else ';'}" for index, line in enumerate(lines)))
        file.write('\n\nexport function instructionModuleSkeleton(): Uint8Array {\n')
        file.write('  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));\n}\n')
    print('src/skeleton.ts')

    fixtures = os.path.join(ROOT, '..', '..', 'apps', 'api', 'scripts', 'fixtures', 'instruction-modules')
    index = []
    for module in definition['fixtures']:
        build(module, os.path.join(fixtures, f'{module["key"]}.docx'))
        index.append({'file': f'{module["key"]}.docx', 'title': module['title'], 'group': module['group']})
        print(f'fixtures/instruction-modules/{module["key"]}.docx')
    with open(os.path.join(fixtures, 'index.json'), 'w', encoding='utf8') as file:
        json.dump(index, file, ensure_ascii=False, indent=2)
        file.write('\n')


if __name__ == '__main__':
    main()
