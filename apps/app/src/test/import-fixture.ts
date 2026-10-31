import type { BillingCreditsUsage } from '@ssm-usor/contracts';
import { vi } from 'vitest';

import { activeSubscription, summaryOf as subscriptionSummaryOf } from './billing-fixture';

export const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
export const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

let fileNumber = 0;

export function importFile(overrides: Record<string, unknown> = {}) {
  fileNumber += 1;
  const name = (overrides.fileName as string | undefined) ?? `Fisier ${fileNumber}.docx`;
  return {
    id: `f0000000-0000-4000-8000-${String(fileNumber).padStart(12, '0')}`,
    uploadPath: `dosar-ssm.zip/${name}`,
    fileName: name,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1000,
    state: 'read',
    documentKind: 'decision',
    reason: null,
    companyName: null,
    companyCui: null,
    pageCount: 2,
    isScan: false,
    hasDerived: false,
    ...overrides,
  };
}

export function importDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: importId,
    kind: 'client',
    status: 'reading',
    client: null,
    intoExistingClient: false,
    companyName: 'Brutăria Spicul Auriu SRL',
    companyCui: '31458207',
    sourceImportId: null,
    failureReason: null,
    fileCount: 0,
    createdBy: { id: 'user-one', fullName: 'Radu Pop' },
    createdAt: '2026-10-28T09:00:00+00:00',
    startedAt: '2026-10-28T09:01:00+00:00',
    readyAt: null,
    failedAt: null,
    confirmedAt: null,
    version: 0,
    files: [] as unknown[],
    progress: { files: 0, prepared: 0, scans: 0, scansRead: 0 },
    otherCompanies: [] as unknown[],
    registeredCompany: null,
    changes: null,
    blockers: [] as unknown[],
    proposalDroppedAt: null,
    proposal: null,
    ...overrides,
  };
}

export const summaryOf = (detail: ReturnType<typeof importDetail>) => {
  const { files, ...rest } = detail;
  return {
    id: rest.id,
    kind: rest.kind,
    status: rest.status,
    client: rest.client,
    intoExistingClient: rest.intoExistingClient,
    companyName: rest.companyName,
    companyCui: rest.companyCui,
    sourceImportId: rest.sourceImportId,
    failureReason: rest.failureReason,
    fileCount: files.length,
    createdBy: rest.createdBy,
    createdAt: rest.createdAt,
    startedAt: rest.startedAt,
    readyAt: rest.readyAt,
    failedAt: rest.failedAt,
    confirmedAt: rest.confirmedAt,
  };
};

export const meResponse = {
  user: { id: 'user-one', email: 'review@example.test' },
  profile: { fullName: 'Radu Pop', professionalTitle: null },
  membership: {
    organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Prevent SSM Consult' },
    role: 'owner',
  },
};

export const meWithCredits = (
  credits: Partial<BillingCreditsUsage> = {},
  subscription = subscriptionSummaryOf(activeSubscription({ interval: 'month' }))
) => ({
  ...meResponse,
  subscription,
  creditsThisMonth: {
    used: 230,
    included: 1500,
    allowance: 1500,
    granted: 0,
    shortfall: 0,
    left: 1270,
    giftLeft: 7840,
    giftPending: 0,
    period: 'month',
    periodStart: '2026-10-14T08:00:00.000Z',
    periodEnd: '2026-11-14T08:00:00.000Z',
    state: 'ok' as BillingCreditsUsage['state'],
    ...credits,
  },
});

export type Route = (
  init: RequestInit | undefined,
  url: URL
) => Response | Promise<Response> | undefined;

export const fetchMock = vi.fn<typeof fetch>();

export function mockApi(route: Route) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const answer = route(init, url);
    if (answer) return answer;
    if (url.pathname === '/me') return Response.json(meResponse);
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url.pathname}`);
  });
}

export const requestsTo = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

export const bodyOf = (pathname: string, method: string, index = 0) =>
  JSON.parse(String(requestsTo(pathname, method)[index]?.[1]?.body)) as unknown;

const src = (file: string, quote: string) => [{ file, quote }];
const one = (value: string | number, file = 'dosar-ssm.zip/Decizie 1.docx') => ({
  options: [{ value, sources: src(file, String(value)), otherCompanyName: null }],
});
const none = { options: [] };

export function proposalFixture() {
  return {
    client: {
      legalName: one('Brutăria Spicul Auriu SRL'),
      cui: one('31458207'),
      tradeRegisterNumber: one('J32/412/2013'),
      caenCode: one('1071'),
      countyCode: one('SB'),
      locality: one('Sibiu'),
      addressLine: one('Str. Morilor nr. 14'),
      legalRepresentativeName: {
        options: [
          {
            value: 'Ioana Mureșan',
            sources: src('dosar-ssm.zip/Decizie 1.docx', 'Ioana Mureșan'),
            otherCompanyName: null,
          },
          {
            value: 'Dorin Mureșan',
            sources: src('Contract prestari SSM 2019.pdf', 'Dorin Mureșan'),
            otherCompanyName: null,
          },
        ],
      },
      legalRepresentativeRole: one('administrator'),
      contactName: none,
      contactPhone: one('0269 214 377', 'Contract prestari SSM 2019.pdf'),
      contactEmail: {
        options: [
          {
            value: 'office@lactate.ro',
            sources: src('dosar-ssm.zip/Fise post.doc', 'office@lactate.ro'),
            otherCompanyName: 'Lactate Câmpia SRL',
          },
        ],
      },
    },
    trainingSchedule: {
      periodicTrainingMinutes: none,
      administrativeTrainingIntervalMonths: one(12),
      workerTrainingIntervalMonths: one(6),
      trainingFirstMonth: none,
      trainingDayFrom: none,
      trainingDayTo: none,
    },
    fireSafety: {
      periodicTrainingHours: none,
      administrativeTrainingIntervalMonths: none,
      workerTrainingIntervalMonths: none,
      smokingPolicy: one('designated_places'),
      smokingPlace: one('curte'),
      wasteContractor: {
        options: [
          { value: 'Salubris SA', sources: src('a.pdf', 'Salubris SA'), otherCompanyName: null },
          { value: 'Eco Sud SRL', sources: src('b.pdf', 'Eco Sud SRL'), otherCompanyName: null },
        ],
      },
    },
    workplaces: [
      {
        id: 'workplace-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Str. Morilor nr. 14'),
        otherCompanyName: null,
        name: 'Sediu',
        countyCode: 'SB',
        locality: 'Sibiu',
        addressLine: 'Str. Morilor nr. 14',
        isRegisteredOffice: true,
        activity: 'Brutărie',
        rooms: ['Laborator', 'Magazin'],
      },
    ],
    jobPositions: [
      {
        id: 'position-1',
        sources: src('dosar-ssm.zip/Fise post.doc', 'Brutar'),
        otherCompanyName: null,
        name: 'Brutar',
        staffCategory: 'execution',
        trainingIntervalMonths: null,
        workZone: 'Laborator',
        activities: 'Frământare și coacere',
        managementOnly: false,
      },
      {
        id: 'position-2',
        sources: src('dosar-ssm.zip/Fise post.doc', 'Stivuitorist'),
        otherCompanyName: 'Lactate Câmpia SRL',
        name: 'Stivuitorist',
        staffCategory: 'execution',
        trainingIntervalMonths: null,
        workZone: null,
        activities: 'Conduce motostivuitorul',
        managementOnly: false,
      },
    ],
    responsiblePersons: [
      {
        id: 'person-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Radu Lazăr'),
        otherCompanyName: null,
        fullName: 'Radu Lazăr',
        jobTitle: 'Brutar',
        roles: ['workers_representative', 'first_aid'],
        workplace: { name: null, id: null },
      },
    ],
    fireEquipment: [
      {
        id: 'extinguisher-1',
        sources: src('b.pdf', 'stingătoare P6'),
        otherCompanyName: null,
        workplace: { name: 'Sediu', id: 'workplace-1' },
        room: 'Laborator',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        count: 6,
      },
    ],
    fireInstallations: [],
    protectiveEquipment: [],
    employees: [
      {
        id: 'employee-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Radu Lazăr'),
        otherCompanyName: null,
        role: 'workers_representative',
        lastName: 'Lazăr',
        firstName: 'Radu',
        cnp: null,
        birthDate: null,
        jobTitle: 'Brutar',
        hiredAt: null,
      },
    ],
    notes: [],
    flags: [],
  };
}

export const readyBlockers = [
  { path: 'client.legalRepresentativeName', code: 'choice' },
  { path: 'fireSafety.wasteContractor', code: 'choice' },
  { path: 'employees.0.hiredAt', code: 'missing' },
];

export function readyDetail(overrides: Record<string, unknown> = {}) {
  return importDetail({
    status: 'ready',
    readyAt: '2026-10-28T09:20:00+00:00',
    version: 3,
    files: [
      importFile({ fileName: 'Decizie 1.docx' }),
      importFile({ fileName: 'Fise post.doc', mimeType: 'application/msword', hasDerived: true }),
      importFile({
        fileName: 'Contract prestari SSM 2019.pdf',
        uploadPath: 'Contract prestari SSM 2019.pdf',
        mimeType: 'application/pdf',
      }),
    ],
    registeredCompany: {
      cui: '31458207',
      legalName: 'BRUTĂRIA SPICUL AURIU SRL',
      vatPayer: true,
      inactive: false,
    },
    blockers: readyBlockers,
    proposal: proposalFixture(),
    ...overrides,
  });
}
