import type { QueryClient } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetInstructionModuleQueryKey } from '@/api/generated/api';
import { resetReloadDialog } from '@/features/reload-prompts/reload-dialog-store';
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
  domain: 'su',
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
    if (pathname === '/instruction-modules/choices') {
      const domain = url.searchParams.get('domain');
      return Response.json({
        items: modules
          .filter((module) => !domain || module.domain === domain)
          .map(({ id, title, group, domain: moduleDomain }) => ({
            id,
            title,
            group,
            domain: moduleDomain,
          })),
      });
    }
    if (pathname === '/instruction-modules') {
      const domain = url.searchParams.get('domain');
      const items = (url.searchParams.get('status') === 'archived' ? archived : modules).filter(
        (module) => !domain || module.domain === domain
      );
      return Response.json({
        items,
        page: Number(url.searchParams.get('page')),
        pageSize: Number(url.searchParams.get('pageSize')),
        total: items.length,
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
        (url.searchParams.get('domain') === 'su' ? fireInstructions : instructions)[positionId]
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

const mount = (path = '/instructiuni') => mountApp(authFixture(makeSession()).client, path);

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
    expect(runtime.router.history.location.pathname).toBe('/instructiuni/ssm');
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

  it('shows the archived ones on their own tab, kept in the address', async () => {
    mockApi({ archived: [{ ...welding, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    expect(screen.getByTestId('instruction-count').textContent).toBe('2 instrucțiuni');
    expect(screen.getByTestId('instruction-filter-active').getAttribute('aria-current')).toBe(
      'page'
    );
    await user.click(screen.getByTestId('instruction-filter-archived'));
    await waitFor(() =>
      expect(screen.getAllByTestId('instruction-row').map((row) => row.textContent)).toEqual([
        expect.stringContaining('Sudură oxiacetilenică'),
      ])
    );
    expect(runtime.router.state.location.search).toEqual({ status: 'archived' });
    expect(screen.getByTestId('instruction-count').textContent).toBe('1 instrucțiune');
    expect(screen.getByTestId('instruction-filter-active').getAttribute('aria-current')).toBeNull();
    await user.click(screen.getByTestId('instruction-actions'));
    expect(await screen.findByTestId('instruction-restore')).toBeTruthy();
    expect(screen.queryByTestId('instruction-edit')).toBeNull();
  });

  it('says when there is nothing archived', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/instructiuni/ssm?status=archived');
    expect((await screen.findByTestId('instruction-empty')).textContent).toContain(
      'Nicio instrucțiune proprie SSM arhivată'
    );
  });

  it('reads status=active in the address as the active tab', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/instructiuni/ssm?status=active');
    await screen.findAllByTestId('instruction-row');
    expect(screen.getByTestId('instruction-filter-active').getAttribute('aria-current')).toBe(
      'page'
    );
  });

  it('asks the library for a page and a sort, and keeps them in the address', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('sort-appliedCount'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'appliedCount' })
    );
    await user.click(screen.getByTestId('sort-version'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'version', order: 'desc' })
    );
    const listed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((address) => address.pathname === '/instruction-modules')
      .map((address) => Object.fromEntries(address.searchParams));
    expect(listed.at(-1)).toEqual({
      domain: 'ssm',
      page: '1',
      pageSize: '25',
      sort: 'version',
      order: 'desc',
    });
  });

  it('lists the fire-safety modules on their own tab', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(fireTabLink());
    const fireTab = await screen.findByTestId('instruction-library-su');
    await waitFor(() =>
      expect(
        within(fireTab)
          .getAllByTestId('instruction-row')
          .map((row) => within(row).getByTestId('instruction-open').textContent)
      ).toEqual(['Lucrul cu foc deschis'])
    );
    expect(runtime.router.history.location.pathname).toBe('/instructiuni/su');
    const listed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((address) => address.pathname === '/instruction-modules')
      .map((address) => address.searchParams.get('domain'));
    expect(listed).toEqual(['ssm', 'su']);
  });

  it('opens Instrucțiuni in the navigation on its tabs, the current one marked', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();

    const group = await screen.findByTestId('nav-instructions-group');
    const entries = within(group).getAllByTestId('nav-sub-entry');
    expect(entries.map((entry) => [entry.textContent, entry.getAttribute('href')])).toEqual([
      ['IPSSM', '/instructiuni/ssm'],
      ['IPSU', '/instructiuni/su'],
    ]);
    await waitFor(() => expect(entries[0]!.getAttribute('aria-current')).toBe('page'));

    await user.click(entries[1]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/instructiuni/su'));
    expect(entries[1]!.getAttribute('aria-current')).toBe('page');
    expect(entries[0]!.getAttribute('aria-current')).toBeNull();
    expect(await screen.findByTestId('instruction-library-su')).toBeTruthy();

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
    await user.click(await screen.findByTestId('instruction-edit'));
    await user.selectOptions(screen.getByTestId('instruction-module-domain'), 'su');
    await user.click(screen.getByTestId('instruction-module-submit'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${offices.id}`, 'PATCH')).toEqual([
        { title: 'Activități de birou', group: 'premises_activity', domain: 'su' },
      ])
    );

    await waitFor(() => expect(screen.queryByTestId('instruction-module-dialog')).toBeNull());
    await user.click(fireTabLink());
    const fireTab = await screen.findByTestId('instruction-library-su');
    const [fireRow] = await within(fireTab).findAllByTestId('instruction-row');
    await user.click(within(fireRow!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-edit'));
    const domain = screen.getByTestId('instruction-module-domain') as HTMLInputElement;
    expect(domain.readOnly).toBe(true);
    expect(domain.value).toBe('SU');
    expect(screen.getByTestId('instruction-module-dialog').textContent).toContain(
      'Aplicată la un post ca instrucțiune SU'
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
    await user.click(await screen.findByTestId('instruction-edit'));
    await user.selectOptions(screen.getByTestId('instruction-module-domain'), 'su');
    await user.click(screen.getByTestId('instruction-module-submit'));
    expect((await screen.findByTestId('instruction-module-domain-error')).textContent).toContain(
      'Scoate-o de la posturile care o aplică'
    );
  });

  it('archives a module after asking, and restores it the same way', async () => {
    mockApi({ archived: [{ ...welding, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    mount();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instruction-row');
    await user.click(within(rows[0]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-archive'));
    const dialog = await screen.findByTestId('instruction-archive-dialog');
    expect(dialog.textContent).toContain('Arhivezi instrucțiunea?');
    expect(requests(`/instruction-modules/${offices.id}`, 'PATCH')).toHaveLength(0);
    await user.click(within(dialog).getByTestId('instruction-archive-confirm'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${offices.id}`, 'PATCH')).toEqual([{ archived: true }])
    );
    await waitFor(() => expect(screen.queryByTestId('instruction-archive-dialog')).toBeNull());

    await user.click(screen.getByTestId('instruction-filter-archived'));
    await waitFor(() => expect(screen.getAllByTestId('instruction-row')).toHaveLength(1));
    await user.click(screen.getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-restore'));
    expect((await screen.findByTestId('instruction-archive-dialog')).textContent).toContain(
      'Reactivezi instrucțiunea?'
    );
    await user.click(screen.getByTestId('instruction-archive-confirm'));
    await waitFor(() =>
      expect(bodies(`/instruction-modules/${welding.id}`, 'PATCH')).toEqual([{ archived: false }])
    );
  });

  it('says up front that a module a position applies cannot be archived, and offers no archiving', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('instruction-row');
    await user.click(within(rows[1]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-archive'));
    const dialog = await screen.findByTestId('instruction-archive-dialog');
    expect(dialog.textContent).toContain('este aplicată la 2 posturi');
    expect(within(dialog).queryByTestId('instruction-archive-confirm')).toBeNull();
    await user.click(within(dialog).getByTestId('instruction-archive-close'));
    await waitFor(() => expect(screen.queryByTestId('instruction-archive-dialog')).toBeNull());
    expect(requests(`/instruction-modules/${ladders.id}`, 'PATCH')).toHaveLength(0);
  });

  it('says so when a position applied the module in the meantime', async () => {
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
    await user.click(within(rows[0]!).getByTestId('instruction-actions'));
    await user.click(await screen.findByTestId('instruction-archive'));
    await user.click(await screen.findByTestId('instruction-archive-confirm'));
    expect((await screen.findByTestId('instruction-archive-error')).textContent).toContain(
      'a fost aplicată la un post'
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

const outline = () =>
  screen
    .getAllByTestId('instruction-block')
    .map((block) =>
      block.dataset.kind === 'heading'
        ? `§ ${(within(block).getByTestId('instruction-heading-text') as HTMLInputElement).value}`
        : within(block).getByTestId('instruction-block-label').textContent
    );
const articleBoxes = () =>
  screen.getAllByTestId('instruction-article-text') as HTMLTextAreaElement[];
const sectionCard = (title: string) => screen.getByRole('region', { name: title });

async function choose(user: ReturnType<typeof userEvent.setup>, menu: HTMLElement, item: string) {
  await user.click(menu);
  await user.click(await screen.findByTestId(item));
}

describe('the module form', () => {
  it('opens the current version as headings and articles numbered by place, and saves the next version', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2');
    expect(screen.getByTestId('instruction-form-facts').textContent).toBe(
      'SSM · Echipamente de muncă · 2 articole'
    );
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      '§ Acțiuni interzise',
      'Art. 2',
    ]);
    expect(articleBoxes()[0]!.value).toBe('Lucrătorul verifică scara:\na) tălpile;\nb) treptele.');
    expect(screen.getByTestId('instruction-save-state').textContent).toBe(
      'Toate modificările sunt salvate.'
    );
    expect(
      screen.getAllByTestId('instruction-section-count').map((count) => count.textContent)
    ).toEqual(['Un articol', 'Un articol']);
    expect(screen.queryByTestId('instruction-paste-panel')).toBeNull();

    await choose(
      user,
      screen.getByRole('button', { name: 'Acțiuni pentru Art. 2' }),
      'instruction-article-up'
    );
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      'Art. 2',
      '§ Acțiuni interzise',
    ]);
    await choose(
      user,
      screen.getByRole('button', { name: 'Acțiuni pentru Art. 2' }),
      'instruction-article-add'
    );
    expect(document.activeElement).toBe(articleBoxes()[2]);
    await user.keyboard('Scara se depozitează{Enter}în spațiul ei.');
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      'Art. 2',
      'Art. 3',
      '§ Acțiuni interzise',
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
    mount(`/instructiuni/${ladders.id}`);
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
    mount(`/instructiuni/${ladders.id}`);
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
    mount(`/instructiuni/${ladders.id}`);
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
    const runtime = mount(`/instructiuni/${ladders.id}`);
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
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await choose(
      user,
      screen.getByRole('button', { name: 'Acțiuni pentru Art. 2' }),
      'instruction-article-delete'
    );
    expect(outline()).toEqual(['§ Verificări înainte de pornire', 'Art. 1', '§ Acțiuni interzise']);
    await user.type(articleBoxes()[0]!, '{End} Și scara.');
    await user.click(await screen.findByRole('button', { name: 'Anulează' }));
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      '§ Acțiuni interzise',
      'Art. 2',
    ]);
    expect(articleBoxes().map((box) => box.value)).toEqual([
      'Lucrătorul verifică scara:\na) tălpile;\nb) treptele. Și scara.',
      'Este interzisă urcarea cu sarcini grele.',
    ]);
  });

  it('moves a section with its articles', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    const menu = within(sectionCard('Acțiuni interzise')).getByRole('button', {
      name: 'Acțiuni pentru secțiunea Acțiuni interzise',
    });
    await choose(user, menu, 'instruction-section-up');
    expect(outline()).toEqual([
      '§ Acțiuni interzise',
      'Art. 1',
      '§ Verificări înainte de pornire',
      'Art. 2',
    ]);
    expect(articleBoxes()[0]!.value).toBe('Este interzisă urcarea cu sarcini grele.');
    await user.click(menu);
    expect(
      (await screen.findByTestId('instruction-section-up')).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('deletes a section with its articles and puts it back on undo', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await choose(
      user,
      screen.getByRole('button', {
        name: 'Acțiuni pentru secțiunea Verificări înainte de pornire',
      }),
      'instruction-section-delete'
    );
    expect(outline()).toEqual(['§ Acțiuni interzise', 'Art. 1']);
    expect(await screen.findByText('Am șters secțiunea.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      '§ Acțiuni interzise',
      'Art. 2',
    ]);
  });

  it('starts a new section after an article, taking the articles below it', async () => {
    mockApi({
      moduleBody: {
        blocks: [
          { kind: 'heading', text: 'Folosirea scării' },
          { kind: 'article', paragraphs: ['Scara se sprijină pe o suprafață stabilă.'] },
          { kind: 'article', paragraphs: ['Scara se curăță după folosire.'] },
          { kind: 'article', paragraphs: ['Scara se depozitează în spațiul ei.'] },
        ],
      },
    });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await choose(
      user,
      screen.getByRole('button', { name: 'Acțiuni pentru Art. 1' }),
      'instruction-article-start-section'
    );
    const headings = screen.getAllByTestId('instruction-heading-text');
    await waitFor(() => expect(document.activeElement).toBe(headings[1]));
    await user.keyboard('După folosire');
    expect(outline()).toEqual([
      '§ Folosirea scării',
      'Art. 1',
      '§ După folosire',
      'Art. 2',
      'Art. 3',
    ]);
    expect(
      within(sectionCard('După folosire')).getByTestId('instruction-section-count').textContent
    ).toBe('2 articole');
  });

  it('adds a section at the end, empty and not printed until it has an article', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await choose(
      user,
      screen.getByTestId('instruction-add-section'),
      'instruction-add-blank-section'
    );
    const headings = screen.getAllByTestId('instruction-heading-text');
    expect(document.activeElement).toBe(headings[2]);
    await user.keyboard('Depozitare');
    const added = sectionCard('Depozitare');
    expect(added.dataset.empty).toBe('true');
    expect(within(added).getByTestId('instruction-section-unprinted').textContent).toBe(
      'Goală: nu se tipărește'
    );
    expect(within(added).queryByTestId('instruction-article-text')).toBeNull();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(within(added).getByTestId('instruction-article-text'));
    await user.keyboard('Scara se ține la adăpost.');
    expect(added.dataset.empty).toBeUndefined();
    expect(within(added).queryByTestId('instruction-section-unprinted')).toBeNull();
    expect(outline().at(-1)).toBe('Art. 3');
  });

  it('offers the sections of the guide an instruction lacks, and puts one where the guide does', async () => {
    mockApi({ moduleBody: ladderBody });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.click(screen.getByTestId('instruction-add-section'));
    const offered = (await screen.findAllByTestId('instruction-suggested-section')).map(
      (item) => item.textContent
    );
    expect(offered).toHaveLength(7);
    expect(offered[0]?.startsWith('Domeniul de aplicare')).toBe(true);
    expect(offered.some((text) => text?.startsWith('Acțiuni interzise'))).toBe(false);
    await user.click(screen.getByText('În timpul utilizării'));
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      '§ În timpul utilizării',
      '§ Acțiuni interzise',
      'Art. 2',
    ]);
    const added = sectionCard('În timpul utilizării');
    expect(added.dataset.empty).toBe('true');
    expect(document.activeElement).toBe(
      within(added).getByTestId('instruction-section-write-first')
    );
  });

  it('refuses to save a text without an article, in words', async () => {
    mockApi();
    mount(`/instructiuni/${ladders.id}`);
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
    mount(`/instructiuni/${ladders.id}`);
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
    mount(`/instructiuni/${ladders.id}`);
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
    expect(outline()).toEqual(['§ Folosirea scării', 'Art. 1', 'Art. 2', 'Art. 3']);
    expect(articleBoxes()[2]!.value).toBe('Înălțime – Asigurare');
  });

  it('offers to split several paragraphs pasted into one article', async () => {
    mockApi();
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.click(screen.getByTestId('instruction-paste'));
    await user.keyboard('{Escape}');
    await user.clear(articleBoxes()[0]!);
    await user.paste('Art. 1. Scara se verifică.\nArt. 2. Scara se curăță.');
    const offer = await screen.findByTestId('instruction-paste-offer');
    expect(offer.textContent).toContain('Textul lipit se poate împărți în 2 articole.');
    await user.click(within(offer).getByTestId('instruction-paste-split'));
    expect(outline()).toEqual(['Art. 1', 'Art. 2']);
    expect(articleBoxes().map((box) => box.value)).toEqual([
      'Scara se verifică.',
      'Scara se curăță.',
    ]);
  });

  it('previews the annex with the text on screen, saved or not', async () => {
    mockApi();
    mount(`/instructiuni/${ladders.id}`);
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
    const runtime = mount('/instructiuni/su');
    const user = userEvent.setup();
    await screen.findByTestId('instruction-library-su');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    expect(
      (within(dialog).getByTestId('instruction-start-domain') as HTMLSelectElement).value
    ).toBe('su');
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
    expect(runtime.router.history.location.pathname).toBe('/instructiuni/nou');
    expect(screen.getByTestId('editor-state').textContent).toBe('Nouă, nesalvată');
    expect(screen.getByTestId('instruction-form-facts').textContent).toBe(
      'SU · Lucrări periculoase · fără articole încă'
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
    expect(screen.queryAllByTestId('instruction-article-text')).toHaveLength(0);
    expect(
      within(sectionCard('Domeniul de aplicare')).getByText(
        'Ce lucrare periculoasă acoperă instrucțiunea (sudură, tăiere, lucru cu foc deschis) și unde se execută.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('instruction-acts').textContent).toContain('Legea nr. 307/2006');
    expect(screen.getByTestId('instruction-save-state').textContent).toBe(
      'Scrie cel puțin un articol ca să o poți salva.'
    );
    expect(requests('/instruction-modules', 'POST')).toHaveLength(0);

    await user.click(
      within(sectionCard('Domeniul de aplicare')).getByTestId('instruction-show-example')
    );
    expect(articleBoxes()[0]!.value).toMatch(/^Prezenta instrucțiune se aplică lucrărilor cu foc/);
    await user.click(
      within(sectionCard('Acțiuni interzise')).getByTestId('instruction-section-write-first')
    );
    expect(document.activeElement).toBe(articleBoxes()[1]);
    expect(articleBoxes()[1]!.placeholder).toBe('Ce este interzis la executarea lucrării.');
    await user.keyboard('Nu se sudează lângă butelii.');
    expect(outline().filter((label) => label?.startsWith('Art.'))).toEqual(['Art. 1', 'Art. 2']);
    expect(screen.getByTestId('instruction-save-state').textContent).toBe(
      'Se adaugă în bibliotecă la prima salvare.'
    );

    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(bodies('/instruction-modules', 'POST')).toEqual([
        {
          title: 'Sudura în atelier',
          group: 'hazardous_work',
          domain: 'su',
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
      expect(runtime.router.history.location.pathname).toBe(`/instructiuni/${welding.id}`)
    );
  });

  it('shows an empty section with its hint, and the paste panel only while there is no article', async () => {
    mockApi();
    mount('/instructiuni/ssm');
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    await user.type(within(dialog).getByTestId('instruction-start-title'), 'Activități de birou 2');
    await user.selectOptions(
      within(dialog).getByTestId('instruction-start-group'),
      'work_activity'
    );
    await user.click(within(dialog).getByTestId('instruction-start-submit'));
    await screen.findByTestId('instruction-form');

    const sections = screen.getAllByTestId('instruction-section');
    expect(sections).toHaveLength(8);
    expect(sections.every((section) => section.dataset.empty === 'true')).toBe(true);
    const scope = sectionCard('Domeniul de aplicare');
    expect(within(scope).getByTestId('instruction-section-unprinted').textContent).toBe(
      'Goală: nu se tipărește'
    );
    expect(within(scope).getByTestId('instruction-section-empty').textContent).toContain(
      'Ce activitate acoperă instrucțiunea'
    );
    expect(screen.getByTestId('instruction-form-facts').textContent).toBe(
      'SSM · Activități · fără articole încă'
    );
    expect(screen.getByTestId('instruction-paste-panel').textContent).toContain(
      'Ai deja textul într-un document?'
    );
    await user.click(screen.getByTestId('instruction-paste-panel-open'));
    expect(await screen.findByTestId('paste-dialog')).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.click(within(scope).getByTestId('instruction-section-write-first'));
    await user.keyboard('Instrucțiunea se aplică lucrului la birou.');
    expect(screen.queryByTestId('instruction-paste-panel')).toBeNull();
    expect(scope.dataset.empty).toBeUndefined();
    await user.clear(within(scope).getByTestId('instruction-article-text'));
    expect(screen.getByTestId('instruction-paste-panel')).toBeTruthy();
    expect(within(scope).getByTestId('instruction-article-text')).toBeTruthy();
  });

  it('starts from a library module of the same domain as a copy of its text, kept when a later read fails', async () => {
    mockApi({ moduleBody: ladderBody });
    const runtime = mount('/instructiuni/ssm');
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
    expect(outline()).toEqual([
      '§ Verificări înainte de pornire',
      'Art. 1',
      '§ Acțiuni interzise',
      'Art. 2',
    ]);
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
    mount('/instructiuni/ssm');
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
    const runtime = mount(`/instructiuni/${ladders.id}?version=${annexed}`);
    const user = userEvent.setup();
    expect(await screen.findByTestId('fake-editor')).toBeTruthy();
    expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 1');
    const pinnedState = screen.getByTestId('editor-pinned-version');
    expect(within(pinnedState).getByText('Mai veche decât biblioteca')).toBeTruthy();
    expect(within(pinnedState).getByText('Mai veche').getAttribute('aria-hidden')).toBe('true');
    expect(pinnedState.title).toContain('Biblioteca are acum versiunea 2, din 26.09.2026');
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    expect(screen.getByRole('main').className).toContain('overflow-hidden');
    const download = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((address) => address.pathname === `/instruction-modules/${ladders.id}/download`)!;
    expect(download.searchParams.get('versionId')).toBe(annexed);

    await user.click(screen.getByTestId('editor-open-current'));
    await waitFor(() => expect(screen.getByTestId('editor-state').textContent).toBe('Versiunea 2'));
    expect(runtime.router.history.location.search).toBe('');
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeTruthy();
  });

  it('marks an archived module', async () => {
    mockApi({ modules: [{ ...ladders, archivedAt: '2026-09-26T11:00:00.000Z' }] });
    mount(`/instructiuni/${ladders.id}`);
    await screen.findByTestId('fake-editor');
    expect(screen.getByTestId('editor-state').textContent).toBe('Arhivată');
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    expect(screen.getByRole('main').className).toContain('overflow-hidden');
  });
});

describe("a job position's instructions", () => {
  const positionsPath = `/clients/${clientId}/job-positions`;
  const positionsPage = `/clienti/${clientId}/posturi`;

  it('lists the applied modules and the state in the positions table', async () => {
    mockApi();
    mount(positionsPage);
    const rows = await screen.findAllByTestId('job-position-row');
    expect(
      rows.map((row) => within(row).getByTestId('job-position-instructions').textContent)
    ).toEqual(['1 instrucțiune', 'De stabilit']);
    expect(
      rows.map((row) => within(row).getByTestId('job-position-fire-instructions').textContent)
    ).toEqual(['Nu necesită', 'De stabilit']);
    expect(
      within(rows[1]!).getByTestId('job-position-fire-instructions').getAttribute('href')
    ).toBe(`${positionsPage}/${fitter.id}#fire-instructions`);
    expect(screen.getByTestId('job-positions-undecided-fire-instructions').textContent).toBe(
      'Un post nu are instrucțiunile SU stabilite: Lăcătuș mecanic.'
    );
  });

  it('decides the fire-safety modules on a card of its own, beside the occupational safety one', async () => {
    mockApi();
    mount(`${positionsPage}/${fitter.id}`);
    const user = userEvent.setup();
    const ssm = await screen.findByTestId('instructions-card');
    const su = await screen.findByTestId('fire-instructions-card');
    expect(within(ssm).getByRole('heading', { level: 3 }).textContent).toContain(
      'Instrucțiuni specifice SSM'
    );
    expect(within(su).getByRole('heading', { level: 3 }).textContent).toContain(
      'Instrucțiuni specifice SU'
    );
    expect((await screen.findByTestId('fire-instructions-state')).textContent).toBe('De stabilit');
    expect(screen.getByTestId('fire-instructions-empty').textContent).toContain(
      'Documentele SU nu se pot genera'
    );

    await user.click(screen.getByTestId('fire-instructions-pick'));
    const options = await screen.findAllByTestId('fire-instructions-pick-option');
    expect(options).toHaveLength(1);
    expect(screen.getByTestId('fire-instructions-pick-dialog').textContent).toContain(
      'Lucrul cu foc deschis'
    );
    const listed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((address) => address.pathname === '/instruction-modules/choices')
      .map((address) => address.searchParams.get('domain'));
    expect(listed).toEqual(['su']);
    await user.click(options[0]!);
    await user.click(screen.getByTestId('fire-instructions-pick-save'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions`, 'PUT')).toEqual([
        { domain: 'su', moduleIds: [hotWork.id] },
      ])
    );

    mockApi({ fireInstructions: { [fitter.id]: { items: [], needsInstructions: false } } });
    await user.click(screen.getByTestId('fire-instructions-pick'));
    await user.click(await screen.findByRole('button', { name: 'Renunță' }));
    await user.click(screen.getByTestId('fire-instructions-decide-none'));
    await waitFor(() =>
      expect(bodies(`${positionsPath}/${fitter.id}/instructions-decision`, 'PATCH')).toEqual([
        { domain: 'su', needsInstructions: false },
      ])
    );
    expect((await screen.findByTestId('fire-instructions-none')).textContent).toContain(
      'nu necesită instrucțiuni specifice SU'
    );
    expect(screen.getByTestId('instructions-empty')).toBeTruthy();
  });

  it('records that a post needs none, and takes it back', async () => {
    mockApi();
    mount(`${positionsPage}/${fitter.id}`);
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
    mount(`${positionsPage}/${welder.id}`);
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
    mount(`${positionsPage}/${welder.id}`);
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

describe('the module form across a reload', () => {
  afterEach(() => act(() => resetReloadDialog()));

  it('keeps the typed articles when a save is refused for an outdated build, but not an added one', async () => {
    mockApi({
      moduleBody: ladderBody,
      saveBody: () =>
        Response.json({ error: 'client_outdated', message: 'Reload.' }, { status: 426 }),
    });
    mount(`/instructiuni/${ladders.id}`);
    const user = userEvent.setup();
    await screen.findByTestId('instruction-form');
    await user.type(articleBoxes()[1]!, ' Nici cu unelte în mână.');
    await choose(
      user,
      screen.getByRole('button', { name: 'Acțiuni pentru Art. 2' }),
      'instruction-article-add'
    );
    await user.keyboard('Articol nou, încă nesalvat.');
    await user.click(screen.getByTestId('editor-save'));
    expect(await screen.findByTestId('reload-dialog')).toBeTruthy();
    expect(screen.getByTestId('reload-dialog-unsaved')).toBeTruthy();

    disposeRuntimes();
    cleanup();
    act(() => resetReloadDialog());
    mount(`/instructiuni/${ladders.id}`);
    await screen.findByTestId('instruction-form');
    await waitFor(() =>
      expect(articleBoxes()[1]!.value).toBe(
        'Este interzisă urcarea cu sarcini grele. Nici cu unelte în mână.'
      )
    );
    expect(articleBoxes()[0]!.value).toBe('Lucrătorul verifică scara:\na) tălpile;\nb) treptele.');
    expect(articleBoxes()).toHaveLength(2);
    expect(await screen.findByText('Am păstrat ce ai scris înainte de reîncărcare.')).toBeTruthy();
    expect(screen.getByTestId('instruction-save-state').textContent).toBe('Modificări nesalvate.');
  });

  it('opens the empty section of a new instruction again to put its kept text back', async () => {
    mockApi({
      create: () =>
        Response.json({ error: 'client_outdated', message: 'Reload.' }, { status: 426 }),
    });
    const runtime = mount('/instructiuni/ssm');
    const user = userEvent.setup();
    await screen.findAllByTestId('instruction-row');
    await user.click(screen.getByTestId('instruction-write'));
    const dialog = await screen.findByTestId('instruction-start-dialog');
    await user.type(within(dialog).getByTestId('instruction-start-title'), 'Activități de birou 2');
    await user.selectOptions(
      within(dialog).getByTestId('instruction-start-group'),
      'work_activity'
    );
    await user.click(within(dialog).getByTestId('instruction-start-submit'));
    await screen.findByTestId('instruction-form');
    await user.click(
      within(sectionCard('Domeniul de aplicare')).getByTestId('instruction-section-write-first')
    );
    await user.keyboard('Instrucțiunea se aplică lucrului la birou.');
    await user.click(screen.getByTestId('editor-save'));
    expect(await screen.findByTestId('reload-dialog-unsaved')).toBeTruthy();

    const address = runtime.router.state.location.href;
    disposeRuntimes();
    cleanup();
    act(() => resetReloadDialog());
    mount(address);
    await screen.findByTestId('instruction-form');
    const scope = sectionCard('Domeniul de aplicare');
    await waitFor(() =>
      expect(within(scope).getByTestId<HTMLTextAreaElement>('instruction-article-text').value).toBe(
        'Instrucțiunea se aplică lucrului la birou.'
      )
    );
    expect(sectionCard('Calificarea necesară').dataset.empty).toBe('true');
  });
});
