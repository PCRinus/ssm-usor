"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import unittest

from fonts import ARIAL_ENTRY, arial_part

ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'


class RunFonts(unittest.TestCase):
    def test_every_slot_becomes_arial(self):
        xml = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Century Gothic"/></w:rPr>'
        self.assertEqual(arial_part('word/numbering.xml', xml), f'<w:rPr>{ARIAL}</w:rPr>')

    def test_a_theme_font_gives_way(self):
        xml = '<w:rFonts w:asciiTheme="minorHAnsi" w:cstheme="minorBidi" w:hint="eastAsia"/>'
        self.assertEqual(
            arial_part('word/document.xml', xml),
            '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial" w:hint="eastAsia"/>')

    def test_runs_again_without_change(self):
        once = arial_part('word/footer1.xml', '<w:rFonts w:ascii="Verdana" w:cs="Arial"/>')
        self.assertEqual(arial_part('word/footer1.xml', once), once)


class DocumentDefault(unittest.TestCase):
    def test_names_arial_when_it_named_another(self):
        xml = ('<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman"/>'
               '<w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>')
        self.assertIn(f'<w:rPr>{ARIAL}<w:sz w:val="24"/></w:rPr>', arial_part('word/styles.xml', xml))

    def test_names_arial_when_it_named_none(self):
        xml = ('<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr>'
               '</w:rPrDefault></w:docDefaults></w:styles>')
        self.assertIn(f'<w:rPr>{ARIAL}<w:sz w:val="24"/></w:rPr>', arial_part('word/styles.xml', xml))

    def test_adds_one_when_there_is_none(self):
        self.assertIn(f'<w:docDefaults><w:rPrDefault><w:rPr>{ARIAL}</w:rPr></w:rPrDefault>',
                      arial_part('word/styles.xml', '<w:styles><w:docDefaults></w:docDefaults></w:styles>'))


class FontTable(unittest.TestCase):
    def test_keeps_arial_alone(self):
        arial = '<w:font w:name="Arial"><w:charset w:val="00"/></w:font>'
        xml = (f'<w:fonts x="1"><w:font w:name="Times New Roman"><w:charset w:val="00"/></w:font>'
               f'{arial}<w:font w:name="Symbol"/></w:fonts>')
        self.assertEqual(arial_part('word/fontTable.xml', xml), f'<w:fonts x="1">{arial}</w:fonts>')

    def test_declares_arial_when_it_was_missing(self):
        xml = '<w:fonts><w:font w:name="Times New Roman"/></w:fonts>'
        self.assertEqual(arial_part('word/fontTable.xml', xml), f'<w:fonts>{ARIAL_ENTRY}</w:fonts>')


class Theme(unittest.TestCase):
    def test_every_face_is_arial_and_no_script_has_its_own(self):
        xml = ('<a:minorFont><a:latin typeface="Calibri" panose="1"/><a:ea typeface=""/>'
               '<a:cs typeface="DejaVu Sans"/><a:font script="Jpan" typeface="MS Mincho"/></a:minorFont>')
        self.assertEqual(
            arial_part('word/theme/theme1.xml', xml),
            '<a:minorFont><a:latin typeface="Arial" panose="1"/><a:ea typeface="Arial"/>'
            '<a:cs typeface="Arial"/></a:minorFont>')


if __name__ == '__main__':
    unittest.main()
