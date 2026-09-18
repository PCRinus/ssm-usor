import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { documentText } from './author';
import { renderDocument, templatePlaceholders } from './render';

const templatesUrl = new URL('../templates/', import.meta.url);
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, templatesUrl)));
const templateFiles = readdirSync(fileURLToPath(templatesUrl)).filter((name) =>
  name.endsWith('.docx')
);

// What the provider's originals printed. None of it may survive in a template.
const originals =
  /VELOCITA|PIPETECH|SAFETY CORE|POPA|LUCA|CASAPU|TALO[SȘ]|D-na|D-l |\b\d{2}\.\d{2}\.20\d{2}\b/;

describe('built-in templates', () => {
  it.each(templateFiles)('%s carries nothing of the client it was made from', (name) => {
    expect(documentText(read(name))).not.toMatch(originals);
  });
});

describe('decision_first_aid', () => {
  const template = read('decision_first_aid.docx');
  const data = {
    decisionNumber: 3,
    issueDate: '19.01.2026',
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Director general',
    },
    provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
    firstAiders: [
      { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
      { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
    ],
    firstAiderNames: 'Ion MARIN, Elena DUMITRU',
  };

  it('asks for exactly this data', () => {
    expect(templatePlaceholders(template)).toEqual([
      'client.legalName',
      'client.representativeName',
      'client.representativeRole',
      'decisionNumber',
      'firstAiderNames',
      'firstAiders',
      'issueDate',
      'jobTitle',
      'name',
      'provider.legalName',
      'provider.representativeName',
    ]);
  });

  it('names every first aider in the decision and in both tables, without honorifics', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. : 3 SSM  Din : 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU in calitate de Director general in cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text).toContain(
      'Elena DUMITRU avand functia de Lucrător comercial in cadrul S.C. CLIENT DEMO S.R.L.'
    );
    // Once in the decision, once in each of the two acknowledgement tables.
    expect(text.match(/Ion MARIN/g)).toHaveLength(4);
    expect(text.match(/^Lucrător comercial$/gm)).toHaveLength(2);
    expect(text).toContain('S.C. SERVICIU EXTERN S.R.L. – Ana IONESCU');
  });

  it('refuses to render without a first aider name list rather than leave a gap', () => {
    const incomplete = { ...data, firstAiderNames: undefined };
    expect(() => renderDocument(template, incomplete)).toThrow(/firstAiderNames/);
  });
});
