import { describe, expect, it } from 'vitest';

import {
  type EvaluatedPosition,
  incompleteRiskEvaluations,
  printedEvaluations,
  riskAssessment,
  type RiskEvaluationFacts,
  type RiskFactorFacts,
  roman,
  unitRisks,
} from './risk-assessment';
import {
  officeEvaluation,
  sensitiveGroupsEvaluation,
  workshopEvaluation,
} from './risk-evaluations.fixture';

const office: EvaluatedPosition = {
  id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  name: 'Contabil ',
  workZone: 'Birou',
  activities: null,
  currentEmployeeCount: 1,
};
const workshop: EvaluatedPosition = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Sudor',
  workZone: null,
  activities: 'Sudură electrică și autogenă.',
  currentEmployeeCount: 23,
};
const positions = [office, workshop];

const evaluationOf = (
  position: EvaluatedPosition,
  fixture: typeof officeEvaluation,
  id: string
): RiskEvaluationFacts => ({
  id,
  kind: 'job_position',
  jobPositionId: position.id,
  name: null,
  ...fixture,
  workTask: null,
  exposedPersons: null,
});
const officeFacts = evaluationOf(office, officeEvaluation, 'e0e0e0e0-0000-4000-8000-000000000001');
const workshopFacts = evaluationOf(
  workshop,
  workshopEvaluation,
  'e0e0e0e0-0000-4000-8000-000000000002'
);
const sensitiveGroups: RiskEvaluationFacts = {
  id: 'e0e0e0e0-0000-4000-8000-000000000003',
  kind: 'sensitive_groups',
  jobPositionId: null,
  name: null,
  ...sensitiveGroupsEvaluation,
};
const other = (name: string, factors: RiskFactorFacts[], id: string): RiskEvaluationFacts => ({
  id,
  kind: 'other',
  jobPositionId: null,
  name,
  meansOfProduction: null,
  workEnvironment: null,
  exposure: '2 h / zi',
  workTask: 'Vizitarea atelierului însoțit.',
  exposedPersons: null,
  factors,
});
const evaluations = [sensitiveGroups, workshopFacts, officeFacts];

const factor = (
  gravityClass: number,
  probabilityClass: number,
  more: Partial<RiskFactorFacts> = {}
): RiskFactorFacts => ({
  component: 'executant',
  group: 'Acțiuni greșite',
  description: `Factor ${gravityClass}/${probabilityClass}`,
  gravityClass,
  probabilityClass,
  measures: [],
  actions: null,
  deadline: null,
  responsiblePerson: null,
  observations: null,
  ...more,
});

const build = (list: RiskEvaluationFacts[] = evaluations) =>
  riskAssessment({
    evaluations: list,
    positions,
    caenCode: '2562',
    workplaces: [],
    currentEmployeeCount: 24,
  });

const only = (factors: RiskFactorFacts[]) => build([{ ...officeFacts, factors }]).evaluations[0]!;

describe('the numbers in words', () => {
  it('number the subchapters in roman numerals', () => {
    expect([1, 4, 9, 14, 40].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL']);
  });
});

describe('the evaluations printed', () => {
  it('are the positions in the order of the positions table, the sensitive groups, then the others by name', () => {
    const visitors = other('Vizitatori', [factor(2, 2)], 'e0e0e0e0-0000-4000-8000-000000000004');
    const drivers = other('Deplasări', [factor(2, 2)], 'e0e0e0e0-0000-4000-8000-000000000005');
    expect(
      printedEvaluations([visitors, ...evaluations, drivers], positions).map(
        (evaluation) => evaluation.id
      )
    ).toEqual([officeFacts.id, workshopFacts.id, sensitiveGroups.id, drivers.id, visitors.id]);
  });

  it("leave out an archived position's evaluation and another one without a factor", () => {
    expect(
      printedEvaluations(
        [...evaluations, other('Vizitatori', [], 'e0e0e0e0-0000-4000-8000-000000000004')],
        [workshop]
      ).map((evaluation) => evaluation.id)
    ).toEqual([workshopFacts.id, sensitiveGroups.id]);
  });
});

describe('what the evaluations lack', () => {
  it('is nothing for the fixture', () => {
    expect(incompleteRiskEvaluations(evaluations, positions)).toEqual([]);
  });

  it('is an evaluation for every current position and for the sensitive groups', () => {
    expect(incompleteRiskEvaluations([{ ...workshopFacts, factors: [] }], positions)).toEqual([
      {
        evaluationId: null,
        kind: 'job_position',
        jobPositionId: office.id,
        name: 'Contabil',
        missing: ['factors'],
      },
      {
        evaluationId: workshopFacts.id,
        kind: 'job_position',
        jobPositionId: workshop.id,
        name: 'Sudor',
        missing: ['factors'],
      },
      {
        evaluationId: null,
        kind: 'sensitive_groups',
        jobPositionId: null,
        name: 'Grupuri sensibile la riscuri specifice',
        missing: ['factors'],
      },
    ]);
  });

  it('is a measure for every unacceptable factor, and a deadline and a person for every factor with measures', () => {
    const measured = { measures: [{ kind: 'technical' as const, description: 'Apărători.' }] };
    const visitors = other(
      'Vizitatori',
      [factor(5, 2), factor(2, 2, { ...measured, deadline: 'Anual', responsiblePerson: '  ' })],
      'e0e0e0e0-0000-4000-8000-000000000004'
    );
    expect(incompleteRiskEvaluations([...evaluations, visitors], positions)).toEqual([
      {
        evaluationId: visitors.id,
        kind: 'other',
        jobPositionId: null,
        name: 'Vizitatori',
        missing: ['measures', 'plan'],
      },
    ]);
    expect(
      incompleteRiskEvaluations(
        [...evaluations, other('Vizitatori', [factor(2, 2)], visitors.id)],
        positions
      )
    ).toEqual([]);
  });
});

describe('an evaluation of the risk assessment', () => {
  const [contabil, sudor, groups] = build().evaluations;

  it("is headed by its post and its work zone, and describes the post's work system", () => {
    expect(contabil).toMatchObject({
      roman: 'I',
      name: 'Contabil',
      heading: 'LOCUL DE MUNCĂ: BIROU, POSTUL DE LUCRU: CONTABIL',
      workZoneOrDash: 'Birou',
      workSystem: {
        executant: 'Contabil',
        workTask: '—',
        meansOfProduction: officeEvaluation.meansOfProduction,
        workEnvironment: officeEvaluation.workEnvironment,
      },
      exposedPersons: '1 persoană',
      exposure: '8 h / schimb',
    });
    expect(sudor).toMatchObject({
      roman: 'II',
      heading: 'POSTUL DE LUCRU: SUDOR',
      workZoneOrDash: '—',
      workSystem: { workTask: 'Sudură electrică și autogenă.' },
      exposedPersons: '23 de persoane',
    });
  });

  it('of the sensitive groups or of another name reads its work task and exposed persons from itself', () => {
    expect(groups).toMatchObject({
      roman: 'III',
      name: 'Grupuri sensibile la riscuri specifice',
      heading:
        'GRUPURI SENSIBILE LA RISCURI SPECIFICE (FEMEI GRAVIDE, LĂUZE SAU FEMEI CARE ALĂPTEAZĂ, TINERI, PERSOANE CU DIZABILITĂȚI)',
      workSystem: { workTask: sensitiveGroupsEvaluation.workTask },
      exposedPersons: sensitiveGroupsEvaluation.exposedPersons,
    });
    const [visitors] = build([
      other('Vizitatori', [factor(2, 2)], 'e0e0e0e0-0000-4000-8000-000000000004'),
    ]).evaluations;
    expect(visitors).toMatchObject({
      heading: 'VIZITATORI',
      workSystem: { executant: 'Vizitatori', workTask: 'Vizitarea atelierului însoțit.' },
      exposedPersons: '—',
      exposure: '2 h / zi',
    });
    expect(only([factor(2, 2)]).exposedPersons).toBe('1 persoană');
    expect(
      riskAssessment({
        evaluations: [officeFacts],
        positions: [{ ...office, currentEmployeeCount: 0 }],
        caenCode: null,
        workplaces: [],
        currentEmployeeCount: 0,
      }).evaluations[0]!.exposedPersons
    ).toBe('nicio persoană');
  });

  it('numbers the factors down the sheet: by component, then by group in the order first used', () => {
    expect(
      sudor!.sheet.map((row) => [row.component, row.group, row.code, row.description.slice(0, 20)])
    ).toEqual([
      ['MIJLOACE DE PRODUCȚIE', 'Factori de risc mecanic', 'F1', 'Prinderea mâinilor s'],
      ['', '', 'F2', 'Tăiere sau înțepare '],
      ['', '', 'F3', 'Proiectarea de așchi'],
      ['', 'Factori de risc electric', 'F4', 'Electrocutare prin a'],
      ['MEDIUL DE MUNCĂ', 'Factori de risc fizic', 'F5', 'Zgomot peste valoril'],
      ['', '', 'F6', 'Iluminat insuficient'],
      ['', 'Factori de risc chimic', 'F7', 'Pulberi rezultate la'],
      ['EXECUTANT', 'Acțiuni greșite', 'F8', 'Ridicarea și transpo'],
      ['', '', 'F9', 'Cădere la același ni'],
      ['', 'Omisiuni', 'F10', 'Nepurtarea echipamen'],
      ['SARCINA DE MUNCĂ', 'Suprasolicitare fizică', 'F11', 'Lucru în picioare pe'],
      ['', 'Alte riscuri', 'F12', 'Executarea unor oper'],
    ]);
    expect(sudor!.sheet[0]).toEqual({
      component: 'MIJLOACE DE PRODUCȚIE',
      group: 'Factori de risc mecanic',
      code: 'F1',
      description:
        'Prinderea mâinilor sau a îmbrăcămintei de elementele în mișcare ale mașinilor neprotejate.',
      consequence: 'Invaliditate gradul II',
      gravityClass: 5,
      probabilityClass: 3,
      level: 4,
    });
  });

  it('lists the factors by component and group, with every component and its share', () => {
    expect(
      sudor!.components.map((component) => [
        component.label,
        component.of,
        component.count,
        component.share,
        component.groups.map(
          (group) => `${group.letter}) ${group.name}: ${group.factors.map((f) => f.code).join(' ')}`
        ),
      ])
    ).toEqual([
      [
        'MIJLOACE DE PRODUCȚIE',
        'mijloacelor de producție',
        4,
        '33,33 %',
        ['a) Factori de risc mecanic: F1 F2 F3', 'b) Factori de risc electric: F4'],
      ],
      [
        'MEDIUL DE MUNCĂ',
        'mediului de muncă',
        3,
        '25,00 %',
        ['a) Factori de risc fizic: F5 F6', 'b) Factori de risc chimic: F7'],
      ],
      [
        'EXECUTANT',
        'executantului',
        3,
        '25,00 %',
        ['a) Acțiuni greșite: F8 F9', 'b) Omisiuni: F10'],
      ],
      [
        'SARCINA DE MUNCĂ',
        'sarcinii de muncă',
        2,
        '16,67 %',
        ['a) Suprasolicitare fizică: F11', 'b) Alte riscuri: F12'],
      ],
    ]);
    const executantOnly = only([factor(2, 2)]);
    expect(executantOnly.components.map((component) => component.noFactors)).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(executantOnly.components.map((component) => component.share)).toEqual([
      '0,00 %',
      '0,00 %',
      '100,00 %',
      '0,00 %',
    ]);
  });

  it('ranks the factors by level, equal levels in the order of the sheet', () => {
    expect(sudor!.ranked.map((row) => `${row.code}:${row.level}`)).toEqual([
      'F1:4',
      'F3:4',
      'F4:4',
      'F8:4',
      'F2:3',
      'F5:3',
      'F7:3',
      'F9:3',
      'F10:3',
      'F11:3',
      'F12:3',
      'F6:2',
    ]);
  });

  it('prints the global level with a comma and says whether it is within the limit', () => {
    expect(contabil).toMatchObject({
      factorCount: 11,
      globalLevel: '2,86',
      verdict:
        'valoare care îl încadrează în categoria locurilor de muncă cu nivel de risc acceptabil, nedepășind limita maximă acceptabilă de 3,5',
    });
    expect(only([factor(7, 4), factor(2, 2)])).toMatchObject({
      globalLevel: '5,00',
      verdict:
        'valoare care depășește limita maximă acceptabilă de 3,5 și îl încadrează în categoria locurilor de muncă cu nivel de risc inacceptabil',
    });
  });

  it('lists the unacceptable factors, the highest first', () => {
    expect(sudor!.unacceptable.map((row) => row.code)).toEqual(['F1', 'F3', 'F4', 'F8']);
    expect(sudor!.unacceptable[1]).toEqual({
      code: 'F3',
      description:
        'Proiectarea de așchii sau de fragmente de disc la lucrul cu polizorul unghiular.',
      level: 4,
    });
    const higher = only([
      factor(5, 2, { description: 'Mai întâi' }),
      factor(7, 4, { description: 'Cel mai mare' }),
    ]);
    expect(higher.unacceptable.map((row) => `${row.code} ${row.description}`)).toEqual([
      'F2 Cel mai mare',
      'F1 Mai întâi',
    ]);
  });

  it('words the interpretation for any number of factors', () => {
    const sentences = (factors: RiskFactorFacts[]) => {
      const evaluation = only(factors);
      return [
        evaluation.findings,
        evaluation.unacceptableLead,
        evaluation.measuresSentence,
        evaluation.hasUnacceptable,
        evaluation.noUnacceptable,
      ];
    };
    const lead = 'Rezultatul este susținut de „Fișa de evaluare”, din care se observă că';
    const exceeds =
      'ca nivel parțial de risc, valoarea 3, încadrându-se în categoria factorilor de risc mare.';
    expect(sentences([factor(2, 2)])).toEqual([
      `${lead} singurul factor de risc identificat nu depășește, ca nivel parțial de risc, valoarea 3.`,
      '',
      '',
      false,
      true,
    ]);
    expect(sentences([factor(5, 2)])).toEqual([
      `${lead} singurul factor de risc identificat depășește, ${exceeds}`,
      'Factorul de risc care se situează în domeniul inacceptabil este:',
      'Pentru diminuarea sau eliminarea acestui factor de risc sunt necesare măsurile prezentate în „Fișa de măsuri propuse”.',
      true,
      false,
    ]);
    expect(sentences([factor(2, 2), factor(2, 3)])[0]).toBe(
      `${lead} niciunul dintre cei 2 factori de risc identificați nu depășește, ca nivel parțial de risc, valoarea 3.`
    );
    expect(sentences([factor(2, 2), factor(5, 2)]).slice(0, 3)).toEqual([
      `${lead} din totalul de 2 factori de risc identificați, unul singur depășește, ${exceeds}`,
      'Factorul de risc care se situează în domeniul inacceptabil este:',
      'Pentru diminuarea sau eliminarea acestui factor de risc sunt necesare măsurile prezentate în „Fișa de măsuri propuse”.',
    ]);
    expect(sentences([factor(5, 2), factor(5, 3)])[0]).toBe(
      `${lead} toți cei 2 factori de risc identificați depășesc, ${exceeds}`
    );
    const many = [...Array<null>(20)].map(() => factor(5, 2));
    expect(sentences([...many, factor(2, 2)]).slice(0, 3)).toEqual([
      `${lead} din totalul de 21 de factori de risc identificați, 20 dintre ei depășesc, ${exceeds}`,
      'Cei 20 de factori de risc care se situează în domeniul inacceptabil sunt:',
      'Pentru diminuarea sau eliminarea celor 20 de factori de risc sunt necesare măsurile prezentate în „Fișa de măsuri propuse”.',
    ]);
    expect(sudor!.findings).toBe(
      `${lead} din totalul de 12 factori de risc identificați, 4 dintre ei depășesc, ${exceeds}`
    );
    expect(sudor!.unacceptableLead).toBe(
      'Cei 4 factori de risc care se situează în domeniul inacceptabil sunt:'
    );
  });

  it('counts the factors whose consequence is invalidity or death', () => {
    const consequences = 'consecințe ireversibile asupra executantului (deces sau invaliditate).';
    const lead = 'Din analiza „Fișei de evaluare” se constată că';
    expect(sudor!.irreversible).toBe(
      `${lead} 4 dintre factorii de risc identificați, reprezentând 33,33 %, pot avea ${consequences}`
    );
    expect(only([factor(4, 1), factor(3, 1), factor(3, 1)]).irreversible).toBe(
      `${lead} unul dintre factorii de risc identificați, reprezentând 33,33 %, poate avea ${consequences}`
    );
    expect(only([factor(3, 1), factor(3, 1)]).irreversible).toBe(
      `Niciunul dintre factorii de risc identificați nu poate avea ${consequences}`
    );
    expect(only([factor(3, 1)]).irreversible).toBe(
      `Factorul de risc identificat nu poate avea ${consequences}`
    );
    expect(only([factor(7, 1), factor(4, 1)]).irreversible).toBe(
      `${lead} toți factorii de risc identificați pot avea ${consequences}`
    );
  });

  it('gives the measures sheet and the plan a row per factor with measures, the highest level first, its measures a line each and by kind, dashes for what is empty', () => {
    expect(sudor!.plan.map((row) => row.code)).toEqual(['F1', 'F3', 'F4', 'F8', 'F2', 'F5', 'F10']);
    expect(sudor!.plan[1]).toMatchObject({
      code: 'F3',
      level: 4,
      measures:
        '– Folosirea polizorului numai cu apărătoarea discului montată.\n– Ochelari de protecție.\n– Instruirea pentru alegerea și schimbarea discurilor.',
    });
    expect(sudor!.plan[5]).toEqual({
      code: 'F5',
      description: 'Zgomot peste valorile de expunere, în timpul funcționării mașinilor.',
      level: 3,
      measures:
        '– Antifoane pentru lucrul lângă mașinile zgomotoase.\n– Audiogramă la examenul medical periodic.',
      technical: '– Antifoane pentru lucrul lângă mașinile zgomotoase.',
      organizational: '—',
      hygienicSanitary: '– Audiogramă la examenul medical periodic.',
      other: '—',
      actions: '—',
      deadline: 'Anual',
      responsiblePerson: 'Administratorul',
      observations: '—',
    });
    expect([sudor!.hasPlan, sudor!.noPlan]).toEqual([true, false]);
    expect(only([factor(2, 2)])).toMatchObject({ plan: [], hasPlan: false, noPlan: true });
  });
});

describe('the risk assessment', () => {
  it("presents the unit and weighs the evaluations' levels into the unit's", () => {
    const context = riskAssessment({
      evaluations,
      positions,
      caenCode: '2562',
      workplaces: [
        {
          name: 'Atelier',
          registeredOffice: false,
          county: 'Timiș',
          countyCode: 'TM',
          locality: 'Ghiroda',
          addressLine: 'Str. Industriilor 4',
        },
        {
          name: 'Sediu',
          registeredOffice: true,
          county: 'București',
          countyCode: 'B',
          locality: 'Sector 1',
          addressLine: 'Calea Victoriei 122A',
        },
        {
          name: 'Depozit',
          registeredOffice: false,
          county: null,
          countyCode: null,
          locality: null,
          addressLine: null,
        },
      ],
      currentEmployeeCount: 24,
    });
    expect(context.unit).toEqual({
      activity: '2562 – Fabricarea articolelor de feronerie',
      employeeCount: 24,
      workplaces: [
        { name: 'Sediu', kind: 'Sediu social', address: 'Sector 1, Calea Victoriei 122A' },
        {
          name: 'Atelier',
          kind: 'Punct de lucru',
          address: 'Ghiroda, județul Timiș, Str. Industriilor 4',
        },
        { name: 'Depozit', kind: 'Punct de lucru', address: '—' },
      ],
      noWorkplaces: false,
    });
    expect(context.evaluations.map((evaluation) => evaluation.globalLevel)).toEqual([
      '2,86',
      '3,36',
      '3,19',
    ]);
    expect(context).toMatchObject({
      evaluationCountText: '2 posturi de lucru și grupurile sensibile la riscuri specifice',
      globalLevel: '3,15',
    });
  });

  it('prints a dash for a client without a CAEN class, and says when it has no workplace', () => {
    expect(
      riskAssessment({
        evaluations: [],
        positions: [],
        caenCode: null,
        workplaces: [],
        currentEmployeeCount: 0,
      })
    ).toEqual({
      unit: { activity: '—', employeeCount: 0, workplaces: [], noWorkplaces: true },
      evaluationCountText: '0 posturi de lucru',
      globalLevel: '—',
      evaluations: [],
    });
  });

  it('counts the posts, the sensitive groups and the other evaluations apart', () => {
    const countText = (list: RiskEvaluationFacts[], evaluated = positions) =>
      riskAssessment({
        evaluations: list,
        positions: evaluated,
        caenCode: null,
        workplaces: [],
        currentEmployeeCount: 0,
      }).evaluationCountText;
    const others = (count: number) =>
      [...Array<null>(count)].map((_, index) =>
        other(`Evaluare ${index}`, [factor(2, 2)], `e0e0e0e0-0000-4000-8000-0000000001${index}`)
      );
    expect(countText([...evaluations, ...others(1)])).toBe(
      '2 posturi de lucru, grupurile sensibile la riscuri specifice și o altă evaluare'
    );
    expect(countText([...evaluations, ...others(2)])).toBe(
      '2 posturi de lucru, grupurile sensibile la riscuri specifice și alte 2 evaluări'
    );
    expect(countText([...evaluations, ...others(20)])).toBe(
      '2 posturi de lucru, grupurile sensibile la riscuri specifice și alte 20 de evaluări'
    );
    expect(countText([sensitiveGroups, workshopFacts], [workshop])).toBe(
      'un post de lucru și grupurile sensibile la riscuri specifice'
    );
  });
});

describe("the unit's own risks", () => {
  it('are the unacceptable factors of every evaluation, each once, the highest level first, with their measures', () => {
    const risks = unitRisks(evaluations, positions);
    expect(risks.map((risk) => risk.risk.slice(0, 30))).toEqual([
      'Electrocutare prin atingere in',
      'Accident de circulație pe drum',
      'Prinderea mâinilor sau a îmbră',
      'Proiectarea de așchii sau de f',
      'Electrocutare prin atingere di',
      'Ridicarea și transportul manua',
      'Executarea de către tineri, fă',
      'Ridicarea și transportul de gr',
    ]);
    expect(risks[1]).toEqual({
      risk: 'Accident de circulație pe drumul dintre domiciliu și locul de muncă sau în deplasările de serviciu.',
      measure:
        '– Instruirea lucrătorilor privind circulația pe drumurile publice.\n– Planificarea deplasărilor de serviciu astfel încât să nu fie făcute în grabă.',
    });
  });

  it('merge the measures of a risk found in several evaluations, and keep its highest level', () => {
    const shared = (gravityClass: number, probabilityClass: number, measures: string[]) =>
      factor(gravityClass, probabilityClass, {
        description: measures.length > 1 ? 'Lovire de vehicule.' : ' lovire  de vehicule ',
        measures: measures.map((description) => ({ kind: 'organizational', description })),
      });
    const risks = unitRisks(
      [
        { ...officeFacts, factors: [factor(4, 5), shared(5, 2, ['Instruire.'])] },
        {
          ...workshopFacts,
          factors: [shared(7, 4, ['Instruire', 'Vestă reflectorizantă.'])],
        },
      ],
      positions
    );
    expect(risks).toEqual([
      { risk: 'lovire  de vehicule', measure: '– Instruire.\n– Vestă reflectorizantă.' },
      { risk: 'Factor 4/5', measure: '—' },
    ]);
  });

  it('are none when every factor is acceptable', () => {
    expect(unitRisks([{ ...officeFacts, factors: [factor(2, 2)] }], positions)).toEqual([]);
  });
});
