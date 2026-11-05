import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const client = {
  id: clientId,
  legalName: 'Royal Hotel SRL',
  cui: '18452117',
  vatPayer: true,
  caenCode: '5510',
  tradeRegisterNumber: 'J22/1840/2006',
  countyCode: 'IS',
  locality: 'Iași',
  addressLine: 'Str. Palat nr. 4',
  legalRepresentativeName: null,
  declaredEmployeeCount: 42,
  currentEmployeeCount: 42,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-02T10:00:00+00:00',
  updatedAt: '2026-11-05T10:00:00+00:00',
  archivedAt: null,
};

function confirmedImport(
  id: string,
  confirmedAt: string,
  fields: {
    who: string | null;
    files: number;
    completed: boolean;
    parts: { part: string; status: string }[];
  }
) {
  const expiresAt = new Date(Date.parse(confirmedAt) + 14 * 86_400_000).toISOString();
  return {
    id,
    kind: 'client',
    status: 'confirmed',
    client: { id: clientId, legalName: client.legalName },
    intoExistingClient: fields.completed,
    companyName: client.legalName,
    companyCui: client.cui,
    sourceImportId: null,
    failureReason: null,
    fileCount: fields.files,
    createdBy: fields.who ? { id: `user-${id}`, fullName: fields.who } : null,
    createdAt: confirmedAt,
    startedAt: confirmedAt,
    readyAt: confirmedAt,
    failedAt: null,
    confirmedAt,
    expiresAt: null,
    people: null,
    uninvited: null,
    progress: null,
    libraryParts: fields.parts.map((part) => ({ ...part, expiresAt })),
  };
}

const latest = confirmedImport(
  '11111111-1111-4111-8111-111111111111',
  '2026-11-05T10:00:00+00:00',
  {
    who: 'Mircea Casapu',
    files: 50,
    completed: false,
    parts: [
      { part: 'instructions_ssm', status: 'to_review' },
      { part: 'instructions_su', status: 'confirmed' },
      { part: 'risk_evaluations', status: 'reading' },
    ],
  }
);
const finished = confirmedImport(
  '22222222-2222-4222-8222-222222222222',
  '2026-10-12T10:00:00+00:00',
  {
    who: 'Ana Pop',
    files: 8,
    completed: true,
    parts: [{ part: 'risk_evaluations', status: 'confirmed' }],
  }
);
const lapsed = confirmedImport(
  '33333333-3333-4333-8333-333333333333',
  '2026-09-02T10:00:00+00:00',
  {
    who: null,
    files: 1,
    completed: true,
    parts: [{ part: 'instructions_ssm', status: 'to_review' }],
  }
);

function mockClient(items: unknown[]) {
  mockApi((_init, url) => {
    if (url.pathname === '/imports') {
      return Response.json({ items: url.searchParams.get('status') === 'confirmed' ? items : [] });
    }
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client, canDelete: false });
    if (url.pathname === `/clients/${clientId}/document-details`) {
      return Response.json({
        documentDetails: {
          legalRepresentativeName: null,
          legalRepresentativeRole: null,
          legalRepresentativeEmployeeId: null,
          legalRepresentativeEmployee: null,
        },
      });
    }
    if (url.pathname.startsWith(`/clients/${clientId}/`)) return Response.json({ items: [] });
    return undefined;
  });
}

const confirmedLists = () =>
  requestsTo('/imports').filter(
    ([input]) => new URL(String(input)).searchParams.get('status') === 'confirmed'
  );

const mount = () => mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/detalii`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
});

afterEach(() => {
  disposeRuntimes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the client's imports from documents", () => {
  it('lists every confirmed client import, newest first, with who ran it, its files and what is left', async () => {
    mockClient([latest, finished, lapsed]);
    mount();

    const card = await screen.findByTestId('client-imports-card');
    expect(within(card).getByRole('heading', { name: 'Importuri din documente' })).toBeDefined();
    const rows = within(card).getAllByTestId('client-import-row');
    expect(rows.map((row) => row.getAttribute('data-outcome'))).toEqual([
      'open',
      'done',
      'expired',
    ]);
    expect(
      within(card)
        .getAllByTestId('client-import-date')
        .map((date) => date.textContent)
    ).toEqual(['5 noiembrie 2026', '12 octombrie 2026', '2 septembrie 2026']);
    expect(
      within(card)
        .getAllByTestId('client-import-status')
        .map((tag) => tag.textContent)
    ).toEqual(['2 de verificat, până pe 19 nov.', 'Încheiat', 'Instrucțiunile au expirat']);
    expect(rows[0]!.textContent).toContain('Mircea Casapu · client creat din documente');
    expect(rows[0]!.textContent).toContain('50 de fișiere');
    expect(rows[1]!.textContent).toContain('Ana Pop · client completat din documente');
    expect(rows[2]!.textContent).toContain('Client completat din documente');
    expect(rows[2]!.textContent).toContain('1 fișier');
    expect(within(rows[0]!).getByRole('link').getAttribute('href')).toBe(
      `/clienti/import/${latest.id}`
    );

    const lists = confirmedLists();
    expect(lists).toHaveLength(1);
    expect(Object.fromEntries(new URL(String(lists[0]![0])).searchParams)).toEqual({
      clientId,
      kind: 'client',
      status: 'confirmed',
    });
  });

  it('agrees with the reminder above it on what is left and by when', async () => {
    mockClient([latest, finished]);
    mount();

    const notice = await screen.findByTestId('client-library-tasks-notice');
    expect(notice.textContent).toContain('până pe 19 noiembrie');
    const card = screen.getByTestId('client-imports-card');
    expect(within(card).getAllByTestId('client-import-status')[0]!.textContent).toBe(
      '2 de verificat, până pe 19 nov.'
    );
  });

  it('is left out for a client with no import', async () => {
    mockClient([]);
    mount();

    await screen.findByTestId('client-details-page');
    await waitFor(() => expect(confirmedLists()).toHaveLength(1));
    expect(screen.queryByTestId('client-imports-card')).toBeNull();
  });
});
