import { Toaster } from '@ssm-usor/ui/components/sonner';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type HistoryState,
  Outlet,
  type ParsedLocation,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { keepOpener, openedHere } from '@/app/opener';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthStore } from '@/features/auth/auth-store';
import { makeSession } from '@/test/auth-fixture';

import { useSavedToast } from './saved-toast';
import { currentWayBack, endWayBack, useStartWayBack } from './way-back';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const documentsPage = `/clienti/${clientId}/documente-ssm`;

const snapshot = { status: 'ready', session: makeSession() };
const auth = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
} as unknown as AuthStore;

type OpenState = (current: ParsedLocation['state']) => HistoryState;

// The routes here are not the app's, which the router's types are registered for.
function renderTrip(opening: OpenState, returning = false) {
  const root = createRootRoute({ component: Outlet });
  const documents = createRoute({
    getParentRoute: () => root,
    path: '/clienti/$clientId/documente-ssm',
    validateSearch: z.object({ focus: z.string().optional() }),
    component: function Documents() {
      const navigate = useNavigate();
      const startWayBack = useStartWayBack();
      return (
        <button
          type="button"
          onClick={() => {
            startWayBack({ userId: 'user-one', clientId, to: 'documents' });
            void navigate({
              to: '/clienti/$clientId/detalii' as never,
              params: { clientId } as never,
              state: opening,
            });
          }}
        >
          Completează
        </button>
      );
    },
  });
  const details = createRoute({
    getParentRoute: () => root,
    path: '/clienti/$clientId/detalii',
    component: function Details() {
      const savedToast = useSavedToast();
      return (
        <button type="button" onClick={() => savedToast('Salvat.', { returning })}>
          Salvează
        </button>
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([documents, details]),
    history: createMemoryHistory({ initialEntries: ['/', documentsPage] }),
  });
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
      <Toaster />
    </AuthContext.Provider>
  );
  return router;
}

afterEach(() => endWayBack());

describe('the way back offered after a save', () => {
  it('goes back to the page the fix was opened from, instead of adding it again', async () => {
    const router = renderTrip(openedHere);
    const user = userEvent.setup();
    await act(() => router.history.push(documentsPage, { opener: 0 }));
    const start = router.history.location.state.__TSR_index;
    await user.click(await screen.findByRole('button', { name: 'Completează' }));
    await user.click(await screen.findByRole('button', { name: 'Salvează' }));
    await user.click(await screen.findByRole('button', { name: 'Înapoi la generare' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ focus: 'generate' }));
    expect(router.state.location.pathname).toBe(documentsPage);
    expect(router.history.location.state.__TSR_index).toBe(start);
    expect(router.history.location.state.opener).toBe(0);
    expect(currentWayBack('user-one')).toBeNull();
  });

  it('opens the page anew when the fix kept the opener of the record instead', async () => {
    const router = renderTrip(keepOpener);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Completează' }));
    const fixed = router.history.location.state.__TSR_index;
    await user.click(await screen.findByRole('button', { name: 'Salvează' }));
    await user.click(await screen.findByRole('button', { name: 'Înapoi la generare' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(documentsPage));
    expect(router.state.location.search).toEqual({ focus: 'generate' });
    expect(router.history.location.state.__TSR_index).toBe(fixed + 1);
  });

  it('offers no way back when the page goes back to where the fix started on its own', async () => {
    renderTrip(openedHere, true);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Completează' }));
    await user.click(await screen.findByRole('button', { name: 'Salvează' }));

    expect(await screen.findByText('Salvat.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Înapoi la generare' })).toBeNull();
    expect(currentWayBack('user-one')).toBeNull();
  });
});
