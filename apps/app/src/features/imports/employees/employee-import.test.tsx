import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportDetail } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  bakerId,
  clientId,
  employeeDetail,
  importId,
  positions,
  sheetRow,
  workplaces,
} from '@/test/employee-import-fixture';
import { bodyOf, fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { noTests, untrained } from '@/test/training-fixture';

const client = {
  id: clientId,
  legalName: 'Brutăria Spicul Auriu SRL',
  cui: '31458207',
  vatPayer: true,
  caenCode: '1071',
  tradeRegisterNumber: 'J32/412/2013',
  countyCode: 'SB',
  locality: 'Sibiu',
  addressLine: 'Str. Morilor nr. 14',
  legalRepresentativeName: null,
  declaredEmployeeCount: 0,
  currentEmployeeCount: 0,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const foundSheets = {
  items: [
    {
      importId: 'a0000000-0000-4000-8000-000000000001',
      confirmedAt: '2026-10-27T09:00:00+00:00',
      sheets: [1, 2].map((index) => ({
        id: `a0000000-0000-4000-8000-00000000010${index}`,
        clientFileId: `a0000000-0000-4000-8000-00000000020${index}`,
        uploadPath: `fise-spicul-auriu.zip/IMG_${index}.HEIC`,
        fileName: `IMG_${index}.HEIC`,
        mimeType: 'image/heic',
        sizeBytes: 2_000_000,
      })),
    },
  ],
  total: 2,
};

const openImport = {
  id: importId,
  kind: 'employees',
  status: 'ready',
  client: { id: clientId, legalName: client.legalName },
  intoExistingClient: true,
  companyName: null,
  companyCui: null,
  sourceImportId: null,
  failureReason: null,
  fileCount: 98,
  createdBy: null,
  createdAt: '2026-10-29T10:00:00+00:00',
  startedAt: '2026-10-29T10:01:00+00:00',
  readyAt: '2026-10-29T10:20:00+00:00',
  failedAt: null,
  confirmedAt: null,
  expiresAt: '2026-11-13T10:00:00+00:00',
  people: { total: 40, toCheck: 16, checked: 23, setAside: 1 },
};

const confirmedAt = '2026-10-30T09:15:00+00:00';

type Options = {
  detail?: ImportDetail;
  found?: typeof foundSheets;
  open?: unknown[];
  confirm?: () => Response;
  invitees?: unknown[];
  confirmed?: unknown[];
  employees?: unknown[];
  clientWorkplaces?: unknown[];
};

function mockEmployeeImport({
  detail = employeeDetail(),
  found = { items: [], total: 0 },
  open = [],
  confirm,
  invitees = [],
  confirmed,
  employees = [],
  clientWorkplaces = workplaces,
}: Options = {}) {
  let version = detail.version;
  let confirmedHere: unknown[] = [];
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: { ...detail, version } });
    }
    if (url.pathname === `/imports/${importId}/employee-changes`) {
      version += 1;
      return Response.json({ version });
    }
    if (url.pathname === `/imports/${importId}/confirm`) {
      const response = confirm?.() ?? Response.json({ clientId, fileCount: 0, employeeIds: [] });
      if (response.ok) {
        confirmedHere = [{ ...openImport, status: 'confirmed', confirmedAt, expiresAt: null }];
      }
      return response;
    }
    if (url.pathname === `/imports/${importId}/source`) {
      const file = url.searchParams.get('file')!;
      return Response.json({
        fileId: file,
        uploadPath: file,
        fileName: file,
        page: null,
        original: { url: `https://storage.test/${file}` },
        derived: { url: `https://storage.test/derived/${file}` },
        text: null,
        pages: null,
        match: null,
        expiresInSeconds: 300,
      });
    }
    if (url.pathname === '/imports') {
      return Response.json({
        items: url.searchParams.get('status') === 'confirmed' ? (confirmed ?? confirmedHere) : open,
      });
    }
    if (url.pathname === `/clients/${clientId}`) {
      const currentEmployeeCount = confirmedHere.length > 0 ? 1 : client.currentEmployeeCount;
      return Response.json({ client: { ...client, currentEmployeeCount }, canDelete: false });
    }
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions });
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({ items: clientWorkplaces });
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) return Response.json(found);
    if (/^\/clients\/[^/]+\/imports\/[^/]+\/portal-invitees$/.test(url.pathname)) {
      return Response.json({ items: invitees });
    }
    if (url.pathname.startsWith(`/clients/${clientId}/files/`)) {
      return Response.json({}, { status: 404 });
    }
    if (url.pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: employees, page: 1, pageSize: 25, total: employees.length });
    }
    return undefined;
  });
}

const baker = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  lastName: 'Popa',
  firstName: 'Maria',
  employeeNumber: null,
  email: null,
  phone: null,
  jobTitle: 'Brutar',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Brutar' },
  hiredAt: '2024-03-01',
  status: 'active',
  terminatedAt: null,
  training: untrained,
  tests: noTests,
  workplace: null,
  createdAt: '2026-10-30T10:00:00+00:00',
  updatedAt: '2026-10-30T10:00:00+00:00',
};

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

const unsignedAnnualTest = sheetRow('r9', {
  heldOn: '2025-03-04',
  testOnly: true,
  flags: ['unsigned'],
  proposedIncluded: false,
  test: {
    test: 'annual',
    takenOn: '2025-03-04',
    examinerName: 'Barbu Ionuț',
    examinerJobTitle: 'inspector SSM',
    verified: true,
    inApp: false,
  },
});

function popWith(fields: Record<string, string>, rows: unknown[] = []) {
  const base = employeeDetail();
  const proposal = base.employees!.proposal;
  return employeeDetail({
    employees: {
      ...base.employees!,
      proposal: {
        ...proposal,
        pages: proposal.pages.map((page) =>
          page.id === 'p3' ? { ...page, rows: [...page.rows, ...rows] } : page
        ),
        people: proposal.people.map((each) =>
          each.id === 'pop'
            ? {
                ...each,
                fields: {
                  ...each.fields,
                  ...Object.fromEntries(
                    Object.entries(fields).map(([field, value]) => [
                      field,
                      { options: [{ value, pageIds: ['p3'] }] },
                    ])
                  ),
                },
              }
            : each
        ),
      },
    },
  });
}

const importPath = `/clienti/${clientId}/angajati/import/${importId}`;

const saved = (index: number) =>
  bodyOf(`/imports/${importId}/employee-changes`, 'PUT', index) as {
    version: number;
    changes: {
      people: Record<string, { state?: string; cnpCorrection?: boolean }>;
      jobTitles: Record<string, { jobPositionId: string }>;
      rows: Record<string, { test?: boolean }>;
    };
  };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("the client's Lucrători tab", () => {
  it('offers the sheets found in the documentation while some are untaken, and new photos', async () => {
    mockEmployeeImport({ found: foundSheets, employees: [baker] });
    mount(`/clienti/${clientId}/angajati`);
    expect((await screen.findByTestId('employees-import-found')).textContent).toBe(
      'Importă din fișele găsite în documentație (2 fotografii)'
    );
    expect(screen.getByTestId('employees-import').textContent).toBe('Importă din fotografii noi');
  });

  it('offers the found sheets in the start ways of an empty list, without the header buttons', async () => {
    mockEmployeeImport({ found: foundSheets });
    mount(`/clienti/${clientId}/angajati`);
    const ways = await screen.findByTestId('employees-start-ways');
    expect((await within(ways).findByTestId('employees-start-found')).textContent).toContain(
      'Ai deja 2 fotografii de fișe, din documentația importată pe 27 oct.'
    );
    expect(within(ways).getByTestId('employees-start-import').textContent).toContain(
      'Importă din fotografii noi'
    );
    expect(screen.queryByTestId('employees-import-found')).toBeNull();
    expect(screen.queryByTestId('employees-import')).toBeNull();
    expect(screen.queryByTestId('employees-add')).toBeNull();
  });

  it('offers one import from the sheets when none were found', async () => {
    mockEmployeeImport({ employees: [baker] });
    mount(`/clienti/${clientId}/angajati`);
    expect((await screen.findByTestId('employees-import')).textContent).toBe(
      'Importă din fișele de instruire'
    );
    expect(screen.queryByTestId('employees-import-found')).toBeNull();
  });

  it('shows the open import with its progress, its expiry and the way back to it', async () => {
    mockEmployeeImport({ open: [openImport] });
    mount(`/clienti/${clientId}/angajati`);
    const card = await screen.findByTestId('employee-import-card');
    expect(within(card).getByRole('heading').textContent).toBe(
      'Import din fișe: 23 din 40 verificați'
    );
    expect(within(card).getByTestId('employee-import-expires').textContent).toBe(
      'Se păstrează până pe 13 nov. dacă nu mai lucrezi la el.'
    );
    expect(within(card).getByTestId('employee-import-open').getAttribute('href')).toBe(importPath);
  });

  it('opens the upload with the found sheets already added', async () => {
    mockEmployeeImport({ found: foundSheets });
    mount(`/clienti/${clientId}/angajati`);
    await userEvent.setup().click(await screen.findByTestId('employees-start-found'));
    const dialog = await screen.findByTestId('employee-upload-dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        '2 fotografii de citit'
      )
    );
    expect(within(dialog).queryByTestId('employee-upload-found')).toBeNull();
  });
});

describe('reading the photographs', () => {
  it('counts the photographs read one by one, and says the page can be left', async () => {
    mockEmployeeImport({
      detail: employeeDetail({
        status: 'reading',
        employees: null,
        people: null,
        progress: { files: 5, prepared: 5, scans: 5, scansRead: 2 },
      }),
    });
    mount(importPath);
    const steps = await screen.findByTestId('employee-processing-steps');
    expect(steps.textContent).toContain('Fotografii citite: 2 din 5.');
    expect(screen.getByTestId('employee-processing-can-leave').textContent).toContain(
      'Importul rămâne pe pagina Lucrători a clientului'
    );
    expect(screen.getAllByTestId('employee-processing-photo')).toHaveLength(5);
  });
});

describe('the people hub', () => {
  it('asks once for the post of a title the client lacks and saves it for everyone', async () => {
    mockEmployeeImport();
    mount(importPath);
    await screen.findByTestId('employee-hub');
    expect(screen.getByTestId('employee-hub-progress').textContent).toContain('0 din 3');
    const title = screen.getByTestId('employee-hub-title');
    expect(title.textContent).toContain('Ajutor brutar');
    expect(within(title).getByTestId('group-status').textContent).toBe('De hotărât');
    expect(screen.getByTestId('employee-hub-titles-exact').textContent).toContain('Vânzător 1');

    await userEvent.setup().click(await within(title).findByTestId('group-use'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0)).toMatchObject({
      version: 4,
      changes: { jobTitles: { 'title-helper': { jobPositionId: bakerId } } },
    });
  });

  it('never offers an office where no activity takes place as a workplace', async () => {
    const [shop] = workplaces as [(typeof workplaces)[number]];
    mockEmployeeImport({
      clientWorkplaces: [
        ...workplaces,
        {
          ...shop,
          id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
          name: 'Sediu social',
          isRegisteredOffice: true,
          officeHasActivity: false,
        },
      ],
    });
    mount(importPath);
    const row = await screen.findByTestId('employee-hub-workplace');
    const picker = within(row).getByRole('combobox');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Magazin Str. Lungă 5', 'Laborator producție']);
  });

  it('shows the cost of reading the photographs when the API serves it', async () => {
    const scanning = { costUsd: 0.1, inputTokens: 41000, cachedInputTokens: 0, outputTokens: 9800 };
    mockEmployeeImport({
      detail: employeeDetail({
        usage: { ...scanning, readCharacters: null, bySteps: { scanning } },
      }),
    });
    mount(importPath);
    expect((await screen.findByTestId('import-usage')).textContent).toBe(
      'Depanare: cost 0,10\u00a0$ · 41.000 tokeni intrare (0 din cache) · 9.800 ieșire · scanare 0,10\u00a0$'
    );
  });

  it('shows no cost when the API serves none', async () => {
    mockEmployeeImport();
    mount(importPath);
    await screen.findByTestId('employee-hub');
    expect(screen.queryByTestId('import-usage')).toBeNull();
  });

  it('lists those with something to decide before those not yet opened', async () => {
    mockEmployeeImport();
    mount(importPath);
    await screen.findByTestId('employee-hub');
    const groups = screen.getAllByTestId('employee-hub-group');
    expect(within(groups[0]!).getByRole('heading').textContent).toBe('Cu ceva de hotărât 1');
    expect(within(groups[0]!).getByText('Toma Andrei')).toBeTruthy();
    expect(within(groups[1]!).getByRole('heading').textContent).toBe('Încă nedeschise 2');
    expect(screen.getByTestId('employee-hub-unplaced').textContent).toContain(
      'O fotografie neatribuită'
    );
  });
});

describe('the person page', () => {
  it('checks a person with nothing to decide on moving to the next', async () => {
    mockEmployeeImport();
    const runtime = mount(`${importPath}/pop`);
    await screen.findByTestId('person-page');
    expect(screen.getByTestId('person-state').textContent).toBe('De verificat');
    expect(screen.queryByTestId('person-decisions')).toBeNull();
    expect(screen.getByTestId('person-no-contact').textContent).toBe(
      'Fără email sau telefon. Îl adaugi când îl inviți în portal.'
    );
    await userEvent.setup().click(screen.getByTestId('person-next'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(`${importPath}/lazar`));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people).toEqual({ pop: { state: 'checked' } });
  });

  it('sets a person aside with the one switch beside the name, and takes them back', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    await screen.findByTestId('person-page');
    expect(screen.queryByRole('button', { name: 'Lasă-l deoparte' })).toBeNull();
    expect(screen.getByTestId('person-state').textContent).toBe('De verificat');

    await user.click(screen.getByRole('switch', { name: 'Inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.pop).toEqual({ state: 'set_aside' });
    expect(screen.getByTestId('person-page').dataset.state).toBe('set_aside');
    expect(screen.queryByTestId('person-state')).toBeNull();
    expect(screen.getByTestId('person-include-word').textContent).toBe('Nu e inclus');

    await user.click(screen.getByRole('switch', { name: 'Nu e inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(2)
    );
    expect(saved(1).changes.people.pop?.state).toBeUndefined();
    expect(screen.getByTestId('person-state').textContent).toBe('De verificat');
    expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Inclus: Pop Elena' }));
  });

  it('takes a leaver with the same switch beside the name, which the leaving card explains', async () => {
    mockEmployeeImport({ detail: popWith({ leftOn: '2025-06-30' }) });
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const card = await screen.findByTestId('person-decide-leaver');
    expect(within(card).queryByRole('switch')).toBeNull();
    expect(screen.getAllByRole('switch', { name: /: Pop Elena$/ })).toHaveLength(1);
    expect(screen.getByTestId('person-leaver-note').textContent).toContain(
      'Nu îl preluăm decât dacă pornești comutatorul de lângă nume'
    );

    await user.click(screen.getByRole('switch', { name: 'Nu e inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.pop).toEqual({ included: true });
    expect(screen.getByTestId('person-leaver-note').textContent).toContain(
      'Îl preluăm ca fost lucrător'
    );

    await user.click(screen.getByRole('switch', { name: 'Inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(2)
    );
    expect(saved(1).changes.people.pop).toEqual({ state: 'set_aside' });
  });

  it('keeps an annual test the sheet proposed off open with its reason', async () => {
    mockEmployeeImport({ detail: popWith({}, [unsignedAnnualTest]) });
    mount(`${importPath}/pop`);
    const test = await screen.findByTestId('person-annual-test');
    expect(
      within(test).getByRole('switch', { name: /^Nu e inclus: Testul anual SSM, la / })
    ).toBeTruthy();
    expect(within(test).getByRole('button', { name: /^Schimbă/ })).toBeTruthy();
    expect(test.textContent).toContain('promovat pe fișă');
  });

  it('shows a periodic row that records the annual test as the training and its test', async () => {
    const trainedAndTested = sheetRow('r9', {
      domain: 'su',
      heldOn: '2025-06-10',
      material: 'IPSU art. 97–187; prezentarea riscurilor; Testare',
      test: {
        test: 'annual',
        takenOn: '2025-06-10',
        examinerName: 'Barbu Ionuț',
        examinerJobTitle: 'Cadru tehnic PSI',
        verified: true,
        inApp: false,
      },
    });
    mockEmployeeImport({ detail: popWith({}, [trainedAndTested]) });
    mount(`${importPath}/pop`);
    const su = await screen.findByTestId('person-trainings-su');
    expect(
      within(su).getByRole('switch', { name: /^Inclusă: Instruirea periodică din / })
    ).toBeTruthy();
    const test = within(su).getByTestId('person-annual-test');
    expect(
      within(test).getByRole('switch', { name: /^Inclus: Testul anual SU, la / })
    ).toBeTruthy();
    expect(within(test).getByTestId('person-annual-test-with-training').textContent).toContain(
      'în rândul instruirii periodice din aceeași zi'
    );
  });

  it('collapses a training switched off to one line with no buttons, and opens it again', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const row = () => screen.getByTestId('person-training-row');
    await screen.findByTestId('person-page');
    expect(within(row()).getByRole('button', { name: /^Schimbă/ })).toBeTruthy();

    await user.click(
      within(row()).getByRole('switch', { name: /^Inclusă: Instruirea periodică din / })
    );

    expect(row().textContent).toMatch(/^Instruirea periodică din .+Nu e inclusă$/);
    expect(within(row()).queryAllByRole('button')).toHaveLength(0);
    expect(document.activeElement).toBe(within(row()).getByRole('switch'));
    await user.click(
      within(row()).getByRole('switch', { name: /^Nu e inclusă: Instruirea periodică din / })
    );
    expect(within(row()).getByRole('button', { name: /^Schimbă/ })).toBeTruthy();
    expect(document.activeElement).toBe(
      within(row()).getByRole('switch', { name: /^Inclusă: Instruirea periodică din / })
    );
  });

  it('collapses a verified hiring test switched off to one line, and opens it again', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const test = async () => screen.findByTestId('person-test');
    expect((await test()).textContent).toContain('Testul la angajare: verificat pe fișă');

    await user.click(
      within(await test()).getByRole('switch', { name: /^Inclus: Testul la angajare / })
    );
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.rows.r1).toEqual({ test: false });
    expect((await test()).textContent).toMatch(/^Testul la angajare .+Nu e inclus$/);
    expect(within(await test()).queryAllByRole('button')).toHaveLength(0);
    expect(within(await test()).queryAllByRole('textbox')).toHaveLength(0);
    expect(document.activeElement).toBe(within(await test()).getByRole('switch'));

    await user.click(
      within(await test()).getByRole('switch', { name: /^Nu e inclus: Testul la angajare / })
    );
    expect((await test()).textContent).toContain('Testul la angajare: verificat pe fișă');
    expect(document.activeElement).toBe(
      within(await test()).getByRole('switch', { name: /^Inclus: Testul la angajare / })
    );
  });

  it('marks the names, job title and hire date a new employee needs, and the rest optional', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const label = (text: string) =>
      screen.getByTestId('person-fields-dialog').querySelector(`label[for="person-field-${text}"]`)
        ?.textContent;

    await user.click(
      within(await screen.findByTestId('person-fields-personal')).getByRole('button', {
        name: /Schimbă/,
      })
    );
    expect(label('lastName')).toBe('Nume*(obligatoriu)');
    expect(label('firstName')).toBe('Prenume*(obligatoriu)');
    expect(label('cnp')).toBe('CNP(opțional)');
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await user.click(
      within(screen.getByTestId('person-fields-employment')).getByRole('button', {
        name: /Schimbă/,
      })
    );
    expect(label('jobTitle')).toContain('(obligatoriu)');
    expect(label('hiredAt')).toContain('(obligatoriu)');
    expect(label('employeeNumber')).toContain('(opțional)');
  });

  it('names what is left, takes the corrected CNP and keeps the person to check', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const decisions = await screen.findByTestId('person-decisions');
    await waitFor(() =>
      expect(within(decisions).getByRole('heading').textContent).toBe('4 lucruri de rezolvat aici')
    );
    await user.click(
      within(screen.getByTestId('person-decide-cnp')).getByTestId('person-cnp-correction')
    );
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.toma).toEqual({ cnpCorrection: true });
    expect(screen.getByTestId('person-decisions').textContent).toContain(
      '3 lucruri de rezolvat aici'
    );

    await user.click(screen.getByTestId('person-next'));
    await waitFor(() => expect(screen.getByTestId('person-page').dataset.state).toBe('to_check'));
    expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1);
  });

  it('names each photograph under the sheet by its place and kind, in full on hover', async () => {
    mockEmployeeImport();
    mount(`${importPath}/toma`);
    const strip = within(await screen.findByTestId('person-photos')).getByRole('group');
    const tiles = within(strip).getAllByRole('button');
    expect(tiles.map((tile) => tile.textContent)).toEqual(['1. SSM, față', '2. SSM, periodice']);
    expect(within(tiles[1]!).getByText('2. SSM, periodice').title).toBe('2. SSM, periodice');
  });

  it('opens the photograph beside the values large, on a click or with its button', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const photos = await screen.findByTestId('person-photos');
    await user.click(await within(photos).findByTestId('sheet-page-image'));
    let preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('1 din 2');
    expect((await within(preview).findByRole<HTMLImageElement>('img')).src).toBe(
      'https://storage.test/derived/IMG_p1.jpg'
    );
    expect(within(preview).queryByTestId('photo-enlarge')).toBeNull();
    await user.click(within(preview).getByTestId('photo-preview-next'));
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 2');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());

    within(photos).getByTestId('photo-enlarge').focus();
    await user.keyboard('{Enter}');
    preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 2');
  });

  it('takes a value of its own where the sheets disagree, and checks the person with it', async () => {
    const base = employeeDetail();
    const proposal = base.employees!.proposal;
    mockEmployeeImport({
      detail: employeeDetail({
        employees: {
          ...base.employees!,
          proposal: {
            ...proposal,
            people: proposal.people.map((each) =>
              each.id === 'pop'
                ? {
                    ...each,
                    fields: {
                      ...each.fields,
                      hiredAt: {
                        options: [
                          { value: '2023-05-02', pageIds: ['p3'] },
                          { value: '2023-02-05', pageIds: ['p3'] },
                        ],
                      },
                    },
                  }
                : each
            ),
          },
        },
      }),
    });
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const card = await screen.findByTestId('person-decide-choice-hiredAt');
    expect(screen.getByTestId('person-decisions').textContent).toContain(
      'Data angajării: fișele scriu valori diferite'
    );
    await user.click(within(card).getByTestId('person-choice-other'));
    await user.type(within(card).getByLabelText('Data angajării'), '01.04.2023');
    await user.click(within(card).getByTestId('person-choice-other-use'));
    await waitFor(() => expect(screen.queryByTestId('person-decisions')).toBeNull());
    expect(screen.getByTestId('person-fields-employment').textContent).toContain('01.04.2023');

    await user.click(screen.getByTestId('person-next'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT').length).toBeGreaterThan(0)
    );
    await waitFor(() =>
      expect(
        saved(requestsTo(`/imports/${importId}/employee-changes`, 'PUT').length - 1).changes.people
          .pop
      ).toEqual({ state: 'checked', fields: { hiredAt: { value: '2023-04-01' } } })
    );
  });

  it('chooses a post on Enter, not on an arrow key moving through the options', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const card = await screen.findByTestId('person-decide-post');
    const [first] = await within(card).findAllByTestId('person-post-option');
    first!.focus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(0);
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.jobTitles).toEqual({ 'title-helper': { jobPositionId: bakerId } });
  });

  it('asks whether a name-only match is the employee, and makes a declined one new', async () => {
    const base = employeeDetail();
    const proposal = base.employees!.proposal;
    mockEmployeeImport({
      detail: employeeDetail({
        employees: {
          ...base.employees!,
          proposal: {
            ...proposal,
            people: proposal.people.map((each) =>
              each.id === 'lazar'
                ? { ...each, existing: { ...each.existing!, matchedBy: 'name_only' } }
                : each
            ),
          },
        },
      }),
    });
    const user = userEvent.setup();
    mount(`${importPath}/lazar`);
    const card = await screen.findByTestId('person-decide-match');
    expect(within(card).getByRole('heading').textContent).toBe('Este același lucrător?');
    await user.click(within(card).getByTestId('person-match-decline'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.lazar).toEqual({ existing: false });
    expect(screen.getByTestId('person-declined-notice').textContent).toContain(
      'Îl creăm ca lucrător nou, nu îl completăm pe Lazăr Radu din aplicație.'
    );
    expect(screen.getByTestId('person-decide-post')).toBeTruthy();
  });

  it("compares an existing employee's data with the app and keeps the app's by default", async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/lazar`);
    const existing = await screen.findByTestId('person-existing');
    expect(existing.textContent).toContain('Se adaugă 1');
    const differs = within(existing).getByTestId('person-existing-differs');
    expect(differs.textContent).toContain('Rămâne Str. Viitorului nr. 3, Sibiu');
    expect(differs.textContent).toContain('Pe fișă: Str. Fabricii nr. 21, Sibiu');
    expect(screen.getByTestId('person-trainings-ssm').textContent).toContain(
      'O instruire de pe fișă e deja în aplicație'
    );
    await user.click(within(differs).getByTestId('person-existing-take-sheet'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(bodyOf(`/imports/${importId}/employee-changes`, 'PUT')).toMatchObject({
      changes: { people: { lazar: { fields: { homeAddress: { option: 0, replace: true } } } } },
    });
  });
});

describe('confirming', () => {
  const partly = () =>
    employeeDetail({
      employees: {
        ...employeeDetail().employees!,
        changes: { people: { pop: { state: 'checked' }, lazar: { state: 'checked' } } },
      },
    });

  it('says what the reading used', async () => {
    mockEmployeeImport({
      detail: {
        ...partly(),
        credits: {
          used: 98,
          atStart: 98,
          scannedPages: 0,
          ownInstructions: 0,
          riskEvaluations: 0,
          refunded: false,
        },
      },
    });
    const user = userEvent.setup();
    mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    const dialog = await screen.findByTestId('employee-confirm-dialog');
    expect(within(dialog).getByTestId('import-credits-used').textContent).toBe(
      'Importul a folosit 98 de credite.'
    );
  });

  it('names the people left out and creates the checked ones, then shows them on the tab', async () => {
    mockEmployeeImport({ detail: partly() });
    const user = userEvent.setup();
    const runtime = mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    const dialog = await screen.findByTestId('employee-confirm-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(
      'Creezi lucrătorii fără cel neverificat?'
    );
    expect(within(dialog).getByTestId('employee-confirm-left').textContent).toContain(
      'Toma Andrei'
    );
    const submit = within(dialog).getByTestId('employee-confirm-submit');
    expect(submit.textContent).toBe('Creează un lucrător, fără cel neverificat');
    await user.click(submit);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/angajati`)
    );
    expect(bodyOf(`/imports/${importId}/confirm`, 'POST')).toEqual({ version: 4 });
    const card = await screen.findByTestId('employees-imported');
    expect(card.textContent).toContain('Un lucrător creat din fișe');
    expect(card.textContent).toContain('Lazăr Radu a fost completat');
    await waitFor(() => expect(screen.getByTestId('client-employee-count').textContent).toBe('1'));
  });

  const invitee = (
    index: number,
    lastName: string,
    portal: 'participant' | 'invited' | null = null,
    current = true
  ) => ({
    employeeId: `7c9e6679-7425-40de-944b-${String(index).padStart(12, '0')}`,
    lastName,
    firstName: 'Ana',
    position: 'Brutar',
    email: null,
    phone: null,
    current,
    portal,
  });

  async function confirmPartly(invitees: unknown[]) {
    mockEmployeeImport({ detail: partly(), invitees });
    const user = userEvent.setup();
    mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    await user.click(await screen.findByTestId('employee-confirm-submit'));
    return { user, card: await screen.findByTestId('employees-imported') };
  }

  it("offers to invite the import's people to the portal while some are left", async () => {
    const { user, card } = await confirmPartly([invitee(1, 'Lazăr'), invitee(2, 'Pop', 'invited')]);
    const invite = await within(card).findByTestId('employees-imported-invite');
    expect(invite.textContent).toBe('Invită în portal lucrătorii din fișe');
    await user.click(invite);
    expect(
      within(await screen.findByTestId('bulk-invite-dialog')).getByRole('heading', { level: 2 })
        .textContent
    ).toBe('Invită în portal lucrătorii din fișe');
    expect(requestsTo(`/clients/${clientId}/imports/${importId}/portal-invitees`)).not.toHaveLength(
      0
    );
  });

  it('offers no invitation once everyone current the import brought is invited or in the portal', async () => {
    const { card } = await confirmPartly([
      invitee(1, 'Lazăr', 'participant'),
      invitee(2, 'Pop', 'invited'),
      invitee(3, 'Toma', null, false),
    ]);
    await waitFor(() =>
      expect(requestsTo(`/clients/${clientId}/imports/${importId}/portal-invitees`)).toHaveLength(1)
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(card).queryByTestId('employees-imported-invite')).toBeNull();
    expect(card.textContent).toContain('Ce urmează: invită-i în portal');
  });

  const confirmedImport = {
    ...openImport,
    status: 'confirmed',
    confirmedAt,
    expiresAt: null,
    people: null,
    uninvited: 2,
  };
  const newerImportId = '5d6e7f80-1a2b-4c3d-8e4f-a5b6c7d8e9f0';
  const newerImport = {
    ...confirmedImport,
    id: newerImportId,
    confirmedAt: '2026-10-31T08:00:00+00:00',
    uninvited: 0,
  };

  it('keeps offering the invitation on a later visit, with the day of the import and who is left', async () => {
    mockEmployeeImport({
      confirmed: [confirmedImport],
      invitees: [
        invitee(1, 'Lazăr'),
        { ...invitee(2, 'Pop'), email: 'elena.pop@spiculauriu.ro' },
        invitee(3, 'Toma', 'participant'),
      ],
    });
    const user = userEvent.setup();
    mount(`/clienti/${clientId}/angajati`);
    const card = await screen.findByTestId('employees-imported');
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
      'Lucrători importați din fișe pe 30 oct.'
    );
    expect(card.textContent).toContain(
      '2 lucrători aduși de import nu sunt încă invitați în portal.'
    );
    expect(card.textContent).toContain(
      '1 lucrător nu are email sau telefon: le scrii în dialogul de invitare.'
    );
    await user.click(within(card).getByTestId('employees-imported-invite'));
    expect(await screen.findByTestId('bulk-invite-dialog')).toBeTruthy();
  });

  it('shows nothing on a later visit once nobody the imports brought is left to invite', async () => {
    mockEmployeeImport({
      confirmed: [newerImport, { ...confirmedImport, uninvited: 0 }],
      invitees: [invitee(1, 'Lazăr', 'invited'), invitee(2, 'Pop', null, false)],
    });
    mount(`/clienti/${clientId}/angajati`);
    await screen.findByTestId('employees-page');
    await waitFor(() =>
      expect(
        requestsTo('/imports').some(([input]) => String(input).includes('status=confirmed'))
      ).toBe(true)
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('employees-imported')).toBeNull();
  });

  it('offers an earlier import whose people are left to invite when the latest has nobody left', async () => {
    mockEmployeeImport({
      confirmed: [newerImport, confirmedImport],
      invitees: [invitee(1, 'Lazăr'), invitee(2, 'Pop')],
    });
    const user = userEvent.setup();
    mount(`/clienti/${clientId}/angajati`);
    const card = await screen.findByTestId('employees-imported');
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
      'Lucrători importați din fișe pe 30 oct.'
    );
    expect(requestsTo(`/clients/${clientId}/imports/${newerImportId}/portal-invitees`)).toEqual([]);
    await user.click(within(card).getByTestId('employees-imported-invite'));
    await screen.findByTestId('bulk-invite-dialog');
    await waitFor(() =>
      expect(
        requestsTo(`/clients/${clientId}/imports/${importId}/portal-invitees`).length
      ).toBeGreaterThan(1)
    );
  });

  it('offers the earlier import once the member hides the latest', async () => {
    mockEmployeeImport({
      confirmed: [{ ...newerImport, uninvited: 1 }, confirmedImport],
      invitees: [invitee(1, 'Lazăr')],
    });
    const user = userEvent.setup();
    mount(`/clienti/${clientId}/angajati`);
    const card = await screen.findByTestId('employees-imported');
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
      'Lucrători importați din fișe pe 31 oct.'
    );
    await user.click(within(card).getByTestId('employees-imported-hide'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('employees-imported')).getByRole('heading', { level: 3 })
          .textContent
      ).toBe('Lucrători importați din fișe pe 30 oct.')
    );
  });

  it('stays hidden for the import the member hid', async () => {
    mockEmployeeImport({ confirmed: [confirmedImport], invitees: [invitee(1, 'Lazăr')] });
    const user = userEvent.setup();
    mount(`/clienti/${clientId}/angajati`);
    await user.click(
      within(await screen.findByTestId('employees-imported')).getByTestId('employees-imported-hide')
    );
    expect(screen.queryByTestId('employees-imported')).toBeNull();
    cleanup();
    fetchMock.mockClear();
    mount(`/clienti/${clientId}/angajati`);
    await screen.findByTestId('employees-page');
    await waitFor(() =>
      expect(
        requestsTo('/imports').some(([input]) => String(input).includes('status=confirmed'))
      ).toBe(true)
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('employees-imported')).toBeNull();
  });

  it('names every value the confirm refused, as the review names them', async () => {
    mockEmployeeImport({
      detail: partly(),
      confirm: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'refused',
            reason: 'import_refused',
            issues: [
              { path: 'people.pop.fields.cnp', message: 'employees_client_cnp_key' },
              { path: 'people.lazar.fields.hiredAt', message: 'missing' },
              { path: 'people.lazar.existing', message: 'choice' },
              { path: 'people.pop.fields.cnp', message: 'employees_client_cnp_key' },
            ],
          },
          { status: 422 }
        ),
    });
    const user = userEvent.setup();
    mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    await user.click(await screen.findByTestId('employee-confirm-submit'));
    const issues = await screen.findByTestId('employee-confirm-issues');
    expect(
      within(issues)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'La Pop Elena, CNP-ul îl are deja alt lucrător al clientului sau altă persoană din import.',
      'La Lazăr Radu, data angajării lipsește.',
      'La Lazăr Radu, e de spus dacă e același lucrător din aplicație.',
    ]);
  });
});
