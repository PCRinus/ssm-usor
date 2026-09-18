import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { authorTemplate, documentText } from './author';
import { renderDocument, TemplateError, templatePlaceholders } from './render';

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

describe('authorTemplate', () => {
  it('replaces a phrase that Word split across runs, keeping the formatting of its start', () => {
    const source = docx(
      paragraph(
        run('in cadrul '),
        run('S.C. VELOCITA URBANA', true),
        run(' '),
        run('S.R.L.'),
        run(', din')
      )
    );
    const { template, report } = authorTemplate(source, [
      { find: 'S.C. VELOCITA URBANA S.R.L.', replace: '{{client.legalName}}' },
    ]);

    expect(documentText(template)).toBe('in cadrul {{client.legalName}}, din');
    expect(report).toEqual([
      { part: 'word/document.xml', find: 'S.C. VELOCITA URBANA S.R.L.', count: 1 },
    ]);
    // The placeholder sits in the bold run; the runs it swallowed are left empty, not removed.
    expect(bodyXml(template)).toContain(
      '<w:b/></w:rPr><w:t xml:space="preserve">{{client.legalName}}</w:t>'
    );
    expect(bodyXml(template).match(/<w:r>/g)).toHaveLength(5);
  });

  it('replaces every occurrence, also several in one paragraph', () => {
    const source = docx(
      paragraph(run('POPA semnează, '), run('PO'), run('PA primește.')) +
        paragraph(run('Întocmit: POPA'))
    );
    const { template, report } = authorTemplate(source, [{ find: 'POPA', replace: '{{name}}' }]);

    expect(documentText(template)).toBe(
      '{{name}} semnează, {{name}} primește.\nÎntocmit: {{name}}'
    );
    expect(report[0]!.count).toBe(3);
  });

  it('ends when the placeholder contains the text it replaces', () => {
    const source = docx(paragraph(run('Data: 15.02.2024')));
    const { template } = authorTemplate(source, [
      { find: '15.02.2024', replace: '{{issueDate}} (era 15.02.2024)' },
    ]);
    expect(documentText(template)).toBe('Data: {{issueDate}} (era 15.02.2024)');
  });

  it('escapes what XML reserves and reads it back', () => {
    const source = docx(paragraph(run('Firma A &amp; B')));
    const { template } = authorTemplate(source, [{ find: 'A & B', replace: '{{a}} & {{b}}' }]);
    expect(bodyXml(template)).toContain('{{a}} &amp; {{b}}');
    expect(documentText(template)).toBe('Firma {{a}} & {{b}}');
  });

  it('matches a whole paragraph only, leaving the same text inside a sentence alone', () => {
    const source = docx(
      paragraph(run('Paolo LUCA va acorda primul ajutor.')) + paragraph(run(' Paolo LUCA '))
    );
    const { template } = authorTemplate(source, [
      { find: 'Paolo LUCA', replace: '{{name}}', whole: true },
    ]);
    expect(documentText(template)).toBe('Paolo LUCA va acorda primul ajutor.\n {{name}} ');
  });

  it('wraps a paragraph in a loop that the engine then repeats per item', () => {
    const source = docx(
      paragraph(run('Se va realiza de catre :')) + paragraph(run('Paolo LUCA, Manager magazin.'))
    );
    const { template } = authorTemplate(source, [
      {
        find: 'Paolo LUCA, Manager magazin',
        replace: '{{name}}, {{jobTitle}}',
        loopParagraph: 'firstAiders',
      },
    ]);
    const rendered = renderDocument(template, {
      firstAiders: [
        { name: 'Paolo LUCA', jobTitle: 'Manager magazin' },
        { name: 'Maria POPESCU', jobTitle: 'Administrator' },
      ],
    });
    expect(documentText(rendered)).toBe(
      'Se va realiza de catre :\nPaolo LUCA, Manager magazin.\nMaria POPESCU, Administrator.'
    );
  });

  it('matches a pattern, for a phrase the original spells several ways', () => {
    const source = docx(
      paragraph(run('in cadrul S.C. VELOCITA URBANA  S.R.L, din')) +
        paragraph(run('la S.C. VELOCITA'), run(' URBANA SRL;'))
    );
    const { template, report } = authorTemplate(source, [
      {
        pattern: 'S\\.C\\.\\s+VELOCITA URBANA\\s+S\\.?R\\.?L\\.?',
        replace: '{{client.legalName}}',
        min: 2,
      },
    ]);
    expect(documentText(template)).toBe(
      'in cadrul {{client.legalName}}, din\nla {{client.legalName}};'
    );
    expect(report[0]!.count).toBe(2);
  });

  it('drops the font colours a provider used to mark text, and keeps the others', () => {
    const colored = (text: string, color: string) =>
      `<w:r><w:rPr><w:b/><w:color w:val="${color}"/></w:rPr><w:t>${text}</w:t></w:r>`;
    const source = docx(
      paragraph(colored('S.C. CLIENT S.R.L.', 'FF0000'), colored(' titlu', '1F497D'))
    );
    const { template } = authorTemplate(
      source,
      [{ find: 'S.C. CLIENT S.R.L.', replace: '{{client.legalName}}' }],
      { removeColors: ['FF0000'] }
    );
    expect(bodyXml(template)).not.toContain('FF0000');
    expect(bodyXml(template)).toContain(
      '<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{{client.legalName}}'
    );
    expect(bodyXml(template)).toContain('1F497D');
  });

  it('fails when a text is found less often than the spec expects', () => {
    const source = docx(paragraph(run('15.02.2024')));
    expect(() =>
      authorTemplate(source, [{ find: '15.02.2024', replace: '{{issueDate}}', min: 2 }])
    ).toThrow(/15\.02\.2024/);
  });

  it('fails when a text is not in the document, naming it', () => {
    const source = docx(paragraph(run('Nimic de înlocuit.')));
    expect(() => authorTemplate(source, [{ find: 'PIPETECH', replace: '{{x}}' }])).toThrow(
      /"PIPETECH"/
    );
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
