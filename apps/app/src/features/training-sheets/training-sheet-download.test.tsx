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

type Readiness = { ready: boolean; missing: string[]; stored?: boolean; sequences?: number[] };
const ready: Readiness = { ready: true, missing: [] };

const sheetStatus = (readiness: Readiness) => ({ stored: false, sequences: [], ...readiness });

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
}: { ssm?: Readiness; psi?: Readiness; sheet?: () => Response | Promise<Response> } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === `${employeePath}/training-sheets`)
      return Response.json({ ssm: sheetStatus(ssm), psi: sheetStatus(psi) });
    if (url.pathname === `${employeePath}/training-sheet`) return sheet();
    if (url.pathname === `${employeePath}/training-sheet/link`) {
      const sequence = url.searchParams.get('sequence');
      return Response.json({
        url: `https://files.example.test/signed/${url.searchParams.get('domain')}-${sequence}`,
        fileName: `Fisa-SSM-Popescu-Ion${sequence === '1' ? '' : `-${sequence}`}.pdf`,
        expiresInSeconds: 600,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function mount(...domains: TrainingDomain[]) {
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
    component: () =>
      domains.map((domain) => (
        <TrainingSheetDownload
          key={domain}
          clientId={clientId}
          employeeId={employeeId}
          domain={domain}
        />
      )),
  });
  const router = createRouter({
    routeTree: root.addChildren([employee]),
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

  it('calls a merged sheet a reading copy and offers each original as a real link, by its sequence', async () => {
    mockApi({ ssm: { ready: true, missing: [], stored: true, sequences: [1, 2] } });
    mount('ssm');
    await screen.findByRole('button', { name: 'Descarcă fișa SSM (copie de citire)' });
    const originals = screen.getByTestId('training-sheet-ssm-originals');
    await waitFor(() => expect(originals).toHaveProperty('disabled', false));
    await userEvent.click(originals);
    const items = await screen.findAllByTestId('training-sheet-ssm-original');
    expect(items.map((item) => item.textContent)).toEqual(['Fișa 1', 'Fișa 2 (continuare)']);
    await waitFor(() => expect(items[1]!.getAttribute('href')).toContain('/files/download?'));
    const second = new URL(items[1]!.getAttribute('href')!);
    expect(second.searchParams.get('source')).toBe('https://files.example.test/signed/ssm-2');
    expect(second.searchParams.get('name')).toBe('Fisa-SSM-Popescu-Ion-2.pdf');
    expect(second.searchParams.get('disposition')).toBe('attachment');
    expect(saved).toHaveLength(0);
  });

  it('is a pair of real links for a single stored sheet: a download and a preview in a tab', async () => {
    mockApi({ ssm: { ready: true, missing: [], stored: true, sequences: [1] } });
    mount('ssm');
    await waitFor(() =>
      expect(screen.getByTestId('training-sheet-ssm').getAttribute('href')).toContain(
        '/files/download?'
      )
    );
    const download = screen.getByTestId('training-sheet-ssm');
    expect(download.textContent).toBe('Descarcă fișa SSM');
    const saved = new URL(download.getAttribute('href')!);
    expect(saved.searchParams.get('source')).toBe('https://files.example.test/signed/ssm-1');
    expect(saved.searchParams.get('name')).toBe('Fisa-SSM-Popescu-Ion.pdf');
    expect(saved.searchParams.get('disposition')).toBe('attachment');
    expect(download.getAttribute('target')).toBeNull();
    const preview = screen.getByTestId('training-sheet-ssm-preview');
    expect(new URL(preview.getAttribute('href')!).searchParams.get('disposition')).toBe('inline');
    expect(preview.getAttribute('target')).toBe('_blank');
    expect(screen.queryByTestId('training-sheet-ssm-originals')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/training-sheet/link'))
    ).toHaveLength(1);
  });

  it('is disabled while data is missing', async () => {
    mockApi({ psi: { ready: false, missing: ['employee.workplace'] } });
    mount('ssm', 'psi');
    const ready = await screen.findByRole('button', { name: 'Descarcă fișa SSM' });
    await waitFor(() => expect(ready).toHaveProperty('disabled', false));
    expect(screen.getByRole('button', { name: 'Descarcă fișa PSI' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/training-sheets'))
    ).toHaveLength(1);
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

describe('TrainingSheetDownload preview', () => {
  function fakeTab() {
    return {
      document: { write: vi.fn(), close: vi.fn(), title: '' },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
  }

  async function readyPreviewButton() {
    const button = await screen.findByTestId('training-sheet-ssm-preview');
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    return button;
  }

  it('opens a tab before the PDF arrives, then points it at the PDF without saving it', async () => {
    let answer!: (response: Response) => void;
    mockApi({
      sheet: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    mount('ssm');
    await userEvent.click(await readyPreviewButton());

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.document.write).toHaveBeenCalledWith(expect.stringContaining('Se pregătește fișa…'));
    expect(tab.document.title).toBe('Fișa SSM');
    await waitFor(() => expect(answer).toBeDefined());
    expect(tab.location.replace).not.toHaveBeenCalled();

    answer(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      })
    );
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith('blob:sheet'));
    expect(tab.close).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('keeps the download saving the file beside the preview', async () => {
    mockApi();
    const open = vi.spyOn(window, 'open');
    mount('ssm');
    await readyPreviewButton();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă fișa SSM' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(open).not.toHaveBeenCalled();
  });

  it('asks for new windows to be allowed when the browser blocks the tab', async () => {
    mockApi();
    vi.spyOn(window, 'open').mockReturnValue(null);
    mount('ssm');
    const button = await readyPreviewButton();
    await userEvent.click(button);

    expect(
      await screen.findByText(
        'Browserul a blocat fereastra nouă. Permite ferestrele noi pentru această pagină.'
      )
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/training-sheet?'))
    ).toHaveLength(0);
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
  });

  it('closes the tab and says why when the PDF cannot be made', async () => {
    mockApi({
      sheet: () =>
        Response.json(
          { error: 'service_unavailable', message: 'x', reason: 'pdf_unavailable' },
          { status: 503 }
        ),
    });
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    mount('ssm');
    await userEvent.click(await readyPreviewButton());

    expect(
      await screen.findByText(
        'Convertorul PDF nu este disponibil. Încearcă din nou peste câteva minute.'
      )
    ).toBeTruthy();
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('reloads the readiness when the sheet turns out not to be ready', async () => {
    mockApi({
      sheet: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'missing_sheet_data' },
          { status: 409 }
        ),
    });
    vi.spyOn(window, 'open').mockReturnValue(fakeTab() as unknown as Window);
    mount('ssm');
    await userEvent.click(await readyPreviewButton());

    expect(
      await screen.findByText('Fișa nu se poate întocmi încă: lipsesc date ale angajatului.')
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/training-sheets'))
      ).toHaveLength(2)
    );
  });
});
