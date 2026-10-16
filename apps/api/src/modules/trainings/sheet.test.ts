import { describe, expect, it } from 'vitest';

import {
  blankRowsAfter,
  buildTrainingSheetData,
  hoursOf,
  missingSheetDataOf,
  type SheetRecord,
  type TrainingSheetFacts,
  trainingSheetFileName,
} from './sheet';

const workshop = { id: 'w1', name: 'Punct de lucru Str. Fabricii 3' };
const office = { id: 'w2', name: 'Sediul social' };

const record = (
  phase: SheetRecord['training']['phase'],
  heldOn: string,
  overrides: Partial<SheetRecord['training']> = {},
  admission: SheetRecord['admission'] = null
): SheetRecord => ({
  occupation: 'Sudor',
  admission,
  training: {
    phase,
    heldOn,
    durationMinutes: 120,
    material: `I.P.S.S.M. Art. 1 – 60 (${heldOn})`,
    trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
    verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    supplementaryReason: null,
    createdAt: `${heldOn}T10:00:00+00:00`,
    ...overrides,
  },
});

const facts: TrainingSheetFacts = {
  domain: 'ssm',
  branding: true,
  client: { legalName: 'S.C. CLIENT DEMO S.R.L.', activeWorkplaces: [workshop, office] },
  employee: {
    lastName: 'Ștefănescu',
    firstName: 'Ana Maria',
    employeeNumber: '0042',
    contractTitle: 'Sudor',
    homeAddress: 'Str. Lungă 12, Timișoara',
    birthDate: '1988-03-14',
    birthPlace: 'Lugoj',
    bloodGroup: 'A(II)',
    rhFactor: '+',
    qualification: null,
    education: 'Liceu',
    authorizations: null,
    commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33.',
    commuteMinutes: 25,
    workplace: workshop,
    position: { name: 'Sudor', workZone: 'Atelier' },
  },
  records: [
    record('periodic', '2026-07-02', { durationMinutes: 90 }),
    record('introductory_general', '2026-01-05', {
      durationMinutes: 240,
      trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    }),
    record(
      'workplace',
      '2026-01-06',
      { durationMinutes: 240 },
      { admittedOn: '2026-01-06', name: 'Ion POP', jobTitle: 'Șef atelier' }
    ),
    record('periodic', '2026-04-03'),
    record('supplementary', '2026-05-18', {
      durationMinutes: 60,
      material: 'IP Sudură Art. 31 – 42.',
      supplementaryReason: 'after_accident',
    }),
  ],
};

describe('missingSheetDataOf', () => {
  it('asks the occupational safety sheet for the route, and either sheet for the workplace at a client with several', () => {
    const lacking: TrainingSheetFacts = {
      ...facts,
      employee: { ...facts.employee, commuteRoute: '  ', workplace: null },
    };
    expect(missingSheetDataOf(lacking)).toEqual(['employee.commute_route', 'employee.workplace']);
    expect(missingSheetDataOf({ ...lacking, domain: 'psi' })).toEqual(['employee.workplace']);
  });

  it('needs no workplace where the client has one, and nothing else of an empty employee', () => {
    const bare: TrainingSheetFacts = {
      ...facts,
      client: { ...facts.client, activeWorkplaces: [workshop] },
      employee: {
        ...facts.employee,
        employeeNumber: null,
        homeAddress: null,
        birthDate: null,
        birthPlace: null,
        bloodGroup: null,
        rhFactor: null,
        education: null,
        commuteMinutes: null,
        workplace: null,
      },
      records: [],
    };
    expect(missingSheetDataOf(bare)).toEqual([]);
    expect(
      missingSheetDataOf({
        ...bare,
        domain: 'psi',
        employee: { ...bare.employee, commuteRoute: null },
      })
    ).toEqual([]);
  });
});

describe('hoursOf', () => {
  it('prints whole hours bare and any other duration with one decimal and a comma', () => {
    expect([240, 120, 90, 30, 100, 45].map(hoursOf)).toEqual([
      '4',
      '2',
      '1,5',
      '0,5',
      '1,7',
      '0,8',
    ]);
  });
});

describe('buildTrainingSheetData', () => {
  it('prints the identification block from the employee, the position and the workplace', () => {
    expect(buildTrainingSheetData(facts).employee).toEqual({
      name: 'ȘTEFĂNESCU Ana Maria',
      employeeNumber: '0042',
      bloodGroup: 'A(II) Rh+',
      homeAddress: 'Str. Lungă 12, Timișoara',
      birth: '14.03.1988, Lugoj',
      qualification: '',
      education: 'Liceu',
      contractTitle: 'Sudor',
      workplace: 'Punct de lucru Str. Fabricii 3 – Atelier',
      authorizations: '',
      commute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33 (25 de minute)',
    });
  });

  it('prints the only active workplace of an employee who has none, or the work zone alone', () => {
    const unplaced = { ...facts.employee, workplace: null };
    const single = buildTrainingSheetData({
      ...facts,
      client: { ...facts.client, activeWorkplaces: [office] },
      employee: unplaced,
    });
    expect(single.employee.workplace).toBe('Sediul social – Atelier');
    const none = buildTrainingSheetData({
      ...facts,
      client: { ...facts.client, activeWorkplaces: [] },
      employee: unplaced,
    });
    expect(none.employee.workplace).toBe('Atelier');
  });

  it('fills the hiring trainings and admission from their records, the names under the signatures', () => {
    const data = buildTrainingSheetData(facts);
    expect(data.hiring.introductory).toEqual({
      heldOn: '05.01.2026',
      hours: '4',
      trainer: 'Dan MARIN',
      trainerJobTitle: 'Inspector SSM',
      material: 'I.P.S.S.M. Art. 1 – 60 (2026-01-05)',
      occupation: 'Sudor',
      place: '',
    });
    expect(data.hiring.workplace.place).toBe('Punct de lucru Str. Fabricii 3 – Atelier');
    expect(data.admission).toEqual({
      admittedOn: '06.01.2026',
      name: 'Ion POP',
      jobTitle: 'Șef atelier',
    });
    expect(data.signers).toEqual({
      introductory: { trainer: 'Dan MARIN', verifier: 'Dan MARIN' },
      workplace: { trainer: 'Ion POP', verifier: 'Dan MARIN' },
    });
  });

  it('prints the periodic rows oldest first, and the supplementary ones apart with their reason', () => {
    const data = buildTrainingSheetData(facts);
    expect(data.periodic.map((row) => [row.heldOn, row.hours])).toEqual([
      ['03.04.2026', '2'],
      ['02.07.2026', '1,5'],
    ]);
    expect(data.periodic[0]).toMatchObject({
      occupation: 'Sudor',
      trainer: 'Ion POP',
      verifier: 'Dan MARIN',
    });
    expect(data.supplementary).toEqual([
      {
        heldOn: '18.05.2026',
        hours: '1',
        occupation: 'Sudor',
        material:
          'IP Sudură Art. 31 – 42 (motivul: reluarea activității după un accident de muncă)',
        trainer: 'Ion POP',
        verifier: 'Dan MARIN',
      },
    ]);
  });

  it('leaves the hiring blocks blank before any training, and fills the table pages with blank rows', () => {
    const data = buildTrainingSheetData({ ...facts, records: [] });
    expect(Object.values(data.hiring.introductory).every((value) => value === '')).toBe(true);
    expect(data.hiring.workplace.place).toBe('Punct de lucru Str. Fabricii 3 – Atelier');
    expect(data.admission).toEqual({ admittedOn: '', name: '', jobTitle: '' });
    expect(data.signers.workplace).toEqual({ trainer: '', verifier: '' });
    expect(data.blankRows.periodic).toHaveLength(17);
    expect(data.blankRows.supplementary).toHaveLength(17);
  });

  it('puts the supplementary trainings among the periodic rows of the fire-safety sheet, its verifier the trainer', () => {
    const psi: TrainingSheetFacts = {
      ...facts,
      domain: 'psi',
      employee: { ...facts.employee, commuteRoute: null },
      records: facts.records.map((each) => ({
        ...each,
        training: { ...each.training, verifier: null },
      })),
    };
    const data = buildTrainingSheetData(psi);
    expect(data.periodic.map((row) => row.heldOn)).toEqual([
      '03.04.2026',
      '18.05.2026',
      '02.07.2026',
    ]);
    expect(data.supplementary).toEqual([]);
    expect(data.blankRows.supplementary).toEqual([]);
    expect(data.blankRows.periodic).toHaveLength(14);
    expect(data.signers.introductory).toEqual({ trainer: 'Dan MARIN', verifier: 'Dan MARIN' });
  });

  it('refuses facts the readiness turns down', () => {
    expect(() =>
      buildTrainingSheetData({ ...facts, employee: { ...facts.employee, commuteRoute: null } })
    ).toThrow('employee.commute_route');
  });
});

describe('blankRowsAfter', () => {
  const row = (material: string) => ({
    heldOn: '03.04.2026',
    hours: '2',
    occupation: 'Sudor',
    material,
    trainer: 'Ion POP',
    verifier: '',
  });

  it('fills the rest of the page, and of the next page once the rows run onto it', () => {
    expect(blankRowsAfter([row('Art. 1 – 60')], 'ssm')).toHaveLength(16);
    expect(
      blankRowsAfter(
        Array.from({ length: 17 }, () => row('Art. 1 – 60')),
        'ssm'
      )
    ).toHaveLength(0);
    expect(
      blankRowsAfter(
        Array.from({ length: 18 }, () => row('Art. 1 – 60')),
        'psi'
      )
    ).toHaveLength(17);
  });

  it('counts a row whose material runs over several lines as taller', () => {
    const long = row('I.P.S.S.M. Art. 1 – 60; '.repeat(8));
    expect(blankRowsAfter([long], 'ssm').length).toBeLessThan(16);
  });
});

describe('trainingSheetFileName', () => {
  it('names the file in ASCII after the domain and the employee', () => {
    expect(trainingSheetFileName('ssm', { lastName: 'Popescu', firstName: 'Ion' })).toBe(
      'Fisa-SSM-Popescu-Ion.pdf'
    );
    expect(
      trainingSheetFileName('psi', { lastName: 'Ștefănescu-Țurcanu', firstName: 'ana maria' })
    ).toBe('Fisa-PSI-Stefanescu-Turcanu-Ana-Maria.pdf');
  });
});
