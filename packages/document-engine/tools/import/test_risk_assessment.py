import re
import unittest

from risk_assessment import (LEVEL_ONE, LEVELS, LIMITS, N_G, N_R, R_SET, labelled, posts, sheet, sized_breaks,
                             submatrix)

RUN = ('<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>'
       '<w:t xml:space="preserve">{}</w:t></w:r>')


def paragraph(*runs, properties='<w:pPr><w:ind w:hanging="0"/></w:pPr>'):
    return f'<w:p>{properties}{"".join(runs)}</w:p>'


class Formulas(unittest.TestCase):
    def test_every_formula_keeps_to_what_the_in_app_editor_lays_out(self):
        for formula in [N_R, N_G, R_SET, *LIMITS]:
            self.assertNotRegex(formula, r'<w:rPr|<m:rPr|<m:ctrlPr|<m:(d|m|limLow|limUpp|eqArr)\b')
            self.assertEqual(set(re.findall(r'<m:(\w+)', formula)) - {'r', 't', 'f', 'num', 'den', 'sSub', 'e', 'sub', 'sup',
                                                                       'nary', 'naryPr', 'chr', 'limLoc', 'oMath'}, set())


    def test_a_submatrix_inside_a_sentence_is_text_at_the_texts_size(self):
        for matrix in [LEVEL_ONE] + [matrix for _, matrices, _ in LEVELS for matrix in matrices]:
            written = submatrix(*matrix)
            self.assertNotIn('<m:', written)
            self.assertEqual(set(re.findall(r'<w:sz w:val="(\d+)"/>', written)), {'20'})
        written = submatrix(*LEVEL_ONE)
        self.assertEqual(re.sub(r'<[^>]+>', '', written).replace('\u00a0', ' '),
                         'M1,p = ‖(1,1)  (1,2)  (1,3)  (1,4)  (1,5)  (1,6)‖, p = 1,…,6')
        self.assertRegex(written, r'<w:i/>.*?>M<.*?<w:vertAlign w:val="subscript"/>.*?>1,p<')


class Labels(unittest.TestCase):
    def test_a_typed_hyphen_and_its_tab_become_a_bold_dash_hanging_from_its_tier(self):
        typed = paragraph(RUN.format('-') .replace('</w:t>', '</w:t><w:tab/>'), RUN.format('clasa 1 → o dată la 2 ani;'))
        once = labelled(typed, r'[-–]?\s*', '–', left=720, hanging=360)
        self.assertIn('<w:ind w:left="720" w:hanging="360"/>', once)
        self.assertRegex(once, r'<w:b/>.*?<w:t xml:space="preserve">–</w:t></w:r><w:r><w:rPr>.*?</w:rPr><w:tab/></w:r>')
        self.assertEqual(re.sub(r'<[^>]+>', '', once), '–clasa 1 → o dată la 2 ani;')
        self.assertEqual(labelled(once, r'[-–]?\s*', '–', left=720, hanging=360), once)

    def test_an_old_label_gives_way_to_the_new_one(self):
        typed = paragraph(RUN.format('a. În timpul evaluării:'))
        changed = labelled(typed, r'[a-z][.)]\s*', 'a)', left=360, hanging=360)
        self.assertEqual(re.sub(r'<[^>]+>', '', changed), 'a)În timpul evaluării:')


class Breaks(unittest.TestCase):
    def test_a_bare_line_break_takes_the_properties_of_the_run_before_it(self):
        xml = paragraph(RUN.format('Unitatea: X'), '<w:r><w:br/></w:r>', RUN.format('Locul de muncă: Y'))
        self.assertIn('<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:br/></w:r>',
                      sized_breaks(xml))


class Sheet(unittest.TestCase):
    def cell(self, text):
        return f'<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr>{paragraph(RUN.format(text))}</w:tc>'

    def test_the_component_becomes_a_row_across_the_table(self):
        header = ''.join(self.cell(text) for text in ['Componenta', 'Factori', 'Forma', 'Consecința', 'Clasa de gravitate',
                                                      'Clasa de probabi-litate', 'Nivel de risc'])
        body = ''.join(self.cell(text) for text in ['{{#sheet}}{{component}}', '{{group}}', '{{code}}. {{description}}',
                                                    '{{consequence}}', '{{gravityClass}}', '{{probabilityClass}}',
                                                    '{{level}}{{/sheet}}'])
        table = (f'<w:tbl><w:tblPr/><w:tblGrid>{"<w:gridCol w:w=\"1000\"/>" * 7}</w:tblGrid>'
                 f'<w:tr>{header}</w:tr><w:tr>{body}</w:tr></w:tbl>')
        once = sheet(f'<w:body>{table}</w:body>')
        rows = re.findall(r'<w:tr\b.*?</w:tr>', once, re.S)
        self.assertEqual(len(rows), 3)
        self.assertIn('{{#sheetComponents}}{{label}}', rows[1])
        self.assertIn('<w:gridSpan w:val="6"/>', rows[1])
        self.assertEqual(rows[2].count('<w:tc>'), 6)
        self.assertIn('{{#rows}}{{group}}', rows[2])
        self.assertIn('{{/rows}}{{/sheetComponents}}', rows[2])
        self.assertNotIn('Componenta', once)
        self.assertIn('probabilitate', once)
        self.assertEqual(sheet(once), once)


class Posts(unittest.TestCase):
    def test_the_parts_of_a_posts_evaluation_read_in_sentence_case_after_their_numeral(self):
        parts = ['I. DEFINIREA LOCULUI DE MUNCĂ, ANALIZA PROCESULUI DE MUNCĂ ȘI DETERMINAREA ELEMENTELOR',
                 'II. IDENTIFICAREA FACTORILOR DE RISC SPECIFICI LOCULUI DE MUNCĂ',
                 'III. FIȘA DE EVALUARE A RISCURILOR DE ACCIDENTARE ȘI/SAU ÎMBOLNĂVIRE PROFESIONALĂ',
                 'IV. FIȘA DE MĂSURI PROPUSE', 'V. INTERPRETAREA REZULTATELOR EVALUĂRII']
        fields = [f'{field}: {{{{workSystem.x}}}}' for field in ('Executant', 'Sarcina de muncă', 'Mijloacele de producție',
                                                              'Mediul de muncă')]
        typed = ['{{$index}}. Factori de risc proprii {{of}}:', 'Nu au fost identificați factori de risc proprii {{of}}.',
                 '{{letter}}) {{name}}:', '{{code}}. {{description}}', ', după formula prezentată în capitolul II:',
                 'V.2. Nivelul de risc global al locului', '{{code}} – {{description}}', '{{measuresSentence}}']
        texts = [parts[0], *fields, parts[1], *typed[:4], parts[2], *typed[4:], parts[3], parts[4]]
        document = '<w:body>' + ''.join(paragraph(RUN.format(text), properties='<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>')
                                        for text in texts) + '</w:body>'
        once = posts(document)
        said = [re.sub(r'<[^>]+>', '', p) for p in re.findall(r'<w:p>.*?</w:p>', once)]
        self.assertIn('I. Definirea locului de muncă, analiza procesului de muncă și determinarea elementelor', said)
        self.assertIn('III. Fișa de evaluare a riscurilor de accidentare și/sau îmbolnăvire profesională', said)
        self.assertIn('IV. Fișa de măsuri propuse', said)
        self.assertIn('<w:spacing w:before="0" w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'
                      '<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">I. Definirea', once)
        self.assertEqual(posts(once), once)


if __name__ == '__main__':
    unittest.main()
