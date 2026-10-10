import { readFileSync } from 'node:fs';

import {
  documentTypeKeys,
  fireSafetyDocumentTypeKeys,
  fireSafetyMissingDocumentData,
} from '@ssm-usor/contracts';
import {
  annexTitlePage,
  documentText,
  renderDocument,
  renderTemplate,
} from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import type { Json } from '../../src/database.types';
import { ApiError } from '../../src/lib/errors';
import {
  buildDocumentContext,
  buildPartialDocumentContext,
  documentData,
  type DocumentFacts,
  documentGapConcerns,
  missingDocumentData,
} from '../../src/modules/documents/context';
import { facts, workshopId } from '../../src/modules/documents/context.fixture';
import { merge } from '../../src/modules/documents/documents';
import {
  buildFireSafetyContext,
  buildPartialFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from '../../src/modules/documents/fire-safety';
import { annexTitlePagesData } from '../../src/modules/documents/snapshot';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the templates, merged with the context the API builds.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
  templates: { typeKey: string; title: string; file: string }[];
};

const refusedFor = (merging: () => unknown) => {
  try {
    merging();
    return [];
  } catch (error) {
    if (error instanceof ApiError && error.reason === 'missing_document_data') {
      return error.missing;
    }
    throw error;
  }
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
        workplaceId: null,
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

describe('a document generated again while the set lacks data', () => {
  const withGaps: [string, DocumentFacts][] = [
    [
      'what the clients of the first bulk regeneration lacked',
      {
        ...facts,
        client: { ...facts.client, trainingDayTo: null },
        responsiblePersons: facts.responsiblePersons.map((person) => ({
          ...person,
          roles: person.roles.filter((role) => role !== 'workplace_manager'),
        })),
        jobPositions: facts.jobPositions.map((position) => ({
          ...position,
          needsProtectiveEquipment: null,
          needsInstructions: null,
        })),
        riskEvaluations: facts.riskEvaluations.map((evaluation) => ({
          ...evaluation,
          factors: evaluation.kind === 'other' ? evaluation.factors : [],
        })),
      },
    ],
    [
      'everything about the provider, the client and its people',
      {
        ...facts,
        organization: {
          ...facts.organization,
          legalName: null,
          representativeName: null,
          representativeRole: null,
        },
        specialist: null,
        client: { ...facts.client, representativeName: null, representativeRole: null },
        responsiblePersons: [],
        currentEmployeeCount: 12,
        ownInstructions: null,
      },
    ],
    [
      'a position',
      {
        ...facts,
        jobPositions: [],
        riskEvaluations: facts.riskEvaluations.filter(
          (evaluation) => evaluation.kind !== 'job_position'
        ),
      },
    ],
    [
      "the workers' representatives",
      {
        ...facts,
        currentEmployeeCount: 60,
        responsiblePersons: [
          ...facts.responsiblePersons,
          {
            fullName: 'Florin Cristian TALOȘ',
            jobTitle: 'Administrator',
            roles: ['workers_representative'],
            currentEmployee: true,
            workplaceId: null,
          },
        ],
      },
    ],
    [
      'measures and their plan',
      {
        ...facts,
        riskEvaluations: facts.riskEvaluations.map((evaluation) => ({
          ...evaluation,
          factors: evaluation.factors.map((factor) =>
            evaluation.kind === 'sensitive_groups'
              ? { ...factor, gravityClass: 7, probabilityClass: 6, measures: [] }
              : { ...factor, deadline: null }
          ),
        })),
      },
    ],
  ];

  it('covers every gap of the occupational safety set', () => {
    const gaps = new Set(
      withGaps.flatMap(([, variant]) =>
        manifest.templates.flatMap((entry) => missingDocumentData(variant, entry.typeKey))
      )
    );
    expect([...gaps].sort()).toEqual(
      [
        'provider.legalName',
        'provider.representativeName',
        'provider.representativeRole',
        'specialist.name',
        'specialist.professionalTitle',
        'client.representativeName',
        'client.representativeRole',
        'client.trainingSchedule',
        'responsible.workplace_manager',
        'responsible.first_aid',
        'responsible.risk_evaluation_team',
        'responsible.imminent_danger',
        'responsible.workers_representative',
        'responsible.workers_representatives_two',
        'responsible.workers_representative_is_legal_representative',
        'positions.any',
        'positions.equipment',
        'positions.instructions',
        'positions.risk_evaluation',
        'risk_evaluations.sensitive_groups',
        'risk_evaluations.measures',
        'risk_evaluations.plan',
        'documents.own_instructions',
      ].sort()
    );
  });

  // The names a template printed from the whole context are what its snapshot keeps, so a
  // refusal here is also what marks its draft as changed.
  it.each(
    manifest.templates.flatMap((entry) =>
      withGaps.map(([label, variant]) => [entry.typeKey, label, entry.file, variant] as const)
    )
  )(
    '%s is refused for exactly the gaps it prints, lacking %s',
    (typeKey, _, file, variant) => {
      const template = readFileSync(new URL(file, templatesUrl));
      const { usedNames } = renderTemplate(
        template,
        documentData(buildDocumentContext(facts), typeKey)
      );
      const missing = missingDocumentData(variant, typeKey);
      expect(
        refusedFor(() =>
          merge(
            template,
            documentData(buildPartialDocumentContext(variant, typeKey), typeKey),
            typeKey,
            (absentNames) => missing.filter((code) => documentGapConcerns(code, absentNames))
          )
        )
      ).toEqual(missing.filter((code) => documentGapConcerns(code, usedNames)));
    },
    30_000
  );

  it('leaves the cover of the decisions to be generated again', () => {
    const [, lacking] = withGaps[0]!;
    const entry = manifest.templates.find((template) => template.typeKey === 'cover_decisions')!;
    const text = documentText(
      merge(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildPartialDocumentContext(lacking, 'cover_decisions'), 'cover_decisions'),
        'cover_decisions'
      ).bytes
    );
    expect(text).toContain('PIPETECH');
    expect(text).toContain('S.C. SERVICIU EXTERN DEMO S.R.L.');
  }, 30_000);
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
      'Florin Cristian TALOȘ și Ioana PETRE – conducătorii locurilor\u00a0de\u00a0muncă'
    );
    expect(text).toContain('S.C. SERVICIU EXTERN DEMO S.R.L. – Dan MARIN');
    expect(text).toContain(
      'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0290; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012; I.P.S.S.M. Sudură oxiacetilenică, Art.\u00a01\u00a0–\u00a031;'
    );
    expect(text).toContain('I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică');
    expect(text.match(/Testare\.$/gm)).toHaveLength(2);
    expect(text).toContain('I.P.S.S.M. Art.\u00a0236\u00a0–\u00a0290;');
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
  ) => ({ fullName, jobTitle, roles, currentEmployee: true, workplaceId: null });
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
      'two managers who designate someone else',
      [
        person('Roza URSU', 'Director general', ['workplace_manager']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager']),
        person('Ana POP', 'Contabil', ['imminent_danger']),
      ],
      `${lead}${roza}, și ${ion} – desemnează pe Ana POP, având funcția de Contabil, cu următoarele atribuții:`,
    ],
    [
      'a manager designated beside someone else while another manager is not',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager']),
        person('Ana POP', 'Contabil', ['imminent_danger']),
      ],
      `${lead}${roza}, și ${ion} – desemnează pe Ana POP, având funcția de Contabil, alături de Roza URSU, care își asumă rolul de personal desemnat, cu următoarele atribuții:`,
    ],
    [
      'two managers designated beside two others while a third manager is not',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager', 'imminent_danger']),
        person('Dan POP', 'Șef sală', ['workplace_manager']),
        person('Ana POP', 'Contabil', ['imminent_danger']),
        person('Eva DAN', 'Casier', ['imminent_danger']),
      ],
      `${lead}${roza}, ${ion}, și Dan POP, având funcția de Șef sală – desemnează pe Ana POP, având funcția de Contabil, și Eva DAN, având funcția de Casier, alături de Roza URSU și Ion MARIN, care își asumă rolul de personal desemnat, cu următoarele atribuții:`,
    ],
    [
      'a manager designated while another manager is not, and nobody else',
      [
        person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
        person('Ion MARIN', 'Șef atelier', ['workplace_manager']),
      ],
      `${lead}${roza}, și ${ion} – stabilește ca Roza URSU să își asume, în calitate de personal desemnat, următoarele atribuții:`,
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

  it('lists only the people designated in the record when a manager is not', () => {
    const text = article2(
      person('Roza URSU', 'Director general', ['workplace_manager', 'imminent_danger']),
      person('Ion MARIN', 'Șef atelier', ['workplace_manager']),
      person('Ana POP', 'Contabil', ['imminent_danger'])
    );
    const record = text.slice(text.indexOf('PROCES-VERBAL'));
    expect(record).toContain('Roza URSU');
    expect(record).toContain('Ana POP');
    expect(record).not.toContain('Ion MARIN');
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
    [60, '1 oră'],
    [90, '1 oră și 30 de minute'],
  ])(
    'prints the periodic training duration of %i minutes as decision 1.1 does',
    (minutes, duration) => {
      const variant = { ...facts, client: { ...facts.client, periodicTrainingMinutes: minutes } };
      expect(renderWith('employer_briefing', variant)).toContain(
        `Instruirea periodică durează ${duration} și are periodicitatea stabilită prin programul de instruire-testare și prin instrucțiunile proprii ale unității.`
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
      /dispozițiile din prezenta hotărâre\.\nPentru posturile de lucru Contabil și Sudor nu este necesară dotarea cu echipament individual de protecție\./
    );
    expect(text.match(/nu este necesară dotarea/g)).toHaveLength(1);
    expect(text).not.toContain('Observații:');
  }, 30_000);
});

describe('the employer briefing', () => {
  it('names decision 1.5 as how the representatives are designated, when the pack has it', () => {
    const without = renderWith('employer_briefing', facts);
    expect(without).toContain(
      'Numărul de reprezentanți ai lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă pentru S.C. PIPETECH S.R.L. nu este stabilit, deoarece unitatea are sub 10 lucrători (H.G. 1425/2006 – art. 53 alin. (2)).'
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
          workplaceId: null,
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

describe('the fire-safety templates', () => {
  const fireUrl = new URL('fire/', templatesUrl);
  const fireManifest = JSON.parse(readFileSync(new URL('manifest.json', fireUrl), 'utf8')) as {
    templates: { typeKey: string; title: string; file: string }[];
  };

  it('are the fire-safety document types of the contracts, in the same order', () => {
    expect(fireManifest.templates.map((entry) => entry.typeKey)).toEqual([
      ...fireSafetyDocumentTypeKeys,
    ]);
  });

  // Nothing optional: no authorization, no smoking place, no contractor, no specific measures, no
  // installation, no other equipment, and every responsible person tied to the workshop, so the
  // office has no manager of its own.
  const fewest: DocumentFacts = {
    ...facts,
    branding: false,
    organization: { ...facts.organization, fireSafetyAuthorization: null },
    workplaces: facts.workplaces.map((workplace) => ({ ...workplace, specificMeasures: null })),
    responsiblePersons: facts.responsiblePersons.map((person) => ({
      ...person,
      workplaceId: workshopId,
    })),
    fireSafety: {
      card: { ...facts.fireSafety.card!, smokingPlace: null, wasteContractor: null },
      equipment: facts.fireSafety.equipment.filter((unit) => unit.kind === 'extinguisher'),
      installations: [],
    },
  };

  it.each(
    fireManifest.templates.flatMap((entry) => [
      [entry.typeKey, 'the fixture', entry.file, facts] as const,
      [entry.typeKey, 'the fewest facts', entry.file, fewest] as const,
    ])
  )(
    '%s renders from %s with nothing missing',
    (_typeKey, _, file, variant) => {
      const data = { ...buildFireSafetyContext(variant) };
      const text = documentText(renderDocument(readFileSync(new URL(file, fireUrl)), data));
      expect(text).not.toContain('{{');
      expect(text).toContain('PIPETECH');
      expect(text.includes('Document generat cu SSM Ușor')).toBe(variant.branding);
    },
    30_000
  );

  it('print only names the fire-safety context holds, so no other set can change a draft', () => {
    const names = Object.keys(buildFireSafetyContext(facts));
    for (const entry of fireManifest.templates) {
      const { snapshot } = merge(
        readFileSync(new URL(entry.file, fireUrl)),
        { ...buildFireSafetyContext(facts) },
        entry.typeKey
      );
      expect(names).toEqual(expect.arrayContaining(Object.keys(snapshot as object)));
    }
  });

  it('number the decisions by their places in the binder, from the first number', () => {
    const numbers: Record<string, string> = {
      fire_decision_organization: '5 PSI',
      fire_decision_training: '6 PSI',
      fire_decision_open_fire: '7 PSI',
      fire_decision_seasons: '9 PSI',
      fire_decision_waste: '12 PSI',
    };
    for (const [typeKey, number] of Object.entries(numbers)) {
      const entry = fireManifest.templates.find((each) => each.typeKey === typeKey)!;
      const text = documentText(
        renderDocument(readFileSync(new URL(entry.file, fireUrl)), {
          ...buildFireSafetyContext(facts),
        })
      );
      expect(text).toContain(`Nr. ${number} din 19.01.2026`);
    }
  });

  it('print the workplaces, their means and their people', () => {
    const file = (typeKey: string) =>
      readFileSync(
        new URL(fireManifest.templates.find((each) => each.typeKey === typeKey)!.file, fireUrl)
      );
    const data = { ...buildFireSafetyContext(facts) };
    const means = documentText(renderDocument(file('fire_means_list'), data));
    expect(means).toContain('Stingător P50 – Pulbere, 50\u00a0kg, carosabil');
    expect(means).toContain('Ladă cu nisip');
    expect(means).toContain('Lista dotării cu accesorii pentru trecerea apei');
    const sheet = documentText(renderDocument(file('fire_workplace_organization'), data));
    expect(sheet).toContain('Locul de muncă: Atelier Ghiroda, Atelier de sudură');
    expect(sheet).toContain('– stingătoare: Ioana PETRE și Florin Cristian TALOȘ');
    expect(sheet).toContain('– hidranți interiori: Florin Cristian TALOȘ');
    const seasons = documentText(renderDocument(file('fire_decision_seasons'), data));
    expect(seasons).toContain('Atelier Ghiroda, Atelier de sudură;\nSediul social, Birouri;');
    const training = documentText(renderDocument(file('fire_decision_training'), data));
    expect(training).toContain(
      'personalul administrativ (Contabil) va fi instruit la 6 LUNI, respectiv în lunile februarie și august, în perioada (zilele) 2 – 7 ale lunii;'
    );
  });

  const fireGaps: [string, DocumentFacts][] = [
    [
      'everything of the second stage',
      {
        ...facts,
        responsiblePersons: [],
        jobPositions: [],
        workplaces: facts.workplaces.map((workplace) => ({ ...workplace, activity: null })),
        fireSafety: { card: null, equipment: [], installations: [] },
      },
    ],
    [
      'the provider, its technician and the client',
      {
        ...facts,
        organization: {
          ...facts.organization,
          legalName: null,
          fireSafetyTechnicianName: null,
          fireSafetyTechnicianCertificate: null,
        },
        client: { ...facts.client, representativeName: null, representativeRole: null },
      },
    ],
  ];

  it('cover every gap of the fire-safety set', () => {
    expect(fireGaps.flatMap(([, variant]) => missingFireSafetyData(variant)).sort()).toEqual(
      [...fireSafetyMissingDocumentData].sort()
    );
  });

  // As for the occupational safety set: the names a template printed from the whole context are
  // what its snapshot keeps, so a refusal here is also what marks its draft as changed.
  it.each(
    fireManifest.templates.flatMap((entry) =>
      fireGaps.map(([label, variant]) => [entry.typeKey, label, entry.file, variant] as const)
    )
  )(
    '%s is generated again or refused for exactly the gaps it prints, lacking %s',
    (typeKey, _, file, variant) => {
      const template = readFileSync(new URL(file, fireUrl));
      const { usedNames } = renderTemplate(template, { ...buildFireSafetyContext(facts) });
      const missing = missingFireSafetyData(variant);
      expect(
        refusedFor(() =>
          merge(template, { ...buildPartialFireSafetyContext(variant) }, typeKey, (absentNames) =>
            missing.filter((code) => fireSafetyGapConcerns(code, absentNames))
          )
        )
      ).toEqual(missing.filter((code) => fireSafetyGapConcerns(code, usedNames)));
    },
    30_000
  );

  it('leave the registers cover to be generated again without the second stage data', () => {
    const [, lacking] = fireGaps[0]!;
    const cover = fireManifest.templates.find((entry) => entry.typeKey === 'fire_cover_registers')!;
    const text = documentText(
      merge(
        readFileSync(new URL(cover.file, fireUrl)),
        { ...buildPartialFireSafetyContext(lacking) },
        'fire_cover_registers'
      ).bytes
    );
    expect(text).toContain('PIPETECH');
    expect(text).toContain('Radu STAN');
  }, 30_000);

  it('name the fire-safety technician on the cover, not the legal representative', () => {
    const cover = fireManifest.templates.find((entry) => entry.typeKey === 'fire_cover_registers')!;
    const text = documentText(
      renderDocument(readFileSync(new URL(cover.file, fireUrl)), {
        ...buildFireSafetyContext(facts),
      })
    );
    expect(text).toContain('Radu STAN');
    expect(text).toContain('Cadru tehnic PSI al S.C. SERVICIU EXTERN DEMO S.R.L.');
  });
});
