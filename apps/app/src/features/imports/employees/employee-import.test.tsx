import { screen, waitFor, within } from '@testing-library/react';
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
  workplaces,
} from '@/test/employee-import-fixture';
import { bodyOf, fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

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

type Options = {
  detail?: ImportDetail;
  found?: typeof foundSheets;
  open?: unknown[];
  confirm?: () => Response;
};

function mockEmployeeImport({
  detail = employeeDetail(),
  found = { items: [], total: 0 },
  open = [],
  confirm,
}: Options = {}) {
  let version = detail.version;
  let confirmed = false;
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
      confirmed = true;
      return confirm?.() ?? Response.json({ clientId, fileCount: 0, employeeIds: [] });
    }
    if (url.pathname === `/imports/${importId}/source`) {
      return Response.json({}, { status: 404 });
    }
    if (url.pathname === '/imports') return Response.json({ items: open });
    if (url.pathname === `/clients/${clientId}`) {
      const currentEmployeeCount = confirmed ? 1 : client.currentEmployeeCount;
      return Response.json({ client: { ...client, currentEmployeeCount }, canDelete: false });
    }
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions });
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({ items: workplaces });
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) return Response.json(found);
    if (url.pathname.startsWith(`/clients/${clientId}/files/`)) {
      return Response.json({}, { status: 404 });
    }
    if (url.pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    return undefined;
  });
}

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

const importPath = `/clients/${clientId}/employees/import/${importId}`;

const saved = (index: number) =>
  bodyOf(`/imports/${importId}/employee-changes`, 'PUT', index) as {
    version: number;
    changes: {
      people: Record<string, { state?: string; cnpCorrection?: boolean }>;
      jobTitles: Record<string, { jobPositionId: string }>;
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

describe("the client's Angajați tab", () => {
  it('offers the sheets found in the documentation while some are untaken, and new photos', async () => {
    mockEmployeeImport({ found: foundSheets });
    mount(`/clients/${clientId}/employees`);
    expect((await screen.findByTestId('employees-import-found')).textContent).toBe(
      'Importă din fișele găsite în documentație (2 fotografii)'
    );
    expect(screen.getByTestId('employees-import').textContent).toBe('Importă din fotografii noi');
    const ways = await screen.findByTestId('employees-start-ways');
    expect(within(ways).getByTestId('employees-start-found').textContent).toContain(
      'Ai deja 2 fotografii de fișe, din documentația importată pe 27 oct.'
    );
  });

  it('offers one import from the sheets when none were found', async () => {
    mockEmployeeImport();
    mount(`/clients/${clientId}/employees`);
    await screen.findByTestId('employees-start-ways');
    expect(screen.getByTestId('employees-import').textContent).toBe(
      'Importă din fișele de instruire'
    );
    expect(screen.queryByTestId('employees-import-found')).toBeNull();
  });

  it('shows the open import with its progress, its expiry and the way back to it', async () => {
    mockEmployeeImport({ open: [openImport] });
    mount(`/clients/${clientId}/employees`);
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
    mount(`/clients/${clientId}/employees`);
    await userEvent.setup().click(await screen.findByTestId('employees-import-found'));
    const dialog = await screen.findByTestId('employee-upload-dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        '2 fotografii de citit'
      )
    );
    expect(within(dialog).getByTestId('employee-upload-limits').textContent).toContain(
      '2 din 500 de fotografii și pagini'
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
      'Importul rămâne pe pagina Angajați a clientului'
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

  it('names the people left out and creates the checked ones, then shows them on the tab', async () => {
    mockEmployeeImport({ detail: partly() });
    const user = userEvent.setup();
    const runtime = mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    const dialog = await screen.findByTestId('employee-confirm-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(
      'Creezi angajații fără cel neverificat?'
    );
    expect(within(dialog).getByTestId('employee-confirm-left').textContent).toContain(
      'Toma Andrei'
    );
    const submit = within(dialog).getByTestId('employee-confirm-submit');
    expect(submit.textContent).toBe('Creează un angajat, fără cel neverificat');
    await user.click(submit);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/employees`)
    );
    expect(bodyOf(`/imports/${importId}/confirm`, 'POST')).toEqual({ version: 4 });
    const card = await screen.findByTestId('employees-imported');
    expect(card.textContent).toContain('Un angajat creat din fișe');
    expect(card.textContent).toContain('Lazăr Radu a fost completat');
    await waitFor(() => expect(screen.getByTestId('client-employee-count').textContent).toBe('1'));
  });

  it('says whose value the client refused, as the review names it', async () => {
    mockEmployeeImport({
      detail: partly(),
      confirm: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'refused',
            reason: 'import_refused',
            issues: [{ path: 'people.pop.fields.cnp', message: 'employees_client_cnp_key' }],
          },
          { status: 422 }
        ),
    });
    const user = userEvent.setup();
    mount(importPath);
    await user.click(await screen.findByTestId('employee-hub-confirm'));
    await user.click(await screen.findByTestId('employee-confirm-submit'));
    expect((await screen.findByTestId('employee-confirm-error')).textContent).toBe(
      'La Pop Elena, CNP-ul nu se poate salva. Deschide persoana, corectează și încearcă din nou.'
    );
  });
});
