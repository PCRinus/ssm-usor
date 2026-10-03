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
        roles: ['workers_representative'],
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
      'I.P.S.S.M. Art. 1 – 294; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31;'
    );
    expect(text).toContain('I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică');
    expect(text.match(/Testare\.$/gm)).toHaveLength(2);
    expect(text).toContain('I.P.S.S.M. Art. 241 – 294;');
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
    'Florin Cristian TALOȘ având funcția de Administrator și Ioana PETRE având funcția de Șef de echipă';

  it('name every workplace manager once as those who train the whole staff', () => {
    const text = render('decision_training');
    expect(text).toContain(
      `Personalul de conducere al locurilor de muncă – ${managers} – va efectua instruirea la locul de muncă și instruirea periodică pentru întreg personalul din cadrul S.C. PIPETECH S.R.L.`
    );
    expect(text).toContain('durata instruirii periodice va fi de 2\u00a0ore;');
  }, 30_000);

  it('name every workplace manager as those who designate the people for imminent danger', () => {
    expect(render('decision_imminent_danger')).toContain(
      `conducerea locurilor de muncă din cadrul S.C. PIPETECH S.R.L. – ${managers} – desemnează pe ${managers}, cu următoarele atribuții:`
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
    expect(text).toContain('Nu au fost stabilite măsuri de prevenire și protecție');
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
      'Punct de lucru „Atelier Ghiroda”: Ghiroda, județul Timiș, Str. Industriilor 4'
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
      'Nu au fost stabilite măsuri de prevenire: niciunul dintre factorii de risc identificați nu depășește nivelul de risc\u00a03.'
    );
    expect(text).toContain('Nu au fost identificați factori de risc proprii executantului.');
    expect(text).toContain(
      'Reprezentant al lucrătorilor cu răspunderi specifice în domeniul securității și sănătății lucrătorilor: Mihai POPESCU, Sudor.'
    );
  }, 30_000);
});
