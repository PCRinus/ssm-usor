import type { DocumentFacts } from './context';

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
    periodicTrainingMinutes: 120,
    administrativeTrainingIntervalMonths: 6,
    administrativeTrainingNotApplicable: false,
    workerTrainingIntervalMonths: 3,
    workerTrainingNotApplicable: false,
    trainingFirstMonth: 2,
    trainingDayFrom: 2,
    trainingDayTo: 7,
  },
  responsiblePersons: [
    {
      fullName: 'Florin Cristian TALOȘ',
      jobTitle: 'Administrator',
      roles: ['workplace_manager', 'first_aid', 'risk_evaluation_team', 'imminent_danger'],
      currentEmployee: false,
    },
    {
      fullName: 'Ioana PETRE',
      jobTitle: 'Șef de echipă',
      roles: ['first_aid', 'imminent_danger'],
      currentEmployee: true,
    },
  ],
  staffCategoriesInUse: ['technical_administrative', 'execution'],
  currentEmployeeCount: 6,
  workersRepresentativeDecisionGenerated: false,
};
