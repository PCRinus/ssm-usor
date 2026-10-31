import { toast } from '@ssm-usor/ui/lib/toast';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { inDays, meFor } from '@/test/billing-fixture';
import { clientId, fetchMock, importDetail, mockApi, summaryOf } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const mine = { id: 'user-one', fullName: 'Radu Pop' };

let serial = 0;

function listed(overrides: Record<string, unknown> = {}) {
  serial += 1;
  return {
    ...summaryOf(importDetail()),
    id: `7a000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    createdBy: mine,
    expiresAt: null,
    people: null,
    uninvited: null,
    progress: null,
    ...overrides,
  };
}

const hotel = { id: clientId, legalName: 'Hotel Carpați Sinaia SRL' };

const readyEmployees = listed({
  kind: 'employees',
  status: 'ready',
  client: hotel,
  intoExistingClient: true,
  people: { total: 12, toCheck: 12, checked: 0, setAside: 0 },
});
const delta = { id: 'c2000000-0000-4000-8000-000000000002', legalName: 'Transport Delta Nord SRL' };
const readingEmployees = listed({
  kind: 'employees',
  status: 'reading',
  client: delta,
  intoExistingClient: true,
  progress: { files: 40, prepared: 40, scans: 40, scansRead: 23 },
});
const readyClient = listed({ status: 'ready', companyName: 'Clinica Dentară Zâmbet SRL' });
const failedClient = listed({
  status: 'failed',
  companyName: 'Ferma Valea Mureșului SRL',
  failureReason: 'Niciun document nu s-a putut citi.',
});

let items: Record<string, unknown>[] = [];
let me: Record<string, unknown> | undefined;

function mount() {
  mockApi((_init, url) => {
    if (url.pathname === '/imports') return Response.json({ items });
    if (url.pathname === '/me' && me) return Response.json(me);
    return undefined;
  });
  return mountApp(authFixture(makeSession()).client, '/profile');
}

function phoneWidth() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

const groupsIn = (list: HTMLElement) =>
  within(list)
    .getAllByTestId('imports-group')
    .map((group) => ({
      title: within(group).getByRole('heading').textContent,
      rows: within(group)
        .getAllByTestId('imports-row')
        .map((row) => row.textContent),
    }));

beforeEach(() => {
  items = [];
  me = undefined;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  toast.dismiss();
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the imports button in the header', () => {
  it('stays out of the header while the member has no open import', async () => {
    items = [
      listed({ status: 'confirmed' }),
      listed({ status: 'abandoned' }),
      listed({ status: 'ready', createdBy: { id: 'user-two', fullName: 'Ana Pop' } }),
    ];
    mount();
    await screen.findByTestId('app-logo');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/imports'))).toBe(true)
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('imports-button')).toBeNull();
  });

  it("lists the member's own open imports by what they wait for, and opens the review", async () => {
    items = [
      readingEmployees,
      readyEmployees,
      failedClient,
      readyClient,
      listed({ status: 'confirmed', companyName: 'Confirmat SRL' }),
      listed({ status: 'abandoned', companyName: 'Abandonat SRL' }),
      listed({
        status: 'ready',
        companyName: 'Altcineva SRL',
        createdBy: { id: 'user-two', fullName: 'Ana Pop' },
      }),
    ];
    const runtime = mount();
    const user = userEvent.setup();

    const button = await screen.findByRole('button', {
      name: 'Importuri: 2 de verificat, 1 se citește, 1 oprit',
    });
    expect(within(button).getByTestId('imports-button-chip').textContent).toBe('2 de verificat');
    await user.click(button);

    const list = await screen.findByTestId('imports-list');
    expect(groupsIn(list)).toEqual([
      {
        title: 'De verificat',
        rows: [
          'Hotel Carpați Sinaia SRL12 persoane de verificatVerifică persoanele',
          'Clinica Dentară Zâmbet SRLPropunerea e gata de verificatVerifică propunerea',
        ],
      },
      {
        title: 'Se citesc',
        rows: ['Transport Delta Nord SRLImport angajați: 23 din 40 de fotografii citite'],
      },
      {
        title: 'S-au oprit',
        rows: ['Ferma Valea Mureșului SRLNiciun document nu s-a putut citi.Vezi importul'],
      },
    ]);
    expect(within(list).queryByText('Altcineva SRL')).toBeNull();
    expect(
      within(list).getByRole('progressbar', {
        name: 'Import angajați: 23 din 40 de fotografii citite',
      })
    ).toBeTruthy();
    expect(within(list).getByRole('link', { name: 'Vezi importul' }).getAttribute('href')).toBe(
      `/clients/import/${failedClient.id}`
    );
    expect(
      within(list).getByRole('link', { name: 'Verifică propunerea' }).getAttribute('href')
    ).toBe(`/clients/import/${readyClient.id}`);

    await user.click(within(list).getByRole('link', { name: 'Verifică persoanele' }));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(
        `/clients/${clientId}/employees/import/${readyEmployees.id}`
      )
    );
    await waitFor(() => expect(screen.queryByTestId('imports-list')).toBeNull());
  });

  it('counts the reading imports when none waits for a check', async () => {
    items = [
      readingEmployees,
      listed({ status: 'preparing', progress: { files: 12, prepared: 3, scans: 0, scansRead: 0 } }),
    ];
    mount();
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: 'Importuri: 2 se citesc' });
    expect(within(button).getByTestId('imports-button-chip').textContent).toBe('2 se citesc');
    await user.click(button);
    const list = await screen.findByTestId('imports-list');
    expect(within(list).getByText('Import client: 3 din 12 fișiere pregătite')).toBeTruthy();
    expect(
      within(list)
        .getByRole('link', { name: /Transport Delta Nord SRL/ })
        .getAttribute('href')
    ).toBe(`/clients/${delta.id}/employees/import/${readingEmployees.id}`);
  });

  it('opens the list from the bottom on a phone, and closes it', async () => {
    phoneWidth();
    items = [readyEmployees, readingEmployees];
    mount();
    const user = userEvent.setup();

    const button = await screen.findByRole('button', {
      name: 'Importuri: 1 de verificat, 1 se citește',
    });
    expect(within(button).getByTestId('imports-button-dot').textContent).toBe('1');
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Importuri' });
    expect(within(sheet).getByRole('link', { name: 'Verifică persoanele' })).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importuri' })).toBeNull());
  });
});

describe('the plan badge on a phone', () => {
  it('leaves the header for an Abonament row in the menu, above the account', async () => {
    phoneWidth();
    me = meFor({
      subscription: {
        plan: 'profesional',
        planChosen: false,
        status: 'trialing',
        trialEndsAt: inDays(14),
        accessUntil: inDays(14),
        access: 'full',
        deletesAt: null,
      },
    });
    mount();
    const user = userEvent.setup();
    await screen.findByTestId('app-logo');
    await user.click(screen.getByTestId('sidebar-toggle'));

    const menu = await screen.findByRole('dialog');
    const row = within(menu).getByTestId('nav-subscription');
    expect(row.textContent).toBe('AbonamentProbă · 14 zile');
    expect(row.getAttribute('href')).toBe('/organization/subscription');
    const footer = Array.from(
      row.closest('[data-sidebar="footer"]')!.querySelectorAll('[data-sidebar="menu-button"]'),
      (item) => item.getAttribute('data-testid')
    );
    expect(footer.slice(-2)).toEqual(['nav-subscription', 'account-menu']);
    expect(screen.queryByTestId('subscription-badge')).toBeNull();
  });

  it('stays in the header on a computer, with no Abonament row', async () => {
    me = meFor({
      subscription: {
        plan: 'start',
        planChosen: true,
        status: 'active',
        trialEndsAt: null,
        accessUntil: null,
        access: 'full',
        deletesAt: null,
      },
    });
    mount();
    expect((await screen.findByTestId('subscription-badge')).textContent).toBe('Start');
    expect(screen.queryByTestId('nav-subscription')).toBeNull();
  });
});
