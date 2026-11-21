import unittest

from chapters import chapters_on_new_pages, in_sentence_case, sentence_case, titled_contents


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
        self.assertIn('<w:pageBreakBefore/></w:pPr><w:r><w:t>CAPITOLUL II.', xml)

    def test_runs_again_without_a_second_break(self):
        once = chapters_on_new_pages(paragraph('CAPITOLUL I. A') + paragraph('CAPITOLUL II. B'))
        self.assertEqual(chapters_on_new_pages(once), once)


if __name__ == '__main__':
    unittest.main()
