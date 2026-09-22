import { describe, expect, it } from 'vitest';

import { buildDocumentContext, documentData, missingDocumentData } from './context';
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

  it('switches the branding line', () => {
    expect(context.branding).toEqual([{}]);
    expect(buildDocumentContext({ ...facts, branding: false }).branding).toEqual([]);
  });
});
