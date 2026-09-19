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
        responsiblePersons: [{ fullName: 'A B', jobTitle: 'C', roles: ['first_aid'] }],
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
        periodicTrainingHours: 1,
        administrativeTrainingIntervalMonths: 12,
        workerTrainingIntervalMonths: 2,
        trainingFirstMonth: 9,
      },
    });
    expect(other.training.periodicDuration).toBe('1 oră');
    expect(other.training.administrativeFrequency).toBe('ANUAL');
    expect(other.training.administrativeMonths).toBe('septembrie');
    expect(other.training.workerFrequency).toBe('LA 2 LUNI');
    expect(other.training.workerMonths).toBe('septembrie, noiembrie');
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
