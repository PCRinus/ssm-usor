import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode, Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMock, installFetchMock, mockApi as mockRoutes } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { clientId, clientRecord } from '@/test/records';

type Match = { blockId: string; start: number; length: number; text: string };

const mark = (blockId: string): Match => ({ blockId, start: 0, length: 12, text: 'DE COMPLETAT' });

// The real editor is three megabytes of layout engine and needs a browser; the flow tests drive
// it. This stand-in renders the title bar's slots as the packaged one does, around one editor.
const lib = vi.hoisted(() => ({
  matches: [] as Match[],
  selected: [] as Match[],
  recount: null as (() => void) | null,
  edit: null as ((change: { revision: number }) => void) | null,
  undoEnabled: false,
  undo: vi.fn(),
  redo: vi.fn(),
  focus: vi.fn(),
  owners: 0,
}));

vi.mock('@docx-editor.dev/fonts', () => ({ packagedFonts: () => ({}) }));
vi.mock('@docx-editor.dev/core/styles/editor.css', () => ({}));
vi.mock('@docx-editor.dev/react', async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import('react');
  const fakeEditor = {
    findMatches: () => lib.matches,
    selectMatch: (match: Match) => {
      lib.selected.push(match);
      return { ok: true };
    },
    focus: () => lib.focus(),
  };
  type Props = {
    title: string;
    renderTitleBarLeft: () => ReactNode;
    renderTitleBarRight: () => ReactNode;
    onReady: () => void;
    onChange: (change: { revision: number }) => void;
  };
  const Editor = forwardRef(function FakeDocxEditor(props: Props, ref: Ref<unknown>) {
    useImperativeHandle(ref, () => ({
      save: async () => new Uint8Array([80, 75, 3, 4, 9]).buffer,
      getDocumentHandle: () => ({ revision: 0 }),
    }));
    useEffect(() => {
      lib.edit = props.onChange;
      props.onReady();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like the real editor
    }, []);
    return (
      <div data-testid="fake-docx">
        {props.renderTitleBarLeft()}
        <span data-testid="fake-docx-title">{props.title}</span>
        {props.renderTitleBarRight()}
      </div>
    );
  });
  const Part = ({ hidden }: { hidden?: boolean }) => (hidden ? null : <span>part</span>);
  const Toolbar = Object.assign(
    ({ children }: { children: ReactNode }) => <div data-testid="fake-toolbar">{children}</div>,
    { Undo: Part, Redo: Part, Strike: Part, Link: Part, EditingMode: Part, Comments: Part }
  );
  return {
    DocxEditor: Object.assign(Editor, { Toolbar }),
    useDocxEditor: () => fakeEditor,
    useEditorEvent: (event: string, handler: () => void) => {
      if (event === 'change') lib.recount = handler;
    },
    useHighlights: () => {
      useEffect(() => {
        lib.owners += 1;
        return () => {
          lib.owners -= 1;
        };
      }, []);
    },
    useEditorCommand: (slot: string) => ({
      isEnabled: slot === 'history.undo' && lib.undoEnabled,
      execute: slot === 'history.undo' ? lib.undo : lib.redo,
    }),
    useChromeTranslate: () => (key: string) => key,
  };
});

const documentId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const revision = (overrides: Record<string, unknown> = {}) => ({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  revision: 2,
  status: 'draft',
  issueDate: '2026-01-19',
  dataChanged: false,
  editedAt: null,
  issuedAt: null,
  hasPdf: false,
  hasSignedCopy: false,
  receivedCopy: null,
  annexes: [] as unknown[],
  createdAt: '2026-09-19T10:00:00+00:00',
  ...overrides,
});
const title = 'Decizia privind responsabilii cu primul ajutor';
const draft = {
  id: documentId,
  clientId,
  typeKey: 'decision_first_aid',
  title,
  decisionNumber: 5,
  editable: true,
  draft: revision() as ReturnType<typeof revision> | null,
  issued: null as ReturnType<typeof revision> | null,
};
const issued = {
  ...draft,
  draft: null,
  issued: revision({ id: 'c4b2e4c1-3d5f-4a6b-8c7d-0e9f8a7b6c5d', revision: 1, status: 'issued' }),
};

function mockApi({
  client = clientRecord(),
  document = draft as unknown,
  contract = null as unknown,
  save = () => Response.json({ document: draft }) as Response | Promise<Response>,
  print = () => new Promise<Response>(() => {}) as Response | Promise<Response>,
} = {}) {
  mockRoutes((init, { pathname }) => {
    const method = init?.method ?? 'GET';
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/documents`) {
      return Response.json({ items: [document], lastGeneration: null });
    }
    if (pathname === `/clients/${clientId}/service-contract`) {
      return Response.json({ document: contract, missing: [], sentTo: null });
    }
    if (pathname.endsWith('/download')) {
      return Response.json({
        url: 'https://files.example.test/signed',
        fileName: 'Decizia - rev. 2.docx',
        expiresInSeconds: 60,
      });
    }
    if (pathname === '/signed') return new Response(new Uint8Array([80, 75, 3, 4]));
    if (pathname === `/documents/${documentId}/draft/file` && method === 'PUT') return save();
    if (pathname === `/documents/${documentId}/print` && method === 'POST') return print();
    if (pathname === `/documents/${documentId}/draft` && method === 'POST') {
      return Response.json({ document: draft });
    }
  });
}

const mount = (path = `/clienti/${clientId}/documente-ssm/${documentId}`) =>
  mountApp(authFixture(makeSession()).client, path);

const bar = () => screen.findByTestId('editor-phone-bar');
const menuButton = () => screen.getByTestId('editor-phone-menu');

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(menuButton());
  return screen.findByTestId('editor-phone-menu-content');
}

async function recount(matches: Match[]) {
  lib.matches = matches;
  act(() => lib.recount?.());
  await act(() => vi.advanceTimersByTimeAsync(200));
}

installFetchMock();

beforeEach(() => {
  lib.matches = [];
  lib.selected = [];
  lib.recount = null;
  lib.edit = null;
  lib.undoEnabled = false;
  lib.undo.mockClear();
  lib.redo.mockClear();
  lib.focus.mockClear();
  lib.owners = 0;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(width < 40rem)' || query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return () => vi.useRealTimers();
});

describe('the document editor on a phone', () => {
  it('offers to start a draft from an issued document, and explains in the menu what that does', async () => {
    mockApi({ document: issued });
    mount();
    const user = userEvent.setup();

    const phoneBar = await bar();
    expect(within(phoneBar).getByTestId('editor-phone-title').textContent).toBe(title);
    expect(within(phoneBar).getByTestId('editor-back')).toBeTruthy();
    expect(within(phoneBar).getByTestId('editor-phone-start-draft').textContent).toBe('Modifică');
    expect(screen.queryByTestId('editor-phone-undo')).toBeNull();
    expect(screen.queryByTestId('fake-toolbar')).toBeNull();
    expect(screen.queryByTestId('editor-download')).toBeNull();
    expect(screen.queryByTestId('editor-state')).toBeNull();
    expect(screen.getAllByTestId('editor-back')).toHaveLength(1);
    expect(menuButton().getAttribute('aria-label')).toBe('Opțiunile documentului');
    expect(screen.getByRole('banner').className).toContain('max-sm:hidden');
    expect(screen.getByTestId('editor-frame').className).toContain('max-sm:-m-3');

    const menu = await openMenu(user);
    const heading = within(menu).getByTestId('editor-phone-menu-heading');
    expect(heading.textContent).toContain(title);
    expect(heading.textContent).toContain('Emis · rev. 1');
    expect(within(menu).getByTestId('editor-phone-note').textContent).toContain(
      '„Modifică” pornește din el o ciornă nouă'
    );
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['Navigare', 'Descarcă documentul Word', 'Tipărește']);
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('editor-phone-start-draft'));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(`/documents/${documentId}/draft`) && init?.method === 'POST'
        )
      ).toBe(true)
    );
  });

  it('only reads document 13, and says why in the menu', async () => {
    mockApi({ document: { ...issued, typeKey: 'ssm_duties', editable: false } });
    mount();
    const user = userEvent.setup();

    const phoneBar = await bar();
    expect(within(phoneBar).queryByRole('button', { name: /Modifică|Salvează/ })).toBeNull();
    const menu = await openMenu(user);
    expect(within(menu).getByTestId('editor-phone-note').textContent).toBe(
      'Se generează din datele clientului; o regulă a unui post se adaugă prin instrucțiunile proprii.'
    );
  });

  it('only reads a document of an archived client, and says why in the menu', async () => {
    mockApi({
      client: clientRecord({ archivedAt: '2026-10-01T10:00:00+00:00' }),
      document: issued,
    });
    mount();
    const user = userEvent.setup();

    const phoneBar = await bar();
    expect(within(phoneBar).queryByRole('button', { name: /Modifică|Salvează/ })).toBeNull();
    expect(screen.queryByTestId('editor-phone-saved')).toBeNull();

    const menu = await openMenu(user);
    const heading = within(menu).getByTestId('editor-phone-menu-heading');
    expect(heading.textContent).toContain('Client arhivat');
    expect(within(menu).getByTestId('editor-phone-note').textContent).toBe(
      'Clientul este arhivat: documentul poate fi doar citit.'
    );
  });

  it('shows a clean draft as saved, with undo and redo and the formatting toolbar without them', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    expect(screen.queryByTestId('editor-phone-title')).toBeNull();
    expect(screen.getByTestId('editor-phone-saved').textContent).toBe('Salvat');
    expect(screen.queryByTestId('editor-phone-save')).toBeNull();
    expect(screen.getByTestId<HTMLButtonElement>('editor-phone-undo').disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('editor-phone-redo').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Anulează' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refă' })).toBeTruthy();
    expect(screen.getByTestId('fake-toolbar').textContent).toBe('');

    const menu = await openMenu(user);
    expect(within(menu).getByTestId('editor-phone-menu-heading').textContent).toContain(title);
    expect(within(menu).getByTestId('editor-phone-menu-heading').textContent).toContain(
      'Ciornă · rev. 2'
    );
    expect(within(menu).getByTestId('editor-phone-status').textContent).toBe('Salvat');
    expect(within(menu).queryByTestId('editor-phone-unfilled')).toBeNull();
  });

  it('runs undo and redo from the bar', async () => {
    lib.undoEnabled = true;
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    await user.click(screen.getByTestId('editor-phone-undo'));
    expect(lib.undo).toHaveBeenCalledTimes(1);
    expect(lib.redo).not.toHaveBeenCalled();
  });

  it('saves unsaved changes from the bar, and the menu says they are unsaved', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    act(() => lib.edit?.({ revision: 1 }));
    const save = screen.getByTestId('editor-phone-save');
    expect(save.textContent).toBe('Salvează');
    const menu = await openMenu(user);
    const status = within(menu).getByTestId('editor-phone-status');
    expect(status.textContent).toBe('Modificări nesalvate');
    expect(status.className).toContain('text-warning-foreground');
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('editor-phone-save'));
    expect(await screen.findByText('Documentul a fost salvat.')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-phone-saved')).toBeTruthy());
  });

  it('counts the places to fill on the menu button, and steps through them from the menu', async () => {
    lib.matches = [mark('p1'), mark('p2'), mark('p3'), mark('p4')];
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    await waitFor(() =>
      expect(screen.getByTestId('editor-phone-unfilled-count').textContent).toBe('4')
    );
    expect(menuButton().getAttribute('aria-label')).toBe(
      'Opțiunile documentului, 4 locuri de completat'
    );
    expect(screen.queryByTestId('editor-phone-stepper')).toBeNull();

    const menu = await openMenu(user);
    const row = within(menu).getByTestId('editor-phone-unfilled');
    expect(row.textContent).toBe(
      '4 locuri de completatArată primul loc. Ce scrii acolo îl înlocuiește.'
    );
    await user.click(row);

    await waitFor(() => expect(lib.selected).toEqual([mark('p1')]));
    expect(lib.focus).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('editor-phone-menu-content')).toBeNull();
    expect(document.activeElement).not.toBe(menuButton());
    expect(screen.getByTestId('editor-phone-stepper-place').textContent).toBe('Locul 1 din 4');
    expect(lib.owners).toBe(1);

    await user.click(screen.getByTestId('editor-phone-stepper-next'));
    expect(lib.selected.at(-1)).toEqual(mark('p2'));
    expect(lib.focus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('editor-phone-stepper-place').textContent).toBe('Locul 2 din 4');

    await recount([mark('p1'), mark('p3'), mark('p4')]);
    expect(screen.getByTestId('editor-phone-unfilled-count').textContent).toBe('3');
    expect(screen.getByTestId('editor-phone-stepper-place').textContent).toBe(
      '3 locuri de completat'
    );
    await user.click(screen.getByTestId('editor-phone-stepper-next'));
    expect(lib.selected.at(-1)).toEqual(mark('p3'));
    expect(screen.getByTestId('editor-phone-stepper-place').textContent).toBe('Locul 2 din 3');

    await recount([]);
    expect(screen.queryByTestId('editor-phone-stepper')).toBeNull();
    expect(screen.queryByTestId('editor-phone-unfilled-count')).toBeNull();
    expect(menuButton().getAttribute('aria-label')).toBe('Opțiunile documentului');
    const after = await openMenu(user);
    expect(within(after).queryByTestId('editor-phone-unfilled')).toBeNull();
  });

  it('closes the strip of places to fill on request', async () => {
    lib.matches = [mark('p1'), mark('p2')];
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    await user.click(await within(await openMenu(user)).findByTestId('editor-phone-unfilled'));
    await screen.findByTestId('editor-phone-stepper');
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Închide' }))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByTestId('editor-phone-stepper-next'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Închide' }));

    expect(screen.queryByTestId('editor-phone-stepper')).toBeNull();
    expect(screen.getByTestId('editor-phone-unfilled-count').textContent).toBe('2');
  });

  it('names the company in the bar of an issued service contract, and both in the menu', async () => {
    const contract = {
      ...issued,
      typeKey: 'service_contract',
      title: 'Contract de prestări servicii',
    };
    const client = clientRecord({ legalName: 'EXEMPLU CONSTRUCT SRL' });
    mockApi({ client, contract });
    mount(`/clienti/${clientId}/contract/editare`);
    const user = userEvent.setup();

    const phoneBar = await bar();
    expect(within(phoneBar).getByTestId('editor-phone-title').textContent).toBe(
      'EXEMPLU CONSTRUCT SRL'
    );
    expect(screen.queryByTestId('editor-company')).toBeNull();
    const menu = await openMenu(user);
    const heading = within(menu).getByTestId('editor-phone-menu-heading');
    expect(heading.textContent).toContain('Contract de prestări servicii');
    expect(heading.textContent).toContain('EXEMPLU CONSTRUCT SRL');
  });
});

const moduleId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const pinnedVersionId = '7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c2b';
const instruction = {
  id: moduleId,
  title: 'Lucrul la înălțime',
  group: 'work_activity',
  domain: 'ssm',
  archivedAt: null as string | null,
  version: {
    id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    number: 4,
    textHash: 'a'.repeat(64),
    articleCount: 12,
    createdAt: '2026-11-12T10:00:00.000Z',
  },
  appliedCount: 2,
  positionCount: 2,
  clientCount: 1,
  createdAt: '2026-09-26T09:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
};

function mockInstruction({ module = instruction, pinnedNumber = 3 } = {}) {
  mockRoutes((_init, { pathname }) => {
    if (pathname === `/instruction-modules/${moduleId}`) {
      return Response.json({ module, body: { blocks: [] } });
    }
    if (pathname === `/instruction-modules/${moduleId}/download`) {
      return new Response(new Uint8Array([80, 75, 3, 4]), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': "attachment; filename*=UTF-8''Lucrul.docx",
        },
      });
    }
    if (pathname === `/instruction-modules/${moduleId}/versions/${pinnedVersionId}`) {
      return Response.json({
        version: { ...module.version, id: pinnedVersionId, number: pinnedNumber },
        body: { blocks: [] },
      });
    }
  });
}

describe('an instruction on a phone', () => {
  it('reads the version a document annexed, older than the library, with a way to the current one', async () => {
    mockInstruction();
    mount(`/instructiuni/${moduleId}?version=${pinnedVersionId}`);
    const user = userEvent.setup();

    const phoneBar = await bar();
    expect(within(phoneBar).getByTestId('editor-phone-title').textContent).toBe(
      'Lucrul la înălțime'
    );
    expect(within(phoneBar).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('fake-toolbar')).toBeNull();
    expect(screen.queryByTestId('editor-pinned-version')).toBeNull();

    const menu = await openMenu(user);
    const heading = within(menu).getByTestId('editor-phone-menu-heading');
    expect(heading.textContent).toContain('Versiunea 3');
    expect(heading.textContent).toContain('Mai veche decât biblioteca');
    expect(within(menu).getByTestId('editor-phone-note').textContent).toBe(
      'Versiunea pe care o anexează documentul. Biblioteca are acum versiunea 4, din 12.11.2026.'
    );
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['Deschide versiunea curentă', 'Navigare', 'Descarcă documentul Word']);
    expect(within(menu).getByTestId('editor-phone-open-current').getAttribute('href')).toBe(
      `/instructiuni/${moduleId}`
    );
  });

  it('says when the annexed version is the current one', async () => {
    mockInstruction({ pinnedNumber: 4 });
    mount(`/instructiuni/${moduleId}?version=${pinnedVersionId}`);
    const user = userEvent.setup();

    await bar();
    const menu = await openMenu(user);
    expect(within(menu).getByTestId('editor-phone-menu-heading').textContent).toContain('Curentă');
    expect(within(menu).getByTestId('editor-phone-open-current').textContent).toBe(
      'Deschide în bibliotecă'
    );
  });

  it('reads an archived instruction and says how to change it', async () => {
    mockInstruction({ module: { ...instruction, archivedAt: '2026-11-01T10:00:00.000Z' } });
    mount(`/instructiuni/${moduleId}`);
    const user = userEvent.setup();

    await bar();
    const menu = await openMenu(user);
    expect(within(menu).getByTestId('editor-phone-menu-heading').textContent).toContain('Arhivată');
    expect(within(menu).getByTestId('editor-phone-note').textContent).toContain(
      'Reactiveaz-o din bibliotecă ca să o modifici.'
    );
    expect(within(menu).queryByTestId('editor-phone-open-current')).toBeNull();
    expect(within(menu).queryByTestId('editor-phone-print')).toBeNull();
  });
});

describe('the phone bar keeps the page focused', () => {
  it('takes no focus from a tap anywhere on the bar, disabled buttons included, and still opens its menu', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await bar();
    const undo = screen.getByTestId<HTMLButtonElement>('editor-phone-undo');
    expect(undo.disabled).toBe(true);
    expect(fireEvent.mouseDown(undo)).toBe(false);
    expect(fireEvent.mouseDown(screen.getByTestId('editor-phone-bar-row'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByTestId('editor-phone-saved'))).toBe(false);
    expect(await openMenu(user)).toBeTruthy();
  });

  it('still leaves through the back arrow', async () => {
    mockApi({ document: issued });
    const runtime = mount();
    const user = userEvent.setup();

    await bar();
    expect(fireEvent.mouseDown(screen.getByTestId('editor-phone-title'))).toBe(false);
    await user.click(within(await bar()).getByTestId('editor-back'));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${clientId}/documente-ssm`)
    );
  });
});

describe('the phone bar while something is under way', () => {
  it('shows printing on the menu button, and keeps print disabled', async () => {
    mockApi({ document: issued });
    mount();
    const user = userEvent.setup();

    await bar();
    await user.click(within(await openMenu(user)).getByTestId('editor-phone-print'));

    await waitFor(() =>
      expect(menuButton().getAttribute('aria-label')).toBe('Se pregătește tipărirea')
    );
    expect(menuButton().getAttribute('aria-busy')).toBe('true');
    expect(within(menuButton()).getByTestId('editor-phone-busy')).toBeTruthy();
    const print = within(await openMenu(user)).getByTestId('editor-phone-print');
    expect(print.getAttribute('aria-disabled')).toBe('true');
    expect(print.textContent).toBe('Se pregătește…');
  });

  it('keeps the short label while saving, disabled, with a spinner', async () => {
    mockApi({ save: () => new Promise<Response>(() => {}) });
    mount();
    const user = userEvent.setup();

    await bar();
    act(() => lib.edit?.({ revision: 1 }));
    await user.click(screen.getByTestId('editor-phone-save'));

    const save = screen.getByTestId<HTMLButtonElement>('editor-phone-save');
    await waitFor(() => expect(save.disabled).toBe(true));
    expect(save.textContent).toBe('Salvează');
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect(save.querySelector('.animate-spin')).toBeTruthy();
  });
});
