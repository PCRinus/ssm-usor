import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { bodiesOf, installFetchMock, mockApi as mockRoutes } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  employeeListItem,
  pageOf,
  workplaceListItem,
} from '@/test/records';
import { fullText } from '@/test/text';

const sampleClient = clientRecord({ currentEmployeeCount: 12 });

const emptyDetails = {
  legalRepresentativeName: null,
  legalRepresentativeRole: null,
  periodicTrainingMinutes: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

const employee = employeeListItem({
  id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  lastName: 'Luca',
  firstName: 'Paolo-Antonio',
  jobTitle: 'Manager magazin',
  hiredAt: '2020-03-01',
});

const manager = {
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  clientId,
  employeeId: employee.id,
  fullName: 'Paolo-Antonio Luca',
  jobTitle: 'Manager magazin',
  employeeJobTitle: 'Manager magazin',
  currentEmployee: true,
  portal: 'active' as string | null,
  roles: ['workplace_manager', 'first_aid'],
  workplaceId: null as string | null,
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

const emptyFireSafety = {
  periodicTrainingHours: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
  smokingPolicy: null,
  wasteKinds: [],
  wasteContractor: null,
};

const shop = workplaceListItem({
  id: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e',
  name: 'Gelaterie Timișoara',
  isRegisteredOffice: false,
  officeHasActivity: true,
});

const listPath = `/clients/${clientId}/responsible-persons`;
const itemPath = `${listPath}/${manager.id}`;

type Route = (init: RequestInit | undefined) => Response;

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
  details = emptyDetails as Record<string, unknown>,
  workplaces = [] as unknown[],
} = {}) {
  mockRoutes((init, { pathname }) => {
    const method = init?.method ?? 'GET';
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails: details });
    }
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: workplaces });
    if (pathname === `/clients/${clientId}/fire-safety`) {
      return Response.json({ fireSafety: emptyFireSafety, exists: false });
    }
    if (pathname === `/clients/${clientId}/employees`) {
      return Response.json(pageOf([employee], { pageSize: 100 }));
    }
    if (pathname === listPath) return method === 'POST' ? create(init) : Response.json({ items });
    if (pathname === itemPath) return method === 'DELETE' ? archive(init) : update(init);
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire`);

const renderedRoles = () =>
  Array.from(document.querySelectorAll('[data-testid^="responsible-role-"]')).map((checkbox) =>
    checkbox.getAttribute('data-testid')!.replace('responsible-role-', '')
  );

installFetchMock();

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
      'Fără persoană numită: Echipa de evaluare a riscurilor, Pericol grav și iminent, Reprezentantul lucrătorilor, Coordonator privind apărarea împotriva incendiilor, Șef echipă de primă intervenție'
    );
  });

  it('asks for no workers representative below 10 current workers', async () => {
    mockApi({ client: { ...sampleClient, currentEmployeeCount: 9 } });
    mount();
    await screen.findAllByTestId('responsible-row');
    expect(screen.getByTestId('responsible-missing').textContent).not.toContain(
      'Reprezentantul lucrătorilor'
    );
  });

  it('asks for a second workers representative from 50 current workers', async () => {
    const representative = {
      ...manager,
      id: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
      fullName: 'Ion Ionescu',
      roles: ['workers_representative'],
    };
    mockApi({
      client: { ...sampleClient, currentEmployeeCount: 50 },
      items: [manager, representative],
    });
    mount();
    await screen.findAllByTestId('responsible-row');
    expect(screen.getByTestId('responsible-missing').textContent).toContain(
      'Reprezentantul lucrătorilor (al doilea)'
    );
  });

  it('opens a new person with the missing role ticked from the line beside the title', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-missing-imminent_danger'));
    const role = await screen.findByTestId('responsible-role-imminent_danger');
    expect(role.getAttribute('aria-checked') ?? String((role as HTMLInputElement).checked)).toBe(
      'true'
    );
    expect(screen.getByTestId<HTMLInputElement>('responsible-name').value).toBe('');
  });

  it("says under each name whether they are the client's worker, and on the portal", async () => {
    const person = (index: number, fullName: string, extra: Record<string, unknown>) => ({
      ...manager,
      id: `${index}c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f`,
      employeeId: `${index}d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f`,
      fullName,
      ...extra,
    });
    mockApi({
      items: [
        manager,
        person(1, 'Cristina Stan', { portal: 'invited' }),
        person(2, 'Maria Popescu', { employeeId: null, currentEmployee: false, portal: null }),
        person(3, 'Vasile Matei', { portal: 'expired' }),
        person(4, 'Ion Plecat', { currentEmployee: false, portal: 'none' }),
      ],
    });
    mount();

    await waitFor(() =>
      expect(screen.getAllByTestId('responsible-standing').map((line) => line.textContent)).toEqual(
        [
          'Lucrător · acces la portal',
          'Lucrător · invitație în portal trimisă',
          'Nu e în lista lucrătorilor',
          'Lucrător · fără acces la portal',
          'Nu mai e lucrător',
        ]
      )
    );
  });

  it('counts only a workers representative who still works for the client', async () => {
    mockApi({
      items: [
        manager,
        {
          ...manager,
          id: '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
          employeeId: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
          fullName: 'Ion Plecat',
          currentEmployee: false,
          roles: ['workers_representative'],
        },
      ],
    });
    mount();

    await screen.findAllByTestId('responsible-row');
    expect(screen.getByTestId('responsible-missing').textContent).toContain(
      'Reprezentantul lucrătorilor'
    );
    expect(screen.getByTestId('responsible-missing').textContent).not.toContain('(al doilea)');
  });

  it('marks the workers representative who is also the legal representative', async () => {
    mockApi({
      items: [{ ...manager, roles: ['workers_representative'] }],
      details: {
        ...emptyDetails,
        legalRepresentativeName: 'Paolo-Antonio Luca',
        legalRepresentativeEmployeeId: employee.id,
      },
    });
    mount();

    expect((await screen.findByTestId('responsible-representative-clash')).textContent).toBe(
      'Reprezentantul legal nu poate fi și reprezentantul lucrătorilor.'
    );
  });

  it('says there are none yet, the advice being in the help', async () => {
    mockApi({ items: [] });
    mount();

    expect((await screen.findByTestId('responsible-persons-empty')).textContent).toBe(
      'Nicio persoană responsabilă încă.'
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
      expect(bodiesOf(listPath, 'POST')).toEqual([
        {
          employeeId: employee.id,
          workplaceId: null,
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
      expect(bodiesOf(listPath, 'POST')).toEqual([
        {
          employeeId: null,
          workplaceId: null,
          fullName: 'Maria Popescu',
          jobTitle: 'Administrator',
          roles: ['first_aid'],
        },
      ])
    );
  });

  it('offers the legal representative first, filled in without an employee link', async () => {
    mockApi({ items: [], details: { ...emptyDetails, legalRepresentativeName: 'Maria Popescu' } });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-employee'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Maria PopescuAdministrator',
      'Luca Paolo-AntonioManager magazin',
    ]);
    await user.click(options[0]!);

    expect(screen.getByTestId('responsible-employee').textContent).toContain('Maria Popescu');
    expect(screen.getByTestId<HTMLInputElement>('responsible-name').value).toBe('Maria Popescu');
    expect(screen.getByTestId<HTMLInputElement>('responsible-job-title').value).toBe(
      'Administrator'
    );
    const representative = screen.getByTestId('responsible-role-workers_representative');
    expect(representative.hasAttribute('disabled')).toBe(true);
    expect(
      document.getElementById('responsible-role-workers_representative-description')?.textContent
    ).toBe('Nu poate fi reprezentantul legal. Se alege dintre lucrătorii clientului.');

    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));
    await waitFor(() =>
      expect(bodiesOf(listPath, 'POST')).toEqual([
        {
          employeeId: null,
          workplaceId: null,
          fullName: 'Maria Popescu',
          jobTitle: 'Administrator',
          roles: ['first_aid'],
        },
      ])
    );
  });

  it('unticks the workers’ representative when the legal representative is chosen', async () => {
    mockApi({
      items: [],
      details: {
        ...emptyDetails,
        legalRepresentativeName: 'Maria Popescu',
        legalRepresentativeRole: 'Asociat unic',
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-role-workers_representative'));
    await user.click(screen.getByTestId('responsible-employee'));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: /Popescu/ })
    );

    expect(screen.getByTestId<HTMLInputElement>('responsible-job-title').value).toBe(
      'Asociat unic'
    );
    expect(
      screen.getByTestId('responsible-role-workers_representative').getAttribute('data-state')
    ).toBe('unchecked');
  });

  it('offers a linked administrator as that employee, once, and links the person to them', async () => {
    mockApi({
      items: [],
      details: {
        ...emptyDetails,
        legalRepresentativeName: 'Paolo-Antonio Luca',
        legalRepresentativeRole: 'Administrator',
        legalRepresentativeEmployeeId: employee.id,
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-role-workers_representative'));
    await user.click(screen.getByTestId('responsible-employee'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Paolo-Antonio LucaAdministrator',
    ]);
    await user.click(options[0]!);

    expect(screen.getByTestId<HTMLInputElement>('responsible-name').value).toBe(
      'Paolo-Antonio Luca'
    );
    expect(screen.getByTestId<HTMLInputElement>('responsible-job-title').value).toBe(
      'Administrator'
    );
    const representative = screen.getByTestId('responsible-role-workers_representative');
    expect(representative.getAttribute('data-state')).toBe('unchecked');
    expect(representative.hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));
    await waitFor(() =>
      expect(bodiesOf(listPath, 'POST')).toEqual([
        {
          employeeId: employee.id,
          workplaceId: null,
          fullName: 'Paolo-Antonio Luca',
          jobTitle: 'Administrator',
          roles: ['first_aid'],
        },
      ])
    );
  });

  it('says where to record the legal representative when the client has none', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.click(await screen.findByTestId('responsible-employee'));

    expect((await screen.findByTestId('responsible-employee-note')).textContent).toBe(
      'Administratorul nu este completat în Detalii. Completează'
    );
    expect(
      screen.getByTestId('responsible-employee-administrator-missing').getAttribute('href')
    ).toBe(`/clienti/${clientId}/detalii?focus=legal-representative-name`);
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Luca Paolo-AntonioManager magazin']);
  });

  it('lists the occupational safety roles, the fire safety ones, then the representative', async () => {
    mockApi({ items: [], client: { ...sampleClient, currentEmployeeCount: 10 } });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await screen.findByTestId('responsible-role-workers_representative');
    expect(renderedRoles()).toEqual([
      'workplace_manager',
      'first_aid',
      'imminent_danger',
      'risk_evaluation_team',
      'fire_safety_coordinator',
      'fire_intervention_leader',
      'workers_representative',
    ]);
  });

  it('leaves the workers’ representative out below 10 employees', async () => {
    mockApi({ items: [], client: { ...sampleClient, currentEmployeeCount: 6 } });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await screen.findByTestId('responsible-role-fire_intervention_leader');
    expect(renderedRoles()).toEqual([
      'workplace_manager',
      'first_aid',
      'imminent_danger',
      'risk_evaluation_team',
      'fire_safety_coordinator',
      'fire_intervention_leader',
    ]);
  });

  it('lets someone who holds the role below 10 employees keep or drop it', async () => {
    mockApi({
      items: [{ ...manager, roles: ['workplace_manager', 'workers_representative'] }],
      client: { ...sampleClient, currentEmployeeCount: 6 },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-edit'));
    const representative = await screen.findByTestId('responsible-role-workers_representative');
    expect(representative.getAttribute('data-state')).toBe('checked');
    expect(representative.hasAttribute('disabled')).toBe(false);
    await user.click(representative);
    expect(representative.getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByTestId('responsible-role-workers_representative')).toBe(representative);
  });

  it('offers the role below 10 employees when a row of missing data asks for it', async () => {
    mockApi({ items: [], client: { ...sampleClient, currentEmployeeCount: 6 } });
    mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/instruire?focus=workers-representative`
    );
    const representative = await screen.findByTestId('responsible-role-workers_representative');
    expect(representative.getAttribute('data-state')).toBe('checked');
    expect(representative.hasAttribute('disabled')).toBe(false);
  });

  it('ties a fire-safety coordinator to one workplace, and the row says which', async () => {
    mockApi({ items: [], workplaces: [shop] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.type(await screen.findByTestId('responsible-name'), 'Ioana Marin');
    await user.type(screen.getByTestId('responsible-job-title'), 'Manager magazin');
    await user.selectOptions(await screen.findByTestId('responsible-workplace'), shop.id);
    await user.click(screen.getByTestId('responsible-role-fire_intervention_leader'));
    await user.click(screen.getByTestId('responsible-role-fire_safety_coordinator'));
    await user.click(screen.getByTestId('responsible-save'));

    await waitFor(() =>
      expect(bodiesOf(listPath, 'POST')).toEqual([
        {
          employeeId: null,
          workplaceId: shop.id,
          fullName: 'Ioana Marin',
          jobTitle: 'Manager magazin',
          roles: ['fire_safety_coordinator', 'fire_intervention_leader'],
        },
      ])
    );
  });

  it('names the workplace of a person tied to one, and keeps it when saving', async () => {
    mockApi({ items: [{ ...manager, workplaceId: shop.id }], workplaces: [shop] });
    mount();
    const user = userEvent.setup();

    const row = await screen.findByTestId('responsible-row');
    expect((await within(row).findByTestId('responsible-workplace-name')).textContent).toBe(
      'numai la Gelaterie Timișoara'
    );
    await user.click(within(row).getByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-edit'));
    expect((await screen.findByTestId<HTMLSelectElement>('responsible-workplace')).value).toBe(
      shop.id
    );
    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));

    await waitFor(() =>
      expect(bodiesOf(itemPath, 'PUT')).toEqual([
        expect.objectContaining({ workplaceId: shop.id, roles: ['workplace_manager'] }),
      ])
    );
  });

  describe('beside a registered office where no activity takes place', () => {
    const office = {
      ...shop,
      id: '8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5f',
      name: 'Sediu social',
      isRegisteredOffice: true,
      officeHasActivity: false,
    };
    const options = async () =>
      Array.from(
        (await screen.findByTestId<HTMLSelectElement>('responsible-workplace')).options
      ).map((option) => option.textContent);

    it('offers the office to nobody new', async () => {
      mockApi({ items: [], workplaces: [office, shop] });
      mount();
      await userEvent.setup().click(await screen.findByTestId('responsible-add'));
      expect(await options()).toEqual(['Toate locurile de muncă', 'Gelaterie Timișoara']);
    });

    it('keeps it for a person tied to it before', async () => {
      mockApi({ items: [{ ...manager, workplaceId: office.id }], workplaces: [office, shop] });
      mount();
      const user = userEvent.setup();
      await user.click(
        within(await screen.findByTestId('responsible-row')).getByTestId('responsible-actions')
      );
      await user.click(await screen.findByTestId('responsible-edit'));
      expect(await options()).toEqual([
        'Toate locurile de muncă',
        'Sediu social',
        'Gelaterie Timișoara',
      ]);
    });

    it('says why the API refused it when the office was answered while the dialog was open', async () => {
      const answeredLater = { ...office, officeHasActivity: true };
      mockApi({
        items: [manager],
        workplaces: [answeredLater, shop],
        update: () =>
          Response.json(
            {
              error: 'validation_error',
              message: 'No activity takes place at this registered office.',
              issues: [
                {
                  path: 'workplaceId',
                  message: 'No activity takes place at this registered office.',
                },
              ],
            },
            { status: 400 }
          ),
      });
      mount();
      const user = userEvent.setup();
      await user.click(
        within(await screen.findByTestId('responsible-row')).getByTestId('responsible-actions')
      );
      await user.click(await screen.findByTestId('responsible-edit'));
      await user.selectOptions(await screen.findByTestId('responsible-workplace'), office.id);
      answeredLater.officeHasActivity = false;
      await user.click(screen.getByTestId('responsible-save'));
      expect(
        await screen.findByText(
          'La sediul social nu se desfășoară activitate. Alege alt loc de muncă sau toate locurile de muncă.'
        )
      ).toBeTruthy();
    });
  });

  it.each([
    ['fire-safety-coordinator', 'responsible-role-fire_safety_coordinator'],
    ['fire-intervention-leader', 'responsible-role-fire_intervention_leader'],
  ])('opens the new person dialog for ?focus=%s with that role ticked', async (focus, box) => {
    mockApi({ items: [] });
    mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire?focus=${focus}`);
    const dialog = await screen.findByTestId('responsible-dialog');
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .filter((item) => item.getAttribute('data-state') === 'checked')
        .map((item) => item.id)
    ).toEqual([box]);
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
    expect(bodiesOf(listPath, 'POST')).toEqual([]);
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

  it('says the client is archived, not that the employee is listed, when a stale page adds to it', async () => {
    mockApi({
      items: [],
      create: () =>
        Response.json(
          { error: 'conflict', message: 'Archived', reason: 'client_archived' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.type(await screen.findByTestId('responsible-name'), 'Paolo-Antonio Luca');
    await user.type(screen.getByTestId('responsible-job-title'), 'Manager magazin');
    await user.click(screen.getByTestId('responsible-role-first_aid'));
    await user.click(screen.getByTestId('responsible-save'));

    expect((await screen.findByTestId('responsible-error')).textContent).toContain('arhivat');
    expect(screen.queryByTestId('responsible-employee-error')).toBeNull();
    expect(screen.getByTestId('responsible-dialog')).toBeTruthy();
  });

  it("takes a workers' representative only from the employees", async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-add'));
    await user.type(await screen.findByTestId('responsible-name'), 'Maria Popescu');
    await user.type(screen.getByTestId('responsible-job-title'), 'Vânzătoare');
    await user.click(screen.getByTestId('responsible-role-workers_representative'));
    await user.click(screen.getByTestId('responsible-save'));

    expect((await screen.findByTestId('responsible-employee-error')).textContent).toContain(
      'dintre lucrătorii clientului'
    );
    expect(bodiesOf(listPath, 'POST')).toEqual([]);
  });

  it('names both people when the legal representative is chosen to represent the workers', async () => {
    mockApi({
      details: { ...emptyDetails, legalRepresentativeName: 'LUCA Paolo Antonio' },
      update: () =>
        Response.json(
          {
            error: 'conflict',
            message: 'Conflict',
            reason: 'workers_representative_is_legal_representative',
          },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-edit'));
    await user.click(await screen.findByTestId('responsible-role-workers_representative'));
    await user.click(screen.getByTestId('responsible-save'));

    expect((await screen.findByTestId('responsible-roles-error')).textContent).toContain(
      '„Paolo-Antonio Luca” are același nume ca reprezentantul legal al clientului, „LUCA Paolo Antonio”'
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
      expect(bodiesOf(itemPath, 'PUT')).toEqual([
        {
          employeeId: employee.id,
          workplaceId: null,
          fullName: 'Paolo-Antonio Luca',
          jobTitle: 'Manager magazin',
          roles: ['workplace_manager', 'risk_evaluation_team'],
        },
      ])
    );
    expect(await screen.findByText('Persoana a fost salvată.')).toBeTruthy();
  });

  it('shows a contract title that has moved on, and adopts it on request', async () => {
    mockApi({ items: [{ ...manager, employeeJobTitle: 'Director magazin' }] });
    mount();
    const user = userEvent.setup();

    const drift = await screen.findByTestId('responsible-title-drift');
    expect(drift.textContent).toContain('Director magazin');
    await user.click(within(drift).getByTestId('responsible-title-adopt'));

    await waitFor(() => expect(bodiesOf(itemPath, 'PUT')).toHaveLength(1));
    expect(bodiesOf(itemPath, 'PUT')[0]).toEqual({
      employeeId: employee.id,
      workplaceId: null,
      fullName: 'Paolo-Antonio Luca',
      jobTitle: 'Director magazin',
      roles: ['workplace_manager', 'first_aid'],
    });
    expect(screen.queryByTestId('responsible-dialog')).toBeNull();
  });

  it('says the client is archived when a stale page adopts the title or removes a person', async () => {
    const archived = () =>
      Response.json(
        { error: 'conflict', message: 'Archived', reason: 'client_archived' },
        { status: 409 }
      );
    mockApi({
      items: [{ ...manager, employeeJobTitle: 'Director magazin' }],
      update: archived,
      archive: archived,
    });
    mount();
    const user = userEvent.setup();

    const drift = await screen.findByTestId('responsible-title-drift');
    await user.click(within(drift).getByTestId('responsible-title-adopt'));
    expect((await screen.findByTestId('responsible-persons-error')).textContent).toContain(
      'arhivat'
    );

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-archive'));
    await user.click(await screen.findByTestId('responsible-archive-confirm'));
    await waitFor(() => expect(bodiesOf(itemPath, 'DELETE')).toHaveLength(1));
    expect((await screen.findByTestId('responsible-persons-error')).textContent).toContain(
      'arhivat'
    );
  });

  it('says nothing while the two titles agree', async () => {
    mockApi();
    mount();
    await screen.findByTestId('responsible-row');
    expect(screen.queryByTestId('responsible-title-drift')).toBeNull();
  });

  it('removes a person only after confirmation', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('responsible-actions'));
    await user.click(await screen.findByTestId('responsible-archive'));
    const dialog = await screen.findByTestId('responsible-archive-dialog');
    expect(dialog.textContent).toContain('Paolo-Antonio Luca');
    expect(bodiesOf(itemPath, 'DELETE')).toEqual([]);

    await user.click(within(dialog).getByTestId('responsible-archive-confirm'));
    await waitFor(() => expect(bodiesOf(itemPath, 'DELETE')).toHaveLength(1));
    expect(
      await screen.findByText(fullText('Paolo-Antonio Luca a fost scos din listă.'))
    ).toBeTruthy();
  });

  it('shows an archived client the list without add or row actions', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect(await screen.findAllByTestId('responsible-row')).toHaveLength(1);
    expect(screen.queryByTestId('responsible-add')).toBeNull();
    expect(screen.queryByTestId('responsible-actions')).toBeNull();
  });

  it('opens the new person dialog with the role a row asked for already ticked', async () => {
    mockApi({ items: [] });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/instruire?focus=imminent-danger`
    );
    const dialog = await screen.findByTestId('responsible-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Adaugă o persoană responsabilă');
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .filter((box) => box.getAttribute('data-state') === 'checked')
        .map((box) => box.id)
    ).toEqual(['responsible-role-imminent_danger']);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it("opens the representative who has the legal representative's name, at the role", async () => {
    mockApi({
      items: [{ ...manager, roles: ['workplace_manager', 'workers_representative'] }],
      details: { ...emptyDetails, legalRepresentativeName: 'LUCA Paolo Antonio' },
    });
    mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/instruire?focus=workers-representative-clash`
    );
    const dialog = await screen.findByTestId('responsible-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Modifică persoana responsabilă');
    expect(within(dialog).getByTestId('responsible-clash').textContent).toContain(
      'Paolo-Antonio Luca are același nume ca reprezentantul legal al clientului'
    );
    await waitFor(() =>
      expect(document.activeElement?.id).toBe('responsible-role-workers_representative')
    );
  });

  it.each([
    ['smoothly', false, 'smooth'],
    ['at once for reduced motion', true, 'auto'],
  ])('scrolls to the add button %s before the dialog opens', async (_, reduced, behavior) => {
    const media = window.matchMedia;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media(query), matches: reduced && query.includes('reduce') }))
    );
    const scrolled: { testId: string | null; options: unknown; dialogOpen: boolean }[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element, options) {
      scrolled.push({
        testId: this.getAttribute('data-testid'),
        options,
        dialogOpen: document.querySelector('[data-testid="responsible-dialog"]') !== null,
      });
    });
    mockApi({ items: [] });
    mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire?focus=first-aid`);
    await screen.findByTestId('responsible-dialog');
    expect(scrolled.find((call) => call.testId === 'responsible-add')).toEqual({
      testId: 'responsible-add',
      options: { block: 'center', behavior },
      dialogOpen: false,
    });
  });
});
