import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const leadId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const documentId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const lead = {
  id: leadId,
  legalName: 'VELOCITA URBANA SRL',
  cui: '41760933',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: 'J40/13726/2019',
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: null,
  declaredEmployeeCount: 6,
  stage: 'lead',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  serviceContractState: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};
const saved = {
  contractNumber: 52,
  contractDate: '2026-09-21',
  startDate: '2026-10-01',
  durationMonths: 12,
  renewsAutomatically: true,
  coversOccupationalSafety: true,
  coversFireSafety: false,
  endDate: '2027-09-30',
};
const revision = (overrides: Record<string, unknown> = {}) => ({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  revision: 1,
  status: 'draft',
  issueDate: null,
  dataChanged: false,
  editedAt: null,
  issuedAt: null,
  hasPdf: false,
  createdAt: '2026-09-21T10:00:00+00:00',
  ...overrides,
});
const contractDocument = (overrides: Record<string, unknown> = {}) => ({
  id: documentId,
  clientId: leadId,
  typeKey: 'service_contract',
  title: 'Contract de prestări servicii',
  decisionNumber: null,
  draft: revision(),
  issued: null,
  ...overrides,
});
const state = (overrides: Record<string, unknown> = {}) => ({
  contract: saved,
  suggestedNumber: null,
  clientRepresentative: { name: 'Adnana POPA', role: 'Administrator' },
  readiness: { ready: true, missing: [] as string[] },
  document: null as ReturnType<typeof contractDocument> | null,
  lastSend: null as { sentTo: string; sentAt: string; revision: number } | null,
  draftOutdated: false,
  ...overrides,
});

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(
  routes: Partial<Record<'get' | 'save' | 'generate' | 'issue' | 'send', Route>> & {
    role?: 'owner' | 'specialist';
    client?: Record<string, unknown>;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role: routes.role ?? 'owner',
        },
      });
    }
    if (pathname === `/clients/${leadId}`) return Response.json({ client: routes.client ?? lead });
    if (pathname === `/clients/${leadId}/owner-notes`) {
      return Response.json({ notes: { body: '', updatedAt: null } });
    }
    if (pathname === `/clients/${leadId}/service-contract/generate`) {
      return routes.generate?.(init) ?? Response.json(state({ document: contractDocument() }));
    }
    if (pathname === `/clients/${leadId}/service-contract/send`) {
      return routes.send?.(init) ?? Response.json(state());
    }
    if (pathname === `/clients/${leadId}/service-contract`) {
      return method === 'PUT'
        ? (routes.save?.(init) ?? Response.json(state()))
        : (routes.get?.(init) ?? Response.json(state()));
    }
    if (pathname === `/documents/${documentId}/issue`) {
      return routes.issue?.(init) ?? Response.json({ document: contractDocument() });
    }
    if (pathname === '/clients')
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (path: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = (path = `/leads/${leadId}`) => mountApp(authFixture(makeSession()).client, path);

describe('the service contract of a lead', () => {
  it('starts from the suggested number and asks for the details before anything else', async () => {
    mockApi({
      get: () =>
        Response.json(
          state({
            contract: null,
            suggestedNumber: 52,
            clientRepresentative: { name: null, role: null },
            readiness: { ready: false, missing: ['contract.details'] },
          })
        ),
      save: (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          contractNumber: 52,
          contractDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          durationMonths: 24,
          renewsAutomatically: true,
          coversOccupationalSafety: true,
          coversFireSafety: true,
          clientRepresentativeName: 'Adnana POPA',
        });
        return Response.json(state({ coversFireSafety: true }));
      },
    });
    mount();
    const user = userEvent.setup();
    const form = await screen.findByTestId('service-contract-form');
    expect((within(form).getByTestId('contract-contractNumber') as HTMLInputElement).value).toBe(
      '52'
    );
    expect(within(form).getByText(/^Propus după ultimul contract/)).toBeTruthy();
    expect(screen.getByTestId('contract-generate')).toHaveProperty('disabled', true);
    expect(screen.queryByTestId('contract-missing')).toBeNull();

    const months = within(form).getByTestId('contract-durationMonths');
    await user.clear(months);
    await user.type(months, '24');
    await user.click(within(form).getByTestId('contract-coversFireSafety'));
    await user.type(within(form).getByTestId('contract-clientRepresentativeName'), 'Adnana POPA');
    await user.click(within(form).getByTestId('contract-save'));
    expect(await screen.findByText('Detaliile contractului au fost salvate.')).toBeTruthy();
    expect(requests(`/clients/${leadId}/service-contract`, 'PUT')).toHaveLength(1);
    expect(await screen.findByTestId('contract-end')).toBeTruthy();
  });

  it('says what is missing, by where it is filled in', async () => {
    mockApi({
      get: () =>
        Response.json(
          state({
            readiness: {
              ready: false,
              missing: ['provider.bankAccount', 'client.address', 'client.representativeRole'],
            },
          })
        ),
    });
    mount();
    const missing = await screen.findByTestId('contract-missing');
    expect(missing.textContent).toContain('Despre organizația ta: contul bancar și banca');
    expect(missing.textContent).toContain('Despre VELOCITA URBANA SRL: adresa sediului');
    expect(missing.textContent).toContain('În formularul de mai sus: funcția reprezentantului');
    expect(within(missing).getByRole('link', { name: 'Organizație' })).toBeTruthy();
    expect(screen.getByTestId('contract-generate')).toHaveProperty('disabled', true);
  });

  it('generates the contract and offers it in the editor', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    expect((await screen.findByTestId('contract-none')).textContent).toContain('nu a fost generat');
    await user.click(screen.getByTestId('contract-generate'));
    expect(await screen.findByText('Contractul a fost generat.')).toBeTruthy();
    expect((await screen.findByTestId('contract-draft')).textContent).toBe('Ciornă · rev. 1');
    expect(screen.getByTestId('contract-open').getAttribute('href')).toBe(
      `/leads/${leadId}/contract`
    );
    expect(screen.getByTestId('contract-generate').textContent).toContain('Generează din nou');
  });

  it('asks before generating over a draft, and marks one that the details have left behind', async () => {
    mockApi({
      get: () =>
        Response.json(
          state({
            document: contractDocument({
              draft: revision({ editedAt: '2026-09-21T11:00:00+00:00' }),
            }),
            draftOutdated: true,
          })
        ),
    });
    mount();
    const user = userEvent.setup();
    expect(await screen.findByTestId('contract-outdated')).toBeTruthy();
    expect(screen.getByTestId('contract-edited')).toBeTruthy();
    await user.click(screen.getByTestId('contract-generate'));
    expect((await screen.findByTestId('contract-confirm-dialog')).textContent).toContain(
      'Prețurile și celelalte modificări făcute de mână în ea se pierd'
    );
    expect(requests(`/clients/${leadId}/service-contract/generate`, 'POST')).toHaveLength(0);
    await user.click(screen.getByTestId('contract-confirm'));
    await waitFor(() =>
      expect(requests(`/clients/${leadId}/service-contract/generate`, 'POST')).toHaveLength(1)
    );
  });

  it('asks again before issuing a contract whose prices are still to be written', async () => {
    let asked = 0;
    mockApi({
      get: () => Response.json(state({ document: contractDocument() })),
      issue: (init) => {
        asked += 1;
        return JSON.parse(String(init?.body)).acceptUnfilled
          ? Response.json({ document: contractDocument() })
          : Response.json(
              { error: 'conflict', message: 'unfilled', reason: 'unfilled_text' },
              { status: 409 }
            );
      },
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('contract-issue'));
    await user.click(await screen.findByTestId('contract-confirm'));
    expect(
      (await screen.findByText('Contractul mai are text de completat')).textContent
    ).toBeTruthy();
    expect(screen.getByTestId('contract-confirm-dialog').textContent).toContain('prețurile');
    await user.click(screen.getByTestId('contract-confirm'));
    expect(await screen.findByText('Contractul a fost emis.')).toBeTruthy();
    expect(asked).toBe(2);
  });

  it('says so when another contract of the year has the number', async () => {
    mockApi({
      save: () =>
        Response.json(
          { error: 'conflict', message: 'taken', reason: 'contract_number_taken' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();
    const number = await screen.findByTestId('contract-contractNumber');
    await user.clear(number);
    await user.type(number, '51');
    await user.click(screen.getByTestId('contract-save'));
    expect((await screen.findByTestId('contract-contractNumber-error')).textContent).toContain(
      'același an'
    );
  });
});

describe('sending the contract', () => {
  const issued = (hasPdf = true) =>
    contractDocument({
      draft: null,
      issued: revision({ status: 'issued', issuedAt: '2026-09-21T11:00:00+00:00', hasPdf }),
    });

  it('goes to the contact, with a note, and then says when and where it went', async () => {
    const sent = state({
      document: issued(),
      lastSend: {
        sentTo: 'andrei@velocita.example',
        sentAt: '2026-09-21T12:00:00+00:00',
        revision: 1,
      },
    });
    mockApi({
      client: { ...lead, contactEmail: 'andrei@velocita.example' },
      get: () => Response.json(state({ document: issued() })),
      send: (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          to: 'andrei@velocita.example',
          note: 'Cum am vorbit.',
        });
        return Response.json(sent);
      },
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('contract-send'));
    const dialog = await screen.findByTestId('send-contract-dialog');
    expect(dialog.textContent).toContain('în numele tău');
    expect((within(dialog).getByTestId('send-contract-to') as HTMLInputElement).value).toBe(
      'andrei@velocita.example'
    );
    await user.type(within(dialog).getByTestId('send-contract-note'), 'Cum am vorbit.');
    await user.click(within(dialog).getByTestId('send-contract-confirm'));

    expect(
      await screen.findByText('Contractul a fost trimis la andrei@velocita.example.')
    ).toBeTruthy();
    expect((await screen.findByTestId('contract-last-send')).textContent).toContain(
      'Revizia 1 a fost trimisă la andrei@velocita.example pe 21.09.2026.'
    );
    expect(screen.getByTestId('contract-sent')).toBeTruthy();
    expect(screen.getByTestId('contract-send').textContent).toContain('Trimite din nou');
  });

  it('asks for an address when the lead has no contact, and says when the email did not leave', async () => {
    mockApi({
      get: () => Response.json(state({ document: issued() })),
      send: () => Response.json({ error: 'service_unavailable', message: 'down' }, { status: 503 }),
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('contract-send'));
    await user.click(await screen.findByTestId('send-contract-confirm'));
    expect((await screen.findByTestId('send-to-error')).textContent).toContain('Introdu adresa');
    await user.type(screen.getByTestId('send-contract-to'), 'andrei@velocita.example');
    await user.click(screen.getByTestId('send-contract-confirm'));
    expect((await screen.findByTestId('send-contract-error')).textContent).toContain(
      'nu a putut fi trimis acum'
    );
    expect(screen.getByTestId('send-contract-dialog')).toBeTruthy();
  });

  it('is not offered for a draft, and says why for an issued contract without a PDF', async () => {
    mockApi({ get: () => Response.json(state({ document: contractDocument() })) });
    mount();
    await screen.findByTestId('contract-draft');
    expect(screen.queryByTestId('contract-send')).toBeNull();
  });

  it('says why an issued contract without a PDF is not sent from here', async () => {
    mockApi({ get: () => Response.json(state({ document: issued(false) })) });
    mount();
    const button = await screen.findByTestId('contract-send');
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('title')).toContain('nu are PDF');
  });
});

describe('the other documents of a client', () => {
  const client = { ...lead, stage: 'client', promotedAt: '2026-09-21T09:00:00+00:00' };

  it('is a section of the client for an owner, with the contract and its own editor address', async () => {
    mockApi({ client, get: () => Response.json(state({ document: contractDocument() })) });
    mount(`/clients/${leadId}/other-documents`);
    await screen.findByTestId('other-documents-page');
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).toContain('Alte documente');
    expect((await screen.findByTestId('contract-open')).getAttribute('href')).toBe(
      `/clients/${leadId}/other-documents/contract`
    );
  });

  it('is not offered to a specialist, and asks the API for nothing on their behalf', async () => {
    mockApi({ client, role: 'specialist' });
    mount(`/clients/${leadId}/other-documents`);
    expect(await screen.findByTestId('other-documents-owners-only')).toBeTruthy();
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).not.toContain('Alte documente');
    expect(requests(`/clients/${leadId}/service-contract`, 'GET')).toHaveLength(0);
  });
});
