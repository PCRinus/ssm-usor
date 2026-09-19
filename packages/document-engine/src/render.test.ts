import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocument, TemplateError, templatePlaceholders } from './render';
import { documentText, replaceText } from './text';

// The smallest file Word opens: a content type list, the package relationship, and a body.
function docx(body: string) {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  return zip.generate({ type: 'uint8array' });
}

const run = (text: string, bold = false) =>
  `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const paragraph = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
const bodyXml = (file: Uint8Array) => new PizZip(file).file('word/document.xml')!.asText();

describe('replaceText', () => {
  it('replaces a phrase that Word split across runs, keeping the formatting of its start', () => {
    const xml = bodyXml(
      docx(
        paragraph(
          run('in cadrul '),
          run('S.C. CLIENT', true),
          run(' '),
          run('S.R.L.'),
          run(', din')
        )
      )
    );
    const replaced = replaceText(xml, /S\.C\. CLIENT S\.R\.L\./, '{{client.legalName}}');
    expect(replaced).toContain(
      '<w:b/></w:rPr><w:t xml:space="preserve">{{client.legalName}}</w:t>'
    );
    // The runs it swallowed are left empty, not removed.
    expect(replaced.match(/<w:r>/g)).toHaveLength(5);
  });

  it('replaces every occurrence in a paragraph and escapes what XML reserves', () => {
    const xml = bodyXml(docx(paragraph(run('A &amp; B, apoi A &amp; B'))));
    expect(replaceText(xml, /A & B/, 'C & D')).toContain('C &amp; D, apoi C &amp; D');
  });
});

describe('renderDocument', () => {
  const client = { legalName: 'S.C. CLIENT S.R.L.', representative: { name: 'Maria POPESCU' } };

  it('fills dotted paths', () => {
    const template = docx(paragraph(run('{{client.representative.name}}, {{client.legalName}}')));
    expect(documentText(renderDocument(template, { client }))).toBe(
      'Maria POPESCU, S.C. CLIENT S.R.L.'
    );
  });

  it('fills a placeholder that Word split across runs', () => {
    const template = docx(paragraph(run('{{client.'), run('legalName', true), run('}}')));
    expect(documentText(renderDocument(template, { client }))).toBe('S.C. CLIENT S.R.L.');
  });

  it('repeats a table row per item, and a row can still print outer values', () => {
    const cell = (text: string) => `<w:tc>${paragraph(run(text))}</w:tc>`;
    const template = docx(
      `<w:tbl><w:tr>${cell('{{#people}}{{name}}')}${cell('{{jobTitle}}')}${cell('{{issueDate}}{{/people}}')}</w:tr></w:tbl>`
    );
    const rendered = renderDocument(template, {
      issueDate: '19.09.2026',
      people: [
        { name: 'Paolo LUCA', jobTitle: 'Manager magazin' },
        { name: 'Maria POPESCU', jobTitle: 'Administrator' },
      ],
    });

    expect(bodyXml(rendered).match(/<w:tr>/g)).toHaveLength(2);
    expect(documentText(rendered)).toBe(
      [
        'Paolo LUCA',
        'Manager magazin',
        '19.09.2026',
        'Maria POPESCU',
        'Administrator',
        '19.09.2026',
      ].join('\n')
    );
  });

  it('repeats the paragraphs between loop tags that stand alone, with {{.}} for a string', () => {
    const template = docx(
      paragraph(run('{{#months}}')) + paragraph(run('- {{.}}')) + paragraph(run('{{/months}}'))
    );
    expect(documentText(renderDocument(template, { months: ['Februarie', 'August'] }))).toBe(
      '- Februarie\n- August'
    );
  });

  it('numbers the items of a list from 1 with {{$index}}', () => {
    const template = docx(
      paragraph(run('{{#risks}}')) +
        paragraph(run('{{$index}}. {{risk}}')) +
        paragraph(run('{{/risks}}'))
    );
    const data = { risks: [{ risk: 'Alunecare' }, { risk: 'Electrocutare' }] };
    expect(documentText(renderDocument(template, data))).toBe('1. Alunecare\n2. Electrocutare');
  });

  it('drops the second full stop when a value that ends in one closes a sentence', () => {
    const template = docx(
      paragraph(run('din cadrul '), run('{{client.legalName}}', true), run('.')) +
        paragraph(run('Si asa mai departe...'))
    );
    const rendered = renderDocument(template, { client: { legalName: 'S.C. CLIENT S.R.L.' } });
    expect(documentText(rendered)).toBe('din cadrul S.C. CLIENT S.R.L.\nSi asa mai departe...');
  });

  it('refuses a missing value instead of leaving a blank, naming every one', () => {
    const template = docx(paragraph(run('{{client.legalName}} {{client.cui}} {{issueDate}}')));
    const attempt = () => renderDocument(template, { client });

    expect(attempt).toThrow(TemplateError);
    try {
      attempt();
    } catch (error) {
      expect((error as TemplateError).missing).toEqual(['client.cui', 'issueDate']);
    }
  });

  it('accepts a list with no items', () => {
    const template = docx(
      paragraph(run('Persoane:')) + paragraph(run('{{#people}}{{name}}{{/people}}'))
    );
    expect(documentText(renderDocument(template, { people: [] }))).toBe('Persoane:');
  });

  it('reports a template with an unclosed placeholder', () => {
    const template = docx(paragraph(run('{{client.legalName')));
    expect(() => renderDocument(template, { client })).toThrow(TemplateError);
  });
});

describe('templatePlaceholders', () => {
  it('lists what a template asks for, loops included', () => {
    const template = docx(
      paragraph(run('{{client.legalName}} {{issueDate}}')) +
        paragraph(run('{{#people}}{{name}}{{/people}}'))
    );
    expect(templatePlaceholders(template)).toEqual([
      'client.legalName',
      'issueDate',
      'name',
      'people',
    ]);
  });
});
