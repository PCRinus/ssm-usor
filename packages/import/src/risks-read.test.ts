import { describe, expect, it } from 'vitest';

import {
  cellItems,
  classesSwapped,
  componentOf,
  consequenceClass,
  fieldText,
  namesPerson,
  readRisksAnswer,
  sheetMeasures,
  splitCode,
} from './risks-read';
import type { RetypedFactor, RisksAnswer } from './risks-request';
import { answer, assessment, plan, scanned, unplanned } from './test/risks-pack';

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

describe('readRisksAnswer: a plan row paired with no factor', () => {
  const unpaired = (rows: RisksAnswer['plan'], text = plan.text) =>
    readRisksAnswer(
      [assessment, { ...plan, text }],
      { ...answer, plan: rows },
      {
        people: ['Maria Ionescu'],
      }
    ).unmatchedPlanRows;
  const nonePaired = answer.plan.map((entry) => ({ ...entry, factorRows: [] }));

  it('writes it out as a factor with the plan’s measures by kind and its fields, to be added', () => {
    expect(read.unmatchedPlanRows[0]!.factor).toEqual({
      key: 'plan-R41',
      row: 'R41',
      source: expect.objectContaining({ file: plan.path }),
      component: null,
      writtenComponent: '',
      group: '',
      description: 'Zgomot de la hota de evacuare',
      code: null,
      consequence: '',
      gravityClass: null,
      probabilityClass: null,
      printedLevel: null,
      measures: [{ kind: 'technical', description: 'Izolarea hotei.' }],
      measuresFrom: 'plan',
      actions: null,
      deadline: 'Anual',
      responsiblePerson: 'Administrator',
      observations: null,
      flags: [],
    });
  });

  it('flags a person named in its fields', () => {
    const [row] = unpaired(
      answer.plan,
      plan.text.replace('| Anual | Administrator |', '| Anual | Maria Ionescu |')
    );

    expect(row!.factor!.flags).toEqual([
      { kind: 'person_named', field: 'responsiblePerson', text: 'Maria Ionescu' },
    ]);
  });

  it('places it on the sheet most of its post’s paired rows go to, listed or not', () => {
    expect(read.unmatchedPlanRows[0]!.sheet).toBe('sheet-1');
    expect(unpaired(answer.plan.filter((entry) => entry.row !== 'R41'))).toEqual([
      expect.objectContaining({ row: 'R41', post: 'BRUTĂRIA DIN CURTE; BRUTAR', sheet: 'sheet-1' }),
    ]);
  });

  it('places it on the one sheet named in its post when none of the post’s rows is paired', () => {
    expect(unpaired(nonePaired).map((row) => [row.row, row.sheet])).toEqual([
      ['R39', 'sheet-1'],
      ['R40', 'sheet-1'],
      ['R41', 'sheet-1'],
    ]);
  });

  it('places it on no sheet when its post names none, and gives a row in no table no factor', () => {
    const laundry = plan.text.replace('BRUTĂRIA DIN CURTE / / BRUTAR', 'SPĂLĂTORIE');
    expect(unpaired(nonePaired, laundry).map((row) => row.sheet)).toEqual([null, null, null]);

    const noTables = readRisksAnswer([assessment, plan], { ...answer, planTables: [] });
    expect(noTables.unmatchedPlanRows.map((row) => [row.sheet, row.factor])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
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
            ...unplanned,
          },
          {
            component: '',
            group: '',
            description: 'F2. Lovire de ușa clădirii la livrare.',
            consequence: 'ITM 3-45 zile',
            gravity: '2',
            probability: '3',
            level: '2',
            quote: 'F2. Lovirea de poarta din spate.',
            ...unplanned,
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

describe('readRisksAnswer: a PDF’s measures', () => {
  const written = (factor: Partial<RetypedFactor>): RetypedFactor => ({
    component: 'MIJLOACE DE PRODUCȚIE',
    group: 'Factori de risc mecanic',
    description: 'F1. Accident rutier cu bicicleta de livrare.',
    consequence: 'Deces',
    gravity: '7',
    probability: '2',
    level: '4',
    quote: 'F1. Accident rutier cu bicicleta de livrare. Deces 7 2 4',
    ...unplanned,
    ...factor,
  });
  const readPdf = (...factors: RetypedFactor[]) =>
    readRisksAnswer(
      [scanned],
      {
        ...answer,
        sheets: [{ ...answer.sheets[0]!, file: scanned.path, firstRow: '', lastRow: '', factors }],
        measures: [],
        planTables: [],
        plan: [],
      },
      { people: ['Maria Ionescu'] }
    ).sheets[0]!.factors;

  it('takes the measures and plan fields written out with each factor, by kind', () => {
    const [planned, sheetOnly, bare] = readPdf(
      written({
        measuresFrom: 'plan',
        measures: [
          { kind: 'technical', description: ' Verificarea frânelor bicicletei. ' },
          {
            kind: 'organizational',
            description: 'Instruire privind circulația pe drumurile publice.',
          },
          { kind: 'other', description: '--' },
        ],
        actions: 'Revizuirea instrucțiunii.',
        deadline: 'Periodic',
        responsiblePerson: 'Cond. loc muncă',
        observations: '--',
      }),
      written({
        description: 'F2. Lovire de ușa clădirii la livrare.',
        measuresFrom: 'sheet',
        measures: [{ kind: 'hygienic_sanitary', description: 'Trusa de prim ajutor în dubă.' }],
      }),
      written({ description: 'F3. Alunecare pe scara blocului.' })
    );

    expect(planned).toMatchObject({
      measures: [
        { kind: 'technical', description: 'Verificarea frânelor bicicletei.' },
        {
          kind: 'organizational',
          description: 'Instruire privind circulația pe drumurile publice.',
        },
      ],
      measuresFrom: 'plan',
      actions: 'Revizuirea instrucțiunii.',
      deadline: 'Periodic',
      responsiblePerson: 'Cond. loc muncă',
      observations: null,
    });
    expect(planned!.flags).toEqual([{ kind: 'retyped' }]);
    expect(sheetOnly).toMatchObject({
      measures: [{ kind: 'hygienic_sanitary', description: 'Trusa de prim ajutor în dubă.' }],
      measuresFrom: 'sheet',
      actions: null,
    });
    expect(bare).toMatchObject({ measures: [], measuresFrom: null, deadline: null });
  });

  it('keeps the limits, and flags a person named and measures past the cap', () => {
    const [factor] = readPdf(
      written({
        measuresFrom: 'plan',
        measures: Array.from({ length: 32 }, (_, index) => ({
          kind: 'organizational' as const,
          description: `Măsura ${index + 1}.`,
        })),
        deadline: 'Imediat '.repeat(40),
        responsiblePerson: 'Maria Ionescu',
      })
    );

    expect(factor!.measures).toHaveLength(30);
    expect(factor!.deadline!.length).toBeLessThanOrEqual(200);
    expect(factor!.flags).toEqual([
      { kind: 'retyped' },
      { kind: 'measures_cut', count: 32 },
      { kind: 'person_named', field: 'responsiblePerson', text: 'Maria Ionescu' },
    ]);
  });

  it('copies a Word plan row joined by its description over what the factor was written out with', () => {
    const [factor] = readRisksAnswer(
      [scanned, plan],
      {
        ...answer,
        sheets: [
          {
            ...answer.sheets[0]!,
            file: scanned.path,
            firstRow: '',
            lastRow: '',
            factors: [
              written({
                description: 'F1. Prinderea degetelor in malaxorul de aluat pornit',
                measuresFrom: 'plan',
                measures: [{ kind: 'technical', description: 'Protecția malaxorului.' }],
                deadline: 'Imediat',
                observations: 'Scrisă de model.',
              }),
            ],
          },
        ],
        measures: [],
        planTables: answer.planTables.map((table) => ({
          ...table,
          firstRow: 'R3',
          lastRow: 'R5',
        })),
        plan: [{ row: 'R3', factorRows: [] }],
      },
      { people: [] }
    ).sheets[0]!.factors;

    expect(factor).toMatchObject({
      measures: [
        { kind: 'technical', description: 'Protecția de la gura malaxorului.' },
        { kind: 'organizational', description: 'Instruire asupra folosirii malaxorului;' },
        { kind: 'organizational', description: 'Afișarea instrucțiunii.' },
      ],
      measuresFrom: 'plan',
      actions: 'Revizuirea instrucțiunii.',
      deadline: 'Imediat; Periodic',
      observations: 'Scrisă de model.',
    });
  });
});

describe('readRisksAnswer: a PDF laid out in columns', () => {
  it('finds a row whose description wraps by the first words of its quote', () => {
    const laidOut = {
      path: 'Dosar/Evaluare.pdf',
      text: [
        'SUBCAPITOLUL V.I. POSTUL DE LUCRU : CURIER',
        '      F1. Inţepare şi/ sau tăiere a corpului cu          Minore',
        '                                                          1   5   1',
        '      accesoriile utilizate .                           reversibile',
      ].join('\n'),
    };
    const [sheet] = readRisksAnswer([laidOut], {
      ...answer,
      sheets: [
        {
          ...answer.sheets[0]!,
          file: laidOut.path,
          heading: 'SUBCAPITOLUL V.I. POSTUL DE LUCRU : CURIER',
          firstRow: '',
          lastRow: '',
          factors: [
            {
              component: 'MIJLOACE DE PRODUCȚIE',
              group: 'Factori de risc mecanic',
              description: 'F1. Inţepare şi/ sau tăiere a corpului cu accesoriile utilizate .',
              consequence: 'Minore reversibile',
              gravity: '1',
              probability: '5',
              level: '1',
              quote: 'F1. Inţepare şi/ sau tăiere a corpului cu accesoriile utilizate .',
              ...unplanned,
            },
          ],
        },
      ],
    }).sheets;

    expect(sheet!.factors[0]!.flags).toEqual([{ kind: 'retyped' }]);
    const { source } = sheet!.factors[0]!;
    expect(laidOut.text.slice(source!.start, source!.end)).toBe('F1. Inţepare şi/ sau tăiere');
  });
});

describe('readRisksAnswer: gravity and probability swapped', () => {
  const classes = (gravity: number, probability: number, level: number) => ({
    gravityClass: gravity,
    probabilityClass: probability,
    printedLevel: level,
  });

  it('flags a sheet whose printed levels mostly fit the grid read the other way round', () => {
    expect(
      classesSwapped([
        classes(5, 2, 3),
        classes(4, 3, 3),
        classes(6, 2, 3),
        classes(4, 2, 2),
        classes(2, 2, 2),
      ])
    ).toBe(true);
  });

  it('leaves a sheet with a few swapped-looking levels among levels that fit as written', () => {
    expect(
      classesSwapped([
        classes(5, 2, 3),
        classes(4, 3, 3),
        classes(6, 2, 3),
        classes(2, 5, 3),
        classes(3, 4, 3),
        classes(4, 5, 5),
        classes(2, 4, 2),
      ])
    ).toBe(false);
  });

  it('needs three factors that tell the two readings apart', () => {
    expect(classesSwapped([classes(5, 2, 3), classes(4, 3, 3), classes(2, 2, 2)])).toBe(false);
  });

  it('counts no factor of gravity 7, which cannot be swapped, nor one without a printed level', () => {
    expect(
      classesSwapped([
        classes(5, 2, 3),
        classes(4, 3, 3),
        classes(7, 2, 3),
        { gravityClass: 5, probabilityClass: 3, printedLevel: null },
      ])
    ).toBe(false);
  });

  it('flags the sheet and keeps the classes as written', () => {
    const swappedAnswer: RisksAnswer = {
      ...answer,
      sheets: [
        {
          ...answer.sheets[0]!,
          file: scanned.path,
          firstRow: '',
          lastRow: '',
          factors: [
            ['F1. Prindere în malaxor.', '5', '2', '3'],
            ['F2. Tăiere cu cuțitul.', '4', '3', '3'],
            ['F3. Arsuri la cuptor.', '6', '2', '3'],
          ].map(([description, gravity, probability, level]) => ({
            component: 'MIJLOACE DE PRODUCȚIE',
            group: 'Factori de risc mecanic',
            description: description!,
            consequence: '',
            gravity: gravity!,
            probability: probability!,
            level: level!,
            quote: description!,
            ...unplanned,
          })),
        },
      ],
    };
    const [sheet] = readRisksAnswer([scanned], swappedAnswer).sheets;

    expect(sheet!.flags).toContainEqual({ kind: 'classes_swapped' });
    expect(sheet!.factors.map((item) => [item.gravityClass, item.probabilityClass])).toEqual([
      [5, 2],
      [4, 3],
      [6, 2],
    ]);
    expect(baker!.flags).not.toContainEqual({ kind: 'classes_swapped' });
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

  it('drops a heading before the first label', () => {
    expect(
      sheetMeasures(
        'Măsuri propuse: Măsuri tehnice: Mănuși la cuptor. Măsuri organizatorice: Instruire.',
        []
      )
    ).toEqual({
      measures: [
        { kind: 'technical', description: 'Mănuși la cuptor.' },
        { kind: 'organizational', description: 'Instruire.' },
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
