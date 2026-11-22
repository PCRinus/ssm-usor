"""Arial everywhere in a template's saved XML, without an office.

The text runs were set in Arial, but the originals kept Times New Roman, Century Gothic and
others in their document defaults, their styles and their numbering, so an empty line, a tab or
an "Art. N." label still asked for them. The in-app editor packages Arial only and warns, on a
device without the font, that it shows a substitute. Every font a part names becomes Arial, a
theme font included, since a theme reference outranks the font beside it. Safe to run again.
"""

import re

FONT = 'Arial'
SLOTS = ('ascii', 'hAnsi', 'eastAsia', 'cs')
R_FONTS = re.compile(r'<w:rFonts\b([^>]*?)/>')
SLOT = re.compile(r'\s+w:(ascii|hAnsi|eastAsia|cs)="[^"]*"')
THEME_SLOT = re.compile(r'\s+w:(asciiTheme|hAnsiTheme|eastAsiaTheme|cstheme)="[^"]*"')
DEFAULT_RUN = re.compile(r'(<w:rPrDefault>\s*<w:rPr>)(.*?)(</w:rPr>)', re.S)
DEFAULT_RUN_EMPTY = re.compile(r'<w:rPrDefault>\s*(?:<w:rPr/>)?\s*</w:rPrDefault>|<w:rPrDefault/>')
ARIAL_SLOTS = ''.join(f' w:{slot}="{FONT}"' for slot in SLOTS)
FONT_ENTRY = re.compile(r'<w:font\b[^>]*?w:name="([^"]*)"[^>]*?(?:/>|>.*?</w:font>)', re.S)
ARIAL_ENTRY = (f'<w:font w:name="{FONT}"><w:panose1 w:val="020B0604020202020204"/>'
               '<w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>')
THEME_FACE = re.compile(r'(<a:(?:latin|ea|cs)\b[^>]*?\btypeface=")[^"]*(")')
SCRIPT_FACE = re.compile(r'<a:font\b[^>]*?\bscript="[^"]*"[^>]*/>')


def arial_fonts(attributes):
    """A run's fonts, every slot Arial; `w:hint` and the like stay."""
    kept = THEME_SLOT.sub('', SLOT.sub('', attributes)).strip()
    return f'<w:rFonts{ARIAL_SLOTS}{" " + kept if kept else ""}/>'


def runs_in_arial(xml):
    return R_FONTS.sub(lambda match: arial_fonts(match.group(1)), xml)


def default_font_arial(styles):
    """Whatever a run does not name falls back to the document default, so it names Arial."""
    def fill(match):
        properties = match.group(2)
        if R_FONTS.search(properties):
            return match.group(0)
        return f'{match.group(1)}<w:rFonts{ARIAL_SLOTS}/>{properties}{match.group(3)}'
    styles = DEFAULT_RUN_EMPTY.sub(f'<w:rPrDefault><w:rPr><w:rFonts{ARIAL_SLOTS}/></w:rPr></w:rPrDefault>',
                                   styles)
    if '<w:rPrDefault>' not in styles:
        defaults = f'<w:rPrDefault><w:rPr><w:rFonts{ARIAL_SLOTS}/></w:rPr></w:rPrDefault>'
        if '<w:docDefaults>' in styles:
            styles = styles.replace('<w:docDefaults>', f'<w:docDefaults>{defaults}', 1)
        else:
            styles = re.sub(r'(<w:styles\b[^>]*>)', rf'\1<w:docDefaults>{defaults}</w:docDefaults>', styles, 1)
    return DEFAULT_RUN.sub(fill, styles, 1)


def font_table_arial(xml):
    """Only Arial is declared; the others were the originals' and nothing names them now."""
    entries = [match for match in FONT_ENTRY.finditer(xml)]
    arial = next((match.group(0) for match in entries if match.group(1) == FONT), ARIAL_ENTRY)
    if not entries:
        return re.sub(r'(<w:fonts\b[^>]*?)(?:/>|>\s*</w:fonts>)', rf'\1>{arial}</w:fonts>', xml, 1)
    start, end = entries[0].start(), entries[-1].end()
    return xml[:start] + arial + xml[end:]


def theme_arial(xml):
    return SCRIPT_FACE.sub('', THEME_FACE.sub(rf'\g<1>{FONT}\g<2>', xml))


def arial_part(name, xml):
    """The part named `name` with Arial as its only font, or as it was if it names none."""
    if name == 'word/fontTable.xml':
        return font_table_arial(xml)
    if re.fullmatch(r'word/theme/theme\d*\.xml', name):
        return theme_arial(xml)
    if name == 'word/styles.xml':
        return default_font_arial(runs_in_arial(xml))
    if name.startswith('word/') and name.endswith('.xml'):
        return runs_in_arial(xml)
    return xml
