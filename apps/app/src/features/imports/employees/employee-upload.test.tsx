import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, importId, positions, workplaces } from '@/test/employee-import-fixture';
import { bodyOf, fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

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
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const sheet = (index: number) => ({
  id: `a0000000-0000-4000-8000-00000000010${index}`,
  clientFileId: `a0000000-0000-4000-8000-00000000020${index}`,
  uploadPath: `fise-spicul-auriu.zip/IMG_${index}.HEIC`,
  fileName: `IMG_${index}.HEIC`,
  mimeType: 'image/heic',
  sizeBytes: 2_000_000,
});

const foundOf = (indexes: number[]) => ({
  items: [
    {
      importId: 'a0000000-0000-4000-8000-000000000001',
      confirmedAt: '2026-10-27T09:00:00+00:00',
      sheets: indexes.map(sheet),
    },
  ],
  total: indexes.length,
});

const uploading = {
  id: importId,
  kind: 'employees',
  status: 'uploading',
  client: { id: clientId, legalName: client.legalName },
  intoExistingClient: true,
  companyName: null,
  companyCui: null,
  sourceImportId: null,
  failureReason: null,
  fileCount: 0,
  createdBy: null,
  createdAt: '2026-10-31T10:00:00+00:00',
  startedAt: null,
  readyAt: null,
  failedAt: null,
  confirmedAt: null,
};

type Answer = () => Response | Promise<Response>;

function mockUpload({
  found = () => foundOf([1, 2]),
  jobPositions = positions,
  create = () => Response.json({ import: uploading }, { status: 201 }),
  addFound = () => Response.json({ files: [] }, { status: 201 }),
  abandon = () => Response.json({ import: { ...uploading, status: 'abandoned' } }),
}: {
  found?: () => ReturnType<typeof foundOf>;
  jobPositions?: unknown[];
  create?: Answer;
  addFound?: Answer;
  abandon?: Answer;
} = {}) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/imports' && method === 'POST') return create();
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === `/imports/${importId}/found-sheets`) return addFound();
    if (url.pathname === `/imports/${importId}/abandon`) return abandon();
    if (url.pathname === `/clients/${clientId}`) {
      return Response.json({ client, canDelete: false });
    }
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: jobPositions });
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({ items: workplaces });
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) return Response.json(found());
    if (url.pathname.startsWith(`/clients/${clientId}/files/`)) {
      return Response.json({}, { status: 404 });
    }
    if (url.pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    return undefined;
  });
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
}

async function openDialog(button: 'employees-import' | 'employees-import-found') {
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/employees`);
  await userEvent.click(await screen.findByTestId(button));
  return screen.findByTestId('employee-upload-dialog');
}

const refused = (reason: string, status = 422) =>
  Response.json({ error: 'refused', message: reason, reason }, { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('photographs over the caps until they are shrunk', () => {
  it('takes a 30 MB photograph, and refuses it before uploading when it cannot be shrunk', async () => {
    mockUpload({ found: () => foundOf([]) });
    const dialog = await openDialog('employees-import');
    fireEvent.change(within(dialog).getByTestId('employee-upload-files-input'), {
      target: {
        files: [
          new File([new Uint8Array(30 * 1024 * 1024)], 'IMG_4001.jpg', { type: 'image/jpeg' }),
        ],
      },
    });
    expect((await within(dialog).findByTestId('employee-upload-chosen')).textContent).toContain(
      'cam 1 MB'
    );
    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    expect((await within(dialog).findByTestId('import-upload-error')).textContent).toBe(
      'Fotografia „IMG_4001.jpg” are peste 25 MB și nu am putut-o micșora. Salveaz-o mai mică sau fotografiaz-o din nou, apoi alege fotografiile din nou.'
    );
    expect(requestsTo('/imports', 'POST')).toEqual([]);
  });
});

describe('how much fits in one import', () => {
  it('leaves the caps out while the selection is far below them', async () => {
    mockUpload();
    const dialog = await openDialog('employees-import-found');
    await within(dialog).findByTestId('employee-upload-chosen');
    expect(within(dialog).queryByTestId('employee-upload-limits')).toBeNull();
    expect(
      within(dialog).getByRole('link', { name: 'Află mai mult' }).getAttribute('data-help-topic')
    ).toBe('import.angajati');
  });

  it('shows how much of each cap is used once the selection nears one', async () => {
    mockUpload({
      found: () => {
        const found = foundOf([1]);
        found.items[0]!.sheets[0]!.sizeBytes = 900 * 1024 ** 2;
        return found;
      },
    });
    const dialog = await openDialog('employees-import-found');
    const meters = await within(dialog).findByTestId('employee-upload-limits');
    expect(meters.textContent).toContain('1 din 500 de fotografii și pagini');
    expect(meters.textContent).toContain('din 1 GB');
    expect(
      within(dialog)
        .getByRole('link', { name: 'Ajutor: cât intră într-un import' })
        .getAttribute('data-help-topic')
    ).toBe('import.limite');
  });
});

describe('an upload that fails after the import was created', () => {
  it('lets the import go before saying so, so a retry can take the same sheets', async () => {
    const abandoning = deferred();
    let attempt = 0;
    mockUpload({
      addFound: () => {
        attempt += 1;
        return attempt === 1
          ? Response.json({}, { status: 500 })
          : Response.json({ files: [] }, { status: 201 });
      },
      abandon: () => abandoning.promise,
    });
    const dialog = await openDialog('employees-import-found');
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        '2 fotografii de citit'
      )
    );
    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    await waitFor(() => expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(1));
    expect(within(dialog).queryByTestId('import-upload-error')).toBeNull();
    expect(within(dialog).getByTestId('employee-upload-submit')).toHaveProperty('disabled', true);

    abandoning.resolve(Response.json({ import: { ...uploading, status: 'abandoned' } }));
    await within(dialog).findByTestId('import-upload-error');
    expect(within(dialog).getByTestId('employee-upload-submit')).toHaveProperty('disabled', false);
  });

  it('drops the sheets another import took meanwhile and sends only the rest', async () => {
    let taken = false;
    mockUpload({
      found: () => foundOf(taken ? [2] : [1, 2]),
      addFound: () => {
        if (taken) return Response.json({ files: [] }, { status: 201 });
        taken = true;
        return refused('import_no_found_sheets');
      },
    });
    const dialog = await openDialog('employees-import-found');
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        '2 fotografii de citit'
      )
    );
    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    await within(dialog).findByTestId('import-upload-error');
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        'O fotografie de citit'
      )
    );

    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/found-sheets`, 'POST')).toHaveLength(2)
    );
    expect(bodyOf(`/imports/${importId}/found-sheets`, 'POST', 1)).toEqual({
      fileIds: [sheet(2).id],
    });
  });
});

describe('a client without job positions', () => {
  it('hides the way to the documentation import while the photographs upload', async () => {
    const creating = deferred();
    mockUpload({ jobPositions: [], create: () => creating.promise });
    const dialog = await openDialog('employees-import-found');
    expect(await within(dialog).findByTestId('employee-upload-no-posts')).toBeTruthy();
    await waitFor(() =>
      expect(within(dialog).getByTestId('employee-upload-chosen').textContent).toContain(
        '2 fotografii de citit'
      )
    );
    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    await waitFor(() => expect(requestsTo('/imports', 'POST')).toHaveLength(1));
    expect(within(dialog).queryByTestId('employee-upload-no-posts')).toBeNull();
    creating.resolve(refused('import_unavailable', 503));
    await within(dialog).findByTestId('import-upload-error');
  });
});

describe('the chosen photographs', () => {
  const photo = (name: string, type = 'image/jpeg') =>
    new File([new Uint8Array(2000)], name, { type });

  async function choose(files: File[]) {
    mockUpload({ found: () => foundOf([]) });
    const dialog = await openDialog('employees-import');
    fireEvent.change(within(dialog).getByTestId('employee-upload-files-input'), {
      target: { files },
    });
    await within(dialog).findByTestId('employee-upload-chosen');
    return dialog;
  }

  const chosenTitle = (dialog: HTMLElement) =>
    within(dialog).queryByTestId('employee-upload-chosen')?.querySelector('#employee-upload-chosen')
      ?.textContent;

  it('opens a photograph large, steps through them, and lets its object URL go', async () => {
    let made = 0;
    const revoked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:photo-${(made += 1)}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
    const dialog = await choose([
      photo('WhatsApp Image 2026-10-30 at 09.12.01.jpeg'),
      photo('IMG_2.jpg'),
      photo('IMG_3.HEIC', 'image/heic'),
    ]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Deschide IMG_2.jpg' }));
    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_2.jpg');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 3');
    const shown = within(preview).getByTestId<HTMLImageElement>('photo-preview-image').src;
    expect(shown).toMatch(/^blob:photo-/);

    await userEvent.click(within(preview).getByTestId('photo-preview-next'));
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_3.HEIC');
    expect(within(preview).getByTestId('photo-preview-next')).toHaveProperty('disabled', true);
    expect(revoked).toContain(shown);
    fireEvent.error(within(preview).getByTestId('photo-preview-image'));
    expect(within(preview).getByTestId('photo-preview-note').textContent).toContain('HEIC');

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(preview).getByRole('heading').textContent).toBe(
      'WhatsApp Image 2026-10-30 at 09.12.01.jpeg'
    );
    expect(within(preview).getByTestId('photo-preview-previous')).toHaveProperty('disabled', true);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    expect(screen.getByTestId('employee-upload-dialog')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('takes one out from its corner or from the preview, and counts again', async () => {
    const dialog = await choose([photo('IMG_1.jpg'), photo('IMG_2.jpg'), photo('IMG_3.jpg')]);
    expect(chosenTitle(dialog)).toBe('3 fotografii de citit');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Scoate IMG_1.jpg' }));
    expect(chosenTitle(dialog)).toBe('2 fotografii de citit');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Deschide IMG_2.jpg' }));
    const preview = await screen.findByTestId('photo-preview');
    await userEvent.click(within(preview).getByTestId('photo-preview-remove'));
    expect(chosenTitle(dialog)).toBe('O fotografie de citit');
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_3.jpg');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('1 din 1');

    await userEvent.click(within(preview).getByTestId('photo-preview-remove'));
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).toBeNull());
    expect(within(dialog).queryByTestId('employee-upload-chosen')).toBeNull();
  });

  it('gives a sheet from the documentation back to the offer it came from', async () => {
    mockUpload();
    const dialog = await openDialog('employees-import-found');
    await waitFor(() => expect(chosenTitle(dialog)).toBe('2 fotografii de citit'));
    expect(within(dialog).queryByTestId('employee-upload-found')).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Scoate IMG_1.HEIC' }));
    expect(chosenTitle(dialog)).toBe('O fotografie de citit');
    expect(within(dialog).getByTestId('employee-upload-found').textContent).toContain(
      'o fotografie'
    );
  });
});
