"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import unittest

from word_layout import WORD_2013, tables_on_the_margin, word_2013_settings

OPEN = '<w:settings xmlns:w="w" xmlns:w14="w14">'


class Word2013Settings(unittest.TestCase):
    def test_sets_the_mode_it_finds(self):
        xml = (f'{OPEN}<w:compat><w:compatSetting w:name="compatibilityMode" '
               'w:uri="http://schemas.microsoft.com/office/word" w:val="11"/></w:compat></w:settings>')
        self.assertEqual(word_2013_settings(xml), f'{OPEN}<w:compat>{WORD_2013}</w:compat></w:settings>')

    def test_sets_the_mode_whatever_the_order_of_its_attributes(self):
        xml = (f'{OPEN}<w:compat><w:compatSetting w:val="12" w:uri="u" w:name="compatibilityMode"/>'
               '</w:compat></w:settings>')
        result = word_2013_settings(xml)
        self.assertEqual(result.count('compatibilityMode'), 1)
        self.assertIn('<w:compatSetting w:val="15" w:uri="u" w:name="compatibilityMode"/>', result)

    def test_adds_the_mode_after_the_legacy_flags(self):
        xml = f'{OPEN}<w:compat><w:doNotBreakWrappedTables/></w:compat></w:settings>'
        self.assertEqual(
            word_2013_settings(xml),
            f'{OPEN}<w:compat><w:doNotBreakWrappedTables/>{WORD_2013}</w:compat></w:settings>')

    def test_fills_an_empty_compat(self):
        self.assertEqual(word_2013_settings(f'{OPEN}<w:compat/></w:settings>'),
                         f'{OPEN}<w:compat>{WORD_2013}</w:compat></w:settings>')

    def test_adds_compat_where_the_schema_puts_it(self):
        xml = (f'{OPEN}<w:defaultTabStop w:val="720"/><w:rsids><w:rsidRoot w:val="1"/></w:rsids>'
               '<w:decimalSymbol w:val=","/></w:settings>')
        self.assertEqual(
            word_2013_settings(xml),
            f'{OPEN}<w:defaultTabStop w:val="720"/><w:compat>{WORD_2013}</w:compat>'
            '<w:rsids><w:rsidRoot w:val="1"/></w:rsids><w:decimalSymbol w:val=","/></w:settings>')

    def test_adds_compat_before_the_extensions(self):
        xml = f'{OPEN}<w:defaultTabStop w:val="720"/><w14:docId w14:val="1"/></w:settings>'
        self.assertEqual(
            word_2013_settings(xml),
            f'{OPEN}<w:defaultTabStop w:val="720"/><w:compat>{WORD_2013}</w:compat>'
            '<w14:docId w14:val="1"/></w:settings>')


class TablesOnTheMargin(unittest.TestCase):
    def test_sets_every_indent_to_zero(self):
        xml = '<w:tblPr><w:tblInd w:w="55" w:type="dxa"/></w:tblPr><w:tblInd w:type="dxa" w:w="221"/>'
        self.assertEqual(tables_on_the_margin(xml),
                         '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/></w:tblPr><w:tblInd w:w="0" w:type="dxa"/>')


if __name__ == '__main__':
    unittest.main()
