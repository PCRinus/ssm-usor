import unittest

from contents import column_style, entry_geometry, label_columns, label_of


class Labels(unittest.TestCase):
    def test_finds_the_label_of_each_kind_of_heading(self):
        self.assertEqual(label_of('Capitolul IV. Organizarea'), 'Capitolul IV.')
        self.assertEqual(label_of('Subcapitolul XV.II. Măsuri'), 'Subcapitolul XV.II.')
        self.assertEqual(label_of('SUBCAPITOLUL V.{{roman}}. EVALUAREA'), 'SUBCAPITOLUL V.{{roman}}.')
        self.assertEqual(label_of('Anexa Nr. 3. SCALA'), 'Anexa Nr. 3.')
        self.assertEqual(label_of('Anexa {{number}}.\tI.P.S.S.M. {{title}}'), 'Anexa {{number}}.')
        self.assertIsNone(label_of('BIBLIOGRAFIE'))


class Columns(unittest.TestCase):
    def test_a_level_is_as_wide_as_its_widest_label_and_a_little_room(self):
        columns = label_columns([(1, 'Capitolul I. A'), (1, 'Capitolul XVII. B'), (2, 'Subcapitolul XV.I. C')])
        self.assertEqual(columns[1], 1596)
        self.assertGreater(columns[2], columns[1])
        self.assertEqual(columns[1] % 57, 0)

    def test_measures_a_loops_number_as_a_wide_one(self):
        looped = label_columns([(2, 'SUBCAPITOLUL V.{{roman}}. X')])[2]
        self.assertEqual(looped, label_columns([(2, 'SUBCAPITOLUL V.XVIII. X')])[2])

    def test_a_subchapter_starts_one_tier_in(self):
        self.assertEqual(entry_geometry(1, 1596), (0, 1596))
        self.assertEqual(entry_geometry(2, 1995), (567, 2562))


    def test_a_columns_style_holds_only_its_tab_and_hang(self):
        style = column_style(2, 1995, 567)
        self.assertIn('w:styleId="ContentsLabels2"', style)
        self.assertIn('<w:basedOn w:val="TOC2"/>', style)
        self.assertIn('<w:tabs><w:tab w:val="left" w:pos="2562"/></w:tabs>'
                      '<w:ind w:left="2562" w:right="567" w:hanging="1995"/>', style)


if __name__ == '__main__':
    unittest.main()
