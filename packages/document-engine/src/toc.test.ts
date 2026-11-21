import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderTemplate } from './render';
import { fillTableOfContents } from './toc';

const styles =
  '<w:styles>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Paragraph1"><w:name w:val="Paragraph 1"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Chapter"><w:name w:val="Chapter"/><w:basedOn w:val="Heading1"/></w:style>' +
  '</w:styles>';

const placeholder =
  '<w:p><w:r><w:t>CUPRINS</w:t></w:r></w:p>' +
  '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>' +
  '<w:sdtContent><w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
  '</w:sdtContent></w:sdt>';

const styled = (style: string, ...runs: string[]) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:jc w:val="center"/></w:pPr>${runs.join('')}</w:p>`;
const text = (value: string) =>
  `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`;
const document = (body: string) =>
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

const contents = (xml: string) =>
  /<w:sdtContent>([\s\S]*)<\/w:sdtContent>/.exec(xml)![1]!.match(/<w:p>[\s\S]*?<\/w:p>/g)!;
const entryText = (entry: string) =>
  [...entry.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

describe('fillTableOfContents', () => {
  const filled = fillTableOfContents(
    document(
      placeholder +
        styled('Heading1', text('Capitolul I. Prevederi generale')) +
        styled('Paragraph1', text('Art. 1. Un articol scris în fostul stil de titlu')) +
        styled('Heading2', text('Subcapitolul I.I. Lucrători'), text(' desemnați')) +
        styled('Heading3', text('Prea adânc pentru cuprins')) +
        styled('Chapter', text('Capitolul II. Riscuri &amp; măsuri')) +
        styled('Heading1', text('Anexa Nr. 1.'), '<w:r><w:br/></w:r>', text('LISTA FACTORILOR'))
    ),
    styles
  );

  it('lists the headings within the outline levels the field asks for, in order', () => {
    const entries = contents(filled);
    expect(entries.map(entryText)).toEqual([
      'Capitolul I. Prevederi generale',
      'Subcapitolul I.I. Lucrători desemnați',
      'Capitolul II. Riscuri &amp; măsuri',
      'Anexa Nr. 1. LISTA FACTORILOR',
    ]);
    expect(entries.map((entry) => /w:pStyle w:val="(TOC\d)"/.exec(entry)![1])).toEqual([
      'TOC1',
      'TOC2',
      'TOC1',
      'TOC1',
    ]);
  });

  it('links every entry to a bookmark at the start of its heading', () => {
    const anchors = contents(filled).map((entry) => /w:anchor="([^"]+)"/.exec(entry)![1]);
    expect(new Set(anchors).size).toBe(4);
    for (const anchor of anchors) {
      expect(filled).toMatch(
        new RegExp(
          `</w:pPr><w:bookmarkStart w:id="\\d+" w:name="${anchor}"/><w:bookmarkEnd w:id="\\d+"/>`
        )
      );
    }
    expect(filled.match(/<w:bookmarkStart /g)).toHaveLength(4);
  });

  it('keeps the field around the entries, without page numbers', () => {
    const entries = contents(filled);
    expect(entries[0]).toMatch(
      /^<w:p><w:pPr><w:pStyle w:val="TOC1"\/><\/w:pPr><w:r><w:fldChar w:fldCharType="begin"\/><\/w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u <\/w:instrText><\/w:r><w:r><w:fldChar w:fldCharType="separate"\/><\/w:r><w:hyperlink/
    );
    expect(entries.at(-1)).toMatch(
      /<\/w:hyperlink><w:r><w:fldChar w:fldCharType="end"\/><\/w:r><\/w:p>$/
    );
    expect(filled.match(/fldCharType="end"/g)).toHaveLength(1);
    expect(filled).not.toContain('PAGEREF');
    expect(filled).toContain('<w:docPartGallery w:val="Table of Contents"/>');
  });

  it('does not take a bookmark name or id the document already has', () => {
    const taken = fillTableOfContents(
      document(
        placeholder +
          '<w:bookmarkStart w:id="7" w:name="_Toc000000001"/><w:bookmarkEnd w:id="7"/>' +
          styled('Heading1', text('Capitolul I.'))
      ),
      styles
    );
    expect(taken).toContain('w:anchor="_Toc000000002"');
    expect(taken).toContain('<w:bookmarkStart w:id="8" w:name="_Toc000000002"/>');
  });

  it('leaves a document without a table of contents, or without headings, as it is', () => {
    const plain = document(styled('Heading1', text('Capitolul I.')));
    expect(fillTableOfContents(plain, styles)).toBe(plain);
    const empty = document(placeholder + styled('Normal', text('Text')));
    expect(fillTableOfContents(empty, styles)).toBe(empty);
  });
});

describe('a merged table of contents', () => {
  function template(body: string) {
    const zip = new PizZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    );
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>${document(body)}`);
    zip.file('word/styles.xml', styles);
    return zip.generate({ type: 'uint8array' });
  }

  it('lists a subchapter a loop repeats once per item, with the merged text', () => {
    const { document: merged } = renderTemplate(
      template(
        placeholder +
          styled('Heading1', text('Capitolul V. Evaluarea la {{client.legalName}}')) +
          '<w:p><w:r><w:t>{{#evaluations}}</w:t></w:r></w:p>' +
          styled('Heading2', text('Subcapitolul V.{{roman}}. {{heading}}')) +
          '<w:p><w:r><w:t>{{/evaluations}}</w:t></w:r></w:p>'
      ),
      {
        client: { legalName: 'S.C. CLIENT S.R.L.' },
        evaluations: [
          { roman: 'I', heading: 'SUDOR' },
          { roman: 'II', heading: 'GRUPURI SENSIBILE' },
        ],
      }
    );
    const xml = new PizZip(merged).file('word/document.xml')!.asText();
    expect(contents(xml).map(entryText)).toEqual([
      'Capitolul V. Evaluarea la S.C. CLIENT S.R.L.',
      'Subcapitolul V.I. SUDOR',
      'Subcapitolul V.II. GRUPURI SENSIBILE',
    ]);
  });
});

describe('an entry of a level with a label column', () => {
  const column =
    '<w:tabs><w:tab w:val="left" w:pos="1596"/></w:tabs><w:ind w:left="1596" w:right="567" w:hanging="1596"/>';
  const columned = styles.replace(
    '</w:styles>',
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="ContentsLabels1"><w:name w:val="Contents labels 1"/>' +
      `<w:basedOn w:val="TOC1"/><w:semiHidden/><w:pPr>${column}</w:pPr></w:style></w:styles>`
  );
  const entries = contents(
    fillTableOfContents(
      document(
        placeholder +
          styled('Heading1', text('Capitolul IV. Organizarea activităților')) +
          styled('Heading1', text('BIBLIOGRAFIE')) +
          styled('Heading1', text('CAPITOLUL XXVIII. PREA LUNG PENTRU COLOANĂ'))
      ),
      columned
    )
  );

  it('prints the label bold, a tab, then the title, with the column on the entry', () => {
    expect(entries[0]).toContain(`<w:pPr><w:pStyle w:val="TOC1"/>${column}</w:pPr>`);
    expect(entries[0]).toContain(
      '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Capitolul IV.</w:t></w:r>' +
        '<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Organizarea activităților</w:t></w:r>'
    );
  });

  it("leaves an entry without a label whole, at the labels' start, without the hang", () => {
    expect(entries[1]).toContain(
      '<w:pPr><w:pStyle w:val="TOC1"/><w:ind w:left="0" w:right="567" w:hanging="0"/></w:pPr>'
    );
    expect(entries[1]).toContain(
      '<w:hyperlink w:anchor="_Toc000000002" w:history="1"><w:r><w:t xml:space="preserve">BIBLIOGRAFIE</w:t></w:r></w:hyperlink>'
    );
  });

  it('follows a label wider than its column with a space, not a tab to the page number', () => {
    expect(entries[2]).not.toContain('<w:tab/>');
    expect(entryText(entries[2]!)).toBe('CAPITOLUL XXVIII. PREA LUNG PENTRU COLOANĂ');
  });

  it('leaves the entries of a level without a label column in one run', () => {
    const plain = contents(
      fillTableOfContents(
        document(placeholder + styled('Heading1', text('Capitolul IV. Organizarea'))),
        styles
      )
    );
    expect(plain[0]).toContain(
      '<w:hyperlink w:anchor="_Toc000000001" w:history="1"><w:r><w:t xml:space="preserve">Capitolul IV. Organizarea</w:t></w:r></w:hyperlink>'
    );
  });
});

describe('a contents field as the in-app editor saves it', () => {
  it('reads its outline levels from a field code with its quotes escaped', () => {
    const escaped = placeholder.replace('\\o "1-2"', '\\o &quot;1-2&quot;');
    const entries = contents(
      fillTableOfContents(
        document(
          escaped +
            styled('Heading1', text('Capitolul I. Prevederi generale')) +
            styled('Heading3', text('Prea adânc pentru cuprins'))
        ),
        styles
      )
    );
    expect(entries.map(entryText)).toEqual(['Capitolul I. Prevederi generale']);
  });
});
