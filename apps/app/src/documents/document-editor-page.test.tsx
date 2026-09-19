import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

// The real editor is three megabytes of layout engine and needs a browser; the flow tests
// drive it. Here a stand-in reports ready, changes, and failures on demand.
const editorMock = vi.hoisted(() => ({ fail: false, saved: new Uint8Array([80, 75, 3, 4, 9]) }));
vi.mock('./document-editor', async () => {
  const { useEffect, useImperativeHandle } = await import('react');
  return {
    default: function FakeEditor(props: {
      bytes: Uint8Array;
      title: string;
      editable: boolean;
      handle: React.Ref<{ save: () => Promise<Uint8Array | null> }>;
      actions: React.ReactNode;
      onReady: () => void;
      onFailed: () => void;
      onChange: () => void;
      onSaveShortcut: () => void;
    }) {
      useImperativeHandle(props.handle, () => ({ save: async () => editorMock.saved }));
      useEffect(() => {
        if (editorMock.fail) props.onFailed();
        else props.onReady();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like the real editor
      }, []);
      return (
        <div
          data-testid="fake-editor"
          data-editable={props.editable}
          data-bytes={props.bytes.length}
        >
          <header>
            {props.title}
            {props.actions}
          </header>
          <button type="button" data-testid="fake-type" onClick={props.onChange}>
            type
          </button>
          <button type="button" data-testid="fake-shortcut" onClick={props.onSaveShortcut}>
            ctrl+s
          </button>
        </div>
      );
    },
  };
});

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const documentId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: 'J40/1234/2019',
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};
const revision = (overrides: Record<string, unknown> = {}) => ({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  revision: 1,
  status: 'draft',
  issueDate: '2026-01-19',
  dataChanged: false,
  editedAt: null,
  issuedAt: null,
  hasPdf: false,
  createdAt: '2026-09-19T10:00:00+00:00',
  ...overrides,
});
const firstAid = {
  id: documentId,
  clientId,
  typeKey: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  decisionNumber: 5,
  draft: revision() as ReturnType<typeof revision> | null,
  issued: null as ReturnType<typeof revision> | null,
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  items = [firstAid] as unknown[],
  file = (() => new Response(new Uint8Array([80, 75, 3, 4]))) as () => Response,
  save = (() => Response.json({ document: firstAid })) as () => Response,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/documents`) {
      return Response.json({ items, lastGeneration: null });
    }
    if (pathname.endsWith('/download')) {
      return Response.json({
        url: 'https://files.example.test/signed',
        fileName: 'Decizia - rev. 1.docx',
        expiresInSeconds: 60,
      });
    }
    if (pathname === '/signed') return file();
    if (pathname === `/documents/${documentId}/draft/file` && method === 'PUT') return save();
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const saves = () =>
  fetchMock.mock.calls.filter(
    ([input, init]) => String(input).endsWith('/draft/file') && init?.method === 'PUT'
  );

const mount = () =>
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/documents/${documentId}`);

beforeEach(() => {
  editorMock.fail = false;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the document editor page', () => {
  it('opens the draft for editing, with nothing to save yet', async () => {
    mockApi();
    mount();

    const editor = await screen.findByTestId('fake-editor');
    expect(editor.dataset.editable).toBe('true');
    expect(editor.dataset.bytes).toBe('4');
    expect(screen.getByTestId('editor-state').textContent).toBe('Ciornă · rev. 1');
    expect(screen.getByTestId('editor-saved-state').textContent).toBe('Salvat');
    expect(screen.getByTestId<HTMLButtonElement>('editor-save').disabled).toBe(true);
    // A full page: the client's header and sections make room for the document.
    expect(screen.queryByTestId('client-section')).toBeNull();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByText(/primul ajutor/)).toBeTruthy();
    expect(within(breadcrumb).queryByText('Document')).toBeNull();
  });

  it("saves what the editor holds as the draft's file, from the button and from Ctrl+S", async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fake-type'));
    expect(screen.getByTestId('editor-saved-state').textContent).toBe('Modificări nesalvate');
    await user.click(screen.getByTestId('editor-save'));

    expect(await screen.findByText('Documentul a fost salvat.')).toBeTruthy();
    expect(saves()).toHaveLength(1);
    const body = saves()[0]![1]?.body as Blob;
    expect(body.size).toBe(5);
    expect(new Headers(saves()[0]![1]?.headers).get('Content-Type')).toContain('wordprocessingml');
    await waitFor(() =>
      expect(screen.getByTestId('editor-saved-state').textContent).toBe('Salvat')
    );

    // The shortcut does nothing while there is nothing to save, and saves once there is.
    await user.click(screen.getByTestId('fake-shortcut'));
    expect(saves()).toHaveLength(1);
    await user.click(screen.getByTestId('fake-type'));
    await user.click(screen.getByTestId('fake-shortcut'));
    await waitFor(() => expect(saves()).toHaveLength(2));
  });

  it('keeps the changes and says what to do when the draft is gone', async () => {
    mockApi({
      save: () => Response.json({ error: 'conflict', message: 'no draft' }, { status: 409 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fake-type'));
    await user.click(screen.getByTestId('editor-save'));

    expect((await screen.findByTestId('editor-save-error')).textContent).toContain(
      'Descarcă fișierul ca să nu pierzi modificările'
    );
    expect(screen.getByTestId('editor-saved-state').textContent).toBe('Modificări nesalvate');
  });

  it('opens an issued document for reading only', async () => {
    mockApi({
      items: [
        {
          ...firstAid,
          draft: null,
          issued: revision({ status: 'issued', issuedAt: '2026-09-19T11:00:00+00:00' }),
        },
      ],
    });
    mount();

    const editor = await screen.findByTestId('fake-editor');
    expect(editor.dataset.editable).toBe('false');
    expect(screen.getByTestId('editor-state').textContent).toBe('Emis · rev. 1');
    expect(screen.queryByTestId('editor-save')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Un document emis nu se mai modifică');
  });

  it('opens the draft of an archived client for reading only', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect((await screen.findByTestId('fake-editor')).dataset.editable).toBe('false');
    expect(screen.queryByTestId('editor-save')).toBeNull();
  });

  it('offers the download when the editor cannot lay the document out', async () => {
    editorMock.fail = true;
    mockApi();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    );
    mount();
    const user = userEvent.setup();

    const fallback = await screen.findByTestId('editor-failed');
    expect(fallback.textContent).toContain('editorul din aplicație nu o poate afișa');
    await user.click(screen.getByRole('button', { name: 'Descarcă documentul' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Decizia - rev. 1.docx');
  });

  it('says so when the document or its file is not there', async () => {
    mockApi({ items: [] });
    mount();
    expect((await screen.findByTestId('editor-unavailable')).textContent).toContain(
      'Documentul nu există'
    );
  });

  it('says so, and retries, when the file cannot be fetched', async () => {
    let attempts = 0;
    mockApi({
      file: () => {
        attempts += 1;
        return attempts === 1
          ? new Response(null, { status: 500 })
          : new Response(new Uint8Array([80, 75, 3, 4]));
      },
    });
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('editor-unavailable')).textContent).toContain(
      'Nu am putut încărca fișierul'
    );
    await user.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('fake-editor')).toBeTruthy();
  });
});
