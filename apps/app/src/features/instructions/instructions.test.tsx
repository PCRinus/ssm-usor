import type { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetInstructionModuleQueryKey } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { instructionStateLabel, moduleCountLabel } from './instruction-schema';

// The real editor is three megabytes of layout engine and needs a browser; the flow tests
// drive it. Here a stand-in reports ready and changes on demand.
const editorMock = vi.hoisted(() => ({ saved: new Uint8Array([80, 75, 3, 4, 9]) }));
vi.mock('@/features/documents/document-editor', async () => {
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

vi.mock('./annex-word-view', async () => {
  const { useEffect } = await import('react');
  return {
    default: function FakeAnnexView({ onReady }: { onReady: () => void }) {
      useEffect(() => {
        onReady();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like the real viewer
      }, []);
      return <div data-testid="fake-annex-view" />;
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
  textHash: 'a'.repeat(64),
  articleCount: 12,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const body = {
  blocks: [{ kind: 'article', paragraphs: ['Scara se sprijină pe o suprafață stabilă.'] }],
};
const ladders = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  title: 'Scări metalice',
  group: 'work_equipment',
  domain: 'ssm',
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
  version: { ...version, number: 1, articleCount: 4 },
  appliedCount: 0,
};
const welding = {
  ...ladders,
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  title: 'Sudură oxiacetilenică',
  version: { ...version, number: 1 },
  appliedCount: 0,
};
const hotWork = {
  ...ladders,
  id: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f70',
  title: 'Lucrul cu foc deschis',
  group: 'hazardous_work',
  domain: 'psi',
  version: { ...version, number: 1, articleCount: 7 },
  appliedCount: 1,
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
  needsFireInstructions: false as boolean | null,
  fireInstructionCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};
const fitter = {
  ...welder,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Lăcătuș mecanic',
  needsInstructions: null,
  instructionCount: 0,
  needsFireInstructions: null,
  fireInstructionCount: 0,
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
  modules = [offices, ladders, hotWork] as (typeof ladders)[],
  archived = [] as (typeof ladders)[],
  instructions = {
    [welder.id]: { items: [applied(ladders)], needsInstructions: true },
    [fitter.id]: { items: [], needsInstructions: null },
  } as Record<string, unknown>,
  fireInstructions = {
    [welder.id]: { items: [], needsInstructions: false },
    [fitter.id]: { items: [], needsInstructions: null },
  } as Record<string, unknown>,
  update = ((init, url) =>
    Response.json({
      module: { ...ladders, id: url.pathname.split('/')[2], ...JSON.parse(String(init?.body)) },
    })) as Route,
  apply = ((init) => {
    const { moduleIds } = JSON.parse(String(init?.body)) as { moduleIds: string[] };
    const items = [offices, ladders, hotWork]
      .filter((module) => moduleIds.includes(module.id))
      .map(applied);
    return Response.json({ items, needsInstructions: items.length > 0 ? true : null });
  }) as Route,
  decide = ((init, url) =>
    Response.json({
      jobPosition: {
        ...(url.pathname.includes(fitter.id) ? fitter : welder),
        ...JSON.parse(String(init?.body)),
      },
    })) as Route,
  saveBody = ((init) =>
    Response.json({
      module: { ...ladders, version: { ...version, number: 3 } },
      body: JSON.parse(String(init?.body)),
      changed: true,
    })) as Route,
  create = ((init) => {
    const posted = JSON.parse(String(init?.body)) as {
      title: string;
      group: string;
      domain: string;
      body: unknown;
    };
    return Response.json(
      {
        module: { ...welding, title: posted.title, group: posted.group, domain: posted.domain },
        body: posted.body,
      },
      { status: 201 }
    );
  }) as Route,
  clients = [sampleClient] as (typeof sampleClient)[],
  moduleBody = body as unknown,
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
    if (pathname === '/clients') {
      return Response.json({ items: clients, page: 1, pageSize: 100, total: clients.length });
    }
    if (pathname === '/instruction-modules' && method === 'POST') return create(init, url);
    if (pathname === '/instruction-modules/preview') {
      return new Response(new Uint8Array([80, 75, 3, 4, 7]), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      });
    }
    if (/^\/instruction-modules\/[^/]+\/body$/.test(pathname)) return saveBody(init, url);
    if (pathname === '/instruction-modules') {
      const domain = url.searchParams.get('domain');
      return Response.json({
        items: (url.searchParams.get('archived') === 'true' ? archived : modules).filter(
          (module) => !domain || module.domain === domain
        ),
      });
    }
    const moduleMatch = pathname.match(
      /^\/instruction-modules\/([^/]+)(?:\/(download)|\/versions\/([^/]+))?$/
    );
    if (moduleMatch) {
      const [, moduleId, download, versionId] = moduleMatch;
      if (download) {
        return new Response(new Uint8Array([80, 75, 3, 4]), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('Scări metalice.docx')}`,
          },
        });
      }
      if (versionId) {
        return Response.json({
          version: { ...version, id: versionId, number: 1, createdAt: '2026-09-20T10:00:00.000Z' },
          body,
        });
      }
      if (method === 'PATCH') return update(init, url);
      const module = [...(modules as (typeof ladders)[]), welding, hotWork].find(
        (item) => item.id === moduleId
      );
      return module
        ? Response.json({ module, body: moduleBody })
        : Response.json({ error: 'not_found', message: 'no' }, { status: 404 });
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
      return Response.json(
        (url.searchParams.get('domain') === 'psi' ? fireInstructions : instructions)[positionId]
      );
    }
    if (pathname.endsWith('/equipment')) {
      return Response.json({ items: [], needsProtectiveEquipment: null });
    }
    if (pathname.endsWith('/risk-evaluation')) return Response.json({ evaluation: null });
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

async function refetchModule(queryClient: QueryClient, moduleId: string) {
  await queryClient.refetchQueries({ queryKey: getGetInstructionModuleQueryKey(moduleId) });
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

const fireTabLink = () =>
  within(screen.getByRole('navigation', { name: 'Secțiunile instrucțiunilor proprii' })).getByRole(
    'link',
    {
      name: 'IPSU',
    }
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the instruction library', () => {
  it('opens on the occupational safety tab and lists its modules by group with their version and where they are applied', async () => {
    mockApi();
    const runtime = mount();
    await screen.findByTestId('instruction-library');
    expect(await screen.findByTestId('instruction-library-ssm')).toBeTruthy();
    expect(runtime.router.history.location.pathname).toBe('/instructions/ssm');
    const rows = await screen.findAllByTestId('instruction-row');
    expect(rows.map((row) => within(row).getByTestId('instruction-open').textContent)).toEqual([
      'Activități de birou',
      'Scări metalice',
    ]);
    expect(within(rows[1]!).getByTestId('instruction-version').textContent).toBe(
      'v2 · 12 articole'
    );
    expect(within(rows[1]!).getByTestId('instruction-applied').textContent).toBe('2 posturi');
    expect(within(rows[0]!).getByTestId('instruction-version').textContent).toBe('v1 · 4 articole');
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

  it('lists the fire-safety modules on their own tab', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(fireTabLink());
    const fireTab = await screen.findByTestId('instruction-library-psi');
    await waitFor(() =>
      expect(
        within(fireTab)
          .getAllByTestId('instruction-row')
          .map((row) => within(row).getByTestId('instruction-open').textContent)
      ).toEqual(['Lucrul cu foc deschis'])
    );
    expect(runtime.router.history.location.pathname).toBe('/instructions/psi');
    const listed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((address) => address.pathname === '/instruction-modules')
      .map((address) => address.searchParams.get('domain'));
    expect(listed).toEqual(['ssm', 'psi']);
  });

  it('opens Instrucțiuni in the navigation on its tabs, the current one marked', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();

    const group = await screen.findByTestId('nav-instructions-group');
    const entries = within(group).getAllByTestId('nav-sub-entry');
    expect(entries.map((entry) => [entry.textContent, entry.getAttribute('href')])).toEqual([
      ['IPSSM', '/instructions/ssm'],
      ['IPSU', '/instructions/psi'],
    ]);
    await waitFor(() => expect(entries[0]!.getAttribute('aria-current')).toBe('page'));

    await user.click(entries[1]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/instructions/psi'));
    expect(entries[1]!.getAttribute('aria-current')).toBe('page');
    expect(entries[0]!.getAttribute('aria-current')).toBeNull();
    expect(await screen.findByTestId('instruction-library-psi')).toBeTruthy();

    await user.click(screen.getByTestId('nav-dashboard'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(group.closest('[data-open]')?.getAttribute('data-open')).toBe('false');
    await waitFor(() => expect(screen.queryByTestId('nav-instructions-group')).toBeNull());
  });

  it('moves a module no position applies to the other domain, and shows the domain of an applied one only to read', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instruction-row');
    await user.click(within(rows[0]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-rename'));
    await user.selectOptions(screen.getByTestId('instruction-module-domain'), 'psi');
    await user.click(screen.getByTestId('instruction-module-submit'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${offices.id}`, 'PATCH')).toEqual([
        { title: 'Activități de birou', group: 'premises_activity', domain: 'psi' },
      ])
    );

    await waitFor(() => expect(screen.queryByTestId('instruction-module-dialog')).toBeNull());
    await user.click(fireTabLink());
    const fireTab = await screen.findByTestId('instruction-library-psi');
    const [fireRow] = await within(fireTab).findAllByTestId('instruction-row');
    await user.click(within(fireRow!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-rename'));
    const domain = screen.getByTestId('instruction-module-domain') as HTMLInputElement;
    expect(domain.readOnly).toBe(true);
    expect(domain.value).toBe('PSI');
    expect(screen.getByTestId('instruction-module-dialog').textContent).toContain(
      'Aplicată la un post ca instrucțiune PSI'
    );
    await user.click(screen.getByTestId('instruction-module-submit'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${hotWork.id}`, 'PATCH')).toEqual([
        { title: 'Lucrul cu foc deschis', group: 'hazardous_work' },
      ])
    );
  });

  it('says why a module a position has just applied keeps its domain', async () => {
    mockApi({
      update: () =>
        Response.json(
          { error: 'conflict', message: 'applied', reason: 'instruction_module_domain_applied' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instruction-row');
    await user.click(within(rows[0]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-rename'));
    await user.selectOptions(screen.getByTestId('instruction-module-domain'), 'psi');
    await user.click(screen.getByTestId('instruction-module-submit'));
    expect((await screen.findByTestId('instruction-module-domain-error')).textContent).toContain(
      'Scoate-o de la posturile care o aplică'
    );
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

const ladderBody = {
  blocks: [
    { kind: 'heading', text: 'Verificări înainte de pornire' },
    {
      kind: 'article',
      paragraphs: ['Lucrătorul verifică scara:', 'a) tălpile;', 'b) treptele.'],
    },
    { kind: 'heading', text: 'Acțiuni interzise' },
    { kind: 'article', paragraphs: ['Este interzisă urcarea cu sarcini grele.'] },
  ],
};

const labels = () =>
  screen.getAllByTestId('instruction-block-label').map((label) => label.textContent);
const articleBoxes = () =>
  screen.getAllByTestId('instruction-article-text') as HTMLTextAreaElement[];

describe('the module form', () => {
  it('opens the current version as headings and articles numbered by place, and saves the next version', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2');
    expect(screen.getByTestId('instruction-form-facts').textContent).toBe(
      'SSM · Echipamente de muncă · 2 articole'
    );
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Titlu de secțiune', 'Art. 2']);
    expect(articleBoxes()[0]!.value).toBe('Lucrătorul verifică scara:\na) tălpile;\nb) treptele.');
    expect(screen.getByTestId('instruction-save-state').textContent).toBe(
      'Toate modificările sunt salvate.'
    );
    expect(screen.getAllByTestId('instruction-show-example')).toHaveLength(2);

    await user.click(screen.getAllByTestId('instruction-block-up')[3]!);
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Art. 2', 'Titlu de secțiune']);
    await user.click(screen.getAllByTestId('instruction-block-add')[2]!);
    await user.click(await screen.findByTestId('instruction-add-article'));
    await user.type(articleBoxes()[2]!, 'Scara se depozitează{Enter}în spațiul ei.');
    expect(labels()).toEqual([
      'Titlu de secțiune',
      'Art. 1',
      'Art. 2',
      'Art. 3',
      'Titlu de secțiune',
    ]);
    expect(screen.getByTestId('instruction-save-state').textContent).toBe('Modificări nesalvate.');

    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${ladders.id}/body`, 'PUT')).toEqual([
        {
          blocks: [
            { kind: 'heading', text: 'Verificări înainte de pornire' },
            {
              kind: 'article',
              paragraphs: ['Lucrătorul verifică scara:', 'a) tălpile;', 'b) treptele.'],
            },
            { kind: 'article', paragraphs: ['Este interzisă urcarea cu sarcini grele.'] },
            { kind: 'article', paragraphs: ['Scara se depozitează', 'în spațiul ei.'] },
          ],
        },
      ])
    );
    expect(await screen.findByText('Am salvat versiunea 3.')).toBeTruthy();
    expect(screen.getByTestId('instruction-save-state').textContent).toBe(
      'Toate modificările sunt salvate.'
    );
  });

  it('says so when the saved text differs from the current version only in spaces', async () => {
    mockApi({
      moduleBody: ladderBody,
      saveBody: (init) =>
        Response.json({ module: ladders, body: JSON.parse(String(init?.body)), changed: false }),
    });
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[1]!, '!');
    await user.click(screen.getByTestId('editor-save'));
    expect(
      await screen.findByText(/^Textul e același cu cel din versiunea 2/, undefined, {
        timeout: 3000,
      })
    ).toBeTruthy();
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2');
  });

  it('keeps the text unsaved when the library answers with another text than the one sent', async () => {
    mockApi({
      moduleBody: ladderBody,
      saveBody: () => Response.json({ module: ladders, body: ladderBody, changed: false }),
    });
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[1]!, ' Nici cu unelte.');
    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(requests(`/instruction-modules/${ladders.id}/body`, 'PUT')).toHaveLength(1)
    );
    await waitFor(() => expect(screen.getByTestId('editor-save').textContent).toBe('Salvează'));
    expect(screen.getByTestId('instruction-save-state').textContent).toBe('Modificări nesalvate.');
  });

  it('says that another window saved the text meanwhile', async () => {
    mockApi({
      saveBody: () =>
        Response.json(
          { error: 'conflict', message: 'The module was saved in the meantime; save it again.' },
          { status: 409 }
        ),
    });
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[0]!, ' Din nou.');
    await user.click(screen.getByTestId('editor-save'));
    expect((await screen.findByTestId('instruction-form-error')).textContent).toBe(
      'Instrucțiunea a fost salvată între timp din altă fereastră. Salvează din nou ca să păstrezi textul de aici, sau reîncarcă pagina ca să vezi ce s-a salvat.'
    );
  });

  it('keeps the form and its unsaved text when a later read fails or finds the module archived', async () => {
    mockApi({ moduleBody: ladderBody });
    const runtime = mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[1]!, ' Nici cu unelte.');
    const refetch = () => refetchModule(runtime.queryClient, ladders.id);

    mockApi({
      modules: [{ ...ladders, archivedAt: '2026-09-26T11:00:00.000Z' }],
      moduleBody: ladderBody,
    });
    await refetch();
    const read = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname === `/instruction-modules/${ladders.id}`
        ? Response.json({ error: 'not_found', message: 'no' }, { status: 404 })
        : read(input, init)
    );
    await refetch();

    expect(screen.queryByTestId('editor-unavailable')).toBeNull();
    expect(screen.queryByTestId('fake-editor')).toBeNull();
    expect(articleBoxes()[1]!.value).toBe(
      'Este interzisă urcarea cu sarcini grele. Nici cu unelte.'
    );
    expect(screen.getByTestId('instruction-save-state').textContent).toBe('Modificări nesalvate.');
  });

  it('puts a deleted article back on undo and keeps what was written since', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.click(screen.getAllByTestId('instruction-block-delete')[3]!);
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Titlu de secțiune']);
    await user.type(articleBoxes()[0]!, '{End} Și scara.');
    await user.click(await screen.findByRole('button', { name: 'Anulează' }));
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Titlu de secțiune', 'Art. 2']);
    expect(articleBoxes().map((box) => box.value)).toEqual([
      'Lucrătorul verifică scara:\na) tălpile;\nb) treptele. Și scara.',
      'Este interzisă urcarea cu sarcini grele.',
    ]);
  });

  it('refuses to save a text without an article, in words', async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.clear(articleBoxes()[0]!);
    await user.click(screen.getByTestId('editor-save'));
    expect(screen.getByTestId('instruction-form-error').textContent).toBe(
      'Scrie cel puțin un articol înainte să salvezi.'
    );
    expect(requests(`/instruction-modules/${ladders.id}/body`, 'PUT')).toHaveLength(0);
  });

  it("marks an article that names one of the organization's clients, and still saves", async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[0]!, ' Scara aparține S.C. Veloce Cafe S.R.L.');
    expect((await screen.findByTestId('instruction-client-named')).textContent).toBe(
      'Textul numește clientul VELOCE CAFE SRL. Instrucțiunea se aplică și altor clienți.'
    );
    expect(screen.getByTestId('instruction-client-mark').textContent).toBe(
      'Numește clientul VELOCE CAFE SRL.'
    );
    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(requests(`/instruction-modules/${ladders.id}/body`, 'PUT')).toHaveLength(1)
    );
  });

  it('pastes a whole instruction, shows its articles and flags, and replaces the text', async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.click(screen.getByTestId('instruction-paste'));
    const dialog = await screen.findByTestId('paste-dialog');
    await user.click(within(dialog).getByTestId('paste-text'));
    await user.paste(
      'Folosirea scării\nScara se sprijină pe o suprafață stabilă.\nSe urcă cu fața la scară.\nÎnălțime\tAsigurare'
    );
    await waitFor(() =>
      expect(within(dialog).getByTestId('paste-summary').textContent).toBe(
        '3 articole, un titlu de secțiune'
      )
    );
    expect(within(dialog).getByTestId('paste-flags').textContent).toBe(
      'Numerotarea nu s-a putut citi: am făcut câte un articol din fiecare paragraf.Un rând de tabel a devenit paragraf, cu celulele despărțite de „–”: Art. 3.'
    );
    expect(
      within(dialog)
        .getAllByTestId('paste-preview-article')
        .map((article) => article.textContent)
    ).toEqual([
      'Art. 1. Scara se sprijină pe o suprafață stabilă.',
      'Art. 2. Se urcă cu fața la scară.',
      'Art. 3. Înălțime – Asigurare',
    ]);
    await user.click(within(dialog).getByTestId('paste-replace'));
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Art. 2', 'Art. 3']);
    expect(articleBoxes()[2]!.value).toBe('Înălțime – Asigurare');
  });

  it('offers to split several paragraphs pasted into one article', async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.click(screen.getByTestId('instruction-paste'));
    await user.keyboard('{Escape}');
    await user.clear(articleBoxes()[0]!);
    await user.paste('Art. 1. Scara se verifică.\nArt. 2. Scara se curăță.');
    const offer = await screen.findByTestId('instruction-paste-offer');
    expect(offer.textContent).toContain('Textul lipit se poate împărți în 2 articole.');
    await user.click(within(offer).getByTestId('instruction-paste-split'));
    expect(labels()).toEqual(['Art. 1', 'Art. 2']);
    expect(articleBoxes().map((box) => box.value)).toEqual([
      'Scara se verifică.',
      'Scara se curăță.',
    ]);
  });

  it('previews the annex with the text on screen, saved or not', async () => {
    mockApi();
    mount(`/instructions/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[0]!, ' Nesalvat.');
    await user.click(screen.getByTestId('instruction-preview'));
    expect(await screen.findByTestId('fake-annex-view')).toBeTruthy();
    expect(bodies('/instruction-modules/preview', 'POST')).toEqual([
      {
        title: 'Scări metalice',
        domain: 'ssm',
        body: {
          blocks: [
            {
              kind: 'article',
              paragraphs: ['Scara se sprijină pe o suprafață stabilă. Nesalvat.'],
            },
          ],
        },
      },
    ]);
  });
});

describe('writing a new module', () => {
  it('asks for the title, domain and category, then opens the guided template; nothing is stored before the first save', async () => {
    mockApi();
    const runtime = mount('/instructions/psi');
    const user = userEvent.setup();
    await screen.findByTestId('instruction-library-psi');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    expect(
      (within(dialog).getByTestId('instruction-start-domain') as HTMLSelectElement).value
    ).toBe('psi');
    expect(
      [...(within(dialog).getByTestId('instruction-start-group') as HTMLSelectElement).options].map(
        (option) => option.textContent
      )
    ).toEqual(['Spații și activități', 'Instalații și echipamente', 'Lucrări periculoase']);
    await user.type(within(dialog).getByTestId('instruction-start-title'), 'Sudura în atelier');
    await user.selectOptions(
      within(dialog).getByTestId('instruction-start-group'),
      'hazardous_work'
    );
    await user.click(within(dialog).getByTestId('instruction-start-submit'));

    await screen.findByTestId('instruction-form');
    expect(runtime.router.history.location.pathname).toBe('/instructions/new');
    expect(screen.getByTestId('editor-state').textContent).toBe('Nouă, nesalvată');
    expect(screen.getByTestId('instruction-form-facts').textContent).toBe(
      'PSI · Lucrări periculoase · fără articole numerotate'
    );
    expect(
      (screen.getAllByTestId('instruction-heading-text') as HTMLInputElement[]).map(
        (heading) => heading.value
      )
    ).toEqual([
      'Domeniul de aplicare',
      'Înainte de începerea lucrării',
      'În timpul lucrării',
      'După terminarea lucrării',
      'Acțiuni interzise',
      'Dacă izbucnește un incendiu',
    ]);
    expect(articleBoxes()[0]!.placeholder).toBe(
      'Ce lucrare periculoasă acoperă instrucțiunea (sudură, tăiere, lucru cu foc deschis) și unde se execută.'
    );
    expect(screen.getByTestId('instruction-acts').textContent).toContain('Legea nr. 307/2006');
    expect(requests('/instruction-modules', 'POST')).toHaveLength(0);

    await user.click(screen.getAllByTestId('instruction-show-example')[0]!);
    expect(articleBoxes()[0]!.value).toMatch(/^Prezenta instrucțiune se aplică lucrărilor cu foc/);
    await user.type(articleBoxes()[4]!, 'Nu se sudează lângă butelii.');
    expect(labels().filter((label) => label?.startsWith('Art.'))).toEqual(['Art. 1', 'Art. 2']);

    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(bodies('/instruction-modules', 'POST')).toEqual([
        {
          title: 'Sudura în atelier',
          group: 'hazardous_work',
          domain: 'psi',
          body: {
            blocks: [
              { kind: 'heading', text: 'Domeniul de aplicare' },
              { kind: 'article', paragraphs: [expect.stringMatching(/^Prezenta instrucțiune/)] },
              { kind: 'heading', text: 'Acțiuni interzise' },
              { kind: 'article', paragraphs: ['Nu se sudează lângă butelii.'] },
            ],
          },
        },
      ])
    );
    await waitFor(() =>
      expect(runtime.router.history.location.pathname).toBe(`/instructions/${welding.id}`)
    );
  });

  it('starts from a library module of the same domain as a copy of its text, kept when a later read fails', async () => {
    mockApi({ moduleBody: ladderBody });
    const runtime = mount('/instructions/ssm');
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    await user.type(within(dialog).getByTestId('instruction-start-title'), 'Scări – șantier');
    const from = within(dialog).getByTestId('instruction-start-from') as HTMLSelectElement;
    await waitFor(() =>
      expect([...from.options].map((option) => option.textContent)).toEqual([
        'Structura propusă',
        'Activități de birou',
        'Scări metalice',
      ])
    );
    await user.selectOptions(from, ladders.id);
    await waitFor(() =>
      expect(
        (within(dialog).getByTestId('instruction-start-group') as HTMLSelectElement).value
      ).toBe('work_equipment')
    );
    await user.click(within(dialog).getByTestId('instruction-start-submit'));
    await screen.findByTestId('instruction-form');
    expect(labels()).toEqual(['Titlu de secțiune', 'Art. 1', 'Titlu de secțiune', 'Art. 2']);
    expect(screen.getByTestId('instruction-form-title').textContent).toBe('Scări – șantier');

    await user.type(articleBoxes()[0]!, ' Pe șantier.');
    const read = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname === `/instruction-modules/${ladders.id}`
        ? Response.json({ error: 'not_found', message: 'no' }, { status: 404 })
        : read(input, init)
    );
    await refetchModule(runtime.queryClient, ladders.id);
    expect(screen.queryByTestId('editor-unavailable')).toBeNull();
    expect(articleBoxes()[0]!.value).toContain('Pe șantier.');
  });

  it('refuses a title the library already has before opening the form', async () => {
    mockApi();
    mount('/instructions/ssm');
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    await user.type(within(dialog).getByTestId('instruction-start-title'), 'scări metalice');
    await user.click(within(dialog).getByTestId('instruction-start-submit'));
    expect(
      (await within(dialog).findByTestId('instruction-start-title-error')).textContent
    ).toContain('Biblioteca are deja o instrucțiune cu acest titlu.');
  });
});

describe('the module page', () => {
  it('shows the version a document annexed and leads to the current one', async () => {
    mockApi();
    const annexed = '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a';
    const runtime = mount(`/instructions/${ladders.id}?version=${annexed}`);
    const user = userEvent.setup();
    expect(await screen.findByTestId('fake-editor')).toBeTruthy();
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 1');
    expect(screen.getByTestId('editor-pinned-version').textContent).toContain(
      'Biblioteca are acum versiunea 2, din 26.09.2026'
    );
    const download = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((address) => address.pathname === `/instruction-modules/${ladders.id}/download`)!;
    expect(download.searchParams.get('versionId')).toBe(annexed);

    await user.click(screen.getByTestId('editor-open-current'));
    await waitFor(() => expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2'));
    expect(runtime.router.history.location.search).toBe('');
  });

  it('marks an archived module', async () => {
    mockApi({ modules: [{ ...ladders, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    mount(`/instructions/${ladders.id}`);
    await screen.findByTestId('fake-editor');
    expect(screen.getByTestId('editor-state').textContent).toBe('Arhivată');
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
    ).toEqual(['1 instrucțiune', 'De stabilit']);
    expect(
      rows.map((row) => within(row).getByTestId('job-position-fire-instructions').textContent)
    ).toEqual(['Nu necesită', 'De stabilit']);
    expect(
      within(rows[1]!).getByTestId('job-position-fire-instructions').getAttribute('href')
    ).toBe(`${positionsPath}/${fitter.id}#fire-instructions`);
    expect(screen.getByTestId('job-positions-undecided-fire-instructions').textContent).toBe(
      'Un post nu are instrucțiunile PSI stabilite: Lăcătuș mecanic.'
    );
  });

  it('decides the fire-safety modules on a card of its own, beside the occupational safety one', async () => {
    mockApi();
    mount(`${positionsPath}/${fitter.id}`);
    const user = userEvent.setup();
    const ssm = await screen.findByTestId('instructions-card');
    const psi = await screen.findByTestId('fire-instructions-card');
    expect(within(ssm).getByRole('heading', { level: 3 }).textContent).toContain(
      'Instrucțiuni specifice SSM'
    );
    expect(within(psi).getByRole('heading', { level: 3 }).textContent).toContain(
      'Instrucțiuni specifice PSI'
    );
    expect((await screen.findByTestId('fire-instructions-state')).textContent).toBe('De stabilit');
    expect(screen.getByTestId('fire-instructions-empty').textContent).toContain(
      'Documentele PSI nu se pot genera'
    );

    await user.click(screen.getByTestId('fire-instructions-pick'));
    const options = await screen.findAllByTestId('fire-instructions-pick-option');
    expect(options).toHaveLength(1);
    expect(screen.getByTestId('fire-instructions-pick-dialog').textContent).toContain(
      'Lucrul cu foc deschis'
    );
    const listed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((address) => address.pathname === '/instruction-modules')
      .map((address) => address.searchParams.get('domain'));
    expect(listed).toEqual(['psi']);
    await user.click(options[0]!);
    await user.click(screen.getByTestId('fire-instructions-pick-save'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions`, 'PUT')).toEqual([
        { domain: 'psi', moduleIds: [hotWork.id] },
      ])
    );

    mockApi({ fireInstructions: { [fitter.id]: { items: [], needsInstructions: false } } });
    await user.click(screen.getByTestId('fire-instructions-pick'));
    await user.click(await screen.findByRole('button', { name: 'Renunță' }));
    await user.click(screen.getByTestId('fire-instructions-decide-none'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions-decision`, 'PATCH')).toEqual([
        { domain: 'psi', needsInstructions: false },
      ])
    );
    expect((await screen.findByTestId('fire-instructions-none')).textContent).toContain(
      'nu necesită instrucțiuni specifice PSI'
    );
    expect(screen.getByTestId('instructions-empty')).toBeTruthy();
  });

  it('records that a post needs none, and takes it back', async () => {
    mockApi();
    mount(`${positionsPath}/${fitter.id}`);
    const user = userEvent.setup();
    const empty = await screen.findByTestId('instructions-empty');
    expect(empty.textContent).toContain('nu se pot genera');
    expect(
      within(empty)
        .getAllByRole('button')
        .map((button) => button.dataset.testid)
    ).toEqual(['instructions-pick', 'instructions-decide-none', 'instructions-copy']);
    expect(screen.getAllByTestId('instructions-pick')).toHaveLength(1);
    mockApi({ instructions: { [fitter.id]: { items: [], needsInstructions: false } } });
    await user.click(screen.getByTestId('instructions-decide-none'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions-decision`, 'PATCH')).toEqual([
        { domain: 'ssm', needsInstructions: false },
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
        { domain: 'ssm', moduleIds: [ladders.id, offices.id] },
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
        { domain: 'ssm', moduleIds: [] },
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
    expect(instructionStateLabel({ needsInstructions: null, instructionCount: 0 })).toBe(
      'De stabilit'
    );
    expect(instructionStateLabel({ needsInstructions: false, instructionCount: 0 })).toBe(
      'Nu necesită'
    );
    expect(instructionStateLabel({ needsInstructions: true, instructionCount: 1 })).toBe(
      '1 instrucțiune'
    );
    expect(instructionStateLabel({ needsInstructions: true, instructionCount: 20 })).toBe(
      '20 de instrucțiuni'
    );
  });
});
