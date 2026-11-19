import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@/api/generated/api';
import { installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, importDetail, meWithCredits, summaryOf } from '@/test/import-fixture';
import { mountApp } from '@/test/mount';

let serial = 0;

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function listed(overrides: Record<string, unknown> = {}) {
  serial += 1;
  return {
    ...summaryOf(importDetail()),
    id: `7a000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    expiresAt: null,
    people: null,
    uninvited: null,
    progress: null,
    ...overrides,
  };
}

const hotel = { id: clientId, legalName: 'Hotel Carpați Sinaia SRL' };

const readyClient = listed({
  status: 'ready',
  companyName: 'Transcom Logistic SRL',
  fileCount: 23,
  expiresAt: inDays(10),
  createdBy: { id: 'user-two', fullName: 'Andreea Mureșan' },
});
const partsToReview = listed({
  status: 'confirmed',
  client: hotel,
  intoExistingClient: true,
  confirmedAt: '2026-11-14T10:00:00+02:00',
  libraryParts: [
    { part: 'instructions_ssm', status: 'to_review', expiresAt: inDays(5) },
    { part: 'risk_evaluations', status: 'to_review', expiresAt: inDays(5) },
  ],
});
const readingClient = listed({
  status: 'reading',
  companyName: null,
  fileCount: 17,
  progress: { files: 17, prepared: 17, scans: 17, scansRead: 11 },
});
const failedClient = listed({
  status: 'failed',
  companyName: 'Clinica Dentară Zâmbet SRL',
  failureReason: 'Arhiva ZIP e protejată cu parolă.',
});
const readyEmployees = listed({
  kind: 'employees',
  status: 'ready',
  client: hotel,
  intoExistingClient: true,
  fileCount: 41,
  people: { total: 36, toCheck: 9, checked: 24, setAside: 3 },
});

const confirmedClosed = listed({
  status: 'confirmed',
  companyName: 'Elcons Instal SRL',
  companyCui: 'RO35190277',
  client: { id: 'c2000000-0000-4000-8000-000000000002', legalName: 'Elcons Instal SRL' },
  fileCount: 31,
  confirmedAt: '2026-11-12T10:00:00+02:00',
});
const abandonedClosed = listed({
  status: 'abandoned',
  companyName: 'Tipografia Unirea SRL',
  companyCui: '30018842',
  fileCount: 9,
  abandonedAt: '2026-10-28T10:00:00+02:00',
});

const clients = [
  {
    id: clientId,
    legalName: 'Hotel Carpați Sinaia SRL',
    cui: '29871104',
    vatPayer: false,
    currentEmployeeCount: 33,
  },
];

let items: Record<string, unknown>[] = [];
let closed: Record<string, Record<string, unknown>[]> = {};
let clientItems: Record<string, unknown>[] = [];
let clientsTotal: number | null = null;
let importsFail = false;
let closedHangs = false;
let me: MeResponse = meWithCredits({ left: 812, included: 1250, giftLeft: 0 });

function mount(path: string) {
  mockApi((_init, url) => {
    if (url.pathname === '/imports') {
      return importsFail
        ? Response.json({ error: 'internal', message: 'Boom.' }, { status: 500 })
        : Response.json({ items });
    }
    if (url.pathname === '/imports/closed') {
      if (closedHangs) return new Promise<Response>(() => undefined);
      const all = closed[url.searchParams.get('kind') ?? 'client'] ?? [];
      const pageSize = Number(url.searchParams.get('pageSize'));
      return Response.json({
        items: all.slice(0, pageSize),
        page: 1,
        pageSize,
        total: all.length,
      });
    }
    if (url.pathname === '/clients') {
      const q = url.searchParams.get('q')?.toLowerCase();
      const found = clientItems.filter(
        (client) => !q || String(client.legalName).toLowerCase().includes(q)
      );
      return Response.json({
        items: found,
        page: 1,
        pageSize: 50,
        total: clientsTotal ?? found.length,
        unfilteredTotal: clientItems.length,
      });
    }
    if (url.pathname === '/me') return Response.json(me);
    return undefined;
  });
  return mountApp(authFixture(makeSession()).client, path);
}

const bandsIn = (list: HTMLElement) =>
  within(list)
    .getAllByTestId('imports-band')
    .map((band) => ({
      title: within(band).getByRole('heading').textContent,
      rows: within(band)
        .getAllByTestId('imports-row')
        .map((row) => within(row).getByTestId('imports-row-state').textContent),
    }));

beforeEach(() => {
  items = [readyClient, partsToReview, readingClient, failedClient, readyEmployees];
  closed = { client: [confirmedClosed, abandonedClosed], employees: [] };
  clientItems = clients;
  clientsTotal = null;
  importsFail = false;
  closedHangs = false;
  me = meWithCredits({ left: 812, included: 1250, giftLeft: 0 });
});

installFetchMock();

describe('the Importuri AI page', () => {
  it('opens on Clienți, with the team’s imports banded and what waits counted on each tab', async () => {
    const runtime = mount('/importuri');
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/importuri/clienti'));

    const tabs = await screen.findAllByTestId('imports-section');
    await waitFor(() =>
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Clienți2 de verificat',
        'Lucrători1 de verificat',
      ])
    );
    const group = screen.getByTestId('nav-imports-group');
    expect(
      within(group)
        .getAllByTestId('nav-sub-count')
        .map((pill) => pill.textContent)
    ).toEqual(['2 de verificat', '1 de verificat']);
    expect(screen.queryByTestId('nav-imports-count')).toBeNull();
    expect(screen.getByTestId('imports-credits').textContent).toBe(
      'Credite AI rămase 812 din 1.250 luna aceasta'
    );

    const list = await screen.findByTestId('imports-open');
    expect(bandsIn(list)).toEqual([
      { title: 'De verificat2', rows: ['Propunere de verificat', '2 părți de verificat'] },
      { title: 'Se citesc1', rows: ['Se citește documentația'] },
      { title: 'S-au oprit1', rows: ['S-a oprit'] },
    ]);
    expect(screen.getByTestId('imports-count').textContent).toBe('4 deschise');
    expect(within(list).getByText('Andreea Mureșan')).toBeTruthy();
    expect(within(list).getByRole('link', { name: 'Verifică părțile' }).getAttribute('href')).toBe(
      `/clienti/import/${partsToReview.id}`
    );
    expect(
      within(list)
        .getByRole('link', { name: /Client nou din documente/ })
        .getAttribute('href')
    ).toBe(`/clienti/import/${readingClient.id}`);
  });

  it('shows the folded entry with the total waiting off the page', async () => {
    mount('/profil');
    const pill = await screen.findByTestId('nav-imports-count');
    expect(pill.textContent).toBe('3 de verificat');
    expect(screen.queryByTestId('nav-imports-group')).toBeNull();
  });

  it('leaves a tab with nothing waiting without a count', async () => {
    items = [readingClient, readyEmployees];
    mount('/importuri/lucratori');
    const tabs = await screen.findAllByTestId('imports-section');
    await waitFor(() => expect(tabs[1]!.textContent).toBe('Lucrători1 de verificat'));
    expect(within(tabs[0]!).queryByTestId('section-nav-count')).toBeNull();
    const list = await screen.findByTestId('imports-open');
    expect(within(list).getByText('Fișe de instruire · 41 de fotografii')).toBeTruthy();
    expect(within(list).getByText('24 verificate, 3 lăsate deoparte')).toBeTruthy();
  });

  it('keeps Deschise or Încheiate in the address, and lists the closed imports by page', async () => {
    const runtime = mount('/importuri/clienti');
    const user = userEvent.setup();
    await screen.findByTestId('imports-open');

    await user.click(screen.getByTestId('imports-filter-closed'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ status: 'closed' }));
    const rows = await screen.findAllByTestId('imports-closed-row');
    expect(rows.map((row) => within(row).getByTestId('imports-closed-result').textContent)).toEqual(
      ['Client creat', 'Renunțat']
    );
    expect(
      within(rows[0]!).getByRole('link', { name: 'Elcons Instal SRL' }).getAttribute('href')
    ).toBe(`/clienti/import/${confirmedClosed.id}`);
    expect(within(rows[1]!).queryByRole('link')).toBeNull();
    expect(screen.getByTestId('imports-count').textContent).toBe('2 importuri');
    expect(screen.queryByTestId('imports-new')).toBeNull();

    await user.click(rows[0]!.querySelector('td:nth-child(3)')!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/import/${confirmedClosed.id}`)
    );
  });

  it('starts a new client, or completes one picked from the list', async () => {
    mount('/importuri/clienti');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('imports-new'));
    const menu = await screen.findByTestId('imports-new-menu');
    expect(menu.textContent).toContain('Îți mai rămân 812 credite AI luna aceasta');
    await user.click(within(menu).getByTestId('imports-new-client'));
    const upload = await screen.findByTestId('import-upload-dialog');
    expect(within(upload).getByRole('heading', { name: 'Client nou din documente' })).toBeTruthy();
    await user.click(within(upload).getByRole('button', { name: 'Renunță' }));
    await waitFor(() => expect(screen.queryByTestId('import-upload-dialog')).toBeNull());

    await user.click(screen.getByTestId('imports-new'));
    await user.click(await screen.findByTestId('imports-complete-client'));
    const picker = await screen.findByTestId('imports-client-picker');
    expect(
      within(picker).getByRole('heading', { name: 'Completează un client din documente' })
    ).toBeTruthy();
    const continueButton = within(picker).getByTestId('imports-client-continue');
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    const option = await within(picker).findByRole('radio', { name: /Hotel Carpați Sinaia SRL/ });
    expect(option.closest('label')!.textContent).toContain('CUI 29871104 · 33 de lucrători');
    await user.click(option);
    await user.click(continueButton);

    const completing = await screen.findByTestId('import-upload-dialog');
    expect(
      within(completing).getByRole('heading', { name: 'Completează din documentație' })
    ).toBeTruthy();
    expect(within(completing).getByTestId('import-upload-one-client').textContent).toContain(
      'Hotel Carpați Sinaia SRL'
    );
    expect(screen.queryByTestId('imports-client-picker')).toBeNull();
    expect(
      requestsTo('/clients').some(
        ([input]) => new URL(String(input)).searchParams.get('stage') === 'client'
      )
    ).toBe(true);
  });

  it('opens the client picker, then the sheets upload, from Import nou on Lucrători', async () => {
    mount('/importuri/lucratori');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('imports-new'));
    const picker = await screen.findByTestId('imports-client-picker');
    expect(
      within(picker).getByRole('heading', { name: 'Lucrători din fișe de instruire' })
    ).toBeTruthy();
    await user.click(
      await within(picker).findByRole('radio', { name: /Hotel Carpați Sinaia SRL/ })
    );
    await user.click(within(picker).getByTestId('imports-client-continue'));

    expect(await screen.findByTestId('employee-upload-dialog')).toBeTruthy();
  });

  it('offers the first import to an account that never imported, with its credits', async () => {
    items = [];
    closed = { client: [], employees: [] };
    me = meWithCredits({ period: 'trial', left: 300, included: 300, giftLeft: 0 });
    mount('/importuri/clienti');

    const first = await screen.findByTestId('imports-first');
    expect(first.textContent).toBe('Niciun import încă');
    expect(screen.getByTestId('imports-first-start').textContent).toContain(
      'Adaugă primul client cu AI'
    );
    expect(screen.getByTestId('imports-credits-available').textContent).toBe(
      'Ai 300 de credite AI în perioada de probă.'
    );
    expect(screen.queryByTestId('imports-credits')).toBeNull();
    expect(screen.queryByTestId('imports-toolbar')).toBeNull();
  });

  it('waits for the first client before offering a sheets import', async () => {
    items = [];
    closed = { client: [], employees: [] };
    clientItems = [];
    mount('/importuri/lucratori');

    expect((await screen.findByTestId('imports-first')).textContent).toBe(
      'Niciun import de lucrători încă'
    );
    await waitFor(() =>
      expect(screen.getByTestId('imports-first-start').getAttribute('aria-disabled')).toBe('true')
    );
    expect(screen.getByTestId('imports-first-start').textContent).toContain('După primul client');
  });

  it('counts an import that closes while the page is open as history', async () => {
    items = [readyClient];
    closed = { client: [], employees: [] };
    const runtime = mount('/importuri/clienti');
    await screen.findByTestId('imports-open');

    items = [];
    closed = { client: [abandonedClosed], employees: [] };
    await runtime.queryClient.invalidateQueries({ queryKey: ['/imports'] });

    expect((await screen.findByTestId('imports-open-empty')).textContent).toBe(
      'Niciun import de client deschis'
    );
    expect(screen.getByTestId('imports-toolbar')).toBeTruthy();
    expect(screen.queryByTestId('imports-first')).toBeNull();
  });

  it('asks for the closed totals again only when an import closes', async () => {
    const runtime = mount('/importuri/clienti');
    await screen.findByTestId('imports-open');
    await waitFor(() => expect(requestsTo('/imports/closed').length).toBeGreaterThan(0));
    const asked = requestsTo('/imports/closed').length;

    items = [...items];
    await runtime.queryClient.invalidateQueries({ queryKey: ['/imports'] });
    await waitFor(() => expect(requestsTo('/imports').length).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestsTo('/imports/closed')).toHaveLength(asked);

    items = items.filter((each) => each !== failedClient);
    await runtime.queryClient.invalidateQueries({ queryKey: ['/imports'] });
    await waitFor(() => expect(requestsTo('/imports/closed').length).toBeGreaterThan(asked));
  });

  it('offers to load the open imports again when they fail', async () => {
    importsFail = true;
    mount('/importuri/clienti');
    const user = userEvent.setup();

    const failed = await screen.findByTestId('imports-open-error', {}, { timeout: 5000 });
    expect(failed.textContent).toContain('Nu am putut încărca importurile.');
    importsFail = false;
    await user.click(within(failed).getByRole('button'));
    expect(await screen.findByTestId('imports-open')).toBeTruthy();
  });

  it('waits for the history before saying a tab has nothing open', async () => {
    items = [readyEmployees];
    closedHangs = true;
    mount('/importuri/clienti');

    await screen.findByTestId('imports-tab-client');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('imports-toolbar')).toBeNull();
    expect(screen.queryByTestId('imports-open-empty')).toBeNull();
    expect(screen.queryByTestId('imports-first')).toBeNull();
  });

  it('shows a dash for an abandoned import that had no files', async () => {
    closed = { client: [{ ...abandonedClosed, fileCount: 0 }], employees: [] };
    mount('/importuri/clienti?status=closed');

    const [row] = await screen.findAllByTestId('imports-closed-row');
    expect(row!.querySelector('td:nth-child(2)')!.textContent).toBe('—');
  });

  it('shows the same credits under the title and in the menu, gift included', async () => {
    me = meWithCredits({ left: 1270, included: 1500, giftLeft: 7840 });
    mount('/importuri/clienti');
    const user = userEvent.setup();

    expect((await screen.findByTestId('imports-credits')).textContent).toBe(
      'Credite AI rămase 9.110, cu cele de bun venit'
    );
    await user.click(await screen.findByTestId('imports-new'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByTestId('imports-credits-available').textContent).toBe(
      'Îți mai rămân 9.110 credite AI, cu cele de bun venit'
    );
    expect(menu.getAttribute('aria-describedby')).toBe(
      within(menu).getByTestId('imports-credits-available').id
    );
  });

  it('drops a picked client the search hides, and says when the list is cut short', async () => {
    clientItems = [
      ...clients,
      { ...clients[0], id: 'c3000000-0000-4000-8000-000000000003', legalName: 'Elcons Instal SRL' },
    ];
    clientsTotal = 60;
    mount('/importuri/lucratori');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('imports-new'));
    const picker = await screen.findByTestId('imports-client-picker');
    expect((await within(picker).findByTestId('imports-client-capped')).textContent).toContain(
      'Caută'
    );
    await user.click(within(picker).getByRole('radio', { name: /Hotel Carpați/ }));
    const continueButton = within(picker).getByTestId('imports-client-continue');
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);

    await user.type(within(picker).getByTestId('imports-client-search'), 'Elcons');
    await waitFor(() =>
      expect(within(picker).queryByRole('radio', { name: /Hotel Carpați/ })).toBeNull()
    );
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expect(within(picker).getByRole('button', { name: 'Renunță' })).toBeTruthy();
  });

  it('says nothing is open on a tab that has a history', async () => {
    items = [readyEmployees];
    mount('/importuri/clienti');

    expect((await screen.findByTestId('imports-open-empty')).textContent).toBe(
      'Niciun import de client deschis'
    );
    expect(screen.getByTestId('imports-count').textContent).toBe('0 deschise');
    expect(screen.getByTestId('imports-new')).toBeTruthy();
  });

  it('opens the Import nou menu from the bottom on a phone', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    mount('/importuri/clienti');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('imports-new'));
    const sheet = await screen.findByRole('dialog', { name: 'Import nou' });
    expect(within(sheet).getByTestId('imports-complete-client')).toBeTruthy();
  });
});
