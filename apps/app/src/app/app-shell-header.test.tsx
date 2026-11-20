import { toast } from '@ssm-usor/ui/lib/toast';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClosedImportListResponse } from '@/api/generated/api';
import { fetchMock, installFetchMock, mockApi } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { inDays, meFor } from '@/test/billing-fixture';
import { clientId, importDetail, summaryOf } from '@/test/import-fixture';
import { mountApp } from '@/test/mount';

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
let behind = { occupational_safety: 0, fire_safety: 0 };

function mount() {
  mockApi((_init, url) => {
    if (url.pathname === '/imports') return Response.json({ items });
    if (url.pathname === '/documents/behind/summary') {
      return Response.json({ counts: behind, running: [] });
    }
    if (url.pathname === '/imports/closed') {
      const pageSize = Number(url.searchParams.get('pageSize'));
      return Response.json({
        items: [],
        page: 1,
        pageSize,
        total: 0,
      } satisfies ClosedImportListResponse);
    }
    if (url.pathname === '/me' && me) return Response.json(me);
    return undefined;
  });
  return mountApp(authFixture(makeSession()).client, '/profil');
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

beforeEach(() => {
  items = [];
  me = undefined;
  behind = { occupational_safety: 0, fire_safety: 0 };
  localStorage.clear();
});

afterEach(() => {
  toast.dismiss();
});

installFetchMock();

describe('the count on the menu button', () => {
  it('stays off while nothing in the menu waits', async () => {
    phoneWidth();
    items = [
      readingEmployees,
      failedClient,
      listed({ status: 'confirmed', libraryParts: [] }),
      listed({ status: 'abandoned' }),
    ];
    mount();
    await screen.findByTestId('app-logo');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/imports'))).toBe(true)
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('sidebar-toggle-count')).toBeNull();
    expect(screen.getByTestId('sidebar-toggle').getAttribute('aria-label')).toBe(
      'Comută meniul lateral'
    );
  });

  it("adds up on a phone the team's imports waiting for a check and the documents to update", async () => {
    phoneWidth();
    items = [
      readyEmployees,
      readyClient,
      readingEmployees,
      listed({
        status: 'ready',
        companyName: 'Altcineva SRL',
        createdBy: { id: 'user-two', fullName: 'Ana Pop' },
      }),
    ];
    behind = { occupational_safety: 2, fire_safety: 1 };
    mount();
    const user = userEvent.setup();

    const toggle = await screen.findByRole('button', {
      name: 'Comută meniul lateral: 6 elemente de văzut',
    });
    expect(screen.getByTestId('sidebar-toggle-count').textContent).toBe('6');
    expect(screen.queryByRole('link', { name: /Importuri AI: / })).toBeNull();
    const asked = new URL(
      String(fetchMock.mock.calls.find(([input]) => String(input).includes('/imports'))![0])
    );
    expect(Object.fromEntries(asked.searchParams)).toEqual({ kind: 'all', withOpenParts: 'true' });

    await user.click(toggle);
    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByTestId('nav-imports-count').textContent).toBe('3 de verificat');
  });

  it('stays off on a computer while the menu shows its counts, and comes on in the icon rail', async () => {
    items = [readyEmployees];
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('nav-imports-count')).textContent).toBe('1 de verificat');
    expect(screen.queryByTestId('sidebar-toggle-count')).toBeNull();

    await user.click(screen.getByTestId('sidebar-toggle'));
    expect((await screen.findByTestId('sidebar-toggle-count')).textContent).toBe('1');
  });
});

describe('the plan badge on a phone', () => {
  it('leaves the header for an Abonament row in the menu, above the account', async () => {
    phoneWidth();
    me = meFor({
      subscription: {
        plan: 'profesional',
        planChosen: false,
        step: null,
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
    expect(row.getAttribute('href')).toBe('/organizatie/abonament');
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
        step: 1500,
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
