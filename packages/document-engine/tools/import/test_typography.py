"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import re
import unittest

from typography import article_labels, article_tabs, dash_bullets, dash_lines_in_cells, lists, plain_articles, typography

STYLES = ('<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
          '<w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>'
          '<w:style w:type="paragraph" w:styleId="Paragraph1"><w:name w:val="Paragraph 1"/><w:basedOn w:val="Normal"/>'
          '<w:pPr><w:keepNext w:val="true"/><w:spacing w:before="240" w:after="60"/></w:pPr>'
          '<w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style></w:styles>')


def level(ilvl, fmt, text, left, hanging=360):
    return (f'<w:lvl w:ilvl="{ilvl}"><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{text}"/>'
            f'<w:pPr><w:ind w:left="{left}" w:hanging="{hanging}"/></w:pPr></w:lvl>')


NUMBERING = ('<w:numbering>'
             f'<w:abstractNum w:abstractNumId="1">{level(0, "decimal", "Art. %1.", 0, 0)}</w:abstractNum>'
             f'<w:abstractNum w:abstractNumId="2">{level(0, "lowerLetter", "%1)", 720)}</w:abstractNum>'
             f'<w:abstractNum w:abstractNumId="3">{level(0, "bullet", "•", 720)}</w:abstractNum>'
             '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>'
             '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>'
             '<w:num w:numId="3"><w:abstractNumId w:val="3"/></w:num></w:numbering>')


def paragraph(text, num=None, style=None, after=None, bold=None):
    properties = ''
    if style:
        properties += f'<w:pStyle w:val="{style}"/>'
    if num:
        properties += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>'
    if after is not None:
        properties += f'<w:spacing w:before="0" w:after="{after}"/>'
    run = '<w:rPr><w:b/></w:rPr>' if bold else ''
    return f'<w:p><w:pPr>{properties}</w:pPr><w:r>{run}<w:t xml:space="preserve">{text}</w:t></w:r></w:p>'


def body(*blocks):
    return f'<w:document><w:body>{"".join(blocks)}</w:body></w:document>'


def runs(xml, text):
    return [run for run in re.findall(r'<w:r>.*?</w:r>', xml) if text in run]


class Articles(unittest.TestCase):
    def test_only_the_labels_of_an_article_are_bold_and_its_note_italic(self):
        document = body(paragraph('(Preluare din H.G. 1425/2006 – Art. 4 alin. (1)) Angajatorul asigură', num=1, style='Paragraph1'),
                        paragraph('(2) Lucrătorii respectă', style='Paragraph1'))
        document, styles = plain_articles(document, STYLES)
        style = re.search(r'<w:style\b[^>]*w:styleId="Paragraph1".*?</w:style>', styles).group(0)
        self.assertNotIn('<w:b/>', style)
        self.assertNotIn('keepNext', style)
        self.assertIn('<w:sz w:val="20"/>', style)
        note = runs(document, '(Preluare din')[0]
        self.assertIn('<w:i/>', note)
        self.assertIn('<w:b w:val="false"/>', note)
        self.assertTrue(note.endswith('alin. (1))</w:t></w:r>'))
        self.assertIn('<w:b/>', runs(document, '(2)')[0])
        self.assertNotIn('<w:b/>', runs(document, 'Lucrătorii')[0])

    def test_leaves_a_centred_title_style_bold(self):
        document = body('<w:p><w:pPr><w:pStyle w:val="Paragraph1"/><w:jc w:val="center"/></w:pPr>'
                        '<w:r><w:t>{{client.legalName}}</w:t></w:r></w:p>')
        _, styles = plain_articles(document, STYLES)
        self.assertEqual(styles, STYLES)


class Labels(unittest.TestCase):
    def test_bolds_a_typed_label_and_clears_bold_from_an_articles_body(self):
        article = ('<w:p><w:pPr><w:pStyle w:val="Paragraph1"/></w:pPr><w:r><w:t xml:space="preserve">(3) </w:t></w:r>'
                   '<w:r><w:rPr><w:rStyle w:val="tal1"/><w:b/></w:rPr><w:t>Angajatorul asigură, conform alin. (1),</w:t></w:r></w:p>')
        document = article_labels(body(article, paragraph('a) mijloacele;')), STYLES)
        self.assertIn('<w:b/>', runs(document, '(3)')[0])
        self.assertIn('<w:b w:val="false"/>', runs(document, 'Angajatorul')[0])
        self.assertIn('<w:b/>', runs(document, 'a)')[0])
        self.assertEqual(article_labels(document, STYLES), document)


class Lists(unittest.TestCase):
    def test_hangs_a_sub_list_one_tier_under_the_item_that_introduces_it(self):
        document = body(paragraph('Măsuri:', num=2), paragraph('căilor de evacuare;', num=3),
                        paragraph('ușilor.', num=3), paragraph('Se interzice fumatul.', num=2))
        laid, _ = lists(document, STYLES, NUMBERING)
        items = re.findall(r'<w:p>.*?</w:p>', laid)
        for item in items[1:3]:
            self.assertIn('<w:ind w:left="1080" w:hanging="360"/>', item)
        self.assertNotIn('<w:ind', items[0] + items[3])

    def test_bolds_a_letter_and_spaces_a_list_close_under_its_lead_in(self):
        document = body(paragraph('Angajatorul asigură:', after=120), paragraph('instruirea;', num=2, after=120),
                        paragraph('controlul.', num=2, after=40), paragraph('(2) Lucrătorii'))
        laid, numbering = lists(document, STYLES, NUMBERING)
        items = re.findall(r'<w:p>.*?</w:p>', laid)
        self.assertIn('w:after="40"', items[0])
        self.assertIn('w:after="40"', items[1])
        self.assertIn('w:before="120"', items[3])
        self.assertRegex(re.search(r'<w:abstractNum w:abstractNumId="2">.*?</w:abstractNum>', numbering).group(0), r'<w:b/>')

    def test_reads_a_dash_typed_with_a_tab_as_a_list_item(self):
        typed = '<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/><w:spacing w:before="0" w:after="40"/></w:pPr><w:r><w:t>–</w:t><w:tab/><w:t>Verificați.</w:t></w:r></w:p>'
        laid, _ = lists(body(paragraph('Verificarea înainte de ridicare:', after=120), typed), STYLES, NUMBERING)
        self.assertIn('w:after="40"', re.findall(r'<w:p>.*?</w:p>', laid)[0])

    def test_draws_every_bullet_as_an_en_dash_and_keeps_numbers(self):
        numbering = dash_bullets(NUMBERING)
        self.assertNotIn('•', numbering)
        self.assertIn('<w:lvlText w:val="–"/>', numbering)
        self.assertIn('<w:lvlText w:val="%1)"/>', numbering)

    def test_sets_the_article_tab_at_the_decisions_stop(self):
        numbering = NUMBERING.replace('<w:pPr><w:ind w:left="0" w:hanging="0"/>',
                                      '<w:pPr><w:tabs><w:tab w:val="num" w:pos="850"/></w:tabs><w:ind w:left="0" w:hanging="0"/>')
        self.assertIn('w:pos="720"', article_tabs(numbering))


class Cells(unittest.TestCase):
    def test_makes_each_dash_line_of_a_cell_a_paragraph_that_hangs_from_its_dash(self):
        cell = ('<w:tbl><w:tr><w:tc><w:p><w:pPr><w:ind w:left="0" w:hanging="0"/></w:pPr>'
                '<w:r><w:t xml:space="preserve">– Verificarea periodică.</w:t><w:br/>'
                '<w:t xml:space="preserve">- Instruirea lucrătorilor.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
        split = dash_lines_in_cells(body(cell))
        items = re.findall(r'<w:p>.*?</w:p>', split)
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertIn('<w:ind w:left="170" w:hanging="170"/>', item)
            self.assertIn('<w:t xml:space="preserve">–</w:t><w:tab/>', item)
        self.assertNotIn('<w:br/>', split)


class Again(unittest.TestCase):
    def test_changes_nothing_the_second_time(self):
        document = body(paragraph('(Preluare din Legea 319/2006) Text', num=1, style='Paragraph1'),
                        paragraph('Măsuri:', num=2), paragraph('căilor;', num=3), paragraph('Final.'))
        once = typography(document, STYLES, NUMBERING, False)
        twice = typography(*once, False)
        self.assertEqual(once, twice)


if __name__ == '__main__':
    unittest.main()
