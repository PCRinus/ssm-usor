import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportDetail } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, employeeDetail, importId } from '@/test/employee-import-fixture';
import { fetchMock, mockApi } from '@/test/import-fixture';
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
  currentEmployeeCount: 3,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

function mount(detail: ImportDetail, path = '') {
  mockApi((_init, url) => {
    if (url.pathname === `/imports/${importId}`) return Response.json({ import: detail });
    if (url.pathname === `/imports/${importId}/source`) {
      const file = url.searchParams.get('file')!;
      return Response.json({
        fileId: file,
        uploadPath: file,
        fileName: file,
        page: null,
        original: { url: `https://storage.test/${file}` },
        derived: { url: `https://storage.test/derived/${file}` },
        text: null,
        pages: null,
        match: null,
        expiresInSeconds: 300,
      });
    }
    if (url.pathname === `/clients/${clientId}`) {
      return Response.json({ client, canDelete: false });
    }
    if (url.pathname.startsWith(`/clients/${clientId}/`)) return Response.json({ items: [] });
    return undefined;
  });
  mountApp(
    authFixture(makeSession()).client,
    `/clients/${clientId}/employees/import/${importId}${path}`
  );
}

const heading = async () =>
  (await screen.findByTestId('employee-processing', {}, { timeout: 3000 })).querySelector('h1')
    ?.textContent;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the page of an employee import that is not ready', () => {
  it('says the upload did not finish once its time runs out, on a page left open', async () => {
    // The clock still moves with real time, so the page loads as usual; only the stall is jumped to.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount(
        employeeDetail({
          status: 'uploading',
          employees: null,
          people: null,
          startedAt: null,
          createdAt: new Date(Date.now() - 15 * 60_000 + 60_000).toISOString(),
        })
      );
      expect(await heading()).toBe('Se încarcă fotografiile');
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(async () => expect(await heading()).toBe('Încărcarea nu s-a terminat'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens an uploaded photograph large, with how far its reading got', async () => {
    const detail = employeeDetail({ status: 'reading', employees: null, people: null });
    mount({
      ...detail,
      files: detail.files.map((file, index) =>
        index === 0 ? file : { ...file, state: 'prepared' }
      ),
    });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: 'Deschide IMG_p2.jpg' }));
    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_p2.jpg');
    expect(preview.textContent).toContain('Urmează');
    expect(within(preview).getByTestId('photo-preview-position').textContent).toBe('2 din 5');
    expect((await within(preview).findByTestId<HTMLImageElement>('photo-preview-image')).src).toBe(
      'https://storage.test/derived/IMG_p2.jpg'
    );
    expect(within(preview).queryByTestId('photo-preview-remove')).toBeNull();

    await userEvent.click(within(preview).getByTestId('photo-preview-previous'));
    expect(within(preview).getByRole('heading').textContent).toBe('IMG_p1.jpg');
    expect(preview.textContent).toContain('Citită');
  });

  it('says the credits were given back after a failure on our side', async () => {
    mount(
      employeeDetail({
        status: 'failed',
        failedAt: '2026-10-31T10:00:00+00:00',
        failureReason: 'Serviciul care citește documentele nu a răspuns.',
        credits: { used: 0, atStart: 5, scannedPages: 0, refunded: true },
      })
    );
    expect((await screen.findByTestId('employee-processing-failed')).textContent).toBe(
      'Serviciul care citește documentele nu a răspuns. Creditele ți-au fost returnate. Renunță la import și încearcă din nou.'
    );
  });

  it('calls a confirmed import confirmed', async () => {
    mount(employeeDetail({ status: 'confirmed', confirmedAt: '2026-10-31T10:00:00+00:00' }));
    expect(await heading()).toBe('Import confirmat');
    expect(screen.getByTestId('employee-processing').textContent).toContain(
      '5 fotografii ale fișelor individuale de instruire'
    );
  });

  it('counts files, not photos, when a PDF is among them', async () => {
    const detail = employeeDetail({
      status: 'confirmed',
      confirmedAt: '2026-10-31T10:00:00+00:00',
    });
    mount({
      ...detail,
      files: detail.files.map((file, index) =>
        index === 0 ? { ...file, mimeType: 'application/pdf' } : file
      ),
    });
    await heading();
    const page = screen.getByTestId('employee-processing').textContent;
    expect(page).toContain('5 fișiere ale fișelor individuale de instruire');
    expect(page).toContain('5 fișiere, toate se pot deschide');
  });

  it("is not found under another client's page, or for a client import", async () => {
    mount(
      employeeDetail({ client: { id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', legalName: 'X' } })
    );
    expect((await screen.findByTestId('employee-import-not-found')).textContent).toContain(
      'Importul nu a fost găsit'
    );
    disposeRuntimes();

    mount(employeeDetail({ kind: 'client' }), '/f0000000-0000-4000-8000-000000000001');
    expect(await screen.findByTestId('employee-import-not-found')).toBeTruthy();
  });
});
