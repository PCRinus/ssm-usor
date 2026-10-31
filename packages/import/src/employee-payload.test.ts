import type { EmployeeImportChanges } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { type EmployeeImportClient, toEmployeeProposal } from './employee-import';
import { toEmployeePayload } from './employee-payload';
import type { EmployeeImportProposal } from './employee-proposal';
import {
  cnps,
  comanFire,
  comanFront,
  comanPeriodic,
  existingPop,
  page,
  pagesOf,
  popFront,
  positions,
  row,
  rusuFront,
  themes,
  today,
  tomaFront,
  tomaPeriodic,
  workplaces,
} from './test/sheets';

const client: EmployeeImportClient = {
  jobPositions: positions,
  workplaces,
  employees: [existingPop],
};
const records = { jobPositions: positions, workplaces, employees: [existingPop] };

const noChanges = (): EmployeeImportChanges => ({
  people: {},
  jobTitles: {},
  workplaces: {},
  rows: {},
  pages: {},
});

function setUp(...readings: Parameters<typeof pagesOf>) {
  const proposal = toEmployeeProposal({ pages: pagesOf(...readings), client, themes, today });
  const changes = noChanges();
  const check = (...ids: string[]) => {
    for (const id of ids) changes.people[id] = { ...changes.people[id], state: 'checked' };
  };
  const map = () => toEmployeePayload({ proposal, changes, records, today });
  return { proposal, changes, check, map };
}

const idOf = (proposal: EmployeeImportProposal, lastName: string) =>
  proposal.people.find((person) => person.fields.lastName.options[0]?.value === lastName)!.id;

describe('toEmployeePayload', () => {
  it('writes only the people checked, and names those still to check', () => {
    const { proposal, check, map } = setUp(comanFront, comanPeriodic, tomaFront, tomaPeriodic);
    check(idOf(proposal, 'Coman'));

    const { payload, toCheck } = map();

    expect(payload.employees.map((employee) => employee.key)).toEqual([idOf(proposal, 'Coman')]);
    expect(toCheck).toEqual([idOf(proposal, 'Toma')]);
  });

  it('creates a checked person with the near post and the workplace their sheet names', () => {
    const { proposal, check, map } = setUp(comanFront, comanPeriodic, comanFire);
    const coman = idOf(proposal, 'Coman');
    check(coman);

    const { payload, blockers } = map();

    expect(blockers).toEqual([]);
    expect(payload.employees).toEqual([
      {
        key: coman,
        job_position_id: positions[0]!.id,
        workplace_id: workplaces[0]!.id,
        last_name: 'Coman',
        first_name: 'Daniela',
        cnp: cnps.coman,
        employee_number: '12',
        birth_date: '1985-06-15',
        birth_place: 'Sibiu',
        home_address: 'Str. Fabricii nr. 21, Sibiu',
        blood_group: 'A(II)',
        rh_factor: '+',
        job_title: 'Patiseră',
        hired_at: '2021-01-18',
        status: 'active',
      },
    ]);
    expect(payload.files.map((file) => file.import_file_id)).toHaveLength(3);
  });

  it('writes every row but the unsigned one, as trainings held from paper with the admission', () => {
    const { proposal, check, map } = setUp(comanFront, comanPeriodic, comanFire);
    const coman = idOf(proposal, 'Coman');
    check(coman);

    const { payload } = map();

    expect(
      payload.trainings.map(
        (training) => `${training.domain} ${training.phase} ${training.held_on}`
      )
    ).toEqual([
      'ssm introductory_general 2021-01-18',
      'ssm workplace 2021-01-19',
      'ssm periodic 2024-07-15',
      'ssm periodic 2025-01-01',
      'ssm periodic 2026-07-01',
      'psi introductory_general 2021-01-18',
      'psi workplace 2021-01-19',
    ]);
    const workplace = payload.trainings.find((training) => training.phase === 'workplace')!;
    expect(workplace).toMatchObject({
      trainer_name: 'Matei Sorin',
      trainer_job_title: 'Șef de tură',
      records: [
        {
          employee_key: coman,
          admitted_on: '2021-01-20',
          admitted_by_name: 'Mureșan Ioana',
          admitted_by_job_title: 'Administrator',
        },
      ],
    });
    expect(payload.trainings[0]).toMatchObject({
      verifier_name: 'Mureșan Ioana',
      verifier_job_title: 'Administrator',
    });
  });

  it('writes the paper test results: the hiring tests and the annual one', () => {
    const { proposal, check, map } = setUp(comanFront, comanPeriodic, comanFire);
    check(idOf(proposal, 'Coman'));

    const { payload } = map();

    expect(payload.test_results).toEqual([
      {
        employee_key: idOf(proposal, 'Coman'),
        domain: 'ssm',
        test: 'hiring',
        taken_on: '2021-01-18',
        material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
        examiner_name: 'Mureșan Ioana',
        examiner_job_title: 'Administrator',
      },
      expect.objectContaining({ domain: 'psi', test: 'hiring', taken_on: '2021-01-19' }),
      expect.objectContaining({ domain: 'psi', test: 'annual', taken_on: '2026-03-12' }),
    ]);
  });

  it('dates a hiring test by its row as the member corrected it', () => {
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic, comanFire);
    check(idOf(proposal, 'Coman'));
    const intro = proposal.pages[0]!.rows.find((each) => each.phase === 'introductory_general')!;
    changes.rows[intro.id] = { values: { heldOn: '2021-01-15' } };

    expect(map().payload.test_results[0]).toMatchObject({
      domain: 'ssm',
      test: 'hiring',
      taken_on: '2021-01-15',
    });

    changes.rows[intro.id] = { included: false, values: { heldOn: '2026-12-01' } };
    expect(map().blockers).toEqual([{ path: `rows.${intro.id}.test.takenOn`, code: 'invalid' }]);
  });

  it('chooses the row of the hiring test again once pages move', () => {
    const later = page({
      pageKind: 'ssm_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniela' },
      trainings: [
        row({ phase: 'introductory_general', heldOn: '2022-03-01', verifierSignature: 'absent' }),
      ],
    });
    const { proposal, changes, check, map } = setUp(comanFront, later);
    const coman = idOf(proposal, 'Coman');
    check(coman);

    expect(map().payload.test_results).toEqual([]);

    changes.pages['page-2'] = { personId: null };
    expect(map().payload.test_results).toEqual([
      expect.objectContaining({ domain: 'ssm', test: 'hiring', taken_on: '2021-01-18' }),
    ]);
  });

  it('brings the verifier’s signature with a page the member moves to its person', () => {
    const loose = page({
      pageKind: 'ssm_sheet_front',
      trainings: [
        row({
          phase: 'introductory_general',
          heldOn: '2023-05-10',
          verifierName: 'Mureșan Ioana',
          verifierJobTitle: 'Administrator',
          verifierSignature: 'present',
        }),
      ],
    });
    const { proposal, changes, check, map } = setUp(loose, tomaFront);
    const toma = idOf(proposal, 'Toma');
    check(toma);
    changes.jobTitles[proposal.jobTitles[0]!.id] = { jobPositionId: positions[2]!.id };

    expect(map().payload.test_results).toEqual([]);

    changes.pages['page-1'] = { personId: toma };
    expect(map().payload.test_results).toEqual([
      expect.objectContaining({
        test: 'hiring',
        taken_on: '2023-05-10',
        examiner_name: 'Mureșan Ioana',
      }),
    ]);
  });

  it('makes one training held of the same periodic training on two people’s sheets', () => {
    const shared = page({
      pageKind: 'ssm_periodic',
      person: { lastName: 'Toma', firstName: 'Andrei Mihai' },
      trainings: [row({ heldOn: '2026-07', material: 'Instrucțiuni proprii cuptor gaz' })],
    });
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic, tomaFront, shared);
    check(idOf(proposal, 'Coman'), idOf(proposal, 'Toma'));
    changes.jobTitles[proposal.jobTitles[1]!.id] = { jobPositionId: positions[2]!.id };

    const july = map().payload.trainings.filter((training) => training.held_on === '2026-07-01');

    expect(july).toHaveLength(1);
    expect(july[0]!.records.map((record) => record.employee_key)).toEqual([
      idOf(proposal, 'Coman'),
      idOf(proposal, 'Toma'),
    ]);
  });

  it('blocks a title without a post until the member picks one for the whole title', () => {
    const { proposal, changes, check, map } = setUp(rusuFront);
    const rusu = idOf(proposal, 'Rusu');
    check(rusu);
    changes.people[rusu]!.included = true;
    changes.people[rusu]!.cnpCorrection = true;

    expect(map().blockers).toEqual([
      { path: `jobTitles.${proposal.jobTitles[0]!.id}`, code: 'missing' },
    ]);

    changes.jobTitles[proposal.jobTitles[0]!.id] = { jobPositionId: positions[1]!.id };
    const { payload, blockers } = map();

    expect(blockers).toEqual([]);
    expect(payload.employees[0]).toMatchObject({
      cnp: cnps.rusu,
      job_position_id: positions[1]!.id,
      status: 'terminated',
      terminated_at: '2024-12-31',
    });
  });

  it('leaves a leaver out unless ticked, and refuses an uncorrected CNP', () => {
    const { proposal, changes, check, map } = setUp(rusuFront);
    const rusu = idOf(proposal, 'Rusu');
    check(rusu);

    expect(map().payload.employees).toEqual([]);

    changes.people[rusu]!.included = true;
    expect(map().blockers).toContainEqual({ path: `people.${rusu}.fields.cnp`, code: 'invalid' });
  });

  it('decides whether a person is written by the leave date as the member left it', () => {
    const { proposal, changes, check, map } = setUp(rusuFront, comanFront);
    const rusu = idOf(proposal, 'Rusu');
    const coman = idOf(proposal, 'Coman');
    check(rusu, coman);
    changes.people[rusu]!.cnpCorrection = true;
    changes.jobTitles[proposal.jobTitles[0]!.id] = { jobPositionId: positions[1]!.id };
    changes.people[rusu]!.fields = { leftOn: { value: null } };
    changes.people[coman]!.fields = { leftOn: { value: '2025-03-31' } };

    expect(map().payload.employees.map((employee) => employee.key)).toEqual([rusu]);

    changes.people[coman]!.included = true;
    expect(map().payload.employees.find((employee) => employee.key === coman)).toMatchObject({
      status: 'terminated',
      terminated_at: '2025-03-31',
    });
  });

  it('blocks a choice between pages until made', () => {
    const { proposal, changes, check, map } = setUp(tomaFront, tomaPeriodic);
    const toma = idOf(proposal, 'Toma');
    check(toma);
    changes.jobTitles[proposal.jobTitles[0]!.id] = { jobPositionId: positions[2]!.id };

    expect(map().blockers).toEqual([
      { path: `people.${toma}.fields.lastName`, code: 'choice' },
      { path: `people.${toma}.fields.firstName`, code: 'choice' },
    ]);

    changes.people[toma]!.fields = { lastName: { option: 0 }, firstName: { option: 0 } };
    expect(map().blockers).toEqual([]);
    expect(map().payload.employees[0]).toMatchObject({
      last_name: 'Toma',
      first_name: 'Andrei Mihai',
    });
  });

  it('withholds an unverified hiring test unless ticked', () => {
    const { proposal, changes, check, map } = setUp(tomaFront);
    const toma = idOf(proposal, 'Toma');
    check(toma);
    changes.jobTitles[proposal.jobTitles[0]!.id] = { jobPositionId: positions[2]!.id };

    expect(map().payload.test_results).toEqual([]);

    const testRow = proposal.pages[0]!.rows.find((each) => each.test)!;
    changes.rows[testRow.id] = { test: true };
    expect(map().payload.test_results).toEqual([
      expect.objectContaining({ domain: 'ssm', test: 'hiring', examiner_name: 'Mureșan Ioana' }),
    ]);
  });

  it('completes an existing employee: keeps the app’s values unless replaced, skips trainings it has', () => {
    const { proposal, changes, check, map } = setUp(popFront);
    const pop = idOf(proposal, 'Pop');
    check(pop);

    const first = map();
    expect(first.blockers).toEqual([]);
    expect(first.payload.employees[0]).toMatchObject({
      key: pop,
      id: existingPop.id,
      home_address: 'Str. Viitorului nr. 3, Sibiu',
      blood_group: '0(I)',
      rh_factor: '+',
    });
    expect(first.payload.employees[0]!.job_position_id).toBeUndefined();
    expect(first.payload.employees[0]!.replace).toBeUndefined();
    expect(first.payload.trainings.map((training) => training.phase)).toEqual(['workplace']);

    changes.people[pop]!.fields = { homeAddress: { replace: true } };
    expect(map().payload.employees[0]).toMatchObject({
      home_address: 'Str. Fabricii nr. 21, Sibiu',
      replace: ['home_address'],
    });
  });

  it('blocks a second person proposed as the employee another one completes', () => {
    const { proposal, check, map } = setUp(popFront, comanFront);
    const pop = idOf(proposal, 'Pop');
    const coman = idOf(proposal, 'Coman');
    check(pop, coman);
    proposal.people.find((person) => person.id === coman)!.existing = {
      employeeId: existingPop.id,
      matchedBy: 'name_birth_date',
    };

    expect(map().blockers).toEqual([{ path: `people.${coman}.existing`, code: 'invalid' }]);
  });

  it('asks the member to confirm or decline an employee matched by the name alone', () => {
    const continuation = page({
      pageKind: 'ssm_periodic',
      person: { lastName: 'Pop', firstName: 'Elena' },
      trainings: [row({ heldOn: '2026-01-12' })],
    });
    const { proposal, changes, check, map } = setUp(continuation);
    const pop = proposal.people[0]!.id;
    check(pop);

    expect(map().blockers).toEqual([{ path: `people.${pop}.existing`, code: 'choice' }]);

    changes.people[pop]!.existing = true;
    expect(map().blockers).toEqual([]);
    expect(map().payload.employees[0]).toMatchObject({ key: pop, id: existingPop.id });

    changes.people[pop]!.existing = false;
    expect(map().blockers).toEqual([
      { path: `people.${pop}.fields.jobTitle`, code: 'missing' },
      { path: `people.${pop}.fields.hiredAt`, code: 'missing' },
      { path: `people.${pop}.jobPosition`, code: 'missing' },
    ]);
    changes.people[pop]!.jobPositionId = positions[1]!.id;
    changes.people[pop]!.fields = {
      jobTitle: { value: 'Brutar' },
      hiredAt: { value: '2026-01-05' },
    };
    expect(map().blockers).toEqual([]);
    expect(map().payload.employees[0]).toEqual({
      key: pop,
      job_position_id: positions[1]!.id,
      last_name: 'Pop',
      first_name: 'Elena',
      job_title: 'Brutar',
      hired_at: '2026-01-05',
      status: 'active',
    });
  });

  it('blocks a rehire matched to the former employee, whom the app keeps apart', () => {
    const former = { ...existingPop, terminatedAt: '2018-12-31' };
    const rehired = page({ ...popFront, fields: { ...popFront.fields, hiredAt: '2024-02-01' } });
    const proposal = toEmployeeProposal({
      pages: pagesOf(rehired),
      client: { ...client, employees: [former] },
      themes,
      today,
    });
    const pop = proposal.people[0]!.id;
    const changes = noChanges();
    changes.people[pop] = { state: 'checked' };
    const map = () =>
      toEmployeePayload({ proposal, changes, records: { ...records, employees: [former] }, today });

    expect(map().blockers).toEqual([{ path: `people.${pop}.fields.hiredAt`, code: 'invalid' }]);

    changes.people[pop]!.existing = false;
    changes.people[pop]!.jobPositionId = positions[1]!.id;
    expect(map().blockers).toEqual([
      { path: `people.${pop}.fields.cnp`, code: 'invalid' },
      { path: `people.${pop}.fields.employeeNumber`, code: 'invalid' },
    ]);

    changes.people[pop]!.fields = { cnp: { value: null }, employeeNumber: { value: null } };
    const { payload, blockers } = map();
    expect(blockers).toEqual([]);
    expect(payload.employees[0]).toMatchObject({
      key: pop,
      hired_at: '2024-02-01',
      status: 'active',
    });
    expect(payload.employees[0]!.id).toBeUndefined();
    expect(payload.trainings.length).toBeGreaterThan(0);
  });

  it('moves a page to another person, and leaves one out', () => {
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic, tomaFront);
    const coman = idOf(proposal, 'Coman');
    const toma = idOf(proposal, 'Toma');
    check(coman, toma);
    changes.jobTitles[proposal.jobTitles[1]!.id] = { jobPositionId: positions[2]!.id };
    changes.pages['page-2'] = { personId: toma };

    const moved = map().payload;
    const periodicOf = (key: string) =>
      moved.trainings.filter(
        (training) =>
          training.phase === 'periodic' &&
          training.records.some((record) => record.employee_key === key)
      ).length;
    expect(periodicOf(coman)).toBe(0);
    expect(periodicOf(toma)).toBe(3);

    changes.pages['page-2'] = { personId: null };
    expect(map().payload.files.map((file) => file.import_file_id)).not.toContain(
      proposal.pages[1]!.fileId
    );
  });

  it('blocks an unknown post, a row the member left without a day, and an unknown page owner', () => {
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic);
    const coman = idOf(proposal, 'Coman');
    check(coman);
    changes.people[coman]!.jobPositionId = '00000000-0000-4000-8000-000000000999';
    const periodic = proposal.pages[1]!.rows[0]!;
    changes.rows[periodic.id] = { values: { heldOn: null } };
    changes.pages['page-2'] = { personId: 'person-9' };

    expect(map().blockers).toEqual([
      { path: 'pages.page-2', code: 'unknown_reference' },
      { path: `people.${coman}.jobPosition`, code: 'unknown_reference' },
    ]);

    delete changes.pages['page-2'];
    expect(map().blockers).toContainEqual({ path: `rows.${periodic.id}.heldOn`, code: 'missing' });
  });

  it('blocks a duration the app cannot hold, as a sheet’s «24 h» read as a day', () => {
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic);
    check(idOf(proposal, 'Coman'));
    const periodic = proposal.pages[1]!.rows[0]!;
    changes.rows[periodic.id] = { values: { durationMinutes: 1440 } };

    expect(map().blockers).toEqual([
      { path: `rows.${periodic.id}.durationMinutes`, code: 'invalid' },
    ]);
  });

  it('counts what the member changed, unticked and kept', () => {
    const { proposal, changes, check, map } = setUp(comanFront, comanPeriodic);
    const coman = idOf(proposal, 'Coman');
    check(coman);
    changes.rows[proposal.pages[1]!.rows[0]!.id] = { included: false };
    changes.rows[proposal.pages[1]!.rows[1]!.id] = { values: { durationMinutes: 90 } };

    expect(map().payload.quality).toEqual({
      people: { changed: 0, unticked: 0, kept: 1 },
      rows: { changed: 1, unticked: 1, kept: 3 },
      tests: { changed: 0, unticked: 0, kept: 1 },
    });
  });
});
