import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const sampleClient = {
  id: clientId,
  legalName: 'OMV PETROM SA',
  cui: '1590082',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: 'J1997008302407',
  countyCode: 'B',
  locality: 'Sector 1 Mun. București',
  addressLine: 'Str. Coralilor, nr. 22',
  legalRepresentativeName: null,
  declaredEmployeeCount: 120,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const sampleEmployee = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  lastName: 'Popescu',
  firstName: 'Ion',
  employeeNumber: 'A-17',
  email: 'ion.popescu@example.com',
  phone: '0721 000 000',
  jobTitle: 'Sudor',
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
};

const createdEmployee = {
  ...sampleEmployee,
  cnp: '1900101400127',
  birthDate: '1990-01-01',
  birthPlace: null,
  homeAddress: null,
  bloodGroup: null,
  rhFactor: null,
  notes: null,
  archivedAt: null,
};

const employeesPath = `/clients/${clientId}/employees`;

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(routes: Partial<Record<'me' | 'clients' | 'list' | 'create', Route>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/me') {
      return (
        routes.me?.(init, url) ??
        Response.json({ user: { id: 'user-one', email: 'review@example.test' } })
      );
    }
    if (url.pathname === '/clients' && method === 'GET') {
      return routes.clients?.(init, url) ?? Response.json({ clients: [sampleClient] });
    }
    if (url.pathname === employeesPath && method === 'GET') {
      return routes.list?.(init, url) ?? Response.json({ employees: [] });
    }
    if (url.pathname === employeesPath && method === 'POST') {
      return (
        routes.create?.(init, url) ?? Response.json({ employee: createdEmployee }, { status: 201 })
      );
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

const requests = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

// Date inputs accept an ISO value through a change event rather than typing.
const setDate = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('client employees list', () => {
  it('shows the client header, breadcrumb, and the employees with their status', async () => {
    mockApi({ list: () => Response.json({ employees: [sampleEmployee] }) });
    mountApp(authFixture(makeSession()).client, employeesPath);
    await screen.findByTestId('client-page');
    expect(screen.getByRole('heading', { level: 1, name: 'OMV PETROM SA' })).toBeTruthy();
    expect(screen.getByText('CUI RO1590082')).toBeTruthy();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).queryByText('Spațiul de lucru')).toBeNull();
    expect(within(breadcrumb).getByRole('link', { name: 'Clienți' })).toBeTruthy();
    expect(within(breadcrumb).getByRole('link', { name: 'OMV PETROM SA' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Angajați')).toBeTruthy();
    const row = await screen.findByTestId('employees-row');
    expect(within(row).getByText('Popescu Ion')).toBeTruthy();
    expect(within(row).getByText('Marca A-17')).toBeTruthy();
    expect(within(row).getByText('Sudor')).toBeTruthy();
    expect(within(row).getByText('ion.popescu@example.com')).toBeTruthy();
    expect(within(row).getByText('1 mar. 2020')).toBeTruthy();
    expect(within(row).getByText('Activ')).toBeTruthy();
    expect(screen.getByTestId('employees-count').textContent).toBe('1 angajat');
    const [url, init] = requests(employeesPath)[0]!;
    expect(new URL(String(url)).searchParams.has('status')).toBe(false);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });

  it('opens a client from the clients list', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    await userEvent.setup().click(await screen.findByTestId('clients-open'));
    await screen.findByTestId('employees-page');
    expect(runtime.router.state.location.pathname).toBe(employeesPath);
    // The client came from the cached list; it was not requested again.
    expect(requests('/clients')).toHaveLength(1);
  });

  it('redirects the bare client path to its employees', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, `/clients/${clientId}`);
    await screen.findByTestId('employees-page');
    expect(runtime.router.state.location.pathname).toBe(employeesPath);
  });

  it('filters leavers through the status search parameter', async () => {
    mockApi({
      list: (_, url) =>
        Response.json({
          employees:
            url.searchParams.get('status') === 'terminated'
              ? [{ ...sampleEmployee, status: 'terminated', terminatedAt: '2025-12-31' }]
              : [sampleEmployee],
        }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPath);
    await screen.findByTestId('employees-row');
    await userEvent.setup().click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({ status: 'terminated' });
    const row = await screen.findByText('Plecat');
    expect(row).toBeTruthy();
    expect(screen.getByText('până la 31 dec. 2025')).toBeTruthy();
    expect(screen.getByTestId('employees-filter-terminated').getAttribute('aria-current')).toBe(
      'page'
    );
    const [url] = requests(employeesPath)[1]!;
    expect(new URL(String(url)).searchParams.get('status')).toBe('terminated');
  });

  it('shows an empty state that leads to the creation page', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, employeesPath);
    await screen.findByTestId('employees-empty');
    expect(screen.getByTestId('employees-count').textContent).toBe('0 angajați');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Adaugă primul angajat' }));
    await screen.findByTestId('new-employee-page');
    expect(runtime.router.state.location.pathname).toBe(`${employeesPath}/new`);
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Angajați' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Angajat nou')).toBeTruthy();
  });

  it('explains a list failure and can retry', async () => {
    // A 4xx is not retried by the query client, so the error shows at once.
    let attempts = 0;
    mockApi({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ error: 'not_found', message: 'gone' }, { status: 404 })
          : Response.json({ employees: [sampleEmployee] });
      },
    });
    mountApp(authFixture(makeSession()).client, employeesPath);
    const error = await screen.findByTestId('employees-error');
    expect(error.textContent).toContain('Clientul nu mai există');
    await userEvent.setup().click(screen.getByTestId('employees-retry'));
    await screen.findByTestId('employees-row');
  });

  it('shows a not-found screen for a client outside the organization', async () => {
    mockApi({ clients: () => Response.json({ clients: [] }) });
    mountApp(authFixture(makeSession()).client, employeesPath);
    await screen.findByTestId('client-not-found');
    expect(requests(employeesPath)).toHaveLength(0);
  });

  it('explains a missing membership when the client cannot load', async () => {
    mockApi({
      clients: () =>
        Response.json({ error: 'forbidden', message: 'No membership' }, { status: 403 }),
    });
    mountApp(authFixture(makeSession()).client, employeesPath);
    const error = await screen.findByTestId('client-error');
    expect(error.textContent).toContain('nu face parte dintr-o organizație');
  });

  it('protects the employee pages', async () => {
    mockApi();
    const runtime = mountApp(authFixture().client, `${employeesPath}/new`);
    await screen.findByTestId('login-page');
    expect(runtime.router.state.location.pathname).toBe('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('employee creation', () => {
  it('validates required fields and formats before contacting the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPath}/new`);
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
    await user.type(screen.getByTestId('employee-phone'), 'call me');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('cnp-error')).textContent).toContain('CNP invalid');
    expect(screen.getByTestId('email-error')).toBeTruthy();
    expect(screen.getByTestId('phone-error')).toBeTruthy();
    expect(requests(employeesPath, 'POST')).toHaveLength(0);
  });

  it('prefills the birth date from the CNP and rejects a contradicting one', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPath}/new`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-cnp'), '1900101 400127');
    await user.tab();
    const birthDate = screen.getByTestId('employee-birth-date') as HTMLInputElement;
    expect(birthDate.value).toBe('1990-01-01');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-job-title'), 'Sudor');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    setDate(birthDate, '1990-01-02');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('birthDate-error')).textContent).toBe(
      'Data nașterii nu corespunde cu CNP-ul.'
    );
    expect(requests(employeesPath, 'POST')).toHaveLength(0);
  });

  it('sends the normalized request and returns to the list', async () => {
    mockApi({ list: () => Response.json({ employees: [sampleEmployee] }) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}/new`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-cnp'), '1900101 400127');
    await user.type(screen.getByTestId('employee-number'), 'A-17');
    await user.type(screen.getByTestId('employee-job-title'), 'Sudor');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.type(screen.getByTestId('employee-email'), 'Ion.Popescu@Example.com');
    await user.type(screen.getByTestId('employee-phone'), '0721 000 000');
    await user.selectOptions(screen.getByTestId('employee-blood-group'), 'A(II)');
    await user.selectOptions(screen.getByTestId('employee-rh-factor'), '+');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(runtime.router.state.location.pathname).toBe(employeesPath);
    await screen.findByTestId('employees-row');
    const [, init] = requests(employeesPath, 'POST')[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      lastName: 'Popescu',
      firstName: 'Ion',
      cnp: '1900101400127',
      employeeNumber: 'A-17',
      email: 'ion.popescu@example.com',
      phone: '0721 000 000',
      jobTitle: 'Sudor',
      hiredAt: '2020-03-01',
      birthDate: '1990-01-01',
      birthPlace: null,
      homeAddress: null,
      bloodGroup: 'A(II)',
      rhFactor: '+',
      notes: null,
    });
  });

  it('accepts the minimal form and sends nulls for the rest', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeesPath}/new`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-job-title'), 'Sudor');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    await screen.findByTestId('employees-page');
    expect(JSON.parse(String(requests(employeesPath, 'POST')[0]![1]?.body))).toMatchObject({
      cnp: null,
      employeeNumber: null,
      email: null,
      birthDate: null,
      bloodGroup: null,
    });
  });

  it('maps a duplicate CNP to the field and an archived client to the form', async () => {
    let attempts = 0;
    mockApi({
      create: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json(
              {
                error: 'conflict',
                message: 'An employee with this CNP already exists for this client.',
              },
              { status: 409 }
            )
          : Response.json(
              { error: 'conflict', message: 'This client is archived; employees cannot be added.' },
              { status: 409 }
            );
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeesPath}/new`);
    const user = userEvent.setup();
    await screen.findByTestId('new-employee-page');
    await user.type(screen.getByTestId('employee-last-name'), 'Popescu');
    await user.type(screen.getByTestId('employee-first-name'), 'Ion');
    await user.type(screen.getByTestId('employee-cnp'), '1900101400127');
    await user.type(screen.getByTestId('employee-job-title'), 'Sudor');
    setDate(screen.getByTestId('employee-hired-at'), '2020-03-01');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('cnp-error')).textContent).toContain('acest CNP');
    await user.click(screen.getByTestId('employee-submit'));
    expect((await screen.findByTestId('employee-form-error')).textContent).toContain('arhivat');
    expect(requests(employeesPath, 'POST')).toHaveLength(2);
  });
});
