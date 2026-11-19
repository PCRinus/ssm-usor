import { toast } from '@ssm-usor/ui/lib/toast';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClientResponse,
  JobPositionListResponse,
  WorkplaceListResponse,
} from '@/api/generated/api';
import { fetchMock, installFetchMock, mockApi } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { employeeDetail, positions, sheetSource, workplaces } from '@/test/employee-import-fixture';
import { clientId, importDetail, importId, summaryOf } from '@/test/import-fixture';
import { mountApp } from '@/test/mount';
import { clientRecord } from '@/test/records';

import { importListPollMs } from './import-format';

const client = { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' };

function employeeImport(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryOf(importDetail({ kind: 'employees', client, intoExistingClient: true })),
    expiresAt: null,
    people: null,
    uninvited: null,
    ...overrides,
  };
}

const readyImport = employeeImport({
  status: 'ready',
  people: { total: 12, toCheck: 12, checked: 0, setAside: 0 },
});

let listed: Record<string, unknown>[] = [];

const watcherCalls = () =>
  fetchMock.mock.calls.filter(([input]) => {
    const url = new URL(String(input));
    return url.pathname === '/imports' && url.searchParams.get('kind') === 'all';
  });

function mount(path = '/profil') {
  mockApi((_init, url) => {
    if (url.pathname === '/imports') return Response.json({ items: listed });
    if (url.pathname === `/imports/${importId}`) {
      return Response.json({ import: employeeDetail({ people: readyImport.people }) });
    }
    if (url.pathname === `/imports/${importId}/source`) {
      return Response.json(sheetSource(url.searchParams.get('file')!));
    }
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions } satisfies JobPositionListResponse);
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({
        items: workplaces,
        unassignedEmployeeCount: 0,
      } satisfies WorkplaceListResponse);
    }
    if (url.pathname === `/clients/${clientId}`) {
      return Response.json({
        client: clientRecord({ legalName: client.legalName }),
        canDelete: false,
      } satisfies ClientResponse);
    }
    return undefined;
  });
  return mountApp(authFixture(makeSession()).client, path);
}

async function finishReading(
  runtime: ReturnType<typeof mountApp>,
  next: Record<string, unknown>[]
) {
  await waitFor(() => expect(watcherCalls()).toHaveLength(1));
  listed = next;
  await runtime.queryClient.invalidateQueries({ queryKey: ['/imports'] });
  await waitFor(() => expect(watcherCalls()).toHaveLength(2));
}

beforeEach(() => {
  listed = [employeeImport({ status: 'reading' })];
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
});

installFetchMock();

describe('the import ready notice', () => {
  it("announces the member's employee import once read, and opens its review", async () => {
    const runtime = mount();
    const user = userEvent.setup();
    await finishReading(runtime, [readyImport]);

    expect(
      await screen.findByText('Fișele de la Brutăria Spicul Auriu SRL sunt citite.')
    ).toBeTruthy();
    expect(screen.getByText('12 persoane te așteaptă la verificare.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Verifică persoanele' }));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(
        `/clienti/${clientId}/angajati/import/${importId}`
      )
    );
    expect(localStorage.getItem(`ssm-usor:import-announced:${importId}`)).not.toBeNull();
  });

  it('stays quiet about an import another tab already announced', async () => {
    localStorage.setItem(`ssm-usor:import-announced:${importId}`, '2026-10-31T10:00:00Z');
    const runtime = mount();
    await finishReading(runtime, [readyImport]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/sunt citite/)).toBeNull();
  });

  it('follows an import another member started for the page, and stays quiet when it is read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const someoneElse = { createdBy: { id: 'user-two', fullName: 'Ana Pop' } };
    listed = [employeeImport({ status: 'reading', ...someoneElse })];
    mount();
    await waitFor(() => expect(watcherCalls()).toHaveLength(1));

    listed = [{ ...readyImport, ...someoneElse }];
    await vi.advanceTimersByTimeAsync(importListPollMs);
    await waitFor(() => expect(watcherCalls()).toHaveLength(2));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/sunt citite/)).toBeNull();
  });

  it("follows the member's running import and stops once nothing is running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await waitFor(() => expect(watcherCalls()).toHaveLength(1));

    listed = [readyImport];
    await vi.advanceTimersByTimeAsync(importListPollMs);
    await waitFor(() => expect(watcherCalls()).toHaveLength(2));
    expect(
      await screen.findByText('Fișele de la Brutăria Spicul Auriu SRL sunt citite.')
    ).toBeTruthy();

    await vi.advanceTimersByTimeAsync(importListPollMs * 3);
    expect(watcherCalls()).toHaveLength(2);
  });

  it('asks nothing more while none of the imports is running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listed = [readyImport];
    mount();
    await waitFor(() => expect(watcherCalls()).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(importListPollMs * 3);
    expect(watcherCalls()).toHaveLength(1);
  });

  it('stays quiet about the import the member is looking at', async () => {
    const reading = importDetail();
    listed = [{ ...summaryOf(reading), expiresAt: null, people: null, uninvited: null }];
    mockApi((_init, url) => {
      if (url.pathname === `/imports/${importId}`) return Response.json({ import: reading });
      if (url.pathname === '/imports') return Response.json({ items: listed });
      return undefined;
    });
    const runtime = mountApp(authFixture(makeSession()).client, `/clienti/import/${importId}`);
    await finishReading(runtime, [{ ...listed[0]!, status: 'ready' }]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Propunerea pentru Brutăria Spicul Auriu SRL e gata.')).toBeNull();
    expect(localStorage.getItem(`ssm-usor:import-announced:${importId}`)).not.toBeNull();
  });
});
