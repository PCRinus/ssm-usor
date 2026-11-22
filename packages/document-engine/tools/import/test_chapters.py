import unittest

from chapters import (articles_from_chapter_one, chapters_on_new_pages, contents_on_its_own_page, in_sentence_case,
                      sentence_case, titled_contents)


class SentenceCase(unittest.TestCase):
    def test_a_chapter_in_capitals_reads_in_sentence_case(self):
        self.assertEqual(sentence_case('CAPITOLUL III. PREZENTAREA UNITĂȚII'), 'Capitolul III. Prezentarea unității')
        self.assertEqual(sentence_case('SUBCAPITOLUL VI.II. RECOMANDĂRI'), 'Subcapitolul VI.II. Recomandări')
        self.assertEqual(sentence_case('BIBLIOGRAFIE'), 'Bibliografie')

    def test_keeps_abbreviations_proper_names_and_merge_tags(self):
        self.assertEqual(
            sentence_case('CAPITOLUL V. METODA I.N.C.D.P.M. BUCUREȘTI LA {{client.legalName}}'),
            'Capitolul V. Metoda I.N.C.D.P.M. București la {{client.legalName}}')
        self.assertEqual(sentence_case('SUBCAPITOLUL V.{{roman}}. EVALUAREA PENTRU {{subject}}'),
                         'Subcapitolul V.{{roman}}. Evaluarea pentru {{subject}}')

    def test_an_abbreviation_of_plain_words_takes_small_letters(self):
        self.assertEqual(sentence_case('CAPITOLUL I. EVALUARE D.P.D.V. AL S.S.M.'),
                         'Capitolul I. Evaluare d.p.d.v. al S.S.M.')

    def test_an_annex_keeps_its_label_and_starts_its_title_with_a_capital(self):
        self.assertEqual(sentence_case('Anexa Nr. 5.SCALA DE RISC/ SECURITATE'), 'Anexa Nr. 5.Scala de risc/ securitate')

    def test_leaves_a_heading_already_in_sentence_case(self):
        text = 'Capitolul VII. Acordarea E.I.P. (echipamentul individual de protecție)'
        self.assertEqual(sentence_case(text), text)


class Paragraphs(unittest.TestCase):
    def test_recases_across_runs_and_reads_the_sentence_case_field(self):
        paragraph = ('<w:p><w:r><w:t>SUBCAPITOLUL V.{{roman}}. EVAL</w:t></w:r><w:r><w:br/></w:r>'
                     '<w:r><w:t xml:space="preserve">UAREA PENTRU {{heading}}</w:t></w:r></w:p>')
        self.assertEqual(in_sentence_case(paragraph),
                         '<w:p><w:r><w:t>Subcapitolul V.{{roman}}. Eval</w:t></w:r><w:r><w:br/></w:r>'
                         '<w:r><w:t xml:space="preserve">uarea pentru {{subject}}</w:t></w:r></w:p>')

    def test_heads_a_contents_cuprins_in_the_look_of_its_first_run(self):
        paragraph = ('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>CUPRINS IPSSM</w:t></w:r>'
                     '<w:r><w:rPr><w:rStyle w:val="tpt1"/><w:b/></w:rPr><w:t xml:space="preserve"> – {{client.legalName}}</w:t></w:r></w:p>')
        self.assertEqual(titled_contents(paragraph),
                         '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Cuprins</w:t></w:r></w:p>')


def paragraph(text, style=None):
    properties = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
    return f'<w:p>{properties}<w:r><w:t>{text}</w:t></w:r></w:p>'


class Pages(unittest.TestCase):
    def test_a_chapter_after_the_contents_starts_a_page_and_a_subchapter_does_not(self):
        contents = '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p/></w:sdtContent></w:sdt>'
        xml = chapters_on_new_pages(paragraph('Cuprins') + contents + paragraph('Capitolul I. A', 'Heading1')
                                    + paragraph('Subcapitolul I.I. B', 'Heading2') + paragraph('Bibliografie', 'Heading1'))
        self.assertEqual(xml.count('<w:pageBreakBefore/>'), 2)
        self.assertNotIn('<w:pageBreakBefore/></w:pPr><w:r><w:t>Subcapitolul', xml)

    def test_without_contents_the_first_typed_chapter_stays_under_the_title(self):
        xml = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('text') + paragraph('CAPITOLUL II. B'))
        self.assertEqual(xml.count('<w:pageBreakBefore/>'), 1)
        self.assertRegex(xml, r'<w:pageBreakBefore/>[^/]*/></w:pPr><w:r><w:t>Capitolul II. B')

    def test_a_typed_heading_is_nearer_its_text_than_what_comes_before_it(self):
        xml = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('SUBCAPITOLUL I.I B') + paragraph('text')
                                    + paragraph('CAPITOLUL II. C'))
        self.assertIn('<w:spacing w:after="200" w:before="0"/></w:pPr><w:r><w:t>Capitolul I. A', xml)
        self.assertIn('<w:spacing w:after="120" w:before="240"/></w:pPr><w:r><w:t>Subcapitolul I.I. B', xml)
        self.assertRegex(xml, r'<w:spacing w:after="200" w:before="120"/></w:pPr><w:r><w:t>Capitolul II. C')

    def test_a_typed_subchapter_reads_in_sentence_case_its_label_closed_by_a_dot(self):
        xml = chapters_on_new_pages(paragraph('SUBCAPITOLUL I.I PLANUL INSTRUIRII / 4 ORE'))
        self.assertIn('<w:t>Subcapitolul I.I. Planul instruirii / 4 ore</w:t>', xml)

    def test_the_last_lines_before_a_chapter_keep_together(self):
        xml = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('x' * 300) + paragraph('Agenți chimici:')
                                    + paragraph('– plumbul')
                                    + paragraph('2. Condiții de muncă') + paragraph('Activități subterane miniere.')
                                    + paragraph('CAPITOLUL II. B'))
        self.assertEqual(xml.count('<w:keepNext/>'), 3)
        self.assertIn('<w:keepNext/></w:pPr><w:r><w:t>Agenți chimici:', xml)
        self.assertIn('<w:keepNext/></w:pPr><w:r><w:t>– plumbul', xml)
        self.assertIn('<w:keepNext/></w:pPr><w:r><w:t>2. Condiții', xml)

    def test_a_long_last_paragraph_keeps_its_lines_by_itself(self):
        xml = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('scurt') + paragraph('x' * 300)
                                    + paragraph('CAPITOLUL II. B'))
        self.assertNotIn('<w:keepNext/>', xml)

    def test_drops_the_empty_paragraphs_right_before_a_chapter(self):
        spacer = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr></w:r></w:p>'
        picture = '<w:p><w:r><w:drawing/></w:r></w:p>'
        xml = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('text') + picture + spacer + spacer
                                    + paragraph('CAPITOLUL II. B'))
        self.assertNotIn('w:val="2"', xml)
        self.assertIn(picture, xml)

    def test_runs_again_without_a_second_break(self):
        once = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('CAPITOLUL II. B'))
        self.assertEqual(chapters_on_new_pages(once), once)


CONTENTS = ('<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr>'
            '<w:sdtContent><w:p/></w:sdtContent></w:sdt>')
ARTICLES = ('<w:abstractNum w:abstractNumId="4"><w:lvl w:ilvl="0"><w:lvlText w:val="Art. %1."/></w:lvl></w:abstractNum>'
            '<w:abstractNum w:abstractNumId="5"><w:lvl w:ilvl="0"><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>'
            '<w:num w:numId="9"><w:abstractNumId w:val="4"/></w:num><w:num w:numId="10"><w:abstractNumId w:val="5"/></w:num>')


def numbered(text, list_id):
    return (f'<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="{list_id}"/></w:numPr></w:pPr>'
            f'<w:r><w:t>{text}</w:t></w:r></w:p>')


class OpeningPages(unittest.TestCase):
    def test_an_article_before_the_contents_loses_its_number_and_a_list_keeps_its_own(self):
        xml = articles_from_chapter_one(numbered('Odată cu…:', 9) + numbered('Decizia', 10) + CONTENTS
                                        + numbered('În sensul…', 9), ARTICLES)
        self.assertEqual(xml.count('<w:numId w:val="9"/>'), 1)
        self.assertEqual(xml.count('<w:numId w:val="10"/>'), 1)
        self.assertTrue(xml.index('<w:numId w:val="9"/>') > xml.index('Table of Contents'))

    def test_contents_after_text_start_a_page_and_at_the_top_do_not(self):
        after = contents_on_its_own_page(paragraph('Titlu') + paragraph('Cuprins') + CONTENTS)
        self.assertIn('<w:pageBreakBefore/></w:pPr><w:r><w:t>Cuprins', after)
        self.assertNotIn('pageBreakBefore', contents_on_its_own_page(paragraph('Cuprins') + CONTENTS))


if __name__ == '__main__':
    unittest.main()
