import type { DutiesAcknowledgementStatus } from '@ssm-usor/contracts';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  ClientDocumentListResponse,
  ClientFileListResponse,
  EmployeeParticipantState,
  FireEquipmentListResponse,
  FireInstallationListResponse,
  SigningAgreementResponse,
} from '@/api/generated/api';
import { startWayBack } from '@/features/missing-data/way-back';
import { resetReloadDialog } from '@/features/reload-prompts/reload-dialog-store';
import { formatRoDate } from '@/lib/dates';
import { fetchMock, installFetchMock, mockApi as mockRoutes, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  dutiesNotIssued,
  employeeListItem,
  employeeRecord,
  jobPositionRecord,
  meRecord,
  pageOf,
  workplaceListItem,
} from '@/test/records';
import { replayedInput, replayedText } from '@/test/replay';
import { fullText } from '@/test/text';
import { employeeTests } from '@/test/training-fixture';

const sampleClient = clientRecord({
  legalName: 'OMV PETROM SA',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: 'J1997008302407',
  countyCode: 'B',
  locality: 'Sector 1 Mun. București',
  addressLine: 'Str. Coralilor, nr. 22',
  legalRepresentativeName: null,
  declaredEmployeeCount: 120,
});

const person = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  lastName: 'Popescu',
  firstName: 'Ion',
  employeeNumber: 'A-17',
  email: 'ion.popescu@example.com',
  phone: '0721 000 000',
  jobTitle: 'Sudor',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor', archived: false },
  hiredAt: '2020-03-01',
  workplace: null,
};

const sampleEmployee = employeeListItem({ ...person, signaturesPending: 2 });

const createdEmployee = employeeRecord({
  ...person,
  cnp: '1900101400127',
  birthDate: '1990-01-01',
});

const workplace = (id: string, name: string, isRegisteredOffice = false) =>
  workplaceListItem({
    id,
    name,
    isRegisteredOffice,
    countyCode: 'CJ',
    locality: 'Cluj-Napoca',
    addressLine: null,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  });
const registeredOffice = workplace(
  'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
  'Sediu Str. Lungă 5',
  true
);
const workshop = workplace('d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a', 'Atelier Str. Fabricii 3');

const employeesPath = `/clients/${clientId}/employees`;
const employeesPage = `/clienti/${clientId}/angajati`;

const page = (items: unknown[], meta: Partial<{ page: number; total: number }> = {}) => ({
  ...pageOf(items, meta),
  unfilteredTotal: meta.total ?? items.length,
});

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

const positionsPath = `/clients/${clientId}/job-positions`;
const newPositionId = '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d';
const welderPosition = jobPositionRecord({
  id: sampleEmployee.jobPosition.id,
  name: 'Sudor',
  employeeCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

// Opens the position picker, types, and takes the option that shows.
async function pickPosition(
  user: ReturnType<typeof userEvent.setup>,
  search: string,
  option: RegExp,
  testId = 'employee-job-position'
) {
  await user.click(await screen.findByTestId(testId));
  await user.type(screen.getByTestId(`${testId}-search`), search);
  await user.click(
    await within(await screen.findByRole('listbox')).findByRole('option', { name: option })
  );
}

const emptyDocumentDetails = {
  legalRepresentativeName: null,
  legalRepresentativeRole: null,
  periodicTrainingMinutes: null,
  administrativeTrainingIntervalMonths: null,
  administrativeTrainingNotApplicable: false,
  workerTrainingIntervalMonths: null,
  workerTrainingNotApplicable: false,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

function mockApi(
  routes: Partial<
    Record<
      | 'me'
      | 'clients'
      | 'client'
      | 'list'
      | 'detail'
      | 'create'
      | 'status'
      | 'positions'
      | 'createPosition'
      | 'move'
      | 'update'
      | 'workplaces'
      | 'participant'
      | 'agreement',
      Route
    >
  > = {}
) {
  mockRoutes((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/me' && routes.me) return routes.me(init, url);
    if (url.pathname === '/clients' && method === 'GET') {
      return routes.clients?.(init, url) ?? Response.json(page([sampleClient]));
    }
    if (url.pathname === `/clients/${clientId}` && method === 'GET') {
      return routes.client?.(init, url) ?? Response.json({ client: sampleClient });
    }
    if (url.pathname === `/clients/${clientId}/owner-notes` && method === 'GET') {
      return Response.json({ notes: { body: '', updatedAt: null } });
    }
    if (url.pathname === employeesPath && method === 'GET') {
      return routes.list?.(init, url) ?? Response.json(page([]));
    }
    if (url.pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails: emptyDocumentDetails });
    }
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === `/clients/${clientId}/found-sheets`) {
      return Response.json({ items: [], total: 0 });
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return routes.workplaces?.(init, url) ?? Response.json({ items: [] });
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}` && method === 'PUT') {
      return (
        routes.update?.(init, url) ??
        Response.json({ employee: { ...createdEmployee, ...JSON.parse(String(init?.body)) } })
      );
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}` && method === 'GET') {
      return routes.detail?.(init, url) ?? Response.json({ employee: createdEmployee });
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/participant`) {
      if (routes.participant) return routes.participant(init, url);
      return Response.json({
        participant: null,
        invitation: null,
      } satisfies EmployeeParticipantState);
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/signing-agreement/state`) {
      if (routes.agreement) return routes.agreement(init, url);
      return Response.json({
        agreement: null,
        unavailable: null,
      } satisfies SigningAgreementResponse);
    }
    if (`${url.pathname}${url.search}` === `/clients/${clientId}/documents`) {
      return Response.json({
        items: [],
        lastGeneration: null,
        notApplicable: [],
        currentEmployeeCount: sampleClient.currentEmployeeCount,
      } satisfies ClientDocumentListResponse);
    }
    if (
      `${url.pathname}${url.search}` ===
      `/clients/${clientId}/files?employeeId=${sampleEmployee.id}`
    ) {
      return Response.json({ items: [] } satisfies ClientFileListResponse);
    }
    if (url.pathname === `/clients/${clientId}/fire-equipment`) {
      return Response.json({ items: [] } satisfies FireEquipmentListResponse);
    }
    if (url.pathname === `/clients/${clientId}/fire-installations`) {
      return Response.json({ items: [] } satisfies FireInstallationListResponse);
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/training-records`) {
      return Response.json({ items: [] });
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/tests`) {
      return Response.json(employeeTests());
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/duties-acknowledgement`) {
      return Response.json(dutiesNotIssued);
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/training-sheets`) {
      return Response.json({
        ssm: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
        su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
      });
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/status` && method === 'PATCH') {
      return (
        routes.status?.(init, url) ??
        Response.json({ employee: { ...createdEmployee, ...JSON.parse(String(init?.body)) } })
      );
    }
    if (url.pathname === employeesPath && method === 'POST') {
      return (
        routes.create?.(init, url) ?? Response.json({ employee: createdEmployee }, { status: 201 })
      );
    }
    if (url.pathname === positionsPath) {
      if (method === 'POST') {
        return (
          routes.createPosition?.(init, url) ??
          Response.json(
            {
              jobPosition: {
                ...welderPosition,
                id: newPositionId,
                ...JSON.parse(String(init?.body)),
              },
            },
            { status: 201 }
          )
        );
      }
      return routes.positions?.(init, url) ?? Response.json({ items: [welderPosition] });
    }
    if (url.pathname === `${employeesPath}/${sampleEmployee.id}/job-position`) {
      return routes.move?.(init, url) ?? Response.json({ employee: createdEmployee });
    }
  });
}

// The date picker takes typed Romanian dates; the form receives the ISO value.
const setDate = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value: formatRoDate(value) } });

installFetchMock();

describe('client employees list', () => {
  it('shows the client header, its way back to the clients, and the employees with their status', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('client-page');
    expect(screen.getByRole('heading', { level: 1, name: 'OMV PETROM SA' })).toBeTruthy();
    expect(screen.getByText('RO1590082')).toBeTruthy();
    expect(screen.queryByText('· Extracția petrolului brut')).toBeNull();
    expect(screen.queryByText('Sector 1 Mun. București, București')).toBeNull();
    const current = screen
      .getAllByTestId('client-section')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Lucrători']);
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    const back = screen.getByRole('link', { name: 'Înapoi la clienți' });
    expect(back.getAttribute('href')).toBe('/clienti');
    const row = await screen.findByTestId('employees-row');
    expect(within(row).getByText('Popescu Ion')).toBeTruthy();
    expect(within(row).getByText('Marca A-17')).toBeTruthy();
    expect(within(row).getByText('Sudor')).toBeTruthy();
    expect(within(row).getByTestId('employees-signatures').textContent).toBe('2 în așteptare');
    expect(within(row).getByText('1 mar. 2020')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Data încetării/ })).toBeNull();
    expect(screen.getByTestId('employees-filter-current').textContent).toBe('Actuali');
    expect(screen.getByTestId('employees-filter-terminated').textContent).toBe('Foști');
    expect(screen.getByTestId('employees-count').textContent).toBe('1 lucrător');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1 lucrător');
    expect(screen.queryByTestId('pager-next')).toBeNull();
    const [url, init] = requestsTo(employeesPath)[0]!;
    const query = new URL(String(url)).searchParams;
    expect(query.has('status')).toBe(false);
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('25');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });

  it('opens a client from the clients list on its details', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clienti');
    await userEvent.setup().click(await screen.findByTestId('clients-open'));
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/detalii`);
    expect(requestsTo(`/clients/${clientId}`)).toHaveLength(1);
  });

  it('redirects the bare client path to its details', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, `/clienti/${clientId}`);
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/detalii`);
  });

  it('filters former employees through the status search parameter', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          page(
            url.searchParams.get('status') === 'terminated'
              ? [{ ...sampleEmployee, status: 'terminated', terminatedAt: '2025-12-31' }]
              : [sampleEmployee]
          )
        ),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('employees-row');
    await userEvent.setup().click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({ status: 'terminated' });
    expect(await screen.findByText('31 dec. 2025')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Data încetării/ })).toBeTruthy();
    expect(screen.getByTestId('employees-filter-terminated').getAttribute('aria-current')).toBe(
      'page'
    );
    expect(screen.queryByTestId('employees-add')).toBeNull();
    expect(screen.queryByTestId('employees-import')).toBeNull();
    const [url] = requestsTo(employeesPath)[1]!;
    expect(new URL(String(url)).searchParams.get('status')).toBe('terminated');
  });

  it('does not add filter changes to the browser history', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clienti');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-open'));
    await screen.findByTestId('client-details-page');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secțiunile clientului' })).getByRole('link', {
        name: 'Lucrători',
      })
    );
    await screen.findByTestId('employees-page');
    expect(runtime.router.history.length).toBe(3);

    await user.click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({ status: 'terminated' });
    expect(runtime.router.history.length).toBe(3);

    act(() => runtime.router.history.back());
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/detalii`);
  });

  it("puts the ways to add workers in the list's toolbar, under a heading only screen readers see", async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('employees-row');
    const toolbar = screen.getByTestId('employees-toolbar');
    expect(within(toolbar).getByTestId('employees-add')).toBeTruthy();
    expect(within(toolbar).getByTestId('employees-import')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lucrători' }).className).toContain('sr-only');
  });

  it('pages through the list with the page in the URL', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          page(
            url.searchParams.get('page') === '2'
              ? [{ ...sampleEmployee, id: 'b2', lastName: 'Zamfir' }]
              : [sampleEmployee],
            { page: Number(url.searchParams.get('page') ?? 1), total: 26 }
          )
        ),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    expect(screen.getByTestId('employees-count').textContent).toBe('26 de lucrători');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 din 26 de lucrători');
    expect((screen.getByTestId('pager-previous') as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByTestId('pager-next'));
    await screen.findByText('Zamfir Ion');
    expect(runtime.router.state.location.search).toEqual({ page: 2 });
    expect(screen.getByTestId('pager-summary').textContent).toBe('26–26 din 26 de lucrători');
    expect((screen.getByTestId('pager-next') as HTMLButtonElement).disabled).toBe(true);
    // Switching the status filter starts again from the first page.
    await user.click(screen.getByTestId('employees-filter-terminated'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ status: 'terminated' })
    );
  });

  it('says under the post, in amber, when the SSM duties wait for a signature, and nothing otherwise', async () => {
    const worker = (
      id: string,
      lastName: string,
      dutiesAcknowledgement: DutiesAcknowledgementStatus | null
    ) => employeeListItem({ ...person, id, lastName, dutiesAcknowledgement });
    mockApi({
      list: () =>
        Response.json(
          page([
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f01', 'Bălan', 'signed'),
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f02', 'Constantin', 'to_sign'),
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f03', 'Ionescu', 'sign_again'),
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f04', 'Popa', 'no_annex'),
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f05', 'Stan', 'not_issued'),
            worker('0f6c7a1e-1b2c-4d3e-8f4a-5b6c7d8e9f06', 'Toma', null),
          ])
        ),
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findAllByTestId('employees-row');
    const lines = screen
      .getAllByTestId('employees-row')
      .map((row) => within(row).queryByTestId('employees-duties'));
    expect(lines.map((line) => line?.textContent ?? null)).toEqual([
      null,
      'Atribuții SSM nesemnate',
      'Atribuții SSM noi, nesemnate',
      'Postul lipsește din doc. 13',
      null,
      null,
    ]);
    expect(lines[1]!.className).toContain('text-warning-foreground');
    expect(lines[1]!.parentElement!.textContent).toBe('SudorAtribuții SSM nesemnate');
    expect(screen.queryByRole('columnheader', { name: /Atribuții/ })).toBeNull();
  });

  it('filters by the state of the SSM duties acknowledgement', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    const group = within(panel).getByRole('list', { name: 'Atribuții SSM' });
    expect(
      within(group)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Semnate', 'Nesemnate', 'Noi, nesemnate', 'Postul lipsește din doc. 13']);
    await user.click(within(panel).getByTestId('employees-filters-dutiesAcknowledgement-to_sign'));
    await user.click(
      within(panel).getByTestId('employees-filters-dutiesAcknowledgement-sign_again')
    );
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        dutiesAcknowledgement: ['to_sign', 'sign_again'],
      })
    );
    await waitFor(() => {
      const sent = new URL(String(requestsTo(employeesPath).at(-1)![0])).searchParams;
      expect(sent.getAll('dutiesAcknowledgement')).toEqual(['to_sign', 'sign_again']);
    });
  });

  it('offers no duties filter on the former employees', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?status=terminated`);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(within(panel).queryByRole('list', { name: 'Atribuții SSM' })).toBeNull();
  });

  it('filters by the posts and workplaces of the client, and keeps them on the other tab', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      workplaces: () => Response.json({ items: [registeredOffice, workshop] }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    expect((screen.getByTestId('employees-search') as HTMLInputElement).placeholder).toBe(
      'Caută după nume sau marcă'
    );
    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    await user.click(
      await within(panel).findByTestId(`employees-filters-workplace-${workshop.id}`)
    );
    await user.click(within(panel).getByTestId('employees-filters-jobPosition-add'));
    await user.click(
      await screen.findByTestId(`employees-filters-jobPosition-${welderPosition.id}`)
    );
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        workplace: workshop.id,
        jobPosition: welderPosition.id,
      })
    );
    await waitFor(() => {
      const sent = new URL(String(requestsTo(employeesPath).at(-1)![0])).searchParams;
      expect(sent.getAll('workplace')).toEqual([workshop.id]);
      expect(sent.getAll('jobPosition')).toEqual([welderPosition.id]);
    });
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('employees-applied-filters-jobPosition').textContent).toContain(
      'Sudor'
    );
    await user.click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({
      status: 'terminated',
      workplace: workshop.id,
      jobPosition: welderPosition.id,
    });
  });

  it('keeps the scroll where it was when a tab, a filter or the sort changes', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByTestId('employees-filter-terminated'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ status: 'terminated' })
    );
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-filters'));
    await user.click(await screen.findByTestId('employees-filters-attention-noPhone'));
    await waitFor(() =>
      expect(runtime.router.state.location.searchStr).toBe('?status=terminated&attention=noPhone')
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('sort-hiredAt'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toMatchObject({ sort: 'hiredAt' })
    );
    await user.click(screen.getByTestId('employees-filter-current'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('reads no filter its list does not offer, so every one applied is named', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(
      authFixture(makeSession()).client,
      `${employeesPage}?status=terminated&attention=toTrain&ssmTraining=overdue&jobPosition=${newPositionId}`
    );
    await screen.findByTestId('employees-row');
    await waitFor(() => {
      const sent = new URL(String(requestsTo(employeesPath).at(-1)![0])).searchParams;
      expect(sent.has('attention')).toBe(false);
      expect(sent.has('ssmTraining')).toBe(false);
      expect(sent.has('jobPosition')).toBe(false);
    });
    expect(screen.queryByTestId('employees-applied-filters')).toBeNull();
    expect(screen.getByTestId('employees-count').textContent).toBe('1 lucrător');
  });

  it("neither filters nor sorts an archived client's employees by a state they do not have", async () => {
    mockApi({
      client: () =>
        Response.json({ client: { ...sampleClient, archivedAt: '2026-01-01T00:00:00+00:00' } }),
      list: () => Response.json(page([sampleEmployee])),
    });
    mountApp(
      authFixture(makeSession()).client,
      `${employeesPage}?sort=ssmTraining&ssmTraining=overdue&attention=noPhone`
    );
    await screen.findByTestId('employees-row');
    const sent = new URL(String(requestsTo(employeesPath).at(-1)![0])).searchParams;
    expect(sent.get('sort')).toBe('name');
    expect(sent.has('ssmTraining')).toBe(false);
    expect(sent.getAll('attention')).toEqual(['noPhone']);
    expect(screen.queryByTestId('sort-ssmTraining')).toBeNull();
  });

  it('offers no workplace filter to a client with one workplace', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      workplaces: () => Response.json({ items: [registeredOffice] }),
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('employees-row');
    await userEvent.setup().click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(within(panel).getByRole('heading', { name: 'Post de lucru' })).toBeTruthy();
    expect(within(panel).queryByRole('heading', { name: 'Punct de lucru' })).toBeNull();
  });

  it('filters to the workers without a workplace from a link, even at a client with one workplace', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      workplaces: () => Response.json({ items: [registeredOffice], unassignedEmployeeCount: 2 }),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?workplace=none`);
    await screen.findByTestId('employees-row');
    await waitFor(() => {
      const sent = new URL(String(requestsTo(employeesPath).at(-1)![0])).searchParams;
      expect(sent.getAll('workplace')).toEqual(['none']);
    });
    expect(screen.getByTestId('employees-applied-filters-workplace').textContent).toContain(
      'Fără punct de lucru'
    );
    await userEvent.setup().click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(
      within(panel).getByTestId(`employees-filters-workplace-${registeredOffice.id}`)
    ).toBeTruthy();
    expect(within(panel).getByTestId('employees-filters-workplace-none')).toBeTruthy();
  });

  it('offers no filter for workers without a workplace while every one has a workplace', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      workplaces: () =>
        Response.json({ items: [registeredOffice, workshop], unassignedEmployeeCount: 0 }),
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('employees-row');
    await userEvent.setup().click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    await within(panel).findByTestId(`employees-filters-workplace-${workshop.id}`);
    expect(within(panel).queryByTestId('employees-filters-workplace-none')).toBeNull();
  });

  it('sorts by one column at a time through the URL', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?page=2`);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    const nameHeader = screen.getByRole('columnheader', { name: /Lucrător$/ });
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(
      screen.getByRole('columnheader', { name: 'De semnat' }).getAttribute('aria-sort')
    ).toBeNull();
    await user.click(screen.getByTestId('sort-hiredAt'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'hiredAt' }));
    expect(
      screen.getByRole('columnheader', { name: /Angajat din/ }).getAttribute('aria-sort')
    ).toBe('ascending');
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
    await user.click(screen.getByTestId('sort-hiredAt'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'hiredAt', order: 'desc' })
    );
    // Clicking a third time never removes the sort; it goes back to ascending.
    await user.click(screen.getByTestId('sort-hiredAt'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'hiredAt' }));
    // Each sort state was requested once; the third click reuses the cached ascending page.
    const sorts = requestsTo(employeesPath).map(([url]) => {
      const query = new URL(String(url)).searchParams;
      return `${query.get('sort')}:${query.get('order')}:${query.get('page')}`;
    });
    expect(sorts).toEqual(['name:asc:2', 'hiredAt:asc:1', 'hiredAt:desc:1']);
  });

  it('shows an empty state that leads to the creation page', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('employees-empty');
    expect(screen.getByTestId('employees-count').textContent).toBe('0 lucrători');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /^Adaugă manual/ }));
    await screen.findByTestId('new-employee-page');
    expect(runtime.router.state.location.pathname).toBe(`${employeesPage}/nou`);
    // The form stands on its own: no client summary card or section tabs above it.
    expect(screen.queryByTestId('client-page')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Lucrător nou' })).toBeTruthy();
    const fact = screen.getByTestId('client-fact');
    expect(within(fact).getByRole('link', { name: 'OMV PETROM SA' })).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Înapoi' });
    expect(back.getAttribute('href')).toBe(employeesPage);
    const clientField = screen.getByTestId('employee-client') as HTMLInputElement;
    expect(clientField.value).toBe('OMV PETROM SA');
    expect(clientField.disabled).toBe(true);
  });

  it('explains a list failure and can retry', async () => {
    // A 4xx is not retried by the query client, so the error shows at once.
    let attempts = 0;
    mockApi({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ error: 'not_found', message: 'gone' }, { status: 404 })
          : Response.json(page([sampleEmployee]));
      },
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const error = await screen.findByTestId('employees-error');
    expect(error.textContent).toContain('Clientul nu mai există');
    await userEvent.setup().click(screen.getByTestId('employees-retry'));
    await screen.findByTestId('employees-row');
  });

  it('shows a not-found screen for a client outside the organization', async () => {
    mockApi({
      client: () => Response.json({ error: 'not_found', message: 'none' }, { status: 404 }),
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    await screen.findByTestId('client-not-found');
    expect(requestsTo(employeesPath)).toHaveLength(0);
  });

  it('explains a missing membership when the client cannot load', async () => {
    mockApi({
      client: () =>
        Response.json({ error: 'forbidden', message: 'No membership' }, { status: 403 }),
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const error = await screen.findByTestId('client-error');
    expect(error.textContent).toContain('nu face parte dintr-o organizație');
  });

  it('protects the employee pages', async () => {
    mockApi();
    const runtime = mountApp(authFixture().client, `${employeesPage}/nou`);
    await screen.findByTestId('login-page');
    expect(runtime.router.state.location.pathname).toBe('/autentificare');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('employee creation', () => {
  it('validates required fields and formats before contacting the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('lastName-error')).textContent).toBe(
      'Introdu numele de familie.'
    );
    expect(screen.getByTestId('firstName-error')).toBeTruthy();
    expect(screen.getByTestId('jobTitle-error')).toBeTruthy();
    expect(screen.getByTestId('hiredAt-error')).toBeTruthy();
    expect(screen.getByTestId('employee-last-name').getAttribute('aria-invalid')).toBe('true');
    await user.type(screen.getByTestId('employee-cnp'), '1900101400128');
    await user.type(screen.getByTestId('employee-email'), 'not-an-email');
    await user.type(screen.getByTestId('employee-phone'), '0721 000');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('cnp-error')).textContent).toContain('CNP invalid');
    expect(screen.getByTestId('email-error')).toBeTruthy();
    expect(screen.getByTestId('phone-error').textContent).toBe(
      'Numărul de telefon nu este valid pentru țara aleasă.'
    );
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('prefills the birth date from the CNP and rejects a contradicting one', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-cnp'), '1900101 400127');
    await user.tab();
    const birthDate = screen.getByTestId('employee-birth-date') as HTMLInputElement;
    expect(birthDate.value).toBe('01.01.1990');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    setDate(birthDate, '1990-01-02');
    await user.click(screen.getByTestId('employee-submit'));
    const mismatch = await screen.findByTestId('birthDate-error');
    expect(mismatch.textContent).toBe('Data nașterii nu corespunde cu CNP-ul. De ce?');
    expect(
      within(mismatch).getByRole('link', { name: 'De ce?' }).getAttribute('data-help-topic')
    ).toBe('angajati.data-nasterii');
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('flags an unfinished birth date instead of saving it as no date', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.type(screen.getByTestId('employee-birth-date'), '01.01.19');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('birthDate-error')).textContent).toBe('Alege o dată validă.');
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('sends the normalized request and returns to the list', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-cnp'), '1900101 400127');
    await user.type(screen.getByTestId('employee-number'), 'A-17');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.type(screen.getByTestId('employee-email'), 'Ion.Popescu@Example.com');
    await user.type(screen.getByTestId('employee-phone'), '0721 000 000');
    await user.selectOptions(screen.getByTestId('employee-blood-group'), 'A(II)');
    await user.selectOptions(screen.getByTestId('employee-rh-factor'), '+');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(runtime.router.state.location.pathname).toBe(employeesPage);
    expect(await screen.findByText(fullText('Popescu Ion a fost adăugat.'))).toBeTruthy();
    await screen.findByTestId('employees-row');
    const [, init] = requestsTo(employeesPath, 'POST')[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      lastName: 'Popescu',
      firstName: 'Ion',
      cnp: '1900101400127',
      employeeNumber: 'A-17',
      email: 'ion.popescu@example.com',
      phone: '+40721000000',
      jobPositionId: sampleEmployee.jobPosition.id,
      // Filled from the position; nobody typed it.
      jobTitle: 'Sudor',
      contractNumber: null,
      hiredAt: '2020-03-01',
      birthDate: '1990-01-01',
      birthPlace: null,
      homeAddress: null,
      residenceAddress: null,
      bloodGroup: 'A(II)',
      rhFactor: '+',
      notes: null,
      workplaceId: null,
      qualification: null,
      education: null,
      authorizations: null,
      commuteRoute: null,
      commuteMeans: [],
      commuteMeansOther: null,
      commuteMinutes: null,
    });
  });

  it('accepts the minimal form and sends nulls for the rest', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      cnp: null,
      employeeNumber: null,
      email: null,
      birthDate: null,
      bloodGroup: null,
      contractNumber: null,
      residenceAddress: null,
    });
  });

  it('does not call the workplace or the commute route optional, which the sheets need, but the duration', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    await screen.findByTestId('new-employee-page');
    const label = (id: string) => document.querySelector(`label[for="${id}"]`)?.textContent;

    expect(label('workplaceId')).toContain('Punct de lucru');
    expect(label('workplaceId')).not.toContain('(opțional)');
    expect(label('commuteRoute')).toContain('Traseul de deplasare');
    expect(label('commuteRoute')).not.toContain('(opțional)');
    expect(label('commuteMinutes')).toContain('(opțional)');
  });

  it('asks for the means of transport, as optional, between the route and its duration', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    await screen.findByTestId('new-employee-page');
    const label = (id: string) => document.querySelector(`label[for="${id}"]`)!;
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(label('commuteMeans').textContent).toContain('Mijloace de transport');
    expect(label('commuteMeans').textContent).toContain('(opțional)');
    expect(follows(label('commuteRoute'), label('commuteMeans'))).toBe(true);
    expect(follows(label('commuteMeans'), label('commuteMinutes'))).toBe(true);
    expect(document.getElementById('commuteRoute-hint')?.textContent).toBe(
      'De acasă la locul de muncă, pe unde trece.'
    );
  });

  it('asks right after the domicile, as optional, where the worker lives when it differs', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    await screen.findByTestId('new-employee-page');
    const label = (id: string) => document.querySelector(`label[for="${id}"]`)!;

    expect(label('residenceAddress').textContent).toContain('Adresa unde locuiește');
    expect(label('residenceAddress').textContent).toContain('(opțional)');
    expect(
      label('homeAddress').compareDocumentPosition(label('residenceAddress')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('employee-residence-address').getAttribute('aria-describedby')).toBe(
      'residenceAddress-hint'
    );
    expect(document.getElementById('residenceAddress-hint')?.textContent).toBe(
      'Dacă diferă de domiciliul din buletin.'
    );
  });

  it('maps a duplicate CNP to the field, an archived client to the form and another clash to neither', async () => {
    let attempts = 0;
    mockApi({
      create: () => {
        attempts += 1;
        if (attempts === 1) {
          return Response.json(
            { error: 'conflict', message: 'Duplicate.', reason: 'employee_cnp_taken' },
            { status: 409 }
          );
        }
        return attempts === 2
          ? Response.json(
              { error: 'conflict', message: 'Archived.', reason: 'client_archived' },
              { status: 409 }
            )
          : Response.json({ error: 'conflict', message: 'Conflict.' }, { status: 409 });
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-cnp'), '1900101400127');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('cnp-error')).textContent).toContain('acest CNP');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('employee-form-error')).textContent).toContain('arhivat');
    await user.click(screen.getByTestId('employee-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('employee-form-error').textContent).toContain(
        'conflict cu alt lucrător'
      )
    );
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(3);
  });
});

describe('a month over the step of employees', () => {
  const meOver =
    (blocked: boolean, role: 'owner' | 'specialist' = 'owner') =>
    () =>
      Response.json(
        meRecord({
          membership: { organization: { id: 'org-1', name: 'SSM Test' }, role },
          employeesOverStep: { since: '2026-11-02T10:00:00.000Z', lastDay: '2026-12-02', blocked },
        })
      );

  it('says until when new employees can still be added, and keeps adding open', async () => {
    mockApi({ me: meOver(false), list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);

    const notice = await screen.findByTestId('employees-over-step');
    expect(notice.textContent).toContain('până pe 02.12.2026 inclusiv');
    expect(
      within(notice).getByRole('link', { name: 'Vezi abonamentul' }).getAttribute('href')
    ).toBe('/organizatie/abonament');
    expect(screen.getByRole('link', { name: /Adaugă manual/ })).toBeTruthy();
  });

  it('explains the block in visible text and stops adding, but not editing or leaving', async () => {
    mockApi({ me: meOver(true, 'specialist'), list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);

    const notice = await screen.findByTestId('employees-over-step');
    expect(notice.textContent).toContain('Nu mai poți adăuga lucrători noi.');
    expect(notice.textContent).toContain('arhivează clienții cu care nu mai lucrezi');
    expect(notice.textContent).toContain('Treapta o schimbă adminul organizației.');
    const add = await screen.findByTestId('employees-add');
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('employees-import')).toBeTruthy();
  });

  it('words the refusal of the API on the form', async () => {
    mockApi({
      create: () =>
        Response.json(
          { error: 'forbidden', message: 'over', reason: 'employees_over_step' },
          { status: 403 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('employee-form-error')).textContent).toContain(
      'Nu mai poți adăuga lucrători noi'
    );
  });
});

describe('the employment contract number', () => {
  const detailPath = `${employeesPath}/${sampleEmployee.id}`;
  const detailPage = `${employeesPage}/${sampleEmployee.id}`;
  const editPage = `${detailPage}/editare`;
  const contractFact = () =>
    screen.getByText('Nr. contract').closest('dt')?.nextElementSibling?.textContent;

  it('is sent with a new employee, trimmed', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    await user.type(screen.getByTestId('employee-contract-number'), ' 118/2020 ');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      contractNumber: '118/2020',
    });
  });

  it('refuses more than 50 characters before contacting the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.click(screen.getByTestId('employee-contract-number'));
    await user.paste('1'.repeat(51));
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('contractNumber-error')).textContent).toContain('50');
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('shows on the employee page beside the contract title', async () => {
    mockApi({
      detail: () => Response.json({ employee: { ...createdEmployee, contractNumber: '118/2020' } }),
    });
    mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-page');
    expect(contractFact()).toBe('118/2020');
  });

  it('shows a dash on the employee page when the number is unknown', async () => {
    mockApi({ detail: () => Response.json({ employee: createdEmployee }) });
    mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-page');
    expect(contractFact()).toBe('—');
  });

  it('opens in the edit form and is cleared when emptied', async () => {
    mockApi({
      detail: () => Response.json({ employee: { ...createdEmployee, contractNumber: '118/2020' } }),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    const field = screen.getByTestId<HTMLInputElement>('employee-contract-number');
    expect(field.value).toBe('118/2020');
    await user.clear(field);
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employee-page');
    const [, init] = requestsTo(detailPath, 'PUT')[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({ contractNumber: null });
  });
});

describe('training sheet fields on employees (ADR 021)', () => {
  const detailPath = `${employeesPath}/${sampleEmployee.id}`;
  const detailPage = `${employeesPage}/${sampleEmployee.id}`;
  const editPage = `${detailPage}/editare`;
  const withSheet = {
    ...createdEmployee,
    residenceAddress: 'Str. Florilor 9, Timișoara',
    workplace: { id: workshop.id, name: workshop.name },
    qualification: 'Sudor autorizat',
    education: 'Școala profesională',
    authorizations: 'ISCIR',
    commuteRoute: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
    commuteMeans: ['on_foot', 'public_transport'],
    commuteMeansOther: null,
    commuteMinutes: 35,
  };

  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await pickPosition(user, 'sud', /Sudor/);
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
  }

  it('preselects the only workplace of the client and sends the sheet fields', async () => {
    mockApi({ workplaces: () => Response.json({ items: [registeredOffice] }) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId('employee-workplace').textContent).toContain('Sediu Str. Lungă 5')
    );
    await fillRequired(user);
    await user.type(screen.getByTestId('employee-qualification'), 'Sudor autorizat');
    await user.type(screen.getByTestId('employee-education'), 'Școala profesională');
    await user.type(screen.getByTestId('employee-authorizations'), 'ISCIR');
    await user.type(screen.getByTestId('employee-residence-address'), 'Str. Florilor 9, Timișoara');
    await user.type(
      screen.getByTestId('employee-commute-route'),
      'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24'
    );
    await user.click(screen.getByTestId('employee-commute-means'));
    await user.click(await screen.findByTestId('employee-commute-means-public_transport'));
    await user.click(screen.getByTestId('employee-commute-means-on_foot'));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('employee-commute-means').textContent).toBe(
      'Pe jos, Transport public'
    );
    await user.type(screen.getByTestId('employee-commute-minutes'), '35');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      commuteMeans: ['on_foot', 'public_transport'],
      commuteMeansOther: null,
      workplaceId: registeredOffice.id,
      qualification: 'Sudor autorizat',
      education: 'Școala profesională',
      authorizations: 'ISCIR',
      residenceAddress: 'Str. Florilor 9, Timișoara',
      commuteRoute: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commuteMinutes: 35,
    });
  });

  it('picks the means with the keyboard and adds one typed apart, which another one typed replaces', async () => {
    mockApi({ workplaces: () => Response.json({ items: [registeredOffice] }) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await fillRequired(user);
    screen.getByTestId('employee-commute-means').focus();
    await user.keyboard('{Enter}');
    await user.keyboard('transport public');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('employee-commute-means-public_transport').dataset.checked).toBe(
      'true'
    );
    await user.keyboard('Barca');
    expect(screen.getByTestId('employee-commute-means-add').textContent).toBe('Adaugă „Barca”');
    await user.keyboard('{Enter}');
    await user.keyboard('Bacul de pe Mureș');
    expect(screen.getByTestId('employee-commute-means-add').textContent).toBe(
      'Pune „Bacul de pe Mureș” în locul lui „Barca”'
    );
    await user.keyboard('{Enter}{Escape}');
    expect(screen.getByTestId('employee-commute-means').textContent).toBe(
      'Transport public, Bacul de pe Mureș'
    );
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      commuteMeans: ['public_transport'],
      commuteMeansOther: 'Bacul de pe Mureș',
    });
  });

  it('opens with the means saved and clears them all at once', async () => {
    mockApi({
      detail: () => Response.json({ employee: withSheet }),
      workplaces: () => Response.json({ items: [registeredOffice] }),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    const means = await screen.findByTestId('employee-commute-means');
    await waitFor(() => expect(means.textContent).toBe('Pe jos, Transport public'));
    await user.click(means);
    await user.click(await screen.findByTestId('employee-commute-means-clear'));
    await user.keyboard('{Escape}');
    expect(means.textContent).toBe('Alege unul sau mai multe');
    await user.click(screen.getByTestId('employee-submit'));
    await waitFor(() =>
      expect(requestsTo(`${employeesPath}/${sampleEmployee.id}`, 'PUT')).toHaveLength(1)
    );
    expect(
      JSON.parse(String(requestsTo(`${employeesPath}/${sampleEmployee.id}`, 'PUT')[0]![1]?.body))
    ).toMatchObject({ commuteMeans: [], commuteMeansOther: null });
  });

  it('leaves the choice to the person when the client has several workplaces', async () => {
    mockApi({ workplaces: () => Response.json({ items: [registeredOffice, workshop] }) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId<HTMLButtonElement>('employee-workplace').disabled).toBe(false)
    );
    expect(screen.getByTestId('employee-workplace').textContent).toContain(
      'Alege punctul de lucru'
    );
    await fillRequired(user);
    await user.click(screen.getByTestId('employee-workplace'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Sediu Str. Lungă 5'),
      expect.stringContaining('Atelier Str. Fabricii 3'),
      'Adaugă un punct de lucru nou…',
    ]);
    await user.click(options[1]!);
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      workplaceId: workshop.id,
    });
  });

  it('offers no registered office where no activity takes place, and preselects the one workplace left', async () => {
    mockApi({
      workplaces: () =>
        Response.json({ items: [{ ...registeredOffice, officeHasActivity: false }, workshop] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId('employee-workplace').textContent).toContain(
        'Atelier Str. Fabricii 3'
      )
    );
    await user.click(screen.getByTestId('employee-workplace'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Renunță la punctul de lucru ales',
      expect.stringContaining('Atelier Str. Fabricii 3'),
      'Adaugă un punct de lucru nou…',
    ]);
  });

  it('adds a workplace the client lacks from the picker and keeps what was typed in the form', async () => {
    const warehouse = workplace('e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b', 'Depozit Florești');
    let items = [registeredOffice, workshop];
    mockApi({
      workplaces: (init) => {
        if (init?.method === 'POST') {
          items = [...items, warehouse];
          return Response.json({ workplace: warehouse }, { status: 201 });
        }
        return Response.json({ items });
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId<HTMLButtonElement>('employee-workplace').disabled).toBe(false)
    );
    await fillRequired(user);
    await user.type(screen.getByTestId('employee-qualification'), 'Stivuitorist');

    await user.click(screen.getByTestId('employee-workplace'));
    await user.type(screen.getByTestId('employee-workplace-search'), 'Depozit');
    expect(screen.getByText('Clientul nu are un punct de lucru cu acest nume.')).toBeTruthy();
    await user.click(screen.getByTestId('employee-workplace-add'));

    const dialog = await screen.findByTestId('workplace-dialog');
    const name = within(dialog).getByTestId<HTMLInputElement>('workplace-name');
    expect(name.value).toBe('Depozit');
    await user.type(name, ' Florești');
    await user.click(within(dialog).getByTestId('workplace-save'));
    await waitFor(() => expect(screen.queryByTestId('workplace-dialog')).toBeNull());
    expect(screen.getByTestId('employee-workplace').textContent).toContain('Depozit Florești');
    expect(screen.getByTestId<HTMLInputElement>('employee-last-name').value).toBe('Popescu');
    expect(screen.getByTestId<HTMLInputElement>('employee-qualification').value).toBe(
      'Stivuitorist'
    );
    // Saving the workplace did not submit the form it was opened from.
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);

    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    const [, created] = requestsTo(`/clients/${clientId}/workplaces`, 'POST')[0]!;
    expect(JSON.parse(String(created?.body))).toMatchObject({ name: 'Depozit Florești' });
    expect(JSON.parse(String(requestsTo(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      workplaceId: warehouse.id,
      qualification: 'Stivuitorist',
    });
  });

  it('refuses a commute duration outside 1 to 600 minutes before contacting the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await fillRequired(user);
    await user.type(screen.getByTestId('employee-commute-minutes'), '601');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('commuteMinutes-error')).textContent).toBe(
      'Durata trebuie să fie între 1 și 600 de minute.'
    );
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('shows the sheet fields on the employee page', async () => {
    mockApi({ detail: () => Response.json({ employee: withSheet }) });
    mountApp(authFixture(makeSession()).client, detailPage);
    const section = await screen.findByTestId('employee-sheet-data');
    const labels = [...section.querySelectorAll('dt')].map((term) => term.textContent);
    expect(labels).toEqual(['Calificarea', 'Studiile', 'Autorizații', 'Traseul de deplasare']);
    expect(
      within(screen.getByTestId('employee-employment')).getByText('Atelier Str. Fabricii 3')
    ).toBeTruthy();
    expect(within(section).getByText('Sudor autorizat')).toBeTruthy();
    expect(within(section).getByText('Școala profesională')).toBeTruthy();
    expect(within(section).getByText('ISCIR')).toBeTruthy();
    expect(screen.getByText('Str. Florilor 9, Timișoara')).toBeTruthy();
    expect(within(section).getByText('Pe jos, Transport public')).toBeTruthy();
    expect(
      within(section).getByText('Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24')
    ).toBeTruthy();
    expect(within(section).getByText('35 de minute')).toBeTruthy();
  });

  it('prints a dash for each empty sheet field', async () => {
    mockApi({ detail: () => Response.json({ employee: createdEmployee }) });
    mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-page');
    const value = (label: string) =>
      screen.getByText(label, { selector: 'dt span' }).closest('dt')?.nextElementSibling
        ?.textContent;
    for (const label of [
      'Punct de lucru',
      'Adresa unde locuiește',
      'Calificarea',
      'Studiile',
      'Autorizații',
      'Traseul de deplasare',
    ]) {
      expect(value(label)).toBe('—');
    }
  });

  it('keeps an unchanged workplace and position out of the edit, even archived ones, and sends a new workplace', async () => {
    mockApi({
      detail: () => Response.json({ employee: withSheet }),
      workplaces: () => Response.json({ items: [registeredOffice] }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId('employee-workplace').textContent).toContain(
        'Atelier Str. Fabricii 3'
      )
    );
    expect(screen.getByTestId('employee-workplace').textContent).toContain('Arhivat');
    expect(screen.getByTestId<HTMLInputElement>('employee-commute-minutes').value).toBe('35');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employee-page');
    const unchanged = JSON.parse(String(requestsTo(detailPath, 'PUT')[0]![1]?.body)) as Record<
      string,
      unknown
    >;
    expect(unchanged).not.toHaveProperty('workplaceId');
    expect(unchanged).not.toHaveProperty('jobPositionId');
    expect(unchanged).toMatchObject({ qualification: 'Sudor autorizat', commuteMinutes: 35 });

    await user.click(screen.getByTestId('employee-employment-edit'));
    await screen.findByTestId('edit-employee-page');
    await waitFor(() => expect(runtime.router.state.location.search).not.toHaveProperty('focus'));
    await user.click(screen.getByTestId('employee-workplace'));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: /Sediu/ })
    );
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employee-page');
    expect(JSON.parse(String(requestsTo(detailPath, 'PUT')[1]![1]?.body))).toMatchObject({
      workplaceId: registeredOffice.id,
    });
  });

  it('focuses the route a training sheet asked for, and drops the request from the address', async () => {
    mockApi({ detail: () => Response.json({ employee: createdEmployee }) });
    const runtime = mountApp(authFixture(makeSession()).client, `${editPage}?focus=commute-route`);
    const route = await screen.findByTestId('employee-commute-route');
    await waitFor(() => expect(document.activeElement).toBe(route));
    expect(route.hasAttribute('data-pointed')).toBe(true);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('focuses the workplace picker once the workplaces are in', async () => {
    mockApi({
      detail: () => Response.json({ employee: createdEmployee }),
      workplaces: () => Response.json({ items: [registeredOffice, workshop] }),
    });
    mountApp(authFixture(makeSession()).client, `${editPage}?focus=workplace`);
    const picker = await screen.findByTestId<HTMLButtonElement>('employee-workplace');
    await waitFor(() => expect(document.activeElement).toBe(picker));
    expect(picker.disabled).toBe(false);
  });

  it('offers the way back to the training tab after a save made for its sheet', async () => {
    startWayBack({
      userId: 'user-one',
      clientId,
      to: 'training-sheet',
      employeeId: sampleEmployee.id,
      domain: 'su',
    });
    mockApi({ detail: () => Response.json({ employee: createdEmployee }) });
    const runtime = mountApp(authFixture(makeSession()).client, `${editPage}?focus=commute-route`);
    const user = userEvent.setup();
    const route = await screen.findByTestId('employee-commute-route');
    await waitFor(() => expect(document.activeElement).toBe(route));
    await user.type(route, 'Str. Lungă 5 – Str. Fabricii 3, pe jos');
    await user.click(screen.getByTestId('employee-submit'));

    expect(await screen.findByText('Datele lucrătorului au fost salvate.')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Înapoi la fișă' }));
    await screen.findByTestId('employee-training-tab');
    expect(runtime.router.state.location.pathname).toBe(`${detailPage}/instruire/su`);
  });

  it('puts a workplace the API refuses on its field', async () => {
    mockApi({
      workplaces: () => Response.json({ items: [registeredOffice] }),
      create: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'This workplace is not an active workplace of this client.',
            issues: [
              {
                path: 'workplaceId',
                message: 'This workplace is not an active workplace of this client.',
              },
            ],
          },
          { status: 400 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId('employee-workplace').textContent).toContain('Sediu')
    );
    await fillRequired(user);
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('workplaceId-error')).textContent).toBe(
      'Punctul de lucru ales nu mai este activ la acest client. Alege altul.'
    );
    expect(requestsTo(`/clients/${clientId}/workplaces`).length).toBeGreaterThan(1);
  });
});

describe('employee status changes', () => {
  const statusPath = `${employeesPath}/${sampleEmployee.id}/status`;

  it('marks a leaver with a date and moves the row to former employees', async () => {
    let status = 'active';
    mockApi({
      list: (_, url) =>
        Response.json(
          page(
            (url.searchParams.get('status') ?? 'active') === status
              ? [{ ...sampleEmployee, status }]
              : []
          )
        ),
      status: (init) => {
        status = JSON.parse(String(init?.body)).status;
        return Response.json({
          employee: { ...createdEmployee, status, terminatedAt: '2026-09-10' },
        });
      },
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    expect((await screen.findByTestId('employees-terminate')).textContent).toBe(
      'Trece la foști lucrători…'
    );
    await user.click(screen.getByTestId('employees-terminate'));
    const dialog = await screen.findByTestId('employee-status-dialog');
    expect(within(dialog).getByText('Popescu Ion')).toBeTruthy();
    const date = screen.getByTestId('employee-terminated-at') as HTMLInputElement;
    expect(date.value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    setDate(date, '2026-09-10');
    await user.click(screen.getByTestId('employee-status-confirm'));
    await screen.findByTestId('employees-empty');
    expect(screen.queryByTestId('employee-status-dialog')).toBeNull();
    const [, init] = requestsTo(statusPath, 'PATCH')[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      status: 'terminated',
      terminatedAt: '2026-09-10',
    });
    await user.click(screen.getByTestId('employees-filter-terminated'));
    await screen.findByTestId('employees-row');
    expect(
      await screen.findByText(fullText('Popescu Ion a trecut la foști lucrători.'))
    ).toBeTruthy();
  });

  it('picks the leave date from the calendar', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-terminate'));
    const date = (await screen.findByTestId('employee-terminated-at')) as HTMLInputElement;
    await user.click(screen.getByTestId('employee-terminated-at-calendar'));
    const grid = await screen.findByRole('grid');
    // The calendar opens on the current month; day buttons are labelled like
    // "marți, 15 septembrie 2026". Pick the 15th.
    await user.click(within(grid).getByRole('button', { name: /, 15 [a-zăâîșț]+ \d{4}/ }));
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    expect(date.value).toBe(`15.${month}.${now.getFullYear()}`);
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('refuses a leave date before the hire date without calling the API', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-terminate'));
    setDate(await screen.findByTestId('employee-terminated-at'), '2019-12-31');
    await user.click(screen.getByTestId('employee-status-confirm'));
    expect((await screen.findByTestId('terminatedAt-error')).textContent).toContain(
      'înaintea datei angajării'
    );
    expect(requestsTo(statusPath, 'PATCH')).toHaveLength(0);
  });

  it('shows the API field issue and a generic failure in the dialog', async () => {
    let attempts = 0;
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      status: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json(
              {
                error: 'validation_error',
                message: 'invalid',
                issues: [{ path: 'terminatedAt', message: 'before hire' }],
              },
              { status: 400 }
            )
          : Response.json({ error: 'internal_error', message: 'boom' }, { status: 500 });
      },
    });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-terminate'));
    await screen.findByTestId('employee-terminated-at');
    await user.click(screen.getByTestId('employee-status-confirm'));
    await screen.findByTestId('terminatedAt-error');
    await user.click(screen.getByTestId('employee-status-confirm'));
    expect((await screen.findByTestId('employee-status-error')).textContent).toContain(
      'Nu am putut salva'
    );
    expect(screen.getByTestId('employee-status-dialog')).toBeTruthy();
  });

  it('reactivates a former employee from the former employees tab', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          page(
            url.searchParams.get('status') === 'terminated'
              ? [{ ...sampleEmployee, status: 'terminated', terminatedAt: '2025-12-31' }]
              : []
          )
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?status=terminated`);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    expect(screen.queryByTestId('employees-terminate')).toBeNull();
    expect((await screen.findByTestId('employees-reactivate')).textContent).toBe(
      'Anulează trecerea la foști…'
    );
    await user.click(screen.getByTestId('employees-reactivate'));
    const dialog = await screen.findByTestId('employee-status-dialog');
    expect(within(dialog).queryByTestId('employee-terminated-at')).toBeNull();
    await user.click(screen.getByTestId('employee-status-confirm'));
    await waitFor(() => expect(screen.queryByTestId('employee-status-dialog')).toBeNull());
    expect(JSON.parse(String(requestsTo(statusPath, 'PATCH')[0]![1]?.body))).toEqual({
      status: 'active',
    });
    expect(
      await screen.findByText(fullText('Popescu Ion este din nou lucrător actual.'))
    ).toBeTruthy();
  });

  it('explains a reactivation refused because a current employee has the CNP', async () => {
    mockApi({
      list: () =>
        Response.json(
          page([{ ...sampleEmployee, status: 'terminated', terminatedAt: '2025-12-31' }])
        ),
      status: () =>
        Response.json(
          { error: 'conflict', message: 'Duplicate.', reason: 'employee_cnp_taken' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?status=terminated`);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-reactivate'));
    await user.click(await screen.findByTestId('employee-status-confirm'));
    expect((await screen.findByTestId('employee-status-error')).textContent).toContain(
      'un lucrător actual al clientului are același CNP'
    );
    expect(screen.getByTestId('employee-status-dialog')).toBeTruthy();
  });

  it('explains a reactivation refused because a current employee has the number', async () => {
    mockApi({
      list: () =>
        Response.json(
          page([{ ...sampleEmployee, status: 'terminated', terminatedAt: '2025-12-31' }])
        ),
      status: () =>
        Response.json(
          { error: 'conflict', message: 'Duplicate.', reason: 'employee_number_taken' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?status=terminated`);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-reactivate'));
    await user.click(await screen.findByTestId('employee-status-confirm'));
    expect((await screen.findByTestId('employee-status-error')).textContent).toContain(
      'un lucrător actual al clientului are aceeași marcă'
    );
    expect(screen.getByTestId('employee-status-dialog')).toBeTruthy();
  });
});

describe('employee detail', () => {
  const detailPage = `${employeesPage}/${sampleEmployee.id}`;
  const fullEmployee = {
    ...createdEmployee,
    birthPlace: 'Cluj-Napoca',
    homeAddress: 'Str. Lungă 5, Cluj-Napoca',
    bloodGroup: 'A(II)',
    rhFactor: '+',
    notes: 'Lucrează în schimbul de noapte.',
  };

  it('opens from the list and shows the record without the client chrome', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      detail: () => Response.json({ employee: fullEmployee }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    await userEvent.setup().click(await screen.findByTestId('employees-open'));
    await screen.findByTestId('employee-page');
    expect(runtime.router.state.location.pathname).toBe(detailPage);
    expect(screen.queryByTestId('client-page')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Popescu Ion' })).toBeTruthy();
    expect(screen.getByTestId('employee-status').textContent).toBe('Lucrător actual');
    expect(screen.getByTestId('employee-header-client').textContent).toBe('OMV PETROM SA');
    const back = screen.getByRole('link', { name: 'Înapoi' });
    expect(back.getAttribute('href')).toBe(employeesPage);
    expect(screen.getByText('A-17')).toBeTruthy();
    expect(screen.getByText('1 mar. 2020')).toBeTruthy();
    expect(screen.getByText('1 ian. 1990')).toBeTruthy();
    expect(screen.getByText('Str. Lungă 5, Cluj-Napoca')).toBeTruthy();
    expect(screen.getByText('A(II) Rh +')).toBeTruthy();
    expect(screen.getByText('Lucrează în schimbul de noapte.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ion.popescu@example.com' }).getAttribute('href')).toBe(
      'mailto:ion.popescu@example.com'
    );
    expect(screen.getByRole('link', { name: '0721 000 000' }).getAttribute('href')).toBe(
      'tel:0721000000'
    );
  });

  it('goes back to the list it was opened from, search included, after moving between its tabs', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      detail: () => Response.json({ employee: fullEmployee }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=Popescu`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('employees-open'));
    await screen.findByTestId('employee-page');
    const tab = (name: string) =>
      screen.getAllByTestId('employee-section').find((link) => link.textContent === name)!;
    await user.click(tab('Instruire SSM'));
    await waitFor(() => expect(tab('Instruire SSM').getAttribute('aria-current')).toBe('page'));
    await user.click(tab('Date'));
    await screen.findByTestId('employee-page');

    await user.click(screen.getByRole('link', { name: 'Înapoi' }));
    await screen.findByTestId('employees-row');
    expect(runtime.router.state.location.pathname).toBe(employeesPage);
    expect(runtime.router.state.location.search).toEqual({ q: 'Popescu' });
  });

  it('keeps the way back to the list through an edit that is given up', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      detail: () => Response.json({ employee: fullEmployee }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=Popescu`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('employees-open'));
    await screen.findByTestId('employee-page');
    await user.click(screen.getByTestId('employee-identity-edit'));
    await screen.findByTestId('edit-employee-page');
    await waitFor(() => expect(runtime.router.state.location.search).not.toHaveProperty('focus'));
    expect(screen.getByRole('link', { name: 'Înapoi' }).getAttribute('href')).toBe(detailPage);

    await user.click(screen.getByRole('link', { name: 'Renunță' }));
    await screen.findByTestId('employee-page');
    await user.click(screen.getByRole('link', { name: 'Înapoi' }));
    await screen.findByTestId('employees-row');
    expect(runtime.router.state.location.search).toEqual({ q: 'Popescu' });
  });

  it('goes up to the client’s workers when opened from a link', async () => {
    mockApi({ detail: () => Response.json({ employee: fullEmployee }) });
    const runtime = mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-page');
    const user = userEvent.setup();
    await user.click(
      screen.getAllByTestId('employee-section').find((link) => link.textContent === 'Documente')!
    );
    const back = screen.getByRole('link', { name: 'Înapoi la lucrători' });
    expect(back.getAttribute('href')).toBe(employeesPage);
    await user.click(back);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(employeesPage));
    expect(runtime.router.state.location.search).toEqual({});
  });

  it('keeps the CNP masked until asked and hides it again', async () => {
    mockApi({ detail: () => Response.json({ employee: fullEmployee }) });
    mountApp(authFixture(makeSession()).client, detailPage);
    const user = userEvent.setup();
    const value = await screen.findByTestId('employee-cnp-value');
    expect(value.textContent).toBe('•••••••••0127');
    expect(document.body.textContent).not.toContain('1900101400127');
    await user.click(screen.getByTestId('employee-cnp-toggle'));
    expect(value.textContent).toBe('1900101400127');
    expect(screen.getByTestId('employee-cnp-toggle').getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByTestId('employee-cnp-toggle'));
    expect(value.textContent).toBe('•••••••••0127');
  });

  it('shows dashes for missing optional data and no CNP control without a CNP', async () => {
    mockApi({
      detail: () =>
        Response.json({
          employee: { ...createdEmployee, cnp: null, email: null, phone: null, birthDate: null },
        }),
    });
    mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-page');
    expect(screen.queryByTestId('employee-cnp-toggle')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(5);
  });

  it('marks the leaver from the page and refreshes the record', async () => {
    let status = 'active';
    mockApi({
      detail: () =>
        Response.json({
          employee: {
            ...fullEmployee,
            status,
            terminatedAt: status === 'terminated' ? '2026-09-10' : null,
          },
        }),
      status: (init) => {
        status = JSON.parse(String(init?.body)).status;
        return Response.json({ employee: { ...fullEmployee, status, terminatedAt: '2026-09-10' } });
      },
    });
    mountApp(authFixture(makeSession()).client, detailPage);
    const user = userEvent.setup();
    await screen.findByTestId('employee-page');
    await user.click(screen.getByTestId('employee-status-action'));
    setDate(await screen.findByTestId('employee-terminated-at'), '2026-09-10');
    await user.click(screen.getByTestId('employee-status-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('employee-status').textContent).toBe('Fost lucrător')
    );
    expect(screen.getByText('10 sept. 2026')).toBeTruthy();
    expect(screen.getByText(/^vechime la plecare:/)).toBeTruthy();
    expect(screen.getByTestId('employee-status-action').textContent).toBe(
      'Anulează trecerea la foști…'
    );
  });

  it('shows a not-found screen for an employee outside the client', async () => {
    mockApi({
      detail: () => Response.json({ error: 'not_found', message: 'none' }, { status: 404 }),
    });
    mountApp(authFixture(makeSession()).client, detailPage);
    await screen.findByTestId('employee-not-found');
  });
});

describe('job positions on employees (ADR 006)', () => {
  const fillRequired = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
  };

  it('lists employees by the post they fill', async () => {
    mockApi({
      list: () =>
        Response.json(
          page([
            {
              ...sampleEmployee,
              jobPosition: { ...sampleEmployee.jobPosition, name: 'Sudor autorizat' },
            },
          ])
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?sort=jobPosition&order=desc`);
    const row = await screen.findByTestId('employees-row');
    expect(row.textContent).toContain('Sudor autorizat');
    expect(screen.getByRole('columnheader', { name: /Post de lucru/ })).toBeTruthy();
    const [input] = requestsTo(employeesPath, 'GET')[0]!;
    expect(new URL(String(input)).searchParams.get('sort')).toBe('jobPosition');
  });

  it('adds a post the client lacks from the picker, in the dialog of the section, and hires into it', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await fillRequired(user);

    // With a post already chosen the form is complete, so a submit that leaked from the dialog
    // below would save the employee.
    await pickPosition(user, 'sud', /Sudor/);

    // The row is there before anything is typed, and stays when nothing matches.
    await user.click(await screen.findByTestId('employee-job-position'));
    expect(await screen.findByTestId('employee-job-position-add')).toBeTruthy();
    await user.type(screen.getByTestId('employee-job-position-search'), 'Electrician');
    await user.click(screen.getByTestId('employee-job-position-add'));

    // The same dialog as "Adaugă un post", starting from what was typed, with its category.
    const dialog = await screen.findByTestId('job-position-dialog');
    expect(within(dialog).getByTestId<HTMLInputElement>('job-position-name').value).toBe(
      'Electrician'
    );
    await user.selectOptions(
      within(dialog).getByTestId('job-position-category'),
      'technical_administrative'
    );
    await user.click(within(dialog).getByTestId('job-position-save'));
    await waitFor(() => expect(screen.queryByTestId('job-position-dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('employee-job-position'))
    );
    expect(screen.getByTestId<HTMLInputElement>('employee-job-title').value).toBe('Electrician');
    // Saving the post did not submit the form it was opened from.
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);

    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    const [, position] = requestsTo(positionsPath, 'POST')[0]!;
    expect(JSON.parse(String(position?.body))).toMatchObject({
      name: 'Electrician',
      staffCategory: 'technical_administrative',
    });
    const [, employee] = requestsTo(employeesPath, 'POST')[0]!;
    expect(JSON.parse(String(employee?.body))).toMatchObject({
      jobPositionId: newPositionId,
      jobTitle: 'Electrician',
    });
  });

  it('keeps a contract title the person typed, whatever post is chosen after', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await fillRequired(user);
    await user.type(screen.getByTestId('employee-job-title'), 'Lăcătuș mecanic');
    await pickPosition(user, 'sud', /Sudor/);
    expect(screen.getByTestId<HTMLInputElement>('employee-job-title').value).toBe(
      'Lăcătuș mecanic'
    );
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    const [, employee] = requestsTo(employeesPath, 'POST')[0]!;
    expect(JSON.parse(String(employee?.body))).toMatchObject({
      jobPositionId: sampleEmployee.jobPosition.id,
      jobTitle: 'Lăcătuș mecanic',
    });
    expect(requestsTo(positionsPath, 'POST')).toHaveLength(0);
  });

  it('asks for a post before saving', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPage}/nou`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await fillRequired(user);
    await user.type(screen.getByTestId('employee-job-title'), 'Sudor');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('jobPosition-error')).textContent).toContain(
      'Alege postul de lucru'
    );
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('shows the post and the contract title apart, and moves the person to another post', async () => {
    const helper = { ...welderPosition, id: newPositionId, name: 'Ajutor sudor', employeeCount: 0 };
    mockApi({
      detail: () =>
        Response.json({ employee: { ...createdEmployee, jobTitle: 'Muncitor calificat' } }),
      positions: () => Response.json({ items: [helper, welderPosition] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/${sampleEmployee.id}`);
    const user = userEvent.setup();
    expect((await screen.findByTestId('employee-job-position')).textContent).toBe('Sudor');
    expect(screen.getByText('Muncitor calificat')).toBeTruthy();

    await user.click(screen.getByTestId('employee-job-position-change'));
    const dialog = await screen.findByTestId('employee-job-position-dialog');
    expect(within(dialog).getByTestId<HTMLInputElement>('employee-contract-title').value).toBe(
      'Muncitor calificat'
    );
    await pickPosition(user, 'ajut', /Ajutor sudor/, 'employee-position');
    await user.click(screen.getByTestId('employee-job-position-save'));

    await waitFor(() =>
      expect(
        requestsTo(`${employeesPath}/${sampleEmployee.id}/job-position`, 'PATCH')
      ).toHaveLength(1)
    );
    const [, init] = requestsTo(`${employeesPath}/${sampleEmployee.id}/job-position`, 'PATCH')[0]!;
    // The contract did not change, so its title is not sent.
    expect(JSON.parse(String(init?.body))).toEqual({ jobPositionId: newPositionId });
    expect(await screen.findByText('Postul de lucru a fost schimbat.')).toBeTruthy();
  });
  it('moves a contract title that only repeats the post along with the post', async () => {
    const helper = { ...welderPosition, id: newPositionId, name: 'Ajutor sudor', employeeCount: 0 };
    mockApi({
      detail: () => Response.json({ employee: createdEmployee }),
      positions: () => Response.json({ items: [helper, welderPosition] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPage}/${sampleEmployee.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('employee-job-position-change'));
    const dialog = await screen.findByTestId('employee-job-position-dialog');
    await pickPosition(user, 'ajut', /Ajutor sudor/, 'employee-position');
    expect(within(dialog).getByTestId<HTMLInputElement>('employee-contract-title').value).toBe(
      'Ajutor sudor'
    );
    await user.click(screen.getByTestId('employee-job-position-save'));

    await waitFor(() =>
      expect(
        requestsTo(`${employeesPath}/${sampleEmployee.id}/job-position`, 'PATCH')
      ).toHaveLength(1)
    );
    const [, init] = requestsTo(`${employeesPath}/${sampleEmployee.id}/job-position`, 'PATCH')[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      jobPositionId: newPositionId,
      jobTitle: 'Ajutor sudor',
    });
  });
});

describe('employee editing', () => {
  const editPage = `${employeesPage}/${sampleEmployee.id}/editare`;
  const stored = {
    ...sampleEmployee,
    cnp: '1900101400127',
    birthDate: '1990-01-01',
    birthPlace: null,
    homeAddress: null,
    residenceAddress: null,
    bloodGroup: null,
    rhFactor: null,
    notes: null,
    archivedAt: null,
    commuteMeans: [],
    commuteMeansOther: null,
    jobTitle: 'Muncitor calificat',
  };

  it('is also one click away from the list, in the row menu', async () => {
    mockApi({
      list: () => Response.json(page([sampleEmployee])),
      detail: () => Response.json({ employee: stored }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findByTestId('employees-row');
    await user.click(screen.getByTestId('employees-row-menu'));
    await user.click(await screen.findByTestId('employees-edit'));
    await screen.findByTestId('edit-employee-page');
    expect(runtime.router.state.location.pathname).toBe(editPage);
  });

  it('opens from the employee page with what was entered, contract title and post apart', async () => {
    mockApi({ detail: () => Response.json({ employee: stored }) });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${employeesPage}/${sampleEmployee.id}`
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('employee-identity-edit'));
    await screen.findByTestId('edit-employee-page');
    expect(runtime.router.state.location.pathname).toBe(editPage);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Modifică');
    expect(screen.getByTestId<HTMLInputElement>('employee-last-name').value).toBe(stored.lastName);
    expect(screen.getByTestId<HTMLInputElement>('employee-cnp').value).toBe('1900101400127');
    expect(screen.getByTestId<HTMLInputElement>('employee-job-title').value).toBe(
      'Muncitor calificat'
    );
    expect((await screen.findByTestId('employee-job-position')).textContent).toContain('Sudor');
  });

  it('saves the correction, keeps the post, and returns to the employee page', async () => {
    mockApi({ detail: () => Response.json({ employee: stored }) });
    const runtime = mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    const phone = screen.getByTestId('employee-phone');
    await user.clear(phone);
    await user.selectOptions(screen.getByTestId('employee-phone-country'), 'IT');
    await user.type(phone, '333 123 4567');
    const lastName = screen.getByTestId('employee-last-name');
    await user.clear(lastName);
    await user.type(lastName, 'Popescu-Ionescu');
    await user.click(screen.getByTestId('employee-submit'));

    await screen.findByTestId('employee-page');
    expect(runtime.router.state.location.pathname).toBe(`${employeesPage}/${sampleEmployee.id}`);
    expect(await screen.findByText('Datele lucrătorului au fost salvate.')).toBeTruthy();
    const [, init] = requestsTo(`${employeesPath}/${sampleEmployee.id}`, 'PUT')[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      lastName: 'Popescu-Ionescu',
      phone: '+393331234567',
      cnp: '1900101400127',
      jobTitle: 'Muncitor calificat',
    });
    expect(body).not.toHaveProperty('jobPositionId');
    expect(requestsTo(employeesPath, 'POST')).toHaveLength(0);
  });

  it('keeps none of the typed personal data across the reload a refused save asks for', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json({ error: 'client_outdated', message: 'Reload.' }, { status: 426 }),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), '-Ionescu');
    await user.type(screen.getByTestId('employee-job-title'), ' de nivel 2');
    await user.click(screen.getByTestId('employee-submit'));
    expect(await screen.findByTestId('reload-dialog-unsaved')).toBeTruthy();
    expect(screen.queryByTestId('reload-dialog-kept')).toBeNull();
    expect(sessionStorage.getItem('ssm-usor.kept-text')).toBeNull();

    disposeRuntimes();
    cleanup();
    act(() => resetReloadDialog());
    mockApi({ detail: () => Response.json({ employee: stored }) });
    mountApp(authFixture(makeSession()).client, editPage);
    await screen.findByTestId('edit-employee-page');
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('employee-last-name').value).toBe(stored.lastName)
    );
    expect(screen.getByTestId<HTMLInputElement>('employee-job-title').value).toBe(stored.jobTitle);
    expect(screen.queryByText('Am păstrat ce ai scris înainte de reîncărcare.')).toBeNull();
  });

  it('puts a CNP another employee has on the field, and an API issue where it belongs', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json(
          { error: 'conflict', message: 'Duplicate.', reason: 'employee_cnp_taken' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await user.click(screen.getByTestId('employee-submit'));
    const taken = await screen.findByTestId('cnp-error');
    expect(taken.textContent).toContain('CNP');
    expect(
      within(taken).getByRole('link', { name: 'De ce?' }).getAttribute('data-help-topic')
    ).toBe('angajati.duplicat');
    expect(screen.getByTestId('edit-employee-page')).toBeTruthy();
  });

  it('puts an employee number another employee has on its field', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json(
          { error: 'conflict', message: 'Duplicate.', reason: 'employee_number_taken' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('employeeNumber-error')).textContent).toContain(
      'Un lucrător actual al clientului are deja această marcă.'
    );
    expect(screen.queryByTestId('cnp-error')).toBeNull();
  });

  it('says the client is archived when a stale page saves a worker of it', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json(
          { error: 'conflict', message: 'Archived.', reason: 'client_archived' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('employee-form-error')).textContent).toContain(
      'lucrătorii lui nu se mai schimbă'
    );
  });

  it('shows the hire date the API refuses in Romanian, on its field', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'The hire date cannot follow the leave date.',
            issues: [{ path: 'hiredAt', message: 'The hire date cannot follow the leave date.' }],
          },
          { status: 400 }
        ),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('hiredAt-error')).textContent).toBe(
      'Data angajării nu poate fi după data încetării.'
    );
    expect(screen.queryByTestId('employee-form-error')).toBeNull();
  });

  it('puts a position archived in the meantime on the post field', async () => {
    mockApi({
      detail: () => Response.json({ employee: stored }),
      update: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'This job position does not exist under this client.',
            issues: [
              {
                path: 'jobPositionId',
                message: 'This job position does not exist under this client.',
              },
            ],
          },
          { status: 400 }
        ),
    });
    mountApp(authFixture(makeSession()).client, editPage);
    const user = userEvent.setup();
    await screen.findByTestId('edit-employee-page');
    await screen.findByText(/Sudor/);
    const positionLoads = requestsTo(positionsPath).length;
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('jobPosition-error')).textContent).toBe(
      'Postul ales nu mai există la acest client. Alege altul.'
    );
    expect(screen.queryByTestId('employee-form-error')).toBeNull();
    await waitFor(() => expect(requestsTo(positionsPath).length).toBeGreaterThan(positionLoads));
  });
});

describe('what a session replay of the employees shows', () => {
  const detailPage = `${employeesPage}/${sampleEmployee.id}`;
  const recorded = {
    ...createdEmployee,
    homeAddress: 'Str. Mihai Eminescu nr. 12, ap. 3',
    residenceAddress: 'Bl. A4, sc. B, Iași',
    workplace: { id: workshop.id, name: workshop.name },
    commuteRoute: 'Str. Lungă 5 – autobuzul 24',
    commuteMeans: ['public_transport'],
    commuteMeansOther: 'Trotinetă',
  };

  it('masks the name and marca in a list row, and shows the post', async () => {
    mockApi({ list: () => Response.json(page([sampleEmployee])) });
    mountApp(authFixture(makeSession()).client, employeesPage);
    const row = await screen.findByTestId('employees-row');

    expect(replayedText(within(row).getByText('Popescu Ion'))).toBe('******* ***');
    expect(replayedText(within(row).getByText('Marca A-17'))).not.toContain('A-17');
    expect(replayedText(within(row).getByText('Sudor'))).toBe('Sudor');
  });

  it('masks the person on their page, keeps the shape of the addresses and shows the work', async () => {
    mockApi({ detail: () => Response.json({ employee: recorded }) });
    mountApp(authFixture(makeSession()).client, detailPage);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Popescu Ion' });

    expect(replayedText(heading)).toBe('******* ***');
    expect(replayedText(screen.getByTestId('employee-header-client'))).toBe('OMV PETROM SA');
    expect(replayedText(screen.getByTestId('employee-cnp-value'))).not.toMatch(/\d/);
    expect(replayedText(screen.getByText('1 ian. 1990'))).toBe('* **** ****');
    expect(replayedText(screen.getByText('Str. Mihai Eminescu nr. 12, ap. 3'))).toBe(
      'Str. Xxxxx Xxxxxxxx nr. 00, ap. 0'
    );
    expect(replayedText(screen.getByText('Str. Lungă 5 – autobuzul 24'))).toBe(
      'Str. Xxxxx 0 – xxxxxxxxx 00'
    );
    expect(replayedText(screen.getByText('Trotinetă'))).toBe('Xxxxxxxxx');
    expect(replayedText(screen.getByTestId('employee-job-position'))).toBe('Sudor');
    expect(replayedText(screen.getByText('Atelier Str. Fabricii 3'))).toBe(
      'Atelier Str. Fabricii 3'
    );
    expect(replayedText(screen.getByText('Post de lucru', { selector: 'dt span' }))).toBe(
      'Post de lucru'
    );
  });

  it('masks what is typed about the person and keeps the shape of the addresses', async () => {
    mockApi({ detail: () => Response.json({ employee: recorded }) });
    mountApp(authFixture(makeSession()).client, `${detailPage}/editare`);
    const lastName = await screen.findByTestId<HTMLInputElement>('employee-last-name');

    expect(replayedInput(lastName)).toBe('*******');
    expect(replayedInput(screen.getByTestId<HTMLInputElement>('employee-cnp'))).toBe(
      '*************'
    );
    expect(replayedInput(screen.getByTestId<HTMLInputElement>('employee-home-address'))).toBe(
      'Str. Xxxxx Xxxxxxxx nr. 00, ap. 0'
    );
    expect(replayedInput(screen.getByTestId<HTMLTextAreaElement>('employee-commute-route'))).toBe(
      'Str. Xxxxx 0 – xxxxxxxxx 00'
    );
    expect(replayedText(screen.getByRole('heading', { level: 1 }))).toBe('Modifică: ******* ***');
  });
});

describe("the worker page's header and tabs", () => {
  const detailPage = `${employeesPage}/${sampleEmployee.id}`;
  const participantPath = `${employeesPath}/${sampleEmployee.id}/participant`;
  const archivedClient = { ...sampleClient, archivedAt: '2026-01-01T00:00:00+00:00' };
  const formerEmployee = { ...createdEmployee, status: 'terminated', terminatedAt: '2026-09-30' };

  const invitation = {
    id: '3f2c1b0a-9e8d-4c7b-a6f5-e4d3c2b1a090',
    clientId,
    kind: 'employee',
    employeeId: sampleEmployee.id,
    fullName: 'Popescu Ion',
    channel: 'email',
    address: 'ion.popescu@example.com',
    status: 'open',
    lastSentAt: '2026-10-17T09:00:00.000Z',
    resendableAt: '2026-10-17T09:10:00.000Z',
    expiresAt: '2026-11-16T09:00:00.000Z',
    createdAt: '2026-10-17T09:00:00.000Z',
  };
  const participant = {
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    clientId,
    kind: 'employee',
    employeeId: sampleEmployee.id,
    fullName: 'Popescu Ion',
    channel: 'email',
    address: 'ion.popescu@example.com',
    createdAt: '2026-10-10T09:00:00.000Z',
    revokedAt: null,
    noticeVersion: null,
    language: null,
  };
  const agreement = (overrides: Record<string, unknown>) => ({
    state: 'generated',
    generatedAt: '2026-10-18T09:00:00.000Z',
    signedAt: null,
    clientFileId: null,
    employeeSignedAt: null,
    employerSignedAt: null,
    awaiting: 'employee',
    ...overrides,
  });

  const access = (state: { participant?: unknown; invitation?: unknown }) => () =>
    Response.json({ participant: null, invitation: null, ...state });
  const agreementState = (value: unknown) => () =>
    Response.json({ agreement: value, unavailable: null });

  // The Documente tab reads nothing about the portal, so every read here is the header's.
  async function openWorker(routes: Parameters<typeof mockApi>[0] = {}) {
    mockApi(routes);
    const runtime = mountApp(authFixture(makeSession()).client, `${detailPage}/documente`);
    await screen.findByTestId('employee-layout');
    return runtime;
  }

  const portalTab = () =>
    screen.getAllByTestId('employee-section').find((tab) => tab.textContent?.startsWith('Portal'))!;

  it('links the post and the client, and marks a current worker in green', async () => {
    await openWorker();
    const position = screen.getByTestId('employee-header-position');
    expect(position.textContent).toBe('Sudor');
    expect(position.getAttribute('href')).toBe(
      `/clienti/${clientId}/posturi/${sampleEmployee.jobPosition.id}`
    );
    expect(screen.getByTestId('employee-header-client').getAttribute('href')).toBe(employeesPage);
    const status = screen.getByTestId('employee-status');
    expect(status.textContent).toBe('Lucrător actual');
    expect(status.className).toContain('bg-success');
    expect(status.querySelector('svg')).toBeTruthy();
    const action = screen.getByTestId('employee-status-action');
    expect(action.textContent).toBe('Trece la foști lucrători…');
    expect(action.getAttribute('data-variant')).toBe('destructive-soft');
    expect(screen.queryByTestId('employee-client-archived')).toBeNull();
  });

  it('names an archived post without a link', async () => {
    await openWorker({
      detail: () =>
        Response.json({
          employee: {
            ...createdEmployee,
            jobPosition: { ...createdEmployee.jobPosition, archived: true },
          },
        }),
    });
    const position = screen.getByTestId('employee-header-position');
    expect(position.textContent).toBe('Sudor');
    expect(position.tagName).toBe('SPAN');
    expect(position.querySelector('svg')).toBeNull();
  });

  it('shows a former worker neutral, with the move undone from a grey button', async () => {
    await openWorker({ detail: () => Response.json({ employee: formerEmployee }) });
    const status = screen.getByTestId('employee-status');
    expect(status.textContent).toBe('Fost lucrător');
    expect(status.className).not.toContain('bg-success');
    expect(status.querySelector('svg')).toBeNull();
    const action = screen.getByTestId('employee-status-action');
    expect(action.textContent).toBe('Anulează trecerea la foști…');
    expect(action.getAttribute('data-variant')).toBe('secondary');
  });

  it('splits the worker into five tabs, Portal last, with the portal cards on it', async () => {
    const runtime = await openWorker();
    const user = userEvent.setup();
    expect(screen.getAllByTestId('employee-section').map((tab) => tab.textContent)).toEqual([
      'Date',
      'Instruire SSM',
      'Instruire SU',
      'Documente',
      'Portal',
    ]);
    await user.click(portalTab());
    await screen.findByTestId('employee-portal');
    expect(runtime.router.state.location.pathname).toBe(`${detailPage}/portal`);
    expect(portalTab().getAttribute('aria-current')).toBe('page');
    expect(await screen.findByTestId('employee-portal-card')).toBeTruthy();
    expect(await screen.findByTestId('signing-agreement-card')).toBeTruthy();
  });

  it('flags an unsigned agreement of a worker invited to the portal, and leads to the Portal tab', async () => {
    const runtime = await openWorker({
      participant: access({ invitation }),
      agreement: agreementState(null),
    });
    const user = userEvent.setup();
    const flag = await screen.findByTestId('employee-agreement-flag');
    expect(flag.textContent).toBe('Act adițional nesemnat');
    expect(flag.getAttribute('data-flag')).toBe('unsigned');
    expect(within(portalTab()).getByTestId('employee-portal-flag').textContent).toBe(
      ', actul adițional nu e semnat'
    );
    await user.click(flag);
    await screen.findByTestId('employee-portal');
    expect(runtime.router.state.location.pathname).toBe(`${detailPage}/portal`);
  });

  it('flags a downloaded agreement the worker has not signed yet', async () => {
    await openWorker({
      participant: access({ participant }),
      agreement: agreementState(agreement({})),
    });
    expect((await screen.findByTestId('employee-agreement-flag')).textContent).toBe(
      'Act adițional nesemnat'
    );
  });

  it('says the agreement waits for the employer once the worker signed it', async () => {
    await openWorker({
      participant: access({ participant }),
      agreement: agreementState(
        agreement({ employeeSignedAt: '2026-10-19T09:00:00.000Z', awaiting: 'employer' })
      ),
    });
    const flag = await screen.findByTestId('employee-agreement-flag');
    expect(flag.textContent).toBe('Act adițional așteaptă angajatorul');
    expect(within(portalTab()).getByTestId('employee-portal-flag').textContent).toBe(
      ', actul adițional așteaptă semnătura angajatorului'
    );
  });

  it.each([
    [
      'signed on paper',
      access({ participant }),
      agreementState(agreement({ state: 'signed_on_paper', signedAt: '2026-10-20' })),
    ],
    [
      'withdrawn for signing by hand',
      access({ participant }),
      agreementState(agreement({ state: 'withdrawn' })),
    ],
    ['of a worker not in the portal', access({}), agreementState(null)],
  ])('raises no flag for an agreement %s', async (_, participantRoute, agreementRoute) => {
    const runtime = await openWorker({ participant: participantRoute, agreement: agreementRoute });
    await waitFor(() => expect(requestsTo(participantPath)).toHaveLength(1));
    await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    expect(screen.queryByTestId('employee-agreement-flag')).toBeNull();
    expect(screen.queryByTestId('employee-portal-flag')).toBeNull();
  });

  it.each([
    [
      'access',
      () => Response.json({ error: 'internal_error', message: 'boom' }, { status: 500 }),
      agreementState(null),
    ],
    [
      'agreement',
      access({ invitation }),
      () => Response.json({ error: 'internal_error', message: 'boom' }, { status: 500 }),
    ],
  ])(
    'raises no flag and keeps the page when the %s read fails',
    async (_, participantRoute, agreementRoute) => {
      const runtime = await openWorker({
        participant: participantRoute,
        agreement: agreementRoute,
      });
      await waitFor(() => expect(requestsTo(participantPath)).toHaveLength(1));
      await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
      expect(screen.queryByTestId('employee-agreement-flag')).toBeNull();
      expect(screen.queryByTestId('employee-portal-flag')).toBeNull();
      expect(screen.getByTestId('employee-status').textContent).toBe('Lucrător actual');
      expect(screen.getAllByTestId('employee-section')).toHaveLength(5);
      expect(screen.getByTestId('employee-header-position').textContent).toBe('Sudor');
    }
  );

  it('asks nothing about the agreement for a former worker', async () => {
    const runtime = await openWorker({
      detail: () => Response.json({ employee: formerEmployee }),
      participant: access({ invitation }),
      agreement: agreementState(null),
    });
    await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    expect(requestsTo(participantPath)).toHaveLength(0);
    expect(screen.queryByTestId('employee-agreement-flag')).toBeNull();
  });

  it("says an archived client's worker is only read, with no status action or flag", async () => {
    const runtime = await openWorker({
      client: () => Response.json({ client: archivedClient }),
      participant: access({ invitation }),
      agreement: agreementState(null),
    });
    const notice = screen.getByTestId('employee-client-archived');
    expect(notice.textContent).toContain('Client arhivat');
    expect(notice.textContent).toContain(
      'Datele lucrătorului pot fi consultate și descărcate, dar nu modificate.'
    );
    expect(screen.getByTestId('employee-status').textContent).toBe('Lucrător actual');
    expect(screen.queryByTestId('employee-status-action')).toBeNull();
    await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    expect(requestsTo(participantPath)).toHaveLength(0);
    expect(screen.queryByTestId('employee-agreement-flag')).toBeNull();
  });

  it('asks for the end date when a worker moves to former workers', async () => {
    const user = userEvent.setup();
    await openWorker();
    await user.click(screen.getByTestId('employee-status-action'));
    const dialog = await screen.findByTestId('employee-status-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Trece la foști lucrători');
    expect(within(dialog).getByText('Data încetării')).toBeTruthy();
    const confirm = within(dialog).getByTestId('employee-status-confirm');
    expect(confirm.textContent).toBe('Trece la foști');
    expect(confirm.getAttribute('data-variant')).toBe('destructive-soft');
  });

  it('names the end date that undoing the move clears', async () => {
    const user = userEvent.setup();
    await openWorker({ detail: () => Response.json({ employee: formerEmployee }) });
    await user.click(screen.getByTestId('employee-status-action'));
    const dialog = await screen.findByTestId('employee-status-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Anulezi trecerea la foști?');
    expect(dialog.textContent).toContain(
      'Popescu Ion redevine lucrător actual și data încetării, 30 sept. 2026, se șterge.'
    );
    expect(within(dialog).getByTestId('employee-status-confirm').textContent).toBe(
      'Anulează trecerea'
    );
  });
});
