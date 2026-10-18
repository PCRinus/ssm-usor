import type { TrainingDomain } from '@ssm-usor/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-context';
import type { AuthStore } from '@/features/auth/auth-store';
import { currentWayBack } from '@/features/missing-data/way-back';
import { createQueryClient } from '@/lib/query-client';
import type { RouterContext } from '@/routes/__root';
import { makeSession } from '@/test/auth-fixture';

import { TrainingSheetReadiness } from './training-sheet-readiness';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const employeePath = `/clients/${clientId}/employees/${employeeId}`;

type Readiness = { ready: boolean; missing: string[]; stored?: boolean; sequences?: number[] };
const ready: Readiness = { ready: true, missing: [] };

const sheetStatus = (readiness: Readiness) => ({ stored: false, sequences: [], ...readiness });

const fetchMock = vi.fn<typeof fetch>();

function mockApi({ ssm = ready, psi = ready }: { ssm?: Readiness; psi?: Readiness } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === `${employeePath}/training-sheets`)
      return Response.json({ ssm: sheetStatus(ssm), psi: sheetStatus(psi) });
    throw new Error(`Unexpected request: ${url}`);
  });
}

const snapshot = { status: 'ready', session: makeSession() };
const auth = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
} as unknown as AuthStore;

function mount(...domains: TrainingDomain[]) {
  const queryClient = createQueryClient();
  const context = {
    auth: {} as RouterContext['auth'],
    queryClient,
    apiRequest: { baseUrl: 'http://localhost:8787', getAccessToken: () => 'token' },
  } satisfies RouterContext;
  const root = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: '/clients/$clientId/employees/$employeeId/training',
    component: () =>
      domains.map((domain) => (
        <TrainingSheetReadiness
          key={domain}
          clientId={clientId}
          employeeId={employeeId}
          domain={domain}
        />
      )),
  });
  const edit = createRoute({
    getParentRoute: () => root,
    path: '/clients/$clientId/employees/$employeeId/edit',
    component: () => <h1>Modifică angajatul</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([tab, edit]),
    context,
    history: createMemoryHistory({ initialEntries: [`${employeePath}/training`] }),
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>
  );
  return router;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TrainingSheetReadiness', () => {
  it('counts what the sheet lacks and lists it in a dialog, each row to its field on the edit form', async () => {
    mockApi({ ssm: { ready: false, missing: ['employee.commute_route', 'employee.workplace'] } });
    mount('ssm');
    const notice = await screen.findByTestId('training-sheet-ssm-missing');
    expect(notice.textContent).toContain('Fișa SSM nu se poate întocmi încă: 2 date de completat.');

    await userEvent.click(within(notice).getByRole('button', { name: 'Vezi ce lipsește' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ce lipsește pentru fișa SSM' });
    expect(within(dialog).getByRole('heading', { name: 'Datele angajatului' })).toBeTruthy();
    const rows = within(dialog).getAllByTestId('training-sheet-missing-row');
    expect(rows.map((row) => [row.textContent, row.getAttribute('href')])).toEqual([
      [
        'Traseul de deplasareDrumul angajatului între domiciliu și locul de muncă, cerut de fișa SSM.',
        `${employeePath}/edit?focus=commute-route`,
      ],
      [
        'Punctul de lucruClientul are mai multe puncte de lucru active; alege-l pe cel al angajatului.',
        `${employeePath}/edit?focus=workplace`,
      ],
    ]);
  });

  it('starts the way back to the tab when a row is followed, and closes the dialog', async () => {
    mockApi({ psi: { ready: false, missing: ['employee.workplace'] } });
    const router = mount('psi');
    const notice = await screen.findByTestId('training-sheet-psi-missing');
    expect(notice.textContent).toContain('Fișa PSI nu se poate întocmi încă: 1 dată de completat.');

    await userEvent.click(within(notice).getByRole('button', { name: 'Vezi ce lipsește' }));
    await userEvent.click(await screen.findByTestId('training-sheet-missing-row'));

    await screen.findByRole('heading', { name: 'Modifică angajatul' });
    expect(router.state.location.pathname).toBe(`${employeePath}/edit`);
    expect(router.state.location.search).toEqual({ focus: 'workplace' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentWayBack('user-one')).toMatchObject({
      clientId,
      to: 'training-sheet',
      employeeId,
      domain: 'psi',
    });
  });

  it('shows nothing while the sheet can be drawn up', async () => {
    mockApi({ psi: { ready: false, missing: ['employee.workplace'] } });
    mount('ssm', 'psi');
    await screen.findByTestId('training-sheet-psi-missing');
    expect(screen.queryByTestId('training-sheet-ssm-missing')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('says so when the readiness cannot be read', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'not_found', message: 'x' }, { status: 404 })
    );
    mount('ssm');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nu am putut verifica dacă fișa se poate întocmi. Reîncarcă pagina.'
    );
  });
});
