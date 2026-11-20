import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { knowledgeTestData } from '../../tools/knowledge-test-samples';
import { described, setSamples } from '../../tools/set-samples';
import { renderDocument, templatePlaceholders } from '../render';
import { documentText } from '../text';
import { bodyOf, documentTextOf, knowledgeTests, read, typesetFiles } from './read';

describe('decision_first_aid', () => {
  const template = read('1.3_decision_first_aid.docx');
  const data = {
    branding: false,
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
      'branding',
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
    expect(text).toContain('Nr. 3 SSM din 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU, în calitate de Director general în cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text).toContain(
      'Elena DUMITRU, având funcția de Lucrător comercial în cadrul S.C. CLIENT DEMO S.R.L., pentru toate locurile de muncă ale unității.'
    );
    // Once in the decision, once in each of the two acknowledgement tables.
    expect(text.match(/Ion MARIN/g)).toHaveLength(4);
    expect(text.match(/^Lucrător comercial$/gm)).toHaveLength(2);
    expect(text).toContain('S.C. SERVICIU EXTERN S.R.L. – Ana IONESCU');
    // Reads the same for one first aider or several.
    expect(text).toContain(
      'a personalului desemnat să acorde primul ajutor: Ion MARIN, Elena DUMITRU.'
    );
    expect(text).toContain('Personalul desemnat prin prezenta decizie va fi instruit suplimentar');
  });

  it('refuses to render without a first aider name list rather than leave a gap', () => {
    const incomplete = { ...data, firstAiderNames: undefined };
    expect(() => renderDocument(template, incomplete)).toThrow(/firstAiderNames/);
  });
});

const people = [
  { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
  { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
];

const shared = {
  branding: false,
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
  const template = read('1.1_decision_training.docx');
  const data = {
    ...shared,
    decisionNumber: 1,
    workplaceManagers: people,
    workplaceManagersText: described(people),
    training: {
      periodicDuration: '2 ore',
      intervalPhrase: 'următoarele intervale de timp',
      administrative: true,
      worker: true,
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'lunile februarie și august',
      workerFrequency: 'ANUAL',
      workerMonths: 'luna februarie',
      dayFrom: 2,
      dayTo: 7,
    },
  };

  it('prints the training schedule, and names the workplace managers once as those who train the execution staff', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('durata instruirii periodice va fi de 2 ore');
    // The original closes this sentence with the client's name and a full stop of its own.
    expect(text).toContain('din cadrul S.C. CLIENT DEMO S.R.L.\n');
    expect(text).not.toContain('..');
    expect(text).toContain(
      'șefii de locuri de muncă vor fi instruiți SEMESTRIAL, respectiv în lunile februarie și august, în perioada (zilele) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'va fi instruit ANUAL, respectiv în luna februarie, în perioada (zilele) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'pentru personalul de conducere al locurilor de muncă din cadrul S.C. CLIENT DEMO S.R.L. și pentru personalul tehnico-administrativ. Personalul de conducere al locurilor de muncă: Ion MARIN, având funcția de Manager magazin în cadrul unității; Elena DUMITRU,'
    );
    expect(text).toContain(
      'Personalul de conducere al locurilor de muncă – Ion MARIN, având funcția de Manager magazin, și Elena DUMITRU, având funcția de Lucrător comercial – va efectua instruirea la locul de muncă și instruirea periodică pentru personalul de execuție din cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text.match(/pentru personalul de execuție/g)).toHaveLength(1);
    acknowledged(text);
  });

  it('carries none of the colours the provider marked text with', () => {
    const xml = new PizZip(template).file('word/document.xml')!.asText();
    expect(xml).not.toMatch(/w:color w:val="(FF0000|92D050)"/);
  });

  it('prints only the confirmed category paragraphs', () => {
    const administrativeOnly = documentText(
      renderDocument(template, {
        ...data,
        training: {
          ...data.training,
          intervalPhrase: 'următorul interval de timp',
          worker: false,
          workerFrequency: undefined,
          workerMonths: undefined,
        },
      })
    );
    expect(administrativeOnly).toContain('vor fi instruiți SEMESTRIAL');
    expect(administrativeOnly).toContain('următorul interval de timp');
    expect(administrativeOnly).not.toContain('personalul de execuție va fi instruit');

    const workerOnly = documentText(
      renderDocument(template, {
        ...data,
        training: {
          ...data.training,
          intervalPhrase: 'următorul interval de timp',
          administrative: false,
          administrativeFrequency: undefined,
          administrativeMonths: undefined,
        },
      })
    );
    expect(workerOnly).toContain('va fi instruit ANUAL');
    expect(workerOnly).toContain(
      'instruirea periodică pentru personalul de conducere al locurilor de muncă din cadrul'
    );
    expect(workerOnly).not.toContain(
      'personalul tehnico-administrativ și șefii de locuri de muncă vor fi instruiți'
    );
  });

  it('refuses to render without the training schedule', () => {
    expect(() => renderDocument(template, { ...data, training: undefined })).toThrow(
      /training\.periodicDuration/
    );
  });
});

describe('decision_risk_evaluation_team', () => {
  const render = (certificate: string | null) =>
    documentText(
      renderDocument(read('1.2_decision_risk_evaluation_team.docx'), {
        ...shared,
        decisionNumber: 2,
        evaluationTeam: people,
        riskEvaluator: {
          name: 'Ana IONESCU',
          professionalTitle: 'Evaluator de risc SSM',
          certificate,
        },
      })
    );

  it('names the team and the risk evaluator with their title as the coordinator', () => {
    const text = render(null);

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 2 SSM din 19.01.2026');
    expect(text.match(/va îndeplini și funcția de membru al echipei de evaluare/g)).toHaveLength(2);
    expect(text).toContain(
      'Ana IONESCU, în calitate de Evaluator de risc SSM din cadrul S.C. SERVICIU EXTERN S.R.L., va coordona'
    );
    acknowledged(text);
  });

  it("adds the evaluator's certificate only where there is one", () => {
    expect(render('seria A nr. 1842/2024')).toContain(
      'Ana IONESCU, în calitate de Evaluator de risc SSM, titular al certificatului seria A nr. 1842/2024, din cadrul S.C. SERVICIU EXTERN S.R.L., va coordona'
    );
  });
});

describe('decision_imminent_danger', () => {
  const render = (
    managers: typeof people,
    wording: 'assume' | 'assume_and_designate' | 'designate_alongside' | 'assign' | 'designate',
    others: typeof people | null = null,
    managerNames: string | null = null
  ) =>
    documentText(
      renderDocument(read('1.4_decision_imminent_danger.docx'), {
        ...shared,
        decisionNumber: 4,
        workplaceManagersText: described(managers),
        imminentDanger: people,
        imminentDangerText: described(people),
        workplaceManagersAssumeImminentDanger: wording === 'assume',
        workplaceManagersAssumeAndDesignateImminentDanger: wording === 'assume_and_designate',
        workplaceManagersDesignateAlongsideImminentDanger: wording === 'designate_alongside',
        workplaceManagersAssignImminentDanger: wording === 'assign',
        workplaceManagersDesignateImminentDanger: wording === 'designate',
        imminentDangerOthersText: others && described(others),
        imminentDangerManagerNames: managerNames,
      })
    );
  const lead = 'conducerea locurilor de muncă din cadrul S.C. CLIENT DEMO S.R.L. – ';

  it('names the designated people in each of the five measures', () => {
    const manager = [{ name: 'Ana POP', jobTitle: 'Șef sală' }];
    const text = render(manager, 'designate');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}Ana POP, având funcția de Șef sală – desemnează pe ${described(people)}, cu următoarele atribuții:`
    );
    // Named once; each of the five measures then refers to them.
    expect(text.split(described(people))).toHaveLength(2);
    expect(text).not.toContain('în calitate de Manager magazin');
    // Worded for one designated person or several.
    expect(text.match(/: personalul desemnat/g)).toHaveLength(5);
    expect(text).toContain('Personalul desemnat va primi de asemenea');
    expect(text).not.toMatch(/lucrătorii desemnați/i);
    acknowledged(text);
  });

  it('lets the workplace managers take the duties on when they are the ones designated', () => {
    const text = render(people, 'assume');

    expect(text).toContain(
      `${lead}${described(people)} – își asumă, în calitate de personal desemnat, următoarele atribuții:`
    );
    expect(text.split(described(people))).toHaveLength(2);
    expect(text).not.toContain('desemnează pe');
    acknowledged(text);
  });

  it('lets the workplace managers take the duties on and designate the others beside them', () => {
    const text = render(people.slice(0, 1), 'assume_and_designate', people.slice(1));

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}Ion MARIN, având funcția de Manager magazin – își asumă rolul de personal desemnat și desemnează pe Elena DUMITRU, având funcția de Lucrător comercial, cu următoarele atribuții:`
    );
    expect(text.match(/desemnează pe/g)).toHaveLength(1);
    expect(text.match(/Ion MARIN/g)).toHaveLength(2);
    acknowledged(text);
  });

  const manager = { name: 'Ana POP', jobTitle: 'Șef sală' };

  it('lets a designated manager take the role on beside the people the managers designate', () => {
    const text = render([people[0]!, manager], 'designate_alongside', people.slice(1), 'Ion MARIN');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}${described([people[0]!, manager])} – desemnează pe Elena DUMITRU, având funcția de Lucrător comercial, alături de Ion MARIN, care își asumă rolul de personal desemnat, cu următoarele atribuții:`
    );
    expect(text.match(/desemnează pe/g)).toHaveLength(1);
    expect(text).not.toContain('Ion MARIN, având funcția de Manager magazin, și Elena');
    acknowledged(text);
  });

  it('settles which managers take the duties on when nobody else is designated', () => {
    const text = render([people[0]!, manager], 'assign', null, 'Ion MARIN');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}${described([people[0]!, manager])} – stabilește ca Ion MARIN să își asume, în calitate de personal desemnat, următoarele atribuții:`
    );
    expect(text).not.toContain('desemnează pe');
    acknowledged(text);
  });
});

describe('decision_workers_representative', () => {
  const template = read('1.5_decision_workers_representative.docx');
  const render = (workersRepresentatives: typeof people) =>
    documentText(
      renderDocument(template, {
        ...shared,
        decisionNumber: 5,
        workersRepresentatives,
        workersRepresentativesLead:
          workersRepresentatives.length === 1 ? 'următorul angajat' : 'următorii angajați',
      })
    );

  it('designates each representative once, and lists them in the table', () => {
    const text = render(people);
    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 5 SSM din 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU, având funcția de Director general în cadrul S.C. CLIENT DEMO S.R.L., începând cu data de 19.01.2026, desemnează'
    );
    expect(text).toMatch(
      /pe următorii angajați:\s+Ion MARIN, având funcția de Manager magazin\.\s+Elena DUMITRU, având funcția de Lucrător comercial\./
    );
    expect(text).not.toMatch(/funcția de [^\n]*;/);
    acknowledged(text);
  });

  it('speaks of one employee when there is one', () => {
    expect(render([people[0]!])).toContain('pe următorul angajat:');
  });

  it('prints the thresholds of H.G. 1425/2006 art. 53(2) as minimums', () => {
    const text = render(people);
    expect(text).toContain('cel puțin un reprezentant, în cazul în care');
    expect(text).toContain('va avea între 10 și 49 de lucrători inclusiv');
    expect(text).toContain('cel puțin doi reprezentanți, în cazul în care');
    expect(text).toContain('va avea între 50 și 100 de lucrători inclusiv');
  });

  it('says who elects the representatives in a sentence that reads', () => {
    const text = render(people);
    expect(text).toContain(
      'Reprezentanții lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă sunt aleși de către și dintre lucrătorii'
    );
    expect(text).not.toContain('Numirea reprezentanților');
  });
});

describe('employer_briefing', () => {
  const template = read('11_employer_briefing.docx');

  it("prints the client's periodic training duration from the field decision 1.1 prints", () => {
    expect(templatePlaceholders(template)).toContain('training.periodicDuration');
    const text = documentText(
      renderDocument(template, {
        ...shared,
        provider: { ...shared.provider, representativeRole: 'Administrator' },
        workersRepresentativeDecision: false,
        training: { periodicDuration: '1 oră și 30 de minute' },
      })
    );
    expect(text).toContain(
      'Instruirea periodică durează 1 oră și 30 de minute și are periodicitatea stabilită prin programul de instruire-testare și prin instrucțiunile proprii ale unității.'
    );
    expect(text).not.toContain('1,30 ore');
  });

  // A reference list reads better as a list than as a grid of cells.
  it('lists the acts, its own documents and the other materials under headings, not in tables', () => {
    const body = bodyOf('11_employer_briefing.docx');
    const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const texts = blocks.map(documentTextOf);
    const part = blocks.slice(
      texts.findIndex((text) =>
        text.includes('aplicabile în funcție de domeniile în care unitatea')
      ),
      texts.findIndex((text) => text.startsWith('Capitolul X.'))
    );
    const paragraphs = part.filter((block) => block.startsWith('<w:p')).map(documentTextOf);
    expect(paragraphs).toEqual(
      expect.arrayContaining([
        'Acte normative în domeniul securității și sănătății în muncă',
        'Legea 319/2006 – Legea securității și sănătății în muncă',
        'Documente interne de informare',
        'Cărți tehnice și manuale de utilizare – Toate informațiile necesare privind modul de utilizare, depozitarea, întreținerea și mentenanța, specificațiile tehnice, principiile de funcționare și sistemele de control și securitate, obligațiile și atenționările specifice, pentru fiecare echipament de muncă din dotarea unității, astfel încât acesta să fie folosit eficient și fără accidente.',
        'Alte materiale informative',
        'Stoc de mijloace de semnalizare',
      ])
    );
    expect(paragraphs.filter((text) => / – /.test(text))).toHaveLength(21 + 7 + 1);
    expect(part.join('')).not.toMatch(/TABEL|Nr\. crt\.|TIP SEMNALIZARE|HouseTable/);
    expect(body).toContain(
      'oferă informații concrete, aplicabile în funcție de domeniile în care unitatea își desfășoară activitatea, astfel:'
    );
  });
});

// ADR 024: the questions come from the organization's question bank, printed on the test and
// again on the specimen, a row each on the answer sheet and in the key.
describe('knowledge tests', () => {
  const header = {
    branding: true,
    issueDate: '19.01.2026',
    provider: {
      legalName: 'S.C. SERVICIU EXTERN S.R.L.',
      representativeName: 'Dan MARIN',
      representativeRole: 'Administrator',
    },
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Administrator',
    },
    fireSafetyTechnician: { name: 'Radu STAN' },
  };

  it.each(knowledgeTests)('%s asks for the questions besides its header', (code, name) => {
    expect(
      templatePlaceholders(read(name)).filter(
        (each) => !each.includes('.') && !['branding', 'issueDate'].includes(each)
      )
    ).toEqual([
      '$last',
      code === 'TASSM' ? 'keyLabels' : 'key',
      'letter',
      'number',
      'options',
      'questions',
      'text',
    ]);
  });

  it.each(
    knowledgeTests.flatMap(([code, name]) => [10, 12].map((count) => [code, name, count] as const))
  )(
    '%s (%s) prints %i questions twice, a row each on the answer sheet and in the key',
    (code, name, count) => {
      const data = knowledgeTestData(code, count);
      const text = documentText(renderDocument(read(name), { ...header, ...data }));
      expect(text).not.toContain('{{');
      expect(text.match(/^\d+\. /gm)).toHaveLength(count * 2);
      expect(
        text.match(
          /^TEST( ANUAL)? DE VERIFICARE .*\nLa fiecare întrebare pot fi corecte unul sau mai multe răspunsuri\.$/gm
        )
      ).toHaveLength(2);
      expect(text).toContain(
        'Rezultatul testării (minimum 70% răspunsuri corecte):\nAdmis / Respins'
      );
      for (const question of data.questions) {
        expect(text.split(`\n${question.number}. ${question.text}\n`)).toHaveLength(3);
        for (const option of question.options) {
          expect(text.split(`\n${option.letter}) ${option.text}\n`).length).toBeGreaterThanOrEqual(
            3
          );
        }
      }
      const sheetStart = text.indexOf('Răspunsul dat');
      const sheet = text.slice(sheetStart, text.indexOf('\n1. ', sheetStart));
      expect(sheet.match(/^\d+$/gm)).toHaveLength(count);
      const keyStart = text.indexOf('\nRĂSPUNSURILE CORECTE\nNr. întrebării\nRăspunsul corect\n');
      expect(keyStart).toBeGreaterThan(sheetStart);
      const key = text.slice(keyStart);
      // 5.1's key names the options as they are labelled; the fire-safety tests' are not reviewed yet.
      const printed = (question: (typeof data.questions)[number]) =>
        code === 'TASSM' ? question.keyLabels : question.key;
      expect(
        key.match(
          code === 'TASSM' ? /^\d+\n[a-d]\)(?:, [a-d]\))*$/gm : /^\d+\n[A-D](?:, [A-D])*$/gm
        )
      ).toHaveLength(count);
      for (const question of data.questions) {
        expect(key).toContain(`\n${question.number}\n${printed(question)}\n`);
      }
      if (code === 'TASSM') {
        expect(
          text.indexOf('\nSPECIMEN CU RĂSPUNSURILE CORECTE\nTEST DE VERIFICARE')
        ).toBeGreaterThan(sheetStart);
      }
    }
  );

  it.each(knowledgeTests)('%s opens the specimen on a page of its own', (code, name) => {
    const paragraphs: string[] = bodyOf(name).match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const titles = paragraphs.filter((paragraph) =>
      /^TEST( ANUAL)? DE VERIFICARE /.test(documentTextOf(paragraph))
    );
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain('<w:pageBreakBefore w:val="false"/>');
    const opening =
      code === 'TASSM' ? paragraphs[paragraphs.lastIndexOf(titles[1]!) - 1]! : titles[1]!;
    expect(documentTextOf(opening)).toBe(
      code === 'TASSM' ? 'SPECIMEN CU RĂSPUNSURILE CORECTE' : documentTextOf(titles[1]!)
    );
    expect(opening).toContain('<w:pageBreakBefore w:val="true"/>');
  });

  it('names the hiring test one way on its title and in its header box', () => {
    const zip = new PizZip(read('5.1_test_hiring.docx'));
    const titles = (bodyOf('5.1_test_hiring.docx').match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
      .map(documentTextOf)
      .filter((paragraph) => paragraph.startsWith('TEST '));
    expect(titles).toEqual(Array(2).fill('TEST DE VERIFICARE A CUNOȘTINȚELOR LA ANGAJARE (TASSM)'));
    for (const part of ['word/header1.xml', 'word/header2.xml', 'word/header3.xml']) {
      expect(documentTextOf(zip.file(part)!.asText())).toContain(
        'Test de verificare a cunoștințelor la angajare (TASSM)'
      );
    }
  });

  it('names the SU annual test annual, never periodic, in its titles and its header', () => {
    const zip = new PizZip(read('fire/4.2_fire_test_annual.docx'));
    const titles = (
      bodyOf('fire/4.2_fire_test_annual.docx').match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
    )
      .map(documentTextOf)
      .filter((paragraph) => paragraph.startsWith('TEST '));
    expect(titles).toEqual(
      Array(2).fill(
        'TEST ANUAL DE VERIFICARE A CUNOȘTINȚELOR PRIVIND SITUAȚIILE\u00a0DE\u00a0URGENȚĂ'
      )
    );
    for (const part of ['word/header1.xml', 'word/header2.xml', 'word/header3.xml']) {
      const header = documentTextOf(zip.file(part)!.asText());
      expect(header).toContain(
        'Test anual de verificare a cunoștințelor în domeniul situațiilor de urgență'
      );
      expect(header).not.toMatch(/periodic/i);
    }
  });

  it.each(knowledgeTests)('%s holds no picture', (_code, name) => {
    const zip = new PizZip(read(name));
    expect(Object.keys(zip.files).filter((part) => part.startsWith('word/media/'))).toEqual([]);
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).not.toContain('relationships/image');
  });

  it.each(knowledgeTests)('%s refuses to render without the questions', (_code, name) => {
    expect(() => renderDocument(read(name), header)).toThrow(/questions/);
  });
});

describe('cover_decisions', () => {
  const template = read('1.0_cover_decisions.docx');
  const render = (workersRepresentativeDecision: boolean) =>
    documentText(
      renderDocument(template, {
        ...shared,
        provider: { ...shared.provider, representativeRole: 'Administrator' },
        workersRepresentativeDecision,
      })
    );

  it('lists decision 1.5 only when it is part of the set', () => {
    expect(render(true)).toContain('5. Desemnarea reprezentanților lucrătorilor');
    const without = render(false);
    expect(without).not.toContain('Desemnarea reprezentanților');
    expect(without).toContain('grav și iminent.');
  });
});

describe('branding', () => {
  const template = read('1.2_decision_risk_evaluation_team.docx');
  const data = {
    ...shared,
    decisionNumber: 2,
    evaluationTeam: people,
    riskEvaluator: {
      name: 'Ana IONESCU',
      professionalTitle: 'Evaluator de risc SSM',
      certificate: null,
    },
  };
  const footerText = (file: Uint8Array) => {
    const zip = new PizZip(file);
    return Object.keys(zip.files)
      .filter((part) => /word\/footer\d*\.xml/.test(part))
      .map((part) => documentTextOf(zip.file(part)!.asText()));
  };

  it('prints the line in the footer when the merge data asks for it', () => {
    const footers = footerText(renderDocument(template, { ...data, branding: true }));
    expect(new Set(footers)).toEqual(new Set(['Document generat cu SSM Ușor · ssmusor.ro']));
  });

  it('prints nothing when branding is false, and refuses data without it', () => {
    expect(new Set(footerText(renderDocument(template, { ...data, branding: false })))).toEqual(
      new Set([''])
    );
    expect(() => renderDocument(template, { ...data, branding: undefined })).toThrow(/branding/);
  });

  const brandingParagraphs = (name: string) => {
    const zip = new PizZip(read(name));
    return Object.keys(zip.files)
      .filter((part) => /word\/footer\d*\.xml/.test(part))
      .flatMap(
        (part) =>
          zip
            .file(part)!
            .asText()
            .match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
      )
      .filter((paragraph) => documentTextOf(paragraph).includes('{{#branding}}'));
  };

  // The own instructions' PDF puts an annex title page after its pages: the line must not move.
  it.each(typesetFiles)('%s centres the line on the width of the text', (name) => {
    const paragraphs = brandingParagraphs(name);
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) {
      expect(paragraph).toContain('<w:jc w:val="center"/>');
      expect(paragraph).not.toMatch(/<w:ind [^>]*w:(right|end)="[1-9]/);
    }
  });

  it.each(typesetFiles)('%s sets the line in 7.5 pt grey', (name) => {
    const runs = brandingParagraphs(name)
      .flatMap((paragraph) => paragraph.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [])
      .filter((run) => run.includes('<w:t'));
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run).toContain('<w:sz w:val="15"/>');
      expect(run).toContain('<w:color w:val="7A7A7A"/>');
    }
  });
});

// ADR 014: the two plans are static text, and their article ranges fall on the chapters of the
// 2.2 and 3.2 templates.
describe('training_themes', () => {
  const lines = documentText(read('4.2_training_themes.docx')).split('\n');

  it('cites the general training material chapter by chapter, 2.2 as it is numbered', () => {
    expect(lines.filter((line) => line.startsWith('MISSMIG Art.'))).toEqual([
      ...[
        [1, 6],
        [7, 13],
        [14, 15],
        [16, 27],
        [28, 80],
        [81, 96],
        [97, 108],
        [109, 120],
        [121, 151],
        [152, 210],
        [211, 235],
        [236, 267],
        [268, 277],
        [278, 290],
        [291, 299],
        [300, 324],
      ].map(([from, to]) => `MISSMIG Art. ${from} – ${to}`),
      'MISSMIG Art. 325',
    ]);
  });

  it('cites the common part of the own instructions chapter by chapter', () => {
    expect(lines.filter((line) => line.startsWith('I.P.S.S.M. Art.'))).toEqual(
      [
        [1, 9],
        [10, 44],
        [45, 46],
        [47, 56],
        [57, 63],
        [64, 95],
        [96, 159],
        [160, 179],
        [180, 194],
        [195, 235],
        [236, 255],
        [256, 290],
      ].map(([from, to]) => `I.P.S.S.M. Art. ${from} – ${to}`)
    );
  });

  it('repeats a block per position, a row per session and a citation per module', () => {
    const placeholders = templatePlaceholders(read('4.2_training_themes.docx'));
    expect(placeholders).toEqual(
      expect.arrayContaining(['themes.positions', 'sessions', 'modules', 'themes.annexTitles'])
    );
    const text = lines.join('\n');
    expect(text.match(/\{\{#themes\.positions\}\}/g)).toHaveLength(2);
    expect(text).toContain('{{#sessions}}{{month}}');
    expect(text).toContain(
      'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0290; {{#modules}}{{citation}}; {{/modules}}'
    );
  });

  it('adds the minutes of every row of a plan, breaks included, up to the total it prints', () => {
    const cellsOf = (row: string) =>
      (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(documentTextOf);
    const plans = (bodyOf('4.2_training_themes.docx').match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [])
      .map((table) => (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map(cellsOf))
      .filter((rows) => rows.some((cells) => cells.includes('TIMP TOTAL DE INSTRUIRE')));
    expect(plans).toHaveLength(2);
    for (const rows of plans) {
      const minutes = (cells: string[]) => Number(/^(\d+) min$/.exec(cells.at(-1)!)?.[1] ?? 0);
      const total = rows.find((cells) => cells.includes('TIMP TOTAL DE INSTRUIRE'))!;
      const sum = rows
        .filter((cells) => cells !== total)
        .reduce((minutesSoFar, cells) => minutesSoFar + minutes(cells), 0);
      expect(sum).toBe(minutes(total));
      expect(sum).toBe(240);
    }
  });

  it('labels the trainer without saying who it is, since the provider trains some posts', () => {
    expect(lines.filter((line) => line === 'Instruire efectuată de')).toHaveLength(3);
    expect(lines.join('\n')).not.toMatch(/ȘEF DIRECT|CINE EFECTUEAZĂ/);
  });

  it('heads each post with its name and sets its details in a key and value block', () => {
    const data = setSamples.find((sample) => sample.label === 'long')!.data;
    const merged = renderDocument(read('4.2_training_themes.docx'), data);
    const text = documentText(merged).split('\n');
    const posts = (data.themes as { positions: { name: string }[] }).positions;
    for (const { name } of posts) {
      expect(text.filter((line) => line === name).length).toBeGreaterThanOrEqual(2);
    }
    expect(text.filter((line) => line === 'Locul de muncă')).toHaveLength(1 + 2 * posts.length);
    expect(text.filter((line) => line === 'Funcția')).toEqual(['Funcția']);
    expect(text.filter((line) => line === 'Periodicitate')).toHaveLength(posts.length);
    expect(text).toContain('6 luni');
    expect(text.join('\n')).not.toMatch(/LOCUL DE MUNCĂ:|FUNCȚIA:|PERIODICITATE:/);
  });

  // A block that keeps with what follows it when no table follows chained every post of
  // chapter II into one run, which moved them all to the next page.
  it('keeps a periodic plan with its block, and no workplace block with the next post', () => {
    const body = bodyOf('4.2_training_themes.docx');
    const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const keyValue = blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.startsWith('<w:tbl>') && block.includes('Locul de muncă'));
    expect(keyValue).toHaveLength(3);
    const lastRowKeeps = (table: string) =>
      /<w:keepNext\/>/.test(table.match(/<w:tr>(?:(?!<w:tr>)[\s\S])*<\/w:tr><\/w:tbl>$/)![0]);
    expect(keyValue.map(({ block }) => lastRowKeeps(block))).toEqual([false, false, true]);
    const [, , periodic] = keyValue;
    expect(blocks[periodic!.index + 1]).toContain('<w:keepNext/>');
    expect(blocks[periodic!.index + 2]).toContain('<w:tblStyle w:val="HouseTable"/>');
  });
});

describe('risk_assessment', () => {
  const text = documentText(read('9_risk_assessment.docx'));

  it("prints nothing of the first client's posts, levels or premises", () => {
    expect(text).not.toMatch(
      /MANAGER MAGAZIN|Manager magazin|GELATERIE|BARMAN|VIZITATOR|5630|Calea Victoriei|Vestiarele|Stingător P6|2,40|2,55/
    );
  });

  it('repeats a subchapter per evaluation, which the contents list from the merged headings', () => {
    expect(templatePlaceholders(read('9_risk_assessment.docx'))).toEqual(
      expect.arrayContaining([
        'riskAssessment.evaluations',
        'components',
        'groups',
        'factors',
        'sheet',
        'unacceptable',
        'plan',
        'ranked',
        'riskAssessment.globalLevel',
        'workersRepresentatives',
      ])
    );
    expect(text.match(/\{\{#riskAssessment\.evaluations\}\}/g)).toHaveLength(2);
    expect(bodyOf('9_risk_assessment.docx')).toContain(
      '<w:docPartGallery w:val="Table of Contents"/>'
    );
    expect(text).toContain('{{#sheet}}{{component}}');
    expect(text).toContain('Conducerea locurilor de muncă: {{workplaceManagersList}}');
    expect(text).toContain('SUBCAPITOLUL V.{{roman}}.');
    expect(text).not.toMatch(/\d+ – \d+\s*(I|II|III|IV|V|VI)\b/);
  });

  // A group's name covers its rows in one cell, never above empty bordered ones.
  it("merges a component's and a group's cells down the rows of the evaluation sheet", () => {
    const data = setSamples.find((sample) => sample.label === 'long')!.data;
    const body = new PizZip(renderDocument(read('9_risk_assessment.docx'), data))
      .file('word/document.xml')!
      .asText();
    const sheets = (body.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).filter((table) =>
      documentTextOf(table).startsWith('Componenta sistemului de muncăFactori de risc identificați')
    );
    const evaluations = (
      data.riskAssessment as { evaluations: { sheet: { component: string; group: string }[] }[] }
    ).evaluations;
    expect(sheets).toHaveLength(evaluations.length);
    sheets.forEach((sheet, index) => {
      const rows = sheet.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!.slice(1);
      const cells = (row: string) => row.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!.slice(0, 2);
      const merges = rows.map((row) =>
        cells(row).map((cell) => (cell.includes('<w:vMerge/>') ? 'continue' : 'restart'))
      );
      expect(merges).toEqual(
        evaluations[index]!.sheet.map(({ component, group }) => [
          component ? 'restart' : 'continue',
          group ? 'restart' : 'continue',
        ])
      );
    });
  });

  it('lists every factor with a measure in the measures sheet, as the plan does', () => {
    const sheet = text.slice(
      text.indexOf('IV. FIȘA DE MĂSURI PROPUSE'),
      text.indexOf('V. INTERPRETAREA REZULTATELOR EVALUĂRII')
    );
    expect(sheet).toContain('{{#plan}}{{$index}}.');
    expect(sheet).toContain('{{measures}}{{/plan}}');
    expect(sheet).toContain('{{#noPlan}}');
    expect(sheet).not.toContain('nacceptable}}');
  });

  it('says when the assessment is reviewed, in the words of H.G. 1425/2006', () => {
    expect(text).toContain(
      'ori de câte ori intervin modificări ale condițiilor de muncă, respectiv la apariția unor riscuri noi și în urma producerii unui eveniment'
    );
  });
});

describe('protective_equipment_list', () => {
  const template = read('6_protective_equipment_list.docx');
  const data = setSamples.find((sample) => sample.label === 'long')!.data;

  // One header for every post, each post named on a row of the table.
  it('lists every equipped post in one table, its name on a shaded row over its equipment', () => {
    const body = new PizZip(renderDocument(template, data)).file('word/document.xml')!.asText();
    const part = body.slice(body.indexOf('Necesarul de E.I.P. pe posturi de lucru'));
    const tables = part.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    expect(tables).toHaveLength(1);
    const rows = tables[0]!.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
    const equipped = data.equippedPositions as { name: string; equipment: unknown[] }[];
    expect(rows).toHaveLength(
      1 + equipped.reduce((sum, post) => sum + 1 + post.equipment.length, 0)
    );
    const groupRows = rows.filter((row) => row.includes('w:fill="F1F4EF"'));
    expect(groupRows.map(documentTextOf)).toEqual(
      equipped.map((post) =>
        'workZone' in post && post.workZone
          ? `${post.name} – locul de muncă: ${post.workZone}`
          : post.name
      )
    );
    for (const row of groupRows) {
      expect(row).toContain('<w:gridSpan w:val="4"/>');
      expect(row).toContain('<w:keepNext/>');
    }
    expect(part).not.toContain('POST DE LUCRU');
  });

  it('prints neither the heading nor the table without an equipped post', () => {
    const text = documentText(
      renderDocument(template, { ...data, equippedPositions: [], hasEquippedPositions: false })
    );
    expect(text).not.toContain('Necesarul de E.I.P. pe posturi de lucru');
    expect(text).not.toContain('Sortiment E.I.P. necesar de acordat');
  });
});

describe('prevention_plan', () => {
  const text = documentText(read('10_prevention_plan.docx'));

  // 4.2, 6 and 10 name a post in one form.
  it('heads each plan with the post as the app spells it and its work zone beside it', () => {
    const data = setSamples.find((sample) => sample.label === 'long')!.data;
    const merged = documentText(renderDocument(read('10_prevention_plan.docx'), data));
    expect(merged).toContain('Manager magazin – locul de muncă: Birou');
    expect(merged).toMatch(/^Sudor$/m);
    expect(merged).not.toContain('POSTUL DE LUCRU');
  });

  it("prints nothing of the first client's posts or measures", () => {
    expect(text).not.toMatch(
      /MANAGER MAGAZIN|GELATERIE|BARMAN|VIZITATOR|P\.R\.A\.M\.|Cond\. loc muncă|Periodic/
    );
  });

  it('repeats a table of the columns of annex 7 per evaluation, or a sentence without measures', () => {
    expect(text.match(/\{\{#riskAssessment\.evaluations\}\}/g)).toHaveLength(1);
    expect(text).toContain('{{#plan}}{{$index}}.');
    expect(text).toContain('{{#noPlan}}');
    for (const column of [
      'Riscuri evaluate',
      'Măsuri tehnice',
      'Măsuri organizatorice',
      'Măsuri igienico-sanitare',
      'Măsuri de altă natură',
      'Acțiuni în scopul realizării măsurii',
      'Termen de realizare',
      'Persoana care răspunde de realizarea măsurii',
      'Observații',
    ]) {
      expect(text).toContain(column);
    }
  });
});
