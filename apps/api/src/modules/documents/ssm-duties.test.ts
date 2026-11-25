import { describe, expect, it } from 'vitest';

import { buildDocumentContext, type DocumentFacts } from './context';
import { facts } from './context.fixture';
import { ssmDutiesFingerprints } from './ssm-duties';

const accountantId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const welderId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const [accountant, welder] = facts.jobPositions as [
  DocumentFacts['jobPositions'][number],
  DocumentFacts['jobPositions'][number],
];

const annexesOf = (input: DocumentFacts) => buildDocumentContext(input).dutyAnnexes;
const fingerprintsOf = async (input: DocumentFacts) => ssmDutiesFingerprints(annexesOf(input));
const fingerprintOf = (
  fingerprints: Awaited<ReturnType<typeof fingerprintsOf>>,
  positionId: string
) => fingerprints.annexes.find((annex) => annex.positionId === positionId)!.fingerprint;

const withPositions = (
  accountantChanges: Partial<DocumentFacts['jobPositions'][number]>,
  welderChanges: Partial<DocumentFacts['jobPositions'][number]> = {}
): DocumentFacts => ({
  ...facts,
  jobPositions: [
    { ...accountant, ...accountantChanges },
    { ...welder, ...welderChanges },
  ],
});

const ioanaId = 'e1e1e1e1-0000-4000-8000-000000000002';

const weldingModule = welder.instructions.find((module) => module.title.startsWith('Sudură'))!;

describe('the annexes of document 13', () => {
  it('give every current position its annex, in the order of the positions table', () => {
    expect(annexesOf(facts).map((annex) => [annex.number, annex.position])).toEqual([
      [1, 'Contabil'],
      [2, 'Sudor'],
    ]);
  });

  it('give a position without employees its annex, with no role block', () => {
    const empty = withPositions({ currentEmployees: [], currentEmployeeCount: 0 });
    expect(annexesOf(empty)[0]).toMatchObject({ position: 'Contabil', hasRoles: false });
  });

  it('name the occupational safety modules of the post as 3.1 numbers them, not the fire-safety ones', () => {
    expect(annexesOf(facts)[1]!.instructions).toEqual([
      { number: 1, title: 'Activități de birou' },
      { number: 2, title: 'Sudură oxiacetilenică' },
    ]);
  });

  it('print the protective equipment only for a post that has some', () => {
    expect(annexesOf(facts).map((annex) => annex.equipment)).toEqual([false, true]);
  });

  it('print the training at the post own interval, else its category interval', () => {
    expect(annexesOf(facts).map((annex) => annex.trainingInterval)).toEqual([
      'la 6 luni',
      'la 2 luni',
    ]);
  });

  it('print the zones that link a factor of the post, only once the client has listed them', () => {
    expect(annexesOf(facts)[0]!.zones).toEqual([
      {
        label: 'Tabloul electric general (Sediu social, parter, camera tehnică de lângă intrare)',
      },
    ]);
    const undecided = { ...facts, riskZones: { ...facts.riskZones, state: 'undecided' as const } };
    expect(annexesOf(undecided).map((annex) => annex.hasZones)).toEqual([false, false]);
  });

  it('print a role block for each role a current employee of the post holds', () => {
    expect(annexesOf(facts)[1]).toMatchObject({
      workplaceManagerDuties: { people: 'Ioana PETRE' },
      firstAidDuties: { people: 'Ioana PETRE' },
      imminentDangerDuties: { people: 'Ioana PETRE', decision: 'nr. 8 SSM din 19.01.2026' },
      workersRepresentativeDuties: null,
      hasRoles: true,
    });
  });

  it('give no block to someone designated by name alone, who holds no post', () => {
    const byName = {
      ...facts,
      responsiblePersons: facts.responsiblePersons.map((person) => ({
        ...person,
        employeeId: null,
        currentEmployee: false,
      })),
    };
    expect(annexesOf(byName).every((annex) => !annex.hasRoles)).toBe(true);
  });

  it('cite a decision by the number and date it was generated with', () => {
    const stored = {
      ...facts,
      decisionsInRun: [],
      decisionDocuments: { decision_imminent_danger: { number: 12, issueDate: '2025-03-02' } },
    };
    expect(annexesOf(stored)[1]!.imminentDangerDuties!.decision).toBe('nr. 12 SSM din 02.03.2025');
    const uploaded = {
      ...facts,
      decisionsInRun: [],
      decisionDocuments: { decision_imminent_danger: { number: 12, issueDate: null } },
    };
    expect(annexesOf(uploaded)[1]!.imminentDangerDuties!.decision).toBe('nr. 12 SSM');
  });

  it('give no block citing a decision that neither exists nor is generated in the same run', () => {
    const alone = { ...facts, decisionsInRun: [] };
    expect(annexesOf(alone).every((annex) => annex.imminentDangerDuties === null)).toBe(true);
    expect(
      annexesOf({
        ...alone,
        decisionDocuments: { decision_imminent_danger: { number: 4, issueDate: '2026-11-24' } },
      })[1]!.imminentDangerDuties!.decision
    ).toBe('nr. 4 SSM din 24.11.2026');
  });

  it('give the legal representative designated by name alone the blocks of the post they hold', () => {
    const holder = facts.responsiblePersons.find((person) => person.currentEmployee)!;
    const byName = {
      ...facts,
      client: {
        ...facts.client,
        representativeEmployeeId: holder.employeeId,
        representativeName: holder.fullName,
      },
      responsiblePersons: facts.responsiblePersons.map((person) =>
        person === holder ? { ...person, employeeId: null, currentEmployee: false } : person
      ),
    };
    expect(annexesOf(byName).map((annex) => annex.hasRoles)).toEqual(
      annexesOf(facts).map((annex) => annex.hasRoles)
    );
    expect(annexesOf(byName)[1]!.workplaceManagerDuties!.employeeIds).toEqual([holder.employeeId]);
  });

  it('name the employees each block covers by id, for the acknowledgements and not the print', () => {
    expect(annexesOf(facts)[1]).toMatchObject({
      workplaceManagerDuties: { employeeIds: [ioanaId] },
      firstAidDuties: { employeeIds: [ioanaId] },
      imminentDangerDuties: { employeeIds: [ioanaId] },
    });
  });

  it("print the workers' representative block only while decision 1.5 is part of the set", () => {
    const representative = {
      ...facts,
      responsiblePersons: facts.responsiblePersons.map((person) =>
        person.currentEmployee
          ? { ...person, roles: [...person.roles, 'workers_representative' as const] }
          : person
      ),
    };
    expect(annexesOf(representative)[1]!.workersRepresentativeDuties).toBeNull();
    expect(
      annexesOf({ ...representative, workersRepresentativeDecisionGenerated: true })[1]!
        .workersRepresentativeDuties
    ).toEqual({
      people: 'Ioana PETRE',
      employeeIds: [ioanaId],
      decision: 'nr. 9 SSM din 19.01.2026',
    });
  });
});

describe('the fingerprints of document 13', () => {
  it('are the same for the same data', async () => {
    expect(await fingerprintsOf(facts)).toEqual(await fingerprintsOf(structuredClone(facts)));
  });

  it('record every post and every role', async () => {
    const fingerprints = await fingerprintsOf(facts);
    expect(fingerprints.annexes.map((annex) => annex.positionId)).toEqual([accountantId, welderId]);
    expect(fingerprints.roles.map((role) => role.role)).toEqual([
      'workplace_manager',
      'first_aid',
      'imminent_danger',
      'workers_representative',
    ]);
    expect(new Set(fingerprints.annexes.map((annex) => annex.fingerprint)).size).toBe(2);
  });

  it('do not change with names, dates, numbers or who holds a role', async () => {
    const renamed: DocumentFacts = {
      ...withPositions({ name: 'Contabil-șef' }, { name: 'Sudor autorizat' }),
      issueDate: '2027-05-04',
      firstDecisionNumber: 40,
      client: { ...facts.client, legalName: 'ALTĂ FIRMĂ S.R.L.', representativeName: 'Dan POP' },
      responsiblePersons: facts.responsiblePersons.map((person) => ({
        ...person,
        fullName: `${person.fullName} ALTUL`,
        roles: person.currentEmployee ? ['first_aid'] : person.roles,
      })),
      decisionDocuments: { decision_imminent_danger: { number: 3, issueDate: '2024-01-01' } },
    };
    expect(await fingerprintsOf(renamed)).toEqual(await fingerprintsOf(facts));
  });

  it('change only for the post an instruction is added to', async () => {
    const before = await fingerprintsOf(facts);
    const after = await fingerprintsOf(
      withPositions({ instructions: [...accountant.instructions, weldingModule] })
    );
    expect(fingerprintOf(after, accountantId)).not.toBe(fingerprintOf(before, accountantId));
    expect(fingerprintOf(after, welderId)).toBe(fingerprintOf(before, welderId));
    expect(after.roles).toEqual(before.roles);
  });

  it('do not change for another post whose instructions a new module renumbers in 3.1', async () => {
    const before = await fingerprintsOf(facts);
    const earlier = {
      ...weldingModule,
      moduleId: 'a0a0a0a0-0000-4000-8000-000000000009',
      title: 'Activități de arhivă',
      group: 'work_activity' as const,
      version: { ...weldingModule.version, id: 'b0b0b0b0-0000-4000-8000-000000000009' },
    };
    const after = await fingerprintsOf(
      withPositions({ instructions: [...accountant.instructions, earlier] })
    );
    expect(fingerprintOf(after, welderId)).toBe(fingerprintOf(before, welderId));
  });

  it('change for a post when its equipment, zones or interval change', async () => {
    const before = await fingerprintsOf(facts);
    for (const changed of [
      withPositions({}, { equipment: [] }),
      withPositions({}, { trainingIntervalMonths: 3 }),
      { ...facts, riskZones: { ...facts.riskZones, state: 'undecided' as const } },
    ]) {
      const after = await fingerprintsOf(changed);
      const positionId = changed.riskZones.state === 'undecided' ? accountantId : welderId;
      expect(fingerprintOf(after, positionId)).not.toBe(fingerprintOf(before, positionId));
    }
  });
});
