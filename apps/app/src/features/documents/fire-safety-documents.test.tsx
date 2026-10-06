import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: 'J40/1234/2019',
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const revision = (overrides: Record<string, unknown> = {}) => ({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  revision: 1,
  status: 'draft',
  issueDate: '2026-01-19',
  dataChanged: false,
  editedAt: null,
  issuedAt: null,
  hasPdf: false,
  hasSignedCopy: false,
  receivedCopy: null,
  annexes: [] as unknown[],
  createdAt: '2026-09-19T10:00:00+00:00',
  ...overrides,
});

const fireDocument = (id: string, typeKey: string, title: string) => ({
  id,
  clientId,
  typeKey,
  title,
  decisionNumber: null,
  draft: revision({ id: id.replace(/^./, 'f') }),
  issued: null,
});

const registersId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const permit = fireDocument(
  '6e1f2a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  'fire_work_permit',
  'Permis de lucru cu foc'
);
const registers = fireDocument(registersId, 'fire_registers', 'Registre PSI');
const cover = fireDocument(
  '7f2a3b9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  'fire_cover_registers',
  'Copertă registre PSI'
);
const ssmReport = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  typeKey: 'control_report',
  title: 'Referat de control',
  decisionNumber: null,
  draft: revision({ id: '1b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d' }),
  issued: null,
};

const documentDetails = {
  legalRepresentativeName: 'Maria Popescu',
  legalRepresentativeRole: null,
  periodicTrainingMinutes: 120,
  administrativeTrainingIntervalMonths: 6,
  administrativeTrainingNotApplicable: false,
  workerTrainingIntervalMonths: 3,
  workerTrainingNotApplicable: false,
  trainingFirstMonth: 2,
  trainingDayFrom: 2,
  trainingDayTo: 7,
};

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  role = 'owner',
  fireItems = [] as unknown[],
  ssmItems = [] as unknown[],
  readiness = { ready: true, missing: [] as string[] },
  generate = (() =>
    Response.json({ created: [cover, registers], skipped: [] }, { status: 201 })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    const fireSafety = url.searchParams.get('set') === 'fire_safety';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role,
        },
      });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/documents`) {
      return Response.json(
        fireSafety
          ? { items: fireItems, lastGeneration: null, notApplicable: [], currentEmployeeCount: 6 }
          : {
              items: ssmItems,
              lastGeneration: null,
              notApplicable: [],
              currentEmployeeCount: 6,
            }
      );
    }
    if (pathname === `/clients/${clientId}/documents/readiness`) {
      return Response.json({
        currentEmployeeCount: 6,
        workersRepresentativeClash: null,
        undecidedJobPositions: [],
        incompleteRiskEvaluations: [],
        ...readiness,
      });
    }
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails });
    }
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/documents/generate`) return generate(init);
    if (pathname.endsWith('/download')) {
      return Response.json({
        url: 'https://files.example.test/signed',
        fileName: 'Registre PSI - rev. 1.docx',
        expiresInSeconds: 60,
      });
    }
    if (pathname === '/signed') return new Response(new Uint8Array([80, 75, 3, 4]));
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (suffix: string, method = 'GET') =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname.endsWith(suffix) && (init?.method ?? 'GET') === method
    )
    .map(([input, init]) => ({ url: new URL(String(input)), init }));

const firePath = `/clients/${clientId}/fire-safety-documents`;

const mount = (path = firePath) => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('client fire-safety documents', () => {
  it('is a section of the client right after the SSM documents, with a set of its own', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('fire-safety-documents-page')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByTestId('client-section').map((link) => link.textContent)).toEqual([
        'Detalii',
        'Angajați',
        'Posturi de lucru',
        'Instruire și responsabili',
        'Documente SSM',
        'Documente PSI',
        'Contract',
        'Alte documente',
      ])
    );
    const tabs = screen.getAllByTestId('client-section');
    const tab = tabs.find((link) => link.textContent === 'Documente PSI')!;
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(tab.querySelector('svg')!.getAttribute('class')).toContain('lucide-fire-extinguisher');
    expect(screen.getByRole('heading', { name: 'Documentația PSI' })).toBeTruthy();
    expect((await screen.findByTestId('documents-empty')).textContent).toContain('documente PSI');
    expect(screen.getByTestId('documents-generate').textContent).toContain(
      'Generează documentația'
    );
    const [list] = requests('/documents');
    expect(list!.url.searchParams.get('set')).toBe('fire_safety');
  });

  it('leaves the SSM tab to its own set', async () => {
    mockApi({ ssmItems: [ssmReport], fireItems: [registers] });
    mount(`/clients/${clientId}/documents`);

    await screen.findAllByTestId('document-section');
    expect(screen.getByRole('heading', { name: 'Documentația SSM' })).toBeTruthy();
    expect(screen.queryByText(/Registre și formulare PSI/)).toBeNull();
    expect(requests('/documents').map(({ url }) => url.search)).toEqual(['']);
  });

  it('lists the registers and forms in the order of the binder, under its number', async () => {
    const extra = fireDocument(
      '8a3b4c9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
      'fire_smoking_decision',
      'Decizia privind fumatul'
    );
    mockApi({ fireItems: [permit, extra, registers, cover] });
    const runtime = mount();
    const user = userEvent.setup();

    const sections = await screen.findAllByTestId('document-section-trigger');
    expect(sections.map((section) => section.textContent)).toEqual([
      '6. Registre și formulare PSI3 ciorne',
      'Alte documente PSI1 ciornă',
    ]);
    await user.click(sections[0]!);
    const rows = await screen.findAllByTestId('document-row');
    expect(rows.map((row) => within(row).getByTestId('document-title').textContent)).toEqual([
      'Copertă registre PSI',
      'Registre PSI',
      'Permis de lucru cu foc',
    ]);
    expect(rows[1]!.textContent).not.toContain('Decizia nr.');
    expect(within(rows[1]!).getByTestId('document-title').getAttribute('href')).toBe(
      `${firePath}/${registersId}`
    );
    expect(runtime.router.history.location.search).toBe('?section=registers');
  });

  it('asks only for what the set prints, each row leading to its field', async () => {
    mockApi({
      readiness: {
        ready: false,
        missing: [
          'provider.legalName',
          'provider.fireSafetyTechnician',
          'client.representativeName',
          'client.representativeRole',
        ],
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-missing-count')).textContent).toBe(
      '4 date de completat'
    );
    const places = screen.getAllByTestId('generate-missing-place');
    expect(places.map((place) => within(place).getByRole('heading').textContent)).toEqual([
      'Datele organizației',
      'Detaliile clientului',
    ]);
    const rows = screen.getAllByTestId('generate-missing-row');
    expect(rows.map((row) => [row.textContent, row.getAttribute('href')])).toEqual([
      ['Denumirea legală', '/organization/company?focus=legal-name'],
      [
        'Cadrul tehnic PSINumele lui apare pe documentele PSI.',
        '/organization/authorizations?focus=fire-safety-technician',
      ],
      [
        'Numele reprezentantului legal',
        `/clients/${clientId}/details?focus=legal-representative-name`,
      ],
      [
        'Funcția reprezentantului legal',
        `/clients/${clientId}/details?focus=legal-representative-role`,
      ],
    ]);
    expect(screen.queryByTestId('generate-headcount')).toBeNull();
    expect(screen.queryByTestId('generate-submit')).toBeNull();
    const [asked] = requests('/documents/readiness');
    expect(asked!.url.searchParams.get('set')).toBe('fire_safety');
  });

  it('comes back to the PSI form from the toast of a save made from one of its rows', async () => {
    mockApi({
      role: 'specialist',
      readiness: { ready: false, missing: ['client.representativeRole'] },
    });
    const runtime = mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    await user.click(await screen.findByTestId('generate-missing-row'));
    const role = await screen.findByTestId('details-representative-role');
    await waitFor(() => expect(document.activeElement).toBe(role));
    await user.type(role, 'Administrator');
    await user.click(screen.getByTestId('legal-representative-save'));
    await user.click(await screen.findByRole('button', { name: 'Înapoi la generare' }));

    expect(await screen.findByTestId('generate-documents-dialog')).toBeTruthy();
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(firePath));
  });

  it('generates with the issue date alone, without a first decision number', async () => {
    mockApi({ fireItems: [permit] });
    mount();
    const user = userEvent.setup();

    const open = await screen.findByTestId('documents-generate');
    expect(open.textContent).toContain('Generează documentele lipsă');
    await user.click(open);
    expect(await screen.findByTestId('generate-issue-date')).toBeTruthy();
    expect(screen.queryByTestId('generate-first-number')).toBeNull();
    expect(screen.queryByText('Numărul primei decizii')).toBeNull();
    expect(screen.queryByTestId('generate-headcount')).toBeNull();
    await user.click(screen.getByTestId('generate-submit'));

    expect(await screen.findByText('Au fost generate 2 documente.')).toBeTruthy();
    const [call] = requests('/documents/generate', 'POST');
    expect(call!.url.searchParams.get('set')).toBe('fire_safety');
    expect(Object.keys(JSON.parse(String(call!.init?.body)))).toEqual(['issueDate']);
  });

  it('says so when the templates of the set are not available yet', async () => {
    mockApi({
      generate: () =>
        Response.json(
          {
            error: 'service_unavailable',
            message: 'The document templates are not available yet.',
          },
          { status: 503 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    await user.click(await screen.findByTestId('generate-submit'));
    expect((await screen.findByTestId('generate-error')).textContent).toBe(
      'Documentele PSI nu pot fi generate încă: șabloanele lor nu sunt disponibile. Nu a fost generat niciun document.'
    );
  });

  it('opens a document in the editor and goes back to the PSI tab, at its section', async () => {
    mockApi({ fireItems: [cover, registers] });
    const runtime = mount();
    const user = userEvent.setup();

    await user.click((await screen.findAllByTestId('document-section-trigger'))[0]!);
    const [, title] = await screen.findAllByTestId('document-title');
    await user.click(title!);
    await screen.findByText('Salvat');
    const back = screen.getByTestId('editor-back');
    expect(back.getAttribute('aria-label')).toBe('Înapoi la documentele PSI');
    expect(back.textContent).toBe('Documente PSI');
    await user.click(back);

    await screen.findAllByTestId('document-row');
    expect(runtime.router.history.location.pathname).toBe(firePath);
    expect(runtime.router.history.location.search).toBe('?section=registers');
    expect(runtime.router.history.length).toBe(2);
  });

  it('finds a document opened directly in the PSI list, and links back to its section', async () => {
    mockApi({ fireItems: [cover, registers] });
    const runtime = mount(`${firePath}/${registersId}`);
    const user = userEvent.setup();

    await screen.findByText('Salvat');
    expect(
      requests('/documents').every(({ url }) => url.searchParams.get('set') === 'fire_safety')
    ).toBe(true);
    await user.click(screen.getByTestId('editor-back'));
    await screen.findAllByTestId('document-row');
    expect(runtime.router.history.location.pathname).toBe(firePath);
    expect(runtime.router.history.location.search).toBe('?section=registers');
  });

  it('generates nothing for an archived client', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect((await screen.findByTestId('documents-empty')).textContent).toContain(
      'Clientul este arhivat'
    );
    expect(screen.queryByTestId('documents-generate')).toBeNull();
  });
});
