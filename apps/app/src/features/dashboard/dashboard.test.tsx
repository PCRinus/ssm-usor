import type { DashboardSummary } from '@ssm-usor/contracts';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { busySummary, quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { greetingAt, waitingSince } from './dashboard-format';

const fetchMock = vi.fn<typeof fetch>();

const me = (role: 'owner' | 'specialist', fullName: string | null = 'Mircea Casapu') => ({
  user: { id: 'user-one', email: 'review@example.test' },
  profile: fullName ? { fullName, professionalTitle: null } : null,
  membership: { organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'S' }, role },
});

function mockApi(
  summary: DashboardSummary | (() => Response),
  role: 'owner' | 'specialist' = 'owner',
  fullName?: string | null
) {
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me') return Response.json(me(role, fullName));
    if (pathname === '/dashboard/summary') {
      return typeof summary === 'function' ? summary() : Response.json(summary);
    }
    if (pathname === '/releases') return Response.json({ items: [] });
    throw new Error(`Unexpected request: ${pathname}`);
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, '/dashboard');

const hrefOf = (testId: string) => screen.getByTestId(testId).getAttribute('href');

const memberSummary: DashboardSummary = { ...busySummary, contracts: null };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  // 14:00 in Bucharest.
  vi.setSystemTime(new Date('2026-10-24T11:00:00.000Z'));
});

afterEach(() => {
  disposeRuntimes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the dashboard', () => {
  it("shows an owner everything to do, the clients' trainings, the portfolio and the contracts", async () => {
    mockApi(busySummary);
    mount();
    expect(await screen.findByTestId('dashboard-todo')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByTestId('dashboard-greeting').textContent).toBe(
      'Bună ziua, Mircea. Ai 18 lucruri de făcut, iar la clienți sunt 51 de instruiri depășite.'
    );
    expect(screen.getByTestId('dashboard-today').textContent).toBe('Sâmbătă, 24 octombrie 2026');

    const todo = screen.getByTestId('dashboard-todo');
    expect(within(todo).getByTestId('dashboard-todo-total').textContent).toBe('18 în total');
    expect(screen.getByTestId('dashboard-todo-signatures').textContent).toContain(
      '9 semnături de dat'
    );
    expect(hrefOf('dashboard-todo-signatures')).toBe('/signatures');
    expect(screen.getByTestId('dashboard-todo-drafts').textContent).toContain(
      '6 documente de emis'
    );
    expect(hrefOf('dashboard-todo-drafts')).toBe('/clients?sort=documentation&order=asc');
    expect(screen.getByTestId('dashboard-todo-missing-data').textContent).toContain(
      '3 clienți cu date lipsă'
    );
    expect(screen.getByTestId('dashboard-todo-missing-data-count').className).toContain(
      'text-destructive'
    );
    expect(hrefOf('dashboard-todo-missing-data')).toBe('/clients');

    const ssm = screen.getByTestId('dashboard-trainings-ssm');
    expect(screen.getByTestId('dashboard-trainings-ssm-overdue').textContent).toBe(
      '22 de instruiri SSM depășite'
    );
    expect(screen.getByTestId('dashboard-trainings-ssm-overdue-count').className).toContain(
      'text-destructive'
    );
    expect(hrefOf('dashboard-trainings-ssm-overdue')).toBe(
      '/employees?trainingState=overdue&domain=ssm'
    );
    expect(within(ssm).getByRole('img').getAttribute('aria-label')).toBe(
      'Instruiri SSM, 412 angajați: 22 depășite, 41 scadente, 31 neinstruiți, 318 la zi'
    );
    expect(
      within(ssm)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['22 depășite', '41 scadente', '31 neinstruiți', '318 la zi']);
    expect(hrefOf('dashboard-trainings-psi-chip-due')).toBe(
      '/employees?trainingState=due&domain=psi'
    );
    expect(screen.getByTestId('dashboard-trainings-psi-chip-due').getAttribute('title')).toBe(
      'scadente în 30 de zile: 36'
    );
    expect(screen.getByTestId('dashboard-trainings-psi-chip-untrained').getAttribute('title')).toBe(
      'fără instruire la angajare: 46'
    );
    expect(screen.getByTestId('dashboard-documents-behind').textContent).toContain(
      '11 documente de actualizat'
    );
    expect(hrefOf('dashboard-documents-behind')).toBe('/legislatie/documente');

    const waiting = screen.getByTestId('dashboard-waiting');
    expect(within(waiting).getByTestId('dashboard-waiting-signatures').textContent).toBe(
      '27 de semnături Cea mai veche așteaptă de 12 zile'
    );
    expect(hrefOf('dashboard-waiting-tests')).toBe('/employees?testState=pending');

    const portfolio = screen.getByTestId('dashboard-portfolio');
    expect(screen.getByTestId('dashboard-portfolio-clients').textContent).toBe('18 clienți activi');
    expect(screen.getByTestId('dashboard-portfolio-employees').textContent).toBe(
      '412 angajați, +41 față de septembrie'
    );
    expect(within(portfolio).getAllByTestId('dashboard-portfolio-bar')).toHaveLength(12);
    expect(within(portfolio).getByRole('img').getAttribute('aria-label')).toBe(
      'Angajați în ultimele 12 luni, de la 23 în noiembrie 2025 la 412 în octombrie 2026'
    );
    expect(portfolio.className).not.toContain('max-w-[560px]');

    const contracts = screen.getByTestId('dashboard-contracts');
    expect(within(contracts).getByTestId('dashboard-contracts-received').textContent).toContain(
      '2 exemplare semnate de confirmat'
    );
    expect(within(contracts).getByTestId('dashboard-contracts-ending').textContent).toContain(
      '2 contracte expiră'
    );
  });

  it('shows a member the same page without the contracts card', async () => {
    mockApi(memberSummary, 'specialist');
    mount();
    await screen.findByTestId('dashboard-todo');
    expect(screen.queryByTestId('dashboard-contracts')).toBeNull();
    expect(screen.getByTestId('dashboard-waiting')).toBeTruthy();
    expect(screen.getByTestId('dashboard-portfolio').className).not.toContain('max-w-[560px]');
  });

  it('drops a tile, a row or a card at zero and keeps what remains together', async () => {
    mockApi({
      ...busySummary,
      todo: {
        ...busySummary.todo,
        clientsMissingData: 0,
        documentsBehind: 0,
        testsPending: 0,
      },
      trainings: { ...busySummary.trainings, psi: { ...busySummary.trainings.psi, overdue: 0 } },
      contracts: { receivedToConfirm: 2, endingWithin60Days: 0 },
    });
    mount();
    await screen.findByTestId('dashboard-todo');
    expect(screen.getByTestId('dashboard-greeting').textContent).toBe(
      'Bună ziua, Mircea. Ai 15 lucruri de făcut, iar la clienți sunt 22 de instruiri depășite.'
    );
    expect(screen.getByTestId('dashboard-todo-total').textContent).toBe('15 în total');
    expect(screen.getByTestId('dashboard-todo-signatures')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-todo-missing-data')).toBeNull();
    expect(screen.queryByTestId('dashboard-documents-behind')).toBeNull();
    expect(screen.getByTestId('dashboard-trainings-psi-overdue-count').className).not.toContain(
      'text-destructive'
    );
    expect(screen.getByTestId('dashboard-waiting-signatures')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-waiting-tests')).toBeNull();
    expect(screen.getByTestId('dashboard-contracts-received')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-contracts-ending')).toBeNull();
  });

  it('caps the portfolio when a member has nothing waiting on employees', async () => {
    const months = busySummary.portfolio.employeesAtMonthEnds.map((month, index) =>
      index === 11 ? { ...month, employees: 368 } : month
    );
    mockApi(
      {
        ...memberSummary,
        todo: {
          ...busySummary.todo,
          employeeSignatures: { pending: 0, oldestIssuedAt: null },
          testsPending: 0,
        },
        portfolio: { ...busySummary.portfolio, employees: 368, employeesAtMonthEnds: months },
      },
      'specialist'
    );
    mount();
    await screen.findByTestId('dashboard-todo');
    expect(screen.queryByTestId('dashboard-waiting')).toBeNull();
    expect(screen.queryByTestId('dashboard-contracts')).toBeNull();
    expect(screen.getByTestId('dashboard-portfolio').className).toContain('max-w-[560px]');
    expect(screen.getByTestId('dashboard-portfolio-employees').textContent).toBe(
      '368 de angajați, −3 față de septembrie'
    );
  });

  it('says everything is up to date when there is nothing to do', async () => {
    mockApi(quietSummary);
    mount();
    expect((await screen.findByTestId('dashboard-todo-done')).textContent).toBe(
      'Totul e la zi Următoarea instruire scadentă: luni, 2 noiembrie, pentru 4 angajați'
    );
    expect(screen.getByTestId('dashboard-greeting').textContent).toBe(
      'Bună ziua, Mircea. Nu ai nimic de făcut, iar la clienți nu e nicio instruire depășită.'
    );
    expect(screen.queryByTestId('dashboard-todo-total')).toBeNull();
    expect(screen.queryByTestId('dashboard-todo-signatures')).toBeNull();
    expect(screen.getByTestId('dashboard-trainings-ssm')).toBeTruthy();
    expect(screen.getByTestId('dashboard-trainings-psi')).toBeTruthy();
    expect(screen.getByTestId('dashboard-trainings-ssm-overdue-count').textContent).toBe('0');
    expect(screen.queryByTestId('dashboard-documents-behind')).toBeNull();
    expect(screen.queryByTestId('dashboard-waiting')).toBeNull();
    expect(screen.queryByTestId('dashboard-contracts')).toBeNull();
    expect(screen.getByTestId('dashboard-portfolio').className).toContain('max-w-[560px]');
  });

  it('leaves out the next due training when none is due', async () => {
    mockApi({ ...quietSummary, nextDue: null }, 'owner', null);
    mount();
    expect((await screen.findByTestId('dashboard-todo-done')).textContent).toBe('Totul e la zi');
    expect(screen.getByTestId('dashboard-greeting').textContent).toMatch(/^Bună ziua\. Nu ai/);
  });

  it('greets by the hour in Bucharest', async () => {
    vi.setSystemTime(new Date('2026-10-24T05:30:00.000Z'));
    mockApi(busySummary);
    mount();
    expect((await screen.findByTestId('dashboard-greeting')).textContent).toMatch(
      /^Bună dimineața, Mircea\./
    );
    cleanup();
    disposeRuntimes();

    vi.setSystemTime(new Date('2026-10-24T15:00:00.000Z'));
    mount();
    expect((await screen.findByTestId('dashboard-greeting')).textContent).toMatch(
      /^Bună seara, Mircea\./
    );
  });

  it('turns the greeting at noon and at six in the evening, Bucharest time', () => {
    expect(greetingAt(new Date('2026-10-24T08:59:00.000Z'))).toBe('Bună dimineața');
    expect(greetingAt(new Date('2026-10-24T09:00:00.000Z'))).toBe('Bună ziua');
    expect(greetingAt(new Date('2026-10-24T14:59:00.000Z'))).toBe('Bună ziua');
    expect(greetingAt(new Date('2026-10-24T15:00:00.000Z'))).toBe('Bună seara');
    expect(greetingAt(new Date('2026-12-24T10:59:00.000Z'))).toBe('Bună ziua');
    expect(greetingAt(new Date('2026-12-24T22:30:00.000Z'))).toBe('Bună dimineața');
  });

  it('counts the waiting days by the calendar in Bucharest', () => {
    const now = new Date('2026-10-24T11:00:00.000Z');
    expect(waitingSince('2026-10-24T06:00:00.000Z', now)).toBe('Cea mai veche așteaptă de azi');
    expect(waitingSince('2026-10-23T21:30:00.000Z', now)).toBe('Cea mai veche așteaptă de azi');
    expect(waitingSince('2026-10-23T20:30:00.000Z', now)).toBe('Cea mai veche așteaptă de o zi');
    expect(waitingSince('2026-09-24T08:00:00.000Z', now)).toBe(
      'Cea mai veche așteaptă de 30 de zile'
    );
  });

  it('shows a skeleton while loading and offers a retry when the numbers fail', async () => {
    let fail = true;
    mockApi(() =>
      fail
        ? Response.json({ error: 'internal', message: 'Boom' }, { status: 500 })
        : Response.json(busySummary)
    );
    mount();
    expect(await screen.findByTestId('dashboard-loading')).toBeTruthy();
    const error = await screen.findByTestId('dashboard-error', undefined, { timeout: 8000 });
    fail = false;
    await userEvent.setup().click(within(error).getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('dashboard-todo')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-error')).toBeNull();
  });
});
