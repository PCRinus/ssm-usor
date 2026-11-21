import re
import unittest

import decision_pages
import landscape_binding
from table_style import (PORTRAIT_KEEP_ROOM, body_floors, closes_its_page, element, house_table, in_schema_order,
                         in_schema_values, is_signed_list, keep_together, kind_of, on_the_scale, page_room,
                         safety_colour, safety_colours, without)

ROW = '<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:tc></w:tr>'
def table(rows, properties=''):
    return f'<w:tbl><w:tblPr>{properties}</w:tblPr>{"".join(ROW.format(row) for row in rows)}</w:tbl>'


class PropertyChildren(unittest.TestCase):
    def test_a_paragraphs_spacing_is_not_its_marks_character_spacing(self):
        inner = '<w:jc w:val="left"/><w:rPr><w:spacing w:val="3"/></w:rPr>'
        self.assertIsNone(element(inner, 'spacing'))
        self.assertEqual(without(inner, 'spacing'), inner)
        inner = '<w:spacing w:after="0"/>' + inner
        self.assertEqual(element(inner, 'spacing'), '<w:spacing w:after="0"/>')
        self.assertEqual(without(inner, 'spacing'), '<w:jc w:val="left"/><w:rPr><w:spacing w:val="3"/></w:rPr>')

    def test_run_properties_are_still_found(self):
        self.assertEqual(element('<w:jc/><w:rPr><w:b/></w:rPr>', 'rPr'), '<w:rPr><w:b/></w:rPr>')


class SafetyColours(unittest.TestCase):
    def test_a_strong_fill_is_the_safety_colour_it_stands_for(self):
        for fill, colour in (('FF0000', 'red'), ('FFFF00', 'yellow'), ('3366FF', 'blue'), ('00CC00', 'green'),
                             ('B71F2E', 'red'), ('F9A800', 'yellow'), ('005387', 'blue'), ('237F52', 'green')):
            self.assertEqual(safety_colour(fill), colour, fill)
        for fill in ('E3E8E0', 'F1F4EF', 'F3F3F3', 'FFFFFF', '000000', 'auto'):
            self.assertIsNone(safety_colour(fill), fill)

    def test_a_cell_in_a_safety_colour_prints_the_signs_value_and_readable_bold_text(self):
        cell = ('<w:tc><w:tcPr><w:shd w:color="auto" w:fill="{}" w:val="clear"/></w:tcPr>'
                '<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>X</w:t></w:r></w:p></w:tc>')
        table = f'<w:tbl><w:tr>{cell.format("00CC00")}{cell.format("FFFF00")}</w:tr></w:tbl>'
        out = safety_colours(table)
        self.assertIn('w:fill="237F52"', out)
        self.assertIn('w:fill="F9A800"', out)
        self.assertEqual(out.count('<w:b/><w:bCs/>'), 4)
        self.assertIn('<w:color w:val="FFFFFF"/>', out)
        self.assertIn('<w:color w:val="000000"/>', out)
        self.assertEqual(safety_colours(out), out)


class SchemaOrder(unittest.TestCase):
    def test_properties_follow_the_schema(self):
        xml = ('<w:p><w:pPr><w:pStyle w:val="N"/><w:spacing w:after="0"/><w:numPr><w:numId w:val="2"/></w:numPr>'
               '<w:jc w:val="left"/><w:rPr><w:b/><w:rFonts w:ascii="Arial"/></w:rPr></w:pPr></w:p>')
        self.assertEqual(in_schema_order(xml),
                         '<w:p><w:pPr><w:pStyle w:val="N"/><w:numPr><w:numId w:val="2"/></w:numPr><w:spacing w:after="0"/>'
                         '<w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="Arial"/><w:b/></w:rPr></w:pPr></w:p>')

    def test_ordered_properties_and_unknown_children_stay_put(self):
        xml = '<w:rPr><w:rFonts w:ascii="A"/><w14:ligatures w14:val="all"/><w:b/></w:rPr>'
        self.assertEqual(in_schema_order(xml), xml)
        self.assertEqual(in_schema_order(in_schema_order(xml)), xml)


class SchemaValues(unittest.TestCase):
    def test_on_off_values_and_font_names_the_schema_accepts(self):
        self.assertEqual(in_schema_values('<w:trPr><w:tblHeader w:val="true"/><w:cantSplit w:val="false"/></w:trPr>'),
                         '<w:trPr><w:tblHeader/></w:trPr>')
        self.assertEqual(in_schema_values('<w:rFonts w:ascii="TimesNewRomanPSMT;Times New Roman" w:cs="Metro;Calibri"/>'),
                         '<w:rFonts w:ascii="Times New Roman" w:cs="Calibri"/>')


class Sections(unittest.TestCase):
    def test_a_self_closing_section_is_not_a_section(self):
        xml = '<w:p><w:pPr><w:sectPr/></w:pPr></w:p><w:sectPr><w:pgSz w:w="11906"/></w:sectPr>'
        for pattern in (decision_pages.SECTION, landscape_binding.SECTION):
            self.assertEqual([m.group(0) for m in pattern.finditer(xml)], ['<w:sectPr><w:pgSz w:w="11906"/></w:sectPr>'])


class Kinds(unittest.TestCase):
    def test_a_ruled_table_is_a_house_table_and_a_layout_table_is_left_alone(self):
        self.assertEqual(kind_of(table(['Nr. crt.', '1.'], properties='<w:tblStyle w:val="HouseTable"/>')), 'house')
        self.assertEqual(kind_of(table(['Nr.crt.CONSECINȚE', '1.'], properties='<w:tblStyle w:val="HouseTable"/>')),
                         'consequences')
        scale = '<w:tblBorders><w:top w:val="single" w:sz="12"/></w:tblBorders>'
        self.assertEqual(kind_of(table(['CLASE DE GRAVITATE', '1'], properties=scale)), 'scale')
        self.assertIsNone(kind_of(table(['Semnătura', ''], properties='')))
        self.assertIsNone(kind_of(table(['a']).replace('</w:p></w:tc>', '</w:p>' + table(['b']) + '</w:tc>', 1)))


class KeepTogether(unittest.TestCase):
    def test_a_short_table_keeps_whole_and_a_long_one_keeps_its_head(self):
        grid = [4000]
        short = [ROW.format(text) for text in ['Nr.', '1.', '2.', '3.']]
        cant_split, keeps = keep_together(short, 1, grid)
        self.assertEqual(cant_split, [True] * 4)
        self.assertEqual(keeps, [True, True, True, False])
        long = [ROW.format(text) for text in ['Nr.'] + [f'{n}.' for n in range(1, 13)]]
        cant_split, keeps = keep_together(long, 1, grid)
        self.assertEqual(keeps[:3], [True, True, False])
        self.assertFalse(any(keeps[3:]))

    def test_a_table_with_a_very_long_row_ties_nothing(self):
        rows = [ROW.format('Nr.'), ROW.format('x ' * 400)]
        cant_split, keeps = keep_together(rows, 1, [4000])
        self.assertEqual(cant_split, [True, False])
        self.assertEqual(keeps, [False, False])

    def test_a_group_named_in_bold_keeps_with_its_first_row_even_beside_a_very_long_row(self):
        def row(*texts, before=''):
            cells = ''.join(f'<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:tc>'
                            for text in texts)
            return f'<w:tr>{before}{cells}</w:tr>'
        group = ('<w:tr><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>'
                 '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Fizice - termice</w:t></w:r></w:p></w:tc></w:tr>')
        rows = [row('Riscuri', 'Exemple', before='<w:trPr><w:tblHeader/></w:trPr>'), group,
                row('Arsuri', 'Lucrări ' * 300), row('Degerături', 'Lucrări în frig')]
        cant_split, keeps = keep_together(rows, 1, [4000, 4000])
        self.assertEqual(keeps, [False, True, False, False])
        self.assertEqual(cant_split, [True, True, False, True])


class Room(unittest.TestCase):
    def test_a_short_table_on_a_portrait_page_keeps_whole_where_a_landscape_one_could_not(self):
        rows = [ROW.format('Nr.')] + [ROW.format('cuvânt ' * 60) for _ in range(3)]
        _, landscape = keep_together(rows, 1, [4000])
        _, portrait = keep_together(rows, 1, [4000], room=PORTRAIT_KEEP_ROOM)
        self.assertFalse(all(landscape[:-1]))
        self.assertEqual(portrait, [True, True, True, False])

    def test_reads_the_page_of_the_section_a_table_stands_in(self):
        self.assertEqual(page_room('<w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>'), PORTRAIT_KEEP_ROOM)
        self.assertLess(page_room('<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr>'),
                        PORTRAIT_KEEP_ROOM)


class Sizes(unittest.TestCase):
    def test_raises_only_what_is_smaller_than_10_pt(self):
        self.assertEqual([on_the_scale(size, False) for size in (14, 16, 18, 20, 24)], [20, 20, 20, 20, 24])
        self.assertEqual([on_the_scale(size, True) for size in (14, 16, 18, 20)], [16, 16, 16, 20])

    def test_a_column_holds_a_word_with_a_slash_whole(self):
        cell = '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:tc>'
        rows = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>' + cell.format('Tip') + '</w:tr>',
                '<w:tr>' + cell.format('Încălțăminte antistatică/conductoare') + '</w:tr>',
                '<w:tr>' + cell.format('Mănuși anti-vibrații') + '</w:tr>']
        self.assertGreater(body_floors(rows, 1, 85)[0], 2200)
        self.assertLess(body_floors(rows[:1] + rows[2:], 1, 85)[0], 1500)


    def test_a_table_narrow_enough_for_10_pt_prints_every_run_at_10_pt(self):
        cell = '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="{}"/></w:rPr><w:t>{}</w:t></w:r></w:p></w:tc>'
        def ruled(columns, size):
            grid = ''.join('<w:gridCol w:w="2000"/>' for _ in range(columns))
            row = '<w:tr>' + ''.join(cell.format(size, 'Lucrări') for _ in range(columns)) + '</w:tr>'
            return f'<w:tbl><w:tblPr><w:tblBorders/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{row}{row}</w:tbl>'
        self.assertNotIn('<w:sz w:val="16"/>', house_table(ruled(4, 16), 'house'))
        self.assertIn('<w:sz w:val="20"/>', house_table(ruled(4, 16), 'house'))
        self.assertIn('<w:sz w:val="16"/>', house_table(ruled(7, 16), 'house'))
        self.assertIn('<w:sz w:val="16"/>', house_table(ruled(4, 16), 'house', snap=False))


# The same cases as src/table-keep.test.ts: the sweep and the merge must agree on a signed list.
SIGNED_LISTS = [('Semnătura de primire', True), ('SEMNĂTURA', True), ('Sem\u00adnătura celui', True),
                 ('Data și semnătura', False), ('Numele și prenumele', False)]


class SignedAndClosing(unittest.TestCase):
    def test_a_list_is_signed_when_a_column_of_its_header_asks_for_the_signature(self):
        for label, signed in SIGNED_LISTS:
            header = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + ROW.format(label)[len('<w:tr>'):]
            self.assertEqual(is_signed_list([header, ROW.format('1.')], 1), signed, label)

    def test_every_row_of_a_list_signed_by_hand_is_centred_whatever_wraps(self):
        cell = '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:tc>'
        header = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + cell.format('Numele') + cell.format('Semnătura') + '</w:tr>'
        rows = ['<w:tr>' + cell.format(name) + cell.format('') + '</w:tr>' for name in ('Ana Pop', 'Lucrări ' * 20, '')]
        grid = '<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>'
        table = f'<w:tbl><w:tblPr><w:tblBorders/></w:tblPr>{grid}{header}{"".join(rows)}</w:tbl>'
        laid = house_table(table, 'house')
        self.assertEqual(set(re.findall(r'<w:vAlign w:val="(\w+)"/>', laid)), {'center'})

    def test_a_list_signed_by_hand_keeps_its_head_and_its_last_two_rows(self):
        rows = [ROW.format('Semnătura de primire')] + [ROW.format(f'{number}.') for number in range(1, 7)]
        _, keeps = keep_together(rows, 1, [4000])
        self.assertEqual(keeps, [True, True, False, False, False, True, False])
        _, keeps = keep_together(rows[:4], 1, [4000])
        self.assertEqual(keeps, [True, True, True, False])

    def test_a_short_sentence_ending_its_page_keeps_with_a_whole_table(self):
        sentence = '<w:p><w:r><w:t>Niciunul dintre factorii de risc.</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>'
        self.assertTrue(closes_its_page(sentence + '<w:p/>'))
        self.assertFalse(closes_its_page(sentence.replace('<w:r><w:br w:type="page"/></w:r>', '')))
        self.assertFalse(closes_its_page('<w:p/>' + sentence))
        rows = [ROW.format('Nr.'), ROW.format('1.'), ROW.format('2.')]
        _, keeps = keep_together(rows, 1, [4000], closing=True)
        self.assertEqual(keeps, [True, True, True])


if __name__ == '__main__':
    unittest.main()
