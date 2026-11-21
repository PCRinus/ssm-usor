import re
import unittest

from risk_assessment import (LEVEL_ONE, LEVELS, LIMITS, N_G, N_R, R_SET, labelled, sheet, sized_breaks, submatrix)

RUN = ('<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>'
       '<w:t xml:space="preserve">{}</w:t></w:r>')


def paragraph(*runs, properties='<w:pPr><w:ind w:hanging="0"/></w:pPr>'):
    return f'<w:p>{properties}{"".join(runs)}</w:p>'


class Formulas(unittest.TestCase):
    def test_every_formula_keeps_to_what_the_in_app_editor_lays_out(self):
        formulas = [N_R, N_G, R_SET, *LIMITS, submatrix(*LEVEL_ONE)]
        formulas += [submatrix(*matrix) for _, matrices, _ in LEVELS for matrix in matrices]
        for formula in formulas:
            self.assertNotRegex(formula, r'<w:rPr|<m:rPr|<m:ctrlPr|<m:(d|m|limLow|limUpp|eqArr)\b')
            self.assertEqual(set(re.findall(r'<m:(\w+)', formula)) - {'r', 't', 'f', 'num', 'den', 'sSub', 'e', 'sub', 'sup',
                                                                       'nary', 'naryPr', 'chr', 'limLoc', 'oMath'}, set())


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


if __name__ == '__main__':
    unittest.main()
