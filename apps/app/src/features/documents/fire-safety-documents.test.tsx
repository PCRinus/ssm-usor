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
  behind = [] as unknown[],
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
    if (pathname === '/documents/behind') return Response.json({ items: behind });
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

async function openSection(user: ReturnType<typeof userEvent.setup>, number: string) {
  const trigger = (await screen.findAllByTestId('document-section-trigger')).find((item) =>
    item.textContent?.startsWith(`${number}. `)
  )!;
  if (trigger.getAttribute('data-state') !== 'open') await user.click(trigger);
}

const sectionOf = (number: string) =>
  screen
    .getAllByTestId('document-section')
    .find((item) => item.textContent?.startsWith(`${number}. `))!;

const allBuilt = [
  ...(
    [
      ['fire_cover_decisions', 'Copertă – Deciziile interne în domeniul situațiilor de urgență'],
      ['fire_decision_organization', 'Decizia privind organizarea apărării împotriva incendiilor'],
      ['fire_decision_training', 'Decizia privind instruirea în domeniul situațiilor de urgență'],
      ['fire_decision_open_fire', 'Decizia privind lucrul cu foc deschis'],
      ['fire_decision_smoking', 'Decizia privind fumatul'],
      ['fire_decision_seasons', 'Decizia privind perioadele caniculare și sezonul rece'],
      ['fire_decision_technician', 'Decizia privind cadrul tehnic PSI'],
      [
        'fire_decision_instructions',
        'Decizia privind instrucțiunile de apărare împotriva incendiilor',
      ],
      ['fire_decision_waste', 'Decizia privind colectarea deșeurilor'],
      ['fire_decision_control', 'Decizia privind controlul propriu'],
      [
        'fire_cover_own_instructions',
        'Copertă – Instrucțiunile proprii în domeniul situațiilor de urgență',
      ],
      ['fire_own_instructions', 'Instrucțiuni proprii în domeniul situațiilor de urgență'],
      ['fire_means_list', 'Lista mijloacelor de apărare împotriva incendiilor'],
      [
        'fire_workplace_organization',
        'Organizarea apărării împotriva incendiilor la locul de muncă',
      ],
    ] as const
  ).map(([typeKey, title], index) =>
    fireDocument(`${index}0e1f2a3-2a6b-4c3d-8e7f-1a2b3c4d5e6f`, typeKey, title)
  ),
  cover,
  registers,
  permit,
  fireDocument(
    '9b4c5d9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
    'fire_installation_register',
    'Registru de control pentru instalațiile de apărare împotriva incendiilor'
  ),
  fireDocument(
    'ac5d6e9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
    'fire_extinguisher_register',
    'Registru de evidență a controlului stingătoarelor de incendiu'
  ),
];

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
        'Mijloace PSI',
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
    expect((await screen.findByTestId('documents-hint')).textContent).toBe(
      'Generează documentația ca să obții registrele și formularele. Documentele în pregătire vor putea fi generate pe măsură ce sunt adăugate în aplicație.'
    );
    expect(screen.queryByTestId('documents-empty')).toBeNull();
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

  it('lists the whole binder before anything is generated, every section closed', async () => {
    mockApi();
    mount();

    const sections = await screen.findAllByTestId('document-section-trigger');
    expect(sections.map((section) => section.textContent)).toEqual([
      '1. Decizii internenegenerat',
      '2. Instrucțiuni proprii în domeniul situațiilor de urgențănegenerat',
      '3. Tematica de instruireîn pregătire',
      '4. Teste de verificare a cunoștințelorîn pregătire',
      '5. Mijloace de apărare și organizarea la locul de muncănegenerat',
      '6. Registre și formulare PSInegenerat',
    ]);
    expect(sections.map((section) => section.getAttribute('data-state'))).toEqual(
      Array(6).fill('closed')
    );
    expect(screen.queryByTestId('document-row')).toBeNull();
  });

  it('shows a document not generated yet and one the app cannot write yet, muted and inert', async () => {
    mockApi({ fireItems: [registers] });
    mount();
    const user = userEvent.setup();

    await openSection(user, '6');
    const missing = await screen.findAllByTestId('document-not-generated');
    expect(missing.map((row) => row.textContent)).toEqual([
      'Copertă – Registrele de evidență în domeniul situațiilor de urgențăNegenerat',
      'Permis de lucru cu focNegenerat',
      'Registru de control pentru instalațiile de apărare împotriva incendiilorNegenerat',
      'Registru de evidență a controlului stingătoarelor de incendiuNegenerat',
    ]);
    const built = sectionOf('6');
    expect(
      within(built)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.getAttribute('data-testid'))
    ).toEqual([
      'document-not-generated',
      'document-row',
      'document-not-generated',
      'document-not-generated',
      'document-not-generated',
    ]);
    for (const row of missing) {
      expect(within(row).queryByRole('link')).toBeNull();
      expect(within(row).queryByTestId('document-actions')).toBeNull();
      expect(row.querySelector('td')!.className).toContain('text-muted-foreground');
    }

    await openSection(user, '1');
    expect(
      within(sectionOf('1'))
        .getAllByRole('row')
        .slice(1)
        .map((row) => [row.getAttribute('data-testid'), row.querySelector('td')!.textContent])
    ).toEqual([
      ['document-not-generated', 'Copertă – Deciziile interne în domeniul situațiilor de urgență'],
      ['document-not-generated', 'Decizia privind organizarea apărării împotriva incendiilor'],
      ['document-not-generated', 'Decizia privind instruirea în domeniul situațiilor de urgență'],
      ['document-not-generated', 'Decizia privind lucrul cu foc deschis'],
      ['document-not-generated', 'Decizia privind fumatul'],
      ['document-not-generated', 'Decizia privind perioadele caniculare și sezonul rece'],
      ['document-not-generated', 'Decizia privind cadrul tehnic PSI'],
      ['document-not-generated', 'Decizia privind instrucțiunile de apărare împotriva incendiilor'],
      ['document-not-generated', 'Decizia privind colectarea deșeurilor'],
      ['document-not-generated', 'Decizia privind controlul propriu'],
    ]);

    await openSection(user, '2');
    expect(
      within(sectionOf('2'))
        .getAllByRole('row')
        .slice(1)
        .map((row) => [row.getAttribute('data-testid'), row.querySelector('td')!.textContent])
    ).toEqual([
      [
        'document-not-generated',
        'Copertă – Instrucțiunile proprii în domeniul situațiilor de urgență',
      ],
      ['document-not-generated', 'Instrucțiuni proprii în domeniul situațiilor de urgență'],
    ]);

    await openSection(user, '3');
    const planned = await screen.findAllByTestId('document-planned');
    expect(planned.map((row) => row.querySelector('td')!.textContent)).toEqual([
      'Copertă – Tematica de instruire în domeniul situațiilor de urgență',
      'Tematica de instruire în domeniul situațiilor de urgență',
    ]);
    for (const row of planned) {
      expect(within(row).queryByRole('link')).toBeNull();
      expect(within(row).queryByTestId('document-actions')).toBeNull();
      expect(row.querySelector('td')!.className).toContain('text-muted-foreground');
      const state = within(row).getByText('În pregătire');
      expect(state.getAttribute('title')).toBe('Aplicația nu poate genera încă acest document.');
    }
    expect(screen.queryByTestId('documents-hint')).toBeNull();
    expect(screen.getByTestId('documents-generate').textContent).toContain(
      'Generează documentele lipsă'
    );
  });

  it('opens the section named in the address alone', async () => {
    mockApi();
    mount(`${firePath}?section=tests`);

    const sections = await screen.findAllByTestId('document-section-trigger');
    expect(sections.map((section) => section.getAttribute('data-state'))).toEqual([
      'closed',
      'closed',
      'closed',
      'open',
      'closed',
      'closed',
    ]);
    expect(
      within(sectionOf('4'))
        .getAllByTestId('document-planned')
        .map((row) => row.querySelector('td')!.textContent)
    ).toEqual([
      'Copertă – Testele de verificare a cunoștințelor',
      'Test la angajare',
      'Test anual',
    ]);
  });

  it('has nothing to generate once every built document exists', async () => {
    mockApi({ fireItems: allBuilt });
    mount();
    const user = userEvent.setup();

    await openSection(user, '6');
    expect(await screen.findAllByTestId('document-row')).toHaveLength(5);
    expect(screen.queryByTestId('document-not-generated')).toBeNull();
    expect(screen.queryByTestId('documents-generate')).toBeNull();
    expect(screen.queryByTestId('documents-hint')).toBeNull();
    expect(
      sectionOf('6').querySelector('[data-testid="document-section-summary"]')!.textContent
    ).toBe('5 ciorne');
    expect(
      sectionOf('5').querySelector('[data-testid="document-section-summary"]')!.textContent
    ).toBe('2 ciorne');
    expect(
      sectionOf('1').querySelector('[data-testid="document-section-summary"]')!.textContent
    ).toBe('10 ciorne');
    expect(
      sectionOf('2').querySelector('[data-testid="document-section-summary"]')!.textContent
    ).toBe('2 ciorne');
  });

  it('lists the registers and forms in the order of the binder, under its number', async () => {
    const extra = fireDocument(
      '8a3b4c9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
      'fire_evacuation_plan',
      'Planul de evacuare'
    );
    mockApi({ fireItems: [permit, extra, registers, cover] });
    const runtime = mount();
    const user = userEvent.setup();

    const sections = await screen.findAllByTestId('document-section-trigger');
    expect(sections.map((section) => section.textContent).slice(5)).toEqual([
      '6. Registre și formulare PSI3 ciorne · 2 negenerate',
      'Alte documente PSI1 ciornă',
    ]);
    await user.click(sections[5]!);
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
          'provider.fireSafetyTechnicianCertificate',
          'client.representativeName',
          'client.representativeRole',
        ],
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-missing-count')).textContent).toBe(
      '5 date de completat'
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
        'Certificatul cadrului tehnic PSIDecizia de numire a cadrului tehnic PSI îl tipărește.',
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

  it('generates with the issue date and the number of the first PSI decision', async () => {
    mockApi({ fireItems: [permit] });
    mount();
    const user = userEvent.setup();

    const open = await screen.findByTestId('documents-generate');
    expect(open.textContent).toContain('Generează documentele lipsă');
    await user.click(open);
    expect(await screen.findByTestId('generate-issue-date')).toBeTruthy();
    const number = screen.getByTestId<HTMLInputElement>('generate-first-number');
    expect(number.value).toBe('1');
    expect(screen.getByText('Numărul primei decizii PSI')).toBeTruthy();
    expect(screen.queryByTestId('generate-headcount')).toBeNull();

    await user.clear(number);
    await user.type(number, '9992');
    await user.click(screen.getByTestId('generate-submit'));
    expect((await screen.findByTestId('generate-first-number-error')).textContent).toContain(
      'Introdu un număr între 1 și 9991.'
    );
    expect(requests('/documents/generate', 'POST')).toHaveLength(0);

    await user.clear(number);
    await user.type(number, '4');
    await user.click(screen.getByTestId('generate-submit'));
    expect(await screen.findByText('Au fost generate 2 documente.')).toBeTruthy();
    const [call] = requests('/documents/generate', 'POST');
    expect(call!.url.searchParams.get('set')).toBe('fire_safety');
    expect(JSON.parse(String(call!.init?.body))).toMatchObject({ firstDecisionNumber: 4 });
  });

  it('leads each gap in the client data of the set to the field that fills it', async () => {
    mockApi({
      readiness: {
        ready: false,
        missing: [
          'fire.trainingSchedule',
          'fire.smokingPolicy',
          'fire.waste',
          'responsible.workplace_manager',
          'responsible.fire_safety_coordinator',
          'responsible.fire_intervention_leader',
          'positions.any',
          'fire.workplaces',
          'fire.equipment',
        ],
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-missing-count')).textContent).toBe(
      '9 date de completat'
    );
    const rows = screen.getAllByTestId('generate-missing-row');
    expect(rows.at(-1)!.textContent).toBe(
      'Cel puțin un post de lucruDecizia privind instruirea PSI enumeră posturile de lucru ale clientului.'
    );
    const client = `/clients/${clientId}`;
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      `${client}/details?focus=workplace-fire-data`,
      `${client}/fire-safety-means?focus=fire-equipment`,
      `${client}/training?focus=fire-training-schedule`,
      `${client}/training?focus=fire-smoking`,
      `${client}/training?focus=fire-waste`,
      `${client}/training?focus=workplace-manager`,
      `${client}/training?focus=fire-safety-coordinator`,
      `${client}/training?focus=fire-intervention-leader`,
      `${client}/job-positions?focus=add-position`,
    ]);
    expect(screen.queryByTestId('generate-first-number')).toBeNull();
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

    await openSection(user, '6');
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

    expect((await screen.findByTestId('documents-hint')).textContent).toBe(
      'Clientul este arhivat, așa că nu i se mai generează documente.'
    );
    expect(await screen.findAllByTestId('document-section')).toHaveLength(6);
    expect(screen.queryByTestId('documents-empty')).toBeNull();
    expect(screen.queryByTestId('documents-generate')).toBeNull();
  });
});
