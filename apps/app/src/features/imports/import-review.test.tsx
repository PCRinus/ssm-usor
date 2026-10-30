import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  bodyOf,
  clientId,
  fetchMock,
  importFile,
  importId,
  mockApi,
  proposalFixture,
  readyDetail,
  requestsTo,
} from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

type Detail = ReturnType<typeof readyDetail>;

const existingClient = {
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
  contactPhone: '0269 214 300',
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

let saves: number;

function mockReview(
  detail: Detail,
  { save, confirm }: { save?: (body: unknown) => Response; confirm?: () => Response } = {}
) {
  saves = 0;
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: detail });
    }
    if (url.pathname === `/imports/${importId}/changes`) {
      saves += 1;
      const body = JSON.parse(String(init?.body)) as { version: number };
      return save?.(body) ?? Response.json({ version: body.version + 1 });
    }
    if (url.pathname === `/imports/${importId}/confirm`) {
      return confirm?.() ?? Response.json({ clientId, fileCount: 3 });
    }
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === '/clients') {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client: existingClient });
    if (url.pathname === `/clients/${clientId}/document-details`) {
      return Response.json({
        documentDetails: {
          legalRepresentativeName: null,
          legalRepresentativeRole: null,
          legalRepresentativeEmployeeId: null,
          legalRepresentativeEmployee: null,
          periodicTrainingMinutes: null,
          administrativeTrainingIntervalMonths: null,
          administrativeTrainingNotApplicable: false,
          workerTrainingIntervalMonths: null,
          workerTrainingNotApplicable: false,
          trainingFirstMonth: null,
          trainingDayFrom: null,
          trainingDayTo: null,
        },
      });
    }
    if (url.pathname === `/clients/${clientId}/fire-safety`) {
      return Response.json({ fireSafety: null });
    }
    if (url.pathname.startsWith(`/clients/${clientId}/`)) return Response.json({}, { status: 404 });
    return undefined;
  });
}

const mount = (path = '') =>
  mountApp(authFixture(makeSession()).client, `/clients/import/${importId}${path}`);

const savedChanges = (index: number) =>
  bodyOf(`/imports/${importId}/changes`, 'PUT', index) as {
    version: number;
    changes: { fields: Record<string, unknown>; items: Record<string, unknown> };
  };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the review hub', () => {
  it('lists what blocks confirming, links each to its row, and gives each section a status', async () => {
    mockReview(readyDetail());
    mount();

    const blockers = await screen.findByTestId('import-blockers');
    expect(blockers.textContent).toContain('Mai ai 2 alegeri și o dată obligatorie');
    const links = within(blockers).getAllByTestId('import-blocker-link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Alege reprezentantul legal',
      'Alege firma de salubritate',
      'Scrie data angajării lui Lazăr Radu, reprezentantul lucrătorilor',
    ]);
    expect(links[0]!.getAttribute('href')).toBe(
      `/clients/import/${importId}/identity#review-client-legalRepresentativeName`
    );
    const statuses = Object.fromEntries(
      screen
        .getAllByTestId('import-section-link')
        .map((link) => [
          link.dataset.section,
          within(link).getByTestId('section-status').textContent,
        ])
    );
    expect(statuses).toEqual({
      identity: 'Alegere necesară',
      workplaces: 'Gata',
      'job-positions': 'De verificat',
      responsible: 'O dată lipsă',
      training: 'Gata',
      'fire-safety': 'Alegere necesară',
      equipment: 'Gata',
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Brutăria Spicul Auriu SRL');
    const confirm = screen.getByTestId('import-confirm');
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(confirm);
    expect(screen.queryByTestId('import-confirm-dialog')).toBeNull();
  });

  it('says the proposal comes from one file in the singular', async () => {
    mockReview(readyDetail({ files: [importFile({ fileName: 'Decizie 1.docx' })] }));
    mount();
    expect((await screen.findByTestId('import-review-hub')).textContent).toContain(
      'Propunere dintr-un fișier citit'
    );
  });

  it('shows the cost and tokens of the reading when the API serves them', async () => {
    const step = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 };
    mockReview(
      readyDetail({
        usage: {
          costUsd: 0.27,
          inputTokens: 182000,
          cachedInputTokens: 31000,
          outputTokens: 6400,
          readCharacters: 410000,
          bySteps: {
            sorting: { ...step, costUsd: 0.01 },
            reading: { ...step, costUsd: 0.22 },
            scanning: { ...step, costUsd: 0.04 },
          },
        },
      })
    );
    mount();
    expect((await screen.findByTestId('import-usage')).textContent).toBe(
      'Depanare: cost citire 0,27\u00a0$ · 182.000 tokeni intrare (31.000 din cache) · 6.400 ieșire · 410.000 caractere citite · sortare 0,01\u00a0$, citire 0,22\u00a0$, scanare 0,04\u00a0$'
    );
  });

  it('leaves out the steps that used no model and the characters not counted yet', async () => {
    mockReview(
      readyDetail({
        usage: {
          costUsd: 0.2,
          inputTokens: 1500,
          cachedInputTokens: 0,
          outputTokens: 300,
          readCharacters: null,
          bySteps: {
            reading: { costUsd: 0.2, inputTokens: 1500, cachedInputTokens: 0, outputTokens: 300 },
          },
        },
      })
    );
    mount();
    expect((await screen.findByTestId('import-usage')).textContent).toBe(
      'Depanare: cost citire 0,20\u00a0$ · 1.500 tokeni intrare (0 din cache) · 300 ieșire · citire 0,20\u00a0$'
    );
  });

  it('shows no cost when the API serves none', async () => {
    mockReview(readyDetail());
    mount();
    await screen.findByTestId('import-review-hub');
    expect(screen.queryByTestId('import-usage')).toBeNull();
  });

  it('confirms a new client and opens its page with what was imported', async () => {
    mockReview(readyDetail({ blockers: [] }));
    const runtime = mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Creezi clientul Brutăria Spicul Auriu SRL?'
    );
    expect(
      within(dialog)
        .getAllByTestId('confirm-line')
        .map((line) => line.textContent)
    ).toEqual([
      expect.stringContaining('1punct de lucru'),
      expect.stringContaining('1post de lucru'),
      expect.stringContaining('1responsabil'),
      expect.stringContaining('1angajat'),
      expect.stringContaining('6mijloace PSI'),
    ]);
    expect(dialog.textContent).toContain('Nu preluăm un element de la alt client.');
    await userEvent.click(within(dialog).getByTestId('import-confirm-submit'));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/details`)
    );
    expect(bodyOf(`/imports/${importId}/confirm`, 'POST')).toEqual({ version: 3 });
    expect((await screen.findByTestId('client-imported-notice')).textContent).toContain(
      'Clientul a fost creat din documente. Cele 3 fișiere sunt în Alte documente, grupate ca dosarul importat.'
    );
  });
});

describe('a section of the review', () => {
  it('puts the choice first and saves each decision on the version the last save answered', async () => {
    mockReview(readyDetail());
    mount('/identity');

    const choice = await screen.findByTestId('review-choice');
    expect(choice.textContent).toContain('Alege reprezentantul legal');
    await userEvent.click(within(choice).getByRole('radio', { name: /Ioana Mureșan/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0)).toEqual({
      version: 3,
      changes: { fields: { 'client.legalRepresentativeName': { option: 0 } }, items: {} },
    });

    const email = screen
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('office@lactate.ro'))!;
    expect(email.textContent).toContain('Posibil de la alt client');
    await userEvent.click(within(email).getByTestId('review-include-field'));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1)).toEqual({
      version: 4,
      changes: {
        fields: {
          'client.legalRepresentativeName': { option: 0 },
          'client.contactEmail': { included: true },
        },
        items: {},
      },
    });
  });

  it('turns a group into its form in place, and marks the value changed', async () => {
    mockReview(readyDetail());
    mount('/identity');

    const groups = await screen.findAllByTestId('review-group');
    const contact = groups.find((group) => group.textContent?.includes('Persoană de contact'))!;
    expect(contact.textContent).toContain('0269 214 377');
    const phoneRow = within(contact)
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('Telefon'))!;
    await userEvent.click(within(phoneRow).getByTestId('review-edit'));
    const phone = within(contact).getByTestId('client-contact-phone');
    await userEvent.clear(phone);
    await userEvent.type(phone, '0745 218 903');
    await userEvent.click(within(contact).getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.contactPhone': { value: '0745 218 903' },
    });
    expect(await within(contact).findByTestId('edited-tag')).toBeTruthy();
    expect(contact.textContent).toContain('Propus din documente: 0269 214 377');
  });

  it('says plainly when someone else saved in the meantime', async () => {
    mockReview(readyDetail(), {
      save: () =>
        Response.json(
          { error: 'conflict', message: 'Changed.', reason: 'import_changed' },
          { status: 409 }
        ),
    });
    mount('/identity');

    const choice = await screen.findByTestId('review-choice');
    await userEvent.click(within(choice).getByRole('radio', { name: /Dorin Mureșan/ }));
    expect((await screen.findByTestId('import-review-conflict')).textContent).toContain(
      'Altcineva a modificat propunerea între timp'
    );
  });

  it("leaves another company's post out until ticked, and edits a post in the app's dialog", async () => {
    mockReview(readyDetail());
    mount('/job-positions');

    const other = await screen.findByTestId('review-other-company');
    expect(other.textContent).toContain('Stivuitorist');
    await userEvent.click(within(other).getByTestId('review-include-item'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-2': { included: true } });

    const brutar = screen
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Brutar'))!;
    await userEvent.click(within(brutar).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('job-position-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Modifică postul de lucru');
    const activities = within(dialog).getByTestId('job-position-activities');
    await userEvent.clear(activities);
    await userEvent.type(activities, 'Coacere');
    await userEvent.click(within(dialog).getByTestId('job-position-save'));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items['position-1']).toEqual({
      values: { activities: 'Coacere' },
    });
  });

  it('writes a missing hire date in the item dialog', async () => {
    mockReview(readyDetail());
    mount('/responsible');

    const employees = await screen.findByTestId('review-list-employees');
    expect(employees.textContent).toContain('Lipsește data angajării.');
    await userEvent.click(within(employees).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('review-item-dialog');
    await userEvent.type(within(dialog).getByTestId('review-item-hiredAt'), '2024-03-01');
    await userEvent.click(within(dialog).getByTestId('review-item-save'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'employee-1': { values: { hiredAt: '2024-03-01' } },
    });
  });
});

function legalNameChoice() {
  const proposal = proposalFixture();
  const option = (value: string, otherCompanyName: string | null) => ({
    value,
    sources: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: value }],
    otherCompanyName,
  });
  (proposal.client as Record<string, unknown>).legalName = {
    options: [
      option('Lactate Câmpia SRL', 'Lactate Câmpia SRL'),
      option('Brutăria Spicul Auriu SRL', null),
      option('Spicul Auriu Panificație SRL', null),
    ],
  };
  return proposal;
}

const legalNameBlock = async () =>
  (await screen.findAllByTestId('review-choice')).find((each) =>
    each.textContent?.includes('Alege denumirea')
  )!;

describe('the name of a new client', () => {
  it("is the one picked, and never another company's", async () => {
    mockReview(readyDetail({ proposal: legalNameChoice(), blockers: [] }));
    mount('/identity');

    const section = await screen.findByTestId('import-review-section');
    expect(section.textContent).toContain('Brutăria Spicul Auriu SRL. Valorile se preiau');
    await userEvent.click(
      within(await legalNameBlock()).getByRole('radio', { name: /Spicul Auriu Panificație SRL/ })
    );
    await waitFor(() =>
      expect(section.textContent).toContain('Spicul Auriu Panificație SRL. Valorile se preiau')
    );
  });
});

describe('one review across its pages', () => {
  it('follows a save still under way, and confirms only after it, on its version', async () => {
    const proposal = legalNameChoice();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockReview(readyDetail({ proposal, blockers: [] }), {
      save: (body) =>
        held.then(() =>
          Response.json({ version: (body as { version: number }).version + 1 })
        ) as unknown as Response,
    });
    const runtime = mount('/identity');

    await userEvent.click(
      within(await legalNameBlock()).getByRole('radio', { name: /Spicul Auriu Panificație SRL/ })
    );
    await userEvent.click(screen.getByRole('link', { name: /Înapoi la listă/ }));

    await screen.findByTestId('import-review-hub');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Spicul Auriu Panificație SRL'
    );
    await userEvent.click(screen.getByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Creezi clientul Spicul Auriu Panificație SRL?'
    );
    await userEvent.click(within(dialog).getByTestId('import-confirm-submit'));
    expect(requestsTo(`/imports/${importId}/confirm`, 'POST')).toHaveLength(0);

    release();
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/details`)
    );
    expect(savedChanges(0).changes.fields).toEqual({ 'client.legalName': { option: 2 } });
    expect(bodyOf(`/imports/${importId}/confirm`, 'POST')).toEqual({ version: 4 });
  });

  it('keeps a change that did not save on screen, and saves it again on request', async () => {
    let failing = true;
    mockReview(readyDetail(), {
      save: () =>
        failing
          ? Response.json({ error: 'internal', message: 'Failed.' }, { status: 500 })
          : undefined!,
    });
    mount('/identity');

    const choice = await screen.findByTestId('review-choice');
    await userEvent.click(within(choice).getByRole('radio', { name: /Dorin Mureșan/ }));
    const error = await screen.findByTestId('import-review-error');
    expect(error.textContent).toContain('Nu am putut salva ultima schimbare.');

    failing = false;
    await userEvent.click(within(error).getByRole('button', { name: 'Salvează din nou' }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1)).toEqual({
      version: 3,
      changes: { fields: { 'client.legalRepresentativeName': { option: 1 } }, items: {} },
    });
    await waitFor(() => expect(screen.queryByTestId('import-review-error')).toBeNull());
  });
});

describe('another value than the documents give', () => {
  it('is checked like the form checks it, and a CUI loses its RO and spaces', async () => {
    const proposal = proposalFixture();
    proposal.client.cui.options.push({
      value: '31458215',
      sources: [{ file: 'Contract prestari SSM 2019.pdf', quote: '31458215' }],
      otherCompanyName: null,
    });
    mockReview(readyDetail({ proposal }));
    mount('/identity');

    const choice = (await screen.findAllByTestId('review-choice')).find((each) =>
      each.textContent?.includes('Alege CUI-ul')
    )!;
    await userEvent.click(within(choice).getByRole('radio', { name: /Altă valoare/ }));
    const input = within(choice).getByTestId('review-other-value');
    await userEvent.type(input, '12');
    await userEvent.click(within(choice).getByRole('button', { name: 'Folosește' }));
    expect(choice.textContent).toContain('CUI invalid. Verifică cifrele și cifra de control.');
    expect(saves).toBe(0);

    await userEvent.clear(input);
    await userEvent.type(input, 'ro 3145 8203');
    await userEvent.click(within(choice).getByRole('button', { name: 'Folosește' }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({ 'client.cui': { value: '31458203' } });
  });
});

describe('a post the documents give no staff category', () => {
  it('asks for one in the dialog rather than taking execution', async () => {
    const proposal = proposalFixture();
    (proposal.jobPositions[0] as { staffCategory: string | null }).staffCategory = null;
    mockReview(readyDetail({ proposal }));
    mount('/job-positions');

    const brutar = (await screen.findAllByTestId('review-item')).find((row) =>
      row.textContent?.includes('Brutar')
    )!;
    await userEvent.click(within(brutar).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('job-position-dialog');
    const category = within(dialog).getByTestId('job-position-category') as HTMLSelectElement;
    expect(category.value).toBe('');
    await userEvent.click(within(dialog).getByTestId('job-position-save'));
    expect(await within(dialog).findByText('Alege categoria de personal.')).toBeTruthy();
    expect(saves).toBe(0);

    await userEvent.selectOptions(category, 'technical_administrative');
    await userEvent.click(within(dialog).getByTestId('job-position-save'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items['position-1']).toEqual({
      values: { staffCategory: 'technical_administrative' },
    });
  });
});

describe('a company name that ends in a period', () => {
  it('ends the sentence after it once', async () => {
    const proposal = proposalFixture();
    proposal.client.legalName.options[0]!.value = 'S.C. BRUTĂRIA SPICUL AURIU S.R.L.';
    proposal.client.contactEmail.options[0]!.otherCompanyName = 'LACTATE CÂMPIA S.R.L.';
    mockReview(readyDetail({ proposal, blockers: [] }));
    mount('/identity');

    const section = await screen.findByTestId('import-review-section');
    expect(section.textContent).toContain(
      'S.C. BRUTĂRIA SPICUL AURIU S.R.L. Valorile se preiau așa cum sunt'
    );
    expect(section.textContent).toContain('copiate de la LACTATE CÂMPIA S.R.L. Îl preluăm');
    expect(section.textContent).not.toContain('S.R.L..');
  });
});

describe('what the checks found', () => {
  it("says it in the specialist's words, by the names they see, never a path", async () => {
    const proposal = proposalFixture();
    proposal.workplaces.push({
      ...proposal.workplaces[0]!,
      id: 'workplace-2',
      name: 'Sediu social',
      isRegisteredOffice: false,
    });
    proposal.workplaces[0]!.name = 'Sediul și laboratorul';
    (proposal as { flags: unknown[] }).flags = [
      {
        path: 'client.legalName.options.0.sources.0',
        code: 'file_not_found',
        detail: 'dosar-ssm.zip/Contract prestari SSM 2019.pdf (pagina 1) (image follows)',
      },
      { path: 'client.cui.options.0', code: 'invalid_cui' },
      { path: 'client.caenCode.options.0.sources.0', code: 'quote_not_found' },
      { path: 'workplaces.1', code: 'duplicate', detail: 'workplaces.0' },
    ] as never;
    mockReview(readyDetail({ proposal, blockers: [] }));
    mount('/identity');

    const section = await screen.findByTestId('import-review-section');
    await waitFor(() => expect(section.textContent).toContain('Numărul nu trece verificarea CUI.'));
    expect(section.textContent).toContain('Fișierul citat nu este printre cele încărcate.');
    expect(section.textContent).toContain('Pasajul citat nu a fost găsit în fișier.');
    expect(section.textContent).not.toContain('dosar-ssm.zip');
    expect(section.textContent).not.toContain('image follows');

    disposeRuntimes();
    mockReview(readyDetail({ proposal, blockers: [] }));
    mount('/workplaces');
    const list = await screen.findByTestId('review-list-workplaces');
    expect(list.textContent).toContain(
      'Pare să fie același punct de lucru ca «Sediul și laboratorul».'
    );
    expect(list.textContent).not.toContain('workplaces.0');
  });

  it("warns on both rows when ANAF knows the CUI as another firm's, and leaves it to check", async () => {
    const proposal = proposalFixture();
    proposal.client.legalName.options[0]!.value = 'S.C. BRUTĂRIA SPICUL AURIU S.R.L.';
    const detail = readyDetail({
      proposal,
      blockers: [],
      registeredCompany: {
        cui: '31458207',
        legalName: 'BARS COMPANY S.R.L.',
        vatPayer: true,
        inactive: false,
      },
    });
    mockReview(detail);
    mount('/identity');

    const section = await screen.findByTestId('import-review-section');
    const warnings = await screen.findAllByTestId('review-anaf-mismatch');
    expect(warnings.map((warning) => warning.closest('[id]')?.id)).toEqual([
      'review-client-legalName',
      'review-client-cui',
    ]);
    expect(warnings[0]!.textContent).toBe(
      'La ANAF, CUI-ul 31458207 aparține firmei BARS COMPANY S.R.L., nu firmei din documente.'
    );
    expect(section.textContent).not.toContain('Firmă activă la ANAF');
    expect(section.textContent).not.toContain('Confirmat la ANAF');

    disposeRuntimes();
    mockReview(detail);
    mount();
    const identity = (await screen.findAllByTestId('import-section-link')).find(
      (link) => link.dataset.section === 'identity'
    )!;
    expect(within(identity).getByTestId('section-status').textContent).toBe('De verificat');
    expect(identity.textContent).toContain('La ANAF, CUI-ul aparține altei firme.');
  });
});

describe('the employees an import creates', () => {
  it('proposes the legal representative unticked, as an employee only if ticked', async () => {
    const proposal = proposalFixture();
    proposal.employees.push({
      ...proposal.employees[0]!,
      id: 'employee-2',
      role: 'legal_representative',
      lastName: 'Mureșan',
      firstName: 'Ioana',
      jobTitle: 'Administrator',
    });
    mockReview(readyDetail({ proposal, blockers: [] }));
    mount('/responsible');

    const employees = await screen.findByTestId('review-list-employees');
    expect(
      within(employees)
        .getAllByTestId('review-item')
        .map((row) => row.textContent)
    ).toEqual([expect.stringContaining('Lazăr Radu')]);
    const optional = within(employees).getByTestId('review-legal-representative');
    expect(optional.textContent).toContain('Mureșan Ioana');
    expect(optional.textContent).toContain('reprezentantul legal · Administrator');
    const tick = within(optional).getByRole('checkbox', {
      name: 'Preia ca angajat pe Mureșan Ioana',
    });
    expect(tick.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(tick);
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'employee-2': { included: true } });
    const ticked = within(employees)
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Mureșan Ioana'))!;
    await userEvent.click(within(ticked).getByRole('button', { name: 'Nu-l face angajat' }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items).toEqual({ 'employee-2': { included: false } });
  });
});

describe("a protective-equipment entry's duration", () => {
  function durationDetail() {
    const proposal = proposalFixture();
    const entry = (
      id: string,
      item: string,
      durationMonths: number | null,
      allocation: string
    ) => ({
      id,
      sources: [{ file: 'dosar-ssm.zip/Evaluare riscuri.docx', quote: item }],
      otherCompanyName: null,
      jobPosition: { name: 'Brutar', id: 'position-1' },
      risk: 'Substanțe de curățat',
      item,
      quantity: 1,
      durationMonths,
      allocation,
    });
    (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
      entry('equipment-entry-1', 'Mănuși', null, 'personal_inventory'),
      entry('equipment-entry-2', 'Mască', 3, 'consumable'),
    ];
    (proposal as { flags: unknown[] }).flags = [
      { path: 'protectiveEquipment.0.durationMonths', code: 'missing' },
      {
        path: 'protectiveEquipment.1.durationMonths',
        code: 'value_not_allowed',
        detail: 'consumable',
      },
    ];
    return readyDetail({
      proposal,
      blockers: [
        { path: 'protectiveEquipment.0.durationMonths', code: 'missing' },
        { path: 'protectiveEquipment.1.durationMonths', code: 'invalid' },
      ],
    });
  }

  it('asks inventory for a duration and a consumable for none, before confirming', async () => {
    mockReview(durationDetail());
    mount();

    const blockers = await screen.findByTestId('import-blockers');
    expect(
      within(blockers)
        .getAllByTestId('import-blocker-link')
        .map((link) => link.textContent)
    ).toEqual([
      'Scrie durata de utilizare pentru Mănuși sau alege alocarea Consum',
      'Șterge durata de utilizare pentru Mască sau alege altă alocare',
    ]);
  });

  it('says on each row what the duration needs', async () => {
    mockReview(durationDetail());
    mount('/equipment');

    const [gloves, mask] = await screen.findAllByTestId('review-item');
    expect(gloves!.textContent).toContain(
      'Lipsește durata de utilizare. Scrie-o, sau alege alocarea Consum dacă articolul se consumă.'
    );
    expect(mask!.textContent).toContain(
      'Un articol de consum nu are durată de utilizare. Șterge durata sau alege altă alocare.'
    );
    expect(
      within(mask!).getByText('Un articol de consum nu are durată de utilizare.')
    ).toBeTruthy();
  });
});

describe('a value the app refuses on confirm', () => {
  it('names the section and the rule instead of a bare retry', async () => {
    mockReview(readyDetail({ blockers: [] }), {
      confirm: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'The client refused a value of the import.',
            reason: 'import_refused',
            issues: [
              {
                path: 'protectiveEquipment',
                message: 'job_position_equipment_duration_by_allocation',
              },
            ],
          },
          { status: 422 }
        ),
    });
    mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('import-confirm-submit'));

    expect((await within(dialog).findByTestId('import-confirm-error')).textContent).toBe(
      'Nu am putut salva o valoare din secțiunea «Echipament de protecție»: un articol de inventar are durată de utilizare, unul de consum nu are. Verifică secțiunea și încearcă din nou.'
    );
  });
});

describe('two workplaces marked as the registered office', () => {
  function twoOffices() {
    const proposal = proposalFixture();
    const office = proposal.workplaces[0]!;
    proposal.workplaces = [
      { ...office, name: 'Sediu social', addressLine: 'Str. Morilor nr. 14, Sc. B' },
      {
        ...office,
        id: 'workplace-2',
        name: 'Sediu social',
        addressLine: 'Strada Morilor nr. 14, Scara B',
      },
    ];
    return readyDetail({
      proposal,
      blockers: [{ path: 'workplaces.1.isRegisteredOffice', code: 'invalid' }],
    });
  }

  it('asks to keep one before confirming', async () => {
    mockReview(twoOffices());
    mount();

    const blockers = await screen.findByTestId('import-blockers');
    expect(
      within(blockers)
        .getAllByTestId('import-blocker-link')
        .map((link) => link.textContent)
    ).toEqual(['Două sedii sociale: păstrează unul']);
  });

  it('says on the second row how to keep one', async () => {
    mockReview(twoOffices());
    mount('/workplaces');
    const [first, second] = await screen.findAllByTestId('review-item');
    expect(second!.textContent).toContain(
      'Două sedii sociale: păstrează unul. Lasă unul nebifat, sau modifică-l și debifează «Este sediul social».'
    );
    expect(first!.textContent).not.toContain('Două sedii sociale');
  });

  it('names the rule when the client already has its registered office', async () => {
    mockReview(readyDetail({ blockers: [] }), {
      confirm: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'The client refused a value of the import.',
            reason: 'import_refused',
            issues: [{ path: 'workplaces', message: 'client_workplaces_registered_office_key' }],
          },
          { status: 422 }
        ),
    });
    mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('import-confirm-submit'));

    expect((await within(dialog).findByTestId('import-confirm-error')).textContent).toBe(
      'Nu am putut salva o valoare din secțiunea «Puncte de lucru»: un client are un singur sediu social. Verifică secțiunea și încearcă din nou.'
    );
  });
});

function administratorPost() {
  const proposal = proposalFixture();
  proposal.jobPositions.push({
    ...proposal.jobPositions[0]!,
    id: 'position-3',
    sources: [{ file: 'dosar-ssm.zip/Evaluare riscuri.docx', quote: 'Administrator' }],
    name: 'Administrator',
    staffCategory: 'technical_administrative',
    workZone: null,
    activities: 'Conducerea firmei, conduce autoturismul în interes de serviciu',
    managementOnly: true,
  } as (typeof proposal.jobPositions)[number]);
  const entry = (id: string, item: string, position: { name: string; id: string }) => ({
    id,
    sources: [{ file: 'dosar-ssm.zip/Evaluare riscuri.docx', quote: item }],
    otherCompanyName: null,
    jobPosition: position,
    risk: 'Accidentare',
    item,
    quantity: 1,
    durationMonths: 12,
    allocation: 'personal_inventory',
  });
  (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
    entry('equipment-entry-1', 'Mănuși termorezistente', { name: 'Brutar', id: 'position-1' }),
    entry('equipment-entry-2', 'Vestă reflectorizantă', {
      name: 'Administrator',
      id: 'position-3',
    }),
  ];
  return readyDetail({ proposal, blockers: [] });
}

describe('a post that is only the running of the firm', () => {
  it('is proposed unticked with why, apart from posts of another client', async () => {
    mockReview(administratorPost());
    mount('/job-positions');

    const held = await screen.findByTestId('review-management-only');
    expect(held.textContent).toContain('Doar dacă lucrează în firmă cu contract de muncă');
    expect(held.textContent).toContain(
      'Conducerea firmei, conduce autoturismul în interes de serviciu'
    );
    expect(screen.getByTestId('review-other-company').textContent).not.toContain('Administrator');
    expect(screen.getAllByTestId('review-item').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Brutar'),
    ]);
    const tick = within(held).getByRole('checkbox', { name: 'Preia postul Administrator' });
    expect(tick.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(tick);
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-3': { included: true } });
  });

  it('keeps its equipment with it, until an entry is moved to another post', async () => {
    mockReview(administratorPost());
    mount('/equipment');

    const held = await screen.findByTestId('review-position-left-out');
    expect(held.textContent).toContain('Vestă reflectorizantă');
    expect(held.textContent).toContain('Postul Administrator');
    expect(screen.getAllByTestId('review-item').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Mănuși termorezistente'),
    ]);

    await userEvent.click(
      within(held).getByRole('checkbox', { name: 'Preia articolul Vestă reflectorizantă' })
    );
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'equipment-entry-2': { included: true } });
    const moved = screen
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Vestă reflectorizantă'))!;
    await userEvent.click(within(moved).getByRole('button', { name: 'Lasă-l cu postul' }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items).toEqual({ 'equipment-entry-2': { included: false } });
  });

  it('is told apart in the summaries and left out of what is confirmed', async () => {
    mockReview(administratorPost());
    mount();

    const hub = await screen.findByTestId('import-review-hub');
    expect(hub.textContent).toContain(
      'un post. Postul «Administrator» se preia doar dacă e ocupat cu contract de muncă.'
    );
    expect(hub.textContent).toContain(
      'Un articol pentru un post. Un articol rămâne deoparte cu postul lui.'
    );
    await userEvent.click(screen.getByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    expect(
      within(dialog)
        .getAllByTestId('confirm-line')
        .map((line) => line.textContent)
    ).toContainEqual(expect.stringContaining('1post de lucru'));
    expect(dialog.textContent).toContain('Nu preluăm un element de la alt client.');
  });
});

function secondPost(changes: unknown = null) {
  const proposal = proposalFixture();
  proposal.jobPositions.push({
    ...proposal.jobPositions[0]!,
    id: 'position-3',
    sources: [{ file: 'dosar-ssm.zip/Fise post.doc', quote: 'Vânzător' }],
    name: 'Vânzător',
    workZone: 'Magazin',
    activities: 'Vânzarea produselor de panificație',
  } as (typeof proposal.jobPositions)[number]);
  (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
    ['equipment-entry-1', 'Mănuși termorezistente', 'Brutar', 'position-1'],
    ['equipment-entry-2', 'Halat de protecție', 'Vânzător', 'position-3'],
  ].map(([id, item, name, position]) => ({
    id,
    sources: [{ file: 'dosar-ssm.zip/Evaluare riscuri.docx', quote: item }],
    otherCompanyName: null,
    jobPosition: { name, id: position },
    risk: 'Murdărire',
    item,
    quantity: 1,
    durationMonths: 12,
    allocation: 'personal_inventory',
  }));
  return readyDetail({ proposal, blockers: [], changes });
}

describe('a post the import proposed that the member leaves out', () => {
  it('moves to a box of its own, and comes back when ticked', async () => {
    mockReview(secondPost());
    mount('/job-positions');

    const rowOf = async (name: string) =>
      (await screen.findAllByTestId('review-item')).find((row) => row.textContent?.includes(name))!;
    expect(
      within(await rowOf('Brutar')).getByRole('button', { name: 'Nu prelua postul' })
    ).toBeTruthy();
    await userEvent.click(
      within(await rowOf('Vânzător')).getByRole('button', { name: 'Nu prelua postul' })
    );
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-3': { included: false } });

    const aside = await screen.findByTestId('review-left-out');
    expect(aside.textContent).toContain('Lăsate deoparte');
    expect(aside.textContent).toContain('Vânzarea produselor de panificație');
    expect(screen.getByTestId('review-other-company').textContent).not.toContain('Vânzător');
    expect(screen.getAllByTestId('review-item').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Brutar'),
    ]);
    const tick = within(aside).getByRole('checkbox', { name: 'Preia postul Vânzător' });
    expect(tick.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(tick);
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items).toEqual({ 'position-3': { included: true } });
    expect(screen.queryByTestId('review-left-out')).toBeNull();
    expect(await rowOf('Vânzător')).toBeTruthy();
  });

  it('keeps its equipment with it', async () => {
    mockReview(secondPost({ fields: {}, items: { 'position-3': { included: false } } }));
    mount('/equipment');

    const held = await screen.findByTestId('review-position-left-out');
    expect(held.textContent).toContain('Halat de protecție');
    expect(held.textContent).toContain('Postul Vânzător');
    expect(screen.getAllByTestId('review-item').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Mănuși termorezistente'),
    ]);
  });

  it('is left out of the summaries and of what is confirmed', async () => {
    mockReview(secondPost({ fields: {}, items: { 'position-3': { included: false } } }));
    mount();

    const hub = await screen.findByTestId('import-review-hub');
    expect(hub.textContent).toContain('un post.');
    expect(hub.textContent).toContain(
      'Un articol pentru un post. Un articol rămâne deoparte cu postul lui.'
    );
    await userEvent.click(screen.getByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    expect(
      within(dialog)
        .getAllByTestId('confirm-line')
        .map((line) => line.textContent)
    ).toContainEqual(expect.stringContaining('1post de lucru'));
    expect(dialog.textContent).toContain('Nu preluăm un element de la alt client.');
  });
});

describe('completing an existing client (E2)', () => {
  const existing = () =>
    readyDetail({
      intoExistingClient: true,
      client: { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' },
      blockers: [],
    });

  it("keeps the app's value where the documents differ, without blocking, until the member takes theirs", async () => {
    mockReview(existing());
    mount();

    const kept = await screen.findByTestId('import-kept');
    await waitFor(() => expect(kept.textContent).toContain('Telefon'));
    expect(kept.textContent).toContain('diferă de aplicație, păstrăm valoarea ta');
    expect(screen.queryByTestId('import-blockers')).toBeNull();
    expect(screen.getByTestId('import-confirm').getAttribute('aria-disabled')).toBeNull();

    await userEvent.click(within(kept).getByRole('link', { name: 'Telefon' }));
    const differs = await screen.findByTestId('review-differs-row');
    expect(differs.textContent).toContain('Rămâne 0269 214 300 (din aplicație)');
    expect(differs.textContent).toContain(
      'În documente: 0269 214 377, din Contract prestari SSM 2019.pdf'
    );
    await userEvent.click(within(differs).getByTestId('review-use-documents'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.contactPhone': { replace: true },
    });
    expect(screen.getByTestId('review-same').textContent).toContain('La fel în documente');
  });
});

function fireSheetProposal() {
  const proposal = proposalFixture();
  const source = (quote: string) => [{ file: 'b.pdf', quote }];
  Object.assign(proposal.workplaces[0]!, {
    kind: null,
    floorAreaM2: 180,
    extinguisherNorm: 'commercial_200',
    assemblyPoint: 'Parcarea din spatele clădirii',
    combustibleMaterials: 'Făină, ambalaje din carton',
    ignitionSources: null,
    fireRiskEquipment: null,
    specificMeasures: null,
    fieldSources: { assemblyPoint: source('Punct de adunare: parcarea din spatele clădirii') },
  });
  Object.assign(proposal.jobPositions[0]!, { needsProtectiveEquipment: false });
  const one = (value: string | number, quote: string) => ({
    options: [{ value, sources: source(quote), otherCompanyName: null }],
  });
  Object.assign(proposal.fireSafety, {
    wasteKinds: one('deșeuri menajere; carton', 'Deșeuri: menajere, carton'),
    wasteCollectors: { options: [] },
    hasThirdParties: one('true', 'chiriașul'),
  });
  Object.assign(proposal.trainingSchedule, {
    workerTrainingNotApplicable: one('true', 'nu se aplică'),
  });
  return readyDetail({ proposal });
}

describe('what the import now fills for the fire-safety and safety sets', () => {
  it("shows a workplace's fire-safety sheet, and edits it in the app's dialog", async () => {
    mockReview(fireSheetProposal());
    mount('/workplaces');

    const [row] = await screen.findAllByTestId('review-item');
    expect(row!.textContent).toContain('Suprafața utilă 180 m²');
    expect(row!.textContent).toContain('Norma de dotare: Clădiri comerciale');
    expect(row!.textContent).toContain('Punctul de adunare: Parcarea din spatele clădirii');
    expect(row!.textContent).toContain('Materiale combustibile: Făină, ambalaje din carton');

    await userEvent.click(within(row!).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('workplace-dialog');
    expect((within(dialog).getByTestId('workplace-floor-area') as HTMLInputElement).value).toBe(
      '180'
    );
    const assembly = within(dialog).getByTestId('workplace-assembly-point');
    await userEvent.clear(assembly);
    await userEvent.type(assembly, 'Curtea interioară');
    await userEvent.click(within(dialog).getByTestId('workplace-save'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'workplace-1': { values: { assemblyPoint: 'Curtea interioară' } },
    });
  });

  it('proposes that a post needs no protective equipment, and leaves it undecided on request', async () => {
    mockReview(fireSheetProposal());
    mount('/job-positions');

    const decision = await screen.findByTestId('review-equipment-decision');
    expect(decision.textContent).toContain('Nu necesită echipament de protecție');
    await userEvent.click(within(decision).getByRole('button', { name: 'Lasă de stabilit' }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'position-1': { values: { needsProtectiveEquipment: null } },
    });
    expect(screen.getByTestId('review-equipment-decision').textContent).toContain(
      'Echipamentul de protecție rămâne de stabilit'
    );
  });

  it('shows the waste, other firms on the premises, and a category without periodic training', async () => {
    mockReview(fireSheetProposal());
    mount('/fire-safety');

    const waste = await screen.findByText('Deșeuri colectate');
    expect(waste.closest('[id]')!.textContent).toContain('deșeuri menajere; carton');
    expect(document.getElementById('review-fireSafety-hasThirdParties')!.textContent).toContain(
      'Da'
    );
  });

  it('asks to keep either the interval or "Nu se aplică" for a category', async () => {
    mockReview(fireSheetProposal());
    mount('/training');

    const label = await screen.findByText('Instruirea periodică, execuție');
    const row = label.closest('[id]')!;
    expect(row.id).toBe('review-trainingSchedule-workerTrainingNotApplicable');
    expect(row.textContent).toContain('Nu se aplică');
    expect(row.textContent).toContain('Documentele dau și o periodicitate');
  });
});

describe('the passages of a person’s roles', () => {
  const flaggedRole = () => {
    const proposal = proposalFixture();
    Object.assign(proposal.responsiblePersons[0]!, {
      roleSources: {
        workers_representative: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Radu Lazăr' }],
        first_aid: [{ file: 'dosar-ssm.zip/Decizie 3.docx', quote: 'primul ajutor' }],
      },
    });
    proposal.flags = [
      { path: 'responsiblePersons.0.roles.first_aid.sources.0', code: 'quote_not_found' },
    ] as never;
    return proposal;
  };

  it('marks a role none of whose passages was found', async () => {
    mockReview(readyDetail({ proposal: flaggedRole(), blockers: [] }));
    mount('/responsible');

    const list = await screen.findByTestId('review-list-responsiblePersons');
    expect(list.textContent).toContain('Reprezentantul lucrătorilor, Prim ajutor (pasaj negăsit)');
    expect(list.textContent).toContain(
      'Pasajul citat pentru rolul «Prim ajutor» nu a fost găsit în fișier.'
    );
  });

  it('says nothing of a role the member removed', async () => {
    mockReview(
      readyDetail({
        proposal: flaggedRole(),
        blockers: [],
        changes: {
          fields: {},
          items: { 'person-1': { values: { roles: ['workers_representative'] } } },
        },
      })
    );
    mount('/responsible');

    const list = await screen.findByTestId('review-list-responsiblePersons');
    expect(list.textContent).toContain('Reprezentantul lucrătorilor');
    expect(list.textContent).not.toContain('Prim ajutor');
  });
});

describe('a smoking rule the decisions disagree on', () => {
  const smokingDetail = (policy?: 'forbidden_everywhere' | 'designated_places') => {
    const proposal = proposalFixture();
    const option = (value: string, file: string, quote: string) => ({
      value,
      sources: [{ file, quote }],
      otherCompanyName: null,
    });
    Object.assign(proposal.fireSafety, {
      smokingPolicy: {
        options: [
          option('forbidden_everywhere', 'a.pdf', 'Se interzice fumatul'),
          option('designated_places', 'b.pdf', 'Fumatul este permis numai'),
        ],
      },
      smokingPlace: { options: [option('În curtea interioară', 'b.pdf', 'în curtea interioară')] },
    });
    return readyDetail({
      proposal,
      changes: {
        fields: policy
          ? {
              'fireSafety.smokingPolicy': {
                option: policy === 'forbidden_everywhere' ? 0 : 1,
              },
            }
          : {},
        items: {},
      },
    });
  };
  const hubSummary = async () =>
    (await screen.findAllByTestId('import-section-link')).find(
      (link) => link.dataset.section === 'fire-safety'
    )!.textContent;

  it('is summed up on the hub as the policy chosen says', async () => {
    mockReview(smokingDetail('forbidden_everywhere'));
    mount();
    expect(await hubSummary()).toContain('Fumatul interzis peste tot, 6 mijloace de stingere.');
    expect(await hubSummary()).not.toContain('curtea');
  });

  it('names the place once, without doubling its "în"', async () => {
    mockReview(smokingDetail('designated_places'));
    mount();
    expect(await hubSummary()).toContain(
      'Fumat doar în locurile amenajate: în curtea interioară, 6 mijloace de stingere.'
    );
  });

  it('shows the place as not applying while smoking is forbidden everywhere', async () => {
    mockReview(smokingDetail('forbidden_everywhere'));
    mount('/fire-safety');

    await screen.findByText('Locul pentru fumat');
    const row = document.getElementById('review-fireSafety-smokingPlace')!;
    expect(row.textContent).toContain('În curtea interioară');
    expect(within(row).getByTestId('review-not-applicable').textContent).toBe(
      'Nu se aplică: fumatul e interzis peste tot, așa că locul nu se preia.'
    );
  });

  it('takes the place as any value under designated places', async () => {
    mockReview(smokingDetail('designated_places'));
    mount('/fire-safety');

    await screen.findByText('Locul pentru fumat');
    const row = document.getElementById('review-fireSafety-smokingPlace')!;
    expect(row.textContent).toContain('În curtea interioară');
    expect(within(row).queryByTestId('review-not-applicable')).toBeNull();
  });
});

describe('a value proposed with its spelling corrected', () => {
  const markedWords = (pair: HTMLElement) =>
    Array.from(pair.querySelectorAll('mark'), (mark) => mark.textContent);

  const spellingDetail = () => {
    const proposal = proposalFixture();
    Object.assign(proposal.jobPositions[0]!, {
      name: 'Îngrijitor hotel',
      sources: [{ file: 'dosar-ssm.zip/Fise post.doc', quote: 'FUNCTIA : | INGRIJITOR HOTEL' }],
      spelling: { name: 'INGRIJITOR HOTEL', workZone: 'LABORATOR' },
    });
    Object.assign(proposal.fireSafety.smokingPlace.options[0]!, {
      value: 'În curte',
      spelling: 'In curte',
    });
    return readyDetail({ proposal });
  };

  it('shows the corrected value beside the document’s, and keeps the document’s at one click', async () => {
    mockReview(spellingDetail());
    mount('/job-positions');

    const row = (await screen.findAllByTestId('review-item')).find((item) =>
      item.textContent?.includes('Îngrijitor hotel')
    )!;
    const [name, zone] = within(row).getAllByTestId('review-spelling');
    expect(name!.textContent).toBe(
      'Denumire:Propus: Îngrijitor hotelÎn document: INGRIJITOR HOTELScrierea corectată: majuscule și diacriticePăstrează ca în document'
    );
    expect(markedWords(name!)).toEqual(['Îngrijitor', 'INGRIJITOR']);
    expect(zone!.textContent).toContain('Scrierea corectată: majuscule');
    expect(zone!.textContent).not.toContain('diacritice');
    expect(markedWords(zone!)).toEqual([]);

    await userEvent.click(within(name!).getByRole('button', { name: 'Păstrează ca în document' }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'position-1': { values: { name: 'INGRIJITOR HOTEL' } },
    });
    const kept = screen
      .getAllByTestId('review-item')
      .find((item) => item.textContent?.includes('INGRIJITOR HOTEL'))!;
    expect(within(kept).getAllByTestId('review-spelling')).toHaveLength(1);
    expect(within(kept).getByTestId('edited-tag')).toBeTruthy();

    await userEvent.click(within(kept).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('job-position-dialog');
    await userEvent.type(within(dialog).getByTestId('job-position-activities'), ', curățenie');
    await userEvent.click(within(dialog).getByTestId('job-position-save'));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items['position-1']).toEqual({
      values: { name: 'INGRIJITOR HOTEL', activities: 'Frământare și coacere, curățenie' },
    });
  });

  it('keeps the document’s spelling of a single value as the member’s', async () => {
    mockReview(spellingDetail());
    mount('/fire-safety');

    await screen.findByText('Locul pentru fumat');
    const row = document.getElementById('review-fireSafety-smokingPlace')!;
    expect(within(row).getByTestId('review-spelling').textContent).toContain(
      'Scrierea corectată: diacritice'
    );
    expect(markedWords(within(row).getByTestId('review-spelling'))).toEqual(['În', 'In']);

    await userEvent.click(within(row).getByRole('button', { name: 'Păstrează ca în document' }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'fireSafety.smokingPlace': { value: 'In curte' },
    });
    await waitFor(() => expect(within(row).queryByTestId('review-spelling')).toBeNull());
    expect(within(row).getByTestId('edited-tag')).toBeTruthy();
    expect(row.textContent).toContain('Propus din documente: În curte');
  });

  it('sums up the hub with the corrected value', async () => {
    mockReview(spellingDetail());
    mount();

    const fireSafety = (await screen.findAllByTestId('import-section-link')).find(
      (link) => link.dataset.section === 'fire-safety'
    )!;
    expect(fireSafety.textContent).toContain('Fumat doar în locurile amenajate: în curte');
  });
});
