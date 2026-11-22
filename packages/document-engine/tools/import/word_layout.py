"""Word 2013's table layout for a template's parts, without an office.

In the compatibility modes the templates came with, 11 from the provider's Word 2003 originals
and 12 from LibreOffice, Word and LibreOffice put a table's text on the margin and its lines a
cell's padding outside it, so tables whose indent differed from their padding sat 1 to 2 mm off
the text column. In mode 15 a table's edge is its indent from the margin, so with every indent
at 0 every table, the box of document details in the header included, lands on the margins.
Both go together: mode 15 alone moves the tables indented by their padding to the right.
"""

import os
import re

# The fire-safety set and the contracts keep their layout until they are reviewed too; the
# fire-safety training sheet is a form drawn like the occupational safety one and laid out as it is.
OUTSIDE = ('fire', 'other')
OUTSIDE_FILES = ('act_aditional_semnare_electronica.docx',)
INSIDE_FILES = ('fisa_instructaj_su.docx',)

COMPATIBILITY_MODE = re.compile(r'<w:compatSetting\b(?=[^>]*\bw:name="compatibilityMode")[^>]*/>')
MODE_VALUE = re.compile(r'\bw:val="[^"]*"')
WORD_2013 = ('<w:compatSetting w:name="compatibilityMode" '
             'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>')
# What follows <w:compat> in CT_Settings (ECMA-376 part 1, 17.15.1.78), extensions included: a
# new <w:compat> goes before the first of them, or Word refuses the file as damaged.
AFTER_COMPAT = re.compile(
    r'<(?:w:(?:docVars|rsids|attachedSchema|themeFontLang|clrSchemeMapping|'
    r'doNotIncludeSubdocsInStats|doNotAutoCompressPictures|forceUpgrade|captions|'
    r'readModeInkLockDown|smartTagType|shapeDefaults|doNotEmbedSmartTags|decimalSymbol|'
    r'listSeparator)\b|m:mathPr\b|sl:schemaLibrary\b|(?!w:|/)[\w]+:)')
TABLE_INDENT = re.compile(r'<w:tblInd\b[^>]*/>')
ON_THE_MARGIN = '<w:tblInd w:w="0" w:type="dxa"/>'


def lays_out_as_word_2013(path):
    name = os.path.basename(path)
    return name in INSIDE_FILES or (os.path.basename(os.path.dirname(path)) not in OUTSIDE
                                    and name not in OUTSIDE_FILES)


def word_2013_settings(xml):
    if COMPATIBILITY_MODE.search(xml):
        return COMPATIBILITY_MODE.sub(lambda match: MODE_VALUE.sub('w:val="15"', match.group(0)), xml)
    # The compatSettings close the element, after the legacy flags.
    if '</w:compat>' in xml:
        return xml.replace('</w:compat>', f'{WORD_2013}</w:compat>', 1)
    if '<w:compat/>' in xml:
        return xml.replace('<w:compat/>', f'<w:compat>{WORD_2013}</w:compat>', 1)
    body = xml.index('>', xml.index('<w:settings')) + 1
    following = AFTER_COMPAT.search(xml, body)
    at = following.start() if following else xml.rindex('</w:settings>')
    return f'{xml[:at]}<w:compat>{WORD_2013}</w:compat>{xml[at:]}'


def tables_on_the_margin(xml):
    return TABLE_INDENT.sub(ON_THE_MARGIN, xml)


def word_2013_part(name, xml):
    if name == 'word/settings.xml':
        return word_2013_settings(xml)
    if re.fullmatch(r'word/[^/]+\.xml', name):
        return tables_on_the_margin(xml)
    return xml
