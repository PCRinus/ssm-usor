import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const client = {
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
  currentEmployeeCount: 6,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: '2026-09-20T10:00:00+00:00' as string | null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const certificate = {
  id: '0b8f6a52-4f0e-4d3a-9c1b-7e2d5a6f8c01',
  name: 'Certificat de înregistrare',
  note: 'Copie conformă, primită de la contabil.' as string | null,
  ownersOnly: false,
  originalFileName: 'certificat.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1_258_291,
  sha256: 'a'.repeat(64),
  uploadedBy: { id: 'user-two', fullName: 'Ana Ionescu' as string | null },
  canChange: true,
  createdAt: '2026-09-29T09:00:00+00:00',
  updatedAt: '2026-09-29T09:00:00+00:00',
};

const offer = {
  ...certificate,
  id: '3c9d2e71-8a4b-4f6c-b1d0-5e7f9a2b4c6d',
  name: 'Ofertă 2026',
  note: null,
  ownersOnly: true,
  originalFileName: 'oferta.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 48_000,
  canChange: false,
};

const filesPath = `/clients/${clientId}/files`;

type Handler = (init: RequestInit | undefined, url: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  role = 'specialist' as 'owner' | 'specialist',
  company = client as typeof client,
  items = [certificate, offer] as unknown[],
  update = ((init) =>
    Response.json({ file: { ...certificate, ...JSON.parse(String(init?.body)) } })) as Handler,
  ownersOnly = ((init) =>
    Response.json({ file: { ...certificate, ...JSON.parse(String(init?.body)) } })) as Handler,
  remove = (() => new Response(null, { status: 204 })) as Handler,
  download = ((_, url) =>
    Response.json({
      url: 'http://127.0.0.1:54321/storage/v1/object/sign/client-files/x',
      fileName: url.pathname.includes(offer.id) ? 'oferta.xlsx' : 'certificat.pdf',
      disposition: url.pathname.includes(offer.id) ? 'attachment' : 'inline',
      expiresInSeconds: 60,
    })) as Handler,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Radu Pop', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role,
        },
      });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client: company });
    if (pathname === filesPath) return Response.json({ items });
    if (pathname.endsWith('/download')) return download(init, url);
    if (pathname.endsWith('/owners-only')) return ownersOnly(init, url);
    if (pathname.startsWith(`${filesPath}/`)) {
      return method === 'DELETE' ? remove(init, url) : update(init, url);
    }
    if (pathname === `/clients/${clientId}/service-contract`) {
      return Response.json({}, { status: 500 });
    }
    if (pathname === `/clients/${clientId}/owner-notes`) {
      return Response.json({ notes: { body: '', updatedAt: null } });
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (pathname: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const bodyOf = (pathname: string, method: string) =>
  JSON.parse(String(requests(pathname, method)[0]?.[1]?.body)) as unknown;

type Sent = { url: URL; headers: Record<string, string>; body: Blob };

const uploads: Sent[] = [];

const stored = (sent: Sent) => ({
  status: 201,
  body: {
    file: { ...certificate, name: sent.url.searchParams.get('fileName')!.replace(/\.[^.]+$/, '') },
  },
});

let answerUpload: (sent: Sent) => { status: number; body: unknown } = stored;

let holdUploads: Promise<void> = Promise.resolve();

class FakeXhr {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  responseURL = '';
  private url = '';
  private headers: Record<string, string> = {};

  open(_method: string, url: URL | string) {
    this.url = String(url);
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return null;
  }
  abort() {}
  send(body: Blob) {
    const sent = { url: new URL(this.url), headers: this.headers, body };
    uploads.push(sent);
    void holdUploads.then(() =>
      setTimeout(() => {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: body.size,
          total: body.size,
        } as ProgressEvent);
        const answer = answerUpload(sent);
        this.status = answer.status;
        this.responseText = JSON.stringify(answer.body);
        this.responseURL = this.url;
        this.onload?.();
      }, 0)
    );
  }
}

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

const mount = (path = `/clients/${clientId}/other-documents`) =>
  mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  uploads.length = 0;
  answerUpload = stored;
  holdUploads = Promise.resolve();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the other documents of a client', () => {
  it('is the last tab of the client, and lists each file with its size, date and uploader', async () => {
    mockApi();
    mount();

    const rows = await screen.findAllByTestId('client-file-row');
    await waitFor(() => expect(document.title).toBe('Alte documente — VELOCE CAFE SRL — SSM Ușor'));
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections.at(-1)).toBe('Alte documente');
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    expect(within(first!).getByTestId('client-file-open').textContent).toBe(
      'Certificat de înregistrare'
    );
    expect(within(first!).getByTestId('client-file-row-note').textContent).toBe(
      'Copie conformă, primită de la contabil.'
    );
    expect(within(first!).getByTestId('client-file-kind').textContent).toBe('PDF');
    expect(first!.textContent).toContain('1,2 MB');
    expect(first!.textContent).toContain('29.09.2026');
    expect(first!.textContent).toContain('Ana Ionescu');
    expect(within(second!).getByTestId('client-file-kind').textContent).toBe('Excel');
    expect(second!.textContent).toContain('47 KB');
  });

  it('lets a specialist upload and change their own files, but not choose who sees them', async () => {
    mockApi();
    mount();

    const user = userEvent.setup();

    const [first, second] = await screen.findAllByTestId('client-file-row');
    expect(within(first!).getByTestId('client-file-actions')).toBeTruthy();
    expect(within(second!).queryByTestId('client-file-actions')).toBeNull();
    expect(within(second!).getByTestId('client-file-download')).toBeTruthy();

    await user.click(within(first!).getByTestId('client-file-actions'));
    expect(await screen.findByTestId('client-file-rename')).toBeTruthy();
    expect(screen.queryByTestId('client-file-owners-only-switch')).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('client-files-upload'));
    const dialog = await screen.findByTestId('client-files-upload-dialog');
    expect(within(dialog).getByTestId('client-files-choose')).toBeTruthy();
    expect(within(dialog).queryByTestId('client-files-owners-only')).toBeNull();
  });

  it('marks the files for owners only, and lets an owner switch a file between the two', async () => {
    mockApi({ role: 'owner', items: [certificate, { ...offer, canChange: true }] });
    mount();
    const user = userEvent.setup();

    const [first, second] = await screen.findAllByTestId('client-file-row');
    expect(within(first!).queryByTestId('client-file-owners-only')).toBeNull();
    expect(within(second!).getByTestId('client-file-owners-only').textContent).toBe(
      'Doar administratori'
    );

    await user.click(within(first!).getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-owners-only-switch'));

    await waitFor(() =>
      expect(bodyOf(`${filesPath}/${certificate.id}/owners-only`, 'PUT')).toEqual({
        ownersOnly: true,
      })
    );
    expect(
      await screen.findByText('„Certificat de înregistrare” este acum doar pentru administratori.')
    ).toBeTruthy();
  });

  it('says so when the switch fails', async () => {
    mockApi({
      role: 'owner',
      ownersOnly: () => Response.json({ error: 'server_error' }, { status: 500 }),
    });
    mount();
    const user = userEvent.setup();

    const [first] = await screen.findAllByTestId('client-file-row');
    await user.click(within(first!).getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-owners-only-switch'));

    expect(
      await screen.findByText(
        'Nu am putut schimba cine vede „Certificat de înregistrare”. Încearcă din nou.'
      )
    ).toBeTruthy();
  });

  it('offers only the list and the downloads under an archived client', async () => {
    mockApi({ role: 'owner', company: { ...client, archivedAt: '2026-09-29T10:00:00+00:00' } });
    mount();

    const [first] = await screen.findAllByTestId('client-file-row');
    expect(screen.queryByTestId('client-files-upload')).toBeNull();
    expect(screen.queryByTestId('client-file-actions')).toBeNull();
    expect(within(first!).getByTestId('client-file-download')).toBeTruthy();

    const card = screen.getByTestId('client-files-card');
    fireEvent.dragEnter(card, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.queryByTestId('client-files-drop')).toBeNull();
    fireEvent.drop(card, { dataTransfer: { types: ['Files'], files: [pdf('aviz.pdf')] } });
    expect(screen.queryByTestId('client-files-upload-dialog')).toBeNull();
  });

  it('invites the first upload when there are no files', async () => {
    mockApi({ items: [] });
    mount();

    const empty = await screen.findByTestId('client-files-empty');
    expect(empty.textContent).toContain('Niciun fișier încă.');
    await userEvent.setup().click(within(empty).getByRole('button', { name: 'Alege fișiere' }));
    expect(await screen.findByTestId('client-files-upload-dialog')).toBeTruthy();
  });
});

const openUploadDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByTestId('client-files-upload'));
  return screen.findByTestId('client-files-upload-dialog');
};

const chosenRows = (dialog: HTMLElement) => within(dialog).queryAllByTestId('client-file-upload');

describe('uploading client files', () => {
  it('lists the chosen files in a dialog and refuses some before sending them', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup({ applyAccept: false });
    const large = pdf('scan.pdf');
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    const certificate = pdf('certificat.pdf');

    const dialog = await openUploadDialog(user);
    expect(within(dialog).getByTestId('client-files-upload-submit')).toHaveProperty(
      'disabled',
      true
    );
    expect(dialog.textContent).toContain(
      'PDF, imagini, Word sau Excel, de cel mult 20 MB fiecare.'
    );
    await user.upload(within(dialog).getByTestId('client-files-input'), [
      new File(['MZ'], 'setup.exe'),
      large,
      certificate,
    ]);
    await user.upload(within(dialog).getByTestId('client-files-input'), certificate);

    const rows = chosenRows(dialog);
    expect(rows.map((row) => row.dataset.state)).toEqual(['refused', 'refused', 'ready']);
    expect(
      rows.slice(0, 2).map((row) => within(row).getByTestId('client-file-upload-error').textContent)
    ).toEqual([
      'Se pot încărca doar fișiere PDF, JPEG, PNG, Word și Excel.',
      'Fișierul depășește 20 MB.',
    ]);
    expect(rows[2]!.textContent).toContain('PDF · 1 KB');
    expect(within(dialog).getByTestId('client-files-upload-submit').textContent).toBe(
      'Încarcă fișierul'
    );
    expect(uploads).toHaveLength(0);

    await user.click(within(rows[0]!).getByTestId('client-file-upload-remove'));
    expect(chosenRows(dialog)).toHaveLength(2);

    await user.click(within(dialog).getByTestId('client-files-upload-submit'));

    expect(await screen.findByText('„certificat” a fost încărcat.')).toBeTruthy();
    expect(uploads.map((sent) => sent.url.searchParams.get('fileName'))).toEqual([
      'certificat.pdf',
    ]);
    await waitFor(() => expect(screen.queryByTestId('client-files-upload-dialog')).toBeNull());
  });

  it("keeps the dialog open after a failure, with the API's refusal under the file", async () => {
    mockApi({ items: [] });
    answerUpload = (sent) =>
      sent.url.searchParams.get('fileName') === 'a.pdf'
        ? {
            status: 400,
            body: {
              error: 'validation_error',
              message: 'The content is not of that type.',
              reason: 'client_file_content_mismatch',
            },
          }
        : stored(sent);
    mount();
    const user = userEvent.setup();

    const dialog = await openUploadDialog(user);
    await user.upload(within(dialog).getByTestId('client-files-input'), [
      pdf('a.pdf'),
      pdf('b.pdf'),
    ]);
    await user.click(within(dialog).getByTestId('client-files-upload-submit'));

    expect((await within(dialog).findByTestId('client-files-upload-failed')).textContent).toBe(
      'Un fișier nu a fost încărcat. Motivul este scris sub numele lui.'
    );
    const [failed, uploaded] = chosenRows(dialog);
    expect(failed!.dataset.state).toBe('failed');
    expect(within(failed!).getByTestId('client-file-upload-error').textContent).toBe(
      'Conținutul nu corespunde tipului din numele fișierului. Salvează-l din nou din programul în care a fost creat.'
    );
    expect(uploaded!.dataset.state).toBe('uploaded');
    expect(within(dialog).queryByTestId('client-files-upload-submit')).toBeNull();
    expect(within(dialog).queryByTestId('client-files-choose')).toBeNull();
    expect(screen.queryByText('„b” a fost încărcat.')).toBeNull();

    await user.click(within(dialog).getByTestId('client-files-upload-close'));
    await waitFor(() => expect(screen.queryByTestId('client-files-upload-dialog')).toBeNull());
  });

  it('sends each file on its own, for owners only when asked, and reports the batch once', async () => {
    mockApi({ role: 'owner', items: [] });
    mount();
    const user = userEvent.setup();

    const dialog = await openUploadDialog(user);
    expect(within(dialog).getByTestId('client-files-owners-only')).toBeTruthy();
    await user.upload(within(dialog).getByTestId('client-files-input'), [
      pdf('certificat.pdf'),
      pdf('proces-verbal ITM.pdf'),
    ]);
    await user.click(within(dialog).getByTestId('client-files-owners-only'));
    expect(within(dialog).getByTestId('client-files-upload-submit').textContent).toBe(
      'Încarcă 2 fișiere'
    );
    await user.click(within(dialog).getByTestId('client-files-upload-submit'));

    expect(await screen.findByText('Au fost încărcate 2 fișiere.')).toBeTruthy();
    expect(uploads.map((sent) => sent.url.pathname)).toEqual([filesPath, filesPath]);
    expect(uploads.map((sent) => Object.fromEntries(sent.url.searchParams))).toEqual([
      { fileName: 'certificat.pdf', ownersOnly: 'true' },
      { fileName: 'proces-verbal ITM.pdf', ownersOnly: 'true' },
    ]);
    expect(uploads[0]!.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      'Content-Type': 'application/octet-stream',
    });
    await waitFor(() => expect(screen.queryByTestId('client-files-upload-dialog')).toBeNull());
    expect(requests(filesPath, 'GET').length).toBeGreaterThan(1);
  });

  it('cannot be cancelled while the files are being sent', async () => {
    mockApi({ items: [] });
    let release = () => {};
    holdUploads = new Promise((resolve) => (release = resolve));
    mount();
    const user = userEvent.setup();

    const dialog = await openUploadDialog(user);
    await user.upload(within(dialog).getByTestId('client-files-input'), pdf('aviz.pdf'));
    await user.click(within(dialog).getByTestId('client-files-upload-submit'));

    expect(within(dialog).getByTestId('client-files-upload-submit').textContent).toBe(
      'Se încarcă…'
    );
    expect(within(dialog).getByRole('button', { name: 'Renunță' })).toHaveProperty(
      'disabled',
      true
    );
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('client-files-upload-dialog')).toBeTruthy();

    release();
    expect(await screen.findByText('„aviz” a fost încărcat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('client-files-upload-dialog')).toBeNull());
  });

  it('opens the dialog with the files dropped on the card, and keeps a drop beside it from leaving the app', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    const card = await screen.findByTestId('client-files-card');
    fireEvent.dragEnter(card, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByTestId('client-files-drop')).toBeTruthy();
    fireEvent.drop(card, { dataTransfer: { types: ['Files'], files: [pdf('aviz.pdf')] } });

    expect(screen.queryByTestId('client-files-drop')).toBeNull();
    const dialog = await screen.findByTestId('client-files-upload-dialog');
    expect(chosenRows(dialog).map((row) => row.dataset.state)).toEqual(['ready']);
    expect(uploads).toHaveLength(0);

    fireEvent.drop(within(dialog).getByTestId('client-files-upload-drop'), {
      dataTransfer: { types: ['Files'], files: [pdf('altul.pdf')] },
    });
    expect(chosenRows(dialog)).toHaveLength(2);

    await user.click(within(dialog).getByTestId('client-files-upload-submit'));
    expect(await screen.findByText('Au fost încărcate 2 fișiere.')).toBeTruthy();
    expect(uploads.map((sent) => sent.url.searchParams.get('ownersOnly'))).toEqual([
      'false',
      'false',
    ]);

    const beside = fireEvent.drop(document.body, {
      dataTransfer: { types: ['Files'], files: [pdf('altul.pdf')] },
    });
    expect(beside).toBe(false);
    expect(uploads).toHaveLength(2);
  });
});

describe('changing a client file', () => {
  it('renames a file and changes its note', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const [first] = await screen.findAllByTestId('client-file-row');
    await user.click(within(first!).getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-rename'));
    const name = await screen.findByTestId('client-file-name');
    await user.clear(name);
    await user.click(screen.getByTestId('client-file-save'));
    expect((await screen.findByTestId('client-file-name-error')).textContent).toBe(
      'Introdu numele fișierului.'
    );

    await user.type(name, 'CUI VELOCE');
    await user.clear(screen.getByTestId('client-file-note'));
    await user.click(screen.getByTestId('client-file-save'));

    await waitFor(() =>
      expect(bodyOf(`${filesPath}/${certificate.id}`, 'PATCH')).toEqual({
        name: 'CUI VELOCE',
        note: null,
      })
    );
    expect(await screen.findByText('Fișierul a fost salvat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('client-file-dialog')).toBeNull());
  });

  it('deletes a file only after a confirmation that names it', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const [first] = await screen.findAllByTestId('client-file-row');
    await user.click(within(first!).getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-delete'));
    const dialog = await screen.findByTestId('client-file-delete-dialog');
    expect(dialog.textContent).toContain('Certificat de înregistrare se șterge definitiv');
    expect(requests(`${filesPath}/${certificate.id}`, 'DELETE')).toHaveLength(0);

    await user.click(within(dialog).getByTestId('client-file-delete-confirm'));

    await waitFor(() =>
      expect(requests(`${filesPath}/${certificate.id}`, 'DELETE')).toHaveLength(1)
    );
    expect(await screen.findByText('„Certificat de înregistrare” a fost șters.')).toBeTruthy();
  });

  it('opens a PDF in a tab opened on the click, and downloads a spreadsheet', async () => {
    mockApi();
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push(this.href);
    });
    mount();
    const user = userEvent.setup();

    const [first, second] = await screen.findAllByTestId('client-file-row');
    await user.click(within(first!).getByTestId('client-file-open'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(tab.location.href).toContain('/files/download?'));
    const shown = new URL(tab.location.href);
    expect(shown.searchParams.get('disposition')).toBe('inline');
    expect(shown.searchParams.get('name')).toBe('certificat.pdf');

    await user.click(within(second!).getByTestId('client-file-open'));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(open).toHaveBeenCalledTimes(1);
    expect(new URL(clicked[0]!).searchParams.get('disposition')).toBe('attachment');
  });
});

describe('the files of a lead', () => {
  it('are all for owners only, which the card says once instead of on every file', async () => {
    const lead = { ...client, stage: 'lead', promotedAt: null };
    mockApi({ role: 'owner', company: lead, items: [{ ...offer, canChange: true }] });
    mount(`/clients/${clientId}`);

    const card = await screen.findByTestId('client-files-card');
    expect(screen.getByTestId('lead-page')).toBeTruthy();
    expect(within(card).getByTestId('client-files-lead-hint').textContent).toContain(
      'Până devine client, fișierele lui sunt vizibile doar administratorilor.'
    );
    const [row] = await within(card).findAllByTestId('client-file-row');
    expect(within(row!).queryByTestId('client-file-owners-only')).toBeNull();
    const user = userEvent.setup();

    await user.click(within(row!).getByTestId('client-file-actions'));
    expect(await screen.findByTestId('client-file-rename')).toBeTruthy();
    expect(screen.queryByTestId('client-file-owners-only-switch')).toBeNull();
    await user.keyboard('{Escape}');

    const dialog = await openUploadDialog(user);
    expect(within(dialog).queryByTestId('client-files-owners-only')).toBeNull();
    expect(within(dialog).getByTestId('client-files-upload-lead-hint').textContent).toBe(
      'Până devine client, fișierele lui sunt vizibile doar administratorilor.'
    );
  });
});
