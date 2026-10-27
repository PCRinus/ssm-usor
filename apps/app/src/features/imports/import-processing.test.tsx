import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  bodyOf,
  fetchMock,
  importDetail,
  importFile,
  importId,
  mockApi,
  requestsTo,
  summaryOf,
} from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const splitId = '7a2f3e4d-5c6b-4d7e-8f90-a1b2c3d4e5f6';

const sheet = (name: string) =>
  importFile({
    fileName: name,
    uploadPath: name,
    mimeType: name.endsWith('.HEIC') ? 'image/heic' : 'image/jpeg',
    state: 'for_employees',
    documentKind: 'training_sheet',
    isScan: true,
    pageCount: null,
  });

const otherFiles = [
  importFile({ state: 'other_company', companyName: 'Patiseria Floare de Colț SRL' }),
  importFile({ state: 'other_company', companyName: 'Patiseria Floare de Colț SRL' }),
];

const setAside = importFile({
  fileName: 'Coperta dosar SSM.pdf',
  mimeType: 'application/pdf',
  state: 'set_aside',
  documentKind: 'cover',
  reason: 'Copertă, etichetă sau cuprins: nu conține date despre client.',
});

function readingDetail(overrides: Record<string, unknown> = {}) {
  return importDetail({
    files: [
      importFile({ fileName: 'Decizie 1 organizare SSM 2024.docx' }),
      importFile({
        fileName: 'Instructiuni proprii PSI brutarie.doc',
        documentKind: 'own_instructions',
      }),
      importFile({
        fileName: 'Decizie numire PSI 2021 scan.pdf',
        mimeType: 'application/pdf',
        isScan: true,
        pageCount: 1,
      }),
      importFile({
        fileName: 'Registru instructaj PSI 2022 scan.pdf',
        mimeType: 'application/pdf',
        isScan: true,
        state: 'prepared',
        pageCount: 6,
      }),
      importFile({
        fileName: 'Evaluare riscuri 2019.pdf',
        mimeType: 'application/pdf',
        state: 'failed',
        documentKind: null,
        reason: 'Fișierul este protejat cu parolă.',
      }),
      sheet('IMG_2041.jpg'),
      sheet('IMG_2042.HEIC'),
      setAside,
      ...otherFiles,
    ],
    otherCompanies: [
      {
        name: 'Patiseria Floare de Colț SRL',
        cui: '40118562',
        fileIds: otherFiles.map((file) => file.id),
      },
    ],
    ...overrides,
  });
}

function mockImport(detail: ReturnType<typeof importDetail>) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: detail });
    }
    if (url.pathname === `/imports/${importId}/source`) {
      return Response.json({
        fileId: 'x',
        uploadPath: url.searchParams.get('file'),
        fileName: 'x',
        page: null,
        original: { url: 'https://storage.example/original.jpg', mimeType: 'image/jpeg' },
        derived: null,
        text: null,
        pages: null,
        match: null,
        expiresInSeconds: 300,
      });
    }
    if (url.pathname === `/imports/${importId}/split`) {
      return Response.json(
        { import: summaryOf(importDetail({ id: splitId, status: 'preparing' })) },
        { status: 201 }
      );
    }
    if (url.pathname === `/imports/${importId}/abandon`) return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/read')) {
      return Response.json({ import: summaryOf(importDetail({ status: 'reading' })) });
    }
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === '/clients') {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    return undefined;
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, `/clients/import/${importId}`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the processing page', () => {
  it('reads the documents together and counts the scans one by one', async () => {
    mockImport(readingDetail());
    mount();

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Citim documentele'
    );
    await waitFor(() => expect(document.title).toContain('Import din documente'));
    expect(screen.getByTestId('import-upload-summary').textContent).toMatch(
      /^dosar-ssm\.zip și 2 fotografii, încărcate (azi|pe 28\.10\.2026) la \d\d:\d\d$/
    );
    expect(screen.getByTestId('import-can-leave').textContent).toContain('Poți închide pagina.');
    const steps = screen.getAllByTestId('import-step');
    expect(steps.map((step) => step.dataset.state)).toEqual(['done', 'done', 'current', 'next']);
    expect(steps[1]!.textContent).toContain(
      '4 de citit, 2 fișe de angajați, 1 deoparte, 2 ale altei firme'
    );
    expect(steps[3]!.textContent).toContain('CUI, CNP, ANAF și sursele');
    const now = screen.getByTestId('import-now');
    expect(now.textContent).toContain('Citim cele 2 documente împreună.');
    expect(now.textContent).toContain('Scanări: 1 din 2.');

    const documents = screen.getByTestId('import-group-documents');
    expect(documents.textContent).toContain('Toate în lucru, se termină împreună');
    expect(within(documents).getAllByTestId('import-file-row')[1]!.textContent).toContain(
      'Instrucțiuni proprii, 2 pagini'
    );
    const scans = within(screen.getByTestId('import-group-scans')).getAllByTestId(
      'import-file-row'
    );
    expect(scans.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Citit'),
      expect.stringContaining('Urmează'),
    ]);
    expect(screen.getByTestId('import-group-failed').textContent).toContain(
      'Fișierul este protejat cu parolă.'
    );
    expect(screen.getByTestId('import-group-set-aside').textContent).toContain('Copertă');
    expect(screen.queryByTestId('import-read-set-aside')).toBeNull();

    const employees = screen.getByTestId('import-group-employees');
    await waitFor(() =>
      expect(within(employees).getAllByTestId('import-thumbnail')).toHaveLength(1)
    );
    expect(within(employees).getAllByTestId('import-thumbnail-placeholder')).toHaveLength(1);
    expect(
      requestsTo(`/imports/${importId}/source`).map(([input]) =>
        new URL(String(input)).searchParams.get('file')
      )
    ).toEqual(['IMG_2041.jpg']);
  });

  it("warns about another company's documents and imports them separately", async () => {
    mockImport(readingDetail());
    mount();

    const warning = await screen.findByTestId('import-other-company');
    expect(warning.textContent).toContain('Am găsit documentele a două firme.');
    expect(warning.textContent).toContain(
      '8 fișiere sunt ale firmei Brutăria Spicul Auriu SRL și 2 ale firmei Patiseria Floare de Colț SRL.'
    );
    await userEvent.click(
      within(warning).getByRole('button', { name: 'Importă-le separat pe cele 2' })
    );

    await waitFor(() =>
      expect(bodyOf(`/imports/${importId}/split`, 'POST')).toEqual({
        fileIds: otherFiles.map((file) => file.id),
      })
    );
    expect(
      await within(warning).findByRole('button', { name: 'Import separat pornit' })
    ).toBeTruthy();
  });

  it('stops the import after asking, and goes back to the client list', async () => {
    mockImport(readingDetail());
    const runtime = mount();

    await userEvent.click(await screen.findByTestId('import-abandon'));
    const dialog = await screen.findByTestId('import-abandon-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Oprești importul?');
    await userEvent.click(within(dialog).getByTestId('import-abandon-confirm'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/clients'));
    expect(requestsTo(`/imports/${importId}/abandon`, 'POST')).toHaveLength(1);
  });

  it('shows where a failed import stopped and why', async () => {
    mockImport(
      readingDetail({
        status: 'failed',
        failedAt: '2026-10-28T09:05:00+00:00',
        failureReason: 'Serviciul care citește documentele nu a răspuns.',
      })
    );
    mount();

    expect((await screen.findByTestId('import-failed')).textContent).toContain(
      'Serviciul care citește documentele nu a răspuns.'
    );
    expect(screen.getAllByTestId('import-step').map((step) => step.dataset.state)).toEqual([
      'done',
      'done',
      'failed',
      'next',
    ]);
    expect(screen.getByTestId('import-abandon').textContent).toBe('Renunță la import');
  });

  it('sends a file set aside back to be read once the proposal is ready, after a warning', async () => {
    mockImport(
      readingDetail({
        status: 'ready',
        readyAt: '2026-10-28T09:20:00+00:00',
        version: 2,
        changes: { fields: { 'client.contactPhone': { value: '0745 218 903' } }, items: {} },
      })
    );
    mount();

    await userEvent.click(await screen.findByTestId('import-read-set-aside'));
    const dialog = await screen.findByTestId('import-read-set-aside-dialog');
    expect(dialog.textContent).toContain('Ce ai schimbat în propunerea de acum se pierde.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Citește din nou' }));

    await waitFor(() =>
      expect(requestsTo(`/imports/${importId}/files/${setAside.id}/read`, 'POST')).toHaveLength(1)
    );
  });
});
