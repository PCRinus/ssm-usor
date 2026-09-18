import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: 'București',
  addressLine: null,
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const emptyDetails = {
  legalRepresentativeRole: null,
  periodicTrainingHours: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

const employee = {
  id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  clientId,
  lastName: 'Luca',
  firstName: 'Paolo-Antonio',
  employeeNumber: null,
  email: null,
  phone: null,
  jobTitle: 'Manager magazin',
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
};

const manager = {
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  clientId,
  employeeId: employee.id,
  fullName: 'Paolo-Antonio Luca',
  jobTitle: 'Manager magazin',
  roles: ['workplace_manager', 'first_aid'],
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

const listPath = `/clients/${clientId}/responsible-persons`;
const itemPath = `${listPath}/${manager.id}`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  items = [manager] as unknown[],
  create = ((init) =>
    Response.json(
      { responsiblePerson: { ...manager, ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  update = ((init) =>
    Response.json({
      responsiblePerson: { ...manager, ...JSON.parse(String(init?.body)) },
    })) as Route,
  archive = (() => new Response(null, { status: 204 })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails: emptyDetails });
    }
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: [employee], page: 1, pageSize: 100, total: 1 });
    }
    if (pathname === listPath) return method === 'POST' ? create(init) : Response.json({ items });
    if (pathname === itemPath) return method === 'DELETE' ? archive(init) : update(init);
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (pathname: string, method: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
    )
    .map(([, init]) => (init?.body ? (JSON.parse(String(init.body)) as unknown) : null));

const mount = () =>
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/document-data`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('client responsible persons', () => {
  it('lists each person with their roles, and names the roles nobody holds', async () => {
    mockApi();
    mount();

    const [row] = await screen.findAllByTestId('responsible-row');
    expect(row!.textContent).toContain('Paolo-Antonio Luca');
    expect(row!.textContent).toContain('Manager magazin');
    expect(row!.textContent).toContain('Conducător al locului de muncă');
    expect(row!.textContent).toContain('Prim ajutor');
    expect(screen.getByTestId('responsible-missing').textContent).toBe(
      'Fără persoană numită: Echipa de evaluare a riscurilor, Pericol grav și iminent.'
    );
  });

  it('says where to start when there are none', async () => {
    mockApi({ items: [] });
    mount();

    expect((await screen.findByTestId('responsible-persons-empty')).textContent).toContain(
      'conducătorul locului de muncă'
    );
    expect(screen.queryByTestId('responsible-missing')).toBeNull();
  });

  it('fills the name and the job title from a chosen employee, first names first', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-employee'));
    await user.type(screen.getByTestId('responsible-employee-search'), 'mana');
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', { name: /Luca/ })
    );

    expect(screen.getByTestId<HTMLInputElement>('responsible-name').value).toBe(
      'Paolo-Antonio Luca'
    );
    expect(screen.getByTestId<HTMLInputElement>('responsible-job-title').value).toBe(
      'Manager magazin'
    );

    // Ticked out of order; sent in the order the decisions list them.
    await user.click(screen.getByTestId('responsible-role-imminent_danger'));
    await user.click(screen.getByTestId('responsible-role-workplace_manager'));
    await user.click(screen.getByTestId('responsible-save'));

    await waitFor(() =>
      expect(requests(listPath, 'POST')).toEqual([
        {
          employeeId: employee.id,
          fullName: 'Paolo-Antonio Luca',
          jobTitle: 'Manager magazin',
          roles: ['workplace_manager', 'imminent_danger'],
        },
      ])
    );
    expect(await screen.findByText('Persoana a fost adăugată.')).toBeTruthy();
  });

  it('adds someone who is not an employee, typed by hand', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.type(await screen.findByTestId('responsible-name'), 'Maria Popescu');
    await user.type(screen.getByTestId('responsible-job-title'), 'Administrator');
    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));

    await waitFor(() =>
      expect(requests(listPath, 'POST')).toEqual([
        {
          employeeId: null,
          fullName: 'Maria Popescu',
          jobTitle: 'Administrator',
          roles: ['first_aid'],
        },
      ])
    );
  });

  it('needs a name, a job title, and at least one role before calling the API', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-save'));

    expect((await screen.findByTestId('responsible-name-error')).textContent).toContain('numele');
    expect(screen.getByTestId('responsible-job-title-error').textContent).toContain('funcția');
    expect(screen.getByTestId('responsible-roles-error').textContent).toContain(
      'cel puțin o responsabilitate'
    );
    expect(requests(listPath, 'POST')).toEqual([]);
  });

  it('reports an employee who is already listed on the employee field', async () => {
    mockApi({
      items: [],
      create: () => Response.json({ error: 'conflict', message: 'Conflict' }, { status: 409 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.type(await screen.findByTestId('responsible-name'), 'Paolo-Antonio Luca');
    await user.type(screen.getByTestId('responsible-job-title'), 'Manager magazin');
    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));

    expect((await screen.findByTestId('responsible-employee-error')).textContent).toContain(
      'este deja în listă'
    );
    expect(screen.getByTestId('responsible-dialog')).toBeTruthy();
  });

  it('edits the roles starting from what is saved', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-edit'));
    const firstAid = await screen.findByTestId('responsible-role-first_aid');
    expect(firstAid.getAttribute('aria-checked')).toBe('true');
    await user.click(firstAid);
    await user.click(screen.getByTestId('responsible-role-risk_evaluation_team'));
    await user.click(screen.getByTestId('responsible-save'));

    await waitFor(() =>
      expect(requests(itemPath, 'PUT')).toEqual([
        {
          employeeId: employee.id,
          fullName: 'Paolo-Antonio Luca',
          jobTitle: 'Manager magazin',
          roles: ['workplace_manager', 'risk_evaluation_team'],
        },
      ])
    );
    expect(await screen.findByText('Persoana a fost salvată.')).toBeTruthy();
  });

  it('removes a person only after confirmation', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-archive'));
    const dialog = await screen.findByTestId('responsible-archive-dialog');
    expect(dialog.textContent).toContain('Paolo-Antonio Luca');
    expect(requests(itemPath, 'DELETE')).toEqual([]);

    await user.click(within(dialog).getByTestId('responsible-archive-confirm'));
    await waitFor(() => expect(requests(itemPath, 'DELETE')).toHaveLength(1));
    expect(await screen.findByText('Paolo-Antonio Luca a fost scos din listă.')).toBeTruthy();
  });

  it('shows an archived client the list without add or row actions', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect(await screen.findAllByTestId('responsible-row')).toHaveLength(1);
    expect(screen.queryByTestId('responsible-add')).toBeNull();
    expect(screen.queryByTestId('responsible-actions')).toBeNull();
  });
});
