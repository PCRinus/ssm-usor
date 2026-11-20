import re
import unittest

from decision_pages import decision_pages
from signatures import LABEL, SIGNING_ROOM, LABEL_LINE, signing_space


def paragraph(text, bold=False, before=0):
    weight = '<w:b/>' if bold else ''
    return (f'<w:p><w:pPr><w:spacing w:before="{before}" w:after="0"/><w:jc w:val="center"/></w:pPr>'
            f'<w:r><w:rPr>{weight}<w:sz w:val="20"/></w:rPr><w:t>{text}</w:t></w:r></w:p>')


def texts(xml):
    return [''.join(re.findall(r'<w:t\b[^>]*>([^<]*)</w:t>', p)) for p in re.findall(r'<w:p\b[^>]*>.*?</w:p>', xml, re.S)]


DECISION = ''.join([
    paragraph('Art. 8. Prezenta decizie se comunică.'),
    paragraph('{{client.legalName}}', bold=True, before=480),
    paragraph('{{client.representativeRole}}'),
    paragraph('{{client.representativeName}}', bold=True),
])


def cell(*paragraphs):
    return f'<w:tc><w:tcPr><w:tcW w:w="4677" w:type="dxa"/><w:tcBorders></w:tcBorders></w:tcPr>{"".join(paragraphs)}</w:tc>'


HANDOVER = (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid><w:gridCol w:w="4677"/>'
    '<w:gridCol w:w="4678"/></w:tblGrid><w:tr>'
    + cell(paragraph('Am întocmit și predat un exemplar'), paragraph('{{provider.representativeName}}', bold=True, before=840),
           paragraph('{{provider.representativeRole}} al {{provider.legalName}}'))
    + cell(paragraph('Am primit și aprobat'), paragraph('Am luat cunoștință'),
           paragraph('{{client.representativeName}}', bold=True, before=840),
           paragraph('{{client.representativeRole}} al {{client.legalName}}'), paragraph('Data: ______'))
    + '</w:tr></w:tbl>'
)


class SigningSpace(unittest.TestCase):
    def test_a_decision_signs_under_the_space_and_its_label(self):
        once = signing_space(DECISION)
        self.assertEqual(texts(once), ['Art. 8. Prezenta decizie se comunică.', '{{client.legalName}}',
                                       '{{client.representativeRole}}', LABEL, '{{client.representativeName}}'])
        self.assertIn(f'w:before="{SIGNING_ROOM - LABEL_LINE}"', once)
        self.assertEqual(once.count('<w:keepNext w:val="true"/>'), 4)
        self.assertEqual(signing_space(once), once)

    def test_a_decision_keeps_the_line_a_loop_repeats_with_its_signature(self):
        looped = DECISION.replace(paragraph('Art. 8. Prezenta decizie se comunică.'), ''.join([
            paragraph('Art. 8. Prezenta decizie se comunică.'), paragraph('{{#workersRepresentatives}}'),
            paragraph('{{name}}, având funcția de {{jobTitle}}.'), paragraph('{{/workersRepresentatives}}')]))
        kept = [text for text, p in zip(texts(signing_space(looped)), re.findall(r'<w:p\b[^>]*>.*?</w:p>', signing_space(looped), re.S))
                if '<w:keepNext w:val="true"/>' in p]
        self.assertEqual(kept, ['{{name}}, având funcția de {{jobTitle}}.', '{{client.legalName}}',
                                '{{client.representativeRole}}', LABEL])

    def test_a_handover_block_lines_up_its_sides_in_rows(self):
        once = signing_space(HANDOVER)
        rows = re.findall(r'<w:tr\b[^>]*>.*?</w:tr>', once, re.S)
        self.assertEqual([texts(row) for row in rows], [
            ['Am întocmit și predat un exemplar', 'Am primit și aprobat', 'Am luat cunoștință'],
            ['{{provider.representativeRole}} al {{provider.legalName}}', '{{client.representativeRole}} al {{client.legalName}}'],
            [LABEL, '{{provider.representativeName}}', LABEL, '{{client.representativeName}}'],
            ['Data: ____________________', 'Data: ______'],
        ])
        self.assertNotIn('<w:b/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">Data', once)
        self.assertEqual(signing_space(once), once)

    def test_a_ruled_table_is_left_alone(self):
        ruled = HANDOVER.replace('<w:tcBorders></w:tcBorders>', '<w:tcBorders><w:top w:val="single" w:sz="4"/></w:tcBorders>')
        self.assertEqual(signing_space(ruled), ruled)


class DecisionPages(unittest.TestCase):
    PARTS = {
        'word/document.xml': ('<w:document><w:body>' + paragraph('Nr. {{decisionNumber}} SSM din {{issueDate}}')
                              + '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgMar w:header="0" '
                              'w:top="1134"/><w:formProt w:val="false"/><w:textDirection w:val="lrTb"/></w:sectPr>'
                              '</w:body></w:document>'),
        'word/footer1.xml': '<w:ftr xmlns:w="w">' + paragraph('{{#branding}}Document generat{{/branding}}') + '</w:ftr>',
        'word/_rels/document.xml.rels': '<Relationships></Relationships>',
        '[Content_Types].xml': '<Types></Types>',
    }

    def test_a_decision_numbers_its_pages_at_the_top_and_names_itself_from_the_second(self):
        once = decision_pages(self.PARTS)
        self.assertEqual(texts(once['word/header1.xml']),
                         ['Decizia nr. {{decisionNumber}} SSM din {{issueDate}} · {{client.legalName}}', 'Pag. 1 din 1', ''])
        self.assertEqual(texts(once['word/header2.xml']), ['', 'Pag. 1 din 1', ''])
        self.assertNotIn('<w:tblBorders>', once['word/header2.xml'])
        self.assertRegex(once['word/document.xml'], r'<w:formProt w:val="false"/><w:titlePg/><w:textDirection')
        self.assertIn('w:header="680"', once['word/document.xml'])
        self.assertEqual(texts(once['word/footer1.xml']), ['{{#branding}}Document generat{{/branding}}'])
        self.assertEqual(decision_pages(once), once)

    def test_a_page_number_left_in_a_footer_goes(self):
        numbered = dict(self.PARTS, **{'word/footer1.xml': self.PARTS['word/footer1.xml'].replace(
            '<w:p>', '<w:p><w:r><w:instrText> PAGE </w:instrText></w:r></w:p><w:p>', 1)})
        self.assertEqual(decision_pages(numbered)['word/footer1.xml'], self.PARTS['word/footer1.xml'])

    def test_any_other_document_is_left_alone(self):
        other = dict(self.PARTS, **{'word/document.xml': self.PARTS['word/document.xml'].replace('SSM', 'SU')})
        self.assertEqual(decision_pages(other), other)


if __name__ == '__main__':
    unittest.main()
