"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import re
import unittest

from landscape_binding import landscape_bound_on_top, scaled
from table_style import CONTENT_WIDTHS, marked_for_content_widths

RELS = ('<Relationships><Relationship Id="rId1" Type="header" Target="header1.xml"/>'
        '<Relationship Id="rId2" Type="header" Target="header2.xml"/></Relationships>')


def table(grid):
    columns = ''.join(f'<w:gridCol w:w="{width}"/>' for width in grid)
    cells = ''.join(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>' for width in grid)
    return f'<w:tbl><w:tblPr/><w:tblGrid>{columns}</w:tblGrid><w:tr>{cells}</w:tr></w:tbl>'


def section(landscape, header='rId1', left=1417, top=2445, header_distance=680):
    size = '<w:pgSz w:orient="landscape" w:w="16838" w:h="11906"/>' if landscape else '<w:pgSz w:w="11906" w:h="16838"/>'
    return (f'<w:sectPr><w:headerReference w:type="default" r:id="{header}"/>{size}'
            f'<w:pgMar w:left="{left}" w:right="1134" w:gutter="0" w:header="{header_distance}" '
            f'w:top="{top}" w:footer="680" w:bottom="1134"/></w:sectPr>')


def parts(body, headers=None):
    texts = {'word/document.xml': f'<w:document><w:body>{body}</w:body></w:document>',
             'word/_rels/document.xml.rels': RELS}
    for name, xml in (headers or {}).items():
        texts[name] = xml
    return texts


def grids(xml):
    return [[int(width) for width in re.findall(r'w:w="(\d+)"', grid)]
            for grid in re.findall(r'<w:tblGrid>(.*?)</w:tblGrid>', xml)]


class BoundOnTop(unittest.TestCase):
    def test_moves_the_binding_margin_of_a_landscape_page_to_its_top(self):
        changed = landscape_bound_on_top(parts(f'<w:p/>{section(True)}'))
        margins = re.search(r'<w:pgMar\b[^>]*/>', changed['word/document.xml']).group(0)
        self.assertIn('w:left="1134"', margins)
        self.assertIn('w:right="1134"', margins)
        self.assertIn('w:top="2728"', margins)
        self.assertIn('w:header="963"', margins)

    def test_leaves_the_header_distance_of_a_page_without_one(self):
        changed = landscape_bound_on_top(parts(f'<w:p/>{section(True, top=1134, header_distance=0)}'))
        margins = re.search(r'<w:pgMar\b[^>]*/>', changed['word/document.xml']).group(0)
        self.assertIn('w:top="1417"', margins)
        self.assertIn('w:header="0"', margins)

    def test_widens_the_tables_across_the_text_column_and_the_page_header(self):
        body = f'{table([7143, 7144])}{table([3000, 3000])}<w:p/>{section(True)}'
        changed = landscape_bound_on_top(parts(body, {'word/header1.xml': f'<w:hdr>{table([2857, 4286, 4286, 2858])}</w:hdr>'}))
        self.assertEqual(grids(changed['word/document.xml']), [[7284, 7286], [3000, 3000]])
        self.assertEqual(sum(grids(changed['word/header1.xml'])[0]), 14570)
        self.assertIn('<w:tcW w:w="7284" w:type="dxa"/>', changed['word/document.xml'])

    def test_leaves_the_portrait_sections_and_their_tables(self):
        portrait = f'{table([9355])}<w:p><w:pPr>{section(False, header="rId2")}</w:pPr></w:p>'
        landscape = f'{table([14287])}<w:p/>{section(True)}'
        changed = landscape_bound_on_top(parts(portrait + landscape))
        self.assertEqual(grids(changed['word/document.xml']), [[9355], [14570]])
        self.assertIn('w:left="1417"', changed['word/document.xml'])
        self.assertNotIn('word/header2.xml', changed)

    def test_changes_nothing_the_second_time(self):
        texts = parts(f'{table([14287])}<w:p/>{section(True)}', {'word/header1.xml': f'<w:hdr>{table([14287])}</w:hdr>'})
        texts.update(landscape_bound_on_top(texts))
        self.assertEqual(landscape_bound_on_top(texts), {})

    def test_refuses_a_header_shared_with_a_portrait_page(self):
        body = f'<w:p><w:pPr>{section(False)}</w:pPr></w:p><w:p/>{section(True)}'
        with self.assertRaises(ValueError):
            landscape_bound_on_top(parts(body))

    def test_stretches_a_grid_to_the_twip(self):
        self.assertEqual(scaled([2857, 4286, 4286, 2858], 14570), [2913, 4371, 4371, 2915])
        self.assertEqual(sum(scaled([1, 1, 1], 1000)), 1000)


class ContentWidthsMarker(unittest.TestCase):
    def test_marks_the_prevention_plans_table_only(self):
        plan = '<w:tbl><w:tblPr><w:tblStyle w:val="HouseTable"/></w:tblPr><w:tr><w:tc><w:p>{{#plan}}</w:p></w:tc></w:tr></w:tbl>'
        other = '<w:tbl><w:tblPr/><w:tr><w:tc><w:p>Semnătura</w:p></w:tc></w:tr></w:tbl>'
        marked = marked_for_content_widths(other + plan, '10_prevention_plan.docx')
        self.assertEqual(marked.count(f'<w:tblCaption w:val="{CONTENT_WIDTHS}"/>'), 1)
        self.assertTrue(marked.startswith(other))
        self.assertEqual(marked_for_content_widths(marked, '10_prevention_plan.docx'), marked)
        self.assertEqual(marked_for_content_widths(plan, '9.1_risk_assessment.docx'), plan)


if __name__ == '__main__':
    unittest.main()
