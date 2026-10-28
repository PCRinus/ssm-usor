import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  bodyOf,
  clientId,
  fetchMock,
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

function mockReview(detail: Detail, { save }: { save?: (body: unknown) => Response } = {}) {
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
      return Response.json({ clientId, fileCount: 3 });
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
    proposal.flags = [
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
