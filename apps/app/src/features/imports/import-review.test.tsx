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
  meWithCredits,
  mockApi,
  proposalFixture,
  readyBlockers,
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
  {
    save,
    read,
    confirm,
    me,
    documentDetails = {},
    positions = () => Response.json({ items: [] }),
  }: {
    save?: (body: unknown) => Response | Promise<Response>;
    read?: (call: number) => Promise<void> | undefined;
    confirm?: () => Response;
    me?: unknown;
    documentDetails?: Record<string, unknown>;
    positions?: () => Response;
  } = {}
) {
  saves = 0;
  let reads = 0;
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/me' && me) return Response.json(me);
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      const held = read?.(++reads);
      return held
        ? held.then(() => Response.json({ import: detail }))
        : Response.json({ import: detail });
    }
    if (url.pathname === `/imports/${importId}/changes`) {
      saves += 1;
      const body = JSON.parse(String(init?.body)) as { version: number };
      const answer =
        save?.(body) ?? Response.json({ version: body.version + 1, blockers: detail.blockers });
      return Promise.resolve(answer).then(async (response) => {
        if (response.ok) {
          detail.blockers = ((await response.clone().json()) as Pick<Detail, 'blockers'>).blockers;
        }
        return response;
      });
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
          ...documentDetails,
        },
      });
    }
    if (url.pathname === `/clients/${clientId}/job-positions`) return positions();
    if (url.pathname === `/clients/${clientId}/fire-safety`) {
      return Response.json({ fireSafety: null });
    }
    if (url.pathname.startsWith(`/clients/${clientId}/`)) return Response.json({}, { status: 404 });
    return undefined;
  });
}

const mount = (path = '') =>
  mountApp(authFixture(makeSession()).client, `/clienti/import/${importId}${path}`);

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
      `/clienti/import/${importId}/identity#review-client-legalRepresentativeName`
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
      'Depanare: cost 0,27\u00a0$ · 182.000 tokeni intrare (31.000 din cache) · 6.400 ieșire · 410.000 caractere citite · sortare 0,01\u00a0$, citire 0,22\u00a0$, scanare 0,04\u00a0$'
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
      'Depanare: cost 0,20\u00a0$ · 1.500 tokeni intrare (0 din cache) · 300 ieșire · citire 0,20\u00a0$'
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
      expect.stringContaining('1lucrător'),
      expect.stringContaining('6mijloace de apărare'),
    ]);
    expect(dialog.textContent).toContain('Nu preluăm un element de la alt client.');
    await userEvent.click(within(dialog).getByTestId('import-confirm-submit'));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/detalii`)
    );
    expect(bodyOf(`/imports/${importId}/confirm`, 'POST')).toEqual({ version: 3 });
    expect((await screen.findByTestId('client-imported-notice')).textContent).toContain(
      'Clientul a fost creat din documente. Cele 3 fișiere sunt în Alte documente, grupate ca dosarul importat.'
    );
  });
});

describe('a section of the review', () => {
  it('asks for the choice in its row and saves each decision on the version the last save answered', async () => {
    mockReview(readyDetail());
    mount('/identity');

    const choice = await screen.findByTestId('review-choice');
    expect(choice.textContent).toContain('Reprezentant legal');
    expect(choice.textContent).toContain('Documentele dau 2 variante');
    const representative = (await screen.findAllByTestId('review-group')).find((group) =>
      group.textContent?.includes('Semnează documentele clientului')
    )!;
    expect(within(representative).getByTestId('review-group-pending').textContent).toBe(
      'Mai ai de ales reprezentantul legal'
    );
    expect(within(choice).getByRole('radio', { name: /^Decizie 1\.docx/ })).toBeTruthy();
    expect(
      within(choice).getByRole('radio', { name: /^Contract prestari SSM 2019\.pdf/ })
    ).toBeTruthy();
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
    expect(email.textContent).toContain('Nu e inclusă');
    expect(within(email).queryByRole('checkbox')).toBeNull();
    await userEvent.click(within(email).getByRole('switch', { name: 'Nu e inclusă: Email' }));
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

    const included = screen
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('office@lactate.ro'))!;
    expect(included.textContent).not.toContain('Nu e inclusă');
    await userEvent.click(within(included).getByRole('switch', { name: 'Inclusă: Email' }));
    await waitFor(() => expect(saves).toBe(3));
    expect(savedChanges(2).changes.fields).toEqual({
      'client.legalRepresentativeName': { option: 0 },
    });
  });

  it('names the files a choice comes from, the first one and how many more', async () => {
    const proposal = proposalFixture();
    const files = (count: number, first: string) =>
      Array.from({ length: count }, (_, index) => ({
        file: index === 0 ? first : `dosar-ssm.zip/Anexa ${index}.pdf (pagina 2)`,
        quote: 'Salubris SA',
      }));
    proposal.fireSafety.wasteContractor.options[0]!.sources = files(
      3,
      'dosar-ssm.zip/PSI/Decizie privind organizarea activității de apărare împotriva incendiilor 2.1.docx'
    );
    proposal.fireSafety.wasteContractor.options[1]!.sources = files(21, 'b.pdf');
    mockReview(readyDetail({ proposal }));
    mount('/fire-safety');

    const choice = (await screen.findAllByTestId('review-choice')).find((each) =>
      each.textContent?.includes('Firma de salubritate')
    )!;
    const [three, many] = within(choice)
      .getAllByRole('radio')
      .slice(0, 2)
      .map((radio) => radio.closest('[data-checked]') as HTMLElement);
    const long =
      'Decizie privind organizarea activității de apărare împotriva incendiilor 2.1.docx';
    expect(three!.textContent).toContain(`${long} și încă 2 fișiere: Anexa 1.pdf, Anexa 2.pdf`);
    expect(within(three!).getByTitle(`${long}, Anexa 1.pdf, Anexa 2.pdf`)).toBeTruthy();
    expect(many!.textContent).toContain('b.pdf și încă 20 de fișiere');
  });

  it('opens only the field changed, marked as the one open, and marks the value changed', async () => {
    mockReview(readyDetail());
    mount('/identity');

    const groups = await screen.findAllByTestId('review-group');
    const contact = groups.find((group) => group.textContent?.includes('Persoană de contact'))!;
    expect(contact.textContent).toContain('0269 214 377');
    const phoneRow = within(contact)
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('Telefon'))!;
    await userEvent.click(within(phoneRow).getByTestId('review-edit'));

    const open = within(contact).getByTestId('review-row-editing');
    expect(open.textContent).toContain('Schimbi acum');
    expect(within(contact).getAllByTestId('review-group-form')).toHaveLength(1);
    expect(within(contact).queryByTestId('review-input-contactName')).toBeNull();
    expect(within(contact).queryByTestId('review-input-contactEmail')).toBeNull();
    const phone = within(open).getByTestId('review-input-contactPhone');
    expect(document.activeElement).toBe(phone);
    await userEvent.clear(phone);
    await userEvent.type(phone, '0745 218 903');
    await userEvent.click(within(open).getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.contactPhone': { value: '0745 218 903' },
    });
    expect(await within(contact).findByTestId('edited-tag')).toBeTruthy();
    expect(within(contact).queryByTestId('review-row-editing')).toBeNull();
    expect(contact.textContent).toContain('Din documente: 0269 214 377');
  });

  it('keeps a value the member rewrites only in capitals as theirs', async () => {
    mockReview(readyDetail());
    mount('/identity');

    const groups = await screen.findAllByTestId('review-group');
    const company = groups.find((group) => group.textContent?.includes('Date firmă'))!;
    const addressRow = within(company)
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('Adresă'))!;
    await userEvent.click(within(addressRow).getByTestId('review-edit'));
    const address = within(company).getByTestId('review-input-addressLine');
    await userEvent.clear(address);
    await userEvent.type(address, 'STR. MORILOR NR. 14');
    await userEvent.click(within(company).getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.addressLine': { value: 'STR. MORILOR NR. 14' },
    });
  });

  const validCuiDetail = (vatPayer: boolean) => {
    const proposal = proposalFixture();
    proposal.client.cui.options[0]!.value = '1590082';
    return readyDetail({
      proposal,
      registeredCompany: {
        cui: '1590082',
        legalName: 'BRUTĂRIA SPICUL AURIU SRL',
        vatPayer,
        inactive: false,
      },
    });
  };

  it("asks for the VAT registration beside the bare CUI, and shows RO only while it's ticked", async () => {
    mockReview(validCuiDetail(true));
    mount('/identity');

    const groups = await screen.findAllByTestId('review-group');
    const company = groups.find((group) => group.textContent?.includes('Date firmă'))!;
    expect(company.textContent).toContain('RO1590082');
    const cuiRow = within(company)
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('CUI'))!;
    await userEvent.click(within(cuiRow).getByTestId('review-edit'));

    expect((within(company).getByTestId('review-input-cui') as HTMLInputElement).value).toBe(
      '1590082'
    );
    const vatPayer = within(company).getByTestId('review-input-vatPayer');
    expect(vatPayer.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(vatPayer);
    await userEvent.click(within(company).getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.vatPayer': { value: 'false' },
    });
    await waitFor(() => expect(company.textContent).not.toContain('RO1590082'));
    expect(company.textContent).toContain('1590082');
  });

  it('takes a typed RO prefix as VAT registration', async () => {
    mockReview(validCuiDetail(false));
    mount('/identity');

    const groups = await screen.findAllByTestId('review-group');
    const company = groups.find((group) => group.textContent?.includes('Date firmă'))!;
    const cuiRow = within(company)
      .getAllByTestId('review-row')
      .find((row) => row.textContent?.includes('CUI'))!;
    await userEvent.click(within(cuiRow).getByTestId('review-edit'));
    expect(within(company).getByTestId('review-input-vatPayer').getAttribute('aria-checked')).toBe(
      'false'
    );
    const cui = within(company).getByTestId('review-input-cui');
    await userEvent.clear(cui);
    await userEvent.type(cui, 'RO1590082');
    await userEvent.click(within(company).getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.vatPayer': { value: 'true' },
    });
    expect(await within(company).findByText('RO1590082')).toBeTruthy();
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
      'Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.'
    );
  });

  it('shows where the section stands among the others, each step a link to its section', async () => {
    mockReview(readyDetail());
    mount('/job-positions');

    const steps = await screen.findByRole('navigation', { name: 'Secțiunile propunerii' });
    expect(within(steps).getByTestId('import-section-position').textContent).toBe(
      'Secțiunea 3 din 7'
    );
    const links = within(steps).getAllByTestId('import-section-step');
    expect(links).toHaveLength(7);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
      null,
      null,
      null,
    ]);
    expect(links[1]!.getAttribute('href')).toBe(`/clienti/import/${importId}/workplaces`);
    expect(links[2]!.getAttribute('aria-label')).toBe('3. Posturi de lucru');
  });

  it("leaves another company's post out until ticked, and edits a post in the app's dialog", async () => {
    mockReview(readyDetail());
    mount('/job-positions');

    const other = await screen.findByTestId('review-other-company');
    expect(other.textContent).toContain('Stivuitorist');
    await userEvent.click(within(other).getByTestId('review-include-item'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-2': { included: true } });
    const joined = screen
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Stivuitorist'))!;
    expect(joined.textContent).toContain('De la Lactate Câmpia SRL');
    expect(document.activeElement).toBe(
      within(joined).getByRole('switch', { name: 'Inclus: Stivuitorist' })
    );

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
    mockReview(readyDetail(), {
      save: (body) =>
        Response.json({
          version: (body as { version: number }).version + 1,
          blockers: readyBlockers.filter((blocker) => blocker.path !== 'employees.0.hiredAt'),
        }),
    });
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
    await waitFor(() => expect(employees.textContent).not.toContain('Lipsește data angajării.'));
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
    each.textContent?.includes('Denumire')
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

describe("a new client's name ANAF registers otherwise", () => {
  const anafDetail = () => {
    const proposal = proposalFixture();
    proposal.flags = [
      { path: 'client.legalName', code: 'legal_name_differs', detail: 'PANIFICAȚIA NOUĂ SRL' },
    ] as typeof proposal.flags;
    return readyDetail({
      proposal,
      blockers: [],
      registeredCompany: {
        cui: '31458207',
        legalName: 'PANIFICAȚIA NOUĂ SRL',
        vatPayer: true,
        inactive: false,
      },
    });
  };

  it("takes ANAF's name by default, and the documents' only when picked", async () => {
    mockReview(anafDetail());
    mount('/identity');

    const row = await screen.findByTestId('review-anaf-choice');
    const section = screen.getByTestId('import-review-section');
    expect(section.textContent).toContain('PANIFICAȚIA NOUĂ SRL. Valorile se preiau');
    expect(row.textContent).toContain(
      'Documentele dau altă denumire decât ANAF pentru CUI-ul 31458207'
    );
    const anaf = within(row).getByRole('radio', { name: /La ANAF, pentru CUI 31458207/ });
    expect((anaf as HTMLInputElement).checked).toBe(true);
    expect(within(row).getByTestId('review-anaf-pick').textContent).toContain('Intră în documente');
    expect(row.textContent).toContain('Am ales denumirea de la ANAF');
    const company = screen
      .getAllByTestId('review-group')
      .find((group) => group.textContent?.includes('Date firmă'))!;
    expect(within(company).getByTestId('review-group-pending').textContent).toBe(
      'Mai ai de văzut denumirea'
    );
    expect(screen.queryByTestId('review-anaf-mismatch')).toBeNull();

    await userEvent.click(anaf);
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'client.legalName': { value: 'PANIFICAȚIA NOUĂ SRL' },
    });
    await waitFor(() =>
      expect(within(company).getByTestId('review-group-pending').textContent).toBe(
        'Gata de confirmat'
      )
    );
    expect(row.textContent).not.toContain('Am ales denumirea de la ANAF');

    await userEvent.click(within(row).getByRole('radio', { name: /În documente/ }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.fields).toEqual({ 'client.legalName': { option: 0 } });
    await waitFor(() =>
      expect(section.textContent).toContain('Brutăria Spicul Auriu SRL. Valorile se preiau')
    );
    expect(within(row).getByTestId('review-documents-pick').textContent).toContain(
      'Intră în documente'
    );
  });

  it("names the client by ANAF's name on the hub until the documents' is picked", async () => {
    mockReview(anafDetail());
    mount();

    await screen.findByTestId('import-review-hub');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('PANIFICAȚIA NOUĂ SRL');
    const identity = screen
      .getAllByTestId('import-section-link')
      .find((link) => link.dataset.section === 'identity')!;
    expect(identity.textContent).toContain(
      'Documentele dau altă denumire decât ANAF. Am ales-o pe cea de la ANAF.'
    );
  });

  it("edits the name as ANAF gives it, and keeps the documents' when written back", async () => {
    mockReview(anafDetail());
    mount('/identity');

    const row = await screen.findByTestId('review-anaf-choice');
    await userEvent.click(within(row).getByTestId('review-edit'));
    const input = screen.getByTestId('review-input-legalName') as HTMLInputElement;
    expect(input.value).toBe('PANIFICAȚIA NOUĂ SRL');
    await userEvent.clear(input);
    await userEvent.type(input, 'Brutăria Spicul Auriu SRL');
    await userEvent.click(screen.getByTestId('review-group-save'));

    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({ 'client.legalName': { option: 0 } });
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
          Response.json({ version: (body as { version: number }).version + 1, blockers: [] })
        ),
    });
    const runtime = mount('/identity');

    await userEvent.click(
      within(await legalNameBlock()).getByRole('radio', { name: /Spicul Auriu Panificație SRL/ })
    );
    await userEvent.click(screen.getByRole('link', { name: 'Înapoi la propunere' }));

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
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/detalii`)
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
    expect(error.textContent).toContain('Ultima schimbare nu s-a salvat.');

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
      each.textContent?.includes('CUI')
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
      'S.C. BRUTĂRIA SPICUL AURIU S.R.L. Valorile se preiau cum sunt'
    );
    expect(section.textContent).toContain('copiate de la LACTATE CÂMPIA S.R.L. Valoarea se preia');
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

  it('offers a person’s name another file spells otherwise as a choice, kept as read until picked', async () => {
    const proposal = proposalFixture();
    (proposal as { flags: unknown[] }).flags = [
      {
        path: 'responsiblePersons.0.fullName',
        code: 'name_spelled_differently',
        detail: 'Radu Lozăr',
        source: { file: 'dosar-ssm.zip/IPSSM.docx', quote: 'Radu Lozăr, prim ajutor' },
      },
    ] as never;
    mockReview(readyDetail({ proposal, blockers: [] }));
    mount('/responsible');

    const choice = await screen.findByTestId('review-name-spellings');
    expect(choice.textContent).toContain('Documentele scriu numele în 2 feluri.');
    expect(within(choice).getByRole('radio', { name: /Radu Lazăr/ })).toHaveProperty(
      'checked',
      true
    );
    expect(within(choice).getByRole('radio', { name: /^IPSSM\.docx/ })).toBeTruthy();
    await userEvent.click(within(choice).getByRole('radio', { name: /Radu Lozăr/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'person-1': { values: { fullName: 'Radu Lozăr' } },
    });
    const list = screen.getByTestId('review-list-responsiblePersons');
    expect(list.textContent).not.toContain('Modificat de tine');
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
    const tick = within(optional).getByRole('switch', { name: 'Nu e inclus: Mureșan Ioana' });
    expect(tick.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(tick);
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'employee-2': { included: true } });
    expect(within(employees).queryByTestId('review-legal-representative')).toBeNull();
    const ticked = within(employees)
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Mureșan Ioana'))!;
    expect(
      within(employees)
        .getAllByTestId('review-item')
        .find((row) => row.textContent?.includes('Lazăr Radu'))!
        .querySelector('[role="switch"]')
    ).toBeNull();
    await userEvent.click(within(ticked).getByRole('switch', { name: 'Inclus: Mureșan Ioana' }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items).toEqual({});
    expect(within(employees).getByTestId('review-legal-representative')).toBeTruthy();
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
    expect(within(gloves!).getByRole('note', { name: 'Date de corectat' }).textContent).toContain(
      'Lipsește durata de utilizare. Scrie-o, sau alege alocarea Consum dacă articolul se consumă.'
    );
    expect(mask!.textContent).toContain(
      'Un articol de consum nu are durată de utilizare. Șterge durata sau alege altă alocare.'
    );
    expect(
      within(mask!).getByText('Un articol de consum nu are durată de utilizare.')
    ).toBeTruthy();
  });

  it('drops the note once the save answers, before the import is read again', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const detail = durationDetail();
    mockReview(detail, {
      save: (body) =>
        Response.json({
          version: (body as { version: number }).version + 1,
          blockers: [{ path: 'protectiveEquipment.1.durationMonths', code: 'invalid' }],
        }),
      read: (call) => (call > 1 ? held : undefined),
    });
    mount('/equipment');

    const [gloves] = await screen.findAllByTestId('review-item');
    await userEvent.click(within(gloves!).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('review-item-dialog');
    await userEvent.type(within(dialog).getByTestId('review-item-durationMonths'), '12');
    await userEvent.click(within(dialog).getByTestId('review-item-save'));

    await waitFor(() =>
      expect(screen.getAllByTestId('review-item')[0]!.textContent).not.toContain(
        'Lipsește durata de utilizare.'
      )
    );
    const [row, mask] = screen.getAllByTestId('review-item');
    expect(row!.textContent).toContain('12 luni');
    expect(mask!.textContent).toContain('Un articol de consum nu are durată de utilizare.');
    await waitFor(() => expect(requestsTo(`/imports/${importId}`)).toHaveLength(2));
    release();
  });

  it('says what the saved allocation now asks for', async () => {
    mockReview(durationDetail(), {
      save: (body) =>
        Response.json({
          version: (body as { version: number }).version + 1,
          blockers: [
            { path: 'protectiveEquipment.0.durationMonths', code: 'missing' },
            { path: 'protectiveEquipment.1.durationMonths', code: 'missing' },
          ],
        }),
    });
    mount('/equipment');

    const [, mask] = await screen.findAllByTestId('review-item');
    await userEvent.click(within(mask!).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('review-item-dialog');
    await userEvent.clear(within(dialog).getByTestId('review-item-durationMonths'));
    await userEvent.selectOptions(
      within(dialog).getByTestId('review-item-allocation'),
      'personal_inventory'
    );
    await userEvent.click(within(dialog).getByTestId('review-item-save'));

    await waitFor(() =>
      expect(screen.getAllByTestId('review-item')[1]!.textContent).toContain(
        'Lipsește durata de utilizare.'
      )
    );
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
      'Două sedii sociale: păstrează unul. Nu-l include pe unul, sau modifică-l și debifează «Este sediul social».'
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
    expect(held.textContent).toContain('Include postul dacă cine îl ocupă');
    const tick = within(held).getByRole('switch', { name: 'Nu e inclus: Administrator' });
    expect(tick.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(tick);
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-3': { included: true } });
    expect(screen.queryByTestId('review-management-only')).toBeNull();
    const joined = screen
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Administrator'))!;
    expect(within(joined).getByRole('switch', { name: 'Inclus: Administrator' })).toBeTruthy();
    expect(within(joined).getByTestId('review-edit')).toBeTruthy();
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
      within(held).getByRole('switch', { name: 'Nu e inclus: Vestă reflectorizantă' })
    );
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'equipment-entry-2': { included: true } });
    const moved = screen
      .getAllByTestId('review-item')
      .find((row) => row.textContent?.includes('Vestă reflectorizantă'))!;
    await userEvent.click(
      within(moved).getByRole('switch', { name: 'Inclus: Vestă reflectorizantă' })
    );
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items).toEqual({});
    expect(
      within(screen.getByTestId('review-position-left-out')).getByRole('switch', {
        name: 'Nu e inclus: Vestă reflectorizantă',
      })
    ).toBeTruthy();
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

describe('reviewing related import data', () => {
  it.each([
    ['/workplaces', 'Sursa: Sediu'],
    ['/job-positions', 'Sursa: Brutar'],
    ['/responsible', 'Sursa: Radu Lazăr'],
    ['/fire-safety', 'Sursa: Stingător, Pulbere'],
    ['/equipment', 'Sursa: Mănuși termorezistente'],
  ])(
    'opens the original document from the %s edit dialog without saving the draft',
    async (section, sourceTitle) => {
      mockReview(secondPost());
      mount(section);

      const row = (await screen.findAllByTestId('review-item'))[0]!;
      await userEvent.click(within(row).getByTestId('review-edit'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText('Vezi contextul')).toBeNull();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Vezi în document' }));

      const source = await screen.findByTestId('import-source-dialog');
      expect(within(source).getByRole('heading', { name: sourceTitle })).toBeTruthy();
      expect(saves).toBe(0);
    }
  );

  it('labels the post category, work zone, training override and activities without changing them', async () => {
    const proposal = proposalFixture();
    Object.assign(proposal.jobPositions[0]!, {
      staffCategory: 'execution',
      workZone: 'Laborator de panificație',
      trainingIntervalMonths: 3,
      activities: 'Pregătește aluatul și coace produsele de panificație.',
    });
    mockReview(readyDetail({ proposal }));
    mount('/job-positions');

    const row = await screen.findByRole('listitem', { name: 'Brutar' });
    const details = Array.from(row.querySelectorAll('dt')).map((label) => [
      label.textContent,
      label.nextElementSibling?.textContent,
    ]);
    expect(details).toEqual([
      ['Categorie de personal', 'Execuție'],
      ['Zona de lucru', 'Laborator de panificație'],
      ['Interval de instruire', 'La 3 luni'],
      ['Activități', 'Pregătește aluatul și coace produsele de panificație.'],
    ]);
    expect(saves).toBe(0);
  });

  it('does not invent a post-specific training interval or absent optional details', async () => {
    const proposal = proposalFixture();
    Object.assign(proposal.jobPositions[0]!, {
      workZone: null,
      activities: null,
      trainingIntervalMonths: null,
    });
    mockReview(readyDetail({ proposal }));
    mount('/job-positions');

    const row = await screen.findByRole('listitem', { name: 'Brutar' });
    expect(Array.from(row.querySelectorAll('dt'), (label) => label.textContent)).toEqual([
      'Categorie de personal',
    ]);
    expect(saves).toBe(0);
  });

  it('numbers the displayed equipment entries and keeps their numbers when one is left out', async () => {
    mockReview(secondPost());
    mount('/equipment');

    const list = await screen.findByRole('list', { name: 'Articole de echipament' });
    expect(list.tagName).toBe('OL');
    expect(
      within(list)
        .getAllByTestId('equipment-item-number')
        .map((item) => item.textContent)
    ).toEqual(['1', '2']);
    const first = within(list).getAllByTestId('review-item')[0]!;
    await userEvent.click(within(first).getByRole('switch'));
    await waitFor(() => expect(saves).toBe(1));

    expect(
      within(list)
        .getAllByTestId('equipment-item-number')
        .map((item) => item.textContent)
    ).toEqual(['1', '2']);
    expect(within(first).queryByTestId('review-edit')).toBeNull();
    expect(within(first).getByText('Nu e inclus')).toBeDefined();
  });

  it('numbers visible equipment consecutively when an earlier source entry is set aside', async () => {
    mockReview(secondPost({ fields: {}, items: { 'position-1': { included: false } } }));
    mount('/equipment');

    const list = await screen.findByRole('list', { name: 'Articole de echipament' });
    expect(
      within(list)
        .getAllByTestId('equipment-item-number')
        .map((item) => item.textContent)
    ).toEqual(['1']);
    expect(list.textContent).toContain('Halat de protecție');
    expect(
      screen.getByTestId('review-list-protectiveEquipment').querySelector('h2')?.textContent
    ).toBe('Un articol');
  });

  it('labels equipment details and opens the referenced proposal post without changing data', async () => {
    mockReview(secondPost());
    mount('/equipment');

    const [equipment] = await screen.findAllByTestId('review-item');
    expect(within(equipment!).getByText('Risc acoperit')).toBeDefined();
    expect(within(equipment!).getByText('Murdărire')).toBeDefined();
    expect(within(equipment!).getByText('Alocare')).toBeDefined();
    expect(within(equipment!).getByText('Cantitate')).toBeDefined();
    expect(within(equipment!).queryByRole('link', { name: 'Murdărire' })).toBeNull();
    const post = within(equipment!).getByRole('link', { name: 'Brutar' });
    expect(post.getAttribute('href')).toContain('/job-positions#review-jobPositions-position-1');

    await userEvent.click(post);
    await waitFor(() => expect(document.activeElement?.id).toBe('review-jobPositions-position-1'));
    expect(saves).toBe(0);
  });

  it('does not link an unresolved equipment post to a nonexistent proposal item', async () => {
    mockReview(
      secondPost({
        fields: {},
        items: { 'equipment-entry-1': { values: { jobPosition: 'not-in-proposal' } } },
      })
    );
    mount('/equipment');

    const [equipment] = await screen.findAllByTestId('review-item');
    expect(within(equipment!).queryByTestId('import-reference-link')).toBeNull();
    expect(within(equipment!).getByText('Postul lipsește')).toBeDefined();
  });

  it('shows the workplace address and rooms as labelled review data', async () => {
    mockReview(readyDetail());
    mount('/workplaces');

    const card = await screen.findByTestId('review-list-workplaces');
    expect(within(card).getByText('Adresă')).toBeDefined();
    expect(within(card).getByText('Str. Morilor nr. 14, Sibiu, jud. Sibiu')).toBeDefined();
    expect(within(card).getByText('Încăperi')).toBeDefined();
    expect(within(card).getByText('Laborator')).toBeDefined();
    expect(within(card).getByText('Magazin')).toBeDefined();
    expect(card.textContent).not.toContain('Oprește comutatorul');
  });

  it('keeps a person’s all-workplaces coverage distinct from an unresolved reference', async () => {
    mockReview(readyDetail());
    mount('/responsible');

    const card = await screen.findByTestId('review-list-responsiblePersons');
    expect(within(card).getByText('Toate punctele de lucru')).toBeDefined();
    expect(within(card).queryByText('Punct de lucru neidentificat')).toBeNull();
    expect(within(card).queryByTestId('import-reference-link')).toBeNull();
  });

  it('links a responsible person’s resolved workplace without inventing a job-title link', async () => {
    mockReview(
      readyDetail({
        changes: { fields: {}, items: { 'person-1': { values: { workplace: 'workplace-1' } } } },
      })
    );
    mount('/responsible');

    const card = await screen.findByTestId('review-list-responsiblePersons');
    expect(within(card).getByText('Funcție')).toBeDefined();
    expect(within(card).getByText('Responsabilități')).toBeDefined();
    expect(within(card).getByRole('link', { name: 'Sediu' }).getAttribute('href')).toContain(
      '/workplaces#review-workplaces-workplace-1'
    );
    expect(within(card).queryByRole('link', { name: 'Brutar' })).toBeNull();
  });
});

describe('a post the import proposed that the member leaves out', () => {
  it('collapses in place to its name and switch, and opens again when switched on', async () => {
    mockReview(secondPost());
    mount('/job-positions');

    const rowOf = async (name: string) =>
      (await screen.findAllByTestId('review-item')).find((row) => row.textContent?.includes(name))!;
    const card = await screen.findByTestId('review-list-jobPositions');
    expect(card.textContent).toContain('2 posturi');
    expect(card.textContent).not.toContain('Oprește comutatorul');
    expect(
      within(await rowOf('Brutar')).getByRole('switch', { name: 'Inclus: Brutar' })
    ).toBeTruthy();
    expect(within(await rowOf('Brutar')).queryByTestId('review-include-item-word')).toBeNull();
    await userEvent.click(
      within(await rowOf('Vânzător')).getByRole('switch', { name: 'Inclus: Vânzător' })
    );
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({ 'position-3': { included: false } });

    const collapsed = await rowOf('Vânzător');
    expect(collapsed.textContent).toBe('VânzătorNu e inclus');
    expect(within(collapsed).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('review-left-out')).toBeNull();
    expect(screen.getByTestId('review-other-company').textContent).not.toContain('Vânzător');
    expect(screen.getAllByTestId('review-item').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Brutar'),
      'VânzătorNu e inclus',
    ]);
    expect(card.querySelector('h2')?.textContent).toBe('2 posturi, unul inclus');
    expect(document.activeElement).toBe(
      within(collapsed).getByRole('switch', { name: 'Nu e inclus: Vânzător' })
    );

    await userEvent.click(within(collapsed).getByRole('switch', { name: 'Nu e inclus: Vânzător' }));
    await waitFor(() => expect(saves).toBe(2));
    expect(document.activeElement).toBe(
      within(await rowOf('Vânzător')).getByRole('switch', { name: 'Inclus: Vânzător' })
    );
    expect(savedChanges(1).changes.items).toEqual({});
    expect((await rowOf('Vânzător')).textContent).toContain('Vânzarea produselor de panificație');
    expect(within(await rowOf('Vânzător')).getByTestId('review-edit')).toBeTruthy();
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

  it('leaves a category none of its posts is in off what to check, whatever its interval', async () => {
    mockReview(existing(), { documentDetails: { administrativeTrainingIntervalMonths: 6 } });
    mount();

    const kept = await screen.findByTestId('import-kept');
    await waitFor(() => expect(kept.textContent).toContain('Telefon'));
    expect(kept.textContent).not.toContain('tehnico-administrativ');
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
    const app = within(differs).getByRole('radio', { name: /În aplicație/ });
    expect((app as HTMLInputElement).checked).toBe(true);
    expect(within(differs).getByTestId('review-keep-app').textContent).toContain('0269 214 300');
    expect(within(differs).getByTestId('review-use-documents').textContent).toContain(
      '0269 214 377'
    );
    await userEvent.click(within(differs).getByRole('radio', { name: /În documente/ }));
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
    expect(waste.closest('[data-testid="review-row"]')!.textContent).toContain(
      'deșeuri menajere; carton'
    );
    expect(document.getElementById('review-fireSafety-hasThirdParties')!.textContent).toContain(
      'Da'
    );
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

  const checked = (scope: HTMLElement, name: RegExp) =>
    within(scope).getByRole('radio', { name }).matches(':checked');

  it('offers the corrected value over the document’s, one above the other, and takes either', async () => {
    mockReview(spellingDetail());
    mount('/job-positions');

    const row = (await screen.findAllByTestId('review-item')).find((item) =>
      item.textContent?.includes('Îngrijitor hotel')
    )!;
    const [name, zone] = within(row).getAllByTestId('review-spelling');
    expect(name!.textContent).toBe(
      'Scrierea corectată: majuscule și diacriticeScrierea corectatăIntră în documenteÎngrijitor hotelCa în documentINGRIJITOR HOTEL'
    );
    expect(checked(name!, /Scrierea corectată/)).toBe(true);
    expect(within(name!).queryByText('Compară')).toBeNull();
    expect(saves).toBe(0);
    expect(markedWords(name!)).toEqual(['Îngrijitor', 'INGRIJITOR']);
    expect(zone!.textContent).toContain('Scrierea corectată: majuscule');
    expect(zone!.textContent).not.toContain('diacritice');
    expect(markedWords(zone!)).toEqual([]);

    await userEvent.click(within(name!).getByRole('radio', { name: /Ca în document/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.items).toEqual({
      'position-1': { values: { name: 'INGRIJITOR HOTEL' } },
    });
    const kept = screen
      .getAllByTestId('review-item')
      .find((item) => item.textContent?.includes('INGRIJITOR HOTEL'))!;
    const [keptName] = within(kept).getAllByTestId('review-spelling');
    expect(checked(keptName!, /Ca în document/)).toBe(true);
    expect(within(kept).queryByTestId('edited-tag')).toBeNull();

    await userEvent.click(within(kept).getByTestId('review-edit'));
    const dialog = await screen.findByTestId('job-position-dialog');
    await userEvent.type(within(dialog).getByTestId('job-position-activities'), ', curățenie');
    await userEvent.click(within(dialog).getByTestId('job-position-save'));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.items['position-1']).toEqual({
      values: { name: 'INGRIJITOR HOTEL', activities: 'Frământare și coacere, curățenie' },
    });

    await userEvent.click(within(keptName!).getByRole('radio', { name: /Scrierea corectată/ }));
    await waitFor(() => expect(saves).toBe(3));
    expect(savedChanges(2).changes.items['position-1']).toEqual({
      values: { activities: 'Frământare și coacere, curățenie' },
    });
  });

  it('keeps the document’s spelling of a single value at a choice, and goes back to the corrected one', async () => {
    mockReview(spellingDetail());
    mount('/fire-safety');

    await screen.findByText('Locul pentru fumat');
    const row = document.getElementById('review-fireSafety-smokingPlace')!;
    const spelling = within(row).getByTestId('review-spelling');
    expect(spelling.textContent).toContain('Scrierea corectată: diacritice');
    expect(markedWords(spelling)).toEqual(['În', 'In']);
    expect(row.textContent?.match(/Locul pentru fumat/g)).toHaveLength(1);

    await userEvent.click(within(row).getByRole('radio', { name: /Ca în document/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'fireSafety.smokingPlace': { value: 'In curte' },
    });
    await waitFor(() => expect(checked(row, /Ca în document/)).toBe(true));
    expect(within(row).queryByTestId('edited-tag')).toBeNull();
    expect(row.textContent).not.toContain('Din documente');

    await userEvent.click(within(row).getByRole('radio', { name: /Scrierea corectată/ }));
    await waitFor(() => expect(saves).toBe(2));
    expect(savedChanges(1).changes.fields).toEqual({});
    await waitFor(() => expect(checked(row, /Scrierea corectată/)).toBe(true));
  });

  it('lists the corrections of the other sections at the end of the first', async () => {
    mockReview({ ...spellingDetail(), blockers: [] });
    mount('/identity');

    const others = await screen.findByTestId('review-other-sections');
    const rows = within(others).getAllByTestId('review-other-section');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Posturi de lucru'),
      expect.stringContaining('Apărarea împotriva incendiilor'),
    ]);
    expect(rows[0]!.textContent).toContain('2 corecturi de scriere');
    expect(rows[1]!.textContent).toContain(
      'Reguli de apărare împotriva incendiilor · locul pentru fumat'
    );
    expect(markedWords(rows[1]!)).toEqual(['În', 'In']);
    expect(
      within(rows[1]!).getByTestId('review-other-section-open').getAttribute('href')
    ).toContain('/fire-safety#review-fireSafety-smokingPlace');
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

describe('a value the import inferred', () => {
  const ssmMonth = {
    value: 3,
    sources: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'începând cu luna martie' }],
    otherCompanyName: null,
  };

  const inferredDetail = () => {
    const proposal = proposalFixture();
    Object.assign(proposal.trainingSchedule, {
      administrativeTrainingIntervalMonths: { options: [] },
      administrativeTrainingNotApplicable: {
        options: [
          { value: 'true', sources: [], otherCompanyName: null, inferred: 'no_posts_in_category' },
        ],
      },
      trainingFirstMonth: { options: [ssmMonth] },
    });
    Object.assign(proposal.fireSafety, {
      trainingFirstMonth: { options: [{ ...ssmMonth, inferred: 'ssm_training_schedule' }] },
    });
    Object.assign(proposal.jobPositions[0]!, {
      name: 'Contabil',
      workZone: 'Birou',
      needsProtectiveEquipment: false,
      inferred: { needsProtectiveEquipment: 'office_work' },
    });
    return readyDetail({ proposal });
  };

  it('says an office post was proposed without equipment, and leaves it undecided on request', async () => {
    mockReview(inferredDetail());
    mount('/job-positions');

    const decision = await screen.findByTestId('review-equipment-decision');
    expect(within(decision).getByTestId('review-inferred').textContent).toBe(
      'Post de birou fără echipament în documente, așa că nu i-am propus echipament.'
    );
    await userEvent.click(within(decision).getByRole('button', { name: 'Lasă de stabilit' }));
    await waitFor(() => expect(saves).toBe(1));
    expect(
      within(screen.getByTestId('review-equipment-decision')).queryByTestId('review-inferred')
    ).toBeNull();
  });
});

describe('the training cards', () => {
  const decision = 'dosar-ssm.zip/Decizie instruire 2025.docx';
  const themes = 'dosar-ssm.zip/Tematica instruire SSM.docx';
  const option = (value: number, file = decision, inferred?: string) => ({
    value,
    sources: [{ file, quote: String(value) }],
    otherCompanyName: null,
    ...(inferred ? { inferred } : {}),
  });
  const accountant = {
    ...proposalFixture().jobPositions[0]!,
    id: 'position-3',
    name: 'Contabil',
    staffCategory: 'technical_administrative',
  };
  const trainingDetail = (change: (proposal: ReturnType<typeof proposalFixture>) => void) => {
    const proposal = proposalFixture();
    change(proposal);
    return readyDetail({ proposal, blockers: [] });
  };
  const block = (path: string) => document.getElementById(`review-${path.replace('.', '-')}`)!;

  it('puts the SU schedule under Instruire, beside the SSM one', async () => {
    mockReview(trainingDetail(() => {}));
    mount('/training');

    expect(await screen.findByTestId('review-training-ssm')).toBeTruthy();
    expect(screen.getByTestId('review-training-su')).toBeTruthy();
    expect(screen.queryByText('Nu se aplică')).toBeNull();
  });

  it('keeps the fire rules, not the SU schedule, under the fire-safety section', async () => {
    mockReview(trainingDetail(() => {}));
    mount('/fire-safety');

    await screen.findByText('Deșeuri colectate');
    expect(screen.queryByTestId('review-training-su')).toBeNull();
  });

  it('offers each document’s interval in a box and saves the one picked', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.trainingSchedule.workerTrainingIntervalMonths = {
          options: [option(3), option(6, themes)],
        } as never;
      })
    );
    mount('/training');

    await screen.findByTestId('review-training-ssm');
    const worker = block('trainingSchedule.workerTrainingIntervalMonths');
    expect(worker.textContent).toContain('De ales');
    expect(worker.textContent).toContain('Documentele dau 2 intervale. Alege-l pe cel de acum.');
    expect(
      within(screen.getByTestId('review-training-ssm')).getByTestId('review-group-pending')
        .textContent
    ).toContain('Mai ai un lucru de făcut');

    await userEvent.click(within(worker).getByRole('radio', { name: /La 3 luni/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.workerTrainingIntervalMonths': { option: 0 },
    });
    expect(block('trainingSchedule.workerTrainingIntervalMonths').textContent).toContain(
      'La 3 luni'
    );
  });

  it('picks the longest legal interval for a category with posts the documents give none, until the member confirms it', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.jobPositions.push(accountant as never);
        proposal.trainingSchedule.administrativeTrainingIntervalMonths = { options: [] } as never;
      })
    );
    mount('/training');

    await screen.findByTestId('review-training-ssm');
    const administrative = block('trainingSchedule.administrativeTrainingIntervalMonths');
    expect(within(administrative).getByTestId('review-training-starting')).toBeTruthy();
    expect(administrative.textContent).toContain('La 12 luni');
    expect(within(administrative).getByTestId('review-training-starting-note')).toBeTruthy();

    await userEvent.click(within(administrative).getByRole('radio', { name: /Maximul legal/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.administrativeTrainingIntervalMonths': { value: 12 },
    });
    expect(
      within(block('trainingSchedule.administrativeTrainingIntervalMonths')).queryByTestId(
        'review-training-starting-note'
      )
    ).toBeNull();
  });

  it('starts SU at the usual interval of each category with posts, citing art. 26, until the member confirms it', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.jobPositions.push(accountant as never);
      })
    );
    mount('/training');

    await screen.findByTestId('review-training-su');
    const execution = block('fireSafety.workerTrainingIntervalMonths');
    const administrative = block('fireSafety.administrativeTrainingIntervalMonths');
    expect(execution.getAttribute('data-pending')).toBe('true');
    expect(administrative.getAttribute('data-pending')).toBe('true');
    const pick = (where: HTMLElement) =>
      within(where).getByTestId('review-training-starting-pick').textContent;
    expect(pick(execution)).toContain('Valoarea obișnuită');
    expect(pick(execution)).toContain('La 3 luni (OMAI 712/2005, art. 26)');
    expect(pick(administrative)).toContain('La 6 luni (OMAI 712/2005, art. 26)');
    expect(execution.textContent).not.toContain('Maximul legal');

    await userEvent.click(within(execution).getByRole('radio', { name: /Valoarea obișnuită/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'fireSafety.workerTrainingIntervalMonths': { value: 3 },
    });
  });

  it('shows the SU duration and calendar confirming starts an empty SU schedule with', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.trainingSchedule.trainingFirstMonth = { options: [option(3)] } as never;
        proposal.trainingSchedule.trainingDayFrom = { options: [option(10)] } as never;
        proposal.trainingSchedule.trainingDayTo = { options: [option(20)] } as never;
      })
    );
    mount('/training');

    const su = await screen.findByTestId('review-training-su');
    expect(
      (within(su).getByTestId('review-su-training-duration-2') as HTMLInputElement).checked
    ).toBe(true);
    expect(su.textContent).toContain(
      'Lipsește din documente. Am pus durata minimă; poți alege alta.'
    );
    expect((within(su).getByTestId('review-su-first-month') as HTMLSelectElement).value).toBe('3');
    expect((within(su).getByTestId('review-su-day-from') as HTMLInputElement).value).toBe('10');
    expect((within(su).getByTestId('review-su-day-to') as HTMLInputElement).value).toBe('20');
    expect(su.textContent).toContain('Le-am preluat din programul de instruire SSM');

    await userEvent.clear(within(su).getByTestId('review-su-day-from'));
    await userEvent.type(within(su).getByTestId('review-su-day-from'), '12');
    await userEvent.tab();
    await waitFor(() =>
      expect(savedChanges(saves - 1).changes.fields).toEqual({
        'fireSafety.trainingDayFrom': { value: 12 },
        'fireSafety.trainingDayTo': { value: 20 },
      })
    );
  });

  it('marks an SU interval as waiting and links it from the hub, as confirming blocks it', async () => {
    mockReview(
      readyDetail({
        proposal: proposalFixture(),
        blockers: [{ path: 'fireSafety.workerTrainingIntervalMonths', code: 'choice' }],
      })
    );
    mount();

    const link = await screen.findByTestId('import-blocker-link');
    expect(link.textContent).toBe('Confirmă periodicitatea SU pentru execuție');
    expect(link.getAttribute('href')).toContain('#review-fireSafety-workerTrainingIntervalMonths');
    expect(screen.getByTestId('import-confirm').getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps confirming waiting on the longest legal interval until the member confirms it', async () => {
    const proposal = proposalFixture();
    proposal.jobPositions.push(accountant as never);
    proposal.trainingSchedule.administrativeTrainingIntervalMonths = { options: [] } as never;
    mockReview(
      readyDetail({
        proposal,
        blockers: [
          { path: 'trainingSchedule.administrativeTrainingIntervalMonths', code: 'choice' },
        ],
      })
    );
    mount();

    const link = await screen.findByTestId('import-blocker-link');
    expect(link.textContent).toBe('Confirmă periodicitatea pentru tehnico-administrativ');
    expect(link.getAttribute('href')).toContain(
      '#review-trainingSchedule-administrativeTrainingIntervalMonths'
    );
    expect(screen.getByTestId('import-confirm').getAttribute('aria-disabled')).toBe('true');
  });

  it('gives every calendar field a place the hub links to, and says what a refused day needs', async () => {
    mockReview(
      readyDetail({
        proposal: (() => {
          const proposal = proposalFixture();
          proposal.trainingSchedule.trainingDayFrom = { options: [option(35)] } as never;
          return proposal;
        })(),
        blockers: [{ path: 'trainingSchedule.trainingDayFrom', code: 'invalid' }],
      })
    );
    mount('/training');

    expect((await screen.findByTestId('review-ssm-day-from-error')).textContent).toBe(
      'Scrie o zi între 1 și 31.'
    );
    for (const path of [
      'trainingSchedule.trainingFirstMonth',
      'trainingSchedule.trainingDayFrom',
      'trainingSchedule.trainingDayTo',
      'trainingSchedule.periodicTrainingMinutes',
      'fireSafety.trainingFirstMonth',
      'fireSafety.periodicTrainingHours',
    ]) {
      expect(block(path)).toBeTruthy();
    }
    expect(within(block('trainingSchedule.trainingDayFrom')).getByRole('textbox')).toBeTruthy();
  });

  it('asks to write a refused day again rather than to pick one', async () => {
    const proposal = proposalFixture();
    proposal.trainingSchedule.trainingDayFrom = { options: [option(35)] } as never;
    mockReview(
      readyDetail({
        proposal,
        blockers: [{ path: 'trainingSchedule.trainingDayFrom', code: 'invalid' }],
      })
    );
    mount();

    expect((await screen.findByTestId('import-blocker-link')).textContent).toBe(
      'Scrie ziua de început a instruirii'
    );
  });

  it('says when the last day comes before the first, once the member leaves the field', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.trainingSchedule.trainingDayFrom = { options: [option(12)] } as never;
        proposal.trainingSchedule.trainingDayTo = { options: [option(15)] } as never;
      })
    );
    mount('/training');

    const to = await screen.findByTestId('review-ssm-day-to');
    await userEvent.clear(to);
    await userEvent.type(to, '7');
    expect(screen.queryByTestId('review-ssm-day-to-error')).toBeNull();
    await userEvent.tab();
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.trainingDayTo': { value: 7 },
    });
    expect(screen.getByTestId('review-ssm-day-to-error').textContent).toBe(
      'Ultima zi vine după prima. Scrie o zi între 12 și 31.'
    );
  });

  it('shows a duration outside the list as not to be picked, with the list open', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.trainingSchedule.periodicTrainingMinutes = { options: [option(45)] } as never;
      })
    );
    mount('/training');

    const outside = await screen.findByTestId('review-training-outside');
    expect(within(outside).getByTestId('review-training-not-listed').textContent).toBe(
      'Nu e în listă'
    );
    expect(
      (within(outside).getByRole('radio', { name: /45 de minute/ }) as HTMLInputElement).disabled
    ).toBe(true);
    await userEvent.click(within(outside).getByTestId('review-ssm-duration-other-60'));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.periodicTrainingMinutes': { value: 60 },
    });
  });

  it('leaves out a category none of the kept posts is in, and says its interval comes back with a post', async () => {
    mockReview(trainingDetail(() => {}));
    mount('/training');

    const absent = await screen.findByTestId('review-ssm-absent-technical_administrative');
    expect(absent.textContent).toContain('nu preiei niciun post din această categorie');
    expect(absent.textContent).toContain('Documentele dau pentru tehnico-administrativ la 12 luni');
    expect(
      document.getElementById('review-trainingSchedule-administrativeTrainingIntervalMonths')
    ).toBeNull();
  });

  it('asks for posts before intervals when the import keeps none', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.jobPositions = [];
      })
    );
    mount('/training');

    expect(await screen.findAllByTestId('review-training-no-posts')).toHaveLength(2);
  });

  it('says the SU calendar was taken from the SSM one, and saves a month picked over it', async () => {
    mockReview(
      trainingDetail((proposal) => {
        proposal.trainingSchedule.trainingFirstMonth = { options: [option(3)] } as never;
        Object.assign(proposal.fireSafety, {
          trainingFirstMonth: { options: [option(3, decision, 'ssm_training_schedule')] },
        });
      })
    );
    mount('/training');

    const su = await screen.findByTestId('review-training-su');
    expect(su.textContent).toContain('Preluată din programul de instruire SSM');
    expect(
      within(block('fireSafety.trainingFirstMonth')).getByRole('button', {
        name: 'Vezi în document',
      })
    ).toBeTruthy();
    await userEvent.selectOptions(within(su).getByTestId('review-su-first-month'), '9');
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'fireSafety.trainingFirstMonth': { value: 9 },
    });
  });

  it("waits for an existing client's posts before showing its intervals, and offers to load them again", async () => {
    let answers = 0;
    mockReview(
      readyDetail({
        intoExistingClient: true,
        client: { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' },
        blockers: [],
      }),
      {
        positions: () =>
          ++answers === 1 ? Response.json({}, { status: 404 }) : Response.json({ items: [] }),
      }
    );
    mount('/training');

    const failed = await screen.findByTestId('import-review-positions-error');
    expect(screen.queryByTestId('review-training-ssm')).toBeNull();
    await userEvent.click(within(failed).getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('review-training-ssm')).toBeTruthy();
  });

  it("keeps an existing client's interval where the documents give two, without waiting on a pick", async () => {
    const proposal = proposalFixture();
    proposal.trainingSchedule.workerTrainingIntervalMonths = {
      options: [option(6), option(4, themes)],
    } as never;
    const detail = readyDetail({
      proposal,
      intoExistingClient: true,
      client: { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' },
      blockers: [],
    });
    mockReview(detail, { documentDetails: { workerTrainingIntervalMonths: 3 } });
    mount('/training');

    await waitFor(() =>
      expect(
        within(block('trainingSchedule.workerTrainingIntervalMonths')).getByTestId(
          'review-keep-app'
        )
      ).toBeTruthy()
    );
    const worker = block('trainingSchedule.workerTrainingIntervalMonths');
    expect(worker.textContent).toContain('Păstrăm valoarea din aplicație dacă nu alegi altfel.');
    expect(worker.getAttribute('data-pending')).toBeNull();
    expect(
      (within(worker).getByRole('radio', { name: /În aplicație/ }) as HTMLInputElement).checked
    ).toBe(true);
    await userEvent.click(within(worker).getByRole('radio', { name: /La 4 luni/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.workerTrainingIntervalMonths': { option: 1, replace: true },
    });
  });

  it("keeps an existing client's interval where the documents differ, until the member takes theirs", async () => {
    const detail = readyDetail({
      intoExistingClient: true,
      client: { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' },
      blockers: [],
    });
    mockReview(detail, { documentDetails: { workerTrainingIntervalMonths: 3 } });
    mount('/training');

    const differs = await screen.findByTestId('review-training-differs');
    expect(
      (within(differs).getByRole('radio', { name: /În aplicație/ }) as HTMLInputElement).checked
    ).toBe(true);
    expect(within(differs).getByTestId('review-keep-app').textContent).toContain('La 3 luni');
    await userEvent.click(within(differs).getByRole('radio', { name: /În documente/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({
      'trainingSchedule.workerTrainingIntervalMonths': { replace: true },
    });
  });
});

describe('the credits the import used', () => {
  const credits = { used: 34, atStart: 25, scannedPages: 9, refunded: false };

  it('says them quietly before the client is created', async () => {
    mockReview(readyDetail({ blockers: [], credits }));
    mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('import-credits-used').textContent).toBe(
        'Importul a folosit 34 de credite (25 + 9 pagini scanate).'
      )
    );
  });

  it('says how far below zero the balance went and that it comes off next month', async () => {
    mockReview(readyDetail({ blockers: [], credits }), {
      me: meWithCredits({ left: -4, giftLeft: 0, state: 'negative' }),
    });
    mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('import-credits-used').textContent).toBe(
        'Importul a folosit 34 de credite (25 + 9 pagini scanate). Ai trecut cu 4 peste cele rămase; le scădem din creditele lunii viitoare.'
      )
    );
  });

  it('says nothing about credits before the import has any', async () => {
    mockReview(readyDetail({ blockers: [], credits: null }));
    mount();

    await userEvent.click(await screen.findByTestId('import-confirm'));
    const dialog = await screen.findByTestId('import-confirm-dialog');
    expect(within(dialog).queryByTestId('import-credits-used')).toBeNull();
  });
});

describe('two phone numbers the documents give', () => {
  const twoPhones = () => {
    const proposal = proposalFixture();
    proposal.client.contactPhone = {
      options: [
        {
          value: '0722 315 408',
          sources: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Tel. 0722 315 408' }],
          otherCompanyName: null,
        },
        {
          value: '0722 351408',
          sources: [{ file: 'Contract prestari SSM 2019.pdf', quote: 'telefon 0722 351408' }],
          otherCompanyName: null,
        },
      ],
    };
    return readyDetail({ proposal });
  };

  it('shows both in one format, marks the digits they differ by, and keeps the one picked as written', async () => {
    mockReview(twoPhones());
    mount('/identity');

    await screen.findByText('Telefon');
    const row = document.getElementById('review-client-contactPhone')!;
    expect(within(row).getByTestId('review-phone-differs').textContent).toBe(
      'Numerele diferă prin cifrele marcate.'
    );
    const [first, second] = within(row).getAllByTestId('review-phone');
    expect(first!.textContent).toBe('0722 315 408');
    expect(second!.textContent).toBe('0722 351 408');
    expect([...first!.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['15']);
    expect([...second!.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['51']);

    await userEvent.click(within(row).getByRole('radio', { name: /Contract prestari/ }));
    await waitFor(() => expect(saves).toBe(1));
    expect(savedChanges(0).changes.fields).toEqual({ 'client.contactPhone': { option: 1 } });
  });
});

describe('the persistent import review bar', () => {
  it('explains a non-blocking review status and points to the default-excluded person without including them', async () => {
    const proposal = proposalFixture();
    mockReview(
      readyDetail({
        proposal: {
          ...proposal,
          employees: [
            {
              ...proposal.employees[0]!,
              id: 'employee-legal',
              role: 'legal_representative',
              lastName: 'Popescu',
              firstName: 'Ioana',
              hiredAt: null,
            },
          ],
        },
        blockers: [],
      })
    );
    mount();
    const hub = await screen.findByTestId('import-review-hub');
    const link = within(hub)
      .getAllByTestId('import-section-link')
      .find((entry) => entry.dataset.section === 'responsible')!;
    expect(link.textContent).toContain('Reprezentant legal nepreluat automat');
    expect(link.textContent).toContain('De verificat');
    expect(screen.getByTestId('import-confirm').getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(link);
    const note = await screen.findByTestId('import-section-advisories');
    expect(note.textContent).toContain('nu împiedică confirmarea');
    await userEvent.click(within(note).getByRole('button', { name: /Popescu Ioana/ }));
    const item = document.getElementById('review-employees-employee-legal')!;
    await waitFor(() => expect(document.activeElement).toBe(item));
    expect(within(item).getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(saves).toBe(0);
  });

  it('distinguishes optional empty fields from required missing data', async () => {
    const proposal = proposalFixture();
    proposal.client.contactEmail.options = [];
    proposal.client.cui.options = [];
    mockReview(
      readyDetail({
        proposal,
        registeredCompany: null,
        blockers: [{ path: 'client.cui', code: 'missing' }],
      })
    );
    mount('/identity');
    await screen.findByTestId('import-review-section');
    const optional = document.getElementById('review-client-contactEmail')!;
    const required = document.getElementById('review-client-cui')!;
    expect(optional.dataset.tone).toBe('optional');
    expect(optional.textContent).toContain('Opțional.');
    expect(optional.textContent).not.toContain('De ales');
    expect(required.dataset.tone).toBe('todo');
    expect(required.textContent).toContain('obligatoriu');
    const bar = screen.getByRole('region', { name: 'Navigarea prin propunere' });
    expect(within(bar).getByRole('button', { name: '1 dată lipsă' })).toBeTruthy();
  });

  it('shows the section readiness independently of a save still in progress', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockReview(readyDetail({ blockers: [] }), {
      save: () => held.then(() => Response.json({ version: 4, blockers: [] })),
    });
    mount('/workplaces');

    const bar = await screen.findByRole('region', { name: 'Navigarea prin propunere' });
    expect(within(bar).getByTestId('section-status').textContent).toBe('Gata');
    await userEvent.click(screen.getByRole('switch', { name: /Inclus:/ }));
    expect(within(bar).getByTestId('section-status').textContent).toBe('Gata');
    expect(within(bar).getByTestId('import-save-status').textContent).toBe('Se salvează…');

    release();
    await waitFor(() =>
      expect(within(bar).getByTestId('import-save-status').textContent).toBe('Salvat în propunere')
    );
    expect(within(bar).getByTestId('section-status').textContent).toBe('Gata');
  });

  it('does not label an advisory section ready merely because it has no blockers', async () => {
    const proposal = proposalFixture();
    mockReview(
      readyDetail({
        proposal: {
          ...proposal,
          workplaces: proposal.workplaces.map((workplace) => ({
            ...workplace,
            otherCompanyName: 'Altă firmă SRL',
          })),
        },
        blockers: [],
      })
    );
    mount('/workplaces');

    const bar = await screen.findByRole('region', { name: 'Navigarea prin propunere' });
    expect(within(bar).queryByTestId('section-status')).toBeNull();
    expect(within(bar).getByTestId('import-save-status').textContent).toBe('Salvat în propunere');
  });

  it('keeps missing data and choices visible while another change saves', async () => {
    const proposal = proposalFixture();
    proposal.client.cui.options = [];
    const blockers = [
      { path: 'client.cui', code: 'missing' },
      { path: 'client.legalRepresentativeName', code: 'choice' },
    ];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockReview(readyDetail({ proposal, blockers, registeredCompany: null }), {
      save: () => held.then(() => Response.json({ version: 4, blockers })),
    });
    mount('/identity');

    const bar = await screen.findByRole('region', { name: 'Navigarea prin propunere' });
    await userEvent.click(screen.getByTestId('review-include-field'));
    expect(within(bar).getByRole('button', { name: '1 dată lipsă' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy();
    expect(within(bar).getByTestId('import-save-status').textContent).toContain('Se salvează…');
    expect(within(bar).queryByText('Salvat în propunere')).toBeNull();

    release();
    await waitFor(() =>
      expect(within(bar).getByTestId('import-save-status').textContent).toContain(
        'Salvat în propunere'
      )
    );
    expect(within(bar).getByRole('button', { name: '1 dată lipsă' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy();
  });

  it('focuses only the first remaining outer container in page order without suggesting a choice', async () => {
    const proposal = proposalFixture();
    proposal.client.contactPhone.options.push({
      ...proposal.client.contactPhone.options[0]!,
      value: '0269 214 399',
    });
    const phone = { path: 'client.contactPhone', code: 'choice' };
    mockReview(
      readyDetail({
        proposal,
        blockers: [phone, { path: 'client.legalRepresentativeName', code: 'choice' }],
      }),
      {
        save: () => Response.json({ version: 4, blockers: [phone] }),
      }
    );
    mount('/identity');
    const bar = await screen.findByRole('region', { name: 'Navigarea prin propunere' });
    const first = document.getElementById('review-client-legalRepresentativeName')!;

    await userEvent.click(within(bar).getByRole('button', { name: '2 alegeri' }));
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(first.querySelector(':focus')).toBeNull();
    expect(first.querySelector('[data-pointed]')).toBeNull();
    expect(
      within(first)
        .getAllByRole<HTMLInputElement>('radio')
        .every((option) => !option.checked)
    ).toBe(true);

    await userEvent.click(within(bar).getByRole('button', { name: '2 alegeri' }));
    await waitFor(() => expect(document.activeElement).toBe(first));
    await userEvent.click(within(first).getByRole('radio', { name: /Dorin Mureșan/ }));
    await waitFor(() =>
      expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy()
    );
    await userEvent.click(within(bar).getByRole('button', { name: '1 alegere' }));
    const next = document.getElementById('review-client-contactPhone')!;
    await waitFor(() => expect(document.activeElement).toBe(next));
    expect(next.querySelector(':focus')).toBeNull();
    expect(
      within(next)
        .getAllByRole<HTMLInputElement>('radio')
        .every((option) => !option.checked)
    ).toBe(true);
  });

  it('returns from the last section to the import overview before client confirmation', async () => {
    mockReview(readyDetail());
    const runtime = mount('/equipment');
    const review = await screen.findByRole('link', { name: /Revizuiește importul/ });
    await userEvent.click(review);
    await screen.findByTestId('import-review-hub');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/import/${importId}`);
    expect(screen.queryByTestId('import-confirm-dialog')).toBeNull();
    expect(requestsTo(`/imports/${importId}/confirm`, 'POST')).toHaveLength(0);
  });
});
