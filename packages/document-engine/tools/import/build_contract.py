"""Builds the starter template of the service contract (ADR 007).

    pnpm --filter @ssm-usor/document-engine build-contract

The contract is not one of the provider's originals: it is written here, in our own words, in
`contract.ro.json`, after the structure of a provider's contract, and typeset to the house
style. Articles are numbered by a list, so that an article a provider deletes in the editor,
or a chapter left out because fire safety is not sold, leaves no gap in the numbers. For the
same reason chapters carry no number and no article refers to another by its number.
"""

import json
import sys

import uno
from com.sun.star.style.ParagraphAdjust import CENTER, LEFT

sys.path.insert(0, '/work/tools/import')
from import_templates import (  # noqa: E402
    BODY_SIZE, FONT, LIST_HANG, LIST_TIERS, MARGINS, TITLE_SIZE, add_branding, insert_handover,
    prop, start_office, write_paragraph)

ARTICLES = 'ContractArticles'
ARTICLE_LABEL = 'ContractArticleLabel'
ARABIC = 4
FOLLOWED_BY_SPACE = 1


def article_numbering(document):
    """One list for the whole contract: "Art. 1.", in bold, flush left, followed by a space."""
    characters = document.StyleFamilies.getByName('CharacterStyles')
    label = document.createInstance('com.sun.star.style.CharacterStyle')
    characters.insertByName(ARTICLE_LABEL, label)
    label.CharWeight = 150
    label.CharFontName = FONT
    label.CharHeight = BODY_SIZE

    numbering = document.createInstance('com.sun.star.style.NumberingStyle')
    document.StyleFamilies.getByName('NumberingStyles').insertByName(ARTICLES, numbering)
    rules = numbering.NumberingRules
    level = {item.Name: item for item in rules.getByIndex(0)}
    for name, value in (
        ('NumberingType', ARABIC),
        # Not Prefix and Suffix, which this version of the office reads and then drops on export.
        ('ListFormat', 'Art. %1%.'),
        ('CharStyleName', ARTICLE_LABEL),
        ('LabelFollowedBy', FOLLOWED_BY_SPACE),
        ('IndentAt', 0),
        ('FirstLineIndent', 0),
        ('ListtabStopPosition', 0),
    ):
        level[name] = prop(name, value)
    uno.invoke(rules, 'replaceByIndex',
               (0, uno.Any('[]com.sun.star.beans.PropertyValue', tuple(level.values()))))
    numbering.NumberingRules = rules


def plain(text, cursor, content, **options):
    """A paragraph outside the list: a new paragraph inherits the numbering of the one before."""
    write_paragraph(text, cursor, content, **options)
    cursor.gotoStartOfParagraph(False)
    cursor.NumberingStyleName = ''
    cursor.gotoEndOfParagraph(False)


def tag(text, cursor, name, closing=False):
    # Alone in its paragraph, which the merge removes with it.
    plain(text, cursor, ('{{/' if closing else '{{#') + name + '}}', adjust=LEFT, below=0)


def article(text, cursor, definition):
    condition = definition.get('condition')
    if condition:
        tag(text, cursor, condition)
    write_paragraph(text, cursor, definition['lead'], adjust=LEFT, below=6)
    cursor.gotoStartOfParagraph(False)
    cursor.NumberingStyleName = ARTICLES
    cursor.NumberingLevel = 0
    cursor.gotoEndOfParagraph(False)
    for content in definition.get('paragraphs', []):
        plain(text, cursor, content, adjust=LEFT, below=6)
    items = definition.get('items', [])
    for index, item in enumerate(items):
        letter = chr(ord('a') + index)
        plain(text, cursor, f'{letter}) {item}', adjust=LEFT,
              below=6 if index == len(items) - 1 else 3)
        cursor.gotoStartOfParagraph(False)
        cursor.ParaLeftMargin = LIST_TIERS[0]
        cursor.ParaFirstLineIndent = LIST_HANG
        cursor.gotoEndOfParagraph(False)
    if condition:
        tag(text, cursor, condition, closing=True)


def build(desktop, definition):
    document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (prop('Hidden', True),))
    styles = document.StyleFamilies.getByName('PageStyles')
    for name in styles.getElementNames():
        style = styles.getByName(name)
        for margin, value in MARGINS.items():
            setattr(style, margin, value)
    article_numbering(document)
    text = document.Text
    cursor = text.createTextCursor()

    write_paragraph(text, cursor, definition['title'], size=TITLE_SIZE, bold=True, adjust=CENTER,
                    below=3, keep=True, first=True)
    write_paragraph(text, cursor, definition['number'], bold=True, adjust=CENTER, below=18)

    for chapter in definition['chapters']:
        condition = chapter.get('condition')
        if condition:
            tag(text, cursor, condition)
        plain(text, cursor, chapter['heading'], bold=True, adjust=LEFT, above=12, below=6,
              keep=True)
        for item in chapter['articles']:
            article(text, cursor, item)
        if condition:
            tag(text, cursor, condition, closing=True)

    signatures = definition['signatures']
    plain(text, cursor, '', adjust=LEFT, above=12, below=0)
    insert_handover(document, text, cursor, (
        ([signatures['provider'], '{{provider.legalName}}'],
         '{{provider.representativeName}}', '{{provider.representativeRole}}'),
        ([signatures['client'], '{{client.legalName}}'],
         '{{client.representativeName}}', '{{client.representativeRole}}'),
    ))

    # The paragraph after the table, which a text document always ends with.
    tail = text.createTextCursor()
    tail.gotoEnd(False)
    tail.NumberingStyleName = ''
    tail.CharHeight = 1.0
    tail.ParaTopMargin = 0
    tail.ParaBottomMargin = 0

    for name in styles.getElementNames():
        add_branding(styles.getByName(name))
    target = f'/work/templates/other/{definition["typeKey"]}.docx'
    document.storeToURL(uno.systemPathToFileUrl(target), (prop('FilterName', 'MS Word 2007 XML'),))
    document.close(True)
    print(definition['typeKey'])


def main():
    with open('/work/tools/import/contract.ro.json', encoding='utf8') as file:
        definition = json.load(file)
    process, desktop = start_office()
    try:
        build(desktop, definition)
    finally:
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - the office may already be gone
            pass
        process.wait(timeout=30)


if __name__ == '__main__':
    main()
