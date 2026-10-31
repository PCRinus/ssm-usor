import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, importId, positions, workplaces } from '@/test/employee-import-fixture';
import { fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
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

async function openDialog(button: 'employees-import' | 'employees-import-found') {
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/employees`);
  await userEvent.click(await screen.findByTestId(button));
  return screen.findByTestId('employee-upload-dialog');
}

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
    await within(dialog).findByTestId('employee-upload-chosen');
    expect(within(dialog).getByTestId('employee-upload-limits').textContent).toContain(
      'cam 1 MB din 1 GB'
    );
    await userEvent.click(within(dialog).getByTestId('employee-upload-submit'));
    expect((await within(dialog).findByTestId('import-upload-error')).textContent).toBe(
      'Fotografia „IMG_4001.jpg” are peste 25 MB și nu am putut-o micșora. Salveaz-o mai mică sau fotografiaz-o din nou, apoi alege fotografiile din nou.'
    );
    expect(requestsTo('/imports', 'POST')).toEqual([]);
  });
});
