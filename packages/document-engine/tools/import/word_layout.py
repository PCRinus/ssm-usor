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

# The fire-safety set and the contracts keep their layout until they are reviewed too.
OUTSIDE = ('fire', 'other')
OUTSIDE_FILES = ('act_aditional_semnare_electronica.docx',)

COMPATIBILITY_MODE = re.compile(r'(<w:compatSetting w:name="compatibilityMode"[^>]*?w:val=")\d+(")')
WORD_2013 = ('<w:compatSetting w:name="compatibilityMode" '
             'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>')
TABLE_INDENT = re.compile(r'<w:tblInd\b[^>]*/>')
ON_THE_MARGIN = '<w:tblInd w:w="0" w:type="dxa"/>'


def lays_out_as_word_2013(path):
    return (os.path.basename(os.path.dirname(path)) not in OUTSIDE
            and os.path.basename(path) not in OUTSIDE_FILES)


def word_2013_settings(xml):
    if COMPATIBILITY_MODE.search(xml):
        return COMPATIBILITY_MODE.sub(r'\g<1>15\2', xml)
    if '<w:compat>' in xml:
        return xml.replace('<w:compat>', f'<w:compat>{WORD_2013}', 1)
    if '<w:compat/>' in xml:
        return xml.replace('<w:compat/>', f'<w:compat>{WORD_2013}</w:compat>', 1)
    return xml.replace('</w:settings>', f'<w:compat>{WORD_2013}</w:compat></w:settings>', 1)


def tables_on_the_margin(xml):
    return TABLE_INDENT.sub(ON_THE_MARGIN, xml)


def word_2013_part(name, xml):
    if name == 'word/settings.xml':
        return word_2013_settings(xml)
    if re.fullmatch(r'word/[^/]+\.xml', name):
        return tables_on_the_margin(xml)
    return xml
