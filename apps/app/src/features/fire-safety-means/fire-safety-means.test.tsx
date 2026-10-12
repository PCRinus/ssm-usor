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
  kind: 'fixed_space',
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
  kind: 'fixed_space',
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
const substancesPath = `/clients/${clientId}/fire-substances`;
const maintenancePath = `/clients/${clientId}/fire-maintenance-items`;
const buildingsPath = `/clients/${clientId}/fire-buildings`;

const officeBuilding = {
  ...stamp,
  clientId,
  workplaceId: office.id,
  yearBuilt: 1987 as number | null,
  builtAreaM2: 412.5 as number | null,
  levels: 'P+1E' as string | null,
  classification: 'mixed' as string | null,
  structure: null as string | null,
  heatingFuel: 'gaze naturale' as string | null,
  gasUse: null as string | null,
  electricalMaintainer: 'Electro Serv SRL' as string | null,
  electricalLastCheckOn: '2026-03-12' as string | null,
  waterReserveM3: 0 as number | null,
  notes: null as string | null,
};

const chimney = {
  ...stamp,
  id: '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  clientId,
  workplaceId: office.id,
  subject: 'Coșul de fum al centralei termice',
  intervalLabel: 'anual',
  checkedBy: 'Firmă autorizată de coșerit',
};

const propane = {
  ...stamp,
  id: '4a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  clientId,
  name: 'Propan',
  classification: 'Flam. Gas 1, H220',
  quantity: '2 butelii de 11 kg',
  physicalChemicalProperties: null as string | null,
  identificationCodes: 'CAS 74-98-6' as string | null,
  healthEnvironmentRisks: null as string | null,
  protectionMeans: null as string | null,
  interventionMeasures: null as string | null,
  extinguishingAgents: null as string | null,
  storagePlace: 'Cușca metalică din curte' as string | null,
  handling: null as string | null,
};

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  workplaces = [office, shop] as unknown[],
  equipment = [officeP6, officeG3, shopSand] as unknown[],
  installations = [alarm] as unknown[],
  maintenanceItems = [chimney] as unknown[],
  buildings = [officeBuilding] as unknown[],
  saveBuilding = ((init) =>
    Response.json({ building: { ...officeBuilding, ...JSON.parse(String(init?.body)) } })) as Route,
  createEquipment = ((init) =>
    Response.json(
      { equipment: { ...unit, id: 'new', ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  updateEquipment = ((init) =>
    Response.json({ equipment: { ...officeP6, ...JSON.parse(String(init?.body)) } })) as Route,
  deleteEquipment = (() => new Response(null, { status: 204 })) as Route,
  substancesState = 'none',
  substances = [] as unknown[],
  saveState = ((init) => Response.json(JSON.parse(String(init?.body)))) as Route,
  createSubstance = ((init) =>
    Response.json(
      { substance: { ...propane, id: 'new', ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
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
    if (pathname === maintenancePath) {
      return method === 'POST'
        ? Response.json(
            { item: { ...chimney, id: 'new', ...JSON.parse(String(init?.body)) } },
            { status: 201 }
          )
        : Response.json({ items: maintenanceItems });
    }
    if (pathname.startsWith(`${maintenancePath}/`)) {
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ item: { ...chimney, ...JSON.parse(String(init?.body)) } });
    }
    if (pathname === buildingsPath) return Response.json({ items: buildings });
    if (pathname.startsWith(`${buildingsPath}/`)) {
      return method === 'DELETE' ? new Response(null, { status: 204 }) : saveBuilding(init);
    }
    if (pathname === substancesPath) {
      return method === 'POST'
        ? createSubstance(init)
        : Response.json({ state: substancesState, items: substances });
    }
    if (pathname === `${substancesPath}/state`) return saveState(init);
    if (pathname.startsWith(`${substancesPath}/`)) {
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ substance: { ...propane, ...JSON.parse(String(init?.body)) } });
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
  const fixed = 'fixed_space' as const;

  it('rounds the area up by the norm, and counts dwellings by level', () => {
    expect(
      extinguisherHint(2, { kind: fixed, floorAreaM2: 450, extinguisherNorm: 'administrative_300' })
    ).toBe('2 stingătoare · minim orientativ 2 (anexa 6)');
    expect(
      extinguisherHint(1, { kind: fixed, floorAreaM2: 60, extinguisherNorm: 'commercial_200' })
    ).toBe('1 stingător · minim orientativ 1 (anexa 6)');
    expect(
      extinguisherHint(0, { kind: fixed, floorAreaM2: 90, extinguisherNorm: 'residential_level' })
    ).toBe('Niciun stingător · cel puțin unul pe nivel (anexa 6)');
    expect(
      extinguisherHint(3, { kind: fixed, floorAreaM2: null, extinguisherNorm: 'other_150' })
    ).toBeNull();
    expect(
      extinguisherHint(3, { kind: fixed, floorAreaM2: 100, extinguisherNorm: null })
    ).toBeNull();
  });

  it('gives no minimum for a space with no norm or a mobile site, whatever it kept', () => {
    expect(extinguisherHint(1, { kind: fixed, floorAreaM2: 80, extinguisherNorm: 'none' })).toBe(
      '1 stingător · fără normă din anexa 6'
    );
    expect(
      extinguisherHint(2, {
        kind: 'mobile_site',
        floorAreaM2: 450,
        extinguisherNorm: 'commercial_200',
      })
    ).toBe('2 stingătoare · fără normă din anexa 6');
    expect(
      extinguisherHint(0, { kind: 'mobile_site', floorAreaM2: null, extinguisherNorm: null })
    ).toBe('Niciun stingător · fără normă din anexa 6');
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

  it('lists the other periodic checks of each workplace, optional and empty by default', async () => {
    mockApi();
    mount();

    const officeCard = await cardOf('Sediu social');
    const [row] = within(officeCard).getAllByTestId('fire-maintenance-row');
    expect(row!.textContent).toBe(
      'Coșul de fum al centralei termiceanualFirmă autorizată de coșerit'
    );
    const shopCard = await cardOf('Gelaterie Timișoara');
    expect(within(shopCard).getByTestId('fire-maintenance-empty').textContent).toContain(
      'cerute de la 10 angajați'
    );
  });

  it('adds a periodic check to the workplace whose card asked, asking all three texts', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(
      within(await cardOf('Gelaterie Timișoara')).getByTestId('fire-maintenance-add')
    );
    const dialog = await screen.findByTestId('fire-maintenance-dialog');
    expect(within(dialog).getByTestId<HTMLSelectElement>('fire-maintenance-workplace').value).toBe(
      shop.id
    );
    await user.click(within(dialog).getByTestId('fire-maintenance-save'));
    expect((await within(dialog).findByTestId('fire-maintenance-interval-error')).textContent).toBe(
      'Scrie cât de des se verifică.'
    );
    expect(requests(maintenancePath, 'POST')).toEqual([]);

    await user.type(
      within(dialog).getByTestId('fire-maintenance-subject'),
      ' Instalația de gaze naturale '
    );
    await user.type(within(dialog).getByTestId('fire-maintenance-interval'), 'anual');
    await user.type(
      within(dialog).getByTestId('fire-maintenance-checked-by'),
      'Operatorul de distribuție'
    );
    await user.click(within(dialog).getByTestId('fire-maintenance-save'));
    await waitFor(() =>
      expect(requests(maintenancePath, 'POST')).toEqual([
        {
          workplaceId: shop.id,
          subject: 'Instalația de gaze naturale',
          intervalLabel: 'anual',
          checkedBy: 'Operatorul de distribuție',
        },
      ])
    );
    expect(await screen.findByText('Verificarea a fost adăugată.')).toBeTruthy();
  });

  it('edits a periodic check from its row and deletes one after a confirmation', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Coșul de fum al centralei termice'));
    const dialog = await screen.findByTestId('fire-maintenance-dialog');
    const interval = within(dialog).getByTestId<HTMLInputElement>('fire-maintenance-interval');
    expect(interval.value).toBe('anual');
    await user.clear(interval);
    await user.type(interval, 'de două ori pe an');
    await user.click(within(dialog).getByTestId('fire-maintenance-save'));
    await waitFor(() =>
      expect(requests(`${maintenancePath}/${chimney.id}`, 'PUT')).toEqual([
        {
          workplaceId: office.id,
          subject: 'Coșul de fum al centralei termice',
          intervalLabel: 'de două ori pe an',
          checkedBy: 'Firmă autorizată de coșerit',
        },
      ])
    );
    await waitFor(() => expect(screen.queryByTestId('fire-maintenance-dialog')).toBeNull());

    await user.click(within(await cardOf('Sediu social')).getByTestId('fire-maintenance-actions'));
    await user.click(await screen.findByTestId('fire-maintenance-delete'));
    const confirm = await screen.findByTestId('fire-means-delete-dialog');
    expect(confirm.textContent).toContain('Ștergi verificarea?');
    expect(confirm.textContent).toContain('Coșul de fum al centralei termice de la Sediu social');
    await user.click(within(confirm).getByTestId('fire-means-delete-confirm'));
    await waitFor(() =>
      expect(requests(`${maintenancePath}/${chimney.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(await screen.findByText('Verificarea a fost ștearsă.')).toBeTruthy();
  });

  it("shows the facts of a fixed space's building, and invites to fill them in where there are none", async () => {
    mockApi({
      workplaces: [office, shop, { ...shop, id: 'site', name: 'Șantier', kind: 'mobile_site' }],
    });
    mount();

    const officeCard = await cardOf('Sediu social');
    const facts = within(officeCard).getByTestId('fire-building-facts');
    expect(
      within(facts)
        .getAllByRole('definition')
        .map((fact) => fact.textContent)
    ).toEqual([
      '1987',
      '412,5 m²',
      'P+1E',
      'cu funcțiuni mixte',
      'gaze naturale',
      'întreținută de Electro Serv SRL, verificată la 12.03.2026',
      '0 m³',
    ]);
    expect(within(officeCard).getByTestId('fire-building-edit').textContent).toBe('Modifică');
    const shopCard = await cardOf('Gelaterie Timișoara');
    expect(within(shopCard).getByTestId('fire-building-empty').textContent).toContain(
      'fișa obiectivului, cerută de la 10 angajați'
    );
    expect(within(shopCard).getByTestId('fire-building-edit').textContent).toBe('Completează');
    expect(within(await cardOf('Șantier')).queryByTestId('fire-building-edit')).toBeNull();
  });

  it("saves a building's facts, every one optional, with the decimal comma", async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(within(await cardOf('Gelaterie Timișoara')).getByTestId('fire-building-edit'));
    const dialog = await screen.findByTestId('fire-building-dialog');
    expect(within(dialog).getByRole('heading', { name: 'Construcția' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Utilități' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Apa pentru stingere' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Observații' })).toBeTruthy();
    await user.type(within(dialog).getByTestId('fire-building-year'), '3000');
    await user.click(within(dialog).getByTestId('fire-building-save'));
    expect((await within(dialog).findByTestId('fire-building-year-error')).textContent).toContain(
      'Introdu un an între 1800 și'
    );
    await user.clear(within(dialog).getByTestId('fire-building-year'));
    await user.type(within(dialog).getByTestId('fire-building-year'), '1998');
    await user.type(within(dialog).getByTestId('fire-building-area'), '85,5');
    await user.selectOptions(within(dialog).getByTestId('fire-building-classification'), 'civil');
    await user.type(within(dialog).getByTestId('fire-building-water-reserve'), '0');
    await user.click(within(dialog).getByTestId('fire-building-save'));
    await waitFor(() =>
      expect(requests(`${buildingsPath}/${shop.id}`, 'PUT')).toEqual([
        {
          yearBuilt: 1998,
          builtAreaM2: 85.5,
          levels: null,
          classification: 'civil',
          structure: null,
          heatingFuel: null,
          gasUse: null,
          electricalMaintainer: null,
          electricalLastCheckOn: null,
          waterReserveM3: 0,
          notes: null,
        },
      ])
    );
    expect(await screen.findByText('Datele clădirii au fost salvate.')).toBeTruthy();
  });

  it('clears a building when every field is emptied, and saves nothing for a building never filled in', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(within(await cardOf('Sediu social')).getByTestId('fire-building-edit'));
    let dialog = await screen.findByTestId('fire-building-dialog');
    expect(within(dialog).getByTestId<HTMLInputElement>('fire-building-area').value).toBe('412,5');
    for (const id of [
      'fire-building-year',
      'fire-building-area',
      'fire-building-levels',
      'fire-building-heating-fuel',
      'fire-building-electrical-maintainer',
      'fire-building-water-reserve',
      'fire-building-electrical-check',
    ]) {
      await user.clear(within(dialog).getByTestId(id));
    }
    await user.selectOptions(within(dialog).getByTestId('fire-building-classification'), '');
    await user.click(within(dialog).getByTestId('fire-building-save'));
    await waitFor(() =>
      expect(requests(`${buildingsPath}/${office.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(requests(`${buildingsPath}/${office.id}`, 'PUT')).toEqual([]);

    await user.click(within(await cardOf('Gelaterie Timișoara')).getByTestId('fire-building-edit'));
    dialog = await screen.findByTestId('fire-building-dialog');
    await user.click(within(dialog).getByTestId('fire-building-save'));
    await waitFor(() => expect(screen.queryByTestId('fire-building-dialog')).toBeNull());
    expect(requests(`${buildingsPath}/${shop.id}`, 'PUT')).toEqual([]);
    expect(requests(`${buildingsPath}/${shop.id}`, 'DELETE')).toEqual([]);
  });

  it('says so when the workplace became a mobile site meanwhile', async () => {
    mockApi({
      saveBuilding: () => Response.json({ error: 'conflict', message: 'x' }, { status: 409 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(within(await cardOf('Sediu social')).getByTestId('fire-building-edit'));
    const dialog = await screen.findByTestId('fire-building-dialog');
    await user.click(within(dialog).getByTestId('fire-building-save'));
    expect((await within(dialog).findByTestId('fire-building-error')).textContent).toBe(
      'Locul de muncă a devenit un șantier temporar sau mobil, care nu are clădire.'
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
    mockApi({
      workplaces: [],
      equipment: [],
      installations: [],
      maintenanceItems: [],
      buildings: [],
    });
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
    expect(screen.queryByTestId('fire-building-edit')).toBeNull();
    expect(screen.getByTestId('fire-building-facts')).toBeTruthy();
  });
});

describe('client dangerous substances', () => {
  const card = async () => {
    await screen.findByTestId('fire-substances-state');
    return screen.getByTestId('fire-substances-card');
  };

  it('asks whether the client uses dangerous substances until a member says so', async () => {
    mockApi({ substancesState: 'undecided' });
    mount();
    const user = userEvent.setup();

    const substances = await card();
    expect(within(substances).getByTestId('fire-substances-state').textContent).toBe('Nedecis');
    expect(within(substances).getByTestId('fire-substances-undecided')).toBeTruthy();
    expect(within(substances).queryByTestId('fire-substance-add')).toBeNull();

    await user.click(within(substances).getByText('Nu se utilizează substanțe periculoase'));
    await waitFor(() =>
      expect(requests(`${substancesPath}/state`, 'PUT')).toEqual([{ state: 'none' }])
    );
    expect(
      await screen.findByText('Am notat că clientul nu utilizează substanțe periculoase.')
    ).toBeTruthy();
  });

  it('declares none without a list', async () => {
    mockApi({ substancesState: 'none' });
    mount();

    const substances = await card();
    expect(within(substances).getByTestId('fire-substances-state').textContent).toBe(
      'Nu se utilizează'
    );
    expect(within(substances).getByTestId('fire-substances-none').textContent).toContain(
      'nu utilizează substanțe periculoase'
    );
    expect(within(substances).queryByTestId('fire-substance-add')).toBeNull();
  });

  it('lists the substances with the texts of their data sheet still to fill in', async () => {
    mockApi({ substancesState: 'listed', substances: [propane] });
    mount();

    const substances = await card();
    expect(within(substances).getByTestId('fire-substances-state').textContent).toBe('1 substanță');
    const row = within(substances).getByTestId('fire-substance-row');
    expect(row.textContent).toContain('Propan');
    expect(row.textContent).toContain('Flam. Gas 1, H220');
    expect(row.textContent).toContain('2 butelii de 11 kg');
    expect(within(row).getByTestId('fire-substance-details').textContent).toBe(
      '6 câmpuri de completat în document'
    );
    expect(
      within(substances)
        .getByTestId<HTMLInputElement>('fire-substances-choice-none')
        .querySelector('input')!.disabled
    ).toBe(true);
  });

  it('adds a substance with its three required fields and the data sheet texts typed', async () => {
    mockApi({ substancesState: 'listed', substances: [] });
    mount();
    const user = userEvent.setup();

    const substances = await card();
    expect(within(substances).getByTestId('fire-substances-empty')).toBeTruthy();
    await user.click(within(substances).getByTestId('fire-substance-add'));
    const dialog = await screen.findByTestId('fire-substance-dialog');
    expect(dialog.textContent).toContain('fișa cu date de securitate, secțiunea 9');
    expect(dialog.textContent).toContain('fișa cu date de securitate, secțiunile 4, 5 și 6');
    await user.click(within(dialog).getByTestId('fire-substance-save'));
    expect((await within(dialog).findByTestId('fire-substance-name-error')).textContent).toBe(
      'Scrie denumirea substanței.'
    );
    expect(within(dialog).getByTestId('fire-substance-classification-error')).toBeTruthy();
    expect(within(dialog).getByTestId('fire-substance-quantity-error')).toBeTruthy();

    await user.type(within(dialog).getByTestId('fire-substance-name'), 'Diluant');
    await user.type(
      within(dialog).getByTestId('fire-substance-classification'),
      'Flam. Liq. 2, H225'
    );
    await user.type(within(dialog).getByTestId('fire-substance-quantity'), '5 l');
    await user.type(within(dialog).getByTestId('fire-substance-storage'), 'Dulapul metalic');
    await user.click(within(dialog).getByTestId('fire-substance-save'));

    await waitFor(() =>
      expect(requests(substancesPath, 'POST')).toEqual([
        {
          name: 'Diluant',
          classification: 'Flam. Liq. 2, H225',
          quantity: '5 l',
          physicalChemicalProperties: null,
          identificationCodes: null,
          healthEnvironmentRisks: null,
          protectionMeans: null,
          interventionMeasures: null,
          extinguishingAgents: null,
          storagePlace: 'Dulapul metalic',
          handling: null,
        },
      ])
    );
    expect(await screen.findByText('Substanța a fost adăugată.')).toBeTruthy();
  });

  it('edits a substance from its row, clearing a text', async () => {
    mockApi({ substancesState: 'listed', substances: [propane] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByText('2 butelii de 11 kg'));
    const dialog = await screen.findByTestId('fire-substance-dialog');
    await user.clear(within(dialog).getByTestId('fire-substance-storage'));
    await user.click(within(dialog).getByTestId('fire-substance-save'));
    await waitFor(() =>
      expect(requests(`${substancesPath}/${propane.id}`, 'PUT')).toEqual([
        expect.objectContaining({
          name: 'Propan',
          identificationCodes: 'CAS 74-98-6',
          storagePlace: null,
        }),
      ])
    );
  });

  it('deletes after a confirmation that says the list then blocks the documents', async () => {
    mockApi({ substancesState: 'listed', substances: [propane] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-substance-actions'));
    await user.click(await screen.findByTestId('fire-substance-delete'));
    const dialog = await screen.findByTestId('fire-substance-delete-dialog');
    expect(dialog.textContent).toContain('Este singura din listă');
    await user.click(within(dialog).getByTestId('fire-substance-delete-confirm'));
    await waitFor(() =>
      expect(requests(`${substancesPath}/${propane.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(await screen.findByText('Substanța „Propan” a fost ștearsă.')).toBeTruthy();
  });

  it('says why none is refused while substances are listed', async () => {
    mockApi({
      substancesState: 'undecided',
      saveState: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'substances_listed' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(within(await card()).getByText('Nu se utilizează substanțe periculoase'));
    expect((await screen.findByTestId('fire-substances-error')).textContent).toContain('șterge-le');
  });

  it('opens the dialog for ?focus=fire-substances when the list is chosen but empty', async () => {
    mockApi({ substancesState: 'listed', substances: [] });
    const runtime = mount('?focus=fire-substances');

    await screen.findByTestId('fire-substance-dialog');
    await waitFor(() => expect(document.activeElement?.id).toBe('fire-substance-name'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('points at the choice for ?focus=fire-substances while undecided', async () => {
    mockApi({ substancesState: 'undecided' });
    mount('?focus=fire-substances');

    await waitFor(() => expect(document.activeElement?.id).toBe('fire-substances-choice-none'));
    expect(screen.queryByTestId('fire-substance-dialog')).toBeNull();
  });

  it('is asked also of a client without workplaces', async () => {
    mockApi({
      workplaces: [],
      equipment: [],
      installations: [],
      maintenanceItems: [],
      substancesState: 'undecided',
    });
    mount();

    await screen.findByTestId('fire-means-no-workplace');
    expect(await card()).toBeTruthy();
  });

  it('shows an archived client its substances without the choice or the actions', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      substancesState: 'listed',
      substances: [propane],
    });
    mount();

    const substances = await card();
    expect(within(substances).getByTestId('fire-substance-row')).toBeTruthy();
    expect(within(substances).queryByTestId('fire-substance-add')).toBeNull();
    expect(within(substances).queryByTestId('fire-substance-actions')).toBeNull();
    for (const input of within(substances).getAllByRole('radio')) {
      expect(input.matches(':disabled')).toBe(true);
    }
  });
});
