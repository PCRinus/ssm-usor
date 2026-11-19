import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { clientId, clientRecord } from '@/test/records';

const client = clientRecord({
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
  createdAt: '2026-09-02T10:00:00+00:00',
  updatedAt: '2026-11-05T10:00:00+00:00',
});

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

afterEach(() => {
  vi.useRealTimers();
});

installFetchMock();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
});

describe("the client's imports from documents", () => {
  it('lists the confirmed client imports with nothing left to check, newest first, with who ran them and their files', async () => {
    mockClient([latest, finished, lapsed]);
    mount();

    const card = await screen.findByTestId('client-imports-card');
    expect(within(card).getByRole('heading', { name: 'Importuri din documente' })).toBeDefined();
    expect(
      within(card).getByRole('link', { name: 'Ajutor: Importuri din documente' })
    ).toBeDefined();
    const rows = within(card).getAllByTestId('client-import-row');
    expect(rows.map((row) => row.getAttribute('data-outcome'))).toEqual(['done', 'expired']);
    expect(
      within(card)
        .getAllByTestId('client-import-date')
        .map((date) => date.textContent)
    ).toEqual(['12 octombrie 2026', '2 septembrie 2026']);
    expect(
      within(card)
        .getAllByTestId('client-import-status')
        .map((tag) => tag.textContent)
    ).toEqual(['Încheiat', 'Instrucțiunile au expirat']);
    expect(rows[0]!.textContent).toContain('Ana Pop · client completat din documente · 8 fișiere');
    expect(rows[1]!.textContent).toContain('Client completat din documente · 1 fișier');
    expect(within(rows[0]!).getByRole('link').getAttribute('href')).toBe(
      `/clienti/import/${finished.id}`
    );

    const lists = confirmedLists();
    expect(lists).toHaveLength(1);
    expect(Object.fromEntries(new URL(String(lists[0]![0])).searchParams)).toEqual({
      clientId,
      kind: 'client',
      status: 'confirmed',
    });
  });

  it('puts an import with parts to check at the top, as a task with its deadline', async () => {
    mockClient([latest, finished]);
    mount();

    const panel = await screen.findByTestId('client-library-tasks-notice');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      '1 parte de verificat până pe 19 noiembrie'
    );
    expect(panel.textContent).toContain(
      'Din importul de pe 5 noiembrie 2026 · Mircea Casapu · 50 de fișiere'
    );
    expect(
      within(within(panel).getByTestId('client-library-tasks-parts'))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['IPSSM · de verificat', 'Evaluări de risc · se citește']);
    const open = within(panel).getByTestId('client-library-tasks-open');
    expect(open.textContent).toBe('Verifică importul');
    expect(open.getAttribute('href')).toBe(`/clienti/import/${latest.id}`);

    const page = screen.getByTestId('client-details-page');
    expect(page.firstElementChild).toBe(panel);
    const rows = within(screen.getByTestId('client-imports-card')).getAllByTestId(
      'client-import-row'
    );
    expect(rows.map((row) => row.getAttribute('data-outcome'))).toEqual(['done']);
  });

  it('names the earliest deadline when the parts end on different days', async () => {
    mockClient([
      {
        ...latest,
        libraryParts: [
          { part: 'instructions_ssm', status: 'to_review', expiresAt: '2026-11-21T10:00:00Z' },
          { part: 'risk_evaluations', status: 'to_review', expiresAt: '2026-11-12T10:00:00Z' },
        ],
      },
    ]);
    mount();

    const panel = await screen.findByTestId('client-library-tasks-notice');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      '2 părți de verificat până pe 12 noiembrie'
    );
  });

  it('says one part in the singular, and lists no import twice', async () => {
    mockClient([
      {
        ...latest,
        libraryParts: [
          { part: 'instructions_su', status: 'to_review', expiresAt: '2026-11-19T10:00:00Z' },
        ],
      },
    ]);
    mount();

    const panel = await screen.findByTestId('client-library-tasks-notice');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      '1 parte de verificat până pe 19 noiembrie'
    );
    expect(screen.queryByTestId('client-imports-card')).toBeNull();
  });

  it('counts only the parts ready to check, beside one still being read', async () => {
    mockClient([
      {
        ...latest,
        libraryParts: [
          { part: 'instructions_ssm', status: 'to_review', expiresAt: '2026-11-19T10:00:00Z' },
          { part: 'risk_evaluations', status: 'reading', expiresAt: '2026-11-12T10:00:00Z' },
        ],
      },
    ]);
    mount();

    const panel = await screen.findByTestId('client-library-tasks-notice');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      '1 parte de verificat până pe 19 noiembrie'
    );
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['IPSSM · de verificat', 'Evaluări de risc · se citește']);
  });

  it.each([
    ['reading', 'Evaluări de risc · se citește'],
    ['failed', 'Evaluări de risc · nu s-a putut citi'],
  ])('claims nothing is ready to check while the only part is %s', async (status, line) => {
    mockClient([
      {
        ...latest,
        libraryParts: [{ part: 'risk_evaluations', status, expiresAt: '2026-11-19T10:00:00Z' }],
      },
    ]);
    mount();

    const panel = await screen.findByTestId('client-library-tasks-notice');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      'Ce mai ai de făcut până pe 19 noiembrie'
    );
    expect(panel.textContent).not.toContain('de verificat');
    expect(within(panel).getByRole('listitem').textContent).toBe(line);
  });

  it('is left out for a client with no import', async () => {
    mockClient([]);
    mount();

    await screen.findByTestId('client-details-page');
    await waitFor(() => expect(confirmedLists()).toHaveLength(1));
    expect(screen.queryByTestId('client-imports-card')).toBeNull();
    expect(screen.queryByTestId('client-library-tasks-notice')).toBeNull();
  });
});
