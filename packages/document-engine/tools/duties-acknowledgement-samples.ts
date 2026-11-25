import {
  buildDutiesAcknowledgementData,
  type DutiesAcknowledgementFacts,
  type PrintedDutyAnnex,
} from '../src/ssm-duties';

const annex: PrintedDutyAnnex = {
  number: 2,
  positionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  position: 'Sudor',
  instructions: [
    { number: 1, title: 'Activități de birou' },
    { number: 4, title: 'Sudură oxiacetilenică și tăiere cu flacără' },
  ],
  hasInstructions: true,
  equipment: true,
  zones: [{ label: 'Atelierul de sudură (hala 2, latura de nord)' }],
  hasZones: true,
  trainingInterval: 'la 3 luni',
  workplaceManagerDuties: { people: 'Ioana PETRE' },
  firstAidDuties: { people: 'Mihai DRĂGAN' },
  imminentDangerDuties: { people: 'Ioana PETRE', decision: 'nr. 4 SSM din 24.11.2026' },
  workersRepresentativeDuties: null,
};

const plain: DutiesAcknowledgementFacts = {
  branding: true,
  issueDate: '24.11.2026',
  client: { legalName: 'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.' },
  employee: { name: 'Radu-Constantin Mărgineanu-Zaharia' },
  annex,
  roles: [],
};

const withRoles: DutiesAcknowledgementFacts = {
  ...plain,
  employee: { name: 'Ioana PETRE' },
  roles: ['workplace_manager', 'imminent_danger'],
};

export const dutiesAcknowledgementFacts = { plain, withRoles };

export function dutiesAcknowledgementSamples() {
  return [
    { label: 'plain', data: buildDutiesAcknowledgementData(plain) },
    { label: 'roles', data: buildDutiesAcknowledgementData(withRoles) },
  ];
}
