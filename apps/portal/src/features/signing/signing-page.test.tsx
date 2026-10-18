import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPortalSigningSession,
  type PortalSignatureRequestsResponse,
  signPortalSigningSession,
  useGetPortalEmployeeData,
  useGetPortalMe,
  useGetPortalSigningAgreementState,
  useGetPortalTrainingSheets,
  useListPortalClientEmployees,
  useListPortalClientSignatureRequests,
  useListPortalResponsiblePersons,
  useListPortalSignatureRequests,
  useListPortalSigningAgreements,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  disposeRuntimes,
  employeeData,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  queryPending,
  queryResult,
  trainingRecords,
} from '@/test/portal';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalEmployeeData: vi.fn(),
  useGetPortalTrainingSheets: vi.fn(),
  useListPortalClientEmployees: vi.fn(),
  useListPortalResponsiblePersons: vi.fn(),
  useListPortalSignatureRequests: vi.fn(),
  useListPortalClientSignatureRequests: vi.fn(),
  useListPortalSigningAgreements: vi.fn(),
  useGetPortalSigningAgreementState: vi.fn(),
  createPortalSigningSession: vi.fn(),
  signPortalSigningSession: vi.fn(),
}));

const employee = participation();
const employeeId = employee.employeeId!;
const sessionId = '6f0c3e43-0c1b-4f4b-8a1e-0000000005e1';

type Request = PortalSignatureRequestsResponse['items'][number];

function request(id: string, overrides: Partial<Request> = {}): Request {
  const record = trainingRecords().items[0]!;
  return {
    id,
    slot: 'trainee',
    issuedAt: '2026-10-17T08:00:00Z',
    signerName: 'Pop Ana',
    record: { ...record, employee: { id: employeeId, lastName: 'Pop', firstName: 'Ana' } },
    agreementState: 'generated',
    ...overrides,
  };
}

const requestA = request('6f0c3e43-0c1b-4f4b-8a1e-0000000000r1');
const requestB = request('6f0c3e43-0c1b-4f4b-8a1e-0000000000r2', {
  record: {
    ...requestA.record,
    id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000a2',
    domain: 'psi',
    phase: 'introductory_general',
    heldOn: '2026-02-03',
  },
});

const agreementAwaitingEmployee = {
  state: 'generated' as const,
  generatedAt: '2026-10-16T08:00:00Z',
  signedAt: null,
  clientFileId: null,
  employeeSignedAt: null,
  employerSignedAt: null,
};

const session = {
  sessionId,
  channel: 'email' as const,
  addressHint: 'a***@example.ro',
  expiresAt: '2026-10-18T08:10:00Z',
  items: [],
};

const refusal = (reason: string, message = 'Refused.') =>
  new ApiHttpError(409, { error: 'conflict', message, reason });

beforeEach(() => {
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [employee] }));
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryResult(trainingRecords()));
  vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(employeeData()));
  vi.mocked(useGetPortalTrainingSheets).mockReturnValue(
    queryResult({
      ssm: { ready: true, missing: [], stored: true },
      psi: { ready: true, missing: [], stored: false },
    })
  );
  vi.mocked(useListPortalClientEmployees).mockReturnValue(queryPending());
  vi.mocked(useListPortalResponsiblePersons).mockReturnValue(queryPending());
  vi.mocked(useListPortalSignatureRequests).mockReturnValue(
    queryResult({ items: [requestA, requestB] })
  );
  vi.mocked(useListPortalClientSignatureRequests).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useListPortalSigningAgreements).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(
    queryResult({ agreement: agreementAwaitingEmployee })
  );
  vi.mocked(createPortalSigningSession).mockResolvedValue(session);
});

afterEach(() => {
  disposeRuntimes();
  vi.mocked(createPortalSigningSession).mockReset();
  vi.mocked(signPortalSigningSession).mockReset();
});

const signedIn = () => fakeAuthClient(fakeSession());

async function askForCode() {
  const user = userEvent.setup();
  mountPortal(signedIn(), '/semneaza');
  await screen.findByTestId('signing-items');
  await user.click(screen.getByTestId('signing-send'));
  await screen.findByTestId('signing-code');
  return user;
}

describe('Acasă', () => {
  it('lists the agreement first, then the requests, with one action that signs them all', async () => {
    mountPortal(signedIn());
    const panel = await screen.findByTestId('home-todo');
    const items = within(panel).getAllByTestId('home-todo-item');
    expect(items.map((item) => item.dataset.kind)).toEqual(['agreement', 'request', 'request']);
    expect(items[0]!.textContent).toContain('Acordul de semnare electronică');
    expect(items[1]!.textContent).toContain('Instruire periodică SSM');
    expect(items[1]!.textContent).toContain('semnezi ca lucrător');
    expect(within(panel).queryByTestId('signing-item-agreement-warning')).toBeNull();
    expect(screen.getByTestId('home-sign').textContent).toBe('Semnează (3)');
  });

  it('keeps the empty text when nothing waits', async () => {
    vi.mocked(useListPortalSignatureRequests).mockReturnValue(queryResult({ items: [] }));
    vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(queryResult({ agreement: null }));
    mountPortal(signedIn());
    expect((await screen.findByTestId('home-todo')).textContent).toContain(
      'Nimic de semnat deocamdată'
    );
    expect(screen.queryByTestId('home-sign')).toBeNull();
  });

  it('warns about the unsigned agreement on a record when the agreement is not to be signed here', async () => {
    vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(queryResult({ agreement: null }));
    mountPortal(signedIn());
    const panel = await screen.findByTestId('home-todo');
    expect(within(panel).getAllByTestId('signing-item-agreement-warning')).toHaveLength(2);
  });
});

describe('the signing screen', () => {
  it('starts with everything checked and warns, without blocking, when the agreement is left out', async () => {
    const user = userEvent.setup();
    mountPortal(signedIn(), '/semneaza');
    const checks = await screen.findAllByTestId('signing-item-check');
    expect(checks.map((check) => check.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'true',
    ]);
    expect(screen.queryByTestId('signing-agreement-warning')).toBeNull();

    await user.click(checks[0]!);
    expect(screen.getByTestId('signing-agreement-warning').textContent).toContain(
      'act adițional nesemnat'
    );
    expect(screen.getByTestId('signing-selected-count').textContent).toBe('Ai bifat 2 din 3.');

    await user.click(screen.getByTestId('signing-send'));
    expect(createPortalSigningSession).toHaveBeenCalledWith(
      employee.participantId,
      { requestIds: [requestA.id, requestB.id] },
      expect.anything()
    );
  });

  it('sends the agreement with the requests and shows only the masked address', async () => {
    await askForCode();
    expect(createPortalSigningSession).toHaveBeenCalledWith(
      employee.participantId,
      { requestIds: [requestA.id, requestB.id], agreementEmployeeIds: [employeeId] },
      expect.anything()
    );
    expect(screen.getByTestId('signing-code-sent').textContent).toContain(
      'Am trimis un cod la a***@example.ro.'
    );
    expect(screen.getByTestId('signing-code-sent').textContent).toContain(
      'semnează cele 3 documente alese'
    );
  });

  it('says how many attempts are left after a wrong code, then shows what was signed and what was not', async () => {
    vi.mocked(signPortalSigningSession)
      .mockRejectedValueOnce(refusal('code_invalid', 'The code is wrong; 2 attempts are left.'))
      .mockResolvedValueOnce({
        signed: [{ requestId: requestA.id, agreementState: 'generated' }],
        failed: [{ requestId: requestB.id, reason: 'sheet_busy' }],
        agreements: [
          {
            employeeId,
            party: 'employee',
            signed: true,
            reason: null,
            agreementState: 'generated',
          },
        ],
      });
    const user = await askForCode();

    await user.type(screen.getByTestId('signing-code'), '111111');
    await user.click(screen.getByTestId('signing-sign'));
    expect((await screen.findByTestId('signing-code-error')).textContent).toBe(
      'Codul nu este corect. Mai ai 2 încercări.'
    );

    await user.clear(screen.getByTestId('signing-code'));
    await user.type(screen.getByTestId('signing-code'), '123456');
    await user.click(screen.getByTestId('signing-sign'));
    expect(signPortalSigningSession).toHaveBeenLastCalledWith(
      employee.participantId,
      sessionId,
      { code: '123456' },
      expect.anything()
    );

    const summary = await screen.findByTestId('signing-result-summary');
    expect(summary.dataset.outcome).toBe('partial');
    const outcomes = screen.getAllByTestId('signing-outcome');
    expect(outcomes.map((outcome) => outcome.dataset.signed)).toEqual(['true', 'true', 'false']);
    expect(within(outcomes[2]!).getByTestId('signing-outcome-reason').textContent).toContain(
      'Fișa era folosită chiar atunci de altă semnătură'
    );
    expect(screen.getByTestId('signing-again')).toBeTruthy();
  });

  it.each([
    ['code_expired', 'Codul a expirat'],
    ['code_already_used', 'Codul a fost deja folosit'],
    ['code_attempts_exceeded', 'Codul a fost greșit de trei ori'],
  ])('asks for a new code after %s', async (reason, text) => {
    vi.mocked(signPortalSigningSession).mockRejectedValueOnce(refusal(reason));
    const user = await askForCode();
    await user.type(screen.getByTestId('signing-code'), '123456');
    await user.click(screen.getByTestId('signing-sign'));

    const error = await screen.findByTestId('signing-code-error');
    expect(error.textContent).toContain(text);
    expect(error.dataset.kind).toBe('spent');
    expect(screen.queryByTestId('signing-sign')).toBeNull();
    expect(screen.getByTestId('signing-resend').textContent).toMatch(/^Cere un cod nou/);
  });

  it('treats the last wrong code as spent', async () => {
    vi.mocked(signPortalSigningSession).mockRejectedValueOnce(
      refusal('code_invalid', 'The code is wrong, and no attempt is left; ask for a new one.')
    );
    const user = await askForCode();
    await user.type(screen.getByTestId('signing-code'), '123456');
    await user.click(screen.getByTestId('signing-sign'));
    expect((await screen.findByTestId('signing-code-error')).dataset.kind).toBe('spent');
  });

  it('asks for all six digits before calling the API', async () => {
    const user = await askForCode();
    await user.type(screen.getByTestId('signing-code'), '123');
    await user.click(screen.getByTestId('signing-sign'));
    expect(screen.getByTestId('signing-code-error').textContent).toBe(
      'Scrie toate cele 6 cifre din cod.'
    );
    expect(signPortalSigningSession).not.toHaveBeenCalled();
  });

  it('says to wait when a code was asked for less than a minute ago', async () => {
    vi.mocked(createPortalSigningSession).mockRejectedValueOnce(refusal('code_rate_limited'));
    const user = userEvent.setup();
    mountPortal(signedIn(), '/semneaza');
    await screen.findByTestId('signing-items');
    await user.click(screen.getByTestId('signing-send'));
    const error = await screen.findByTestId('signing-send-error');
    expect(error.textContent).toContain('Ai cerut un cod acum mai puțin de un minut.');
    expect(error.textContent).toMatch(/Poți cere altul în \d+ s\./);
    expect(screen.getByTestId('signing-send')).toHaveProperty('disabled', true);
  });

  it.each([
    ['signing_item_not_found', 'nu mai așteaptă semnătura ta'],
    ['signer_has_no_address', 'Nu avem o adresă de email sau un telefon'],
    ['signing_code_not_sent', 'Nu am putut trimite codul'],
    ['signing_unavailable', 'Semnarea nu este disponibilă acum'],
  ])('words %s when the code is asked for', async (reason, text) => {
    vi.mocked(createPortalSigningSession).mockRejectedValueOnce(refusal(reason));
    const user = userEvent.setup();
    mountPortal(signedIn(), '/semneaza');
    await screen.findByTestId('signing-items');
    await user.click(screen.getByTestId('signing-send'));
    expect((await screen.findByTestId('signing-send-error')).textContent).toContain(text);
  });

  it('says nothing waits when the lists are empty', async () => {
    vi.mocked(useListPortalSignatureRequests).mockReturnValue(queryResult({ items: [] }));
    vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(queryResult({ agreement: null }));
    mountPortal(signedIn(), '/semneaza');
    expect(await screen.findByTestId('signing-nothing')).toBeTruthy();
  });
});

describe('the client administrator', () => {
  const administrator = participation({
    participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000002',
    kind: 'client_administrator',
    employeeId: null,
    fullName: 'Elena Dobre',
  });
  const awaiting = (id: string, lastName: string) => ({
    employee: { id, lastName, firstName: 'Ana' },
    agreement: { ...agreementAwaitingEmployee, employeeSignedAt: '2026-10-17T09:00:00Z' },
    awaitingEmployer: true,
  });
  const first = '6f0c3e43-0c1b-4f4b-8a1e-0000000000e2';
  const second = '6f0c3e43-0c1b-4f4b-8a1e-0000000000e3';

  beforeEach(() => {
    vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [administrator] }));
    vi.mocked(useListPortalSignatureRequests).mockReturnValue(queryResult({ items: [] }));
    vi.mocked(useListPortalSigningAgreements).mockReturnValue(
      queryResult({ items: [awaiting(first, 'Pop'), awaiting(second, 'Stan')] })
    );
    vi.mocked(useListPortalClientSignatureRequests).mockReturnValue(
      queryResult({
        items: [
          requestA,
          request('6f0c3e43-0c1b-4f4b-8a1e-0000000000r3', {
            slot: 'trainer',
            signerName: 'Ana Ionescu',
          }),
        ],
      })
    );
  });

  it('sees the agreements awaiting the employer and the client’s pending requests on Acasă', async () => {
    mountPortal(signedIn());
    const panel = await screen.findByTestId('home-todo');
    expect(within(panel).getAllByTestId('home-todo-item')).toHaveLength(2);
    expect(panel.textContent).toContain('Pop Ana, semnat de angajat pe 17 oct. 2026');
    expect(screen.getByTestId('home-sign').textContent).toBe('Semnează (2)');
    expect(screen.getByTestId('home-client-signatures').textContent).toBe(
      '2 semnături așteaptă la angajați'
    );
  });

  it('countersigns one agreement from the list with only that one checked', async () => {
    const user = userEvent.setup();
    mountPortal(signedIn(), '/angajati/semnaturi');
    const rows = await screen.findAllByTestId('agreement-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('client-pending-request')).toHaveLength(1);
    expect(screen.getByTestId('client-pending-request').textContent).toContain(
      'Așteaptă semnătura: Pop Ana (lucrător), Ana Ionescu (instructor).'
    );

    await user.click(within(rows[1]!).getByTestId('agreement-sign'));
    const checks = await screen.findAllByTestId('signing-item-check');
    expect(checks.map((check) => check.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    await user.click(screen.getByTestId('signing-send'));
    await waitFor(() =>
      expect(createPortalSigningSession).toHaveBeenCalledWith(
        administrator.participantId,
        { requestIds: [], agreementEmployeeIds: [second] },
        expect.anything()
      )
    );
  });
});

describe('Instruiri and Contul meu', () => {
  it('marks a record that waits for the employee and the sheet signed electronically', async () => {
    mountPortal(signedIn(), '/instruiri');
    const records = await screen.findAllByTestId('training-record');
    expect(within(records[0]!).getByTestId('training-record-signatures').textContent).toContain(
      'Așteaptă semnătura ta (lucrător).'
    );
    expect(screen.getByTestId('training-sheet-ssm-stored').textContent).toBe(
      'Fișă semnată electronic'
    );
    expect(screen.queryByTestId('training-sheet-psi-stored')).toBeNull();
  });

  it.each([
    [agreementAwaitingEmployee, 'Așteaptă semnătura ta.', true],
    [
      { ...agreementAwaitingEmployee, employeeSignedAt: '2026-10-17T09:00:00Z' },
      'L-ai semnat pe 17 octombrie 2026. Așteaptă semnătura angajatorului.',
      false,
    ],
    [
      {
        ...agreementAwaitingEmployee,
        state: 'signed_electronically' as const,
        employeeSignedAt: '2026-10-17T09:00:00Z',
        employerSignedAt: '2026-10-18T09:00:00Z',
      },
      'Semnat electronic de ambele părți pe 18 octombrie 2026.',
      false,
    ],
  ])('shows the agreement %#', async (agreement, text, signable) => {
    vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(queryResult({ agreement }));
    mountPortal(signedIn(), '/contul-meu');
    expect((await screen.findByTestId('account-agreement-state')).textContent).toBe(text);
    expect(screen.queryByTestId('account-agreement-sign') !== null).toBe(signable);
    expect(screen.getByTestId('agreement-pdf')).toBeTruthy();
  });
});
