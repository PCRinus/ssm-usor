import { describe, expect, it } from 'vitest';

import {
  buildDocumentContext,
  documentApplies,
  documentData,
  missingDocumentData,
  undecidedJobPositions,
  workersRepresentativeClash,
} from './context';
import { facts } from './context.fixture';

describe('what is missing', () => {
  it('is nothing for complete facts', () => {
    expect(missingDocumentData(facts)).toEqual([]);
  });

  it('names every gap, in the order of the form', () => {
    expect(
      missingDocumentData({
        ...facts,
        organization: {
          legalName: '  ',
          representativeName: null,
          representativeRole: 'Administrator',
        },
        specialist: null,
        client: { ...facts.client, representativeRole: null, trainingDayTo: null },
        responsiblePersons: [
          { fullName: 'A B', jobTitle: 'C', roles: ['first_aid'], currentEmployee: true },
        ],
      })
    ).toEqual([
      'provider.legalName',
      'provider.representativeName',
      'specialist.name',
      'specialist.professionalTitle',
      'client.representativeRole',
      'client.trainingSchedule',
      'responsible.workplace_manager',
      'responsible.risk_evaluation_team',
      'responsible.imminent_danger',
    ]);
  });

  it('needs a position, and a decision on the equipment and the instructions of every position', () => {
    expect(missingDocumentData({ ...facts, jobPositions: [] })).toEqual(['positions.any']);
    const undecided = {
      ...facts,
      jobPositions: [
        { ...facts.jobPositions[0]!, needsProtectiveEquipment: null },
        { ...facts.jobPositions[1]!, needsInstructions: null },
      ],
    };
    expect(missingDocumentData(undecided)).toEqual([
      'positions.equipment',
      'positions.instructions',
    ]);
    expect(undecidedJobPositions(undecided)).toEqual([
      { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Contabil' },
      { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', name: 'Sudor' },
    ]);
    expect(
      undecidedJobPositions(undecided, 'instructions').map((position) => position.name)
    ).toEqual(['Sudor']);
  });

  it('stops the context from being built', () => {
    expect(() => buildDocumentContext({ ...facts, specialist: null })).toThrow(
      'Missing document data: specialist.name, specialist.professionalTitle'
    );
  });

  it('requires an explicit decision for both categories and at least one interval', () => {
    const withChoices = (
      administrative: number | null,
      worker: number | null,
      administrativeExcluded: boolean,
      workerExcluded: boolean
    ) =>
      missingDocumentData({
        ...facts,
        staffCategoriesInUse: [],
        client: {
          ...facts.client,
          administrativeTrainingIntervalMonths: administrative,
          workerTrainingIntervalMonths: worker,
          administrativeTrainingNotApplicable: administrativeExcluded,
          workerTrainingNotApplicable: workerExcluded,
        },
      });
    expect(withChoices(6, null, false, true)).toEqual([]);
    expect(withChoices(null, 3, true, false)).toEqual([]);
    expect(withChoices(6, null, false, false)).toContain('client.trainingSchedule');
    expect(withChoices(null, null, true, true)).toContain('client.trainingSchedule');
  });

  describe("workers' representatives", () => {
    const representative = (fullName: string, currentEmployee = true) => ({
      fullName,
      jobTitle: 'Vânzător',
      roles: ['workers_representative' as const],
      currentEmployee,
    });
    const missing = (currentEmployeeCount: number, ...representatives: string[]) =>
      missingDocumentData({
        ...facts,
        currentEmployeeCount,
        responsiblePersons: [
          ...facts.responsiblePersons,
          ...representatives.map((name) => representative(name)),
        ],
      });

    it('are not asked for under 10 current employees', () => {
      expect(missing(9)).toEqual([]);
      expect(missing(9, 'Florin Cristian TALOȘ')).toEqual([]);
    });

    it('need one from 10 current employees and two from 50', () => {
      expect(missing(10)).toEqual(['responsible.workers_representative']);
      expect(missing(10, 'Ioana PETRE')).toEqual([]);
      expect(missing(50, 'Ioana PETRE')).toEqual(['responsible.workers_representatives_two']);
      expect(missing(50, 'Ioana PETRE', 'Mihai DOBRE')).toEqual([]);
    });

    it('do not count once their employee has left', () => {
      expect(
        missingDocumentData({
          ...facts,
          currentEmployeeCount: 12,
          responsiblePersons: [...facts.responsiblePersons, representative('Ioana PETRE', false)],
        })
      ).toEqual(['responsible.workers_representative']);
    });

    it('cannot include the legal representative, however the name is typed', () => {
      expect(missing(12, 'Talos Florin-Cristian')).toEqual([
        'responsible.workers_representative_is_legal_representative',
      ]);
    });

    it('names the two people who clash', () => {
      const withClash = {
        ...facts,
        responsiblePersons: [...facts.responsiblePersons, representative('Talos Florin-Cristian ')],
      };
      expect(workersRepresentativeClash(withClash)).toEqual({
        representativeName: 'Talos Florin-Cristian',
        legalRepresentativeName: 'Florin Cristian TALOȘ',
      });
      expect(workersRepresentativeClash(facts)).toBeNull();
    });

    it('are still needed to generate a 1.5 again under 10 employees', () => {
      const again = (...representatives: string[]) =>
        missingDocumentData(
          {
            ...facts,
            currentEmployeeCount: 6,
            responsiblePersons: [
              ...facts.responsiblePersons,
              ...representatives.map((name) => representative(name)),
            ],
          },
          'decision_workers_representative'
        );
      expect(again()).toEqual(['responsible.workers_representative']);
      expect(again('Talos Florin-Cristian')).toEqual([
        'responsible.workers_representative_is_legal_representative',
      ]);
      expect(again('Ioana PETRE')).toEqual([]);
      expect(
        missingDocumentData({ ...facts, currentEmployeeCount: 6 }, 'decision_training')
      ).toEqual([]);
    });
  });

  it('blocks a category with active employees from being excluded', () => {
    expect(
      missingDocumentData({
        ...facts,
        client: {
          ...facts.client,
          workerTrainingIntervalMonths: null,
          workerTrainingNotApplicable: true,
        },
      })
    ).toContain('client.trainingSchedule');
  });
});

describe('the merge context', () => {
  const context = buildDocumentContext(facts);

  it('prints dates, years and trimmed names', () => {
    expect(context.issueDate).toBe('19.01.2026');
    expect(context.issueYear).toBe('2026');
    expect(context.followingYear).toBe('2027');
    expect(context.client.legalName).toBe('S.C. PIPETECH S.R.L.');
    expect(context.specialist).toEqual({
      name: 'Dan MARIN',
      professionalTitle: 'Evaluator de risc SSM',
    });
  });

  it('puts people under the roles they hold', () => {
    expect(context.workplaceManagers).toEqual([
      { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
    ]);
    expect(context.workplaceManager).toEqual(context.workplaceManagers[0]);
    expect(context.firstAiderNames).toBe('Florin Cristian TALOȘ, Ioana PETRE');
    expect(context.evaluationTeam).toHaveLength(1);
    expect(context.imminentDangerText).toBe(
      'Florin Cristian TALOȘ având funcția de Administrator, Ioana PETRE având funcția de Șef de echipă'
    );
  });

  it('words the training schedule', () => {
    expect(context.training).toEqual({
      periodicDuration: '2 ore',
      intervalPhrase: 'următoarele intervale de timp',
      administrative: [{}],
      worker: [{}],
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'februarie, august',
      workerFrequency: 'TRIMESTRIAL',
      workerMonths: 'februarie, mai, august, noiembrie',
      dayFrom: 2,
      dayTo: 7,
    });
    const other = buildDocumentContext({
      ...facts,
      client: {
        ...facts.client,
        periodicTrainingMinutes: 60,
        administrativeTrainingIntervalMonths: 12,
        workerTrainingIntervalMonths: 2,
        trainingFirstMonth: 9,
      },
    });
    expect(other.training.periodicDuration).toBe('1 oră');
    expect(
      buildDocumentContext({ ...facts, client: { ...facts.client, periodicTrainingMinutes: 90 } })
        .training.periodicDuration
    ).toBe('1 oră și 30 de minute');
    expect(other.training.administrativeFrequency).toBe('ANUAL');
    expect(other.training.administrativeMonths).toBe('septembrie');
    expect(other.training.workerFrequency).toBe('LA 2 LUNI');
    expect(other.training.workerMonths).toBe('septembrie, noiembrie');
  });

  it('builds only the applicable category context', () => {
    const administrativeOnly = buildDocumentContext({
      ...facts,
      staffCategoriesInUse: ['technical_administrative'],
      client: {
        ...facts.client,
        workerTrainingIntervalMonths: null,
        workerTrainingNotApplicable: true,
      },
    });
    expect(administrativeOnly.training.worker).toEqual([]);
    expect(administrativeOnly.training.intervalPhrase).toBe('următorul interval de timp');
    expect(administrativeOnly.training).not.toHaveProperty('workerFrequency');

    const workerOnly = buildDocumentContext({
      ...facts,
      staffCategoriesInUse: ['execution'],
      client: {
        ...facts.client,
        administrativeTrainingIntervalMonths: null,
        administrativeTrainingNotApplicable: true,
      },
    });
    expect(workerOnly.training.administrative).toEqual([]);
    expect(workerOnly.training).not.toHaveProperty('administrativeFrequency');
  });

  it('numbers the decisions from the first number, and only the decisions', () => {
    expect(documentData(context, 'decision_training')).toMatchObject({ decisionNumber: 5 });
    expect(documentData(context, 'decision_imminent_danger')).toMatchObject({ decisionNumber: 8 });
    expect(documentData(context, 'control_regulation')).not.toHaveProperty('decisionNumber');
    expect(documentData(context, 'decision_training')).not.toHaveProperty('decisionNumbers');
  });

  it('lists every position for the table of posts, and the equipped ones with their entries', () => {
    expect(context.positions).toEqual([
      {
        name: 'Contabil',
        activities: '—',
        staffCategory: 'Tehnic-administrativ',
        workZone: 'Birou',
        workZoneLine: [{}],
        workZoneOrDash: 'Birou',
        intervalLabel: 'la 6 luni',
        trainingDuration: '2 ore',
        equipment: [],
      },
      {
        name: 'Sudor',
        activities: 'Sudură electrică și autogenă.',
        staffCategory: 'Execuție',
        workZone: '',
        workZoneLine: [],
        workZoneOrDash: '—',
        intervalLabel: 'la 2 luni',
        trainingDuration: '2 ore',
        equipment: [
          {
            risk: 'Radiații, împroșcare (față, ochi)',
            item: 'Mască de sudură',
            quantityLabel: '1 buc. / 24 luni',
            allocationLabel: 'Inventar de secție',
          },
          {
            risk: 'Căldură, foc (mâini)',
            item: 'Mănuși de sudor',
            quantityLabel: '2 buc. / 1 lună',
            allocationLabel: 'Inventar personal',
          },
          {
            risk: 'Pulberi',
            item: 'Mască de unică folosință',
            quantityLabel: '50 buc.',
            allocationLabel: 'Consum',
          },
        ],
      },
    ]);
    expect(context.equippedPositions.map((position) => position.name)).toEqual(['Sudor']);
  });

  it('annexes the modules the positions apply, each once, by group and title, with their versions', () => {
    expect(context.annexes).toEqual([
      {
        number: 1,
        title: 'Activități de birou',
        versionId: 'b0b0b0b0-0000-4000-8000-000000000002',
        versionDate: '26.09.2026',
      },
      {
        number: 2,
        title: 'Sudură oxiacetilenică',
        versionId: 'b0b0b0b0-0000-4000-8000-000000000001',
        versionDate: '25.09.2026',
      },
    ]);
    expect(context.noAnnexes).toEqual([]);
    const none = buildDocumentContext({
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsInstructions: false,
        instructions: [],
      })),
    });
    expect([none.annexes, none.noAnnexes]).toEqual([[], [{}]]);
  });

  it('switches the branding line', () => {
    expect(context.branding).toEqual([{}]);
    expect(buildDocumentContext({ ...facts, branding: false }).branding).toEqual([]);
  });
});

describe('decision 1.5', () => {
  const withRepresentatives = {
    ...facts,
    currentEmployeeCount: 12,
    responsiblePersons: [
      ...facts.responsiblePersons,
      {
        fullName: 'Mihai DOBRE ',
        jobTitle: 'Vânzător',
        roles: ['workers_representative' as const],
        currentEmployee: true,
      },
      {
        fullName: 'Radu ENE',
        jobTitle: 'Vânzător',
        roles: ['workers_representative' as const],
        currentEmployee: false,
      },
    ],
  };

  it('belongs in the set from 10 current employees', () => {
    expect(documentApplies({ currentEmployeeCount: 9 }, 'decision_workers_representative')).toBe(
      false
    );
    expect(documentApplies({ currentEmployeeCount: 10 }, 'decision_workers_representative')).toBe(
      true
    );
    expect(documentApplies({ currentEmployeeCount: 0 }, 'decision_training')).toBe(true);
  });

  it('names the representatives who are still employees, and the cover lists it', () => {
    const context = buildDocumentContext(withRepresentatives);
    expect(context.workersRepresentatives).toEqual([{ name: 'Mihai DOBRE', jobTitle: 'Vânzător' }]);
    expect(context.workersRepresentativesLead).toBe('următorul angajat');
    expect(context.workersRepresentativeDecision).toEqual([{}]);
    expect(documentData(context, 'decision_workers_representative')).toMatchObject({
      decisionNumber: 9,
    });
  });

  it('is left off the cover under 10 current employees, unless it was generated', () => {
    expect(buildDocumentContext(facts).workersRepresentativeDecision).toEqual([]);
    expect(
      buildDocumentContext({ ...facts, workersRepresentativeDecisionGenerated: true })
        .workersRepresentativeDecision
    ).toEqual([{}]);
  });
});
