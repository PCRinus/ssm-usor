import type { ImportDetail } from '@/api/generated/api';

import { clientId, importDetail, importFile, importId } from './import-fixture';

export { clientId, importId };

export const bakerId = 'b1000000-0000-4000-8000-000000000001';
export const sellerId = 'b1000000-0000-4000-8000-000000000002';
export const shopId = 'c1000000-0000-4000-8000-000000000001';
export const bakeryId = 'c1000000-0000-4000-8000-000000000002';
export const existingEmployeeId = 'e1000000-0000-4000-8000-000000000001';

const none = { options: [] };
const one = (value: string | number, pageId: string) => ({
  options: [{ value, pageIds: [pageId] }],
});
const kept = (value: string | number | null, app: string | number | null, pageId: string) => ({
  options: value === null ? [] : [{ value, pageIds: [pageId] }],
  app,
});

const emptyFields = {
  lastName: none,
  firstName: none,
  cnp: none,
  employeeNumber: none,
  birthDate: none,
  birthPlace: none,
  homeAddress: none,
  education: none,
  qualification: none,
  bloodGroup: none,
  rhFactor: none,
  jobTitle: none,
  hiredAt: none,
  leftOn: none,
  workplace: none,
  commuteRoute: none,
  commuteMinutes: none,
};

type RowOverrides = Record<string, unknown>;

export function sheetRow(id: string, overrides: RowOverrides = {}) {
  return {
    id,
    domain: 'ssm',
    phase: 'periodic',
    heldOn: '2025-02-10',
    durationMinutes: 120,
    trainerName: 'Barbu Ionuț',
    trainerJobTitle: 'inspector SSM',
    verifierName: null,
    verifierJobTitle: null,
    material: 'Riscuri la cuptor și malaxor',
    supplementaryReason: null,
    signatures: { trainee: 'present', trainer: 'present', verifier: 'no_box' },
    admission: null,
    fromThemes: [],
    testOnly: false,
    test: null,
    flags: [],
    proposedIncluded: true,
    ...overrides,
  };
}

const page = (id: string, fileId: string, personId: string | null, rows: unknown[] = []) => ({
  id,
  fileId,
  page: null,
  label: `IMG_${id}.jpg`,
  kind: 'ssm_periodic',
  personId,
  placement: personId ? 'name' : 'unplaced',
  rows,
  unreadable: [],
  notes: [],
});

export const fileIds = ['f1', 'f2', 'f3', 'f4', 'f5'].map(
  (_, index) => `f0000000-0000-4000-8000-00000000010${index + 1}`
);

export function employeeProposal() {
  return {
    pages: [
      {
        ...page('p1', fileIds[0]!, 'toma', [
          sheetRow('r1', {
            phase: 'introductory_general',
            heldOn: '2024-08-12',
            durationMinutes: 480,
            verifierName: 'Mureșan Ioana',
            verifierJobTitle: 'administrator',
            signatures: { trainee: 'present', trainer: 'present', verifier: 'present' },
            test: {
              test: 'hiring',
              takenOn: '2024-08-12',
              examinerName: 'Mureșan Ioana',
              examinerJobTitle: 'administrator',
              verified: true,
              inApp: false,
            },
          }),
        ]),
        kind: 'ssm_sheet_front',
      },
      page('p2', fileIds[1]!, 'toma', [
        sheetRow('r2'),
        sheetRow('r5', { heldOn: '2025-08-11', trainerName: null }),
      ]),
      page('p3', fileIds[2]!, 'pop', [
        sheetRow('r3', { durationMinutes: 240, flags: ['unusual_duration'] }),
      ]),
      page('p4', fileIds[3]!, 'lazar', [
        sheetRow('r4', { flags: ['in_app'], proposedIncluded: false }),
        sheetRow('r6', { heldOn: '2025-08-11' }),
      ]),
      page('p5', fileIds[4]!, null),
    ],
    people: [
      {
        id: 'toma',
        pageIds: ['p1', 'p2'],
        fields: {
          ...emptyFields,
          lastName: one('Toma', 'p1'),
          firstName: one('Andrei', 'p1'),
          cnp: one('190051?320141', 'p1'),
          birthDate: one('1990-05-17', 'p1'),
          jobTitle: one('Ajutor brutar', 'p1'),
          hiredAt: one('2024-08-12', 'p1'),
          commuteRoute: one('Cisnădie – Sibiu', 'p1'),
        },
        cnpCorrection: '1900517320141',
        existing: null,
        jobTitleId: 'title-helper',
        workplaceId: 'place-none',
        rowsInApp: 0,
        flags: [{ code: 'cnp_correction', field: 'cnp' }, { code: 'no_contact' }],
        proposedIncluded: true,
      },
      {
        id: 'pop',
        pageIds: ['p3'],
        fields: {
          ...emptyFields,
          lastName: one('Pop', 'p3'),
          firstName: one('Elena', 'p3'),
          jobTitle: one('Vânzător', 'p3'),
          hiredAt: one('2023-05-02', 'p3'),
        },
        cnpCorrection: null,
        existing: null,
        jobTitleId: 'title-seller',
        workplaceId: null,
        rowsInApp: 0,
        flags: [{ code: 'no_contact' }],
        proposedIncluded: true,
      },
      {
        id: 'lazar',
        pageIds: ['p4'],
        fields: {
          ...emptyFields,
          lastName: kept('Lazăr', 'Lazăr', 'p4'),
          firstName: kept('Radu', 'Radu', 'p4'),
          homeAddress: kept('Str. Fabricii nr. 21, Sibiu', 'Str. Viitorului nr. 3, Sibiu', 'p4'),
          hiredAt: kept('2019-04-03', null, 'p4'),
          jobTitle: kept('Brutar', 'Brutar', 'p4'),
        },
        cnpCorrection: null,
        existing: { employeeId: existingEmployeeId, matchedBy: 'cnp' },
        jobTitleId: null,
        workplaceId: null,
        rowsInApp: 1,
        flags: [],
        proposedIncluded: true,
      },
    ],
    jobTitles: [
      {
        id: 'title-helper',
        match: 'none',
        proposedId: null,
        closestId: bakerId,
        personIds: ['toma'],
        title: 'Ajutor brutar',
      },
      {
        id: 'title-seller',
        match: 'exact',
        proposedId: sellerId,
        closestId: null,
        personIds: ['pop'],
        title: 'Vânzător',
      },
    ],
    workplaces: [
      {
        id: 'place-none',
        match: 'none',
        proposedId: null,
        closestId: bakeryId,
        personIds: ['toma'],
        text: 'Laborator',
      },
    ],
    clientHasPositions: true,
  };
}

export function employeeDetail(overrides: Record<string, unknown> = {}) {
  const proposal = employeeProposal();
  return importDetail({
    kind: 'employees',
    status: 'ready',
    client: { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' },
    intoExistingClient: true,
    companyName: null,
    readyAt: '2026-10-30T10:00:00+00:00',
    expiresAt: '2026-11-13T10:00:00+00:00',
    people: { total: 3, toCheck: 3, checked: 0, setAside: 0 },
    version: 4,
    files: fileIds.map((id, index) =>
      importFile({
        id,
        uploadPath: `IMG_p${index + 1}.jpg`,
        fileName: `IMG_p${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        state: 'read',
        documentKind: null,
        isScan: true,
        hasDerived: true,
        pageCount: 1,
      })
    ),
    employees: { proposal, changes: null, states: {} },
    ...overrides,
  }) as unknown as ImportDetail;
}

export const positions = [
  { id: bakerId, name: 'Brutar' },
  { id: sellerId, name: 'Vânzător' },
].map((position) => ({
  ...position,
  clientId,
  staffCategory: 'execution',
  workZone: null,
  activities: null,
  trainingIntervalMonths: 6,
  employeeCount: 3,
  needsProtectiveEquipment: null,
  equipmentCount: 0,
  needsInstructions: null,
  instructionCount: 0,
  needsFireInstructions: null,
  fireInstructionCount: 0,
  createdAt: '2026-10-01T10:00:00+00:00',
  updatedAt: '2026-10-01T10:00:00+00:00',
}));

export const workplaces = [
  { id: shopId, name: 'Magazin Str. Lungă 5' },
  { id: bakeryId, name: 'Laborator producție' },
].map((workplace) => ({
  ...workplace,
  clientId,
  isRegisteredOffice: false,
  countyCode: 'SB',
  locality: 'Sibiu',
  addressLine: null,
  activity: null,
  kind: 'fixed_space',
  floorAreaM2: null,
  extinguisherNorm: null,
  assemblyPoint: null,
  combustibleMaterials: null,
  ignitionSources: null,
  fireRiskEquipment: null,
  specificMeasures: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
}));
