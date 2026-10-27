import { vi } from 'vitest';

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

export type Route = (init: RequestInit | undefined, url: URL) => Response | undefined;

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
