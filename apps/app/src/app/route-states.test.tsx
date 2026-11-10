import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@/api/http';
import {
  resetReloadDialog,
  useReloadDialogState,
} from '@/features/reload-prompts/reload-dialog-store';

import { appVersion } from './build-version';
import { ReportProblemContext } from './report-problem-context';
import { NotFound, RouteError } from './route-states';

const reload = vi.fn<() => void>();
beforeEach(() => {
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, reload });
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 10, 14, 32) });
});
afterEach(() => {
  resetReloadDialog();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderAt(path: string, element: () => ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: element }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

describe('route error', () => {
  it('reloads the page and reports the page, version and time through the shell', async () => {
    const report = vi.fn<(note?: string) => Promise<void>>().mockResolvedValue();
    renderAt('/clienti/abc', () => (
      <ReportProblemContext value={report}>
        <RouteError error={new Error('boom')} />
      </ReportProblemContext>
    ));
    const card = await screen.findByTestId('route-error-page');
    expect(card.getAttribute('role')).toBe('alert');
    expect(within(card).getByRole('heading', { level: 1 }).textContent).toBe(
      'Pagina nu a putut fi încărcată'
    );
    expect(card.textContent).toContain('Verifică internetul și reîncarcă pagina.');
    expect(screen.getByTestId('route-error-details').textContent).toBe(
      `Versiune ${appVersion()}, 10 noiembrie 2026 la 14:32`
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reîncarcă' }));
    expect(reload).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Raportează problema' }));
    expect(report).toHaveBeenCalledWith(
      `Menționează în mesaj pagina /clienti/abc, versiunea ${appVersion()} și ora 10 noiembrie 2026 la 14:32.`
    );
    expect(screen.queryByTestId('report-problem-dialog')).toBeNull();
  });

  it('asks for a reload when a code file of the build is gone', async () => {
    let cause: string | undefined;
    function DialogCause() {
      cause = useReloadDialogState()?.cause;
      return null;
    }
    renderAt('/clienti/abc', () => (
      <>
        <RouteError
          error={new TypeError('Failed to fetch dynamically imported module: /assets/x.js')}
        />
        <DialogCause />
      </>
    ));
    await screen.findByTestId('route-error-page');
    expect(cause).toBe('code_file');
  });

  it('has a page of its own and reports by email outside the shell', async () => {
    renderAt('/dashboard', () => <RouteError error={new Error('boom')} />);
    await screen.findByTestId('route-error-page');
    expect(screen.getByRole('img', { name: 'SSM Ușor' })).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Raportează problema' }));
    const dialog = await screen.findByTestId('report-problem-dialog');
    expect(dialog.textContent).toContain('pagina /dashboard');
    expect(dialog.textContent).not.toContain('Chatul de suport');
  });

  it('keeps the page wording and explains an expired session', async () => {
    renderAt('/clienti/abc', () => (
      <ReportProblemContext value={vi.fn<(note?: string) => Promise<void>>()}>
        <RouteError
          error={new ApiHttpError(401, { error: 'unauthorized' })}
          title="Clientul nu a putut fi încărcat"
          testId="client-error"
        />
      </ReportProblemContext>
    ));
    const card = await screen.findByTestId('client-error');
    expect(within(card).getByRole('heading').textContent).toBe('Clientul nu a putut fi încărcat');
    expect(card.textContent).toContain('Sesiunea nu mai este validă.');
  });
});

describe('not found', () => {
  it('leads to the dashboard inside the shell', async () => {
    renderAt('/inexistent', () => (
      <ReportProblemContext value={vi.fn<(note?: string) => Promise<void>>()}>
        <NotFound />
      </ReportProblemContext>
    ));
    const card = await screen.findByTestId('not-found-page');
    expect(within(card).getByRole('link', { name: 'Mergi la Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'SSM Ușor' })).toBeNull();
  });
});
