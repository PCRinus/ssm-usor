import unittest

from citation_notes import citation_notes


def paragraph(*runs, indent='<w:ind w:left="1270"/>'):
    return (f'<w:p><w:pPr><w:pStyle w:val="Normal"/>{indent}</w:pPr>'
            + ''.join(f'<w:r><w:rPr>{look}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>'
                      for look, text in runs) + '</w:p>')


ITALIC, BOLD_ITALIC, BOLD_STYLE = '<w:i/>', '<w:b/><w:bCs/><w:i/>', '<w:rStyle w:val="pt1"/>'


class Notes(unittest.TestCase):
    def setUp(self):
        self.xml = (paragraph((BOLD_STYLE + ITALIC, 'Conform Legii 319/2006 – Art. 10 alin. (1), (2): '),
                              (BOLD_ITALIC, '(1) '), (ITALIC, 'Angajatorul are obligații:'))
                    + '<w:bookmarkStart w:id="1" w:name="x"/>'
                    + paragraph((BOLD_ITALIC, 'a)'), (ITALIC, ' să ia măsurile, conform alin. (1);'))
                    + paragraph(('', 'Art. 281. Altceva'), indent=''))

    def test_sets_the_note_on_the_margin_only_its_citation_italic_and_its_labels_bold(self):
        out = citation_notes(self.xml)
        self.assertEqual(out.count('<w:ind w:left="0" w:hanging="0"/>'), 2)
        self.assertIn('<w:r><w:rPr><w:i/><w:iCs/><w:sz w:val="20"/></w:rPr>'
                      '<w:t>Conform Legii 319/2006 – Art. 10 alin. (1), (2):</w:t></w:r>', out)
        self.assertIn('<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/></w:rPr><w:t>(1)</w:t></w:r>', out)
        self.assertIn('<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/></w:rPr><w:t>a)</w:t></w:r>', out)
        self.assertIn('<w:r><w:rPr><w:sz w:val="20"/></w:rPr>'
                      '<w:t xml:space="preserve"> să ia măsurile, conform alin. (1);</w:t></w:r>', out)
        self.assertNotIn('pt1', out)
        self.assertIn('<w:t xml:space="preserve">Art. 281. Altceva</w:t>', out)

    def test_is_safe_to_run_again(self):
        once = citation_notes(self.xml)
        self.assertEqual(citation_notes(once), once)

    def test_leaves_a_sentence_in_a_list_alone(self):
        listed = ('<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr>'
                  '<w:r><w:t>Conform H.G. 1425/2006 – art. 55: reprezentanții</w:t></w:r></w:p>')
        self.assertEqual(citation_notes(listed), listed)


if __name__ == '__main__':
    unittest.main()
