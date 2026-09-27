import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';
import { entryCountLabel, equipmentStateLabel, quantityLabel } from './equipment-schema';

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

const welder = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Sudor',
  staffCategory: 'execution',
  workZone: 'Atelier',
  activities: 'Sudură electrică și autogenă.',
  trainingIntervalMonths: 2 as number | null,
  employeeCount: 3,
  needsProtectiveEquipment: true as boolean | null,
  equipmentCount: 2,
  needsInstructions: null as boolean | null,
  instructionCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};
const fitter = {
  ...welder,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Lăcătuș mecanic',
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 0,
  needsProtectiveEquipment: null,
  equipmentCount: 0,
  needsInstructions: null as boolean | null,
  instructionCount: 0,
};

const mask = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  jobPositionId: welder.id,
  risk: 'Radiații, împroșcare (față, ochi)',
  item: 'Mască de sudură',
  quantity: 1,
  durationMonths: 24 as number | null,
  allocation: 'section_inventory',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
};
const gloves = {
  ...mask,
  id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  risk: 'Căldură, foc (mâini)',
  item: 'Mănuși de sudor',
  quantity: 2,
  durationMonths: 3,
  allocation: 'personal_inventory',
};

const positionsPath = `/clients/${clientId}/job-positions`;
const welderPath = `${positionsPath}/${welder.id}`;
const fitterPath = `${positionsPath}/${fitter.id}`;

type Route = (init: RequestInit | undefined, url: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  positions = [welder, fitter] as unknown[],
  equipment = {
    [welder.id]: { items: [mask, gloves], needsProtectiveEquipment: true },
    [fitter.id]: { items: [], needsProtectiveEquipment: null },
  } as Record<string, unknown>,
  create = ((init) =>
    Response.json(
      { entry: { ...mask, id: 'new-entry', ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  update = ((init) =>
    Response.json({ entry: { ...mask, ...JSON.parse(String(init?.body)) } })) as Route,
  remove = (() => new Response(null, { status: 204 })) as Route,
  decide = ((init, url) =>
    Response.json({
      jobPosition: {
        ...(url.pathname.includes(fitter.id) ? fitter : welder),
        ...JSON.parse(String(init?.body)),
      },
    })) as Route,
  copy = (() => Response.json({ items: [mask, gloves], needsProtectiveEquipment: true })) as Route,
  suggestions = (() => Response.json({ items: ['Mască de sudură', 'Mănuși de sudor'] })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === positionsPath) return Response.json({ items: positions });
    if (pathname === '/equipment-suggestions') return suggestions(init, url);
    const equipmentMatch = pathname.match(/\/job-positions\/([^/]+)\/equipment(?:\/([^/]+))?$/);
    if (equipmentMatch) {
      const [, positionId, entryId] = equipmentMatch;
      if (entryId === 'copy') return copy(init, url);
      if (entryId) return method === 'DELETE' ? remove(init, url) : update(init, url);
      if (method === 'POST') return create(init, url);
      return Response.json(equipment[positionId!]);
    }
    if (pathname.endsWith('/protective-equipment')) return decide(init, url);
    if (pathname.endsWith('/instructions')) {
      return Response.json({ items: [], needsInstructions: null });
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

const mount = (path = welderPath) => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("a job position's page", () => {
  it('shows the post, its people and its equipment entries', async () => {
    mockApi();
    mount();
    await screen.findByTestId('job-position-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Sudor' })).toBeTruthy();
    expect(screen.getByText('Personal de execuție')).toBeTruthy();
    expect(screen.getByText('la 2 luni')).toBeTruthy();
    expect(screen.getByTestId('job-position-employees-link').textContent).toBe('3 angajați');
    expect(screen.getByText('Sudură electrică și autogenă.')).toBeTruthy();

    const rows = await screen.findAllByTestId('equipment-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Mască de sudură');
    expect(within(rows[0]!).getByTestId('equipment-quantity-cell').textContent).toBe(
      '1 buc. / 24 luni'
    );
    expect(rows[0]!.textContent).toContain('Inventar de secție');
    expect(within(rows[1]!).getByTestId('equipment-quantity-cell').textContent).toBe(
      '2 buc. / 3 luni'
    );
    expect(screen.getByTestId('equipment-state').textContent).toBe('2 articole');
  });

  it('is not found for a position the client does not have', async () => {
    mockApi({ positions: [fitter] });
    mount();
    expect(await screen.findByTestId('job-position-not-found')).toBeTruthy();
  });

  it('edits the post from its page', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('job-position-edit'));
    expect(screen.getByTestId<HTMLInputElement>('job-position-name').value).toBe('Sudor');
  });
});

describe("a job position's equipment", () => {
  it('asks for a decision on an undecided post, and records that it needs none', async () => {
    mockApi();
    mount(fitterPath);
    const user = userEvent.setup();
    expect((await screen.findByTestId('equipment-empty')).textContent).toContain(
      'nu se poate genera'
    );
    expect(screen.getByTestId('equipment-state').textContent).toBe('Nedecis');

    mockApi({
      equipment: {
        [fitter.id]: { items: [], needsProtectiveEquipment: false },
      },
    });
    await user.click(screen.getByTestId('equipment-decide-none'));
    await waitFor(() =>
      expect(requests(`${fitterPath}/protective-equipment`, 'PATCH')).toEqual([
        { needsProtectiveEquipment: false },
      ])
    );
    expect((await screen.findByTestId('equipment-none')).textContent).toContain(
      'nu necesită echipament'
    );
    expect(screen.queryByTestId('equipment-add')).toBeNull();

    mockApi();
    await user.click(screen.getByTestId('equipment-undecide'));
    await waitFor(() =>
      expect(requests(`${fitterPath}/protective-equipment`, 'PATCH')).toEqual([
        { needsProtectiveEquipment: false },
        { needsProtectiveEquipment: null },
      ])
    );
    await screen.findByTestId('equipment-empty');
  });

  it('adds an entry, with no duration for a consumable, and offers what was typed before', async () => {
    mockApi();
    mount(fitterPath);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('equipment-add'));
    await user.click(screen.getByTestId('equipment-save'));
    expect(await screen.findByText(/de ce risc protejează/)).toBeTruthy();
    expect(screen.getByText(/la câte luni se înlocuiește/)).toBeTruthy();

    await user.type(screen.getByTestId('equipment-risk'), 'Agenți biologici (mâini)');
    await user.type(screen.getByTestId('equipment-item'), 'Mănuși de unică folosință');
    await waitFor(() =>
      expect(requests('/equipment-suggestions', 'GET').length).toBeGreaterThan(0)
    );
    expect(
      [...document.querySelectorAll('#equipment-item-suggestions option')].map((option) =>
        option.getAttribute('value')
      )
    ).toEqual(['Mască de sudură', 'Mănuși de sudor']);

    await user.selectOptions(screen.getByTestId('equipment-allocation'), 'consumable');
    expect(screen.getByTestId<HTMLInputElement>('equipment-duration').disabled).toBe(true);
    const quantity = screen.getByTestId('equipment-quantity');
    await user.clear(quantity);
    await user.type(quantity, '100');
    await user.click(screen.getByTestId('equipment-save'));

    await waitFor(() => expect(requests(`${fitterPath}/equipment`, 'POST')).toHaveLength(1));
    expect(requests(`${fitterPath}/equipment`, 'POST')[0]).toEqual({
      risk: 'Agenți biologici (mâini)',
      item: 'Mănuși de unică folosință',
      quantity: 100,
      allocation: 'consumable',
      durationMonths: null,
    });
    expect(await screen.findByText('Articolul a fost adăugat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('equipment-dialog')).toBeNull());
  });

  it('edits an entry from its row and removes another', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const rows = await screen.findAllByTestId('equipment-row');
    await user.click(within(rows[1]!).getByTestId('equipment-actions'));
    await user.click(await screen.findByTestId('equipment-edit'));
    expect(screen.getByTestId<HTMLInputElement>('equipment-item').value).toBe('Mănuși de sudor');
    expect(screen.getByTestId<HTMLInputElement>('equipment-quantity').value).toBe('2');
    const duration = screen.getByTestId('equipment-duration');
    await user.clear(duration);
    await user.type(duration, '6');
    await user.click(screen.getByTestId('equipment-save'));
    await waitFor(() =>
      expect(requests(`${welderPath}/equipment/${gloves.id}`, 'PUT')).toHaveLength(1)
    );
    expect(requests(`${welderPath}/equipment/${gloves.id}`, 'PUT')[0]).toMatchObject({
      durationMonths: 6,
      allocation: 'personal_inventory',
    });
    await waitFor(() => expect(screen.queryByTestId('equipment-dialog')).toBeNull());

    await user.click(within(rows[0]!).getByTestId('equipment-actions'));
    await user.click(await screen.findByTestId('equipment-remove'));
    expect((await screen.findByTestId('equipment-remove-dialog')).textContent).toContain(
      'următoarea generare'
    );
    await user.click(screen.getByTestId('equipment-remove-confirm'));
    await waitFor(() =>
      expect(requests(`${welderPath}/equipment/${mask.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(await screen.findByText(/a fost șters\./)).toBeTruthy();
  });

  it('copies the entries of another post of the client', async () => {
    mockApi();
    mount(fitterPath);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('equipment-copy'));
    const source = screen.getByTestId<HTMLSelectElement>('equipment-copy-source');
    expect([...source.options].map((option) => option.textContent)).toEqual([
      'Alege un post…',
      'Sudor (2 articole)',
    ]);
    expect(screen.getByTestId<HTMLButtonElement>('equipment-copy-confirm').disabled).toBe(true);
    await user.selectOptions(source, welder.id);
    await user.click(screen.getByTestId('equipment-copy-confirm'));
    await waitFor(() =>
      expect(requests(`${fitterPath}/equipment/copy`, 'POST')).toEqual([
        { fromJobPositionId: welder.id },
      ])
    );
    expect(await screen.findByText('Postul are acum 2 articole.')).toBeTruthy();
  });

  it('says why "needs none" was refused', async () => {
    mockApi({
      decide: () =>
        Response.json(
          { error: 'conflict', message: 'Entries.', reason: 'equipment_entries_exist' },
          { status: 409 }
        ),
      equipment: { [fitter.id]: { items: [], needsProtectiveEquipment: null } },
    });
    mount(fitterPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('equipment-decide-none'));
    expect((await screen.findByTestId('equipment-error')).textContent).toContain(
      'șterge-le înainte'
    );
  });

  it('is read-only for an archived client', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();
    expect(await screen.findAllByTestId('equipment-row')).toHaveLength(2);
    expect(screen.queryByTestId('equipment-add')).toBeNull();
    expect(screen.queryByTestId('equipment-copy')).toBeNull();
    expect(screen.queryByTestId('equipment-actions')).toBeNull();
    expect(screen.queryByTestId('job-position-edit')).toBeNull();
  });
});

describe('labels', () => {
  it('count entries and read the state the Romanian way', () => {
    expect(entryCountLabel(0)).toBe('Niciun articol');
    expect(entryCountLabel(1)).toBe('Un articol');
    expect(entryCountLabel(3)).toBe('3 articole');
    expect(entryCountLabel(20)).toBe('20 de articole');
    expect(equipmentStateLabel({ needsProtectiveEquipment: null, equipmentCount: 0 })).toBe(
      'Nedecis'
    );
    expect(equipmentStateLabel({ needsProtectiveEquipment: false, equipmentCount: 0 })).toBe(
      'Nu necesită'
    );
    expect(equipmentStateLabel({ needsProtectiveEquipment: true, equipmentCount: 1 })).toBe(
      '1 articol'
    );
    expect(quantityLabel({ quantity: 2, durationMonths: 1 })).toBe('2 buc. / 1 lună');
    expect(quantityLabel({ quantity: 10, durationMonths: null })).toBe('10 buc. / consum');
  });
});
