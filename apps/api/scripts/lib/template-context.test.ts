import { readFileSync } from 'node:fs';

import { documentTypeKeys, packDocumentTypeKeys, uploadedDocumentTypes } from '@ssm-usor/contracts';
import { documentText, renderDocument } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import { buildDocumentContext, documentData } from '../../src/modules/documents/context';
import { facts } from '../../src/modules/documents/context.fixture';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the templates, merged with the context the API builds.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
  templates: { typeKey: string; title: string; file: string; contentPending?: boolean }[];
};

describe('the built-in templates', () => {
  const ready = manifest.templates.filter((entry) => !entry.contentPending);

  it('are the document types of the contracts, in the same order', () => {
    expect(ready.map((entry) => entry.typeKey)).toEqual([...documentTypeKeys]);
  });

  it('leave the rest of the pack to be uploaded, under the titles the templates will carry', () => {
    expect(manifest.templates.map((entry) => entry.typeKey)).toEqual([...packDocumentTypeKeys]);
    const pending = manifest.templates.filter((entry) => entry.contentPending);
    expect(Object.fromEntries(pending.map((entry) => [entry.typeKey, entry.title]))).toEqual(
      uploadedDocumentTypes
    );
  });

  // The engine throws on a placeholder without a value, so this proves the context covers
  // everything the templates ask for.
  it.each(ready.map((entry) => [entry.typeKey, entry.file] as const))(
    '%s renders from the context with nothing missing',
    (typeKey, file) => {
      const context = buildDocumentContext(facts);
      const output = renderDocument(
        readFileSync(new URL(file, templatesUrl)),
        documentData(context, typeKey as (typeof documentTypeKeys)[number])
      );
      const text = documentText(output);
      expect(text).not.toContain('{{');
      expect(text).toContain('PIPETECH');
      if (typeKey !== 'event_registers' && !typeKey.startsWith('cover_')) {
        expect(text).toContain('Document generat cu SSM Ușor');
      }
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
    expect(text).toContain('Florin Cristian TALOȘ – conducător loc de muncă');
    expect(text).toContain('S.C. SERVICIU EXTERN DEMO S.R.L. – Dan MARIN');
    expect(text).toContain(
      'I.P.S.S.M. Art. 1 – 294; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31;'
    );
    expect(text).toContain('I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică');
    expect(text.match(/Testare\.$/gm)).toHaveLength(2);
    expect(text).toContain('I.P.S.S.M. Art. 241 – 294;');
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
    expect(text).toContain('Măsurarea anuală a rezistenței prizei de pământ (buletin PRAM).');
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
    expect(text).toContain('pentru 3 posturi de lucru din cadrul S.C. PIPETECH S.R.L.');
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
      'Niciunul dintre factorii de risc identificați nu depășește nivelul de risc 3'
    );
    expect(text).toContain('Nu au fost identificați factori de risc proprii executantului.');
    expect(text).toContain(
      'Reprezentant al lucrătorilor cu răspunderi specifice în domeniul securității și sănătății lucrătorilor: Mihai POPESCU, Sudor.'
    );
  }, 30_000);
});
