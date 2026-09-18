import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';
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

// The three other decisions, rendered with two designated people each.
const people = [
  { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
  { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
];
const shared = {
  issueDate: '19.01.2026',
  client: {
    legalName: 'S.C. CLIENT DEMO S.R.L.',
    representativeName: 'Maria POPESCU',
    representativeRole: 'Director general',
  },
  provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
};
const acknowledged = (text: string) =>
  expect(text.match(/^Lucrător comercial$/gm), 'one table row per person').toHaveLength(1);

describe('decision_training', () => {
  const template = read('decision_training.docx');
  const data = {
    ...shared,
    decisionNumber: 1,
    workplaceManagers: people,
    training: {
      periodicDuration: '2 ore',
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'Februarie, August',
      workerFrequency: 'TRIMESTRIAL',
      workerMonths: 'Februarie, Mai, August, Noiembrie',
      dayFrom: 2,
      dayTo: 7,
    },
  };

  it('prints the training schedule and a paragraph per workplace manager', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('durata instruirii periodice va fi de 2 ore');
    expect(text).toContain(
      'va fi instruit SEMESTRIAL respectiv in lunile Februarie, August, in perioada ( ziua) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'va fi instruit TRIMESTRIAL respectiv in lunile Februarie, Mai, August, Noiembrie'
    );
    expect(text).toContain(
      'Ion MARIN, avand functia de Manager magazin in cadrul societatii; Elena DUMITRU,'
    );
    expect(
      text.match(
        /va efectua instruirea la locul de munca si instruirea periodica pentru intreg personalul/g
      )
    ).toHaveLength(2);
    acknowledged(text);
  });

  it('carries none of the colours the provider marked text with', () => {
    const xml = new PizZip(template).file('word/document.xml')!.asText();
    expect(xml).not.toMatch(/w:color w:val="(FF0000|92D050)"/);
  });

  it('refuses to render without the training schedule', () => {
    expect(() => renderDocument(template, { ...data, training: undefined })).toThrow(
      /training\.periodicDuration/
    );
  });
});

describe('decision_risk_evaluation_team', () => {
  it("names the team and the provider's specialist with their title", () => {
    const text = documentText(
      renderDocument(read('decision_risk_evaluation_team.docx'), {
        ...shared,
        decisionNumber: 2,
        evaluationTeam: people,
        specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
      })
    );

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. : 2 SSM Din : 19.01.2026');
    expect(text.match(/va indeplini si functia de membru al echipei de evaluare/g)).toHaveLength(2);
    expect(text).toContain(
      'Ana IONESCU in calitate de Evaluator de risc SSM din cadrul S.C. SERVICIU EXTERN S.R.L.'
    );
    acknowledged(text);
  });
});

describe('decision_imminent_danger', () => {
  it('names the designated people in each of the five measures', () => {
    const imminentDangerText = people
      .map((person) => `${person.name} avand functia de ${person.jobTitle}`)
      .join(', ');
    const text = documentText(
      renderDocument(read('decision_imminent_danger.docx'), {
        ...shared,
        decisionNumber: 4,
        workplaceManager: people[0],
        imminentDanger: people,
        imminentDangerText,
      })
    );

    expect(text).not.toContain('{{');
    expect(text).toContain(
      'Ion MARIN in calitate de Manager magazin in cadrul S.C. CLIENT DEMO S.R.L. desemneaza'
    );
    expect(text.split(imminentDangerText)).toHaveLength(6);
    acknowledged(text);
  });
});
