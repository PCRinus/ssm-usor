import type {
  ClientDocumentDetailsResponseDocumentDetails,
  ClientFireSafetyResponseFireSafety,
  ClientListResponseItemsItem,
  ClientResponseClient,
  DutiesAcknowledgementResponse,
  EmployeeListResponseItemsItem,
  EmployeeListResponseItemsItemPortal,
  EmployeeResponseEmployee,
  JobPositionResponseJobPosition,
  MeResponse,
  WorkplaceListResponseItemsItem,
  WorkplaceResponseWorkplace,
} from '@/api/generated/api';

import { noTests, untrained } from './training-fixture';

export const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
export const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const workplaceId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
export const jobPositionId = '5d1a8c3e-2b4f-4e6a-9c7d-1f3e5a7b9c0d';
export const employeeId = 'e7a1c3d5-9b2f-4e8a-8c6d-4f2a1b3c5d7e';

const stamp = '2026-09-17T10:00:00+00:00';

export const meResponse = {
  user: { id: 'user-one', email: 'review@example.test' },
  profile: {
    fullName: 'Radu Pop',
    professionalTitle: null,
    termsVersion: null,
    termsAcceptedAt: null,
  },
  membership: {
    organization: { id: organizationId, name: 'Prevent SSM Consult' },
    role: 'owner',
  },
} satisfies MeResponse;

export function meRecord(overrides: Partial<MeResponse> = {}): MeResponse {
  return { ...meResponse, ...overrides };
}

// Not a response the API sends: with `membership` absent rather than null, the shell neither sends
// the user to onboarding nor asks for a member's setup guide, which a test of one page leaves out.
export const userOnlyMe: Pick<MeResponse, 'user'> = { user: meResponse.user };

export function clientRecord(overrides: Partial<ClientResponseClient> = {}): ClientResponseClient {
  return {
    id: clientId,
    legalName: 'VELOCE CAFE SRL',
    cui: '1590082',
    vatPayer: false,
    caenCode: '5630',
    tradeRegisterNumber: null,
    countyCode: 'B',
    locality: 'București',
    addressLine: null,
    legalRepresentativeName: 'Maria Popescu',
    declaredEmployeeCount: 6,
    currentEmployeeCount: 6,
    stage: 'client',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    promotedAt: null,
    serviceContractState: null,
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
    ...overrides,
  };
}

export function clientListItem(
  overrides: Partial<ClientListResponseItemsItem> = {}
): ClientListResponseItemsItem {
  return {
    ...clientRecord(),
    clientSince: stamp,
    documentation: null,
    fireSafetyDocumentation: null,
    training: null,
    canDelete: false,
    serviceContractStateAt: null,
    serviceContractReturnExpiresAt: null,
    ...overrides,
  };
}

export function workplaceRecord(
  overrides: Partial<WorkplaceResponseWorkplace> = {}
): WorkplaceResponseWorkplace {
  return {
    id: workplaceId,
    clientId,
    name: 'Sediu social',
    isRegisteredOffice: true,
    officeHasActivity: true,
    countyCode: 'B',
    locality: 'București',
    addressLine: 'Calea Victoriei 122A',
    activity: null,
    kind: 'fixed_space',
    floorAreaM2: null,
    extinguisherNorm: null,
    assemblyPoint: null,
    combustibleMaterials: null,
    ignitionSources: null,
    fireRiskEquipment: null,
    specificMeasures: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function workplaceListItem(
  overrides: Partial<WorkplaceListResponseItemsItem> = {}
): WorkplaceListResponseItemsItem {
  return { ...workplaceRecord(), currentEmployeeCount: 0, ...overrides };
}

export function jobPositionRecord(
  overrides: Partial<JobPositionResponseJobPosition> = {}
): JobPositionResponseJobPosition {
  return {
    id: jobPositionId,
    clientId,
    name: 'Barista',
    staffCategory: 'execution',
    workZone: null,
    activities: null,
    trainingIntervalMonths: null,
    employeeCount: 0,
    employeesToTrainCount: 0,
    needsProtectiveEquipment: null,
    equipmentCount: 0,
    instructionCount: 0,
    fireInstructionCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function employeeRecord(
  overrides: Partial<EmployeeResponseEmployee> = {}
): EmployeeResponseEmployee {
  return {
    id: employeeId,
    clientId,
    lastName: 'Ionescu',
    firstName: 'Andrei',
    cnp: null,
    employeeNumber: null,
    email: null,
    phone: null,
    jobTitle: 'Barista',
    contractNumber: null,
    jobPosition: { id: jobPositionId, name: 'Barista', archived: false },
    hiredAt: '2026-09-01',
    status: 'active',
    terminatedAt: null,
    birthDate: null,
    birthPlace: null,
    homeAddress: null,
    residenceAddress: null,
    bloodGroup: null,
    rhFactor: null,
    notes: null,
    workplace: { id: workplaceId, name: 'Sediu social' },
    qualification: null,
    education: null,
    authorizations: null,
    commuteRoute: null,
    commuteMeans: [],
    commuteMeansOther: null,
    commuteMinutes: null,
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
    training: untrained,
    tests: noTests,
    ...overrides,
  };
}

export const noPortalAccess: EmployeeListResponseItemsItemPortal = {
  state: 'none',
  since: null,
  expiresAt: null,
  revokedAt: null,
  resendableAt: null,
  channel: null,
  address: null,
  language: null,
  participantId: null,
  invitationId: null,
  administrator: false,
};

export function employeeListItem(
  overrides: Partial<EmployeeListResponseItemsItem> = {}
): EmployeeListResponseItemsItem {
  const {
    id,
    clientId,
    lastName,
    firstName,
    employeeNumber,
    email,
    phone,
    jobTitle,
    jobPosition,
    hiredAt,
    status,
    terminatedAt,
    workplace,
    createdAt,
    updatedAt,
    training,
    tests,
  } = employeeRecord();
  return {
    id,
    clientId,
    lastName,
    firstName,
    employeeNumber,
    email,
    phone,
    jobTitle,
    jobPosition,
    hiredAt,
    status,
    terminatedAt,
    workplace,
    createdAt,
    updatedAt,
    training,
    tests,
    signaturesPending: 0,
    dutiesAcknowledgement: null,
    portal: noPortalAccess,
    ...overrides,
  };
}

export function pageOf<T>(items: T[], { page = 1, pageSize = 25, total = items.length } = {}) {
  return { items, page, pageSize, total };
}

export function fireSafetyRecord(
  overrides: Partial<ClientFireSafetyResponseFireSafety> = {}
): ClientFireSafetyResponseFireSafety {
  return {
    periodicTrainingHours: null,
    administrativeTrainingIntervalMonths: null,
    workerTrainingIntervalMonths: null,
    trainingFirstMonth: null,
    trainingDayFrom: null,
    trainingDayTo: null,
    smokingPolicy: null,
    smokingPlace: null,
    wasteKinds: [],
    wasteContractor: null,
    wasteCollectors: null,
    hasThirdParties: false,
    ...overrides,
  };
}

export function documentDetailsRecord(
  overrides: Partial<ClientDocumentDetailsResponseDocumentDetails> = {}
): ClientDocumentDetailsResponseDocumentDetails {
  return {
    legalRepresentativeName: null,
    legalRepresentativeRole: null,
    legalRepresentativeEmployeeId: null,
    legalRepresentativeEmployee: null,
    periodicTrainingMinutes: null,
    administrativeTrainingIntervalMonths: null,
    administrativeTrainingNotApplicable: false,
    workerTrainingIntervalMonths: null,
    workerTrainingNotApplicable: false,
    trainingFirstMonth: null,
    trainingDayFrom: null,
    trainingDayTo: null,
    ...overrides,
  };
}

export const dutiesNotIssued: DutiesAcknowledgementResponse = {
  status: 'not_issued',
  reasons: [],
  revision: null,
  annex: null,
  current: null,
  history: [],
};
