import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClientDocumentListResponse,
  FileLinkResponse,
  WorkplaceListResponse,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { impersonationRefusedMessage } from '@/features/impersonation/refusal';
import { formatDate } from '@/lib/dates';
import { installFetchMock, mockApi as mockRoutes, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  dutiesNotIssued,
  employeeListItem,
  employeeRecord,
  jobPositionRecord,
  pageOf,
} from '@/test/records';
import { employeeTests } from '@/test/training-fixture';

import { printedTrainingMessage, signingFailure, signingSessionFailure } from './signature-format';
import { matchSigner } from './signer-match';
import { trainingLocks } from './use-record-signatures';

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
const employeesPage = `/clienti/${clientId}/angajati`;
const employeePath = `${employeesPath}/${employeeId}`;
const employeePage = `${employeesPage}/${employeeId}`;
const trainingsPath = `/clients/${clientId}/trainings`;
const signaturesPath = `/clients/${clientId}/training-records/${recordId}/signatures`;
const agreementPath = `${employeePath}/signing-agreement`;

const sampleClient = clientRecord({ legalRepresentativeName: 'Maria Pop' });

const employeeFields = {
  id: employeeId,
  lastName: 'Popescu',
  firstName: 'Ion',
  email: 'ion.popescu@example.com',
  jobTitle: 'Sudor',
  jobPosition: { id: welderId, name: 'Sudor', archived: false },
  hiredAt: '2020-03-01',
  workplace: null,
};

const employee = employeeRecord(employeeFields);

const position = jobPositionRecord({
  id: welderId,
  name: 'Sudor',
  employeeCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

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
  attendeeCount: 1,
  signature: 'pending',
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
  printed: false,
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
  kind: 'training_record',
  label: 'Instruire periodică SSM · 14.10.2026',
  slot: 'trainer',
  state: 'pending',
  issuedAt: '2026-10-15T09:00:00.000Z',
  notifiedAt: '2026-10-15T09:00:05.000Z',
  client: { id: clientId, name: 'VELOCE CAFE SRL' },
  employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
  record: {
    id: recordId,
    trainingId,
    employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
    domain: 'ssm',
    phase: 'periodic',
    heldOn: '2026-10-14',
  },
  testSheet: null,
  signer: { accountId: memberId, name: 'Dan MARIN' },
  agreement: null,
  ...overrides,
});

const testSheetRequest = (overrides: Record<string, unknown> = {}) =>
  request({
    id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    kind: 'test_sheet',
    label: 'Fișa de test · Test anual SU · 15.10.2026',
    slot: 'examiner',
    record: null,
    testSheet: {
      id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
      resultId: '88888888-9999-4aaa-8bbb-cccccccccccc',
      domain: 'su',
      test: 'annual',
      takenOn: '2026-10-15',
    },
    ...overrides,
  });

const traineeTwoId = '9b8a7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6e';
const sheetId = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';

const worker = (
  id: string,
  lastName: string,
  firstName: string,
  requests: { id: string; slot: string }[],
  agreement: unknown = null
) => ({ employee: { id, lastName, firstName }, agreement, requests });

const signatureRow = (overrides: Record<string, unknown> = {}) => ({
  id: trainingId,
  kind: 'training',
  client: { id: clientId, name: 'VELOCE CAFE SRL' },
  domain: 'ssm',
  phase: 'periodic',
  test: null,
  day: '2026-10-14',
  slots: ['trainer', 'verifier'],
  issuedAt: '2026-10-15T09:00:00.000Z',
  signatures: 2,
  workers: [
    worker(employeeId, 'Popescu', 'Ion', [
      { id: '22222222-3333-4444-8555-666666666666', slot: 'trainer' },
      { id: '44444444-5555-4666-8777-888888888888', slot: 'verifier' },
    ]),
  ],
  ...overrides,
});

const sheetRow = (overrides: Record<string, unknown> = {}) =>
  signatureRow({
    id: sheetId,
    kind: 'test_sheet',
    phase: null,
    test: 'annual',
    domain: 'su',
    day: '2026-10-15',
    slots: ['examiner'],
    signatures: 1,
    workers: [
      worker(
        employeeId,
        'Popescu',
        'Ion',
        [{ id: '66666666-7777-4888-8999-aaaaaaaaaaaa', slot: 'examiner' }],
        { state: 'signed_on_paper', employeeSignedAt: null, employerSignedAt: null }
      ),
    ],
    ...overrides,
  });

function signaturePage(items: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  const signatures = items.reduce((sum, item) => sum + (item.signatures as number), 0);
  return Response.json({
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    unfilteredTotal: items.length,
    signatures,
    unfilteredSignatures: signatures,
    ...overrides,
  });
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const saved: string[] = [];

function mockApi(routes: Partial<Record<string, Handler>> = {}) {
  mockRoutes((init, url) => {
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(url, init);
    switch (key) {
      case `GET /clients/${clientId}`:
        return Response.json({ client: sampleClient });
      case `GET ${employeesPath}`:
        return Response.json(pageOf([employeeListItem(employeeFields)], { pageSize: 100 }));
      case `GET ${employeePath}`:
        return Response.json({ employee });
      case `GET ${employeePath}/training-records`:
        return Response.json({ items: [] });
      case `GET ${employeePath}/tests`:
        return Response.json(employeeTests());
      case `GET ${employeePath}/training-sheets`:
        return Response.json({
          ssm: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
          su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
        });
      case `GET ${employeePath}/duties-acknowledgement`:
        return Response.json(dutiesNotIssued);
      case `GET ${employeePath}/participant`:
        return Response.json({ participant: null, invitation: null });
      case `GET ${agreementPath}/state`:
        return Response.json({ agreement: null, unavailable: null });
      case `GET ${agreementPath}/link`:
        return Response.json({
          url: 'http://127.0.0.1:54321/storage/v1/object/sign/documents/agreement',
          fileName: 'Act-aditional-semnare-electronica-Popescu-Ion.pdf',
          expiresInSeconds: 600,
        } satisfies FileLinkResponse);
      case `GET /clients/${clientId}/documents`:
        return Response.json({
          items: [],
          lastGeneration: null,
          notApplicable: [],
          currentEmployeeCount: 1,
        } satisfies ClientDocumentListResponse);
      case `GET /clients/${clientId}/workplaces`:
        return Response.json({
          items: [],
          unassignedEmployeeCount: 1,
        } satisfies WorkplaceListResponse);
      case `GET /clients/${clientId}/job-positions`:
        return Response.json({ items: [position] });
      case `GET /clients/${clientId}/signer-candidates`:
        return Response.json({ items: candidates });
      case `GET /clients/${clientId}/signature-requests`:
        return Response.json({ items: [] });
      case `GET /clients/${clientId}/participants`:
        return Response.json({ participants: [], invitations: [] });
      case `GET /clients/${clientId}/files`:
        return Response.json({ items: [] });
      case `GET ${trainingsPath}`:
        return Response.json({ items: [], page: 1, pageSize: 25, total: 0, unfilteredTotal: 0 });
      case `GET ${trainingsPath}/proposal`:
        return Response.json(proposal);
      case `POST ${trainingsPath}`:
        return Response.json({ training: {} }, { status: 201 });
      case `GET ${signaturesPath}`:
        return Response.json({ recordId, slots: [] });
      case 'GET /me/signatures':
        return signaturePage([]);
      case 'GET /clients':
        return Response.json({ ...pageOf([sampleClient], { pageSize: 100 }), unfilteredTotal: 1 });
    }
  });
}

const requests = (method: string, pathname: string) =>
  requestsTo(pathname, method).map(([input, init]) => ({
    url: new URL(String(input)),
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
  }));

const conflict = (reason: string) =>
  Response.json({ error: 'conflict', message: reason, reason }, { status: 409 });

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

async function openRecordRow() {
  await userEvent.setup().click(await screen.findByTestId('training-record-open'));
  return screen.findByTestId('record-signatures');
}

async function recordMenuItem(testId: string) {
  if (!screen.queryByTestId(testId)) {
    await userEvent.setup().click(await screen.findByTestId('training-record-row-menu'));
  }
  return screen.findByTestId(testId);
}

const menuDisabled = async (testId: string) =>
  (await recordMenuItem(testId)).hasAttribute('data-disabled');

afterEach(() => {
  vi.restoreAllMocks();
});

installFetchMock();

beforeEach(() => {
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

describe('a signing refused while acting as a member', () => {
  it('says so, both when the code is asked for and when it is used', () => {
    const refused = new ApiHttpError(403, { reason: 'impersonation_refused' });
    expect(signingSessionFailure(refused)).toBe(impersonationRefusedMessage);
    expect(signingFailure(refused, 'Nu am putut semna.')).toBe(impersonationRefusedMessage);
  });
});

describe('signers on the training flow', () => {
  async function openWorkplaceTraining(domain: 'ssm' | 'su' = 'ssm') {
    const user = userEvent.setup();
    mount(`${employeePage}/instruire/${domain}`);
    await screen.findByTestId('training-records-empty');
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
    const { user, dialog } = await openWorkplaceTraining('su');
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

  it.each([
    { slot: 'verifier', status: 422, error: 'unprocessable' },
    { slot: 'trainer', status: 400, error: 'validation_error' },
  ])("puts the API's name mismatch under the picker, %o", async ({ slot, status, error }) => {
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        Response.json(
          {
            error,
            message: 'The signer is not the person the slot names.',
            reason: 'signer_name_mismatch',
            issues: [{ path: `signers.${slot}`, message: "The account's name is not Dan Marin." }],
          },
          { status }
        ),
    });
    const { user, dialog } = await openWorkplaceTraining();
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    expect((await within(dialog).findByTestId(`training-${slot}-signer-error`)).textContent).toBe(
      'Contul ales nu poartă numele tipărit în rubrică. Alege persoana cu acest nume sau folosește numele semnatarului.'
    );
    expect(within(dialog).queryByText(/Dan Marin|slot names/)).toBeNull();
    expect(within(dialog).queryByTestId('training-error')).toBeNull();
  });

  it('asks nobody for a training typed from a paper sheet', async () => {
    mockApi();
    const { user, dialog } = await openWorkplaceTraining();
    await user.click(within(dialog).getByTestId('training-source'));
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
    mount(`${employeePage}/instruire/ssm`);
    const block = await openRecordRow();
    const slots = within(block).getAllByTestId('signature-slot');
    expect(slots.map((item) => item.textContent)).toEqual([
      'InstruitDe semnatPopescu Ion',
      'InstructorSemnat electronicMaria Pop · 2 sept. 2026',
      'VerificatorFără semnatar',
    ]);
    expect(await menuDisabled('training-record-edit')).toBe(true);
    expect(await menuDisabled('training-record-delete')).toBe(true);
    expect((await recordMenuItem('training-record-lock')).textContent).toBe(
      trainingLocks({ signed: true, hasSignatures: true, printed: false }).edit
    );
  });

  it.each([
    { signed: true, hasSignatures: true },
    { signed: false, hasSignatures: true },
  ])(
    "locks a record by its training's signing state from other attendees' records, %o",
    async (signing) => {
      mockApi({
        [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record(signing)] }),
        [`GET ${signaturesPath}`]: () => Response.json({ recordId, slots: [pendingTrainee] }),
      });
      mount(`${employeePage}/instruire/ssm`);
      await openRecordRow();
      expect(await menuDisabled('training-record-edit')).toBe(signing.signed);
      expect(await menuDisabled('training-record-delete')).toBe(true);
      expect((await recordMenuItem('training-record-lock')).textContent).toBe(
        trainingLocks({ ...signing, printed: false }).delete
      );
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
    mount(`${employeePage}/instruire/ssm`);
    const block = await openRecordRow();
    expect(
      within(block)
        .getAllByTestId('signature-slot')
        .map((item) => item.textContent)
    ).toEqual([
      'InstruitAnulatMotiv: salariatul a revenit la semnarea de mână',
      'InstructorAnulatMotiv: instruirea a fost modificată',
      'VerificatorAnulatMotiv: Data greșită',
    ]);
  });

  it('stays open while a slot is marked on paper, and words a refusal', async () => {
    let refuse: (response: Response) => void = () => undefined;
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () =>
        Response.json({ recordId, slots: [pendingTrainee, slot('verifier', 'unassigned')] }),
      [`POST ${signaturesPath}/paper`]: () =>
        new Promise<Response>((resolve) => {
          refuse = resolve;
        }),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    await user.click(await screen.findByTestId('record-signatures-paper'));
    const dialog = await screen.findByTestId('paper-signature-dialog');
    await user.click(within(dialog).getByTestId('paper-signature-submit'));
    await waitFor(() => expect(requests('POST', `${signaturesPath}/paper`)).toHaveLength(1));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('paper-signature-dialog')).toBe(dialog);
    refuse(conflict('client_archived'));
    expect((await within(dialog).findByTestId('paper-signature-error')).textContent).toBe(
      'Clientul este arhivat; semnăturile lui nu se mai schimbă.'
    );
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
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    expect(await menuDisabled('training-record-edit')).toBe(false);
    await user.keyboard('{Escape}');
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
    expect(await menuDisabled('training-record-delete')).toBe(true);
    expect(await menuDisabled('training-record-edit')).toBe(false);
  });

  it('asks for a reason before voiding, stays open while voiding, and words a refusal', async () => {
    let refuse: (response: Response) => void = () => undefined;
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [record()] }),
      [`GET ${signaturesPath}`]: () => Response.json({ recordId, slots: [pendingTrainee] }),
      [`POST ${signaturesPath}/void`]: () =>
        new Promise<Response>((resolve) => {
          refuse = resolve;
        }),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    await user.click(await screen.findByTestId('record-signatures-void'));
    const dialog = await screen.findByTestId('void-signatures-dialog');
    await user.click(within(dialog).getByTestId('void-signatures-confirm'));
    expect(within(dialog).getByRole('alert').textContent).toBe('Scrie motivul anulării.');
    expect(requests('POST', `${signaturesPath}/void`)).toHaveLength(0);

    await user.type(within(dialog).getByTestId('void-signatures-reason'), 'Durata greșită');
    await user.click(within(dialog).getByTestId('void-signatures-confirm'));
    await waitFor(() => expect(requests('POST', `${signaturesPath}/void`)).toHaveLength(1));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('void-signatures-dialog')).toBe(dialog);
    refuse(conflict('client_archived'));
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
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
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
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    await user.click(await recordMenuItem('training-record-delete'));
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
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    await user.click(await recordMenuItem('training-record-edit'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.click(await within(dialog).findByTestId('training-save'));
    expect((await within(dialog).findByTestId('training-error')).textContent).toBe(
      'Instruirea are semnături electronice și nu se mai poate modifica. Anulează semnăturile, apoi modifică instruirea.'
    );
  });

  it('locks a training from paper once a certified signed sheet prints it', async () => {
    const paper = record({ hasSignatures: true, printed: true });
    paper.training.source = 'paper';
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [paper] }),
    });
    mount(`${employeePage}/instruire/ssm`);
    await screen.findByTestId('training-record-item');
    expect(await menuDisabled('training-record-edit')).toBe(true);
    expect(await menuDisabled('training-record-delete')).toBe(true);
    expect((await recordMenuItem('training-record-lock')).textContent).toBe(printedTrainingMessage);
  });

  it('says a training from paper cannot change once a certified signed sheet prints it', async () => {
    const paper = record();
    paper.training.source = 'paper';
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [paper] }),
      [`GET ${trainingsPath}/${trainingId}`]: () =>
        Response.json({
          training: {
            ...paper.training,
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
    mount(`${employeePage}/instruire/ssm`);
    await screen.findByTestId('training-record-item');
    await user.click(await recordMenuItem('training-record-edit'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.click(await within(dialog).findByTestId('training-save'));
    expect((await within(dialog).findByTestId('training-error')).textContent).toBe(
      printedTrainingMessage
    );
  });

  it('leaves out the slots of a training typed from a paper sheet', async () => {
    const paper = record();
    paper.training.source = 'paper';
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [paper] }),
    });
    mount(`${employeePage}/instruire/ssm`);
    await screen.findByTestId('training-record-item');
    expect(screen.queryByTestId('record-signatures')).toBeNull();
    expect(requests('GET', signaturesPath)).toHaveLength(0);
  });
});

describe('the Semnături place', () => {
  it('lists a row per training or test sheet with what I sign on it, oldest request first', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-15T10:00:00') });
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([
          signatureRow(),
          signatureRow({
            id: '0a0a0a0a-0000-4000-8000-000000000001',
            client: { id: otherClientId, name: 'ATELIER NORD SRL' },
            phase: 'workplace',
            slots: ['verifier'],
            signatures: 2,
            issuedAt: '2026-11-14T09:00:00.000Z',
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [
                { id: '0b0b0b0b-0000-4000-8000-000000000001', slot: 'verifier' },
              ]),
              worker(
                traineeTwoId,
                'Ionescu',
                'Ana',
                [{ id: '0b0b0b0b-0000-4000-8000-000000000002', slot: 'verifier' }],
                { state: 'signed_on_paper', employeeSignedAt: null, employerSignedAt: null }
              ),
            ],
          }),
          sheetRow({ issuedAt: '2026-11-15T08:00:00.000Z' }),
        ]),
    });
    mount('/semnaturi');
    expect((await screen.findByTestId('nav-signatures')).textContent).toBe('Semnături');
    const rows = await screen.findAllByTestId('signatures-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      '14 oct. 2026PeriodicăSSMVELOCE CAFE SRLInstructor și verificatorPopescu Ion2 semnăturiAct adițional nesemnat31 de ziledin 15 oct. 2026',
      '14 oct. 2026La locul de muncăSSMATELIER NORD SRLVerificator2 lucrători1 fără act adițional semnato zidin 14 nov. 2026',
      '15 oct. 2026Test anualSU · fișa de testVELOCE CAFE SRLExaminatorPopescu Ionde azidin 15 nov. 2026',
    ]);
    expect(within(rows[0]!).queryByTestId('signatures-open')).toBeNull();
    expect(within(rows[1]!).getByTestId('signatures-open')).toBeTruthy();
    expect(within(rows[0]!).getByTestId('signatures-select').getAttribute('aria-label')).toBe(
      'Alege instruirea periodică SSM din 14 oct. 2026, VELOCE CAFE SRL'
    );
    expect(within(rows[2]!).getByRole('link', { name: 'Popescu Ion' }).getAttribute('href')).toBe(
      `/clienti/${clientId}/angajati/${employeeId}/instruire/su`
    );
    expect(within(rows[1]!).getByTestId('signatures-client').getAttribute('href')).toBe(
      `/clienti/${otherClientId}/instruiri-tinute`
    );
    expect(screen.getByTestId('signatures-count').textContent).toBe('5 semnături');
    expect(requests('GET', '/me/signatures')[0]!.url.searchParams.get('sort')).toBe('issuedAt');
    vi.useRealTimers();
  });

  it('chooses a whole row, or the workers of an open row, and counts signatures', async () => {
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([
          signatureRow({
            signatures: 4,
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [
                { id: '0c0c0c0c-0000-4000-8000-000000000001', slot: 'trainer' },
                { id: '0c0c0c0c-0000-4000-8000-000000000002', slot: 'verifier' },
              ]),
              worker(traineeTwoId, 'Ionescu', 'Ana', [
                { id: '0c0c0c0c-0000-4000-8000-000000000003', slot: 'trainer' },
                { id: '0c0c0c0c-0000-4000-8000-000000000004', slot: 'verifier' },
              ]),
            ],
          }),
        ]),
    });
    const user = userEvent.setup();
    mount('/semnaturi');
    const [row] = await screen.findAllByTestId('signatures-row');
    expect(screen.queryByTestId('signatures-selection')).toBeNull();
    await user.click(within(row!).getByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-selection').textContent).toContain(
      '4 semnături alese dintr-un rând'
    );
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (4)');
    expect(screen.queryByTestId('signatures-search')).toBeNull();

    await user.click(within(row!).getByTestId('signatures-open'));
    expect(screen.getByTestId('signatures-row-workers').querySelector('h3')!.textContent).toBe(
      'Semnezi ca instructor și verificator pe fișele a 2 lucrători · 2 alese'
    );
    const [, ionescu] = screen.getAllByTestId('signatures-worker-select');
    expect(ionescu!.getAttribute('aria-label')).toBe('Alege instruirea lui Ionescu Ana');
    await user.click(ionescu!);
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (2)');
    expect(within(row!).getByTestId('signatures-select').getAttribute('aria-checked')).toBe(
      'mixed'
    );
    await user.click(screen.getByTestId('signatures-clear-selection'));
    expect(screen.queryByTestId('signatures-selection')).toBeNull();
    expect(screen.getByTestId('signatures-search')).toBeTruthy();
  });

  it('keeps what was chosen across pages and signs it together', async () => {
    const second = signatureRow({
      id: '0d0d0d0d-0000-4000-8000-000000000001',
      phase: 'workplace',
      slots: ['verifier'],
      signatures: 1,
      workers: [
        worker(employeeId, 'Popescu', 'Ion', [
          { id: '0d0d0d0d-0000-4000-8000-000000000002', slot: 'verifier' },
        ]),
      ],
    });
    mockApi({
      'GET /me/signatures': (url) =>
        url.searchParams.get('page') === '2'
          ? signaturePage([second], { page: 2, total: 26, unfilteredTotal: 26 })
          : signaturePage([signatureRow()], { total: 26, unfilteredTotal: 26 }),
    });
    const user = userEvent.setup();
    const runtime = mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select'));
    await user.click(screen.getByRole('button', { name: /Următoarea/ }));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ page: 2 }));
    await waitFor(() =>
      expect(screen.getByTestId('signatures-row').textContent).toContain('La locul de muncă')
    );
    expect(screen.getByTestId('signatures-select').getAttribute('aria-checked')).toBe('false');
    await user.click(screen.getByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-selection').textContent).toContain(
      '3 semnături alese din 2 rânduri'
    );
    await user.click(screen.getByTestId('signatures-sign'));
    const dialog = await screen.findByTestId('signing-dialog');
    expect(within(dialog).getAllByTestId('signing-item')).toHaveLength(3);
  });

  it('forgets what was chosen when the search changes', async () => {
    mockApi({ 'GET /me/signatures': () => signaturePage([signatureRow()]) });
    const user = userEvent.setup();
    const runtime = mount('/semnaturi?q=popescu');
    await user.click(await screen.findByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-selection')).toBeTruthy();
    await runtime.router.navigate({ to: '/semnaturi', search: { q: 'ion' } });
    await waitFor(() => expect(screen.queryByTestId('signatures-selection')).toBeNull());
  });

  it('forgets what was chosen when a filter changes, and does not bring it back with the filter', async () => {
    mockApi({ 'GET /me/signatures': () => signaturePage([signatureRow()]) });
    const user = userEvent.setup();
    const runtime = mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-selection')).toBeTruthy();
    await runtime.router.navigate({ to: '/semnaturi', search: { domain: ['ssm'] } });
    await waitFor(() => expect(screen.queryByTestId('signatures-selection')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Scoate filtrul Domeniu' }));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(screen.queryByTestId('signatures-selection')).toBeNull();
    expect(screen.getByTestId('signatures-select').getAttribute('aria-checked')).toBe('false');
  });

  it('names every slot the member holds, the admission included', async () => {
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([
          signatureRow({
            phase: 'workplace',
            slots: ['verifier', 'admitter'],
            signatures: 3,
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [
                { id: '0f0f0f0f-0000-4000-8000-000000000001', slot: 'verifier' },
                { id: '0f0f0f0f-0000-4000-8000-000000000002', slot: 'admitter' },
              ]),
              worker(traineeTwoId, 'Ionescu', 'Ana', [
                { id: '0f0f0f0f-0000-4000-8000-000000000003', slot: 'verifier' },
              ]),
            ],
          }),
          signatureRow({
            id: '0f0f0f0f-0000-4000-8000-000000000010',
            phase: 'workplace',
            slots: ['admitter'],
            signatures: 1,
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [
                { id: '0f0f0f0f-0000-4000-8000-000000000011', slot: 'admitter' },
              ]),
            ],
          }),
        ]),
    });
    const user = userEvent.setup();
    mount('/semnaturi');
    const rows = await screen.findAllByTestId('signatures-row');
    expect(rows.map((row) => within(row).getByTestId('signatures-sign-as').textContent)).toEqual([
      'Verificator și admite la lucru',
      'Admite la lucru',
    ]);
    await user.click(within(rows[0]!).getByTestId('signatures-open'));
    expect(screen.getByTestId('signatures-row-workers').querySelector('h3')!.textContent).toBe(
      'Semnezi ca verificator și la „Admite la lucru” pe fișele a 2 lucrători'
    );
  });

  it('keeps the sort, the filters and the search in the address and asks the API for them', async () => {
    mockApi({
      'GET /me/signatures': () => signaturePage([signatureRow()], { unfilteredSignatures: 12 }),
    });
    const user = userEvent.setup();
    const runtime = mount(`/semnaturi?client=${clientId}&kind=periodic&kind=test&q=popescu`);
    await screen.findAllByTestId('signatures-row');
    await waitFor(() =>
      expect(screen.getByTestId('signatures-count').textContent).toBe('2 din 12 semnături')
    );
    const asked = requests('GET', '/me/signatures').at(-1)!.url.searchParams;
    expect(asked.getAll('client')).toEqual([clientId]);
    expect(asked.getAll('kind')).toEqual(['periodic', 'test']);
    expect(asked.get('q')).toBe('popescu');
    await user.click(screen.getByTestId('sort-day'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toMatchObject({ sort: 'day' })
    );
    expect(runtime.router.state.location.searchStr).toContain('kind=periodic&kind=test');
  });

  it('says when nothing matches the filters, and clears them', async () => {
    mockApi({
      'GET /me/signatures': (url) =>
        url.searchParams.has('kind')
          ? signaturePage([], { unfilteredTotal: 3, unfilteredSignatures: 7 })
          : signaturePage([signatureRow()]),
    });
    const user = userEvent.setup();
    const runtime = mount('/semnaturi?kind=test');
    const empty = await screen.findByTestId('signatures-empty-filtered');
    expect(empty.textContent).toContain('Nimic de semnat nu se potrivește');
    expect(screen.getByTestId('signatures-count').textContent).toBe('0 din 7 semnături');
    await user.click(screen.getByTestId('signatures-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findByTestId('signatures-row')).toBeTruthy();
  });

  it('says when there is nothing to sign', async () => {
    mockApi();
    mount('/semnaturi');
    const empty = await screen.findByTestId('signatures-empty');
    expect(empty.textContent).toContain('Nu ai nimic de semnat');
    expect(empty.textContent).toContain('o instruire sau o fișă de test');
    expect(screen.queryByTestId('signatures-search')).toBeNull();
    expect(screen.queryByTestId('signatures-select-page')).toBeNull();
  });
});

describe("the client's pending signatures", () => {
  it('lists who has not signed as a table sorted by worker, warning of an unsigned agreement', async () => {
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
              employee: ana,
              record: { ...request().record, employee: ana },
              signer: { accountId: managerAccountId, name: 'Ionescu Ana' },
              agreement: {
                state: 'signed_on_paper',
                employeeSignedAt: null,
                employerSignedAt: null,
              },
            }),
          ],
        });
      },
    });
    const user = userEvent.setup();
    mount(`/clienti/${clientId}/portal`);
    const card = await screen.findByTestId('client-signature-requests');
    const rows = await within(card).findAllByTestId('client-signature-request');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe(
      '3 semnături în așteptare'
    );
    const names = () =>
      within(card)
        .getAllByTestId('client-signature-request-employee')
        .map((link) => link.textContent);
    expect(names()).toEqual(['Ionescu Ana', 'Popescu Ion', 'Popescu Ion']);
    expect(within(rows[0]!).queryByTestId('agreement-warning')).toBeNull();
    expect(within(rows[1]!).getByTestId('agreement-warning').textContent).toBe(
      'Act adițional nesemnat'
    );
    expect(
      within(card)
        .getAllByTestId('client-signature-request-signer')
        .map((signer) => signer.textContent)
    ).toEqual(['Ionescu Ana', 'Popescu Ion', 'Dan MARIN']);

    await user.click(within(card).getByTestId('sort-employee'));
    expect(names()).toEqual(['Popescu Ion', 'Popescu Ion', 'Ionescu Ana']);
    await user.click(within(card).getByTestId('sort-issuedAt'));
    expect(within(card).getByTestId('sort-issuedAt').dataset.sorted).toBe('true');
  });

  it("names a test sheet's request by its label, linking to the employee's tab of its domain", async () => {
    mockApi({
      [`GET /clients/${clientId}/signature-requests`]: () =>
        Response.json({ items: [testSheetRequest({ slot: 'trainee' })] }),
    });
    mount(`/clienti/${clientId}/portal`);
    const card = await screen.findByTestId('client-signature-requests');
    const [item] = await within(card).findAllByTestId('client-signature-request-document');
    expect(item!.dataset.kind).toBe('test_sheet');
    const link = within(item!).getByRole('link');
    expect(link.textContent).toBe('Fișa de test · Test anual SU · 15.10.2026');
    expect(link.getAttribute('href')).toBe(
      `/clienti/${clientId}/angajati/${employeeId}/instruire/su`
    );
    expect(within(card).getByTestId('client-signature-request').textContent).toContain('Instruit');
  });

  it('says so while every request is signed', async () => {
    mockApi();
    mount(`/clienti/${clientId}/portal`);
    const card = await screen.findByTestId('client-signature-requests');
    expect((await within(card).findByTestId('client-signature-requests-empty')).textContent).toBe(
      'Nicio semnătură în așteptare.'
    );
    expect(within(card).getByRole('heading').textContent).toBe('Semnături în așteptare');
  });

  it('is no longer on the trainings tab', async () => {
    mockApi();
    mount(`/clienti/${clientId}/instruiri-tinute`);
    await screen.findByTestId('trainings-empty');
    expect(screen.queryByTestId('client-signature-requests')).toBeNull();
    expect(requests('GET', `/clients/${clientId}/signature-requests`)).toHaveLength(0);
  });
});

describe("the employee's signing agreement", () => {
  const requestFileId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
  const invitationId = '3f2c1b0a-9e8d-4c7b-a6f5-e4d3c2b1a090';

  const scanFile = (id: string, name: string) => ({
    id,
    name,
    note: null,
    ownersOnly: false,
    employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
    originalFileName: `${name}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    sha256: 'a'.repeat(64),
    uploadedBy: null,
    canChange: true,
    createdAt: '2026-10-18T08:00:00.000Z',
    updatedAt: '2026-10-18T08:00:00.000Z',
    link: {
      url: `http://127.0.0.1:54321/storage/v1/object/sign/client-files/${id}`,
      fileName: `${name}.pdf`,
      disposition: 'inline',
      expiresInSeconds: 600,
    },
  });

  const generated = (overrides: Record<string, unknown> = {}) => ({
    state: 'generated',
    generatedAt: '2026-10-18T09:00:00.000Z',
    signedAt: null,
    clientFileId: null,
    employeeSignedAt: null,
    employerSignedAt: null,
    awaiting: 'employee',
    withdrawal: null,
    ...overrides,
  });

  const electronic = (overrides: Record<string, unknown> = {}) =>
    generated({
      state: 'signed_electronically',
      generatedAt: '2026-10-01T09:00:00.000Z',
      signedAt: '2026-10-02T09:00:00.000Z',
      employeeSignedAt: '2026-10-01T10:00:00.000Z',
      employerSignedAt: '2026-10-02T09:00:00.000Z',
      awaiting: null,
      ...overrides,
    });

  const openInvitation = (status = 'open') =>
    Response.json({
      participant: null,
      invitation: {
        id: invitationId,
        clientId,
        kind: 'employee',
        employeeId,
        fullName: 'Popescu Ion',
        channel: 'email',
        address: 'ion.popescu@example.com',
        status,
        lastSentAt: '2026-10-17T09:00:00.000Z',
        resendableAt: '2026-10-17T09:10:00.000Z',
        expiresAt: '2026-11-16T09:00:00.000Z',
        createdAt: '2026-10-17T09:00:00.000Z',
      },
    });

  const darkButtons = (scope: HTMLElement) =>
    Array.from(scope.querySelectorAll('button, a')).filter(
      (element) => element.getAttribute('data-variant') === 'default'
    );

  const isoDaysAgo = (days: number) => {
    const day = new Date();
    day.setDate(day.getDate() - days);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  };
  const roDate = (iso: string) => iso.split('-').reverse().join('.');

  const scan = () => new File(['%PDF-1.7'], 'act-semnat.pdf', { type: 'application/pdf' });

  const uploads = () =>
    requestsTo(`/clients/${clientId}/files`, 'POST').map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body,
    }));

  async function typeDate(field: HTMLElement, iso: string) {
    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, roDate(iso));
    await user.tab();
  }

  it('downloads a new agreement, records it as downloaded, and leaves the dark step to the invitation', async () => {
    let downloaded = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({ agreement: downloaded ? generated() : null, unavailable: null }),
      [`GET ${agreementPath}`]: () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Act-aditional-Popescu-Ion.pdf"',
          },
        }),
      [`PUT ${agreementPath}/state`]: () => {
        downloaded = true;
        return Response.json({ agreement: null, unavailable: null });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-state')).textContent).toBe(
      'Nesemnat'
    );
    expect(within(card).getByTestId('signing-agreement-next').textContent).toBe(
      'Lucrătorul îl semnează în portal după ce îl inviți. Dacă preferă hârtia, descarcă-l și dă-l la semnat.'
    );
    await user.click(within(card).getByTestId('signing-agreement-download'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'generated' },
      ])
    );
    expect(saved).toEqual(['Act-aditional-Popescu-Ion.pdf']);
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe('Descărcat')
    );
    expect(within(card).getByTestId('signing-agreement-next').textContent).toBe(
      'Pe 18 oct. 2026. După ce îl semnează lucrătorul și angajatorul, înregistrează-l.'
    );
    const tab = screen.getByTestId('employee-portal');
    expect(darkButtons(tab).map((button) => button.textContent)).toEqual(['Invită în portal']);
  });

  it('makes recording the downloaded agreement the dark step once the employee is invited', async () => {
    mockApi({
      [`GET ${employeePath}/participant`]: () => openInvitation(),
      [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await within(card).findByTestId('signing-agreement-state');
    const tab = screen.getByTestId('employee-portal');
    await waitFor(() =>
      expect(darkButtons(tab).map((button) => button.getAttribute('data-testid'))).toEqual([
        'signing-agreement-paper',
      ])
    );
    expect(
      Array.from(within(card).getByTestId('signing-agreement-actions').children).map((button) =>
        button.getAttribute('data-testid')
      )
    ).toEqual([
      'signing-agreement-paper',
      'signing-agreement-download',
      'signing-agreement-in-contract',
    ]);
  });

  it('leaves the dark step to the resend while the invitation has expired', async () => {
    mockApi({
      [`GET ${employeePath}/participant`]: () => openInvitation('expired'),
      [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await within(card).findByTestId('signing-agreement-paper');
    const tab = screen.getByTestId('employee-portal');
    await waitFor(() =>
      expect(darkButtons(tab).map((button) => button.getAttribute('data-testid'))).toEqual([
        'participant-invitation-resend',
      ])
    );
    expect(within(card).getByTestId('signing-agreement-paper').getAttribute('data-variant')).toBe(
      'secondary'
    );
  });

  it('offers the stored file as a real link once a party has signed electronically', async () => {
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: generated({
            employeeSignedAt: '2026-10-19T09:00:00.000Z',
            awaiting: 'employer',
          }),
          unavailable: null,
        }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-download').getAttribute('href')).toContain(
        '/files/download?'
      )
    );
    const link = within(card).getByTestId('signing-agreement-download');
    expect(link.textContent).toBe('Descarcă actul semnat');
    const address = new URL(link.getAttribute('href')!);
    expect(address.searchParams.get('source')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/documents/agreement'
    );
    expect(address.searchParams.get('name')).toBe(
      'Act-aditional-semnare-electronica-Popescu-Ion.pdf'
    );
    expect(address.searchParams.get('disposition')).toBe('attachment');
    expect(requests('GET', agreementPath)).toHaveLength(0);
    expect(saved).toEqual([]);
  });

  it('records a paper agreement on the day it was signed, with a scan already among the files', async () => {
    let signed = false;
    const signedOn = isoDaysAgo(3);
    mockApi({
      [`GET ${employeePath}/participant`]: () => openInvitation(),
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: signed
            ? generated({
                state: 'signed_on_paper',
                signedAt: `${signedOn}T10:00:00.000Z`,
                clientFileId: fileId,
                awaiting: null,
              })
            : generated(),
        }),
      [`GET /clients/${clientId}/files`]: () =>
        Response.json({ items: [scanFile(fileId, 'Act adițional semnat')] }),
      [`PUT ${agreementPath}/state`]: () => {
        signed = true;
        return Response.json({ agreement: null, unavailable: null });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-paper'));
    const dialog = await screen.findByTestId('signing-agreement-paper-dialog');
    expect(dialog.textContent).toContain(
      'Actul adițional semnat de mână de Popescu Ion și de angajator.'
    );
    const date = within(dialog).getByTestId('signing-agreement-signed-on');
    expect((date as HTMLInputElement).value).toBe(roDate(isoDaysAgo(0)));
    await typeDate(date, signedOn);
    const existing = within(dialog).getByTestId('signing-agreement-file-existing');
    await waitFor(() => expect(existing).toHaveProperty('disabled', false));
    await user.selectOptions(existing, fileId);
    await user.click(within(dialog).getByTestId('signing-agreement-paper-submit'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'signed_on_paper', signedOn, clientFileId: fileId },
      ])
    );
    expect(uploads()).toHaveLength(0);
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe(
        'Semnat pe hârtie'
      )
    );
    expect(within(card).getByTestId('signing-agreement-scan-link').textContent).toBe(
      'Act adițional semnat'
    );
    expect(within(card).queryByTestId('signing-agreement-paper')).toBeNull();
    expect(within(card).queryByTestId('signing-agreement-next')).toBeNull();
  });

  it('uploads a new scan among the employee’s files, then records the agreement with it, once', async () => {
    let attempts = 0;
    let uploaded = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }),
      [`POST /clients/${clientId}/files`]: () => {
        uploaded = true;
        return Response.json({ file: scanFile(fileId, 'act-semnat') }, { status: 201 });
      },
      [`GET /clients/${clientId}/files`]: () =>
        Response.json({ items: uploaded ? [scanFile(fileId, 'act-semnat')] : [] }),
      [`PUT ${agreementPath}/state`]: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ error: 'internal', message: 'down' }, { status: 500 })
          : Response.json({ agreement: null, unavailable: null });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-paper'));
    const dialog = await screen.findByTestId('signing-agreement-paper-dialog');
    await user.upload(within(dialog).getByTestId('signing-agreement-file-input'), scan());
    const chosen = within(dialog).getByTestId('signing-agreement-file-chosen');
    expect(chosen.textContent).toContain('act-semnat.pdf');
    expect(chosen.textContent).toContain('se salvează în Documente');
    expect(within(dialog).queryByTestId('signing-agreement-file-existing')).toBeNull();

    await user.click(within(dialog).getByTestId('signing-agreement-paper-submit'));
    expect(await within(dialog).findByTestId('signing-agreement-error')).toBeTruthy();
    expect(within(dialog).queryByTestId('signing-agreement-file-chosen')).toBeNull();
    const existing = within(dialog).getByTestId('signing-agreement-file-existing');
    await waitFor(() => expect((existing as HTMLSelectElement).value).toBe(fileId));
    expect(existing.textContent).toContain('act-semnat');
    await user.click(within(dialog).getByTestId('signing-agreement-paper-submit'));
    await waitFor(() => expect(screen.queryByTestId('signing-agreement-paper-dialog')).toBeNull());

    const sent = uploads();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url.searchParams.get('fileName')).toBe('act-semnat.pdf');
    expect(sent[0]!.url.searchParams.get('employeeId')).toBe(employeeId);
    expect(sent[0]!.body).toBeInstanceOf(File);
    expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
      { state: 'signed_on_paper', signedOn: isoDaysAgo(0), clientFileId: fileId },
      { state: 'signed_on_paper', signedOn: isoDaysAgo(0), clientFileId: fileId },
    ]);
  });

  it('keeps a scan uploaded before a refused save among the files when the dialog is left', async () => {
    let uploaded = false;
    mockApi({
      [`GET ${agreementPath}/state`]: () => Response.json({ agreement: electronic() }),
      [`POST /clients/${clientId}/files`]: () => {
        uploaded = true;
        return Response.json({ file: scanFile(requestFileId, 'cerere') }, { status: 201 });
      },
      [`GET /clients/${clientId}/files`]: () =>
        Response.json({ items: uploaded ? [scanFile(requestFileId, 'cerere')] : [] }),
      [`PUT ${agreementPath}/state`]: () =>
        Response.json({ error: 'internal', message: 'down' }, { status: 500 }),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-withdraw'));
    const dialog = await screen.findByTestId('signing-agreement-withdraw-dialog');
    await user.upload(within(dialog).getByTestId('signing-agreement-request-file-input'), scan());
    await user.click(within(dialog).getByTestId('signing-agreement-withdraw-submit'));
    expect(await within(dialog).findByTestId('signing-agreement-error')).toBeTruthy();
    const existing = within(dialog).getByTestId('signing-agreement-request-file-existing');
    await waitFor(() => expect((existing as HTMLSelectElement).value).toBe(requestFileId));

    await user.click(within(dialog).getByRole('button', { name: 'Renunță' }));
    await waitFor(() =>
      expect(screen.queryByTestId('signing-agreement-withdraw-dialog')).toBeNull()
    );
    expect(uploads()).toHaveLength(1);
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(1);
  });

  it('moves the focus to the remove button after a pick, and back to the choice after removing', async () => {
    mockApi({ [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }) });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-paper'));
    const dialog = await screen.findByTestId('signing-agreement-paper-dialog');
    await user.upload(within(dialog).getByTestId('signing-agreement-file-input'), scan());
    const remove = within(dialog).getByTestId('signing-agreement-file-remove');
    await waitFor(() => expect(document.activeElement).toBe(remove));

    await user.click(remove);
    const choose = within(dialog).getByTestId('signing-agreement-file-choose');
    await waitFor(() => expect(document.activeElement).toBe(choose));
  });

  it('refuses a scan that is neither a PDF nor an image, and a day in the future', async () => {
    mockApi({ [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }) });
    const user = userEvent.setup({ applyAccept: false });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-paper'));
    const dialog = await screen.findByTestId('signing-agreement-paper-dialog');
    await user.upload(
      within(dialog).getByTestId('signing-agreement-file-input'),
      new File(['x'], 'act.docx')
    );
    expect(within(dialog).getByTestId('signing-agreement-file-refusal').textContent).toBe(
      'Alege un PDF sau o imagine (JPEG, PNG).'
    );
    await typeDate(within(dialog).getByTestId('signing-agreement-signed-on'), isoDaysAgo(-2));
    await user.click(within(dialog).getByTestId('signing-agreement-paper-submit'));
    expect(
      (await within(dialog).findByTestId('signing-agreement-signed-on-error')).textContent
    ).toBeTruthy();
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
  });

  it('asks for an email or a phone when the agreement cannot name where the codes go', async () => {
    mockApi({
      [`GET ${employeePath}/participant`]: () => openInvitation(),
      [`GET ${agreementPath}`]: () => conflict('employee_has_no_address'),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-download'));
    const line = await within(card).findByTestId('signing-agreement-no-address');
    expect(line.textContent).toContain('Lucrătorul nu are email sau telefon');
    expect(within(line).getByRole('link').getAttribute('href')).toBe(
      `${employeePage}/editare?focus=contact`
    );
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
  });

  it('says why a download is refused even while the access panel asks for an email or a phone', async () => {
    mockApi({
      [`GET ${employeePath}`]: () =>
        Response.json({ employee: { ...employee, email: null, phone: null } }),
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: null,
          unavailable: { reason: 'employee_has_no_address', missing: [] },
        }),
      [`GET ${agreementPath}`]: () => conflict('employee_has_no_address'),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await screen.findByTestId('participant-no-contact');
    expect(within(card).queryByTestId('signing-agreement-no-address')).toBeNull();
    await user.click(within(card).getByTestId('signing-agreement-download'));
    expect(await within(card).findByTestId('signing-agreement-no-address')).toBeTruthy();
  });

  it('says an agreement the employee signed waits for the administrator, and offers no paper record', async () => {
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
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-state')).textContent).toBe(
      'Semnat de lucrător'
    );
    expect(within(card).getByTestId('signing-agreement-signatures').textContent).toBe(
      'SemnăturiLucrătorul · 1 oct. 2026Administratorul clientului · în așteptare'
    );
    expect(within(card).getByTestId('signing-agreement-next').textContent).toBe(
      'Urmează administratorul clientului, tot în portal.'
    );
    expect(within(card).queryByTestId('signing-agreement-paper')).toBeNull();
    expect(within(card).queryByTestId('signing-agreement-in-contract')).toBeNull();
    expect(within(card).getByTestId('signing-agreement-withdraw')).toBeTruthy();
  });

  it('records the return to handwriting with the day and scan of the request, keeping the signed act', async () => {
    let withdrawn = false;
    let uploaded = false;
    const requestedOn = isoDaysAgo(5);
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: electronic(
            withdrawn
              ? {
                  state: 'withdrawn',
                  withdrawal: {
                    recordedAt: '2026-11-12T08:15:00.000Z',
                    requestedOn,
                    fileId: requestFileId,
                  },
                }
              : {}
          ),
        }),
      [`POST /clients/${clientId}/files`]: () => {
        uploaded = true;
        return Response.json({ file: scanFile(requestFileId, 'cerere') }, { status: 201 });
      },
      [`GET /clients/${clientId}/files`]: () =>
        Response.json({ items: uploaded ? [scanFile(requestFileId, 'Cererea lui Ion')] : [] }),
      [`PUT ${agreementPath}/state`]: () => {
        withdrawn = true;
        return Response.json({ agreement: null });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-state')).textContent).toBe(
      'Semnat electronic'
    );
    expect(within(card).getByTestId('signing-agreement-signatures').textContent).toBe(
      'SemnăturiLucrătorul · 1 oct. 2026Administratorul clientului · 2 oct. 2026'
    );
    await user.click(within(card).getByTestId('signing-agreement-withdraw'));
    const dialog = await screen.findByTestId('signing-agreement-withdraw-dialog');
    expect(dialog.textContent).toContain(
      'De acum, fișele lui se semnează de mână. Cererile de semnare electronică în așteptare se anulează; actul și semnăturile de până atunci rămân la dosar.'
    );
    await typeDate(within(dialog).getByTestId('signing-agreement-requested-on'), requestedOn);
    await user.upload(within(dialog).getByTestId('signing-agreement-request-file-input'), scan());
    await user.click(within(dialog).getByTestId('signing-agreement-withdraw-submit'));
    await waitFor(() =>
      expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
        { state: 'withdrawn', requestedOn, requestFileId },
      ])
    );
    expect(uploads()[0]!.url.searchParams.get('employeeId')).toBe(employeeId);
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe(
        'Semnează de mână'
      )
    );
    expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe(
      'Din 12 nov. 2026 semnează fișele de mână. Actul și semnăturile de până atunci rămân la dosar.'
    );
    const request = within(card).getByTestId('signing-agreement-request');
    expect(request.textContent).toContain(formatDate(requestedOn));
    expect((await within(card).findByTestId('signing-agreement-request-scan')).textContent).toBe(
      'Cererea lui Ion'
    );
    expect(within(card).queryByTestId('signing-agreement-withdraw')).toBeNull();
    expect(within(card).getByTestId('signing-agreement-download').textContent).toBe(
      'Descarcă actul semnat'
    );
  });

  it('refuses a request dated before the agreement was signed', async () => {
    mockApi({ [`GET ${agreementPath}/state`]: () => Response.json({ agreement: electronic() }) });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-withdraw'));
    const dialog = await screen.findByTestId('signing-agreement-withdraw-dialog');
    await typeDate(within(dialog).getByTestId('signing-agreement-requested-on'), '2026-09-30');
    await user.click(within(dialog).getByTestId('signing-agreement-withdraw-submit'));
    expect(
      (await within(dialog).findByTestId('signing-agreement-requested-on-error')).textContent
    ).toBe('Data cererii nu poate fi înaintea semnării actului.');
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
  });

  it('words a withdrawal the API has recorded already', async () => {
    mockApi({
      [`GET ${agreementPath}/state`]: () => Response.json({ agreement: electronic() }),
      [`PUT ${agreementPath}/state`]: () => conflict('agreement_withdrawal_recorded'),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-withdraw'));
    const dialog = await screen.findByTestId('signing-agreement-withdraw-dialog');
    await user.click(within(dialog).getByTestId('signing-agreement-withdraw-submit'));
    expect((await within(dialog).findByTestId('signing-agreement-error')).textContent).toBe(
      'Revenirea la semnarea de mână este deja înregistrată, cu cererea lucrătorului.'
    );
    expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
      { state: 'withdrawn', requestedOn: isoDaysAgo(0), requestFileId: null },
    ]);
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
        return Response.json({ agreement: null, unavailable: null });
      },
    });
    const user = userEvent.setup();
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    await user.click(await within(card).findByTestId('signing-agreement-in-contract'));
    const clause = await screen.findByTestId('signing-agreement-clause-dialog');
    await waitFor(() =>
      expect(within(clause).getByTestId('signing-agreement-clause-text').textContent).toContain(
        'în platforma informatică pusă la dispoziție de PREVENȚIA PLUS SRL'
      )
    );
    await user.click(within(clause).getByTestId('signing-agreement-clause-copy'));
    expect(await navigator.clipboard.readText()).toContain('PREVENȚIA PLUS SRL');
    expect(within(clause).getByTestId('signing-agreement-clause-copy').textContent).toBe('Copiată');
    expect(requests('PUT', `${agreementPath}/state`)).toHaveLength(0);
    await user.click(within(clause).getByTestId('signing-agreement-in-contract-confirm'));
    await waitFor(() =>
      expect(within(card).getByTestId('signing-agreement-state').textContent).toBe(
        'Clauză în contract'
      )
    );
    expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe(
      'Clauza e în contractul de muncă, deci actul adițional nu mai e necesar.'
    );
    expect(requests('PUT', `${agreementPath}/state`).map((call) => call.body)).toEqual([
      { state: 'in_contract' },
    ]);
    expect(within(card).queryByTestId('signing-agreement-download')).toBeNull();
    expect(within(card).getByTestId('signing-agreement-withdraw')).toBeTruthy();

    await user.click(within(card).getByTestId('signing-agreement-clause'));
    const view = await screen.findByTestId('signing-agreement-clause-dialog');
    expect(within(view).getByTestId('signing-agreement-clause-copy')).toBeTruthy();
    expect(within(view).queryByTestId('signing-agreement-in-contract-confirm')).toBeNull();
  });

  it('shows the paper scan as missing without reading the files', async () => {
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: generated({
            state: 'signed_on_paper',
            signedAt: '2026-10-02T10:00:00.000Z',
            awaiting: null,
          }),
        }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-scan')).textContent).toContain(
      'Fără scan atașat'
    );
    expect(within(card).getByTestId('signing-agreement-detail').textContent).toBe('pe 2 oct. 2026');
    expect(requests('GET', `/clients/${clientId}/files`)).toHaveLength(0);
  });

  it('offers nothing to sign at an archived client', async () => {
    mockApi({
      [`GET /clients/${clientId}`]: () =>
        Response.json({ client: { ...sampleClient, archivedAt: '2026-10-01T10:00:00+00:00' } }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-detail')).textContent).toBe(
      'Clientul e arhivat: actul nu se mai semnează.'
    );
    expect(within(card).queryByTestId('signing-agreement-actions')).toBeNull();
    expect(within(card).queryByTestId('signing-agreement-next')).toBeNull();
    expect(darkButtons(screen.getByTestId('employee-portal'))).toEqual([]);
  });

  it('shows a withdrawal recorded before its moment was kept without a day or a request', async () => {
    mockApi({
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: electronic({
            state: 'withdrawn',
            withdrawal: { recordedAt: null, requestedOn: null, fileId: null },
          }),
        }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-detail')).textContent).toBe(
      'Semnează fișele de mână; actul și semnăturile dinaintea revenirii rămân la dosar.'
    );
    expect(within(card).queryByTestId('signing-agreement-request')).toBeNull();
  });

  it('does not count an expired invitation as the worker invited', async () => {
    mockApi({ [`GET ${employeePath}/participant`]: () => openInvitation('expired') });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect((await within(card).findByTestId('signing-agreement-next')).textContent).toBe(
      'Lucrătorul îl semnează în portal după ce îl inviți. Dacă preferă hârtia, descarcă-l și dă-l la semnat.'
    );
  });

  it('asks for an email or a phone on the agreement while an expired invitation holds the access panel', async () => {
    mockApi({
      [`GET ${employeePath}`]: () =>
        Response.json({ employee: { ...employee, email: null, phone: null } }),
      [`GET ${employeePath}/participant`]: () => openInvitation('expired'),
      [`GET ${agreementPath}/state`]: () =>
        Response.json({
          agreement: null,
          unavailable: { reason: 'employee_has_no_address', missing: [] },
        }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    expect(await within(card).findByTestId('signing-agreement-no-address')).toBeTruthy();
    expect(screen.queryByTestId('participant-no-contact')).toBeNull();
  });

  describe('of a former worker', () => {
    const former = { ...employee, status: 'terminated', terminatedAt: '2026-09-30' };

    it('shows the access and an unsigned agreement, with nothing to do but revoke', async () => {
      mockApi({
        [`GET ${employeePath}`]: () => Response.json({ employee: former }),
        [`GET ${employeePath}/participant`]: () => openInvitation(),
        [`GET ${agreementPath}/state`]: () => Response.json({ agreement: generated() }),
      });
      mount(`${employeePage}/portal`);
      const card = await screen.findByTestId('signing-agreement-card');
      expect((await within(card).findByTestId('signing-agreement-detail')).textContent).toBe(
        'Fost lucrător: actul nu se mai semnează.'
      );
      expect(within(card).queryByTestId('signing-agreement-actions')).toBeNull();
      expect(within(card).queryByTestId('signing-agreement-next')).toBeNull();
      const access = screen.getByTestId('employee-portal-card');
      expect(within(access).getByTestId('participant-invitation-revoke')).toBeTruthy();
      expect(within(access).queryByTestId('participant-invitation-resend')).toBeNull();
      expect(within(access).queryByTestId('participant-invitation-hint')).toBeNull();
      expect(within(access).queryByTestId('participant-invite')).toBeNull();
      expect(darkButtons(screen.getByTestId('employee-portal'))).toEqual([]);
    });

    it('keeps the signed act to download and the access to revoke, and records nothing', async () => {
      mockApi({
        [`GET ${employeePath}`]: () => Response.json({ employee: former }),
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
              language: null,
            },
            invitation: null,
          }),
        [`GET ${agreementPath}/state`]: () => Response.json({ agreement: electronic() }),
      });
      mount(`${employeePage}/portal`);
      const card = await screen.findByTestId('signing-agreement-card');
      await waitFor(() =>
        expect(within(card).getByTestId('signing-agreement-download').textContent).toBe(
          'Descarcă actul semnat'
        )
      );
      expect(within(card).queryByTestId('signing-agreement-withdraw')).toBeNull();
      expect(
        within(screen.getByTestId('employee-portal-card')).getByTestId('participant-revoke')
      ).toBeTruthy();
    });

    it('keeps the contract clause to read', async () => {
      mockApi({
        [`GET ${employeePath}`]: () => Response.json({ employee: former }),
        [`GET ${agreementPath}/state`]: () =>
          Response.json({
            agreement: electronic({
              state: 'in_contract',
              signedAt: null,
              employeeSignedAt: null,
              employerSignedAt: null,
            }),
          }),
      });
      mount(`${employeePage}/portal`);
      const card = await screen.findByTestId('signing-agreement-card');
      expect(await within(card).findByTestId('signing-agreement-clause')).toBeTruthy();
      expect(within(card).queryByTestId('signing-agreement-withdraw')).toBeNull();
      expect(within(card).queryByTestId('signing-agreement-in-contract')).toBeNull();
    });
  });

  it('warns while annex 14 of the internal regulation is not issued', async () => {
    mockApi({
      [`GET /clients/${clientId}/documents`]: () =>
        Response.json({ items: [], notApplicable: [], lastGeneration: null }),
    });
    mount(`${employeePage}/portal`);
    const card = await screen.findByTestId('signing-agreement-card');
    const line = await within(card).findByTestId('signing-agreement-annex');
    expect(line.textContent).toContain(
      'Anexa 14 la regulamentul intern nu este emisă. Emite-o odată cu actele adiționale.'
    );
    expect(within(line).getByRole('link').getAttribute('data-variant')).toBe('secondary');
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
    mount(`${employeePage}/portal`);
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
  const pendingRow = signatureRow();
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
    mockApi({ 'GET /me/signatures': () => signaturePage([pendingRow]), ...routes });
    const user = userEvent.setup();
    mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select-page'));
    await user.click(screen.getByTestId('signatures-sign'));
    return { user, dialog: await screen.findByTestId('signing-dialog') };
  }

  async function askForCode(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByTestId('signing-send'));
    return within(dialog).findByTestId('signing-code');
  }

  it('lists the batch, sends a code, signs with it and shows what was signed and what failed', async () => {
    let listed = pendingRow;
    const { user, dialog } = await openSigning({
      'GET /me/signatures': () => signaturePage([listed]),
      [`POST ${sessionPath}`]: session,
      [`POST ${signPath}`]: () => {
        listed = signatureRow({
          slots: ['verifier'],
          signatures: 1,
          workers: [worker(employeeId, 'Popescu', 'Ion', [{ id: secondId, slot: 'verifier' }])],
        });
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
      'Fișa lucrătorului nu are toate datele (locul de muncă, traseul). Completează-le, apoi semnează din nou.'
    );

    await user.click(within(dialog).getByTestId('signing-close'));
    await waitFor(() => expect(screen.queryByTestId('signing-dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('signatures-row').textContent).toContain('Verificator')
    );
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (1)');
  });

  it('signs a test sheet in the same session as a training', async () => {
    const mixed = [request(), testSheetRequest()];
    const { user, dialog } = await openSigning({
      'GET /me/signatures': () =>
        signaturePage([
          signatureRow({
            slots: ['trainer'],
            signatures: 1,
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [{ id: mixed[0]!.id, slot: 'trainer' }]),
            ],
          }),
          sheetRow({
            workers: [
              worker(employeeId, 'Popescu', 'Ion', [{ id: mixed[1]!.id, slot: 'examiner' }]),
            ],
          }),
        ]),
      [`POST ${sessionPath}`]: session,
    });
    const items = within(dialog).getAllByTestId('signing-item');
    expect(items.map((item) => item.dataset.kind)).toEqual(['training_record', 'test_sheet']);
    expect(items[1]!.textContent).toBe(
      'Popescu IonSUAct adițional nesemnatFișa de test · Test anual SU · 15.10.2026 · semnezi ca examinatorVELOCE CAFE SRL'
    );
    await askForCode(user, dialog);
    expect(requests('POST', sessionPath).map((call) => call.body)).toEqual([
      { requestIds: mixed.map((item) => item.id) },
    ]);
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

  it('has no close button and ignores Escape while the code is being sent', async () => {
    let refuse = () => {};
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: () =>
        new Promise((resolve) => {
          refuse = () =>
            resolve(
              Response.json(
                {
                  error: 'refused',
                  message: 'signing_code_not_sent',
                  reason: 'signing_code_not_sent',
                },
                { status: 503 }
              )
            );
        }),
    });
    await user.click(within(dialog).getByTestId('signing-send'));
    expect(within(dialog).getByTestId('signing-send').textContent).toBe('Se trimite…');

    expect(within(dialog).queryByRole('button', { name: 'Închide' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('signing-dialog')).toBeTruthy();

    refuse();
    expect((await within(dialog).findByTestId('signing-send-error')).textContent).toBe(
      'Codul nu a putut fi trimis. Nu s-a semnat nimic; încearcă din nou.'
    );
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toBeTruthy();
  });

  it('lets go of a request that no longer waits, once the session says so', async () => {
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: session,
      [`POST ${signPath}`]: () =>
        Response.json({
          signed: [{ requestId: firstId, agreementState: null }],
          failed: [{ requestId: secondId, reason: 'request_not_pending' }],
          agreements: [],
        }),
    });
    await user.type(await askForCode(user, dialog), '123456');
    await user.click(within(dialog).getByTestId('signing-submit'));
    await within(dialog).findByTestId('signing-result-summary');
    await user.click(within(dialog).getByTestId('signing-close'));
    await waitFor(() => expect(screen.queryByTestId('signing-dialog')).toBeNull());
    expect(screen.queryByTestId('signatures-selection')).toBeNull();
  });

  it('lets go of only the request a refused code request names', async () => {
    const { user, dialog } = await openSigning({
      [`POST ${sessionPath}`]: () =>
        Response.json(
          {
            error: 'not_found',
            message: 'gone',
            reason: 'signing_item_not_found',
            issues: [{ path: 'requestIds.1', message: 'This request is not pending.' }],
          },
          { status: 404 }
        ),
    });
    await user.click(within(dialog).getByTestId('signing-send'));
    await within(dialog).findByTestId('signing-send-error');
    await user.click(within(dialog).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByTestId('signing-dialog')).toBeNull());
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (1)');
  });

  it('keeps a request the page no longer lists out of the choice after a page turn', async () => {
    const other = signatureRow({
      id: '0d0d0d0d-0000-4000-8000-000000000001',
      phase: 'workplace',
      slots: ['verifier'],
      signatures: 1,
      workers: [
        worker(employeeId, 'Popescu', 'Ion', [
          { id: '0d0d0d0d-0000-4000-8000-000000000002', slot: 'verifier' },
        ]),
      ],
    });
    let first = signatureRow();
    mockApi({
      'GET /me/signatures': (url) =>
        url.searchParams.get('page') === '2'
          ? signaturePage([other], { page: 2, total: 26, unfilteredTotal: 26 })
          : signaturePage([first], { total: 26, unfilteredTotal: 26 }),
    });
    const user = userEvent.setup();
    const runtime = mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (2)');
    first = signatureRow({
      slots: ['verifier'],
      signatures: 1,
      workers: [worker(employeeId, 'Popescu', 'Ion', [{ id: secondId, slot: 'verifier' }])],
    });
    await runtime.queryClient.invalidateQueries();
    await waitFor(() =>
      expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (1)')
    );
    await user.click(screen.getByRole('button', { name: /Următoarea/ }));
    await waitFor(() =>
      expect(screen.getByTestId('signatures-row').textContent).toContain('La locul de muncă')
    );
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (1)');
  });

  it('refuses more than one code can sign until some sheets are unticked', async () => {
    const id = (base: string, index: number) =>
      `00000000-0000-4000-${base}-${String(index).padStart(12, '0')}`;
    const people = Array.from({ length: 16 }, (_, index) =>
      worker(id('8000', index), `Lucrător${index}`, 'Ion', [
        { id: id('9000', index * 2), slot: 'trainer' },
        { id: id('9000', index * 2 + 1), slot: 'verifier' },
      ])
    );
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([signatureRow({ signatures: 32, workers: people })]),
    });
    const user = userEvent.setup();
    mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-limit').textContent).toBe(
      'Cu un cod semnezi cel mult 30. Deschide rândul și debifează o fișă; pe ea o semnezi apoi cu alt cod.'
    );
    expect(screen.getByTestId('signatures-sign')).toHaveProperty('disabled', true);
    await user.click(screen.getByTestId('signatures-open'));
    await user.click(screen.getAllByTestId('signatures-worker-select')[0]!);
    expect(screen.queryByTestId('signatures-limit')).toBeNull();
    expect(screen.getByTestId('signatures-sign')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('signatures-sign').textContent).toBe('Semnează (30)');
  });

  it('counts the sheets to untick from the requests each worker really has', async () => {
    const id = (base: string, index: number) =>
      `00000000-0000-4000-${base}-${String(index).padStart(12, '0')}`;
    const people = Array.from({ length: 30 }, (_, index) =>
      worker(
        id('8000', index),
        `Lucrător${index}`,
        'Ion',
        index < 2
          ? [
              { id: id('9000', index * 2), slot: 'verifier' },
              { id: id('9000', index * 2 + 1), slot: 'admitter' },
            ]
          : [{ id: id('9000', index * 2), slot: 'verifier' }]
      )
    );
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([
          signatureRow({ slots: ['verifier', 'admitter'], signatures: 32, workers: people }),
        ]),
    });
    const user = userEvent.setup();
    mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select'));
    expect(screen.getByTestId('signatures-limit').textContent).toBe(
      'Cu un cod semnezi cel mult 30. Deschide rândul și debifează o fișă; pe ea o semnezi apoi cu alt cod.'
    );
  });

  it('names how many signatures to untick when several rows go over', async () => {
    const id = (base: string, index: number) =>
      `00000000-0000-4000-${base}-${String(index).padStart(12, '0')}`;
    const many = (rowId: string, count: number, offset: number) =>
      signatureRow({
        id: rowId,
        slots: ['verifier'],
        signatures: count,
        workers: Array.from({ length: count }, (_, index) =>
          worker(id('8000', offset + index), `Lucrător${offset + index}`, 'Ion', [
            { id: id('9000', offset + index), slot: 'verifier' },
          ])
        ),
      });
    mockApi({
      'GET /me/signatures': () =>
        signaturePage([
          many('0e0e0e0e-0000-4000-8000-000000000001', 20, 0),
          many('0e0e0e0e-0000-4000-8000-000000000002', 13, 100),
        ]),
    });
    const user = userEvent.setup();
    mount('/semnaturi');
    await user.click(await screen.findByTestId('signatures-select-page'));
    expect(screen.getByTestId('signatures-limit').textContent).toBe(
      'Cu un cod semnezi cel mult 30. Debifează 3 semnături, un rând întreg sau fișe dintr-un rând deschis; pe ele le semnezi apoi cu alt cod.'
    );
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
      [`PUT ${trainingsPath}/${trainingId}`]: detail(signers),
    });
    const user = userEvent.setup();
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    await user.click(await recordMenuItem('training-record-edit'));
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
    mount(`${employeePage}/instruire/ssm`);
    await openRecordRow();
    expect(await menuDisabled('training-record-delete')).toBe(true);
    expect(await menuDisabled('training-record-edit')).toBe(false);
    expect((await recordMenuItem('training-record-lock')).textContent).toBe(
      trainingLocks({ signed: false, hasSignatures: true, printed: false }).delete
    );
  });
});
