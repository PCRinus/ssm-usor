"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import re
import unittest

from typography import (article_labels, article_levels, article_paragraphs, dash_bullets, dash_lines_in_cells,
                        heading_line_of_its_own, house_order, lists, plain_articles, typed_hyphens, typography)

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

    def test_steps_every_tier_in_as_far_as_the_one_before(self):
        def indented(text, num, left):
            return paragraph(text, num=num).replace('</w:pPr>', f'<w:ind w:left="{left}" w:hanging="360"/></w:pPr>')
        document = body(indented('Instruirea:', 4, 720), indented('Instruirea se face:', 2, 1080),
                        indented('la angajare;', 3, 1800), indented('la detașare.', 3, 1800),
                        indented('Durata.', 2, 1080))
        numbering = NUMBERING.replace('</w:numbering>', f'<w:abstractNum w:abstractNumId="4">{level(0, "decimal", "%1.", 720)}'
                                      '</w:abstractNum><w:num w:numId="4"><w:abstractNumId w:val="4"/></w:num></w:numbering>')
        laid, _ = lists(document, STYLES, numbering)
        labels = [int(left) - int(hanging) for left, hanging in
                  re.findall(r'<w:ind w:left="(\d+)" w:hanging="(\d+)"/>', laid)]
        self.assertEqual(labels, [360, 720, 1080, 1080, 720])
        self.assertEqual(lists(laid, STYLES, numbering)[0], laid)

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

    def test_sets_every_article_label_on_the_margin_with_a_tab_to_its_text(self):
        hung = NUMBERING.replace('<w:lvlText w:val="Art. %1."/><w:pPr><w:ind w:left="0" w:hanging="0"/>',
                                 '<w:suff w:val="space"/><w:lvlText w:val="Art. %1."/><w:pPr><w:ind w:left="810" w:hanging="360"/>')
        article = re.search(r'<w:abstractNum w:abstractNumId="1">.*?</w:abstractNum>', article_levels(hung, wide=False)).group(0)
        self.assertNotIn('<w:suff', article)
        self.assertIn('<w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="0" w:hanging="0"/>', article)
        self.assertIn('w:pos="1080"', article_levels(hung, wide=True))
        self.assertIn('<w:ind w:left="720" w:hanging="360"/>', article_levels(hung, wide=False))


class ArticleLines(unittest.TestCase):
    def test_puts_the_label_and_note_on_a_line_of_their_own_only_above_numbered_paragraphs_or_a_list(self):
        self.assertTrue(heading_line_of_its_own('(1) Angajatorul asigură', '(2) Lucrătorii', False, True))
        self.assertTrue(heading_line_of_its_own('', '(1) Angajatorul asigură', False, True))
        self.assertTrue(heading_line_of_its_own('Se definesc termenii:', 'lucrător;', True, False))
        self.assertTrue(heading_line_of_its_own('Trusele sanitare cuprind:', '(1) Activități industriale', False, True))
        self.assertTrue(heading_line_of_its_own('Acțiuni în caz de incendiu: (1) Odată anunțați', '(2) Stingerea', False, True))
        self.assertTrue(heading_line_of_its_own('Neluarea măsurilor legale', '(1) Neluarea', False, True))
        self.assertFalse(heading_line_of_its_own('Instruirea are ca scop însușirea.', 'Altceva', False, False))
        self.assertFalse(heading_line_of_its_own('Conținutul trusei:', None, False, False))

    def test_cuts_an_article_after_its_note_and_keeps_the_line_with_its_text(self):
        document = body(paragraph('(Preluare din Legea 319/2006 – Art. 12 alin. (1) lit. c)) (1) Angajatorul asigură', num=1, after=60),
                        paragraph('(2) Lucrătorii respectă'))
        laid = article_paragraphs(document, STYLES, NUMBERING)
        first, second, third = re.findall(r'<w:p>.*?</w:p>', laid)
        self.assertEqual(re.sub(r'<[^>]+>', '', first), '(Preluare din Legea 319/2006 – Art. 12 alin. (1) lit. c))')
        self.assertIn('<w:keepNext/>', first)
        self.assertIn('w:after="120"', first)
        self.assertEqual(re.sub(r'<[^>]+>', '', second), '(1) Angajatorul asigură')
        self.assertNotIn('<w:numPr>', second)
        self.assertEqual(article_paragraphs(laid, STYLES, NUMBERING), laid)

    def test_leaves_a_one_paragraph_article_on_its_label_line(self):
        document = body(paragraph('(Preluare din H.G. 1425/2006 – Art. 75) Instruirea are ca scop însușirea.', num=1),
                        paragraph('Lucrătorii respectă instrucțiunile.'), paragraph('(Preluare din H.G. 1425/2006 – Art. 76) (1) Instruirea', num=1))
        laid = article_paragraphs(document, STYLES, NUMBERING)
        self.assertEqual(laid.split('Lucrătorii')[0], document.split('Lucrătorii')[0])

    def test_cuts_an_article_without_a_note_after_its_label(self):
        document = body(paragraph('Periodicitatea controalelor este stabilită astfel:', num=1),
                        paragraph('lunar;', num=2))
        first, second, _ = re.findall(r'<w:p>.*?</w:p>', article_paragraphs(document, STYLES, NUMBERING))
        self.assertEqual(re.sub(r'<[^>]+>', '', first), '')
        self.assertIn('<w:numId w:val="1"/>', first)
        self.assertEqual(re.sub(r'<[^>]+>', '', second), 'Periodicitatea controalelor este stabilită astfel:')

    def test_gives_a_title_its_own_paragraph_above_an_articles_alineats(self):
        document = body(paragraph('Neluarea măsurilor legale', num=1), paragraph('(1) Neluarea vreuneia'),
                        paragraph('(2) Pedeapsa'))
        texts = [re.sub(r'<[^>]+>', '', item) for item in re.findall(r'<w:p>.*?</w:p>', article_paragraphs(document, STYLES, NUMBERING))]
        self.assertEqual(texts, ['', 'Neluarea măsurilor legale', '(1) Neluarea vreuneia', '(2) Pedeapsa'])
        document = body(paragraph('Acțiuni în caz de incendiu: (1) Odată anunțați', num=1), paragraph('(2) Stingerea'))
        laid = article_paragraphs(document, STYLES, NUMBERING)
        texts = [re.sub(r'<[^>]+>', '', item) for item in re.findall(r'<w:p>.*?</w:p>', laid)]
        self.assertEqual(texts, ['', 'Acțiuni în caz de incendiu:', '(1) Odată anunțați', '(2) Stingerea'])
        self.assertEqual(article_paragraphs(laid, STYLES, NUMBERING), laid)


class HouseOrder(unittest.TestCase):
    def test_relabels_a_letters_list_that_holds_numbers_as_numbers_over_letters(self):
        def indented(text, num, left):
            return paragraph(text, num=num).replace('</w:pPr>', f'<w:ind w:left="{left}" w:hanging="360"/></w:pPr>')
        numbering = NUMBERING.replace('</w:numbering>', f'<w:abstractNum w:abstractNumId="4">{level(0, "decimal", "%1.", 1080)}'
                                      '</w:abstractNum><w:num w:numId="4"><w:abstractNumId w:val="4"/></w:num></w:numbering>')
        document = body(paragraph('Reguli:'), indented('Evacuarea:', 2, 720), indented('Menținerea:', 4, 1080),
                        indented('căilor;', 3, 1440), indented('Limitarea.', 2, 720), paragraph('După.'),
                        indented('Altă listă', 2, 720))
        laid, relabelled = house_order(document, STYLES, numbering)
        items = re.findall(r'<w:p>.*?</w:p>', laid)
        first, second = (re.search(r'<w:numId w:val="(\d+)"/>', items[index]).group(1) for index in (1, 2))
        def format_of(num):
            abstract = re.search(rf'<w:num w:numId="{num}"><w:abstractNumId w:val="(\d+)"/>', relabelled).group(1)
            return re.search(rf'<w:abstractNum w:abstractNumId="{abstract}">.*?<w:lvlText w:val="([^"]*)"/>', relabelled).group(1)
        self.assertEqual((format_of(first), format_of(second)), ('%1.', '%1)'))
        self.assertIn('<w:numId w:val="3"/>', items[3])
        self.assertIn('<w:numId w:val="2"/>', items[6])
        self.assertEqual(house_order(laid, STYLES, relabelled), (laid, relabelled))

    def test_prints_a_typed_hyphen_as_an_en_dash(self):
        document = body(paragraph('- nivelul 2: elementul (4,1);'), paragraph('Valoarea -5 rămâne.'))
        laid = typed_hyphens(document)
        texts = [re.sub(r'<[^>]+>', '', item) for item in re.findall(r'<w:p>.*?</w:p>', laid)]
        self.assertEqual(texts, ['– nivelul 2: elementul (4,1);', 'Valoarea -5 rămâne.'])


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
