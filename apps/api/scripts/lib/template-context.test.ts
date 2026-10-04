import { readFileSync } from 'node:fs';

import { documentTypeKeys } from '@ssm-usor/contracts';
import { annexTitlePage, documentText, renderDocument } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import type { Json } from '../../src/database.types';
import { buildDocumentContext, documentData } from '../../src/modules/documents/context';
import { facts } from '../../src/modules/documents/context.fixture';
import { merge } from '../../src/modules/documents/documents';
import { annexTitlePagesData } from '../../src/modules/documents/snapshot';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the templates, merged with the context the API builds.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
  templates: { typeKey: string; title: string; file: string }[];
};

describe('the built-in templates', () => {
  it('are the document types of the contracts, in the same order', () => {
    expect(manifest.templates.map((entry) => entry.typeKey)).toEqual([...documentTypeKeys]);
  });

  const reversed: typeof facts = {
    ...facts,
    branding: false,
    workplaces: [],
    client: {
      ...facts.client,
      administrativeTrainingIntervalMonths: null,
      administrativeTrainingNotApplicable: true,
    },
    staffCategoriesInUse: ['execution'],
    jobPositions: facts.jobPositions.map((position) => ({
      ...position,
      workZone: position.workZone ? null : 'Atelier',
      needsProtectiveEquipment: false,
      equipment: [],
      needsInstructions: false,
      instructions: [],
    })),
    riskEvaluations: facts.riskEvaluations.map((evaluation) => ({
      ...evaluation,
      factors: evaluation.factors.map((factor) => ({
        ...factor,
        gravityClass: 1,
        probabilityClass: 1,
        measures: [],
      })),
    })),
    currentEmployeeCount: 12,
    responsiblePersons: [
      ...facts.responsiblePersons,
      {
        fullName: 'Mihai POPESCU',
        jobTitle: 'Sudor',
        roles: ['workers_representative', 'imminent_danger'],
        currentEmployee: true,
      },
    ],
  };

  // The engine throws on a placeholder without a value, and on a section name the data does
  // not have, so this proves the context covers everything the templates ask for.
  it.each(
    manifest.templates.flatMap((entry) => [
      [entry.typeKey, 'the fixture', entry.file, facts] as const,
      [entry.typeKey, 'every condition reversed', entry.file, reversed] as const,
    ])
  )(
    '%s renders from %s with nothing missing',
    (typeKey, _, file, variant) => {
      const context = buildDocumentContext(variant);
      const output = renderDocument(
        readFileSync(new URL(file, templatesUrl)),
        documentData(context, typeKey as (typeof documentTypeKeys)[number])
      );
      const text = documentText(output);
      expect(text).not.toContain('{{');
      expect(text).toContain('PIPETECH');
      expect(text.includes('Document generat cu SSM Ușor')).toBe(variant.branding);
    },
    30_000
  );
});

describe('the training themes', () => {
  it('print a block per position, with its trainer, its modules and a row per session', () => {
    const entry = manifest.templates.find((template) => template.typeKey === 'training_themes')!;
    const text = documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildDocumentContext(facts), 'training_themes')
      )
    );
    expect(text).toContain(
      'Florin Cristian TALOȘ și Ioana PETRE – conducători loc\u00a0de\u00a0muncă'
    );
    expect(text).toContain('S.C. SERVICIU EXTERN DEMO S.R.L. – Dan MARIN');
    expect(text).toContain(
      'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0287; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012; I.P.S.S.M. Sudură oxiacetilenică, Art.\u00a01\u00a0–\u00a031;'
    );
    expect(text).toContain('I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică');
    expect(text.match(/Testare\.$/gm)).toHaveLength(2);
    expect(text).toContain('I.P.S.S.M. Art.\u00a0234\u00a0–\u00a0287;');
  }, 30_000);
});

describe('the annex title pages', () => {
  it('merge from what the own instructions snapshot, one per annexed module', () => {
    const entry = manifest.templates.find((template) => template.typeKey === 'own_instructions')!;
    const { snapshot } = merge(
      readFileSync(new URL(entry.file, templatesUrl)),
      documentData(buildDocumentContext(facts), 'own_instructions'),
      'own_instructions'
    );
    const pages = annexTitlePagesData(snapshot as Json).map((data) =>
      documentText(renderDocument(annexTitlePage(), data))
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('ANEXA 1');
    expect(pages[0]).toContain('I.P.S.S.M. Activități de birou');
    expect(pages[1]).toContain('I.P.S.S.M. Sudură oxiacetilenică');
    for (const text of pages) {
      expect(text).not.toContain('{{');
      expect(text).toContain('PIPETECH');
      expect(text).toMatch(/versiunea din \d{2}\.\d{2}\.\d{4}/);
    }
  }, 30_000);
});

describe('the decisions', () => {
  const render = (typeKey: string) => {
    const entry = manifest.templates.find((template) => template.typeKey === typeKey)!;
    return documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildDocumentContext(facts), typeKey)
      )
    );
  };
  const managers =
    'Florin Cristian TALOȘ, având funcția de Administrator, și Ioana PETRE, având funcția de Șef de echipă';

  it('name every workplace manager once as those who train the execution staff', () => {
    const text = render('decision_training');
    expect(text).toContain(
      `Personalul de conducere al locurilor de muncă – ${managers} – va efectua instruirea la locul de muncă și instruirea periodică pentru personalul de execuție din cadrul S.C. PIPETECH S.R.L.`
    );
    expect(text).toContain('durata instruirii periodice va fi de 2\u00a0ore;');
  }, 30_000);

  it('let the workplace managers take on the imminent danger duties when they are the ones designated', () => {
    const text = render('decision_imminent_danger');
    expect(text).toContain(
      `conducerea locurilor de muncă din cadrul S.C. PIPETECH S.R.L. – ${managers} – își asumă, în calitate de personal desemnat, următoarele atribuții:`
    );
    expect(text).not.toContain('desemnează pe');
  }, 30_000);
});

describe('decision 1.4', () => {
  const person = (
    fullName: string,
    jobTitle: string,
    roles: (typeof facts)['responsiblePersons'][number]['roles']
  ) => ({ fullName, jobTitle, roles, currentEmployee: true });
  const roza = 'Roza URSU, având funcția de Director general';
  const ion = 'Ion MARIN, având funcția de Șef atelier';
  const article2 = (...responsiblePersons: (typeof facts)['responsiblePersons']) =>
    renderWith('decision_imminent_danger', {
      ...facts,
      responsiblePersons: [
        ...responsiblePersons,
        person('Dan RUS', 'Magaziner', ['first_aid', 'risk_evaluation_team']),
      ],
    });
  const lead = 'conducerea locurilor de muncă din cadrul S.C. PIPETECH S.R.L. – ';

  it.each([
    [
      'the one manager designated',
      [person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger'])],
      `${lead}${roza} – își asumă, în calitate de personal desemnat, următoarele atribuții:`,
    ],
    [
      'two managers who are the two designated',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager', 'imminent_danger']),
      ],
      `${lead}${roza}, și ${ion} – își asumă, în calitate de personal desemnat, următoarele atribuții:`,
    ],
    [
      'a manager designated beside someone else',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['imminent_danger']),
      ],
      `${lead}${roza} – își asumă rolul de personal desemnat și desemnează pe ${ion}, cu următoarele atribuții:`,
    ],
    [
      'a manager designated beside two others',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['imminent_danger']),
        person('Ana POP', 'Contabil', ['imminent_danger']),
      ],
      `${lead}${roza} – își asumă rolul de personal desemnat și desemnează pe ${ion}, și Ana POP, având funcția de Contabil, cu următoarele atribuții:`,
    ],
    [
      'a manager who designates someone else',
      [
        person('Roza URSU', 'Director general', ['workplace_manager']),
        person('Ion MARIN', 'Șef atelier', ['imminent_danger']),
      ],
      `${lead}${roza} – desemnează pe ${ion}, cu următoarele atribuții:`,
    ],
    [
      'a manager designated while another manager is not',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager']),
        person('Ana POP', 'Contabil', ['imminent_danger']),
      ],
      `${lead}${roza}, și ${ion} – desemnează pe ${roza}, și Ana POP, având funcția de Contabil, cu următoarele atribuții:`,
    ],
  ])(
    'words Art. 2 for %s',
    (_, responsiblePersons, sentence) => {
      const text = article2(...responsiblePersons);
      expect(text.replace(/\s+/g, ' ')).toContain(sentence);
      expect(text).toContain('Personalul desemnat va primi');
    },
    30_000
  );

  it('lists everyone designated in the record, the managers among them', () => {
    const text = article2(
      person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
      person('Ion MARIN', 'Șef atelier', ['imminent_danger'])
    );
    const record = text.slice(text.indexOf('PROCES-VERBAL'));
    expect(record).toContain('Roza URSU');
    expect(record).toContain('Ion MARIN');
  }, 30_000);
});

const renderWith = (typeKey: (typeof documentTypeKeys)[number], variant: typeof facts) => {
  const entry = manifest.templates.find((template) => template.typeKey === typeKey)!;
  return documentText(
    renderDocument(
      readFileSync(new URL(entry.file, templatesUrl)),
      documentData(buildDocumentContext(variant), typeKey)
    )
  );
};

describe('the employer briefing', () => {
  it.each([
    [30, '30 de minute'],
    [90, '1 oră și 30 de minute'],
  ])(
    'prints the periodic training duration of %i minutes as decision 1.1 does',
    (minutes, duration) => {
      const variant = { ...facts, client: { ...facts.client, periodicTrainingMinutes: minutes } };
      expect(renderWith('employer_briefing', variant)).toContain(
        `Instructajul periodic durează ${duration} și va avea frecvența stabilită prin instrucțiunile proprii ale societății.`
      );
      expect(renderWith('decision_training', variant)).toContain(
        `durata instruirii periodice va fi de ${duration};`
      );
    },
    30_000
  );
});

describe('the protective equipment list', () => {
  const handover =
    'Observații: La predarea echipamentului individual de protecție se va completa procesul-verbal de predare-primire.';

  it('prints a section per equipped position, and names the others after them', () => {
    const text = renderWith('protective_equipment_list', facts);
    expect(text).toContain('POST DE LUCRU:');
    expect(text).not.toContain('de mai sus');
    expect(text).toMatch(
      /\nPentru postul de lucru Contabil nu este necesară dotarea cu echipament individual de protecție\.\nObservații:/
    );
    expect(text.indexOf('Pentru postul de lucru Contabil')).toBeGreaterThan(
      text.lastIndexOf('POST DE LUCRU:')
    );
    expect(text).toContain(handover);
  }, 30_000);

  it('names every position where none is equipped, with no note on handing equipment over', () => {
    const text = renderWith('protective_equipment_list', {
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsProtectiveEquipment: false,
        equipment: [],
      })),
    });
    expect(text).not.toContain('POST DE LUCRU:');
    expect(text).toMatch(
      /prelucrarea materialelor de acoperire\.\nPentru posturile de lucru Contabil și Sudor nu este necesară dotarea cu echipament individual de protecție\./
    );
    expect(text.match(/nu este necesară dotarea/g)).toHaveLength(1);
    expect(text).not.toContain('Observații:');
  }, 30_000);
});

describe('the employer briefing', () => {
  it('names decision 1.5 as how the representatives are designated, when the pack has it', () => {
    const without = renderWith('employer_briefing', facts);
    expect(without).toContain(
      'Numărul de reprezentanți ai lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă pentru S.C. PIPETECH S.R.L. nu este stabilit, deoarece unitatea are sub 10 lucrători (H.G. 1425/ 2006, art. 53 alin. (2)).'
    );
    expect(without).not.toContain('sunt desemnați prin decizia internă');

    const withDecision = renderWith('employer_briefing', {
      ...facts,
      workersRepresentativeDecisionGenerated: true,
    });
    expect(withDecision).toContain(
      'Reprezentanții lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă pentru S.C. PIPETECH S.R.L. sunt desemnați prin decizia internă privind reprezentanții lucrătorilor.'
    );
    expect(withDecision).not.toContain('nu este stabilit, deoarece');
  }, 30_000);

  it('says the committee is not needed below 50 workers', () => {
    expect(renderWith('employer_briefing', facts)).toContain(
      'Având în vedere că S.C. PIPETECH S.R.L. are un număr mediu de sub 50 de lucrători, NU este necesar să se constituie un Comitet de securitate și sănătate în muncă.'
    );
  }, 30_000);
});

describe('the general training material', () => {
  it("prints the evaluations' unacceptable factors as the unit's own risks", () => {
    const entry = manifest.templates.find(
      (template) => template.typeKey === 'general_training_material'
    )!;
    const text = documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildDocumentContext(facts), 'general_training_material')
      )
    );
    expect(text).not.toContain('DE COMPLETAT');
    expect(text).toContain(
      'Electrocutare prin atingere indirectă, la defectarea împământării unui echipament.'
    );
    expect(text).toContain('– Măsurarea anuală a rezistenței prizei de pământ (buletin PRAM).');
    expect(text).not.toContain('nu a identificat în unitate factori de risc');
  }, 30_000);

  it('says so, instead of a table with only its head, where nothing is unacceptable', () => {
    const entry = manifest.templates.find(
      (template) => template.typeKey === 'general_training_material'
    )!;
    const acceptable = {
      ...facts,
      riskEvaluations: facts.riskEvaluations.map((evaluation) => ({
        ...evaluation,
        factors: evaluation.factors.map((factor) => ({
          ...factor,
          gravityClass: 1,
          probabilityClass: 1,
        })),
      })),
    };
    const text = documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildDocumentContext(acceptable), 'general_training_material')
      )
    );
    expect(text).toContain(
      'Evaluarea riscurilor nu a identificat în unitate factori de risc în domeniul inacceptabil'
    );
    expect(text).not.toContain('Riscul existent / Forma de manifestare a factorului de risc');
  }, 30_000);
});

describe('the prevention plan', () => {
  it('prints a table per evaluation with a row per factor that has measures, or says there are none', () => {
    const entry = manifest.templates.find((template) => template.typeKey === 'prevention_plan')!;
    const variant = {
      ...facts,
      riskEvaluations: [
        ...facts.riskEvaluations,
        {
          id: 'e0e0e0e0-0000-4000-8000-000000000009',
          kind: 'other' as const,
          jobPositionId: null,
          name: 'Vizitatori',
          meansOfProduction: null,
          workEnvironment: null,
          exposure: '1 h / zi',
          workTask: 'Așteptare în spațiul de primire.',
          exposedPersons: 'Variabil',
          factors: [
            {
              component: 'work_environment' as const,
              group: 'Factori de risc fizic',
              description: 'Cădere la același nivel pe pardoseala umedă.',
              gravityClass: 2,
              probabilityClass: 2,
              measures: [],
              actions: null,
              deadline: null,
              responsiblePerson: null,
              observations: null,
            },
          ],
        },
      ],
    };
    const context = buildDocumentContext(variant);
    const text = documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(context, 'prevention_plan')
      )
    );
    for (const evaluation of context.riskAssessment.evaluations) {
      expect(text).toContain(evaluation.heading);
      for (const row of evaluation.plan) {
        expect(text).toContain(`${row.code}. ${row.description}`);
        expect(text).toContain(row.responsiblePerson);
      }
    }
    expect(text.match(/Riscuri evaluate/g)).toHaveLength(3);
    expect(text).toContain(
      'Nu au fost stabilite măsuri de prevenire și protecție: niciun factor de risc evaluat nu depășește nivelul de risc\u00a03.'
    );
  }, 30_000);
});

describe('the risk assessment', () => {
  const render = (variant: typeof facts) => {
    const entry = manifest.templates.find((template) => template.typeKey === 'risk_assessment')!;
    const context = buildDocumentContext(variant);
    return {
      context,
      text: documentText(
        renderDocument(
          readFileSync(new URL(entry.file, templatesUrl)),
          documentData(context, 'risk_assessment')
        )
      ),
    };
  };

  it("prints the unit, a subchapter per evaluation with its sheet and measures, and the unit's level", () => {
    const { context, text } = render(facts);
    expect(text).toContain(
      'Activitatea principală (clasa CAEN): 2562 – Fabricarea articolelor de feronerie'
    );
    expect(text).toContain(
      'Sediu social și puncte de lucru:\nSediu social: București, Sector 1, Calea Victoriei 122A\nPunct de lucru „Atelier Ghiroda”: Ghiroda, județul Timiș, Str. Industriilor 4'
    );
    for (const evaluation of context.riskAssessment.evaluations) {
      expect(text).toContain(
        `SUBCAPITOLUL V.${evaluation.roman}. EVALUAREA RISCURILOR DE ACCIDENTARE ȘI ÎMBOLNĂVIRE PROFESIONALĂ PENTRU ${evaluation.heading}`
      );
      expect(text).toContain(`este egal cu ${evaluation.globalLevel}, ${evaluation.verdict}.`);
      for (const row of evaluation.sheet) expect(text).toContain(`${row.code}. ${row.description}`);
    }
    expect(text).toContain(`Nrg = ${context.riskAssessment.globalLevel}`);
    expect(text).toContain(
      'pentru 2 posturi de lucru și grupurile sensibile la riscuri specifice din cadrul S.C. PIPETECH S.R.L.'
    );
    expect(text).toContain(
      'Conducerea locurilor de muncă: Florin Cristian TALOȘ, Administrator; Ioana PETRE, Șef de echipă'
    );
    for (const evaluation of context.riskAssessment.evaluations) {
      for (const row of evaluation.plan) {
        expect(text).toContain(`${row.code}. ${row.description}\n${row.level}\n– `);
      }
    }
    expect(text).not.toContain('Niciunul dintre factorii de risc identificați nu depășește');
  }, 30_000);

  it("says so where an evaluation has nothing unacceptable, and names the workers' representatives", () => {
    const { text } = render({
      ...facts,
      responsiblePersons: [
        ...facts.responsiblePersons,
        {
          fullName: 'Mihai POPESCU',
          jobTitle: 'Sudor',
          roles: ['workers_representative'],
          currentEmployee: true,
        },
      ],
      riskEvaluations: [
        ...facts.riskEvaluations,
        {
          id: 'e0e0e0e0-0000-4000-8000-000000000009',
          kind: 'other',
          jobPositionId: null,
          name: 'Vizitatori',
          meansOfProduction: null,
          workEnvironment: 'Spațiul de primire a clienților.',
          exposure: '1 h / zi',
          workTask: 'Așteptare în spațiul de primire.',
          exposedPersons: 'Variabil',
          factors: [
            {
              component: 'work_environment',
              group: 'Factori de risc fizic',
              description: 'Cădere la același nivel pe pardoseala umedă.',
              gravityClass: 2,
              probabilityClass: 2,
              measures: [],
              actions: null,
              deadline: null,
              responsiblePerson: null,
              observations: null,
            },
          ],
        },
      ],
    });
    expect(text).toContain('PENTRU VIZITATORI');
    expect(text).toContain(
      'Nu au fost stabilite măsuri de prevenire: niciun factor de risc identificat nu depășește nivelul de risc\u00a03.'
    );
    expect(text).toContain('Nu au fost identificați factori de risc proprii executantului.');
    expect(text).toContain(
      'Reprezentant al lucrătorilor cu răspunderi specifice în domeniul securității și sănătății lucrătorilor: Mihai POPESCU, Sudor.'
    );
  }, 30_000);
});
