import { describe, expect, it } from 'vitest';

import {
  cellItems,
  componentOf,
  consequenceClass,
  fieldText,
  namesPerson,
  readRisksAnswer,
  sheetMeasures,
  splitCode,
} from './risks-read';
import type { RisksAnswer } from './risks-request';
import { answer, assessment, plan, scanned } from './test/risks-pack';

const read = readRisksAnswer([assessment, plan], answer, { people: ['Maria Ionescu'] });
const [baker, shop, sensitive, visitor] = read.sheets;
const factor = (sheet: typeof baker, number: number) => sheet!.factors[number - 1]!;

describe('readRisksAnswer: copying', () => {
  it('copies each factor row, carrying the merged component and group down and dropping the code', () => {
    expect(baker!.factors).toHaveLength(7);
    expect(factor(baker, 2)).toMatchObject({
      row: 'R8',
      component: 'means_of_production',
      writtenComponent: 'MIJLOACE DE PRODUCŢIE',
      group: 'Factori de risc mecanic',
      code: 'F2',
      description: 'Tăierea mâinilor cu cuțitul de feliat pâine.',
      consequence: 'ITM / 3-45 zile',
      gravityClass: 2,
      probabilityClass: 5,
      printedLevel: 3,
    });
    expect(factor(baker, 3).group).toBe('Factori de risc termic');
    expect(factor(baker, 4)).toMatchObject({
      component: 'work_environment',
      group: 'Factori de risc fizic',
    });
    expect(factor(baker, 6)).toMatchObject({ component: 'executant', group: 'Omisiuni' });
    expect(factor(baker, 7).component).toBe('work_task');
  });

  it('points each factor at its row in the file', () => {
    const { source } = factor(baker, 1);

    expect(assessment.text.slice(source!.start, source!.end)).toMatch(/^\| MIJLOACE .* \| 3 \|$/);
  });

  it('copies the work-system texts at the quotes, inside the sheet', () => {
    expect(baker).toMatchObject({
      meansOfProduction:
        'Cuptor electric cu trei vetre, malaxor de aluat, masă de inox, cuțite de feliat și tăvi de copt.',
      workEnvironment:
        'Brutăria are ferestre spre curte și ventilație mecanică deasupra cuptorului.',
      exposure: '8h / schimb',
    });
    expect(shop!.exposure).toBe('6h / schimb');
    expect(sensitive!.meansOfProduction).toBeNull();
    expect(visitor!.flags).toEqual([{ kind: 'quote_not_found', field: 'meansOfProduction' }]);
  });

  it('keeps the posts and the kind the answer gives', () => {
    expect(shop).toMatchObject({ kind: 'job_position', posts: ['Vânzător', 'casier'] });
    expect(sensitive!.kind).toBe('sensitive_groups');
    expect(visitor).toMatchObject({ kind: 'other', name: 'VIZITATOR' });
  });
});

describe('readRisksAnswer: checks', () => {
  it('shows a printed level the grid disagrees with', () => {
    expect(factor(baker, 3).flags).toContainEqual({ kind: 'level_mismatch', printed: 4, grid: 3 });
    expect(factor(baker, 1).flags).toEqual([]);
  });

  it('shows a consequence worded for another gravity class', () => {
    expect(factor(baker, 5).flags).toEqual([
      { kind: 'consequence_mismatch', consequence: 'ITM / 3-45 zile', consequenceClass: 2 },
    ]);
  });

  it('flags a missing class and a component outside the method', () => {
    expect(factor(baker, 7)).toMatchObject({ probabilityClass: null });
    expect(factor(baker, 7).flags).toContainEqual({
      kind: 'class_missing',
      field: 'probability',
      written: '',
    });
    expect(factor(visitor, 2)).toMatchObject({ component: null });
    expect(factor(visitor, 2).flags).toContainEqual({
      kind: 'unknown_component',
      written: 'ZONA EXTERIOARĂ',
    });
  });

  it('lists a factor row no sheet spans, and a plan row that is no factor', () => {
    expect(read.unplacedRows.map((row) => row.row)).toEqual(['R36']);
    expect(read.unmatchedPlanRows).toEqual([
      expect.objectContaining({
        row: 'R41',
        post: 'BRUTĂRIA DIN CURTE; BRUTAR',
        risk: 'Zgomot de la hota de evacuare',
      }),
    ]);
  });
});

describe('readRisksAnswer: rows the answer misplaces', () => {
  it('reads a row short of cells as missing its merged cells at the start', () => {
    const short = {
      ...assessment,
      text: assessment.text.replace(
        '|  | Factori de risc termic | F3.',
        '| Factori de risc termic | F3.'
      ),
    };
    const sheet = readRisksAnswer([short, plan], answer).sheets[0]!;

    expect(sheet.factors[2]).toMatchObject({
      component: 'means_of_production',
      group: 'Factori de risc termic',
      description: 'Arsuri la scoaterea tăvilor din cuptor.',
    });
    expect(sheet.factors[2]!.flags).toContainEqual({ kind: 'row_shape', cells: 6, expected: 7 });
  });

  it('joins a plan row past its table’s last row to that table, and lists one the answer skipped', () => {
    const shortTable = {
      ...answer,
      planTables: [{ ...answer.planTables[0]!, lastRow: 'R39' }],
      plan: answer.plan.filter((entry) => entry.row !== 'R41'),
    };
    const misplaced = readRisksAnswer([assessment, plan], shortTable);

    expect(misplaced.sheets[0]!.factors[1]!.measures).toHaveLength(3);
    expect(misplaced.unmatchedPlanRows).toEqual([]);

    const skipped = readRisksAnswer([assessment, plan], {
      ...answer,
      plan: answer.plan.filter((entry) => entry.row !== 'R41'),
    });
    expect(skipped.unmatchedPlanRows).toEqual([
      expect.objectContaining({ row: 'R41', risk: 'Zgomot de la hota de evacuare' }),
    ]);
  });

  it('lists a plan row in no table, rather than dropping it', () => {
    const noTables = readRisksAnswer([assessment, plan], { ...answer, planTables: [] });

    expect(noTables.unmatchedPlanRows.map((row) => row.row)).toEqual(['R39', 'R40', 'R41']);
  });

  it('keeps a plan field within what the database takes', () => {
    const long = {
      ...plan,
      text: plan.text.replace(
        '| Anual | Administrator |',
        `| Anual | ${'Administrator '.repeat(20)}|`
      ),
    };
    const answered = {
      ...answer,
      plan: [...answer.plan.slice(0, 2), { row: 'R41', factorRows: ['R10'] }],
    };
    const field = readRisksAnswer([assessment, long], answered).sheets[0]!.factors[3]!;

    expect(field.responsiblePerson!.length).toBeLessThanOrEqual(200);
  });
});

describe('readRisksAnswer: measures and plan', () => {
  it('takes the plan row’s columns as measures by kind, and its fields', () => {
    expect(factor(baker, 1)).toMatchObject({
      measuresFrom: 'plan',
      measures: [
        { kind: 'technical', description: 'Protecția de la gura malaxorului.' },
        { kind: 'organizational', description: 'Instruire asupra folosirii malaxorului;' },
        { kind: 'organizational', description: 'Afișarea instrucțiunii.' },
      ],
      actions: 'Revizuirea instrucțiunii.',
      deadline: 'Imediat; Periodic',
      responsiblePerson: 'Cond. loc munca; Serv extern',
      observations: null,
    });
  });

  it('joins a plan row that names two risks to both, and flags a person named', () => {
    for (const number of [2, 3]) {
      expect(factor(baker, number)).toMatchObject({
        measuresFrom: 'plan',
        measures: [
          { kind: 'organizational', description: 'Instruirea brutarilor.' },
          { kind: 'hygienic_sanitary', description: 'Trusa de prim ajutor' },
          { kind: 'other', description: 'Manusi' },
        ],
        responsiblePerson: 'Ion POPESCU',
      });
      expect(factor(baker, number).flags).toContainEqual({
        kind: 'person_named',
        field: 'responsiblePerson',
        text: 'Ion POPESCU',
      });
    }
  });

  it('splits an unlabelled measures-sheet text at the model’s start words for a factor the plan leaves out', () => {
    expect(factor(baker, 6)).toMatchObject({
      measuresFrom: 'sheet',
      measures: [
        { kind: 'technical', description: 'Montarea unui limitator la capacul malaxorului.' },
        {
          kind: 'organizational',
          description: 'Instruirea brutarilor privind oprirea malaxorului.',
        },
        { kind: 'hygienic_sanitary', description: 'Control medical periodic.' },
      ],
    });
    expect(factor(baker, 4)).toMatchObject({ measures: [], measuresFrom: null });
  });
});

describe('readRisksAnswer: a PDF', () => {
  const pdfAnswer: RisksAnswer = {
    sheets: [
      {
        ...answer.sheets[0]!,
        file: scanned.path,
        heading: 'SUBCAPITOLUL V.I. EVALUAREA RISCURILOR PENTRU POSTUL DE LUCRU : CURIER',
        name: 'CURIER',
        posts: ['Curier'],
        firstRow: '',
        lastRow: '',
        columns: {
          component: null,
          group: null,
          description: null,
          consequence: null,
          gravity: null,
          probability: null,
          level: null,
        },
        meansOfProduction: { startWords: '', endWords: '' },
        workEnvironment: { startWords: '', endWords: '' },
        exposure: { startWords: '', endWords: '' },
        factors: [
          {
            component: 'MIJLOACE DE PRODUCȚIE',
            group: 'Factori de risc mecanic',
            description: 'F1. Accident rutier cu bicicleta de livrare.',
            consequence: 'Deces',
            gravity: '7',
            probability: '2',
            level: '4',
            quote: 'F1. Accident rutier cu bicicleta de livrare. Deces 7 2 4',
          },
          {
            component: '',
            group: '',
            description: 'F2. Lovire de ușa clădirii la livrare.',
            consequence: 'ITM 3-45 zile',
            gravity: '2',
            probability: '3',
            level: '2',
            quote: 'F2. Lovire de ușa clădirii la poarta din spate.',
          },
        ],
      },
    ],
    measures: [],
    planTables: [],
    plan: [],
  };

  it('marks every factor written out Verifică, with its row when the quote is found', () => {
    const [sheet] = readRisksAnswer([scanned], pdfAnswer).sheets;

    expect(sheet!.factors.map((item) => item.flags)).toEqual([
      [{ kind: 'retyped' }],
      [{ kind: 'retyped' }, { kind: 'quote_not_found' }],
    ]);
    expect(sheet!.factors[1]).toMatchObject({
      component: 'means_of_production',
      group: 'Factori de risc mecanic',
      description: 'Lovire de ușa clădirii la livrare.',
      source: null,
    });
    const { source } = sheet!.factors[0]!;
    expect(scanned.text.slice(source!.start, source!.end)).toBe(
      'F1. Accident rutier cu bicicleta de livrare. Deces 7 2 4'
    );
  });
});

describe('the helpers', () => {
  it('maps a component label by its folded words', () => {
    expect(componentOf('MEDIUL / DE MUNCĂ')).toBe('work_environment');
    expect(componentOf('Mijlocul de producţie')).toBe('means_of_production');
    expect(componentOf('Sarcina de munca')).toBe('work_task');
    expect(componentOf('EXECUTANT')).toBe('executant');
    expect(componentOf('Zona exterioară')).toBeNull();
  });

  it('drops a factor code however it is written', () => {
    expect(splitCode('F5.alunecare pe scări')).toEqual({
      code: 'F5',
      description: 'alunecare pe scări',
    });
    expect(splitCode('F 12 ) Zgomot')).toEqual({ code: 'F12', description: 'Zgomot' });
    expect(splitCode('Fără cod')).toEqual({ code: null, description: 'Fără cod' });
  });

  it('reads a consequence as the class annex 3 words it with', () => {
    expect(consequenceClass('Minore reversibile')).toBe(1);
    expect(consequenceClass('ITM / < 3 zile')).toBe(1);
    expect(consequenceClass('ITM / 3 – 45 zile')).toBe(2);
    expect(consequenceClass('ITM 45-180 zile')).toBe(3);
    expect(consequenceClass('Invaliditate gradul III')).toBe(4);
    expect(consequenceClass('Invalid. Grad II')).toBe(5);
    expect(consequenceClass('Invaliditate grad I')).toBe(6);
    expect(consequenceClass('DECES')).toBe(7);
    expect(consequenceClass('Afecțiuni')).toBeNull();
  });

  it('joins a measure broken over a cell’s lines and drops the placeholders', () => {
    expect(cellItems('Instruirea / personalului; / Respectarea / programului de / lucru.')).toEqual(
      ['Instruirea personalului;', 'Respectarea programului de lucru.']
    );
    expect(cellItems('-- / – / ')).toEqual([]);
    expect(fieldText('--')).toBeNull();
  });

  it('splits a measures text on its own labels', () => {
    expect(
      sheetMeasures(
        'Măsuri tehnice: Mănuși la cuptor. Măsuri organizatorice: Instruire. / Afișe la intrare.',
        []
      )
    ).toEqual({
      measures: [
        { kind: 'technical', description: 'Mănuși la cuptor.' },
        { kind: 'organizational', description: 'Instruire.' },
        { kind: 'organizational', description: 'Afișe la intrare.' },
      ],
      guessed: false,
    });
  });

  it('takes a text with no labels and no start words as organizational, and says so', () => {
    expect(sheetMeasures('Instruirea lucrătorilor.', [])).toEqual({
      measures: [{ kind: 'organizational', description: 'Instruirea lucrătorilor.' }],
      guessed: true,
    });
  });

  it('drops a heading before the first start words and guesses the kind of other text there', () => {
    const parts = [
      { kind: 'technical' as const, startWords: 'Mănuși la cuptor' },
      { kind: 'organizational' as const, startWords: 'Instruirea personalului' },
    ];
    expect(
      sheetMeasures('Măsuri propuse: / Mănuși la cuptor. / Instruirea personalului.', parts)
    ).toEqual({
      measures: [
        { kind: 'technical', description: 'Mănuși la cuptor.' },
        { kind: 'organizational', description: 'Instruirea personalului.' },
      ],
      guessed: false,
    });
    expect(
      sheetMeasures('Afișe la intrare. / Mănuși la cuptor. / Instruirea personalului.', parts)
    ).toEqual({
      measures: [
        { kind: 'organizational', description: 'Afișe la intrare.' },
        { kind: 'technical', description: 'Mănuși la cuptor.' },
        { kind: 'organizational', description: 'Instruirea personalului.' },
      ],
      guessed: true,
    });
  });

  it('tells a person from a role', () => {
    expect(namesPerson('Ramona Barbara CIMPEAN', [])).toBe(true);
    expect(namesPerson('Administrator, Maria Ionescu', ['Maria Ionescu'])).toBe(true);
    expect(namesPerson('Cond. loc munca; Serv. Extern', [])).toBe(false);
    expect(namesPerson('Responsabil SSM,SU; Cond loc munca', [])).toBe(false);
    expect(namesPerson('Administrator SC BRUTĂRIA SRL', [])).toBe(false);
  });
});
