import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { untrained } from '@/test/training-fixture';

import { matchSigner } from './signer-match';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const otherClientId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const welderId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const recordId = '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c';
const trainingId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const memberId = 'user-one';
const managerAccountId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const traineeAccountId = '0f1e2d3c-4b5a-4968-8776-655443322110';
const fileId = '6b5a4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';

const employeesPath = `/clients/${clientId}/employees`;
const employeePath = `${employeesPath}/${employeeId}`;
const trainingsPath = `/clients/${clientId}/trainings`;
const signaturesPath = `/clients/${clientId}/training-records/${recordId}/signatures`;
const agreementPath = `${employeePath}/signing-agreement`;

const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: 'București',
  addressLine: null,
  legalRepresentativeName: 'Maria Pop',
  declaredEmployeeCount: 6,
  stage: 'client',
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const employee = {
  id: employeeId,
  clientId,
  lastName: 'Popescu',
  firstName: 'Ion',
  cnp: null,
  employeeNumber: null,
  email: 'ion.popescu@example.com',
  phone: null,
  jobTitle: 'Sudor',
  jobPosition: { id: welderId, name: 'Sudor' },
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  birthDate: null,
  birthPlace: null,
  homeAddress: null,
  bloodGroup: null,
  rhFactor: null,
  notes: null,
  workplace: null,
  qualification: null,
  education: null,
  authorizations: null,
  commuteRoute: null,
  commuteMinutes: null,
  training: untrained,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const position = {
  id: welderId,
  clientId,
  name: 'Sudor',
  staffCategory: 'execution',
  workZone: null,
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 1,
  needsProtectiveEquipment: null,
  equipmentCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const candidates = [
  {
    accountId: memberId,
    name: 'Dan MARIN',
    jobTitle: 'Inspector SSM',
    kind: 'member',
    employeeId: null,
  },
  {
    accountId: managerAccountId,
    name: 'Pop Maria',
    jobTitle: 'Șef atelier',
    kind: 'employee',
    employeeId: '8d0f7780-8536-41ef-a55c-f18fd2fa1bf8',
  },
  {
    accountId: traineeAccountId,
    name: 'Popescu Ion',
    jobTitle: 'Sudor',
    kind: 'employee',
    employeeId,
  },
];

const proposal = {
  durationMinutes: 240,
  material: 'H.G. 1051/2006; I.P.S.S.M. Art. 1 – 290',
  trainer: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
  verifier: { name: 'Dan Marin', jobTitle: null },
  admittedBy: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
  themesRevisionId: null,
};

const record = (overrides: Record<string, unknown> = {}) => ({
  id: recordId,
  occupation: 'Sudor',
  admission: null,
  training: {
    id: trainingId,
    clientId,
    domain: 'ssm',
    phase: 'periodic',
    heldOn: '2026-09-01',
    durationMinutes: 120,
    material: 'IPSSM art. 1–40',
    trainer: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
    verifier: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
    supplementaryReason: null,
    source: 'app',
    themesRevisionId: null,
    notes: null,
    createdAt: '2026-09-01T10:00:00+00:00',
    updatedAt: '2026-09-01T10:00:00+00:00',
  },
  signed: false,
  hasSignatures: false,
  ...overrides,
});

const slot = (name: string, state: string, overrides: Record<string, unknown> = {}) => ({
  slot: name,
  state,
  requestId: null,
  signer: null,
  issuedAt: null,
  notifiedAt: null,
  signedAt: null,
  signerName: null,
  signerJobTitle: null,
  voidedAt: null,
  voidReason: null,
  ...overrides,
});

const pendingTrainee = slot('trainee', 'pending', {
  requestId: '11111111-2222-4333-8444-555555555555',
  signer: { accountId: traineeAccountId, name: 'Popescu Ion' },
  issuedAt: '2026-09-01T10:05:00.000Z',
});

const request = (overrides: Record<string, unknown> = {}) => ({
  id: '22222222-3333-4444-8555-666666666666',
  slot: 'trainer',
  state: 'pending',
  issuedAt: '2026-10-15T09:00:00.000Z',
  notifiedAt: '2026-10-15T09:00:05.000Z',
  client: { id: clientId, name: 'VELOCE CAFE SRL' },
  record: {
    id: recordId,
    trainingId,
    employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
    domain: 'ssm',
    phase: 'periodic',
    heldOn: '2026-10-14',
  },
  signer: { accountId: memberId, name: 'Dan MARIN' },
  agreementState: null,
  ...overrides,
});

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();
const saved: string[] = [];

function mockApi(routes: Partial<Record<string, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(url, init);
    switch (key) {
      case 'GET /me':
        return Response.json({ user: { id: memberId, email: 'review@example.test' } });
      case `GET /clients/${clientId}`:
        return Response.json({ client: sampleClient });
      case `GET ${employeesPath}`:
        return Response.json({ items: [employee], page: 1, pageSize: 100, total: 1 });
      case `GET ${employeePath}`:
        return Response.json({ employee });
      case `GET ${employeePath}/training-records`:
        return Response.json({ items: [] });
      case `GET ${employeePath}/training-sheets`:
        return Response.json({
          ssm: { ready: true, missing: [], stored: false, sequences: [] },
          psi: { ready: true, missing: [], stored: false, sequences: [] },
        });
      case `GET ${employeePath}/participant`:
        return Response.json({ participant: null, invitation: null });
      case `GET ${agreementPath}/state`:
        return Response.json({ agreement: null });
      case `GET /clients/${clientId}/job-positions`:
        return Response.json({ items: [position] });
      case `GET /clients/${clientId}/signer-candidates`:
        return Response.json({ items: candidates });
      case `GET /clients/${clientId}/signature-requests`:
        return Response.json({ items: [] });
      case `GET /clients/${clientId}/files`:
        return Response.json({ items: [] });
      case `GET ${trainingsPath}`:
        return Response.json({ items: [] });
      case `GET ${trainingsPath}/proposal`:
        return Response.json(proposal);
      case `POST ${trainingsPath}`:
        return Response.json({ training: {} }, { status: 201 });
      case `GET ${signaturesPath}`:
        return Response.json({ recordId, slots: [] });
      case 'GET /me/signature-requests':
        return Response.json({ items: [] });
    }
    return Response.json({ error: 'not_found', message: 'Not mocked.' }, { status: 404 });
  });
}

const requests = (method: string, pathname: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        (init?.method ?? 'GET') === method && new URL(String(input)).pathname === pathname
    )
    .map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    }));

const conflict = (reason: string) =>
  Response.json({ error: 'conflict', message: reason, reason }, { status: 409 });

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  saved.length = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:agreement', revokeObjectURL: () => {} })
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    if (this.download) saved.push(this.download);
  });
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('matchSigner', () => {
  it('matches a name in either order, case and diacritics', () => {
    expect(matchSigner('Maria Pop', candidates as never, memberId)).toBe(managerAccountId);
    expect(matchSigner('dan marin', candidates as never, memberId)).toBe(memberId);
    expect(matchSigner('Ion POPESCU', candidates as never, memberId)).toBe(traineeAccountId);
    expect(matchSigner('Ana Ionescu', candidates as never, memberId)).toBeNull();
    expect(matchSigner('  ', candidates as never, memberId)).toBeNull();
  });

  it('prefers the signed-in member, then a member, when two people share a name', () => {
    const twins = [
      { ...candidates[1]!, name: 'Dan Marin' },
      { ...candidates[0]!, accountId: 'another-member' },
      candidates[0]!,
    ];
    expect(matchSigner('Dan Marin', twins as never, memberId)).toBe(memberId);
    expect(matchSigner('Dan Marin', twins as never, 'someone-else')).toBe('another-member');
  });
});

describe('signers on the training flow', () => {
  async function openWorkplaceTraining(domain: 'ssm' | 'psi' = 'ssm') {
    const user = userEvent.setup();
    mount(`${employeePath}/training/${domain}`);
    // The first mount of the describe loads the route and its queries cold; CI needs longer than the default second.
    await screen.findByTestId('training-records-empty', {}, { timeout: 5000 });
    await user.click(screen.getAllByTestId('training-record')[0]!);
    const dialog = await screen.findByTestId('training-dialog');
    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'workplace');
    await waitFor(() =>
      expect((within(dialog).getByTestId('training-trainer-name') as HTMLInputElement).value).toBe(
        'Maria Pop'
      )
    );
    return { user, dialog };
  }

  it('proposes a signer for each proposed person by name, and sends the ones kept', async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining();
    const value = (testId: string) =>
      (within(dialog).getByTestId(testId) as HTMLSelectElement).value;
    await waitFor(() => expect(value('training-trainer-signer')).toBe(managerAccountId));
    expect(value('training-verifier-signer')).toBe(memberId);
    expect(value('training-admitter-signer')).toBe(managerAccountId);
    expect(
      [...within(dialog).getByTestId('training-trainer-signer').querySelectorAll('optgroup')].map(
        (group) => group.label
      )
    ).toEqual(['Organizația ta', 'Clientul, în portal']);
    expect(dialog.querySelector('#training-trainer-signer-hint')!.textContent).toBe(
      'Primește o cerere de semnare pe email sau prin SMS.'
    );

    await user.selectOptions(within(dialog).getByTestId('training-admitter-signer'), '');
    expect(dialog.querySelector('#training-admitter-signer-hint')!.textContent).toBe(
      'Rubrica se semnează de mână, pe fișa tipărită.'
    );
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));

    expect(await screen.findByText('Instruirea a fost înregistrată.')).toBeTruthy();
    expect(requests('POST', trainingsPath)[0]!.body).toMatchObject({
      source: 'app',
      verifier: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
      signers: { trainer: managerAccountId, verifier: memberId, admitter: null },
    });
  });

  it('warns when the chosen signer is not the person the slot prints, and takes their name on request', async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining();
    const trainerSigner = within(dialog).getByTestId('training-trainer-signer');
    await waitFor(() => expect((trainerSigner as HTMLSelectElement).value).toBe(managerAccountId));
    expect(within(dialog).queryByTestId('training-trainer-signer-mismatch')).toBeNull();

    await user.selectOptions(trainerSigner, memberId);
    expect(within(dialog).getByTestId('training-trainer-signer-mismatch').textContent).toContain(
      'Rubrica tipărește „Maria Pop”, dar semnează Dan MARIN.'
    );
    await user.click(within(dialog).getByTestId('training-trainer-signer-use-name'));
    expect((within(dialog).getByTestId('training-trainer-name') as HTMLInputElement).value).toBe(
      'Dan MARIN'
    );
    expect((trainerSigner as HTMLSelectElement).value).toBe(memberId);
    expect(within(dialog).queryByTestId('training-trainer-signer-mismatch')).toBeNull();
  });

  it("drops a chosen signer back to the name's match when the slot's name is typed again", async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining();
    const trainerSigner = within(dialog).getByTestId('training-trainer-signer');
    const trainerName = within(dialog).getByTestId('training-trainer-name');
    await waitFor(() => expect((trainerSigner as HTMLSelectElement).value).toBe(managerAccountId));
    await user.selectOptions(trainerSigner, memberId);
    await user.clear(trainerName);
    await user.type(trainerName, 'Ana Ionescu');
    expect((trainerSigner as HTMLSelectElement).value).toBe('');
    await user.clear(trainerName);
    await user.type(trainerName, 'Pop Maria');
    expect((trainerSigner as HTMLSelectElement).value).toBe(managerAccountId);
    expect(within(dialog).queryByTestId('training-trainer-signer-mismatch')).toBeNull();
  });

  it('offers no verifier or admitter signer on the fire-safety sheet, which has no field for them', async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining('psi');
    await waitFor(() =>
      expect(
        (within(dialog).getByTestId('training-trainer-signer') as HTMLSelectElement).value
      ).toBe(managerAccountId)
    );
    expect(
      (within(dialog).getByTestId('training-admitted-by-name') as HTMLInputElement).value
    ).toBe('Maria Pop');
    expect(within(dialog).queryByTestId('training-admitter-signer')).toBeNull();
    expect(within(dialog).queryByTestId('training-verifier-signer')).toBeNull();
    await user.click(within(dialog).getByTestId('training-save'));
    await screen.findByText('Instruirea a fost înregistrată.');
    expect(requests('POST', trainingsPath)[0]!.body).toMatchObject({
      signers: { trainer: managerAccountId },
    });
    expect(
      (requests('POST', trainingsPath)[0]!.body as { signers: Record<string, unknown> }).signers
    ).not.toHaveProperty('admitter');
  });

  it("puts the API's name mismatch under the picker", async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'The signer is not the person the slot names.',
            reason: 'signer_name_mismatch',
            issues: [{ path: 'signers.verifier', message: "The account's name is not Dan Marin." }],
          },
          { status: 422 }
        ),
    });
    const { user, dialog } = await openWorkplaceTraining();
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    expect((await within(dialog).findByTestId('training-verifier-signer-error')).textContent).toBe(
      'Contul ales nu poartă numele tipărit în rubrică. Alege persoana cu acest nume sau folosește numele semnatarului.'
    );
  });

  it('asks nobody for a training typed from a paper sheet', async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining();
    await user.selectOptions(within(dialog).getByTestId('training-source'), 'paper');
    expect(within(dialog).queryByTestId('training-trainer-signer')).toBeNull();
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    await screen.findByText('Instruirea a fost înregistrată.');
    expect(requests('POST', trainingsPath)[0]!.body).not.toHaveProperty('signers');
  });

  it('puts a signer the API refuses under its picker', async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        Response.json(
          {
            error: 'unprocessable',
            message: 'The signer is neither a member nor a participant.',
            reason: 'signer_not_of_client',
            issues: [{ path: 'signers.trainer', message: 'The signer is neither.' }],
          },
          { status: 422 }
        ),
    });
    const { user, dialog } = await openWorkplaceTraining();
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    expect((await within(dialog).findByTestId('training-trainer-signer-error')).textContent).toBe(
      'Semnatarul ales nu mai este membru al organizației sau participant al clientului. Alege din nou.'
    );
  });
});

describe("a record's signatures", () => {
  it('shows each slot with its state and freezes a record signed electronically', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({
          recordId,
          slots: [
            pendingTrainee,
            slot('trainer', 'signed', {
              signer: { accountId: managerAccountId, name: 'Pop Maria' },
              signedAt: '2026-09-02T08:00:00.000Z',
              signerName: 'Maria Pop',
              signerJobTitle: 'Șef atelier',
            }),
            slot('verifier', 'unassigned'),
          ],
        }),
    });
    mount(`${employeePath}/training/ssm`);
    const block = await screen.findByTestId('record-signatures');
    const slots = within(block).getAllByTestId('signature-slot');
    expect(slots.map((item) => item.textContent)).toEqual([
      'InstruitDe semnatPopescu Ion',
      'InstructorSemnat electronicMaria Pop · 2 sept. 2026',
      'VerificatorFără semnatar',
    ]);
    expect(screen.getByTestId('training-record-edit')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('training-record-delete')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('training-record-lock').textContent).toBe(
      'Instruirea este semnată electronic. Anulează semnăturile ca să o poți modifica sau șterge.'
    );
  });

  it.each([
    [
      { signed: true, hasSignatures: true },
      'Instruirea este semnată electronic. Anulează semnăturile ca să o poți modifica sau șterge.',
    ],
    [
      { signed: false, hasSignatures: true },
      'Instruirea are semnături, chiar anulate sau pe hârtie, care rămân în evidență, așa că nu se mai poate șterge.',
    ],
  ])(
    "locks a record by its training's signing state from other attendees' records, %o",
    async (signing, lock) => {
      mockApi({
        [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record(signing)] }),
        [`GET ${signaturesPath}`]: () => Response.json({ recordId, slots: [pendingTrainee] }),
      });
      mount(`${employeePath}/training/ssm`);
      await screen.findByTestId('record-signatures');
      expect(screen.getByTestId('training-record-edit')).toHaveProperty('disabled', signing.signed);
      expect(screen.getByTestId('training-record-delete')).toHaveProperty('disabled', true);
      expect(screen.getByTestId('training-record-lock').textContent).toBe(lock);
      expect(requests('GET', trainingsPath)).toHaveLength(0);
    }
  );

  it("words the reasons the app voids a request for, and keeps a member's own words", async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({
          recordId,
          slots: [
            slot('trainee', 'void', { voidReason: 'withdrawn' }),
            slot('trainer', 'void', { voidReason: 'record_changed' }),
            slot('verifier', 'void', { voidReason: 'Data greșită' }),
          ],
        }),
    });
    mount(`${employeePath}/training/ssm`);
    const block = await screen.findByTestId('record-signatures');
    expect(
      within(block)
        .getAllByTestId('signature-slot')
        .map((item) => item.textContent)
    ).toEqual([
      'InstruitAnulatMotiv: salariatul a revenit la semnarea olografă',
      'InstructorAnulatMotiv: instruirea a fost modificată',
      'VerificatorAnulatMotiv: Data greșită',
    ]);
  });

  it('marks a slot signed on paper with the name the record prints', async () => {
    let marked = false;
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({
          recordId,
          hasSignatures: marked,
          slots: [
            pendingTrainee,
            slot('trainer', 'unassigned'),
            marked
              ? slot('verifier', 'paper', {
                  signedAt: '2026-10-18T09:00:00.000Z',
                  signerName: 'Dan Marin',
                })
              : slot('verifier', 'unassigned'),
          ],
        }),
      [`POST ${signaturesPath}/paper`]: () => {
        marked = true;
        return Response.json({ recordId, slots: [] });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('record-signatures');
    expect(screen.getByTestId('training-record-edit')).toHaveProperty('disabled', false);
    await user.click(screen.getByTestId('record-signatures-paper'));
    const dialog = await screen.findByTestId('paper-signature-dialog');
    const slotSelect = within(dialog).getByTestId('paper-signature-slot') as HTMLSelectElement;
    expect([...slotSelect.options].map((option) => option.textContent)).toEqual([
      'Instruit',
      'Instructor',
      'Verificator',
    ]);
    expect((within(dialog).getByTestId('paper-signature-name') as HTMLInputElement).value).toBe(
      'Popescu Ion'
    );
    await user.selectOptions(slotSelect, 'verifier');
    expect((within(dialog).getByTestId('paper-signature-name') as HTMLInputElement).value).toBe(
      'Dan Marin'
    );
    await user.click(within(dialog).getByTestId('paper-signature-submit'));

    await waitFor(() =>
      expect(requests('POST', `${signaturesPath}/paper`).map((call) => call.body)).toEqual([
        { slot: 'verifier', signerName: 'Dan Marin', signerJobTitle: 'Inspector SSM' },
      ])
    );
    const verifier = await waitFor(() => {
      const item = screen
        .getAllByTestId('signature-slot')
        .find((entry) => entry.dataset.slot === 'verifier')!;
      expect(item.textContent).toContain('Semnat pe hârtie');
      return item;
    });
    expect(verifier.textContent).toContain('Dan Marin');
    expect(screen.getByTestId('training-record-delete')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('training-record-edit')).toHaveProperty('disabled', false);
  });

  it('asks for a reason before voiding, and words a refusal', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () => Response.json({ recordId, slots: [pendingTrainee] }),
      [`POST ${signaturesPath}/void`]: () => conflict('client_archived'),
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await user.click(await screen.findByTestId('record-signatures-void'));
    const dialog = await screen.findByTestId('void-signatures-dialog');
    await user.click(within(dialog).getByTestId('void-signatures-confirm'));
    expect(within(dialog).getByRole('alert').textContent).toBe('Scrie motivul anulării.');
    expect(requests('POST', `${signaturesPath}/void`)).toHaveLength(0);

    await user.type(within(dialog).getByTestId('void-signatures-reason'), 'Durata greșită');
    await user.click(within(dialog).getByTestId('void-signatures-confirm'));
    expect((await within(dialog).findByTestId('void-signatures-error')).textContent).toBe(
      'Clientul este arhivat; semnăturile lui nu se mai schimbă.'
    );
    expect(requests('POST', `${signaturesPath}/void`).map((call) => call.body)).toEqual([
      { reason: 'Durata greșită' },
    ]);
  });

  it('voids the signatures and shows the slots voided', async () => {
    let voided = false;
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({
          recordId,
          slots: [
            voided
              ? slot('trainee', 'void', {
                  voidedAt: '2026-10-18T09:00:00.000Z',
                  voidReason: 'Durata greșită',
                })
              : pendingTrainee,
          ],
        }),
      [`POST ${signaturesPath}/void`]: () => {
        voided = true;
        return Response.json({ recordId, slots: [] });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await user.click(await screen.findByTestId('record-signatures-void'));
    const dialog = await screen.findByTestId('void-signatures-dialog');
    await user.type(within(dialog).getByTestId('void-signatures-reason'), 'Durata greșită');
    await user.click(within(dialog).getByTestId('void-signatures-confirm'));
    await waitFor(() => expect(screen.queryByTestId('void-signatures-dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('signature-slot').textContent).toBe(
        'InstruitAnulatMotiv: Durata greșită'
      )
    );
  });

  it('says why a training with signatures cannot be deleted when the API refuses', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({ recordId, slots: [slot('trainee', 'void')] }),
      [`DELETE ${trainingsPath}/${trainingId}`]: () => conflict('record_has_signatures'),
      [`GET ${trainingsPath}/${trainingId}`]: () =>
        Response.json({ training: { ...record().training, records: [] } }),
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('record-signatures');
    await user.click(screen.getByTestId('training-record-delete'));
    await user.click(await screen.findByTestId('training-delete-confirm'));
    expect((await screen.findByTestId('training-delete-error')).textContent).toBe(
      'Instruirea are semnături, pe hârtie sau electronice, care rămân în evidență; nu se mai poate șterge.'
    );
  });

  it("says a training cannot change while another attendee's record is signed", async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${trainingsPath}/${trainingId}`]: () =>
        Response.json({
          training: {
            ...record().training,
            records: [
              {
                id: recordId,
                employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
                occupation: 'Sudor',
                admission: null,
              },
            ],
            signers: { trainer: null, verifier: null, admitter: null },
          },
        }),
      [`PUT ${trainingsPath}/${trainingId}`]: () => conflict('record_signed'),
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('record-signatures');
    await user.click(screen.getByTestId('training-record-edit'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.click(await within(dialog).findByTestId('training-save'));
    expect((await within(dialog).findByTestId('training-error')).textContent).toBe(
      'Instruirea are semnături electronice și nu se mai poate modifica. Anulează semnăturile, apoi modifică instruirea.'
    );
  });

  it('leaves out the slots of a training typed from a paper sheet', async () => {
    const paper = record();
    paper.training.source = 'paper';
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [paper] }),
    });
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('training-record-item');
    expect(screen.queryByTestId('record-signatures')).toBeNull();
    expect(requests('GET', signaturesPath)).toHaveLength(0);
  });
});

describe('the Semnături place', () => {
  it('lists my pending requests by client, ready to be chosen for one code', async () => {
    mockApi({
      'GET /me/signature-requests': () =>
        Response.json({
          items: [
            request(),
            request({
              id: '33333333-4444-4555-8666-777777777777',
              slot: 'verifier',
              client: { id: otherClientId, name: 'ATELIER NORD SRL' },
            }),
            request({ id: '44444444-5555-4666-8777-888888888888', slot: 'admitter' }),
          ],
        }),
    });
    const user = userEvent.setup();
    mount('/signatures');
    expect((await screen.findByTestId('nav-signatures')).textContent).toBe('Semnături');
    const groups = await screen.findAllByTestId('signature-requests-client');
    expect(groups.map((group) => within(group).getByRole('heading').textContent)).toEqual([
      'ATELIER NORD SRL',
      'VELOCE CAFE SRL',
    ]);
    const veloce = groups[1]!;
    const rows = within(veloce).getAllByTestId('signature-request');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Popescu Ion');
    expect(rows[0]!.textContent).toContain('Periodică · 14 oct. 2026 · semnezi ca instructor');
    expect(within(rows[0]!).getByTestId('agreement-warning').textContent).toBe(
      'Act adițional nesemnat'
    );
    expect(rows[1]!.textContent).toContain('semnezi la „Admite la lucru”');

    const sign = screen.getByTestId('signature-requests-sign');
    expect(sign).toHaveProperty('disabled', true);
    await user.click(within(veloce).getByTestId('signature-requests-client-select'));
    expect(sign.textContent).toBe('Semnează (2)');
    expect(sign).toHaveProperty('disabled', false);
    await user.click(within(veloce).getAllByTestId('signature-request-select')[0]!);
    expect(sign.textContent).toBe('Semnează (1)');
    expect(
      within(veloce).getByTestId('signature-requests-client-select').getAttribute('data-state')
    ).toBe('indeterminate');
  });

  it('says when there is nothing to sign', async () => {
    mockApi();
    mount('/signatures');
    expect((await screen.findByTestId('signature-requests-empty')).textContent).toContain(
      'Nu ai nimic de semnat.'
    );
    expect(screen.queryByTestId('signature-requests-sign')).toBeNull();
  });
});

describe("the client's pending signatures", () => {
  it('lists who has not signed, by employee, warning of an unsigned agreement', async () => {
    const ana = {
      id: '8d0f7780-8536-41ef-a55c-f18fd2fa1bf8',
      lastName: 'Ionescu',
      firstName: 'Ana',
    };
    mockApi({
      [`GET /clients/${clientId}/signature-requests`]: (url) => {
        expect(url.searchParams.get('state')).toBe('pending');
        return Response.json({
          items: [
            request({
              slot: 'trainee',
              signer: { accountId: traineeAccountId, name: 'Popescu Ion' },
            }),
            request({ id: '33333333-4444-4555-8666-777777777777' }),
            request({
              id: '44444444-5555-4666-8777-888888888888',
              slot: 'trainee',
              record: { ...request().record, employee: ana },
              signer: { accountId: managerAccountId, name: 'Ionescu Ana' },
              agreementState: 'signed_on_paper',
            }),
          ],
        });
      },
    });
    mount(`/clients/${clientId}/trainings`);
    const card = await screen.findByTestId('client-signature-requests');
    expect(within(card).getByRole('heading').textContent).toBe('3 semnături în așteptare');
    const people = within(card).getAllByTestId('client-signature-requests-employee');
    expect(people.map((person) => person.querySelector('a')!.textContent)).toEqual([
      'Ionescu Ana',
      'Popescu Ion',
    ]);
    expect(within(people[0]!).queryByTestId('agreement-warning')).toBeNull();
    expect(within(people[1]!).getByTestId('agreement-warning').textContent).toBe(
      'Act adițional nesemnat'
    );
    expect(
      within(people[1]!)
        .getAllByTestId('client-signature-request-signer')
        .map((signer) => signer.textContent)
    ).toEqual(['Popescu Ion', 'Dan MARIN']);
  });

  it('shows nothing while every request is signed', async () => {
    mockApi();
    mount(`/clients/${clientId}/trainings`);
    await screen.findByTestId('trainings-empty');
    expect(screen.queryByTestId('client-signature-requests')).toBeNull();
  });
});

describe("the employee's signing agreement", () => {
  it('downloads a new agreement and records it as generated', async () => {
    let generated = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: generated
            ? {
                state: 'generated',
                generatedAt: '2026-10-18T09:00:00.000Z',
                signedAt: null,
                clientFileId: null,
              }
            : null,
        }),
      [`GET ${agreementPath}`]: () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Act-aditional-Popescu-Ion.pdf"',
          },
        }),
      [`PUT ${agreementPath}/state`]: () => {
        generated = true;
        return Response.json({ agreement: null });
      },
    });
    const user = userEvent.setup();
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-state')).textContent).toBe(
      'Negenerat'
    );
    await user.click(within(card).getByTestId('signing-agreement-download'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'generated' },
      ])
    );
    expect(saved).toEqual(['Act-aditional-Popescu-Ion.pdf']);
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe('Generat')
    );
    expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe(
      'Descărcat pe 18 oct. 2026; se semnează de mână sau din portal.'
    );
  });

  it('marks a generated agreement signed on paper with its scan', async () => {
    let signed = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: {
            state: signed ? 'signed_on_paper' : 'generated',
            generatedAt: '2026-10-10T09:00:00.000Z',
            signedAt: signed ? '2026-10-18T09:00:00.000Z' : null,
            clientFileId: signed ? fileId : null,
          },
        }),
      [`GET /clients/${clientId}/files`]: () =>
        Response.json({
          items: [
            {
              id: fileId,
              name: 'Act adițional semnat',
              note: null,
              ownersOnly: false,
              employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
              originalFileName: 'act.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1200,
              sha256: 'a'.repeat(64),
              uploadedBy: null,
              canChange: true,
              createdAt: '2026-10-18T08:00:00.000Z',
              updatedAt: '2026-10-18T08:00:00.000Z',
            },
          ],
        }),
      [`PUT ${agreementPath}/state`]: () => {
        signed = true;
        return Response.json({ agreement: null });
      },
    });
    const user = userEvent.setup();
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-paper'));
    const dialog = await screen.findByTestId('signing-agreement-paper-dialog');
    const file = within(dialog).getByTestId('signing-agreement-file');
    await waitFor(() => expect(file).toHaveProperty('disabled', false));
    await user.selectOptions(file, fileId);
    await user.click(within(dialog).getByTestId('signing-agreement-paper-submit'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'signed_on_paper', clientFileId: fileId },
      ])
    );
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe(
        'Semnat pe hârtie'
      )
    );
    expect(within(card).queryByTestId('signing-agreement-paper')).toBeNull();
  });

  it('asks for an email or a phone when the agreement cannot name where the codes go', async () => {
    mockApi({ [`GET ${agreementPath}`]: () => conflict('employee_has_no_address') });
    const user = userEvent.setup();
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-download'));
    expect((await within(card).findByTestId('signing-agreement-no-address')).textContent).toContain(
      'Adaugă-i un email sau un telefon'
    );
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
  });

  it('warns on the portal card of a participant whose agreement is not signed', async () => {
    mockApi({
      [`GET ${employeePath}/participant`]: () =>
        Response.json({
          participant: {
            id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
            clientId,
            kind: 'employee',
            employeeId,
            fullName: 'Popescu Ion',
            channel: 'email',
            address: 'ion.popescu@example.com',
            createdAt: '2026-10-10T09:00:00.000Z',
            revokedAt: null,
            noticeVersion: null,
          },
          invitation: null,
        }),
    });
    mount(employeePath);
    const card = await screen.findByTestId('employee-portal-card');
    expect((await within(card).findByTestId('agreement-warning')).textContent).toBe(
      'Act adițional nesemnat'
    );
  });

  it('does not warn about an employee who has no portal access', async () => {
    mockApi();
    mount(employeePath);
    const card = await screen.findByTestId('employee-portal-card');
    await within(card).findByTestId('participant-none');
    expect(within(card).queryByTestId('agreement-warning')).toBeNull();
  });

  const electronic = (overrides: Record<string, unknown> = {}) => ({
    state: 'signed_electronically',
    generatedAt: '2026-10-01T09:00:00.000Z',
    signedAt: '2026-10-02T09:00:00.000Z',
    clientFileId: null,
    employeeSignedAt: '2026-10-01T10:00:00.000Z',
    employerSignedAt: '2026-10-02T09:00:00.000Z',
    awaiting: null,
    ...overrides,
  });

  it('says an agreement the employee signed waits for the administrator, and offers no paper mark', async () => {
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: electronic({
            state: 'generated',
            signedAt: null,
            employerSignedAt: null,
            awaiting: 'employer',
          }),
        }),
    });
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-detail')).textContent).toBe(
      'Semnat de angajat pe 1 oct. 2026, așteaptă semnătura administratorului în portal.'
    );
    expect(within(card).queryByTestId('signing-agreement-paper')).toBeNull();
    expect(within(card).queryByTestId('signing-agreement-in-contract')).toBeNull();
    expect(within(card).getByTestId('signing-agreement-withdraw')).toBeTruthy();
  });

  it('records the return to handwriting after an electronic signature, once confirmed', async () => {
    let withdrawn = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({ agreement: electronic(withdrawn ? { state: 'withdrawn' } : {}) }),
      [`PUT ${agreementPath}/state`]: () => {
        withdrawn = true;
        return Response.json({ agreement: electronic({ state: 'withdrawn' }) });
      },
    });
    const user = userEvent.setup();
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-detail')).textContent).toBe(
      'Semnat electronic pe 2 oct. 2026.'
    );
    expect(within(card).getByTestId('signing-agreement-download')).toBeTruthy();
    await user.click(within(card).getByTestId('signing-agreement-withdraw'));
    const dialog = await screen.findByTestId('signing-agreement-change-dialog');
    expect(dialog.textContent).toContain(
      'Actul adițional semnat electronic și semnăturile de până acum rămân la dosar.'
    );
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
    await user.click(within(dialog).getByTestId('signing-agreement-change-confirm'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'withdrawn' },
      ])
    );
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe(
        'Revenire la semnarea olografă'
      )
    );
    expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe(
      'Salariatul a revenit la semnarea olografă. Actul adițional, semnat pe 2 oct. 2026, rămâne la dosar.'
    );
    expect(within(card).queryByTestId('signing-agreement-withdraw')).toBeNull();
  });

  it("copies the contract clause with the provider's name and records a clause in the contract", async () => {
    let inContract = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: inContract
            ? electronic({
                state: 'in_contract',
                signedAt: null,
                employeeSignedAt: null,
                employerSignedAt: null,
              })
            : null,
        }),
      'GET /organization/company-details': () =>
        Response.json({ companyDetails: { legalName: 'PREVENȚIA PLUS SRL' } }),
      [`PUT ${agreementPath}/state`]: () => {
        inContract = true;
        return Response.json({ agreement: null });
      },
    });
    const user = userEvent.setup();
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-clause'));
    const clause = await screen.findByTestId('signing-agreement-clause-dialog');
    await waitFor(() =>
      expect(within(clause).getByTestId('signing-agreement-clause-text').textContent).toContain(
        'în platforma informatică pusă la dispoziție de PREVENȚIA PLUS SRL'
      )
    );
    await user.click(within(clause).getByTestId('signing-agreement-clause-copy'));
    expect(await navigator.clipboard.readText()).toContain('PREVENȚIA PLUS SRL');
    await user.keyboard('{Escape}');

    await user.click(within(card).getByTestId('signing-agreement-in-contract'));
    const dialog = await screen.findByTestId('signing-agreement-change-dialog');
    await user.click(within(dialog).getByTestId('signing-agreement-change-confirm'));
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe(
        'Clauza este în contractul de muncă.'
      )
    );
    expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
      { state: 'in_contract' },
    ]);
    expect(within(card).queryByTestId('signing-agreement-download')).toBeNull();
    expect(within(card).getByTestId('signing-agreement-withdraw')).toBeTruthy();
  });

  it('warns while annex 13 of the internal regulation is not issued', async () => {
    mockApi({
      [`GET /clients/${clientId}/documents`]: () =>
        Response.json({ items: [], notApplicable: [], lastGeneration: null }),
    });
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-annex')).textContent).toContain(
      'Anexa 13 la regulamentul intern nu este emisă.'
    );
  });

  it('does not warn about the annex for a client the annex does not apply to', async () => {
    mockApi({
      [`GET /clients/${clientId}/documents`]: () =>
        Response.json({
          items: [],
          notApplicable: ['signing_regulation_annex'],
          lastGeneration: null,
        }),
    });
    mount(employeePath);
    const card = await screen.findByTestId('signing-agreement-card');
    await within(card).findByTestId('signing-agreement-state');
    await waitFor(() => expect(requests('GET', `/clients/${clientId}/documents`)).toHaveLength(1));
    expect(within(card).queryByTestId('signing-agreement-annex')).toBeNull();
  });
});

describe('signing from the Semnături place', () => {
  const firstId = '22222222-3333-4444-8555-666666666666';
  const secondId = '44444444-5555-4666-8777-888888888888';
  const sessionId = '55555555-6666-4777-8888-999999999999';
  const sessionPath = '/me/signing-sessions';
  const signPath = `${sessionPath}/${sessionId}/sign`;
  const pending = [request(), request({ id: secondId, slot: 'verifier' })];
  const session = () =>
    Response.json(
      {
        sessionId,
        channel: 'email',
        addressHint: 'r***@example.test',
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        items: pending.map((item) => ({ kind: 'request', requestId: item.id })),
      },
      { status: 201 }
    );

  async function openSigning(routes: Partial<Record<string, Handler>>) {
    mockApi({ 'GET /me/signature-requests': () => Response.json({ items: pending }), ...routes });
    const user = userEvent.setup();
    mount('/signatures');
    await user.click(await screen.findByTestId('signature-requests-client-select'));
    await user.click(screen.getByTestId('signature-requests-sign'));
    return { user, dialog: await screen.findByTestId('signing-dialog') };
  }

  async function askForCode(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByTestId('signing-send'));
    return within(dialog).findByTestId('signing-code');
  }

  it('lists the batch, sends a code, signs with it and shows what was signed and what failed', async () => {
    let listed = pending;
    const { user, dialog } = await openSigning({
      'GET /me/signature-requests': () => Response.json({ items: listed }),
      [`POST ${sessionPath}`]: session,
      [`POST ${signPath}`]: () => {
        listed = [pending[1]!];
        return Response.json({
          signed: [{ requestId: firstId, agreementState: null }],
          failed: [{ requestId: secondId, reason: 'missing_sheet_data' }],
          agreements: [],
        });
      },
    });
    expect(within(dialog).getByRole('heading').textContent).toBe('Semnezi 2 instruiri');
    expect(
      within(dialog)
        .getAllByTestId('signing-item')
        .map((item) => item.textContent)
    ).toEqual([
      'Popescu IonSSMAct adițional nesemnatPeriodică · 14 oct. 2026 · semnezi ca instructorVELOCE CAFE SRL',
      'Popescu IonSSMAct adițional nesemnatPeriodică · 14 oct. 2026 · semnezi ca verificatorVELOCE CAFE SRL',
    ]);

    const code = await askForCode(user, dialog);
    expect(requests('POST', sessionPath).map((call) => call.body)).toEqual([
      { requestIds: [firstId, secondId] },
    ]);
    expect(within(dialog).getByTestId('signing-address').textContent).toContain(
      'Am trimis un cod la r***@example.test. Cu el semnezi 2 instruiri.'
    );
    await user.click(within(dialog).getByTestId('signing-submit'));
    expect(within(dialog).getByRole('alert').textContent).toBe('Scrie codul de 6 cifre primit.');
    expect(requests('POST', signPath)).toHaveLength(0);

    await user.type(code, '12a3456');
    expect((code as HTMLInputElement).value).toBe('123456');
    await user.click(within(dialog).getByTestId('signing-submit'));
    expect((await within(dialog).findByTestId('signing-result-summary')).textContent).toBe(
      'Ai semnat 1 din 2 instruiri. Celelalte rămân în listă.'
    );
    expect(requests('POST', signPath).map((call) => call.body)).toEqual([{ code: '123456' }]);
    expect(within(dialog).getAllByTestId('signing-signed')).toHaveLength(1);
    const failed = within(dialog).getByTestId('signing-failed');
    expect(failed.textContent).toContain('semnezi ca verificator');
    expect(within(failed).getByTestId('signing-failed-reason').textContent).toBe(
      'Fișa angajatului nu are toate datele (locul de muncă, traseul). Completează-le, apoi semnează din nou.'
    );

    await user.click(within(dialog).getByTestId('signing-close'));
    await waitFor(() => expect(screen.queryByTestId('signing-dialog')).toBeNull());
    await waitFor(() => expect(screen.getAllByTestId('signature-request')).toHaveLength(1));
  });

  it('counts the attempts left on a wrong code, then asks for a new code and starts over', async () => {
    let attemptsLeft = 3;
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: session,
      [`POST ${signPath}`]: () => {
        attemptsLeft -= 1;
        return Response.json(
          { error: 'conflict', message: 'Wrong code.', reason: 'code_invalid', attemptsLeft },
          { status: 409 }
        );
      },
    });
    await askForCode(user, dialog);
    const attempt = async () => {
      await user.type(within(dialog).getByTestId('signing-code'), '000000');
      await user.click(within(dialog).getByTestId('signing-submit'));
    };
    await attempt();
    expect((await within(dialog).findByTestId('signing-code-error')).textContent).toBe(
      'Codul nu este corect. Mai ai 2 încercări.'
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByTestId('signing-code'))
    );
    await attempt();
    await waitFor(() =>
      expect(within(dialog).getByTestId('signing-code-error').textContent).toBe(
        'Codul nu este corect. Mai ai o singură încercare.'
      )
    );
    await attempt();
    expect((await within(dialog).findByTestId('signing-renewal')).textContent).toContain(
      'Codul a fost greșit de prea multe ori. Cere un cod nou.'
    );
    expect(within(dialog).queryByTestId('signing-code')).toBeNull();
    expect(within(dialog).queryByTestId('signing-submit')).toBeNull();

    await user.click(within(dialog).getByTestId('signing-renew'));
    const code = await within(dialog).findByTestId('signing-code');
    expect((code as HTMLInputElement).value).toBe('');
    expect(within(dialog).queryByTestId('signing-code-error')).toBeNull();
    expect(requests('POST', sessionPath)).toHaveLength(2);
  });

  it.each([
    ['code_expired', 'Codul a expirat. Cere un cod nou.'],
    ['code_already_used', 'Codul a fost folosit deja. Cere un cod nou.'],
    ['code_attempts_exceeded', 'Codul a fost greșit de prea multe ori. Cere un cod nou.'],
  ])('asks for a new code after %s', async (reason, message) => {
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: session,
      [`POST ${signPath}`]: () => conflict(reason),
    });
    await user.type(await askForCode(user, dialog), '123456');
    await user.click(within(dialog).getByTestId('signing-submit'));
    expect((await within(dialog).findByTestId('signing-renewal')).textContent).toContain(message);
  });

  it('says how long to wait when a new code is asked for within the minute', async () => {
    let sent = 0;
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: () =>
        sent++ === 0
          ? session()
          : Response.json(
              {
                error: 'conflict',
                message: 'Too soon.',
                reason: 'code_rate_limited',
                retryAfterSeconds: 42,
              },
              { status: 409 }
            ),
    });
    await askForCode(user, dialog);
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByTestId('signing-code'))
    );
    await user.click(within(dialog).getByTestId('signing-resend'));
    expect((await within(dialog).findByTestId('signing-error')).textContent).toBe(
      'Ți-am trimis un cod acum mai puțin de un minut. Poți cere altul peste 42 de secunde.'
    );
  });

  it('keeps every digit of a pasted code', async () => {
    const { user, dialog } = await openSigning({ [`POST ${sessionPath}`]: session });
    const code = await askForCode(user, dialog);
    await user.click(code);
    await user.paste(' 123 456');
    expect((code as HTMLInputElement).value).toBe('123456');
  });

  it.each([
    [
      'code_rate_limited',
      409,
      'Ți-am trimis un cod acum mai puțin de un minut. Așteaptă puțin, apoi cere altul.',
    ],
    [
      'too_many_items',
      400,
      'Cu un cod semnezi cel mult 30 de instruiri. Alege mai puține și încearcă din nou.',
    ],
    [
      'signing_unavailable',
      503,
      'Semnarea nu este disponibilă acum. Nu s-a semnat nimic; încearcă mai târziu.',
    ],
    [
      'signing_code_not_sent',
      503,
      'Codul nu a putut fi trimis. Nu s-a semnat nimic; încearcă din nou.',
    ],
    [
      'signing_item_not_found',
      404,
      'O instruire din listă nu mai așteaptă semnătura ta: a fost semnată, anulată sau modificată între timp. Închide și alege din nou.',
    ],
  ])('words a refused code request, %s', async (reason, status, message) => {
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: () =>
        Response.json({ error: 'refused', message: reason, reason }, { status }),
    });
    await user.click(within(dialog).getByTestId('signing-send'));
    expect((await within(dialog).findByTestId('signing-send-error')).textContent).toBe(message);
    expect(within(dialog).queryByTestId('signing-code')).toBeNull();
  });

  it('refuses more than one code can sign', async () => {
    const many = Array.from({ length: 32 }, (_, index) =>
      request({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })
    );
    mockApi({ 'GET /me/signature-requests': () => Response.json({ items: many }) });
    const user = userEvent.setup();
    mount('/signatures');
    await user.click(await screen.findByTestId('signature-requests-client-select'));
    expect(screen.getByTestId('signature-requests-limit').textContent).toBe(
      'Ai ales 32 de instruiri. Cu un cod semnezi cel mult 30; debifează 2, iar pe celelalte le semnezi apoi cu alt cod.'
    );
    expect(screen.getByTestId('signature-requests-sign')).toHaveProperty('disabled', true);
    await user.click(screen.getAllByTestId('signature-request-select')[0]!);
    await user.click(screen.getAllByTestId('signature-request-select')[1]!);
    expect(screen.queryByTestId('signature-requests-limit')).toBeNull();
    expect(screen.getByTestId('signature-requests-sign')).toHaveProperty('disabled', false);
  });
});

describe('a saved training and its signers', () => {
  const detail = (signers: Record<string, string | null>) => () =>
    Response.json({
      training: {
        ...record().training,
        records: [
          {
            id: recordId,
            employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
            occupation: 'Sudor',
            admission: null,
          },
        ],
        signers,
      },
    });

  async function editTraining(signers: Record<string, string | null>) {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${trainingsPath}/${trainingId}`]: detail(signers),
    });
    const user = userEvent.setup();
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('record-signatures');
    await user.click(screen.getByTestId('training-record-edit'));
    return { user, dialog: await screen.findByTestId('training-dialog') };
  }

  const valueOf = (dialog: HTMLElement, testId: string) =>
    (within(dialog).getByTestId(testId) as HTMLSelectElement).value;

  it('starts from the signers the requests went to, not from the names', async () => {
    const { user, dialog } = await editTraining({
      trainer: memberId,
      verifier: null,
      admitter: null,
    });
    const trainer = await within(dialog).findByTestId('training-trainer-signer');
    await waitFor(() => expect(valueOf(dialog, 'training-trainer-signer')).toBe(memberId));
    expect(valueOf(dialog, 'training-verifier-signer')).toBe('');
    expect(within(dialog).getByTestId('training-trainer-signer-requested').textContent).toBe(
      'cerere trimisă'
    );
    expect(within(dialog).queryByTestId('training-verifier-signer-requested')).toBeNull();

    await user.selectOptions(trainer, managerAccountId);
    expect(within(dialog).queryByTestId('training-trainer-signer-requested')).toBeNull();
    expect(dialog.querySelector('#training-trainer-signer-hint')!.textContent).toBe(
      'La salvare, cererea trimisă se anulează și pleacă una nouă către persoana aleasă.'
    );
    await user.selectOptions(trainer, '');
    expect(dialog.querySelector('#training-trainer-signer-hint')!.textContent).toBe(
      'La salvare, cererea trimisă se anulează; rubrica se semnează de mână, pe fișa tipărită.'
    );
  });

  it('keeps every slot on paper when the saved training asked nobody', async () => {
    const { user, dialog } = await editTraining({ trainer: null, verifier: null, admitter: null });
    await within(dialog).findByTestId('training-trainer-signer');
    await waitFor(() =>
      expect(within(dialog).getByTestId('training-trainer-signer')).toHaveProperty(
        'disabled',
        false
      )
    );
    expect(valueOf(dialog, 'training-trainer-signer')).toBe('');
    expect(valueOf(dialog, 'training-verifier-signer')).toBe('');
    await user.click(within(dialog).getByTestId('training-save'));
    await waitFor(() => expect(requests('PUT', `${trainingsPath}/${trainingId}`)).toHaveLength(1));
    expect(requests('PUT', `${trainingsPath}/${trainingId}`)[0]!.body).toMatchObject({
      signers: { trainer: null, verifier: null },
    });
  });

  it('shows a requested signer who no longer has access instead of passing for paper', async () => {
    const { dialog } = await editTraining({
      trainer: '0e0e0e0e-0000-4000-8000-000000000000',
      verifier: null,
      admitter: null,
    });
    await waitFor(() =>
      expect(within(dialog).getByTestId('training-trainer-signer')).toHaveProperty(
        'disabled',
        false
      )
    );
    const trainer = within(dialog).getByTestId('training-trainer-signer') as HTMLSelectElement;
    expect(trainer.selectedOptions[0]!.textContent).toBe('Semnatar care nu mai are acces');
    expect(dialog.querySelector('#training-trainer-signer-hint')!.textContent).toBe(
      'Persoana căreia i s-a cerut semnătura nu mai are acces. Alege alt semnatar sau semnătura pe hârtie.'
    );
  });

  it('keeps delete closed once the record has a signature, voided ones included', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({
          recordId,
          hasSignatures: true,
          slots: [slot('trainee', 'void'), slot('trainer', 'void')],
        }),
    });
    mount(`${employeePath}/training/ssm`);
    await screen.findByTestId('record-signatures');
    await waitFor(() =>
      expect(screen.getByTestId('training-record-delete')).toHaveProperty('disabled', true)
    );
    expect(screen.getByTestId('training-record-edit')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('training-record-lock').textContent).toBe(
      'Instruirea are semnături, chiar anulate sau pe hârtie, care rămân în evidență, așa că nu se mai poate șterge.'
    );
  });
});
