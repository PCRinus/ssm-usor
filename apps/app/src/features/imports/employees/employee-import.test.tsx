import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
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
  clientPositions?: unknown[];
  saveChanges?: () => Response | undefined;
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
  clientPositions = positions,
  saveChanges,
}: Options = {}) {
  let version = detail.version;
  let confirmedHere: unknown[] = [];
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: { ...detail, version } });
    }
    if (url.pathname === `/imports/${importId}/employee-changes`) {
      const refused = saveChanges?.();
      if (refused) return refused;
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
      return Response.json({ items: clientPositions });
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
      people: Record<string, { state?: string; cnpCorrection?: boolean; fields?: unknown }>;
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
    const posts = screen.getByTestId('employee-hub-posts');
    expect(within(posts).getAllByTestId('section-status')[0]!.textContent).toBe('1 de hotărât');
    const title = within(posts).getByTestId('employee-hub-title');
    expect(title.textContent).toContain('Ajutor brutar');
    expect(title.textContent).toContain('o persoană: Toma Andrei');
    expect(within(title).queryByTestId('group-status')).toBeNull();
    expect(screen.getByTestId('employee-hub-titles-exact').textContent).toContain('Vânzător 1');

    await userEvent.setup().click(await within(title).findByTestId('group-use'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0)).toMatchObject({
      version: 4,
      changes: { jobTitles: { 'title-helper': { jobPositionId: bakerId } } },
    });
    expect(within(title).getByTestId('group-status').textContent).toBe('Hotărât');
    expect(within(posts).getAllByTestId('section-status')[0]!.textContent).toBe('Gata');
  });

  it('says in the posts section when the client has no posts yet, and offers the one from the sheet', async () => {
    const base = employeeDetail();
    mockEmployeeImport({
      clientPositions: [],
      detail: employeeDetail({
        employees: {
          ...base.employees!,
          proposal: { ...base.employees!.proposal, clientHasPositions: false },
        },
      }),
    });
    mount(importPath);
    const posts = await screen.findByTestId('employee-hub-posts');
    await waitFor(() =>
      expect(posts.textContent).toContain(
        'Clientul nu are încă posturi. Adaugă câte unul pentru fiecare funcție de pe fișe'
      )
    );
    expect(within(posts).getByTestId('group-new-post').textContent).toBe('Adaugă postul');
    expect(within(posts).queryByTestId('group-use')).toBeNull();
  });

  it('keeps what is left to decide in a bar that leads to each section', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(importPath);
    const bar = await screen.findByTestId('employee-hub-bar');
    await waitFor(() =>
      expect(
        within(bar)
          .getAllByRole('button', { name: /de hotărât|de ales|de atribuit/ })
          .map((badge) => badge.textContent)
      ).toEqual([
        '1 post de hotărât',
        '1 loc de muncă de ales',
        '1 persoană cu ceva de hotărât',
        '1 fotografie de atribuit',
      ])
    );
    expect(bar.textContent).toContain('0 din 3 verificate');
    expect(bar.textContent).toContain('Se păstrează până pe 13 nov.');
    expect(within(bar).getByTestId('employee-hub-confirm')).toHaveProperty('disabled', true);
    expect(within(bar).getByTestId('employee-hub-continue').textContent).toBe(
      'Continuă cu Toma Andrei'
    );

    await user.click(within(bar).getByRole('button', { name: '1 fotografie de atribuit' }));
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Fotografii neatribuite' })
    );
  });

  it('asks for the workplace once in its own section, which the bar leads to', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(importPath);
    const section = await screen.findByTestId('employee-hub-workplaces');
    expect(within(section).getAllByTestId('section-status')[0]!.textContent).toBe('1 de hotărât');
    expect(within(section).getByTestId('employee-hub-workplace').textContent).toContain(
      'Toma Andrei'
    );
    await user.click(
      within(screen.getByTestId('employee-hub-bar')).getByRole('button', {
        name: '1 loc de muncă de ales',
      })
    );
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Locuri de muncă' })
    );
  });

  it('keeps the workers from being created while a change of the review is refused', async () => {
    const base = employeeDetail();
    mockEmployeeImport({
      detail: employeeDetail({
        employees: { ...base.employees!, changes: { people: { pop: { state: 'checked' } } } },
      }),
      saveChanges: () =>
        Response.json(
          { error: 'conflict', message: 'changed', reason: 'import_changed' },
          { status: 409 }
        ),
    });
    const user = userEvent.setup();
    mount(importPath);
    const create = await screen.findByRole('button', { name: /^Creează\s?lucrătorii\s?…$/ });
    expect(create).toHaveProperty('disabled', false);
    await user.click(screen.getByRole('switch', { name: 'Inclus: Toma Andrei' }));
    await screen.findByTestId('import-review-conflict');
    expect(create).toHaveProperty('disabled', true);
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

  it('lists those with something to decide before those not yet opened, with one summary each', async () => {
    mockEmployeeImport();
    mount(importPath);
    await screen.findByTestId('employee-hub');
    const groups = screen.getAllByTestId('employee-hub-group');
    expect(within(groups[0]!).getByRole('heading').textContent).toBe('Cu ceva de hotărât 1');
    expect(within(groups[1]!).getByRole('heading').textContent).toBe('Încă nedeschise 2');
    const toma = within(groups[0]!).getByTestId('employee-hub-person');
    expect(within(toma).getByTestId('employee-hub-person-link').textContent).toBe('Toma Andrei');
    const summary = within(toma).getByTestId('employee-hub-person-summary');
    expect(within(summary).getByText('2 de hotărât')).toBeTruthy();
    expect(summary.textContent).toContain('CNP cu o cifră necitită');
    expect(within(toma).getByTitle('Postul').textContent).toContain('Ajutor brutar');
    expect(toma.textContent).not.toContain('Post de hotărât');
    const pop = within(groups[1]!).getAllByTestId('employee-hub-person')[0]!;
    expect(pop.textContent).toContain('Nimic de hotărât pe fișe');
    expect(pop.textContent).toContain('Durată neobișnuită la o instruire');
  });

  it('keeps apart those who wait only on the post and workplace decided above', async () => {
    const base = employeeDetail();
    mockEmployeeImport({
      detail: employeeDetail({
        employees: {
          ...base.employees!,
          changes: {
            people: { toma: { cnpCorrection: true } },
            rows: { r5: { values: { trainerName: 'Barbu Ionuț' } } },
          },
        },
      }),
    });
    mount(importPath);
    await screen.findByTestId('employee-hub');
    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('employee-hub-group')[0]!).getByRole('heading').textContent
      ).toBe('Așteaptă doar postul sau locul de muncă 1')
    );
    const [waiting] = screen.getAllByTestId('employee-hub-group');
    const toma = within(waiting!).getByTestId('employee-hub-person');
    expect(toma.textContent).toContain('Nimic de hotărât pe fișe');
    expect(within(toma).queryByText(/de hotărât$/)).toBeNull();
    expect(
      within(screen.getByTestId('employee-hub-bar')).queryByRole('button', {
        name: /persoan/,
      })
    ).toBeNull();
  });

  it('counts a leaver not taken as set aside, not as someone to check', async () => {
    mockEmployeeImport({ detail: popWith({ leftOn: '2026-09-30' }) });
    mount(importPath);
    await screen.findByTestId('employee-hub');
    const aside = screen.getAllByTestId('employee-hub-group').at(-1)!;
    expect(within(aside).getByRole('heading').textContent).toBe('Lăsați deoparte 1');
    expect(within(aside).getByRole('switch', { name: 'Nu e inclus: Pop Elena' })).toBeTruthy();
    expect(within(aside).getByTestId('employee-hub-person-summary').textContent).toContain(
      'A plecat din firmă'
    );
    const people = screen.getByRole('region', { name: 'Persoane' });
    expect(within(people).getAllByTestId('section-status')[0]!.textContent).toBe('2 de verificat');
    expect(screen.getByTestId('employee-hub-bar').textContent).toContain('0 din 2 verificate');
  });

  it('sets a person aside from the list with the switch the person page uses, and takes them back', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(importPath);
    await screen.findByTestId('employee-hub');
    await user.click(screen.getByRole('switch', { name: 'Inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.pop).toEqual({ state: 'set_aside' });
    const aside = screen.getAllByTestId('employee-hub-group').at(-1)!;
    expect(within(aside).getByRole('heading').textContent).toBe('Lăsați deoparte 1');
    expect(within(aside).getByTestId('left-out-row').textContent).toBe('Pop ElenaNu e inclus');
    expect(within(screen.getByTestId('employee-hub-bar')).getByText(/verificate/).textContent).toBe(
      '0 din 2 verificate'
    );

    await user.click(within(aside).getByRole('switch', { name: 'Nu e inclus: Pop Elena' }));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(2)
    );
    expect(saved(1).changes.people.pop?.state).toBeUndefined();
    expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Inclus: Pop Elena' }));
  });
});

describe('the photographs no one has', () => {
  it('opens the assignment from anywhere on the row', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(importPath);
    const section = await screen.findByTestId('employee-hub-unplaced');
    expect(within(section).getByTestId('section-status').textContent).toBe('1 de atribuit');
    const row = within(section).getByTestId('employee-hub-unplaced-page');
    expect(row.textContent).toContain('Fișa SSM, periodice');
    expect(row.textContent).toContain('De atribuit');
    await user.click(within(row).getByRole('button', { name: 'Atribuie IMG_p5.jpg' }));
    const dialog = await screen.findByTestId('employee-unplaced-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(
      'A cui e fotografia IMG_p5.jpg?'
    );
    await user.selectOptions(within(dialog).getByRole('combobox'), 'Pop Elena');
    await user.click(within(dialog).getByTestId('employee-unplaced-save'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(row.textContent).toContain('La Pop Elena');
    expect(within(section).getByTestId('section-status').textContent).toBe('Gata');
  });

  it('opens a photograph large from its thumbnail, and assigns it from there', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(importPath);
    const row = await screen.findByTestId('employee-hub-unplaced-page');
    await user.click(within(row).getByRole('button', { name: 'Deschide mare IMG_p5.jpg' }));
    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_p5.jpg');
    expect(preview.textContent).toContain(
      'Fotografia neatribuită 1 din 1 · Fișa SSM, periodice · niciun rând de instruire'
    );
    await user.click(within(preview).getByTestId('photo-preview-assign'));
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    const dialog = await screen.findByTestId('employee-unplaced-dialog');

    await user.click(await within(dialog).findByTestId('photo-enlarge'));
    expect((await screen.findByTestId('photo-preview')).textContent).toContain('IMG_p5.jpg');
  });
});

describe('the person page', () => {
  it('checks a person with nothing to decide on moving to the next', async () => {
    mockEmployeeImport();
    const runtime = mount(`${importPath}/pop`);
    await screen.findByTestId('person-page');
    expect(screen.getByTestId('person-state').textContent).toBe('De verificat');
    expect(screen.queryByTestId('person-decisions')).toBeNull();
    expect(screen.getByTestId('person-data-pending').textContent).toBe('Gata de confirmat');
    const employeeNumber = document.getElementById('field-employeeNumber')!;
    expect(employeeNumber.querySelector('dt')!.textContent).toContain('Număr de marcă');
    expect(employeeNumber.querySelector('dd > div')!.textContent).toBe('Necompletat');
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
    expect(within(test).getByRole('button', { name: /^Modifică testul anual din / })).toBeTruthy();
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
    expect(within(row()).getByRole('button', { name: /^Modifică instruirea din / })).toBeTruthy();

    await user.click(
      within(row()).getByRole('switch', { name: /^Inclusă: Instruirea periodică din / })
    );

    expect(row().textContent).toMatch(/^Instruirea periodică din .+Nu e inclusă$/);
    expect(within(row()).queryAllByRole('button')).toHaveLength(0);
    expect(document.activeElement).toBe(within(row()).getByRole('switch'));
    await user.click(
      within(row()).getByRole('switch', { name: /^Nu e inclusă: Instruirea periodică din / })
    );
    expect(within(row()).getByRole('button', { name: /^Modifică instruirea din / })).toBeTruthy();
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
        name: 'Modifică datele personale',
      })
    );
    expect(label('lastName')).toBe('Nume*(obligatoriu)');
    expect(label('firstName')).toBe('Prenume*(obligatoriu)');
    expect(label('cnp')).toBe('CNP(opțional)');
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await user.click(
      within(screen.getByTestId('person-fields-employment')).getByRole('button', {
        name: 'Modifică datele de angajare',
      })
    );
    expect(label('jobTitle')).toContain('(obligatoriu)');
    expect(label('hiredAt')).toContain('(obligatoriu)');
    expect(label('employeeNumber')).toContain('(opțional)');
  });

  it('counts what is left in the data card and jumps to the row that asks it', async () => {
    mockEmployeeImport({ detail: popWith({ cnp: '2710212250545', birthDate: '1971-03-12' }) });
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const pending = await screen.findByTestId('person-data-pending');
    expect(pending.textContent).toBe('1 de hotărât');
    const row = document.getElementById('field-birthDate')!;
    expect(row.dataset.tone).toBe('todo');
    expect(row.textContent).toContain('Data nașterii nu se potrivește cu CNP-ul');

    await user.click(
      within(screen.getByTestId('person-bar')).getByRole('button', { name: /^1 de hotărât/ })
    );
    expect(document.activeElement).toBe(row);
  });

  it('counts what is left in the bar, takes the corrected CNP and keeps the person to check', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const bar = await screen.findByTestId('person-bar');
    expect(
      await within(bar).findByRole('button', {
        name: '4 de hotărât',
        description: 'Mergi la următoarea alegere',
      })
    ).toBeTruthy();
    await user.click(
      within(screen.getByTestId('person-decide-cnp')).getByTestId('person-cnp-correction')
    );
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1)
    );
    expect(saved(0).changes.people.toma).toEqual({ cnpCorrection: true });
    expect(within(bar).getByRole('button', { name: '3 de hotărât' })).toBeTruthy();

    await user.click(screen.getByTestId('person-next'));
    await waitFor(() => expect(screen.getByTestId('person-page').dataset.state).toBe('to_check'));
    expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(1);
  });

  it('moves the focus to each thing left to decide in turn from the badge in the bar', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const bar = await screen.findByTestId('person-bar');
    const badge = await within(bar).findByRole('button', { name: /^4 de hotărât/ });
    const visited: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      await user.click(badge);
      visited.push((document.activeElement as HTMLElement).id);
    }
    expect(new Set(visited.slice(0, 4)).size).toBe(visited.slice(0, 4).length);
    expect(visited[4]).toBe(visited[0]);
    expect(visited).toContain('cnp');
  });

  it('names the photographs in the bar by place and kind, and opens one large from there', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const strip = await screen.findByTestId('person-strip');
    const group = within(strip).getByRole('group', { name: 'Fotografiile lui Toma Andrei' });
    expect(group.getAttribute('aria-description')).toBe(
      'Subliniate: fotografiile secțiunii de pe ecran'
    );
    const frames = within(group).getAllByRole('button');
    expect(frames.map((frame) => frame.getAttribute('aria-label'))).toEqual([
      'Fotografia 1 din 2, Fișa SSM, față',
      'Fotografia 2 din 2, Fișa SSM, periodice',
    ]);
    expect(frames[0]!.dataset.ringed).toBe('true');

    await user.click(frames[1]!);
    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 2');
    expect(within(preview).getByRole('heading', { level: 2 }).textContent).toBe('Toma Andrei');
    expect(preview.textContent).toContain('Fotografia 2 din 2, Fișa SSM, periodice, IMG_p2.jpg');
    expect((await within(preview).findByRole<HTMLImageElement>('img')).src).toBe(
      'https://storage.test/derived/IMG_p2.jpg'
    );
    expect(within(preview).queryByTestId('photo-enlarge')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    expect(within(strip).getAllByRole('button')[1]!.dataset.ringed).toBe('true');
  });

  it('steps through the photographs with the arrows and the strip under the large photo', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const [first] = await within(await screen.findByTestId('person-strip')).findAllByRole('button');
    await user.click(first!);
    const preview = await screen.findByTestId('photo-preview');
    const position = () => within(preview).getByTestId('photo-preview-position').textContent;
    expect(position()).toBe('1 din 2');
    expect(within(preview).getByTestId('photo-preview-previous')).toHaveProperty('disabled', true);
    expect(within(preview).getByTestId('photo-preview-next').getAttribute('aria-label')).toBe(
      'Fotografia următoare'
    );

    await user.click(within(preview).getByTestId('photo-preview-next'));
    expect(position()).toBe('2 din 2');
    const viewerStrip = within(preview).getByTestId('viewer-strip');
    const frames = within(viewerStrip).getAllByRole('button');
    expect(frames[1]!.dataset.ringed).toBe('true');

    await user.click(frames[0]!);
    expect(position()).toBe('1 din 2');
    expect(frames[0]!.getAttribute('aria-current')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(position()).toBe('1 din 2');
    expect(document.activeElement).toBe(frames[1]);
    await user.keyboard('{Enter}');
    expect(position()).toBe('2 din 2');

    within(preview).getByRole('button', { name: 'Închide' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(position()).toBe('1 din 2');
  });

  it('gives the focus back to the photo number that opened the large photo', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const number = within(await screen.findByTestId('person-training-row')).getByTestId(
      'person-page-button'
    );
    await user.click(number);
    await screen.findByTestId('photo-preview');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    expect(document.activeElement).toBe(number);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the photograph a row was read from with the number beside the row', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    const row = await screen.findByTestId('person-training-row');
    const number = within(row).getByTestId('person-page-button');
    const total = within(screen.getByTestId('person-strip')).getAllByRole('button').length;
    await user.click(number);
    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe(
      `${number.textContent} din ${total}`
    );
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
    expect(within(card).getByRole('heading').textContent).toBe('Data angajării');
    expect(card.textContent).toContain('Fișele scriu 2 variante');
    await user.click(within(card).getByTestId('person-choice-other'));
    await user.type(
      within(card).getByLabelText('Data angajării', { selector: 'input' }),
      '01.04.2023'
    );
    await user.click(within(card).getByTestId('person-choice-other-use'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('person-decisions')).getByTestId('section-status').textContent
      ).toBe('Gata')
    );
    expect(within(card).getByLabelText('Data angajării', { selector: 'input' })).toHaveProperty(
      'value',
      '01.04.2023'
    );
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

function tomaWithChoices() {
  const base = employeeDetail();
  const proposal = base.employees!.proposal;
  return employeeDetail({
    employees: {
      ...base.employees!,
      proposal: {
        ...proposal,
        people: proposal.people.map((each) =>
          each.id === 'toma'
            ? {
                ...each,
                fields: {
                  ...each.fields,
                  homeAddress: {
                    options: [
                      { value: 'Str. Morii nr. 4, Cisnădie', pageIds: ['p1'] },
                      { value: 'Str. Fabricii nr. 21, Sibiu', pageIds: ['p2'] },
                    ],
                  },
                  hiredAt: {
                    options: [
                      { value: '2024-08-12', pageIds: ['p1'] },
                      { value: '2024-08-21', pageIds: ['p2'] },
                    ],
                  },
                },
              }
            : each
        ),
      },
    },
  });
}

describe('the choices and the bar of the person page', () => {
  it('keeps a choice answered with the arrow keys on the page, with the focus in it', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const row = await screen.findByTestId('person-decide-choice-homeAddress');
    await screen.findByTestId('person-decide-workplace');
    expect(
      within(screen.getByTestId('person-decisions')).getByTestId('person-decisions-count')
        .textContent
    ).toBe('5 alegeri');
    within(row).getAllByRole('radio')[0]!.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(
        saved(requestsTo(`/imports/${importId}/employee-changes`, 'PUT').length - 1).changes.people
          .toma
      ).toEqual({ fields: { homeAddress: { option: 1 } } })
    );
    expect(screen.getByTestId('person-decide-choice-homeAddress')).toBe(row);
    expect(row.contains(document.activeElement)).toBe(true);
    expect(
      within(row).getByRole<HTMLInputElement>('radio', { name: 'Str. Fabricii nr. 21, Sibiu' })
        .checked
    ).toBe(true);
    expect(
      within(screen.getByTestId('person-decisions')).getByTestId('person-decisions-count')
        .textContent
    ).toBe('4 alegeri');
  });

  it('names a photo number by what it stands beside', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    mount(`${importPath}/toma`);
    const row = await screen.findByTestId('person-decide-choice-homeAddress');
    expect(
      within(row)
        .getAllByTestId('person-page-button')
        .map((each) => each.getAttribute('aria-label'))
    ).toEqual([
      'Fotografia 1, Domiciliul: Str. Morii nr. 4, Cisnădie',
      'Fotografia 2, Domiciliul: Str. Fabricii nr. 21, Sibiu',
    ]);
    const training = screen.getAllByTestId('person-training-row')[0]!;
    expect(within(training).getByTestId('person-page-button').getAttribute('aria-label')).toMatch(
      /^Fotografia \d, Instruire SSM din \d\d\.\d\d\.\d{4}$/
    );
  });

  it('goes back to the list from the last person', async () => {
    mockEmployeeImport();
    const runtime = mount(`${importPath}/lazar`);
    const next = await screen.findByTestId('person-next');
    expect(next.textContent).toBe('Înapoi la listă');
    expect(next.getAttribute('aria-label')).toBeNull();
    await userEvent.setup().click(next);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(importPath));
  });

  it('names the next person on the bar button', async () => {
    mockEmployeeImport();
    mount(`${importPath}/pop`);
    const next = await screen.findByTestId('person-next');
    expect(next.textContent).toBe('Persoana următoare');
    expect(next.getAttribute('aria-label')).toBe('Persoana următoare: Lazăr Radu');
  });

  it('says in the bar when a change was refused because the proposal changed', async () => {
    mockEmployeeImport({
      saveChanges: () =>
        Response.json(
          { error: 'conflict', message: 'changed', reason: 'import_changed' },
          { status: 409 }
        ),
    });
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    await user.click(await screen.findByRole('switch', { name: 'Inclus: Pop Elena' }));
    const bar = screen.getByTestId('person-bar');
    await within(bar).findByTestId('import-review-conflict');
    expect(within(bar).getByRole('alert').textContent).toBe(
      'Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.'
    );
    expect(within(bar).getByRole('button', { name: 'Reîncarcă propunerea' })).toBeTruthy();
  });

  it('saves a refused change again from the bar', async () => {
    let refuse = true;
    mockEmployeeImport({
      saveChanges: () =>
        refuse ? Response.json({ error: 'internal', message: 'down' }, { status: 500 }) : undefined,
    });
    const user = userEvent.setup();
    mount(`${importPath}/pop`);
    await user.click(await screen.findByRole('switch', { name: 'Inclus: Pop Elena' }));
    const bar = screen.getByTestId('person-bar');
    const alert = await within(bar).findByRole('alert');
    expect(alert.textContent).toMatch(/^Ultima schimbare nu s-a salvat\. ./);
    expect(alert.title).not.toBe('');
    refuse = false;
    await user.click(within(bar).getByRole('button', { name: 'Salvează din nou' }));
    await waitFor(() =>
      expect(within(bar).getByRole('status').textContent).toBe('Salvat în propunere')
    );
  });
});

describe('the large photo beside a choice', () => {
  const lastSaved = () =>
    saved(requestsTo(`/imports/${importId}/employee-changes`, 'PUT').length - 1).changes.people.toma
      ?.fields;

  it('picks a value in place, counts it at once and moves on to the next choice', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const row = await screen.findByTestId('person-decide-choice-homeAddress');
    await user.click(within(row).getAllByTestId('person-page-button')[0]!);

    const preview = await screen.findByTestId('photo-preview');
    const choice = within(preview).getByTestId('viewer-choice');
    expect(within(choice).getByRole('heading').textContent).toBe('Domiciliul');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('1 din 2');
    expect(within(preview).getByTestId('viewer-underline-caption').textContent).toBe(
      'Alege o variantă ca să vezi pe ce fotografii apare'
    );
    const left = () =>
      Number.parseInt(within(choice).getByTestId('viewer-decisions-left').textContent!);
    const before = left();
    expect(within(choice).queryByTestId('viewer-choice-picked')).toBeNull();

    await user.click(within(choice).getByRole('radio', { name: 'Str. Fabricii nr. 21, Sibiu' }));
    await waitFor(() => expect(lastSaved()).toEqual({ homeAddress: { option: 1 } }));
    expect(left()).toBe(before - 1);
    expect(within(choice).getByTestId('viewer-choice-picked').textContent).toBe('Aleasă');
    expect(within(preview).getByTestId('viewer-underline-caption').textContent).toBe(
      'Subliniate: fotografiile unde scrie Str. Fabricii nr. 21, Sibiu'
    );
    const frames = within(within(preview).getByTestId('viewer-strip')).getAllByRole('button');
    expect(frames[1]!.dataset.underlined).toBe('true');

    const next = within(choice).getByTestId('viewer-choice-next');
    expect(next.textContent).toBe('Mai departe: data angajării');
    await user.click(next);
    expect(within(choice).getByRole('heading').textContent).toBe('Data angajării');
    expect(within(choice).getByTestId('viewer-choice-next').textContent).toBe('Gata, închide');

    await user.click(within(choice).getByTestId('viewer-choice-next'));
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
  });

  it('moves on from Altă valoare with the value typed, and leaves an empty one open', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const row = await screen.findByTestId('person-decide-choice-hiredAt');
    await user.click(within(row).getAllByTestId('person-page-button')[0]!);
    const choice = await screen.findByTestId('viewer-choice');
    expect(within(choice).getByRole('heading').textContent).toBe('Data angajării');

    await user.click(within(choice).getByTestId('person-choice-other'));
    await user.click(within(choice).getByTestId('viewer-choice-next'));
    expect(within(choice).getByRole('heading').textContent).toBe('Domiciliul');
    expect(requestsTo(`/imports/${importId}/employee-changes`, 'PUT')).toHaveLength(0);

    await user.click(within(choice).getByTestId('person-choice-other'));
    await user.type(
      within(choice).getByLabelText('Domiciliul', { selector: 'input' }),
      'Str. Viilor nr. 9, Sibiu'
    );
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('photo-preview-position').textContent).toBe('1 din 2');
    const next = within(choice).getByTestId('viewer-choice-next');
    expect(next.textContent).toBe('Mai departe: data angajării');
    await user.click(next);
    await waitFor(() =>
      expect(lastSaved()).toEqual({ homeAddress: { value: 'Str. Viilor nr. 9, Sibiu' } })
    );
    expect(within(choice).getByRole('heading').textContent).toBe('Data angajării');
  });

  it('lists what cites a photo opened from the strip, and opens a choice or a row from it', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const strip = await screen.findByTestId('person-strip');
    await user.click(within(strip).getByRole('button', { name: /^Fotografia 2 din 2/ }));

    const citations = await screen.findByTestId('viewer-citations');
    const items = within(citations).getAllByTestId('viewer-citation');
    expect(items.map((item) => item.textContent)).toEqual(
      expect.arrayContaining(['Domiciliul', 'Data angajării'])
    );
    expect(items.filter((item) => item.textContent!.startsWith('Instruire SSM, '))).toHaveLength(2);

    await user.click(within(citations).getByRole('button', { name: 'Domiciliul' }));
    const choice = await screen.findByTestId('viewer-choice');
    expect(within(choice).getByRole('heading').textContent).toBe('Domiciliul');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());

    await user.click(within(strip).getByRole('button', { name: /^Fotografia 2 din 2/ }));
    const rows = within(await screen.findByTestId('viewer-citations')).getAllByTestId(
      'viewer-citation'
    );
    await user.click(rows.find((item) => item.textContent!.startsWith('Instruire SSM, '))!);
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe('row-r2'));
  });
});

function tomaWithManyRows() {
  const detail = tomaWithChoices();
  const proposal = detail.employees!.proposal;
  return employeeDetail({
    employees: {
      ...detail.employees!,
      proposal: {
        ...proposal,
        pages: proposal.pages.map((page) =>
          page.id === 'p2'
            ? {
                ...page,
                rows: [
                  ...page.rows,
                  sheetRow('r7', { heldOn: '2023-03-01' }),
                  sheetRow('r8', { heldOn: '2023-09-01' }),
                  sheetRow('r9', { heldOn: '2024-03-01' }),
                ],
              }
            : page
        ),
      },
    },
  });
}

describe('the large photo beside a choice, when saving and with the keyboard', () => {
  const openHomeAddress = async (user: ReturnType<typeof userEvent.setup>) => {
    const row = await screen.findByTestId('person-decide-choice-homeAddress');
    await user.click(within(row).getAllByTestId('person-page-button')[0]!);
    return screen.findByTestId('viewer-choice');
  };

  it('announces the value picked and the count left, and moves the focus to the next choice', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const choice = await openHomeAddress(user);
    const status = within(choice).getByTestId('viewer-choice-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    await user.click(within(choice).getByRole('radio', { name: 'Str. Fabricii nr. 21, Sibiu' }));
    await waitFor(() => expect(status.textContent).toMatch(/^Aleasă\. \d+ de hotărât\.$/));
    await user.click(within(choice).getByTestId('viewer-choice-next'));
    expect(document.activeElement).toBe(
      within(choice).getByRole('heading', { name: 'Data angajării' })
    );
  });

  it('shows a refused save beside the choice, without Aleasă, and saves it again', async () => {
    let refuse = true;
    mockEmployeeImport({
      detail: tomaWithChoices(),
      saveChanges: () =>
        refuse ? Response.json({ error: 'internal', message: 'down' }, { status: 500 }) : undefined,
    });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const choice = await openHomeAddress(user);
    await user.click(within(choice).getByRole('radio', { name: 'Str. Fabricii nr. 21, Sibiu' }));
    const error = await within(choice).findByTestId('viewer-choice-save-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Ultima schimbare nu s-a salvat.');
    expect(within(choice).queryByTestId('viewer-choice-picked')).toBeNull();
    refuse = false;
    await user.click(within(error).getByRole('button', { name: 'Salvează din nou' }));
    await within(choice).findByTestId('viewer-choice-picked');
    expect(within(choice).queryByTestId('viewer-choice-save-error')).toBeNull();
  });

  it('stops the choices when the proposal changed meanwhile, and offers to reload it', async () => {
    mockEmployeeImport({
      detail: tomaWithChoices(),
      saveChanges: () =>
        Response.json(
          { error: 'conflict', message: 'changed', reason: 'import_changed' },
          { status: 409 }
        ),
    });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const choice = await openHomeAddress(user);
    await user.click(within(choice).getByRole('radio', { name: 'Str. Fabricii nr. 21, Sibiu' }));
    const error = await within(choice).findByTestId('viewer-choice-save-error');
    expect(error.textContent).toContain('Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.');
    expect(within(error).getByRole('button', { name: 'Reîncarcă propunerea' })).toBeTruthy();
    for (const radio of within(choice).getAllByRole<HTMLInputElement>('radio'))
      expect(radio.disabled).toBe(true);
  });

  it('clears a value typed under Altă valoare when it is emptied before moving on', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    const lastFields = () =>
      saved(requestsTo(`/imports/${importId}/employee-changes`, 'PUT').length - 1).changes.people
        .toma?.fields;
    let choice = await openHomeAddress(user);
    await user.click(within(choice).getByTestId('person-choice-other'));
    await user.type(
      within(choice).getByLabelText('Domiciliul', { selector: 'input' }),
      'Str. Viilor nr. 9, Sibiu'
    );
    await user.click(within(choice).getByTestId('viewer-choice-next'));
    await waitFor(() =>
      expect(lastFields()).toEqual({ homeAddress: { value: 'Str. Viilor nr. 9, Sibiu' } })
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());

    choice = await openHomeAddress(user);
    await user.clear(within(choice).getByLabelText('Domiciliul', { selector: 'input' }));
    await user.click(within(choice).getByTestId('viewer-choice-next'));
    await waitFor(() => expect(lastFields()).toBeUndefined());
    expect(within(choice).getByRole('heading', { level: 3 }).textContent).toBe('Data angajării');
    expect(within(choice).getByTestId('viewer-choice-next').textContent).toBe(
      'Mai departe: domiciliul'
    );
  });

  it('lists only the training rows the page shows, each opening its row', async () => {
    mockEmployeeImport();
    const user = userEvent.setup();
    mount(`${importPath}/lazar`);
    await user.click(
      within(await screen.findByTestId('person-strip')).getByRole('button', {
        name: /^Fotografia 1 din 1/,
      })
    );
    const citations = await screen.findByTestId('viewer-citations');
    const items = within(citations).getAllByTestId('viewer-citation');
    expect(items.map((item) => item.textContent)).toEqual(['Instruire SSM, 11.08.2025']);
    await user.click(items[0]!);
    await waitFor(() => expect(document.activeElement?.id).toBe('row-r6'));
  });

  it('shows five things on a photo, then the rest on Încă', async () => {
    mockEmployeeImport({ detail: tomaWithManyRows() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    await user.click(
      within(await screen.findByTestId('person-strip')).getByRole('button', {
        name: /^Fotografia 2 din 2/,
      })
    );
    const citations = await screen.findByTestId('viewer-citations');
    expect(within(citations).getAllByTestId('viewer-citation')).toHaveLength(5);
    const more = within(citations).getByTestId('viewer-citations-more');
    expect(more.textContent).toBe('Încă 2: instruirile din 2023–2024');
    await user.click(more);
    expect(within(citations).getAllByTestId('viewer-citation')).toHaveLength(7);
    expect(within(citations).queryByTestId('viewer-citations-more')).toBeNull();
  });

  it('underlines on the first tap and opens on the second, and opens at once from the keyboard', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    await user.click(
      within(await screen.findByTestId('person-strip')).getByRole('button', {
        name: /^Fotografia 2 din 2/,
      })
    );
    const preview = await screen.findByTestId('photo-preview');
    const item = within(preview).getByRole('button', { name: 'Domiciliul' });
    await user.pointer({ keys: '[TouchA]', target: item });
    expect(item.dataset.selected).toBe('true');
    expect(within(preview).getByTestId('viewer-underline-caption').textContent).toBe(
      'Subliniate: fotografiile unde apare Domiciliul'
    );
    expect(within(preview).queryByTestId('viewer-choice')).toBeNull();
    await user.pointer({ keys: '[TouchA]', target: item });
    expect(within(preview).getByTestId('viewer-choice')).toBeTruthy();
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 2');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    await user.click(
      within(screen.getByTestId('person-strip')).getByRole('button', {
        name: /^Fotografia 2 din 2/,
      })
    );
    const again = await screen.findByTestId('photo-preview');
    act(() => within(again).getByRole('button', { name: 'Data angajării' }).focus());
    expect(within(again).getByTestId('viewer-underline-caption').textContent).toBe(
      'Subliniate: fotografiile unde apare Data angajării'
    );
    await user.keyboard('{Enter}');
    expect(within(again).getByRole('heading', { name: 'Data angajării' })).toBeTruthy();
  });

  it('clears the underline when the focus leaves a listed item or the photo changes', async () => {
    mockEmployeeImport({ detail: tomaWithChoices() });
    const user = userEvent.setup();
    mount(`${importPath}/toma`);
    await user.click(
      within(await screen.findByTestId('person-strip')).getByRole('button', {
        name: /^Fotografia 2 din 2/,
      })
    );
    const preview = await screen.findByTestId('photo-preview');
    act(() => within(preview).getByRole('button', { name: 'Domiciliul' }).focus());
    expect(within(preview).getByTestId('viewer-underline-caption')).toBeTruthy();
    act(() => within(preview).getByRole('button', { name: 'Închide' }).focus());
    expect(within(preview).queryByTestId('viewer-underline-caption')).toBeNull();
    act(() => within(preview).getByRole('button', { name: 'Domiciliul' }).focus());
    await user.click(within(preview).getByTestId('photo-preview-previous'));
    expect(within(preview).queryByTestId('viewer-underline-caption')).toBeNull();
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
