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
  jobPositions: [
    {
      id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
      name: 'Contabil',
      staffCategory: 'technical_administrative',
      workZone: 'Birou',
      activities: null,
      trainingIntervalMonths: null,
      needsProtectiveEquipment: false,
      needsInstructions: true,
      instructions: [
        {
          moduleId: 'a0a0a0a0-0000-4000-8000-000000000002',
          title: 'Activități de birou',
          group: 'work_activity',
          version: {
            id: 'b0b0b0b0-0000-4000-8000-000000000002',
            number: 1,
            createdAt: '2026-09-26T10:00:00+00:00',
          },
        },
      ],
      equipment: [],
    },
    {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      name: 'Sudor ',
      staffCategory: 'execution',
      workZone: null,
      activities: 'Sudură electrică și autogenă.',
      trainingIntervalMonths: 2,
      needsProtectiveEquipment: true,
      needsInstructions: true,
      instructions: [
        {
          moduleId: 'a0a0a0a0-0000-4000-8000-000000000001',
          title: 'Sudură oxiacetilenică',
          group: 'work_equipment',
          version: {
            id: 'b0b0b0b0-0000-4000-8000-000000000001',
            number: 3,
            createdAt: '2026-09-25T08:30:00+00:00',
          },
        },
        {
          moduleId: 'a0a0a0a0-0000-4000-8000-000000000002',
          title: 'Activități de birou',
          group: 'work_activity',
          version: {
            id: 'b0b0b0b0-0000-4000-8000-000000000002',
            number: 1,
            createdAt: '2026-09-26T10:00:00+00:00',
          },
        },
      ],
      equipment: [
        {
          risk: 'Radiații, împroșcare (față, ochi)',
          item: 'Mască de sudură',
          quantity: 1,
          durationMonths: 24,
          allocation: 'section_inventory',
        },
        {
          risk: 'Căldură, foc (mâini)',
          item: 'Mănuși de sudor',
          quantity: 2,
          durationMonths: 1,
          allocation: 'personal_inventory',
        },
        {
          risk: 'Pulberi',
          item: 'Mască de unică folosință',
          quantity: 50,
          durationMonths: null,
          allocation: 'consumable',
        },
      ],
    },
  ],
  staffCategoriesInUse: ['technical_administrative', 'execution'],
  currentEmployeeCount: 6,
  workersRepresentativeDecisionGenerated: false,
};
