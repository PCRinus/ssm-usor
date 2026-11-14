import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetEarlierInstructionsQueryKey } from '@/api/generated/api';
import { invalidateTrainings } from '@/features/trainings/training-queries';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { bodyOf, fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { askedOnClientPage, namesOf } from './earlier-instructions';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const revisionId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const earlierPath = `/clients/${clientId}/earlier-instructions`;
const filesPath = `/clients/${clientId}/files`;

const client = {
  id: clientId,
  legalName: 'TERMOCONSTRUCT VEST S.R.L.',
  cui: '38417265',
  vatPayer: true,
  caenCode: '4120',
  tradeRegisterNumber: null,
  countyCode: 'TM',
  locality: 'Timișoara',
  addressLine: null,
  legalRepresentativeName: null,
  declaredEmployeeCount: 0,
  currentEmployeeCount: 7,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const domain = (name: 'ssm' | 'su', overrides: Record<string, unknown> = {}) => ({
  domain: name,
  paperTrainingCount: 3,
  state: 'missing',
  imported: null,
  files: [],
  unavailable: null,
  ...overrides,
});

const proposal = {
  revisionId,
  domain: 'ssm',
  documentTitle: 'Instrucțiuni proprii de securitate și sănătate în muncă',
  revision: 2,
  firstIssue: false,
  documentDate: '2026-11-12',
  issuedAt: '2026-11-12T09:00:00+00:00',
  posts: [
    {
      jobPositionId: 'd0000000-0000-4000-8000-000000000001',
      name: 'Zidar',
      workerCount: 4,
      recordedOn: null,
    },
  ],
};

const file = (id: string, name: string, earlierInstructions: unknown) => ({
  id,
  name,
  note: null,
  ownersOnly: false,
  employee: null,
  originalFileName: `${name}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1_887_436,
  sha256: 'a'.repeat(64),
  uploadedBy: { id: 'user-one', fullName: 'Andreea Ionescu' },
  canChange: true,
  importId: null,
  importPath: null,
  importKind: null,
  importRead: null,
  importReason: null,
  earlierInstructions,
  createdAt: '2026-11-12T10:00:00+00:00',
  updatedAt: '2026-11-12T10:00:00+00:00',
  link: {
    url: 'http://127.0.0.1:54321/storage/v1/object/sign/client-files/x.pdf?token=t',
    fileName: `${name}.pdf`,
    disposition: 'inline',
    expiresInSeconds: 600,
  },
});

type Extra = (init: RequestInit | undefined, url: URL) => Response | undefined;

function mockClient(
  domains: () => unknown[],
  extra: Extra = () => undefined,
  proposals: unknown[] = []
) {
  mockApi((init, url) => {
    const custom = extra(init, url);
    if (custom) return custom;
    const method = init?.method ?? 'GET';
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client, canDelete: false });
    if (url.pathname === earlierPath && method === 'GET') {
      return Response.json({ domains: domains() });
    }
    if (url.pathname === `/clients/${clientId}/supplementary-training-proposals`) {
      return Response.json({ items: proposals });
    }
    if (method === 'GET' && url.pathname.startsWith(`/clients/${clientId}`)) {
      return Response.json({ items: [] });
    }
    if (url.pathname === '/imports') return Response.json({ items: [] });
    return undefined;
  });
}

const mount = (tab: string) =>
  mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/${tab}`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('which earlier own instructions the client page asks for', () => {
  it('asks for a domain with paper trainings and no copy, no import and no answer', () => {
    const asked = askedOnClientPage([
      domain('ssm'),
      domain('su', { paperTrainingCount: 0 }),
    ] as Parameters<typeof askedOnClientPage>[0]);
    expect(asked.map((each) => each.domain)).toEqual(['ssm']);
    for (const state of ['imported', 'added', 'unavailable']) {
      expect(
        askedOnClientPage([domain('ssm', { state })] as Parameters<typeof askedOnClientPage>[0])
      ).toEqual([]);
    }
    expect(namesOf(['ssm', 'su'])).toBe('IPSSM și IPSU');
    expect(namesOf(['su'])).toBe('IPSU');
  });
});

describe('the notice on Instruiri ținute', () => {
  it('names the missing domains, cites no law, and sits below the supplementary training notice', async () => {
    mockClient(() => [domain('ssm'), domain('su')], undefined, [proposal]);
    mount('instruiri-tinute');
    const notice = await screen.findByTestId('earlier-instructions-notice');
    expect(within(notice).getByText('Instrucțiunile proprii anterioare, opțional')).toBeTruthy();
    expect(notice.textContent).toContain('Nu e o obligație legală.');
    expect(notice.textContent).toContain('(IPSSM și IPSU)');
    expect(notice.textContent).not.toMatch(/HG|OMAI|Legea|art\. \d/);
    const supplementary = await screen.findByTestId('training-proposal');
    expect(
      supplementary.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('answers the one missing domain with Nu le am, and then goes', async () => {
    let answered = false;
    mockClient(
      () => [
        domain('ssm', { state: 'added' }),
        domain('su', answered ? { state: 'unavailable' } : {}),
      ],
      (init, url) => {
        if (url.pathname !== `${earlierPath}/su/unavailable` || init?.method !== 'PUT') {
          return undefined;
        }
        answered = true;
        return new Response(null, { status: 204 });
      }
    );
    mount('instruiri-tinute');
    const user = userEvent.setup();
    const notice = await screen.findByTestId('earlier-instructions-notice');
    expect(notice.textContent).toContain('(IPSU)');
    await user.click(within(notice).getByTestId('earlier-instructions-none'));
    await waitFor(() => expect(screen.queryByTestId('earlier-instructions-notice')).toBeNull());
    expect(requestsTo(`${earlierPath}/su/unavailable`, 'PUT')).toHaveLength(1);
    expect(requestsTo(`${earlierPath}/ssm/unavailable`, 'PUT')).toHaveLength(0);
  });

  it('offers each missing domain on its own when both are missing', async () => {
    mockClient(
      () => [domain('ssm'), domain('su')],
      (init, url) =>
        url.pathname === `${earlierPath}/ssm/unavailable` && init?.method === 'PUT'
          ? new Response(null, { status: 204 })
          : undefined
    );
    mount('instruiri-tinute');
    const user = userEvent.setup();
    const notice = await screen.findByTestId('earlier-instructions-notice');
    await user.click(within(notice).getByTestId('earlier-instructions-none'));
    const choices = await screen.findAllByTestId('earlier-instructions-none-domain');
    expect(choices.map((choice) => choice.textContent)).toEqual(['Nu am IPSSM', 'Nu am IPSU']);
    expect(screen.getByTestId('earlier-instructions-none-all').textContent).toBe(
      'Nu le am pe niciunele'
    );
    await user.click(choices[0]!);
    await waitFor(() =>
      expect(requestsTo(`${earlierPath}/ssm/unavailable`, 'PUT')).toHaveLength(1)
    );
    expect(requestsTo(`${earlierPath}/su/unavailable`, 'PUT')).toHaveLength(0);
  });

  it('opens the window on the missing domain with today proposed, and asks for a file', async () => {
    mockClient(() => [domain('ssm', { state: 'unavailable' }), domain('su')]);
    mount('instruiri-tinute');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('earlier-instructions-add'));
    const dialog = within(await screen.findByTestId('earlier-instructions-dialog'));
    expect(dialog.getByText('Adaugă instrucțiunile proprii anterioare')).toBeTruthy();
    expect((dialog.getByTestId('earlier-instructions-domain') as HTMLSelectElement).value).toBe(
      'su'
    );
    expect(
      (dialog.getByTestId('earlier-instructions-valid-until') as HTMLInputElement).value
    ).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    await user.click(dialog.getByTestId('earlier-instructions-submit'));
    expect(dialog.getByText('Alege fișierul.')).toBeTruthy();
  });
});

describe('the earlier own instructions in Alte documente', () => {
  const ssm = file('f1000000-0000-4000-8000-000000000001', 'Instructiuni proprii SSM 2021', {
    domain: 'ssm',
    validUntil: '2026-11-12',
  });
  const certificate = file('f1000000-0000-4000-8000-000000000002', 'Certificat', null);

  it('groups them apart, each with its domain and the day it applied until', async () => {
    mockClient(
      () => [],
      (init, url) =>
        url.pathname === filesPath && (init?.method ?? 'GET') === 'GET'
          ? Response.json({ items: [ssm, certificate] })
          : undefined
    );
    mount('alte-documente');
    const group = await screen.findByTestId('earlier-instructions-group');
    expect(group.textContent).toContain('Instrucțiuni proprii anterioare · un fișier');
    expect(group.textContent).toContain('Nu intră în documentele generate.');
    const rows = screen.getAllByTestId('client-file-row');
    expect(rows.map((row) => within(row).getByTestId('client-file-open').textContent)).toEqual([
      'Certificat',
      'Instructiuni proprii SSM 2021',
    ]);
    expect(within(rows[1]!).getByTestId('client-file-instructions').textContent).toBe('IPSSM');
    expect(within(rows[1]!).getByTestId('client-file-valid-until').textContent).toBe(
      'valabile până la 12.11.2026'
    );
    expect(within(rows[0]!).queryByTestId('client-file-valid-until')).toBeNull();
  });

  it('changes the day from the rename window', async () => {
    mockClient(
      () => [],
      (init, url) => {
        if (url.pathname === filesPath && (init?.method ?? 'GET') === 'GET') {
          return Response.json({ items: [ssm] });
        }
        if (url.pathname === `${filesPath}/${ssm.id}` && init?.method === 'PATCH') {
          return Response.json({ file: ssm });
        }
        return undefined;
      }
    );
    mount('alte-documente');
    const user = userEvent.setup();
    await screen.findByTestId('earlier-instructions-group');
    await user.click(screen.getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-rename'));
    const dialog = within(await screen.findByTestId('client-file-dialog'));
    const day = dialog.getByTestId('client-file-valid-until') as HTMLInputElement;
    expect(day.value).toBe('12.11.2026');
    await user.clear(day);
    await user.type(day, '01.03.2024');
    await user.click(dialog.getByTestId('client-file-save'));
    await waitFor(() => expect(requestsTo(`${filesPath}/${ssm.id}`, 'PATCH')).toHaveLength(1));
    expect(bodyOf(`${filesPath}/${ssm.id}`, 'PATCH')).toEqual({
      name: 'Instructiuni proprii SSM 2021',
      note: null,
      validUntil: '2024-03-01',
    });
  });

  it('keeps a copy open to the team, saying why the switch is off', async () => {
    mockClient(
      () => [],
      (init, url) =>
        url.pathname === filesPath && (init?.method ?? 'GET') === 'GET'
          ? Response.json({ items: [ssm] })
          : undefined
    );
    mount('alte-documente');
    const user = userEvent.setup();
    await screen.findByTestId('earlier-instructions-group');
    await user.click(screen.getByTestId('client-file-actions'));
    const toggle = await screen.findByTestId('client-file-owners-only-switch');
    expect(toggle.hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByTestId('client-file-owners-only-reason').textContent).toBe(
      'Instrucțiunile anterioare rămân vizibile pentru toată echipa.'
    );
  });

  it('has the notice asked again once a copy is deleted', async () => {
    mockClient(
      () => [],
      (init, url) => {
        if (url.pathname === filesPath && (init?.method ?? 'GET') === 'GET') {
          return Response.json({ items: [ssm] });
        }
        if (url.pathname === `${filesPath}/${ssm.id}` && init?.method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        return undefined;
      }
    );
    const { queryClient } = mount('alte-documente');
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    await screen.findByTestId('earlier-instructions-group');
    await user.click(screen.getByTestId('client-file-actions'));
    await user.click(await screen.findByTestId('client-file-delete'));
    await user.click(await screen.findByTestId('client-file-delete-confirm'));
    await waitFor(() =>
      expect(invalidated).toHaveBeenCalledWith({
        queryKey: getGetEarlierInstructionsQueryKey(clientId),
      })
    );
  });
});

describe('the notice after a training is recorded', () => {
  it('is read again, since a paper training may bring a domain to ask for', async () => {
    const queryClient = new QueryClient();
    const earlierKey = getGetEarlierInstructionsQueryKey(clientId);
    queryClient.setQueryData(earlierKey, { domains: [] });
    await invalidateTrainings(queryClient, clientId);
    expect(queryClient.getQueryState(earlierKey)?.isInvalidated).toBe(true);
  });
});
