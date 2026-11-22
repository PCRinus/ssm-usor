"""python3 -m unittest discover -s tools/import -p 'test_*.py', which src/templates/word-layout.test.ts runs."""

import unittest

from bookmarks import hidden_bookmarks


def mark(name):
    return f'<w:bookmarkStart w:id="1" w:name="{name}"/><w:bookmarkEnd w:id="1"/>'


class HiddenBookmarks(unittest.TestCase):
    def test_a_bookmark_nothing_names_is_hidden(self):
        self.assertEqual(hidden_bookmarks(mark('do|caV|si1|ar75|pa1')), mark('_do|caV|si1|ar75|pa1'))

    def test_a_bookmark_a_field_names_stays(self):
        xml = mark('art5') + '<w:instrText xml:space="preserve"> PAGEREF art5 \\h </w:instrText>'
        self.assertEqual(hidden_bookmarks(xml), xml)

    def test_a_bookmark_a_note_reference_names_stays(self):
        xml = mark('nota1') + '<w:instrText> NOTEREF nota1 \\h </w:instrText>'
        self.assertEqual(hidden_bookmarks(xml), xml)

    def test_a_bookmark_a_link_names_stays(self):
        xml = mark('anexa') + '<w:instrText> HYPERLINK \\l "anexa" </w:instrText>' + mark('x')
        self.assertEqual(hidden_bookmarks(xml), xml.replace('w:name="x"', 'w:name="_x"'))

    def test_runs_again_without_change(self):
        once = hidden_bookmarks(mark('do|caV') + mark('_Toc000000001'))
        self.assertEqual(hidden_bookmarks(once), once)


if __name__ == '__main__':
    unittest.main()
