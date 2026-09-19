import type { DocumentFacts } from './context';

/** Complete facts about a provider and a client, for tests. */
export const facts: DocumentFacts = {
  issueDate: '2026-01-19',
  firstDecisionNumber: 5,
  branding: true,
  organization: {
    legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
    representativeName: 'Ana IONESCU',
    representativeRole: 'Administrator',
  },
  specialist: { fullName: 'Dan MARIN', professionalTitle: 'Evaluator de risc SSM' },
  client: {
    legalName: ' S.C. PIPETECH S.R.L. ',
    representativeName: 'Florin Cristian TALOȘ',
    representativeRole: 'Administrator',
    periodicTrainingHours: 2,
    administrativeTrainingIntervalMonths: 6,
    workerTrainingIntervalMonths: 3,
    trainingFirstMonth: 2,
    trainingDayFrom: 2,
    trainingDayTo: 7,
  },
  responsiblePersons: [
    {
      fullName: 'Florin Cristian TALOȘ',
      jobTitle: 'Administrator',
      roles: ['workplace_manager', 'first_aid', 'risk_evaluation_team', 'imminent_danger'],
    },
    { fullName: 'Ioana PETRE', jobTitle: 'Șef de echipă', roles: ['first_aid', 'imminent_danger'] },
  ],
};
