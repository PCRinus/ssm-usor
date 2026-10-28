import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadImportObject } from '@/features/imports/import-storage';
import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  bodyOf,
  clientId,
  fetchMock,
  importDetail,
  importFile,
  importId,
  mockApi,
  requestsTo,
  summaryOf,
} from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

vi.mock('@/features/imports/import-storage', async (original) => ({
  ...(await original<typeof import('@/features/imports/import-storage')>()),
  uploadImportObject: vi.fn(async () => undefined),
}));

const client = {
  id: clientId,
  legalName: 'Brutăria Spicul Auriu SRL',
  cui: '31458207',
  vatPayer: true,
  caenCode: '1071',
  tradeRegisterNumber: 'J32/412/2013',
  countyCode: 'SB',
  locality: 'Sibiu',
  addressLine: 'Str. Morilor nr. 14',
  legalRepresentativeName: null,
  declaredEmployeeCount: 0,
  currentEmployeeCount: 0,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: '2026-09-20T10:00:00+00:00',
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const started = importDetail({ status: 'preparing', files: [importFile({ state: 'uploaded' })] });

function mockImportApi(
  listed: unknown[] = [],
  start: () => Response = () => Response.json({ import: summaryOf(started) })
) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/clients' && method === 'GET') {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client });
    if (url.pathname === '/imports' && method === 'GET') return Response.json({ items: listed });
    if (url.pathname === '/imports' && method === 'POST') {
      return Response.json(
        { import: summaryOf(importDetail({ status: 'uploading' })) },
        { status: 201 }
      );
    }
    if (url.pathname === `/imports/${importId}/files`) {
      const { files } = JSON.parse(String(init?.body)) as { files: { uploadPath: string }[] };
      return Response.json(
        {
          files: files.map((file, index) => ({
            id: `f0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            uploadPath: file.uploadPath,
            bucket: 'imports',
            storagePath: `org/${importId}/${index + 1}`,
          })),
        },
        { status: 201 }
      );
    }
    if (url.pathname === `/imports/${importId}/start`) return start();
    if (url.pathname === `/imports/${importId}/abandon`) {
      return Response.json({ import: summaryOf(importDetail({ status: 'abandoned' })) });
    }
    if (url.pathname === `/imports/${importId}`) return Response.json({ import: started });
    if (url.pathname.startsWith(`/clients/${clientId}/`)) return Response.json({}, { status: 404 });
    return undefined;
  });
}

const refusedStart = (reason: string) => () =>
  Response.json({ error: 'conflict', message: reason, reason }, { status: 409 });

async function uploadFrom(path: string, files: File[]) {
  const runtime = mountApp(authFixture(makeSession()).client, path);
  await userEvent.click(await screen.findByTestId('clients-import'));
  await screen.findByTestId('import-upload-dialog');
  choose(files);
  await screen.findByTestId('import-chosen');
  await userEvent.click(screen.getByTestId('import-upload-submit'));
  return runtime;
}

const zip = (entries: Record<string, string>) =>
  new File(
    [
      zipSync(
        Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, strToU8(text)]))
      ) as BlobPart,
    ],
    'dosar-ssm-spicul-auriu.zip',
    { type: 'application/zip' }
  );

const choose = (files: File[]) =>
  fireEvent.change(screen.getByTestId('import-files-input'), { target: { files } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(uploadImportObject).mockReset();
  vi.mocked(uploadImportObject).mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('starting an import from the client list', () => {
  it('offers both ways to start on an empty list', async () => {
    mockImportApi();
    mountApp(authFixture(makeSession()).client, '/clients');

    const ways = await screen.findByTestId('clients-start-ways');
    expect(within(ways).getByTestId('clients-start-form').textContent).toContain(
      'Adaugă primul client'
    );
    await userEvent.click(within(ways).getByTestId('clients-start-import'));
    const dialog = await screen.findByTestId('import-upload-dialog');
    expect(within(dialog).getByRole('heading', { name: 'Client nou din documente' })).toBeTruthy();
    expect(within(dialog).getByTestId('import-upload-one-client').textContent).toContain(
      'Un import creează un singur client.'
    );
  });

  it('shows what a zip holds and what is set aside, then hashes, registers, uploads and starts', async () => {
    mockImportApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');

    await userEvent.click(await screen.findByTestId('clients-import'));
    await screen.findByTestId('import-upload-dialog');
    choose([
      zip({
        'Decizie 1 organizare SSM 2024.docx': 'decizie',
        '__MACOSX/._Decizie 1 organizare SSM 2024.docx': 'x',
        'plan evacuare parter.dwg': 'dwg',
      }),
      new File(['%PDF'], 'Contract prestari SSM 2019.pdf', { type: 'application/pdf' }),
      new File(['rar'], 'acte-psi-2021.rar'),
    ]);

    const chosen = await screen.findByTestId('import-chosen');
    expect(chosen.textContent).toContain('2 fișiere alese');
    expect(chosen.textContent).toContain('dosar-ssm-spicul-auriu.zip');
    expect(chosen.textContent).toContain('Deschisă: un fișier');
    expect(screen.getByTestId('import-archive-refused').textContent).toContain(
      'acte-psi-2021.rar nu se poate deschide aici. Dezarhivează-l și trage folderul aici.'
    );
    const aside = screen.getByTestId('import-set-aside');
    expect(aside.textContent).toContain(
      'plan evacuare parter.dwg, tip de fișier pe care nu-l citim'
    );
    expect(within(aside).getByTestId('import-system-files').textContent).toContain(
      '__MACOSX, un fișier de sistem'
    );

    await userEvent.click(screen.getByTestId('import-upload-submit'));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/import/${importId}`)
    );
    expect(bodyOf('/imports', 'POST')).toEqual({});
    const registered = bodyOf(`/imports/${importId}/files`, 'POST') as {
      files: { uploadPath: string; mimeType: string; sha256: string; sizeBytes: number }[];
    };
    expect(registered.files.map((file) => [file.uploadPath, file.mimeType])).toEqual([
      [
        'dosar-ssm-spicul-auriu.zip/Decizie 1 organizare SSM 2024.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ['Contract prestari SSM 2019.pdf', 'application/pdf'],
    ]);
    expect(registered.files[1]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(vi.mocked(uploadImportObject).mock.calls.map(([path, , type]) => [path, type])).toEqual([
      [
        `org/${importId}/1`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [`org/${importId}/2`, 'application/pdf'],
    ]);
    expect(requestsTo(`/imports/${importId}/start`, 'POST')).toHaveLength(1);
    expect(await screen.findByTestId('import-processing')).toBeTruthy();
  });

  it('opens on the reading even when the list read the import while it uploaded', async () => {
    let status = 'uploading';
    const detail = () =>
      importDetail({
        status,
        createdAt: new Date().toISOString(),
        files: [importFile({ state: status === 'uploading' ? 'uploading' : 'uploaded' })],
      });
    mockApi((init, url) => {
      const method = init?.method ?? 'GET';
      if (url.pathname === '/clients') {
        return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
      }
      if (url.pathname === '/imports' && method === 'GET') {
        return Response.json({
          items: requestsTo('/imports', 'POST').length ? [summaryOf(detail())] : [],
        });
      }
      if (url.pathname === '/imports' && method === 'POST') {
        return Response.json({ import: summaryOf(detail()) }, { status: 201 });
      }
      if (url.pathname === `/imports/${importId}/files`) {
        return Response.json(
          { files: [{ id: 'f1', uploadPath: 'a.pdf', bucket: 'imports', storagePath: 'org/1' }] },
          { status: 201 }
        );
      }
      if (url.pathname === `/imports/${importId}/start`) {
        status = 'preparing';
        return Response.json({ import: summaryOf(detail()) });
      }
      if (url.pathname === `/imports/${importId}`) return Response.json({ import: detail() });
      return undefined;
    });
    let releaseUpload = () => {};
    vi.mocked(uploadImportObject).mockImplementation(
      () => new Promise<void>((resolve) => (releaseUpload = resolve))
    );
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');

    await userEvent.click(await screen.findByTestId('clients-import'));
    await screen.findByTestId('import-upload-dialog');
    choose([new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })]);
    await screen.findByTestId('import-chosen');
    await userEvent.click(screen.getByTestId('import-upload-submit'));
    const row = await screen.findByTestId('import-list-row');
    await waitFor(() => expect(row.textContent).toContain('Fișierele se încarcă.'));
    expect(requestsTo(`/imports/${importId}`)).not.toHaveLength(0);
    releaseUpload();

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/import/${importId}`)
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Citim documentele'
    );
    expect(screen.queryByTestId('import-upload-unfinished')).toBeNull();
  });

  it('asks for fewer files past 150', async () => {
    mockImportApi();
    mountApp(authFixture(makeSession()).client, '/clients');

    await userEvent.click(await screen.findByTestId('clients-import'));
    await screen.findByTestId('import-upload-dialog');
    choose(Array.from({ length: 151 }, (_, index) => new File(['%PDF'], `f${index}.pdf`)));

    const over = await screen.findByTestId('import-upload-over');
    expect(over.textContent).toContain('Un import ia cel mult 150 de fișiere și 100 MB');
    expect(over.textContent).toContain('Ai ales 151 de fișiere');
    expect((screen.getByTestId('import-upload-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says a zip holding more than one import takes is too large', async () => {
    mockImportApi();
    mountApp(authFixture(makeSession()).client, '/clients');

    await userEvent.click(await screen.findByTestId('clients-import'));
    await screen.findByTestId('import-upload-dialog');
    choose([
      zip(Object.fromEntries(Array.from({ length: 151 }, (_, index) => [`f${index}.pdf`, 'x']))),
    ]);

    expect((await screen.findByTestId('import-zip-large')).textContent).toBe(
      'dosar-ssm-spicul-auriu.zip e prea mare pentru un singur import, care ia cel mult 150 de fișiere și 100 MB. Dezarhivează-l și împarte documentele în mai multe importuri.'
    );
    expect(screen.queryByTestId('import-chosen')).toBeNull();
  });

  it('offers to try again, or to read without the files that would not upload', async () => {
    mockImportApi();
    vi.mocked(uploadImportObject).mockImplementation(async (path) => {
      if (path.endsWith('/2')) throw new Error('Network down');
    });
    mountApp(authFixture(makeSession()).client, '/clients');

    await userEvent.click(await screen.findByTestId('clients-import'));
    await screen.findByTestId('import-upload-dialog');
    choose([new File(['%PDF'], 'a.pdf'), new File(['%PDF'], 'b.pdf')]);
    await screen.findByTestId('import-chosen');
    await userEvent.click(screen.getByTestId('import-upload-submit'));

    const stalled = await screen.findByTestId('import-upload-stalled');
    expect(stalled.textContent).toContain('Un fișier nu s-a încărcat.');
    expect(vi.mocked(uploadImportObject)).toHaveBeenCalledTimes(3);
    expect(requestsTo(`/imports/${importId}/start`, 'POST')).toHaveLength(0);

    await userEvent.click(within(stalled).getByRole('button', { name: 'Citește fără ele' }));
    await waitFor(() => expect(requestsTo(`/imports/${importId}/start`, 'POST')).toHaveLength(1));
  });
});

describe('an upload that does not go through', () => {
  it('lets go of an import none of whose files went up', async () => {
    mockImportApi();
    vi.mocked(uploadImportObject).mockRejectedValue(new Error('Network down'));
    await uploadFrom('/clients', [new File(['%PDF'], 'a.pdf'), new File(['%PDF'], 'b.pdf')]);

    const stalled = await screen.findByTestId('import-upload-stalled');
    expect(stalled.textContent).toContain('Niciun fișier nu s-a încărcat.');
    expect(within(stalled).queryByRole('button', { name: 'Citește fără ele' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));

    await waitFor(() => expect(screen.queryByTestId('import-upload-dialog')).toBeNull());
    expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(1);
    expect(requestsTo(`/imports/${importId}/start`, 'POST')).toHaveLength(0);
  });

  it('opens the import when its reading started though the answer was lost', async () => {
    mockImportApi([], refusedStart('import_not_uploading'));
    const runtime = await uploadFrom('/clients', [new File(['%PDF'], 'a.pdf')]);

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/import/${importId}`)
    );
    expect(requestsTo(`/imports/${importId}/start`, 'POST')).toHaveLength(1);
  });

  it('says nothing arrived when the import has no file to read, and abandons it on leaving', async () => {
    mockImportApi([], refusedStart('import_empty'));
    await uploadFrom('/clients', [new File(['%PDF'], 'a.pdf')]);

    expect((await screen.findByTestId('import-upload-empty')).textContent).toContain(
      'Niciun fișier nu a ajuns la noi'
    );
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).toBeNull();
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('import-upload-dialog')).toBeNull());
    expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(1);
  });
});

describe('while the files go up', () => {
  it('keeps a file dropped on the dialog from replacing the app', async () => {
    mockImportApi();
    vi.mocked(uploadImportObject).mockImplementation(() => new Promise(() => undefined));
    await uploadFrom('/clients', [new File(['%PDF'], 'a.pdf')]);
    await screen.findByTestId('import-upload-progress');

    const dropped = fireEvent.drop(screen.getByTestId('import-upload-dialog'), {
      dataTransfer: { types: ['Files'], files: [] },
    });
    expect(dropped).toBe(false);
  });

  it('asks before leaving, and abandons the import when the member leaves', async () => {
    mockImportApi();
    vi.mocked(uploadImportObject).mockImplementation(() => new Promise(() => undefined));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const runtime = await uploadFrom('/clients', [new File(['%PDF'], 'a.pdf')]);
    await screen.findByTestId('import-upload-progress');

    void runtime.router.navigate({ to: '/clients/$clientId/details', params: { clientId } });
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        'Fișierele încă se încarcă. Dacă pleci acum, renunți la import. Pleci?'
      )
    );
    expect(runtime.router.state.location.pathname).toBe('/clients');
    expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(0);

    confirm.mockReturnValue(true);
    void runtime.router.navigate({ to: '/clients/$clientId/details', params: { clientId } });
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${clientId}/details`)
    );
    expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(1);
    confirm.mockRestore();
  });
});

describe('completing a client from its documentation', () => {
  it("starts from the client's page and names the client and its CUI", async () => {
    mockImportApi();
    mountApp(authFixture(makeSession()).client, `/clients/${clientId}/details`);

    await userEvent.click(await screen.findByTestId('client-import'));
    const dialog = await screen.findByTestId('import-upload-dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Completează din documentație' })
    ).toBeTruthy();
    expect(within(dialog).getByTestId('import-upload-one-client').textContent).toContain(
      'Documentele trebuie să fie ale firmei Brutăria Spicul Auriu SRL (CUI RO31458207).'
    );
    choose([new File(['%PDF'], 'a.pdf')]);
    await screen.findByTestId('import-chosen');
    await userEvent.click(screen.getByTestId('import-upload-submit'));
    await waitFor(() => expect(requestsTo('/imports', 'POST')).toHaveLength(1));
    expect(bodyOf('/imports', 'POST')).toEqual({ clientId });
  });
});

describe('the imports on the client list', () => {
  it('lists an import in progress and one ready, with what waits for the member', async () => {
    const ready = importDetail({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'ready',
      readyAt: '2026-10-28T09:20:00+00:00',
      files: [importFile(), importFile(), importFile({ state: 'set_aside' })],
      blockers: [
        { path: 'client.legalRepresentativeName', code: 'choice' },
        { path: 'fireSafety.wasteContractor', code: 'choice' },
        { path: 'employees.0.hiredAt', code: 'missing' },
      ],
    });
    const running = importDetail({
      status: 'preparing',
      companyName: null,
      files: [
        importFile({ state: 'prepared' }),
        importFile({ state: 'uploaded' }),
        importFile({ state: 'uploaded' }),
      ],
    });
    mockApi((init, url) => {
      if (url.pathname === '/clients') {
        return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
      }
      if (url.pathname === '/imports') {
        return Response.json({ items: [summaryOf(ready), summaryOf(running)] });
      }
      if (url.pathname === `/imports/${ready.id}`) return Response.json({ import: ready });
      if (url.pathname === `/imports/${importId}`) return Response.json({ import: running });
      return undefined;
    });
    mountApp(authFixture(makeSession()).client, '/clients');

    const rows = await screen.findAllByTestId('import-list-row');
    expect(rows.map((row) => row.dataset.status)).toEqual(['ready', 'preparing']);
    await waitFor(() =>
      expect(rows[0]!.textContent).toContain(
        'Propunere gata de verificat. 2 fișiere citite, 2 alegeri și o dată obligatorie te așteaptă.'
      )
    );
    expect(within(rows[0]!).getByRole('link', { name: 'Verifică propunerea' })).toBeTruthy();
    await waitFor(() => expect(rows[1]!.textContent).toContain('dosar-ssm.zip'));
    expect(rows[1]!.textContent).toContain('Pas 1 din 4: 1 din 3 fișiere pregătite');
  });
});
