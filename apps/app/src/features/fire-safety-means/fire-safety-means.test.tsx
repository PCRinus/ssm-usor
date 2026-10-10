import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { extinguisherHint } from './fire-means-schema';

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

const stamp = { createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z' };

const office = {
  ...stamp,
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Sediu social',
  isRegisteredOffice: true,
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  activity: 'Birouri',
  floorAreaM2: 450 as number | null,
  extinguisherNorm: 'administrative_300' as string | null,
  assemblyPoint: null,
  combustibleMaterials: null,
  ignitionSources: null,
  fireRiskEquipment: null,
  specificMeasures: null,
};

const shop = {
  ...office,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Gelaterie Timișoara',
  isRegisteredOffice: false,
  countyCode: 'TM',
  locality: 'Timișoara',
  addressLine: 'Str. Goethe 2',
  activity: 'Gelaterie',
  floorAreaM2: null,
  extinguisherNorm: null,
};

const unit = {
  ...stamp,
  clientId,
  kind: 'extinguisher',
  agent: 'powder' as string | null,
  capacity: 6 as number | null,
  wheeled: false,
  label: null as string | null,
  location: null as string | null,
  manufacturedYear: null as number | null,
  lastServiceOn: null as string | null,
  nextServiceOn: null as string | null,
  maintainer: null as string | null,
};

const officeP6 = {
  ...unit,
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  workplaceId: office.id,
  label: '1234',
  location: 'Lângă recepție',
  manufacturedYear: 2021,
  lastServiceOn: '2026-03-12',
  nextServiceOn: '2027-03-12',
  maintainer: 'Pyro Service SRL',
};
const officeG3 = {
  ...unit,
  id: '1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  workplaceId: office.id,
  agent: 'co2',
  capacity: 3,
  nextServiceOn: '2020-01-01',
};
const shopSand = {
  ...unit,
  id: '2a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  workplaceId: shop.id,
  kind: 'sand_box',
  agent: null,
  capacity: null,
};

const alarm = {
  ...stamp,
  id: '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  clientId,
  workplaceId: office.id,
  kind: 'detection_alarm',
  description: 'Centrală în holul de la parter',
  maintainer: null,
  lastCheckOn: null,
  nextCheckOn: null,
};

const equipmentPath = `/clients/${clientId}/fire-equipment`;
const installationsPath = `/clients/${clientId}/fire-installations`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  workplaces = [office, shop] as unknown[],
  equipment = [officeP6, officeG3, shopSand] as unknown[],
  installations = [alarm] as unknown[],
  createEquipment = ((init) =>
    Response.json(
      { equipment: { ...unit, id: 'new', ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  updateEquipment = ((init) =>
    Response.json({ equipment: { ...officeP6, ...JSON.parse(String(init?.body)) } })) as Route,
  deleteEquipment = (() => new Response(null, { status: 204 })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: workplaces });
    if (pathname === equipmentPath) {
      return method === 'POST' ? createEquipment(init) : Response.json({ items: equipment });
    }
    if (pathname.startsWith(`${equipmentPath}/`)) {
      return method === 'DELETE' ? deleteEquipment(init) : updateEquipment(init);
    }
    if (pathname === installationsPath) {
      return method === 'POST'
        ? Response.json(
            { installation: { ...alarm, id: 'new', ...JSON.parse(String(init?.body)) } },
            { status: 201 }
          )
        : Response.json({ items: installations });
    }
    if (pathname.startsWith(`${installationsPath}/`)) {
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ installation: { ...alarm, ...JSON.parse(String(init?.body)) } });
    }
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

const mount = (search = '') =>
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/fire-safety-means${search}`);

async function cardOf(name: string) {
  const cards = await screen.findAllByTestId('fire-means-card');
  return cards.find((card) => card.querySelector('h2')?.textContent?.includes(name))!;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the minimum-extinguisher hint', () => {
  it('rounds the area up by the norm, and counts dwellings by level', () => {
    expect(extinguisherHint(2, { floorAreaM2: 450, extinguisherNorm: 'administrative_300' })).toBe(
      '2 stingătoare · minim orientativ 2 (anexa 6)'
    );
    expect(extinguisherHint(1, { floorAreaM2: 60, extinguisherNorm: 'commercial_200' })).toBe(
      '1 stingător · minim orientativ 1 (anexa 6)'
    );
    expect(extinguisherHint(0, { floorAreaM2: 90, extinguisherNorm: 'residential_level' })).toBe(
      'Niciun stingător · cel puțin unul pe nivel (anexa 6)'
    );
    expect(extinguisherHint(3, { floorAreaM2: null, extinguisherNorm: 'other_150' })).toBeNull();
    expect(extinguisherHint(3, { floorAreaM2: 100, extinguisherNorm: null })).toBeNull();
  });
});

describe('client fire-safety means', () => {
  it('is a section of the client between the job positions and the training', async () => {
    mockApi();
    mount();

    await screen.findByTestId('fire-means-page');
    const tabs = screen.getAllByTestId('client-section').map((tab) => tab.textContent);
    expect(tabs.slice(2, 5)).toEqual([
      'Posturi de lucru',
      'Mijloace PSI',
      'Instruire și responsabili',
    ]);
  });

  it('groups the equipment and installations by workplace, with the annex 6 hint', async () => {
    mockApi();
    mount();

    const officeCard = await cardOf('Sediu social');
    expect(officeCard.textContent).toContain('Birouri · Calea Victoriei 122A, București');
    const rows = within(officeCard).getAllByTestId('fire-equipment-row');
    expect(rows.map((row) => within(row).getByTestId('extinguisher-code').textContent)).toEqual([
      'P6',
      'G3',
    ]);
    expect(rows[0]!.textContent).toContain('Pulbere, 6 kg');
    expect(rows[0]!.textContent).toContain('Nr. 1234');
    expect(rows[0]!.textContent).toContain('Lângă recepție, fabricat în 2021');
    expect(rows[0]!.textContent).toContain('Următorul: 12.03.2027');
    expect(within(rows[1]!).getByTestId('fire-service-overdue').textContent).toContain('depășit');
    expect(within(officeCard).getByTestId('fire-equipment-hint').textContent).toBe(
      '2 stingătoare · minim orientativ 2 (anexa 6)'
    );
    expect(within(officeCard).getByTestId('fire-installation-row').textContent).toContain(
      'Centrală în holul de la parter'
    );

    const shopCard = await cardOf('Gelaterie Timișoara');
    expect(within(shopCard).getByTestId('fire-equipment-row').textContent).toContain(
      'Ladă cu nisip'
    );
    expect(within(shopCard).queryByTestId('fire-equipment-hint')).toBeNull();
    expect(within(shopCard).getByTestId('fire-installations-empty')).toBeTruthy();
  });

  it('adds an extinguisher to the workplace whose card asked, showing its code as it is typed', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const shopCard = await cardOf('Gelaterie Timișoara');
    await user.click(within(shopCard).getByTestId('fire-equipment-add'));
    const dialog = await screen.findByTestId('fire-equipment-dialog');
    expect(within(dialog).getByTestId<HTMLSelectElement>('fire-equipment-workplace').value).toBe(
      shop.id
    );
    await user.selectOptions(within(dialog).getByTestId('fire-equipment-agent'), 'foam');
    await user.type(within(dialog).getByTestId('fire-equipment-capacity'), '9');
    expect(within(dialog).getByTestId('extinguisher-code').textContent).toBe('SM9');
    expect(within(dialog).getByText('l')).toBeTruthy();
    await user.click(within(dialog).getByTestId('fire-equipment-wheeled'));
    await user.type(within(dialog).getByTestId('fire-equipment-location'), 'Lângă ușă');
    await user.type(within(dialog).getByTestId('fire-equipment-next-service'), '01.04.2027');
    await user.click(within(dialog).getByTestId('fire-equipment-save'));

    await waitFor(() =>
      expect(requests(equipmentPath, 'POST')).toEqual([
        {
          workplaceId: shop.id,
          kind: 'extinguisher',
          agent: 'foam',
          capacity: 9,
          wheeled: true,
          label: null,
          location: 'Lângă ușă',
          manufacturedYear: null,
          lastServiceOn: null,
          nextServiceOn: '2027-04-01',
          maintainer: null,
        },
      ])
    );
    expect(await screen.findByText('Echipamentul a fost adăugat.')).toBeTruthy();
    expect(requests(equipmentPath, 'GET').length).toBeGreaterThan(1);
  });

  it('asks an extinguisher for its agent and capacity, and nothing else for other kinds', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(within(await cardOf('Sediu social')).getByTestId('fire-equipment-add'));
    await user.click(await screen.findByTestId('fire-equipment-save'));
    expect((await screen.findByTestId('fire-equipment-agent-error')).textContent).toContain(
      'agentul'
    );
    expect(screen.getByTestId('fire-equipment-capacity-error').textContent).toContain(
      'capacitatea'
    );

    await user.selectOptions(screen.getByTestId('fire-equipment-kind'), 'fire_blanket');
    expect(screen.queryByTestId('fire-equipment-extinguisher')).toBeNull();
    await user.click(screen.getByTestId('fire-equipment-save'));
    await waitFor(() =>
      expect(requests(equipmentPath, 'POST')).toEqual([
        expect.objectContaining({
          workplaceId: office.id,
          kind: 'fire_blanket',
          agent: null,
          capacity: null,
          wheeled: false,
        }),
      ])
    );
  });

  it('edits a unit from its row', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Lângă recepție, fabricat în 2021'));
    const dialog = await screen.findByTestId('fire-equipment-dialog');
    const label = within(dialog).getByTestId<HTMLInputElement>('fire-equipment-label');
    expect(label.value).toBe('1234');
    await user.clear(label);
    await user.type(label, 'A-17');
    await user.click(within(dialog).getByTestId('fire-equipment-save'));

    await waitFor(() =>
      expect(requests(`${equipmentPath}/${officeP6.id}`, 'PUT')).toEqual([
        {
          workplaceId: office.id,
          kind: 'extinguisher',
          agent: 'powder',
          capacity: 6,
          wheeled: false,
          label: 'A-17',
          location: 'Lângă recepție',
          manufacturedYear: 2021,
          lastServiceOn: '2026-03-12',
          nextServiceOn: '2027-03-12',
          maintainer: 'Pyro Service SRL',
        },
      ])
    );
  });

  it('deletes only after a confirmation that names the last extinguisher', async () => {
    mockApi({ equipment: [officeP6] });
    mount();
    const user = userEvent.setup();

    const officeCard = await cardOf('Sediu social');
    await user.click(within(officeCard).getByTestId('fire-equipment-actions'));
    await user.click(await screen.findByTestId('fire-equipment-delete'));
    const dialog = await screen.findByTestId('fire-means-delete-dialog');
    expect(dialog.textContent).toContain('Stingător P6 de la Sediu social');
    expect(dialog.textContent).toContain('singurul stingător');
    expect(requests(`${equipmentPath}/${officeP6.id}`, 'DELETE')).toEqual([]);

    await user.click(within(dialog).getByTestId('fire-means-delete-confirm'));
    await waitFor(() =>
      expect(requests(`${equipmentPath}/${officeP6.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(await screen.findByText('Echipamentul a fost șters.')).toBeTruthy();
  });

  it('adds an installation, asking a description only of another kind', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const shopCard = await cardOf('Gelaterie Timișoara');
    await user.click(within(shopCard).getByTestId('fire-installation-add'));
    const dialog = await screen.findByTestId('fire-installation-dialog');
    await user.selectOptions(within(dialog).getByTestId('fire-installation-kind'), 'other');
    await user.click(within(dialog).getByTestId('fire-installation-save'));
    expect(
      (await within(dialog).findByTestId('fire-installation-description-error')).textContent
    ).toBe('Descrie instalația.');

    await user.selectOptions(
      within(dialog).getByTestId('fire-installation-kind'),
      'interior_hydrants'
    );
    await user.type(within(dialog).getByTestId('fire-installation-maintainer'), 'Hidro SRL');
    await user.click(within(dialog).getByTestId('fire-installation-save'));
    await waitFor(() =>
      expect(requests(installationsPath, 'POST')).toEqual([
        {
          workplaceId: shop.id,
          kind: 'interior_hydrants',
          description: null,
          maintainer: 'Hidro SRL',
          lastCheckOn: null,
          nextCheckOn: null,
        },
      ])
    );
  });

  it('reports a workplace archived meanwhile on the workplace field', async () => {
    mockApi({
      createEquipment: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'x',
            issues: [{ path: 'workplaceId', message: 'x' }],
          },
          { status: 400 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(within(await cardOf('Sediu social')).getByTestId('fire-equipment-add'));
    await user.selectOptions(await screen.findByTestId('fire-equipment-agent'), 'powder');
    await user.type(screen.getByTestId('fire-equipment-capacity'), '6');
    await user.click(screen.getByTestId('fire-equipment-save'));

    expect((await screen.findByTestId('fire-equipment-workplace-error')).textContent).toContain(
      'arhivat'
    );
  });

  it('lands on the first workplace without an extinguisher for ?focus=fire-equipment', async () => {
    mockApi();
    const runtime = mount('?focus=fire-equipment');

    const dialog = await screen.findByTestId('fire-equipment-dialog');
    expect(within(dialog).getByTestId<HTMLSelectElement>('fire-equipment-workplace').value).toBe(
      shop.id
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('fire-equipment-agent'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('points to the details when the client has no workplace', async () => {
    mockApi({ workplaces: [], equipment: [], installations: [] });
    mount();

    const empty = await screen.findByTestId('fire-means-no-workplace');
    expect(
      within(empty).getByRole('link', { name: 'Adaugă un loc de muncă' }).getAttribute('href')
    ).toBe(`/clients/${clientId}/details?focus=add-workplace`);
  });

  it('shows an archived client the means without add or row actions', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect(await screen.findAllByTestId('fire-equipment-row')).toHaveLength(3);
    expect(screen.queryByTestId('fire-equipment-add')).toBeNull();
    expect(screen.queryByTestId('fire-installation-add')).toBeNull();
    expect(screen.queryByTestId('fire-equipment-actions')).toBeNull();
  });
});
