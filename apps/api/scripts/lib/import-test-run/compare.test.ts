import { describe, expect, it } from 'vitest';

import { compareSections, outcomeOf, pairRows, type ResultRow, scoreOf } from './compare';
import {
  confirmedClient,
  confirmedEmployees,
  instructionSections,
  NoResultError,
  readClient,
  readEmployees,
  riskSections,
} from './results';
import {
  clientProposal,
  clientReading,
  employeeProposal,
  instruction,
  instructionsProposal,
  riskFactor,
  riskSheet,
  risksProposal,
  sheetPage,
  sheetRow,
  today,
} from './test/fixtures';

const row = (
  identities: string[],
  group: string | null,
  values: ResultRow['values']
): ResultRow => ({
  identities,
  group,
  values,
});

const where = (comparison: ReturnType<typeof compareSections>) =>
  comparison.differences.map((each) => `${each.outcome} ${each.section}.${each.field}`).sort();

describe('outcomeOf', () => {
  it('tells a value found, missed, wrong or extra, folding case and diacritics', () => {
    expect(outcomeOf('Timișoara', 'TIMISOARA')).toBe('found');
    expect(outcomeOf(6, '6')).toBe('found');
    expect(outcomeOf('Sibiu', null)).toBe('missed');
    expect(outcomeOf('Sibiu', 'Sibu')).toBe('wrong');
    expect(outcomeOf(null, 'Sibiu')).toBe('extra');
    expect(outcomeOf('', '  ')).toBeNull();
  });
});

describe('pairRows', () => {
  it('pairs by the first identity, then the next, then what is left of a group in order', () => {
    const expected = [
      row(['popescu ion', '1900101000000'], null, {}),
      row(['ionescu maria', '2900101000000'], null, {}),
      row(['coman|ssm|periodic|2025-07-14'], 'coman|ssm|periodic', {}),
      row(['toma dan'], null, {}),
    ];
    const got = [
      row(['ionescu marie', '2900101000000'], null, {}),
      row(['popescu ion', '1900101000009'], null, {}),
      row(['coman|ssm|periodic|2025-07-17'], 'coman|ssm|periodic', {}),
      row(['toma dana'], null, {}),
    ];

    expect(pairRows(expected, got)).toEqual([
      [0, 1],
      [1, 0],
      [2, 2],
      [3, null],
      [null, 3],
    ]);
  });

  it('pairs no rows by an identity made of blank parts', () => {
    const expected = [row(['|'], null, {}), row(['|', 'popescu ion'], null, {})];
    const got = [row(['popescu ion|'], null, {}), row(['|', 'popescu ion'], null, {})];

    expect(pairRows(expected, got)).toEqual([
      [1, 1],
      [0, null],
      [null, 0],
    ]);
  });

  it('leaves a row of the reading no answer pairs as its own', () => {
    expect(pairRows([], [row(['casier'], null, {})])).toEqual([[null, 0]]);
  });
});

describe('compareSections', () => {
  it('counts each value of a paired row, and every value of an unpaired one', () => {
    const comparison = compareSections(
      {
        posts: [
          row(['brutar'], null, { name: 'Brutar', work_zone: 'Laborator' }),
          row(['vanzator'], 'zone', { name: 'Vânzător', work_zone: null }),
        ],
      },
      {
        posts: [
          row(['brutar'], null, { name: 'Brutar', work_zone: 'Depozit' }),
          row(['casier'], 'zone', { name: 'Casier', work_zone: 'Casă' }),
        ],
      }
    );

    expect(comparison.sections.posts).toEqual({ found: 1, missed: 0, wrong: 2, extra: 1 });
    expect(comparison.fields['posts.name']).toEqual({ found: 1, missed: 0, wrong: 1, extra: 0 });
    expect(comparison.score).toBe(0.25);
  });

  it('scores nothing when neither side holds a value', () => {
    expect(scoreOf({ found: 0, missed: 0, wrong: 0, extra: 0 })).toBeNull();
    expect(compareSections({}, {}).score).toBeNull();
  });
});

describe('a client import', () => {
  it('compares the reading with the proposal as the member confirmed it', () => {
    const answer = clientProposal();
    const magazin = answer.workplaces.find((workplace) => workplace.name === 'Magazin')!;
    const changes = {
      fields: { 'client.legalRepresentativeName': { value: 'Vasilescu Andrei Mihai' } },
      items: { [magazin.id]: { included: false } },
    };
    const reading = clientProposal(
      clientReading({
        facts: clientReading().facts.filter((each) => each.field !== 'client.countyCode'),
        jobPositions: ['Brutar', 'Casier'].map((name) => ({
          ...clientReading().jobPositions[0]!,
          name,
        })),
      })
    );

    const comparison = compareSections(confirmedClient(answer, changes), readClient(reading));

    expect(where(comparison)).toEqual([
      'extra jobPositions.name',
      'extra workplaces.activity',
      'extra workplaces.address_line',
      'extra workplaces.is_registered_office',
      'extra workplaces.locality',
      'extra workplaces.name',
      'missed client.county_code',
      'missed jobPositions.name',
      'wrong client.legal_representative_name',
    ]);
    // The posts have no category, so they count as execution personnel, as confirming writes them,
    // and both sides give that category the law's longest interval.
    expect(comparison.sections.client).toMatchObject({ found: 4, missed: 1, wrong: 1 });
  });

  it('finds every value of a reading that gives back the confirmed proposal unchanged', () => {
    const answer = clientProposal();

    const comparison = compareSections(confirmedClient(answer, null), readClient(answer));

    expect(comparison.differences).toEqual([]);
    expect(comparison.score).toBe(1);
  });
});

describe('an employee import', () => {
  it('compares the sheets as read with the people as the member settled them', () => {
    const answer = employeeProposal(sheetPage({}));
    const coman = answer.people[0]!.id;
    const changes = {
      people: {
        [coman]: { state: 'checked', fields: { birthPlace: { value: 'Sibiu, jud. Sibiu' } } },
      },
      jobTitles: {},
      workplaces: {},
      rows: {},
      pages: {},
    };
    const reading = employeeProposal(
      sheetPage({
        person: { employeeNumber: null },
        trainings: [sheetRow({}), sheetRow({ heldOn: '2025-01-13' })],
      })
    );

    const comparison = compareSections(
      confirmedEmployees(answer, changes, today),
      readEmployees(reading, today)
    );

    expect(where(comparison)).toEqual(
      [
        'missed people.employee_number',
        'wrong people.birth_place',
        ...['held_on', 'duration_minutes', 'material', 'trainer_name', 'trainer_job_title'].map(
          (field) => `extra trainings.${field}`
        ),
      ].sort()
    );
    expect(comparison.sections.trainings!.found).toBeGreaterThan(0);
  });

  it('gives a training of a nameless person no identity of its own', () => {
    const nameless = sheetPage({ person: { lastName: null, firstName: null } });

    const trainings = readEmployees(employeeProposal(nameless), today).trainings!;

    expect(trainings.length).toBeGreaterThan(0);
    expect(trainings.every((training) => training.identities[0] === '')).toBe(true);
  });

  it('leaves out a person the member did not check', () => {
    const answer = employeeProposal(sheetPage({}));

    const comparison = compareSections(
      confirmedEmployees(answer, null, today),
      readEmployees(answer, today)
    );

    expect(comparison.sections.people).toMatchObject({ found: 0, missed: 0, wrong: 0 });
    expect(comparison.sections.people!.extra).toBeGreaterThan(0);
  });
});

describe('an instructions part', () => {
  it('compares each instruction by its file and number, with its posts by name', () => {
    const importProposal = clientProposal();
    const answer = instructionsProposal([
      instruction({ number: '1', title: 'Lucrul la cuptor' }),
      instruction({ number: '2', title: 'Lucrul cu malaxorul' }),
      instruction({ number: '3', title: 'Curățenia' }),
    ]);
    const changes = {
      instructions: {
        'instruction-1': { title: 'Lucrul la cuptorul electric' },
        'instruction-2': { included: false },
      },
    };
    const reading = instructionsProposal([
      instruction({ number: '1', title: 'Lucrul la cuptor' }),
      instruction({ number: '2', title: 'Lucrul cu malaxorul' }),
    ]);

    const comparison = compareSections(
      instructionSections(answer, changes, importProposal),
      instructionSections(reading, null, importProposal)
    );

    expect(where(comparison)).toEqual(
      [
        'wrong instructions.title',
        ...['title', 'category', 'body', 'posts'].map((field) => `extra instructions.${field}`),
        ...['title', 'category', 'body', 'posts'].map((field) => `missed instructions.${field}`),
      ].sort()
    );
    expect(instructionSections(answer, null, importProposal).instructions![0]!.values.posts).toBe(
      'Brutar'
    );
  });
});

describe('a risks part', () => {
  it('compares the factors each sheet writes once the member changed them', () => {
    const importProposal = clientProposal();
    const answer = risksProposal([
      riskSheet([
        riskFactor({ key: 'f1', description: 'Contact cu suprafețe fierbinți' }),
        riskFactor({ key: 'f2', description: 'Zgomot', component: 'work_environment' }),
        riskFactor({ key: 'f3', description: 'Efort fizic', component: 'executant' }),
      ]),
    ]);
    const changes = {
      sheets: {
        'sheet-1': { factors: { f1: { gravityClass: 4 }, f2: { included: false } } },
      },
    };
    const reading = risksProposal([
      riskSheet([
        riskFactor({ key: 'r1', description: 'Contact cu suprafețe fierbinți' }),
        riskFactor({ key: 'r2', description: 'Zgomot', component: 'work_environment' }),
      ]),
    ]);

    const comparison = compareSections(
      riskSections(answer, changes, importProposal),
      riskSections(reading, null, importProposal)
    );

    const factorFields = ['group', 'description', 'gravity_class', 'probability_class', 'measures'];
    expect(where(comparison)).toEqual(
      [
        'wrong factors.gravity_class',
        ...factorFields.map((field) => `extra factors.${field}`),
        ...factorFields.map((field) => `missed factors.${field}`),
      ].sort()
    );
    expect(comparison.sections.sheets).toEqual({ found: 3, missed: 0, wrong: 0, extra: 0 });
  });
});

describe('a copy whose changes no longer read', () => {
  const unreadable = { people: [], fields: [], instructions: [], sheets: [] };

  it('has no answer, rather than the proposal as it was before the member reviewed it', () => {
    const importProposal = clientProposal();

    expect(() => confirmedClient(clientProposal(), unreadable)).toThrow(NoResultError);
    expect(() => confirmedEmployees(employeeProposal(sheetPage({})), unreadable, today)).toThrow(
      /changes no longer read/
    );
    expect(() =>
      instructionSections(
        instructionsProposal([instruction({ number: '1' })]),
        unreadable,
        importProposal
      )
    ).toThrow(/changes no longer read/);
    expect(() =>
      riskSections(
        risksProposal([riskSheet([riskFactor({ key: 'f1', description: 'Zgomot' })])]),
        unreadable,
        importProposal
      )
    ).toThrow(/changes no longer read/);
  });
});
