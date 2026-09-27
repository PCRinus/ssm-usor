import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';
import { instructionStateLabel, moduleCountLabel } from './instruction-schema';

// The real editor is three megabytes of layout engine and needs a browser; the flow tests
// drive it. Here a stand-in reports ready and changes on demand.
const editorMock = vi.hoisted(() => ({ saved: new Uint8Array([80, 75, 3, 4, 9]) }));
vi.mock('../documents/document-editor', async () => {
  const { useEffect, useImperativeHandle } = await import('react');
  return {
    default: function FakeEditor(props: {
      bytes: Uint8Array;
      title: string;
      editable: boolean;
      back: React.ReactNode;
      handle: React.Ref<{
        save: () => Promise<Uint8Array | null>;
        copy: () => Promise<Uint8Array | null>;
      }>;
      actions: React.ReactNode;
      onReady: () => void;
      onChange: () => void;
    }) {
      useImperativeHandle(props.handle, () => ({
        save: async () => editorMock.saved,
        copy: async () => editorMock.saved,
      }));
      useEffect(() => {
        props.onReady();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like the real editor
      }, []);
      return (
        <div data-testid="fake-editor" data-editable={props.editable}>
          <header>
            {props.back}
            {props.title}
            {props.actions}
          </header>
          <button type="button" data-testid="fake-type" onClick={props.onChange}>
            type
          </button>
        </div>
      );
    },
  };
});

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

const version = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  number: 2,
  sha256: 'a'.repeat(64),
  sizeBytes: 4321,
  articleCount: 12,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const ladders = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  title: 'Scări metalice',
  group: 'work_equipment',
  archivedAt: null as string | null,
  version,
  appliedCount: 2,
  createdAt: '2026-09-26T09:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
};
const offices = {
  ...ladders,
  id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  title: 'Activități de birou',
  group: 'work_activity',
  version: { ...version, number: 1, articleCount: 0 },
  appliedCount: 0,
};
const welding = {
  ...ladders,
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  title: 'Sudură oxiacetilenică',
  version: { ...version, number: 1 },
  appliedCount: 0,
};

const welder = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Sudor',
  staffCategory: 'execution',
  workZone: 'Atelier',
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 3,
  needsProtectiveEquipment: true,
  equipmentCount: 2,
  needsInstructions: true as boolean | null,
  instructionCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};
const fitter = {
  ...welder,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Lăcătuș mecanic',
  needsInstructions: null,
  instructionCount: 0,
};

const applied = (module: typeof ladders) => ({
  moduleId: module.id,
  title: module.title,
  group: module.group,
  archivedAt: module.archivedAt,
});

type Route = (init: RequestInit | undefined, url: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  modules = [offices, ladders] as unknown[],
  archived = [] as unknown[],
  instructions = {
    [welder.id]: { items: [applied(ladders)], needsInstructions: true },
    [fitter.id]: { items: [], needsInstructions: null },
  } as Record<string, unknown>,
  create = (() => Response.json({ module: welding }, { status: 201 })) as Route,
  upload = (() => Response.json({ module: welding }, { status: 201 })) as Route,
  update = ((init, url) =>
    Response.json({
      module: { ...ladders, id: url.pathname.split('/')[2], ...JSON.parse(String(init?.body)) },
    })) as Route,
  apply = ((init) => {
    const { moduleIds } = JSON.parse(String(init?.body)) as { moduleIds: string[] };
    const items = [offices, ladders].filter((module) => moduleIds.includes(module.id)).map(applied);
    return Response.json({ items, needsInstructions: items.length > 0 ? true : null });
  }) as Route,
  decide = ((init, url) =>
    Response.json({
      jobPosition: {
        ...(url.pathname.includes(fitter.id) ? fitter : welder),
        ...JSON.parse(String(init?.body)),
      },
    })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client: sampleClient });
    if (pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: [welder, fitter] });
    }
    if (pathname === '/instruction-modules') {
      if (method === 'POST') return create(init, url);
      return Response.json({
        items: url.searchParams.get('archived') === 'true' ? archived : modules,
      });
    }
    if (pathname === '/instruction-modules/upload') return upload(init, url);
    const moduleMatch = pathname.match(/^\/instruction-modules\/([^/]+)(?:\/(file-link|file))?$/);
    if (moduleMatch) {
      const [, moduleId, part] = moduleMatch;
      if (part === 'file-link') {
        return Response.json({
          url: 'http://localhost:8787/files/module.docx',
          fileName: 'Scări metalice.docx',
          expiresAt: '2026-09-26T10:01:00.000Z',
        });
      }
      if (part === 'file') {
        return Response.json({ module: { ...ladders, version: { ...version, number: 3 } } });
      }
      if (method === 'PATCH') return update(init, url);
      const module = [...(modules as (typeof ladders)[]), welding].find(
        (item) => item.id === moduleId
      );
      return module
        ? Response.json({ module })
        : Response.json({ error: 'not_found', message: 'no' }, { status: 404 });
    }
    if (pathname === '/files/module.docx') {
      return new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 });
    }
    const instructionsMatch = pathname.match(
      /\/job-positions\/([^/]+)\/instructions(?:\/(copy))?$|\/job-positions\/([^/]+)\/instructions-decision$/
    );
    if (instructionsMatch) {
      const positionId = instructionsMatch[1] ?? instructionsMatch[3]!;
      if (pathname.endsWith('/instructions-decision')) return decide(init, url);
      if (instructionsMatch[2] === 'copy') {
        return Response.json({ items: [applied(ladders)], needsInstructions: true });
      }
      if (method === 'PUT') return apply(init, url);
      return Response.json(instructions[positionId]);
    }
    if (pathname.endsWith('/equipment')) {
      return Response.json({ items: [], needsProtectiveEquipment: null });
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
    .map(([, init]) => init);

const bodies = (pathname: string, method: string) =>
  requests(pathname, method).map((init) =>
    init?.body ? (JSON.parse(String(init.body)) as unknown) : null
  );

const mount = (path = '/instructions') => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the instruction library', () => {
  it('lists the modules by group with their version and where they are applied', async () => {
    mockApi();
    mount();
    await screen.findByTestId('instruction-library');
    const rows = await screen.findAllByTestId('instruction-row');
    expect(rows.map((row) => within(row).getByTestId('instruction-open').textContent)).toEqual([
      'Activități de birou',
      'Scări metalice',
    ]);
    expect(within(rows[1]!).getByTestId('instruction-version').textContent).toBe(
      'v2 · 12 articole'
    );
    expect(within(rows[1]!).getByTestId('instruction-applied').textContent).toBe('2 posturi');
    expect(within(rows[0]!).getByTestId('instruction-version').textContent).toBe(
      'v1 · fără articole numerotate'
    );
  });

  it('shows the archive on demand', async () => {
    mockApi({ archived: [{ ...welding, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('instruction-toggle-archived'));
    await waitFor(() =>
      expect(screen.getAllByTestId('instruction-row').map((row) => row.textContent)).toEqual([
        expect.stringContaining('Sudură oxiacetilenică'),
      ])
    );
    await user.click(screen.getByTestId('instruction-actions'));
    expect(await screen.findByTestId('instruction-restore')).toBeTruthy();
  });

  it('starts a module from the skeleton and opens it in the editor', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('instruction-write'));
    await user.type(screen.getByTestId('instruction-module-title'), 'Sudură oxiacetilenică');
    await user.selectOptions(screen.getByTestId('instruction-module-group'), 'work_equipment');
    await user.click(screen.getByTestId('instruction-module-submit'));
    await waitFor(() =>
      expect(bodies('/instruction-modules', 'POST')).toEqual([
        { title: 'Sudură oxiacetilenică', group: 'work_equipment' },
      ])
    );
    expect(await screen.findByTestId('fake-editor')).toBeTruthy();
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 1');
  });

  it('uploads several files, one request each', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    await user.upload(screen.getByTestId('instruction-file-input'), [
      new File([new Uint8Array([80, 75, 3, 4])], 'Scari.docx', { type: docxType }),
      new File([new Uint8Array([80, 75, 3, 4])], 'Birouri.docx', { type: docxType }),
    ]);
    await waitFor(() => expect(requests('/instruction-modules/upload', 'POST')).toHaveLength(2));
    expect(await screen.findByTestId('instruction-uploaded')).toBeTruthy();
  });

  it('refuses to archive a module a position applies, in words', async () => {
    mockApi({
      update: () =>
        Response.json(
          { error: 'conflict', message: 'applied', reason: 'instruction_module_applied' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instruction-row');
    await user.click(within(rows[1]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-archive'));
    expect((await screen.findByTestId('instruction-error')).textContent).toContain(
      'aplicată la 2 posturi'
    );
  });
});

describe('the module editor', () => {
  it('opens the current file and saves the next version', async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    expect(await screen.findByTestId('fake-editor')).toBeTruthy();
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2');
    await user.click(screen.getByTestId('fake-type'));
    expect(screen.getByTestId('editor-saved-state').textContent).toBe('Modificări nesalvate');
    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(requests(`/instruction-modules/${ladders.id}/file`, 'PUT')).toHaveLength(1)
    );
    expect(screen.getByTestId('editor-saved-state').textContent).toBe('Salvat');
  });

  it('reads an archived module without editing it', async () => {
    mockApi({ modules: [{ ...ladders, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    mount(`/instructions/${ladders.id}`);
    const editor = await screen.findByTestId('fake-editor');
    expect(editor.getAttribute('data-editable')).toBe('false');
    expect(screen.queryByTestId('editor-save')).toBeNull();
  });
});

describe("a job position's instructions", () => {
  const positionsPath = `/clients/${clientId}/job-positions`;

  it('lists the applied modules and the state in the positions table', async () => {
    mockApi();
    mount(positionsPath);
    const rows = await screen.findAllByTestId('job-position-row');
    expect(
      rows.map((row) => within(row).getByTestId('job-position-instructions').textContent)
    ).toEqual(['1 instrucțiune', 'Nedecis']);
  });

  it('records that a post needs none, and takes it back', async () => {
    mockApi();
    mount(`${positionsPath}/${fitter.id}`);
    const user = userEvent.setup();
    expect((await screen.findByTestId('instructions-empty')).textContent).toContain(
      'nu se pot genera'
    );
    mockApi({ instructions: { [fitter.id]: { items: [], needsInstructions: false } } });
    await user.click(screen.getByTestId('instructions-decide-none'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions-decision`, 'PATCH')).toEqual([
        { needsInstructions: false },
      ])
    );
    expect((await screen.findByTestId('instructions-none')).textContent).toContain(
      'nu necesită instrucțiuni'
    );
    mockApi();
    await user.click(screen.getByTestId('instructions-undecide'));
    await screen.findByTestId('instructions-empty');
  });

  it('picks modules from the library and replaces the set', async () => {
    mockApi();
    mount(`${positionsPath}/${welder.id}`);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instructions-row');
    expect(rows.map((row) => within(row).getByTestId('instructions-open').textContent)).toEqual([
      'Scări metalice',
    ]);
    await user.click(screen.getByTestId('instructions-pick'));
    const options = await screen.findAllByTestId('instructions-pick-option');
    expect(options).toHaveLength(2);
    await user.click(options[0]!);
    await user.click(screen.getByTestId('instructions-pick-save'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${welder.id}/instructions`, 'PUT')).toEqual([
        { moduleIds: [ladders.id, offices.id] },
      ])
    );
  });

  it('removes a module from the row', async () => {
    mockApi();
    mount(`${positionsPath}/${welder.id}`);
    const user = userEvent.setup();
    await screen.findAllByTestId('instructions-row');
    await user.click(screen.getByTestId('instructions-remove'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${welder.id}/instructions`, 'PUT')).toEqual([
        { moduleIds: [] },
      ])
    );
  });
});

describe('labels', () => {
  it('counts modules and states in Romanian', () => {
    expect(moduleCountLabel(0)).toBe('Nicio instrucțiune');
    expect(moduleCountLabel(1)).toBe('O instrucțiune');
    expect(moduleCountLabel(3)).toBe('3 instrucțiuni');
    expect(moduleCountLabel(21)).toBe('21 de instrucțiuni');
    expect(instructionStateLabel({ needsInstructions: null, instructionCount: 0 })).toBe('Nedecis');
    expect(instructionStateLabel({ needsInstructions: false, instructionCount: 0 })).toBe(
      'Nu necesită'
    );
    expect(instructionStateLabel({ needsInstructions: true, instructionCount: 1 })).toBe(
      '1 instrucțiune'
    );
  });
});
