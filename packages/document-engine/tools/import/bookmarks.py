"""Bookmarks nothing points to, hidden, in a template's saved XML, without an office.

Passages copied from the legislation portal brought its anchors along ("do|caV|si1|ar75|pa1"),
hundreds in 2.1. The in-app editor lists every bookmark in its navigation pane, and Word in its
Bookmark dialog, except those whose name starts with an underscore, the mark Word gives its own
(`_Toc…`). A bookmark no field and no link names gets that mark. It is renamed, not removed:
an empty paragraph that holds one is kept by the typesetting passes, and removing it would let
a later sweep take the paragraph out and move the pages. Safe to run again.
"""

import re

START = re.compile(r'(<w:bookmarkStart\b[^>]*?\bw:name=")([^"]*)(")')
FIELD = re.compile(r'\b(?:PAGEREF|NOTEREF|REF)\s+"?([^\s"\\]+)|\bHYPERLINK\b[^<]*?\\l\s+"([^"]+)"')
ANCHOR = re.compile(r'\bw:anchor="([^"]*)"')


def named(xml):
    """The bookmark names a field or a link in the part points to."""
    names = {match.group(1) or match.group(2) for match in FIELD.finditer(xml)}
    return names | set(ANCHOR.findall(xml))


def hidden_bookmarks(xml):
    used = named(xml)

    def hide(match):
        name = match.group(2)
        if name.startswith('_') or name in used:
            return match.group(0)
        return f'{match.group(1)}_{name}{match.group(3)}'

    return START.sub(hide, xml)
