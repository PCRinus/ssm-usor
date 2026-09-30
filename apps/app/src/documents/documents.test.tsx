import { documentTypeKeys } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
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

const firstAidId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const firstAid = {
  id: firstAidId,
  clientId,
  typeKey: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  decisionNumber: 5,
  draft: revision() as ReturnType<typeof revision> | null,
  issued: null as ReturnType<typeof revision> | null,
};
const report = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  typeKey: 'control_report',
  title: 'Referat de control',
  decisionNumber: null,
  draft: revision({ id: '1b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d' }),
  issued: null,
};

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  role = 'owner',
  items = [] as unknown[],
  lastGeneration = null as { issueDate: string; firstDecisionNumber: number } | null,
  notApplicable = [] as string[],
  readiness = { ready: true, missing: [] as string[] } as {
    ready: boolean;
    missing: string[];
    currentEmployeeCount?: number;
    workersRepresentativeClash?: { representativeName: string; legalRepresentativeName: string };
    undecidedJobPositions?: { id: string; name: string; undecided: string[] }[];
  },
  currentEmployeeCount = 6,
  generate = (() =>
    Response.json({ created: [firstAid, report], skipped: [] }, { status: 201 })) as Route,
  action = (() => Response.json({ document: firstAid })) as Route,
  upload = (() => Response.json({ document: firstAid })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
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
      return Response.json({ items, lastGeneration, notApplicable, currentEmployeeCount });
    }
    if (pathname === `/clients/${clientId}/documents/readiness`) {
      return Response.json({
        currentEmployeeCount,
        workersRepresentativeClash: null,
        undecidedJobPositions: [],
        ...readiness,
      });
    }
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails });
    }
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/responsible-persons`)
      return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/job-positions`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/documents/generate`) return generate(init);
    if (pathname.endsWith('/upload')) return upload(init);
    if (pathname.endsWith('/download')) {
      return Response.json({
        url: 'https://files.example.test/signed',
        fileName: 'Decizia privind responsabilii cu primul ajutor - rev. 1.docx',
        expiresInSeconds: 60,
      });
    }
    if (pathname === '/signed') return new Response(new Uint8Array([80, 75, 3, 4]));
    if (pathname.startsWith(`/documents/${firstAidId}/`)) {
      return method === 'DELETE' ? new Response(null, { status: 204 }) : action(init);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (suffix: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname.endsWith(suffix) && (init?.method ?? 'GET') === method
  );

const mount = () => mountApp(authFixture(makeSession()).client, `/clients/${clientId}/documents`);

async function openSection(user: ReturnType<typeof userEvent.setup>, number: string) {
  const trigger = (await screen.findAllByTestId('document-section-trigger')).find((item) =>
    item.textContent?.startsWith(`${number}. `)
  )!;
  if (trigger.getAttribute('data-state') !== 'open') await user.click(trigger);
}

const summaryOf = (number: string) =>
  screen
    .getAllByTestId('document-section')
    .find((item) => item.textContent?.startsWith(`${number}. `))!
    .querySelector('[data-testid="document-section-summary"]')!.textContent;

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string, section = '1') {
  await openSection(user, section);
  const row = (await screen.findAllByTestId('document-row')).find((item) =>
    item.textContent?.includes(title)
  )!;
  await user.click(within(row).getByTestId('document-actions'));
  return row;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('client documents', () => {
  it('is a section of the client, after the data the documents print', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('documents-page')).toBeTruthy();
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).toEqual([
      'Detalii',
      'Angajați',
      'Posturi de lucru',
      'Instruire și responsabili',
      'Documente SSM',
      'Alte documente',
    ]);
    expect(await screen.findByTestId('documents-empty')).toBeTruthy();
    expect(screen.getByTestId('documents-generate').textContent).toContain(
      'Generează documentația'
    );
  });

  it('lists what is missing as rows, by place, each leading to its field', async () => {
    mockApi({
      role: 'specialist',
      readiness: {
        ready: false,
        missing: [
          'provider.legalName',
          'specialist.professionalTitle',
          'client.representativeRole',
          'responsible.first_aid',
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
      'Profilul tău',
      'Detaliile clientului',
      'Instruire și responsabili',
    ]);
    const rows = screen.getAllByTestId('generate-missing-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Denumirea legală',
      'Titlul profesionalApare lângă numele tău în documente.',
      'Funcția reprezentantului legal',
      'Prim ajutorNicio persoană responsabilă nu are încă acest rol.',
    ]);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      null,
      '/profile?focus=professional-title',
      `/clients/${clientId}/details?focus=legal-representative-role`,
      `/clients/${clientId}/training?focus=first-aid`,
    ]);
    expect(places[0]!.textContent).toContain('Le completează proprietarul organizației.');
    expect(screen.queryByTestId('generate-submit')).toBeNull();
  });

  it('does not show the old missing list while asking again on reopening', async () => {
    mockApi({ readiness: { ready: false, missing: ['responsible.first_aid'] } });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('documents-generate'));
    await screen.findByTestId('generate-missing-place');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('generate-documents-dialog')).toBeNull());

    const answer = fetchMock.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname !== `/clients/${clientId}/documents/readiness`) {
        return answer(input, init);
      }
      await held;
      return Response.json({
        currentEmployeeCount: 6,
        ready: true,
        missing: [],
        workersRepresentativeClash: null,
        undecidedJobPositions: [],
      });
    });
    await user.click(screen.getByTestId('documents-generate'));
    await screen.findByTestId('generate-documents-dialog');
    expect(screen.queryByTestId('generate-missing-place')).toBeNull();
    release();
    await screen.findByTestId('generate-submit');
    expect(screen.queryByTestId('generate-missing-place')).toBeNull();
  });

  it('does not tell an owner to ask the owner', async () => {
    mockApi({ readiness: { ready: false, missing: ['provider.legalName'] } });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    const [place] = await screen.findAllByTestId('generate-missing-place');
    expect(place!.textContent).toBe('Datele organizațieiDenumirea legală');
    expect(within(place!).getByRole('link').getAttribute('href')).toBe(
      '/organization/company?focus=legal-name'
    );
  });

  it('has nothing to generate once every document the client needs exists', async () => {
    mockApi({
      items: documentTypeKeys
        .filter((typeKey) => typeKey !== 'decision_workers_representative')
        .map((typeKey) => ({ ...report, id: crypto.randomUUID(), typeKey })),
      notApplicable: ['decision_workers_representative'],
    });
    mount();
    await openSection(userEvent.setup(), '1');
    await screen.findAllByTestId('document-row');
    expect(screen.queryByTestId('documents-generate')).toBeNull();
    const skipped = screen.getByTestId('document-not-applicable');
    expect(skipped.textContent).toContain('Decizia privind reprezentanții lucrătorilor');
    expect(skipped.textContent).toContain('Nu se aplică');
  });

  it.each([
    [
      6,
      '6 angajați în lista clientului, așa că decizia privind reprezentanții lucrătorilor nu se generează',
    ],
    [
      12,
      '12 angajați în lista clientului, așa că se generează și decizia privind reprezentanții lucrătorilor, cu cel puțin un reprezentant',
    ],
    [
      50,
      '50 de angajați în lista clientului, așa că se generează și decizia privind reprezentanții lucrătorilor, cu cel puțin doi reprezentanți',
    ],
  ])('says before generating what %i employees mean for decision 1.5', async (count, rule) => {
    mockApi({ currentEmployeeCount: count });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-headcount')).textContent).toContain(rule);
  });

  it('has a row per position and per section still undecided, each to that section', async () => {
    mockApi({
      readiness: {
        ready: false,
        missing: ['positions.equipment', 'positions.instructions'],
        undecidedJobPositions: [
          { id: 'p1', name: 'Zidar', undecided: ['equipment', 'instructions'] },
          { id: 'p2', name: 'Sudor', undecided: ['equipment'] },
        ],
      },
    });
    mount();
    await userEvent.setup().click(await screen.findByTestId('documents-generate'));
    const place = await screen.findByTestId('generate-missing-place');
    expect(within(place).getByRole('heading').textContent).toBe('Posturile de lucru');
    const rows = within(place).getAllByRole('link');
    expect(
      rows.map((row) => row.textContent?.split('·')[0]!.trim() + ' · ' + row.getAttribute('href'))
    ).toEqual([
      `Zidar · /clients/${clientId}/job-positions/p1#protective-equipment`,
      `Zidar · /clients/${clientId}/job-positions/p1#instructions`,
      `Sudor · /clients/${clientId}/job-positions/p2#protective-equipment`,
    ]);
    expect(screen.getByTestId('generate-missing-count').textContent).toBe('3 date de completat');
  });

  it('shows the number of employees also while data is missing', async () => {
    mockApi({
      readiness: { ready: false, missing: ['responsible.workers_representative'] },
      currentEmployeeCount: 12,
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-headcount')).textContent).toContain('12 angajați');
    expect((await screen.findByTestId('generate-missing-place')).textContent).toContain(
      'Reprezentantul lucrătorilorAles dintre angajați.'
    );
  });

  it('says when decision 1.5 already exists instead of promising it again', async () => {
    mockApi({
      currentEmployeeCount: 12,
      items: [{ ...firstAid, typeKey: 'decision_workers_representative' }],
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('documents-generate'));
    const notice = (await screen.findByTestId('generate-headcount')).textContent;
    expect(notice).toContain('este nevoie de cel puțin un reprezentant al lucrătorilor');
    expect(notice).toContain('este deja generată');
    expect(notice).not.toContain('se generează și');
  });

  it("names the representative who has the legal representative's name", async () => {
    mockApi({
      readiness: {
        ready: false,
        missing: ['responsible.workers_representative_is_legal_representative'],
        workersRepresentativeClash: {
          representativeName: 'Talos Florin',
          legalRepresentativeName: 'Florin TALOȘ',
        },
      },
      currentEmployeeCount: 12,
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('documents-generate'));
    expect((await screen.findByTestId('generate-missing-place')).textContent).toContain(
      '„Talos Florin” are același nume ca reprezentantul legal al clientului, „Florin TALOȘ”'
    );
  });

  it('leads from a row to its field, and back to the form from the toast of the save', async () => {
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
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/details`);
    expect(screen.queryByTestId('generate-documents-dialog')).toBeNull();

    await user.type(role, 'Administrator');
    await user.click(screen.getByTestId('legal-representative-save'));
    expect(await screen.findByText('Reprezentantul legal a fost salvat.')).toBeTruthy();
    const asked = requests('/documents/readiness', 'GET').length;
    await user.click(screen.getByRole('button', { name: 'Înapoi la generare' }));
    expect(await screen.findByTestId('generate-documents-dialog')).toBeTruthy();
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/documents`)
    );
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    await waitFor(() =>
      expect(requests('/documents/readiness', 'GET').length).toBeGreaterThan(asked)
    );
    expect(sessionStorage.getItem('ssm-usor:way-back')).toBeNull();
  });

  const saveRepresentative = async (path: string) => {
    const runtime = mountApp(authFixture(makeSession()).client, path);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('legal-representative-edit'));
    await user.type(await screen.findByTestId('details-representative-role'), 'Administrator');
    await user.click(screen.getByTestId('legal-representative-save'));
    await screen.findByText('Reprezentantul legal a fost salvat.');
    return runtime;
  };

  const wayBackOf = (overrides: Record<string, unknown> = {}) =>
    sessionStorage.setItem(
      'ssm-usor:way-back',
      JSON.stringify({
        userId: 'user-one',
        clientId,
        to: 'documents',
        startedAt: Date.now(),
        ...overrides,
      })
    );

  it('offers the way back only while the person came from the form', async () => {
    mockApi({ role: 'specialist' });
    await saveRepresentative(`/clients/${clientId}/details`);
    expect(screen.queryByRole('button', { name: 'Înapoi la generare' })).toBeNull();
  });

  it('stops offering the way back an hour after the row was followed', async () => {
    mockApi({ role: 'specialist' });
    wayBackOf({ startedAt: Date.now() - 61 * 60 * 1000 });
    await saveRepresentative(`/clients/${clientId}/details`);
    expect(screen.queryByRole('button', { name: 'Înapoi la generare' })).toBeNull();
  });

  it("forgets the way back when another company's pages are opened", async () => {
    mockApi({ role: 'specialist' });
    wayBackOf({ clientId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' });
    mountApp(authFixture(makeSession()).client, `/clients/${clientId}/details`);
    await screen.findByTestId('client-details-page');
    await waitFor(() => expect(sessionStorage.getItem('ssm-usor:way-back')).toBeNull());
  });

  it('offers the way back from a save while the trip is on, for longer than a plain toast', async () => {
    mockApi({ role: 'specialist' });
    wayBackOf();
    const success = vi.spyOn(toast, 'success');
    await saveRepresentative(`/clients/${clientId}/details`);
    expect(screen.getByRole('button', { name: 'Înapoi la generare' })).toBeTruthy();
    expect(success).toHaveBeenCalledWith(
      'Reprezentantul legal a fost salvat.',
      expect.objectContaining({ duration: 10_000 })
    );
  });

  it('opens the form when the address asks for it, once', async () => {
    mockApi({ readiness: { ready: false, missing: ['responsible.first_aid'] } });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clients/${clientId}/documents?focus=generate`
    );
    expect(await screen.findByTestId('generate-documents-dialog')).toBeTruthy();
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('generates with the date and the first number of the last generation', async () => {
    mockApi({
      items: [report],
      lastGeneration: { issueDate: '2026-01-19', firstDecisionNumber: 3 },
    });
    mount();
    const user = userEvent.setup();

    const open = await screen.findByTestId('documents-generate');
    expect(open.textContent).toContain('Generează documentele lipsă');
    await user.click(open);
    expect((await screen.findByTestId<HTMLInputElement>('generate-issue-date')).value).toBe(
      '19.01.2026'
    );
    expect(screen.getByTestId<HTMLInputElement>('generate-first-number').value).toBe('3');
    await user.click(screen.getByTestId('generate-submit'));

    expect(await screen.findByText('Au fost generate 2 documente.')).toBeTruthy();
    const [call] = requests('/documents/generate', 'POST');
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      issueDate: '2026-01-19',
      firstDecisionNumber: 3,
    });
    await waitFor(() => expect(screen.queryByTestId('generate-documents-dialog')).toBeNull());
  });

  it('refuses a first number that is not a number', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    const number = await screen.findByTestId('generate-first-number');
    await user.clear(number);
    await user.type(number, 'trei');
    await user.click(screen.getByTestId('generate-submit'));

    expect((await screen.findByTestId('generate-first-number-error')).textContent).toContain(
      'între 1 și 9995'
    );
    expect(requests('/documents/generate', 'POST')).toHaveLength(0);
  });

  it('lists documents in the sections of the binder, one section open at a time', async () => {
    mockApi({
      items: [
        {
          ...firstAid,
          issued: revision({ status: 'issued', issuedAt: '2026-09-19T11:00:00+00:00' }),
          draft: revision({ revision: 2, dataChanged: true }),
        },
        report,
      ],
    });
    const runtime = mount();
    const user = userEvent.setup();

    await screen.findAllByTestId('document-section');
    expect(screen.queryByTestId('document-row')).toBeNull();
    expect(summaryOf('1')).toBe('1 emis · 1 ciornă · 1 cu date modificate');
    expect(summaryOf('2')).toBe('negenerat');
    expect(summaryOf('8')).toBe('1 ciornă');
    expect(summaryOf('9')).toBe('1 neîncărcat');

    await openSection(user, '1');
    const [decision] = await screen.findAllByTestId('document-row');
    expect(decision!.textContent).toContain('Decizia nr. 5 SSM');
    expect(within(decision!).getByTestId('document-issued').textContent).toBe('Emis · rev. 1');
    expect(within(decision!).getByTestId('document-draft').textContent).toBe('Ciornă · rev. 2');
    expect(within(decision!).getByTestId('document-data-changed')).toBeTruthy();
    expect(decision!.textContent).toContain('19.01.2026');
    expect(runtime.router.history.location.search).toBe('?section=decisions');

    await openSection(user, '8');
    await waitFor(() => expect(screen.getAllByTestId('document-row')).toHaveLength(1));
    const [form] = screen.getAllByTestId('document-row');
    expect(form!.textContent).toContain('Referat de control');
    expect(within(form!).queryByTestId('document-data-changed')).toBeNull();
    expect(runtime.router.history.location.search).toBe('?section=control-report');
    expect(runtime.router.history.length).toBe(1);
  });

  it('lists the instruction modules the own instructions annex, at the version they cite', async () => {
    const moduleId = 'c1c1c1c1-0000-4000-8000-000000000001';
    const annexed = 'c1c1c1c1-0000-4000-8000-000000000011';
    mockApi({
      items: [
        {
          ...report,
          typeKey: 'own_instructions',
          title: 'Instrucțiuni proprii de securitate și sănătate în muncă',
          draft: revision({
            annexes: [
              {
                number: 1,
                title: 'Scări metalice',
                moduleId,
                version: { id: annexed, number: 1, createdAt: '2026-09-26T10:00:00+00:00' },
                newerVersion: { number: 2, createdAt: '2026-10-02T10:00:00+00:00' },
              },
            ],
          }),
        },
      ],
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname === `/instruction-modules/${moduleId}/file-link`
        ? Response.json({
            url: 'https://files.example.test/signed',
            fileName: 'Scări metalice - versiunea 1.docx',
            expiresAt: '2026-10-02T10:01:00.000Z',
            version: { id: annexed, number: 1, createdAt: '2026-09-26T10:00:00+00:00' },
          })
        : fallback(input, init)
    );
    mount();
    const user = userEvent.setup();

    await openSection(user, '3');
    const [annex] = await screen.findAllByTestId('document-annex');
    expect(within(annex!).getByTestId('document-annex-title').textContent).toBe(
      'Anexa 1: I.P.S.S.M. Scări metalice'
    );
    expect(within(annex!).getByTestId('document-annex-title').getAttribute('href')).toBe(
      `/instructions/${moduleId}?version=${annexed}`
    );
    expect(annex!.textContent).toContain('Versiunea 1');
    expect(annex!.textContent).toContain('26.09.2026');
    expect(within(annex!).getByTestId('document-annex-newer').textContent).toBe(
      'Versiune nouă în bibliotecă · 02.10.2026'
    );

    await user.click(within(annex!).getByTestId('document-annex-actions'));
    await user.click(await screen.findByTestId('document-annex-download'));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const address = new URL((click.mock.contexts[0] as HTMLAnchorElement).href);
    expect(address.searchParams.get('name')).toBe('Scări metalice - versiunea 1.docx');
    const link = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === `/instruction-modules/${moduleId}/file-link`)!;
    expect(link.searchParams.get('versionId')).toBe(annexed);
  });

  it('links every document to the editor and marks a draft edited by hand', async () => {
    mockApi({
      items: [{ ...firstAid, draft: revision({ editedAt: '2026-09-19T12:00:00+00:00' }) }, report],
    });
    mount();
    const user = userEvent.setup();

    const decision = await openMenu(user, 'primul ajutor');
    expect(within(decision).getByTestId('document-title').getAttribute('href')).toBe(
      `/clients/${clientId}/documents/${firstAidId}`
    );
    expect(within(decision).getByTestId('document-edited').textContent).toBe('Modificat');

    expect((await screen.findByTestId('document-open')).textContent).toBe('Deschide și modifică');
    await user.click(screen.getByTestId('document-regenerate'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'modificările tale se pierd'
    );
  });

  it('downloads a draft through the API under its name, without fetching it into the page', async () => {
    mockApi({ items: [firstAid] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-download-draft'));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    const address = new URL(anchor.href);
    expect(address.origin + address.pathname).toBe('http://localhost:8787/files/download');
    expect(address.searchParams.get('source')).toBe('https://files.example.test/signed');
    expect(address.searchParams.get('name')).toBe(
      'Decizia privind responsabilii cu primul ajutor - rev. 1.docx'
    );
    expect(anchor.target).toBe('');
    expect(requests(`/revisions/${firstAid.draft!.id}/download`, 'GET')).toHaveLength(1);
    expect(requests('/signed', 'GET')).toHaveLength(0);
  });

  it('offers the PDF of an issued revision that has one, and asks the API for that format', async () => {
    const issued = revision({ status: 'issued', issuedAt: '2026-09-19T11:00:00+00:00' });
    mockApi({
      items: [
        { ...firstAid, draft: null, issued: { ...issued, hasPdf: true } },
        { ...report, draft: null, issued },
      ],
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    );
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-download-pdf'));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const [[url]] = requests('/download', 'GET') as [[string]];
    expect(new URL(String(url)).searchParams.get('format')).toBe('pdf');

    // Issued before PDFs were made, or where no converter runs.
    await openMenu(user, report.title, '8');
    expect(await screen.findByTestId('document-download-issued')).toBeTruthy();
    expect(screen.queryByTestId('document-download-pdf')).toBeNull();
  });

  it('prints a draft through a PDF made of its file, and an issued revision from its own PDF', async () => {
    const issued = revision({
      id: '2c3e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
      status: 'issued',
      issuedAt: '2026-09-19T11:00:00+00:00',
    });
    mockApi({
      items: [{ ...firstAid, issued: { ...issued, hasPdf: true } }],
      action: () => new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:printed', revokeObjectURL: () => {} })
    );
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-print-draft'));
    await waitFor(() => expect(requests('/print', 'POST')).toHaveLength(1));
    expect(requests(`/revisions/${firstAid.draft!.id}/download`, 'GET')).toHaveLength(1);
    expect(await screen.findByTestId('print-frame')).toBeTruthy();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-print-issued'));
    await waitFor(() =>
      expect(requests(`/revisions/${issued.id}/download`, 'GET').length).toBeGreaterThan(0)
    );
    const [[url]] = requests(`/revisions/${issued.id}/download`, 'GET') as [[string]];
    expect(new URL(String(url)).searchParams.get('format')).toBe('pdf');
    expect(requests('/print', 'POST')).toHaveLength(1);
  });

  it('downloads the PDF to print where the browser cannot show one', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    mockApi({
      items: [firstAid],
      action: () => new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    );
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-print-draft'));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'Decizia privind responsabilii cu primul ajutor.pdf'
    );
    expect(await screen.findByText(/Deschide fișierul și tipărește-l/)).toBeTruthy();
  });

  it('says so when a document cannot be prepared for printing', async () => {
    mockApi({
      items: [firstAid],
      action: () =>
        Response.json(
          { error: 'service_unavailable', message: 'No PDF.', reason: 'pdf_unavailable' },
          { status: 503 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-print-draft'));

    expect((await screen.findByTestId('documents-error')).textContent).toContain(
      'serviciul care face PDF-ul nu răspunde acum'
    );
  });

  it('says that nothing was issued when the PDF could not be made', async () => {
    mockApi({
      items: [firstAid],
      action: () =>
        Response.json(
          { code: 'service_unavailable', message: 'No PDF.', reason: 'pdf_unavailable' },
          { status: 503 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-issue'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain('PDF');
    await user.click(screen.getByTestId('document-confirm'));
    expect((await screen.findByTestId('documents-error')).textContent).toContain(
      'documentul nu a fost emis'
    );
  });

  it('issues a draft after a confirmation that says it becomes final', async () => {
    mockApi({ items: [firstAid] });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-issue'));
    const dialog = await screen.findByTestId('document-confirm-dialog');
    expect(dialog.textContent).toContain('Un document emis nu se mai modifică');
    await user.click(screen.getByTestId('document-confirm'));

    expect(await screen.findByText(/a fost emis\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/issue`, 'POST')).toHaveLength(1);
  });

  it('asks again before issuing a file that still has text to fill in', async () => {
    mockApi({
      items: [firstAid],
      action: (init) =>
        JSON.parse(String(init?.body ?? '{}')).acceptUnfilled === true
          ? Response.json({ document: firstAid })
          : Response.json(
              { code: 'conflict', message: 'Unfilled.', reason: 'unfilled_text' },
              { status: 409 }
            ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-issue'));
    await user.click(await screen.findByTestId('document-confirm'));

    const confirm = await screen.findByRole('button', { name: 'Emite oricum' });
    expect(screen.getByTestId('document-confirm-dialog').textContent).toContain('„DE COMPLETAT”');
    expect(screen.queryByTestId('documents-error')).toBeNull();
    await user.click(confirm);

    expect(await screen.findByText(/a fost emis\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/issue`, 'POST')).toHaveLength(2);
  });

  it('waits for a file where the app cannot write the document, and takes one', async () => {
    mockApi({ items: [firstAid] });
    mount();
    const user = userEvent.setup();

    await screen.findAllByTestId('document-section');
    expect(['4', '9', '10'].map(summaryOf)).toEqual(Array(3).fill('1 neîncărcat'));

    await openSection(user, '9');
    const [slot] = await screen.findAllByTestId('document-slot');
    expect(slot!.textContent).toContain('Evaluarea riscurilor');
    expect(slot!.textContent).toContain('Neîncărcat');

    await user.click(within(slot!).getByTestId('document-slot-upload'));
    const file = new File([new Uint8Array([80, 75, 3, 4])], 'evaluare.docx');
    await user.upload(screen.getByTestId<HTMLInputElement>('document-file-input'), file);

    expect(await screen.findByText(/Evaluarea riscurilor.*a fost încărcat ca ciornă/)).toBeTruthy();
    const [[url, init]] = requests('/documents/risk_assessment/upload', 'POST') as [
      [string, RequestInit],
    ];
    expect(String(url)).toContain(`/clients/${clientId}/documents/risk_assessment/upload`);
    expect(init.body).toBe(file);
  });

  it('asks before a file replaces a draft, offers no regeneration for an uploaded document, and says what a refused file is', async () => {
    const assessment = {
      ...firstAid,
      id: 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607',
      typeKey: 'risk_assessment',
      title: 'Evaluarea riscurilor de accidentare și îmbolnăvire profesională',
      decisionNumber: null,
      draft: revision({ editedAt: '2026-09-19T12:00:00+00:00', issueDate: null }),
    };
    mockApi({
      items: [firstAid, assessment],
      upload: () =>
        Response.json({ code: 'validation_error', message: 'Not a docx.' }, { status: 400 }),
    });
    mount();
    const user = userEvent.setup();

    const row = await openMenu(user, 'Evaluarea riscurilor', '9');
    expect(within(row).getByTestId('document-uploaded').textContent).toBe('Încărcat');
    expect(within(row).queryByTestId('document-edited')).toBeNull();
    expect(screen.queryByTestId('document-regenerate')).toBeNull();
    await user.click(screen.getByTestId('document-upload'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'ia locul ciornei'
    );
    await user.click(screen.getByTestId('document-confirm'));
    await user.upload(
      screen.getByTestId<HTMLInputElement>('document-file-input'),
      new File(['text'], 'evaluare.docx')
    );

    expect((await screen.findByTestId('documents-error')).textContent).toContain('.docx');
  });

  it('warns that regenerating a draft loses hand edits, and deletes a draft', async () => {
    mockApi({ items: [firstAid] });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-regenerate'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'Modificările făcute de mână în fișier se pierd'
    );
    await user.click(screen.getByTestId('document-confirm'));
    expect(await screen.findByText(/a fost generat din nou\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/regenerate`, 'POST')).toHaveLength(1);

    await waitFor(() => expect(screen.queryByTestId('document-confirm-dialog')).toBeNull());
    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-delete-draft'));
    await user.click(await screen.findByTestId('document-confirm'));
    expect(await screen.findByText(/Ciorna pentru .* a fost ștearsă\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/draft`, 'DELETE')).toHaveLength(1);
  });

  it('starts a draft from an issued document and opens it, and says what regenerating leaves out', async () => {
    const issued = revision({ status: 'issued', issuedAt: '2026-09-19T11:00:00+00:00' });
    mockApi({ items: [{ ...firstAid, draft: null, issued }, report] });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'Referat de control', '8');
    expect(screen.queryByTestId('document-edited')).toBeNull();
    expect(screen.queryByTestId('document-start-draft')).toBeNull();
    await user.keyboard('{Escape}');

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-regenerate'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'Ca să le păstrezi, alege „Modifică documentul emis”'
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('document-confirm-dialog')).toBeNull());

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-start-draft'));
    await waitFor(() => expect(requests(`/documents/${firstAidId}/draft`, 'POST')).toHaveLength(1));
    expect(await screen.findByTestId('editor-back')).toBeTruthy();
  });

  it('goes back to the list it was opened from, instead of adding the list again', async () => {
    mockApi({ items: [firstAid, report] });
    const runtime = mount();
    const user = userEvent.setup();
    await openSection(user, '1');
    const [title] = await screen.findAllByTestId('document-title');
    await user.click(title!);
    await screen.findByText('Salvat');
    await user.click(screen.getByTestId('editor-back'));
    await screen.findAllByTestId('document-row');
    expect(runtime.router.history.location.pathname).toBe(`/clients/${clientId}/documents`);
    expect(runtime.router.history.location.search).toBe('?section=decisions');
    expect(runtime.router.history.length).toBe(2);
  });

  it("follows the link to the list from an editor opened directly, to the document's section", async () => {
    mockApi({ items: [firstAid, report] });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clients/${clientId}/documents/${firstAidId}`
    );
    const user = userEvent.setup();
    // The placeholder's back link is replaced once the editor loads.
    await screen.findByText('Salvat');
    await user.click(screen.getByTestId('editor-back'));
    await screen.findAllByTestId('document-row');
    expect(runtime.router.history.location.pathname).toBe(`/clients/${clientId}/documents`);
    expect(runtime.router.history.location.search).toBe('?section=decisions');
    expect(runtime.router.history.length).toBe(2);
  });

  it('points to the generation form when regenerating is refused for missing data', async () => {
    mockApi({
      items: [firstAid],
      action: () =>
        Response.json(
          { error: 'conflict', message: 'missing', reason: 'missing_document_data' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-regenerate'));
    await user.click(await screen.findByTestId('document-confirm'));

    expect((await screen.findByTestId('documents-error')).textContent).toContain('Lipsesc date');
  });

  it('says what a decision 1.5 needs when regenerating it is refused', async () => {
    mockApi({
      items: [
        {
          ...firstAid,
          typeKey: 'decision_workers_representative',
          title: 'Decizia privind reprezentanții lucrătorilor',
        },
      ],
      action: () =>
        Response.json(
          { error: 'conflict', message: 'missing', reason: 'missing_document_data' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'reprezentanții lucrătorilor');
    await user.click(await screen.findByTestId('document-regenerate'));
    await user.click(await screen.findByTestId('document-confirm'));

    expect((await screen.findByTestId('documents-error')).textContent).toContain(
      'cel puțin un reprezentant al lucrătorilor'
    );
  });

  it('only offers downloads and printing for an archived client', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      items: [firstAid],
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    expect(await screen.findByTestId('document-download-draft')).toBeTruthy();
    expect(screen.getByTestId('document-print-draft')).toBeTruthy();
    expect(screen.queryByTestId('document-regenerate')).toBeNull();
    expect(screen.queryByTestId('document-issue')).toBeNull();
    expect(screen.queryByTestId('documents-generate')).toBeNull();
  });
});
