import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
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
  createdAt: '2026-09-19T10:00:00+00:00',
  ...overrides,
});

const firstAidId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const firstAid = {
  id: firstAidId,
  clientId,
  typeKey: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  decisionNumber: 5,
  draft: revision() as ReturnType<typeof revision> | null,
  issued: null as ReturnType<typeof revision> | null,
};
const report = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  typeKey: 'control_report',
  title: 'Referat de control',
  decisionNumber: null,
  draft: revision({ id: '1b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d' }),
  issued: null,
};

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  role = 'owner',
  items = [] as unknown[],
  lastGeneration = null as { issueDate: string; firstDecisionNumber: number } | null,
  readiness = { ready: true, missing: [] as string[] },
  generate = (() =>
    Response.json({ created: [firstAid, report], skipped: [] }, { status: 201 })) as Route,
  action = (() => Response.json({ document: firstAid })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role,
        },
      });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/documents`) {
      return Response.json({ items, lastGeneration });
    }
    if (pathname === `/clients/${clientId}/documents/readiness`) return Response.json(readiness);
    if (pathname === `/clients/${clientId}/documents/generate`) return generate(init);
    if (pathname.endsWith('/download')) {
      return Response.json({
        url: 'https://files.example.test/signed',
        fileName: 'Decizia privind responsabilii cu primul ajutor - rev. 1.docx',
        expiresInSeconds: 60,
      });
    }
    if (pathname === '/signed') return new Response(new Uint8Array([80, 75, 3, 4]));
    if (pathname.startsWith(`/documents/${firstAidId}/`)) {
      return method === 'DELETE' ? new Response(null, { status: 204 }) : action(init);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (suffix: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname.endsWith(suffix) && (init?.method ?? 'GET') === method
  );

const mount = () => mountApp(authFixture(makeSession()).client, `/clients/${clientId}/documents`);

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  const row = (await screen.findAllByTestId('document-row')).find((item) =>
    item.textContent?.includes(title)
  )!;
  await user.click(within(row).getByTestId('document-actions'));
  return row;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('client documents', () => {
  it('is a section of the client, after the data the documents print', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('documents-page')).toBeTruthy();
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).toEqual(['Angajați', 'Date pentru documente', 'Documente']);
    expect(await screen.findByTestId('documents-empty')).toBeTruthy();
    expect(screen.getByTestId('documents-generate').textContent).toContain(
      'Generează documentația'
    );
  });

  it('says what is missing and where it is filled in, instead of the form', async () => {
    mockApi({
      role: 'specialist',
      readiness: {
        ready: false,
        missing: ['provider.legalName', 'specialist.professionalTitle', 'responsible.first_aid'],
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    const places = await screen.findAllByTestId('generate-missing-place');
    expect(places.map((place) => place.textContent)).toEqual([
      'Datele organizației: denumirea legală.Le completează proprietarul organizației.',
      'Profilul tău: titlul profesional.',
      'Datele pentru documente ale clientului: o persoană pentru „Prim ajutor”.',
    ]);
    expect(within(places[2]!).getByRole('link').getAttribute('href')).toBe(
      `/clients/${clientId}/document-data`
    );
    expect(screen.queryByTestId('generate-submit')).toBeNull();
  });

  it('does not tell an owner to ask the owner', async () => {
    mockApi({ readiness: { ready: false, missing: ['provider.legalName'] } });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    const [place] = await screen.findAllByTestId('generate-missing-place');
    expect(place!.textContent).toBe('Datele organizației: denumirea legală.');
  });

  it('generates with the date and the first number of the last generation', async () => {
    mockApi({
      items: [report],
      lastGeneration: { issueDate: '2026-01-19', firstDecisionNumber: 3 },
    });
    mount();
    const user = userEvent.setup();

    const open = await screen.findByTestId('documents-generate');
    expect(open.textContent).toContain('Generează documentele lipsă');
    await user.click(open);
    expect((await screen.findByTestId<HTMLInputElement>('generate-issue-date')).value).toBe(
      '19.01.2026'
    );
    expect(screen.getByTestId<HTMLInputElement>('generate-first-number').value).toBe('3');
    await user.click(screen.getByTestId('generate-submit'));

    expect(await screen.findByText('Au fost generate 2 documente.')).toBeTruthy();
    const [call] = requests('/documents/generate', 'POST');
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      issueDate: '2026-01-19',
      firstDecisionNumber: 3,
    });
    await waitFor(() => expect(screen.queryByTestId('generate-documents-dialog')).toBeNull());
  });

  it('refuses a first number that is not a number', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('documents-generate'));
    const number = await screen.findByTestId('generate-first-number');
    await user.clear(number);
    await user.type(number, 'trei');
    await user.click(screen.getByTestId('generate-submit'));

    expect((await screen.findByTestId('generate-first-number-error')).textContent).toContain(
      'între 1 și 9996'
    );
    expect(requests('/documents/generate', 'POST')).toHaveLength(0);
  });

  it('lists documents with their state, number and date', async () => {
    mockApi({
      items: [
        {
          ...firstAid,
          issued: revision({ status: 'issued', issuedAt: '2026-09-19T11:00:00+00:00' }),
          draft: revision({ revision: 2, dataChanged: true }),
        },
        report,
      ],
    });
    mount();

    const [decision, form] = await screen.findAllByTestId('document-row');
    expect(decision!.textContent).toContain('Decizia nr. 5 SSM');
    expect(within(decision!).getByTestId('document-issued').textContent).toBe('Emis · rev. 1');
    expect(within(decision!).getByTestId('document-draft').textContent).toBe('Ciornă · rev. 2');
    expect(within(decision!).getByTestId('document-data-changed')).toBeTruthy();
    expect(decision!.textContent).toContain('19.01.2026');
    expect(within(form!).queryByTestId('document-data-changed')).toBeNull();
  });

  it('links every document to the editor and marks a draft edited by hand', async () => {
    mockApi({
      items: [{ ...firstAid, draft: revision({ editedAt: '2026-09-19T12:00:00+00:00' }) }, report],
    });
    mount();
    const user = userEvent.setup();

    const [decision, form] = await screen.findAllByTestId('document-row');
    expect(within(decision!).getByTestId('document-title').getAttribute('href')).toBe(
      `/clients/${clientId}/documents/${firstAidId}`
    );
    expect(within(decision!).getByTestId('document-edited').textContent).toBe('Modificat');
    expect(within(form!).queryByTestId('document-edited')).toBeNull();

    // Generating it again says exactly what would be lost.
    await openMenu(user, 'primul ajutor');
    expect((await screen.findByTestId('document-open')).textContent).toBe('Deschide și modifică');
    await user.click(screen.getByTestId('document-regenerate'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'modificările tale se pierd'
    );
  });

  it('downloads a draft under the name of the document', async () => {
    mockApi({ items: [firstAid] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    );
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-download-draft'));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('Decizia privind responsabilii cu primul ajutor - rev. 1.docx');
    expect(requests(`/revisions/${firstAid.draft!.id}/download`, 'GET')).toHaveLength(1);
  });

  it('issues a draft after a confirmation that says it becomes final', async () => {
    mockApi({ items: [firstAid] });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-issue'));
    const dialog = await screen.findByTestId('document-confirm-dialog');
    expect(dialog.textContent).toContain('Un document emis nu se mai modifică');
    await user.click(screen.getByTestId('document-confirm'));

    expect(await screen.findByText(/a fost emis\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/issue`, 'POST')).toHaveLength(1);
  });

  it('warns that regenerating a draft loses hand edits, and deletes a draft', async () => {
    mockApi({ items: [firstAid] });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-regenerate'));
    expect((await screen.findByTestId('document-confirm-dialog')).textContent).toContain(
      'Modificările făcute de mână în fișier se pierd'
    );
    await user.click(screen.getByTestId('document-confirm'));
    expect(await screen.findByText(/a fost generat din nou\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/regenerate`, 'POST')).toHaveLength(1);

    await waitFor(() => expect(screen.queryByTestId('document-confirm-dialog')).toBeNull());
    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-delete-draft'));
    await user.click(await screen.findByTestId('document-confirm'));
    expect(await screen.findByText(/Ciorna pentru .* a fost ștearsă\./)).toBeTruthy();
    expect(requests(`/documents/${firstAidId}/draft`, 'DELETE')).toHaveLength(1);
  });

  it('points to the generation form when regenerating is refused for missing data', async () => {
    mockApi({
      items: [firstAid],
      action: () =>
        Response.json(
          { error: 'conflict', message: 'missing', reason: 'missing_document_data' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    await user.click(await screen.findByTestId('document-regenerate'));
    await user.click(await screen.findByTestId('document-confirm'));

    expect((await screen.findByTestId('documents-error')).textContent).toContain('Lipsesc date');
  });

  it('only offers downloads for an archived client', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      items: [firstAid],
    });
    mount();
    const user = userEvent.setup();

    await openMenu(user, 'primul ajutor');
    expect(await screen.findByTestId('document-download-draft')).toBeTruthy();
    expect(screen.queryByTestId('document-regenerate')).toBeNull();
    expect(screen.queryByTestId('document-issue')).toBeNull();
    expect(screen.queryByTestId('documents-generate')).toBeNull();
  });
});
