import type { TrainingDomain } from '@ssm-usor/contracts';
import { Toaster } from '@ssm-usor/ui/components/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/lib/query-client';
import type { RouterContext } from '@/routes/__root';

import { TrainingSheetDownload } from './training-sheet-download';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const employeePath = `/clients/${clientId}/employees/${employeeId}`;

type Readiness = { ready: boolean; missing: string[] };
const ready: Readiness = { ready: true, missing: [] };

const fetchMock = vi.fn<typeof fetch>();
const saved: { name: string; href: string }[] = [];

function mockApi({
  ssm = ready,
  psi = ready,
  sheet = () =>
    new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="Fisa-SSM-Popescu-Ion.pdf"; filename*=UTF-8\'\'Fisa-SSM-Popescu-Ion.pdf',
      },
    }),
}: { ssm?: Readiness; psi?: Readiness; sheet?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === `${employeePath}/training-sheets`) return Response.json({ ssm, psi });
    if (url.pathname === `${employeePath}/training-sheet`) return sheet();
    throw new Error(`Unexpected request: ${url}`);
  });
}

function mount(domain: TrainingDomain) {
  const queryClient = createQueryClient();
  const context = {
    auth: {} as RouterContext['auth'],
    queryClient,
    apiRequest: { baseUrl: 'http://localhost:8787', getAccessToken: () => 'token' },
  } satisfies RouterContext;
  const root = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> });
  const employee = createRoute({
    getParentRoute: () => root,
    path: '/clients/$clientId/employees/$employeeId',
    component: () => (
      <TrainingSheetDownload clientId={clientId} employeeId={employeeId} domain={domain} />
    ),
  });
  const edit = createRoute({
    getParentRoute: () => root,
    path: '/clients/$clientId/employees/$employeeId/edit',
    component: () => <h1>Modifică angajatul</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([employee, edit]),
    context,
    history: createMemoryHistory({ initialEntries: [employeePath] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  saved.length = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:sheet', revokeObjectURL: () => {} })
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved.push({ name: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TrainingSheetDownload', () => {
  it('downloads the PDF of a sheet that can be drawn up, under the name the API gives it', async () => {
    mockApi();
    mount('ssm');
    const button = await screen.findByRole('button', { name: 'Descarcă fișa SSM' });
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    await userEvent.click(button);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe('Fisa-SSM-Popescu-Ion.pdf');
    const sheetCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith('/training-sheet'))!;
    expect(sheetCall.searchParams.get('domain')).toBe('ssm');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is disabled while data is missing, and says what to fill in with a link to the form', async () => {
    mockApi({ psi: { ready: false, missing: ['employee.workplace'] } });
    mount('psi');
    expect(
      await screen.findByText('Fișa nu se poate întocmi până nu completezi: punctul de lucru.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descarcă fișa PSI' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('link', { name: 'Completează datele' }).getAttribute('href')).toBe(
      `${employeePath}/edit`
    );
  });

  it('lists every missing piece of the occupational safety sheet', async () => {
    mockApi({ ssm: { ready: false, missing: ['employee.commute_route', 'employee.workplace'] } });
    mount('ssm');
    expect(
      await screen.findByText(
        'Fișa nu se poate întocmi până nu completezi: traseul de deplasare, punctul de lucru.'
      )
    ).toBeTruthy();
  });

  it('says so in a toast when no converter is available', async () => {
    mockApi({
      sheet: () =>
        Response.json(
          { error: 'service_unavailable', message: 'x', reason: 'pdf_unavailable' },
          { status: 503 }
        ),
    });
    mount('ssm');
    const button = await screen.findByRole('button', { name: 'Descarcă fișa SSM' });
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    await userEvent.click(button);

    expect(
      await screen.findByText(
        'Convertorul PDF nu este disponibil. Încearcă din nou peste câteva minute.'
      )
    ).toBeTruthy();
    expect(saved).toHaveLength(0);
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
  });
});
