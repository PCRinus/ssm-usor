import type { RouteHandler } from '@hono/zod-openapi';
import {
  type KnowledgeTest,
  knowledgeTestCodeOf,
  knowledgeTestTitleOf,
  type PortalSignatureRequest,
  type SignatureRequestItem,
  signatureRequestLabel,
  type SignatureRequestSlot,
  type SignatureRequestState,
  type SigningAgreementState,
  type SigningAgreementSummary,
  type SupplementaryTrainingReason,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createPortalReadClient, participationOf } from '../../lib/participant';
import { toIso, toIsoOrNull } from '../../lib/timestamps';
import { requireClient } from '../clients/lookup';
import { printedSlot, printedTestSheetName } from './printed-signers';
import { nameIn } from './record-slots';
import type {
  listClientSignatureRequestsRoute,
  listPortalClientSignatureRequestsRoute,
  listPortalSignatureRequestsRoute,
} from './routes';
import { signersOfClient } from './signers';

const agreementColumnsOfEmployee =
  'employee_signing_agreements(state, employee_signed_at, employer_signed_at)';

const listColumns = `id, slot, state, signer_account_id, issued_at, notified_at, clients!signature_requests_client_id_fkey(id, legal_name), training_records!signature_requests_record_of_client(id, training_id, employees(id, last_name, first_name, ${agreementColumnsOfEmployee}), trainings(domain, phase, held_on)), test_sheets!signature_requests_sheet_of_client(id, test_result_id, employees!test_sheets_employee_of_client(id, last_name, first_name, ${agreementColumnsOfEmployee}), test_results!test_sheets_result_of_client(domain, test, taken_on))`;

type ListEmployee = {
  id: string;
  last_name: string;
  first_name: string;
  employee_signing_agreements: AgreementSummaryRow[] | null;
};

// Any embed may come back null when a policy hides its row; such a request is left out.
type ListRow = {
  id: string;
  slot: SignatureRequestSlot;
  state: SignatureRequestState;
  signer_account_id: string | null;
  issued_at: string;
  notified_at: string | null;
  clients: { id: string; legal_name: string } | null;
  training_records: {
    id: string;
    training_id: string;
    employees: ListEmployee | null;
    trainings: { domain: TrainingDomain; phase: TrainingPhase; held_on: string } | null;
  } | null;
  test_sheets: {
    id: string;
    test_result_id: string;
    employees: ListEmployee | null;
    test_results: { domain: TrainingDomain; test: KnowledgeTest; taken_on: string } | null;
  } | null;
};

type VisibleListRow = ListRow & { clients: NonNullable<ListRow['clients']> };

const visible = (row: ListRow): row is VisibleListRow =>
  !!row.clients &&
  ((!!row.training_records?.employees && !!row.training_records.trainings) ||
    (!!row.test_sheets?.employees && !!row.test_sheets.test_results));

type AgreementSummaryRow = {
  state: string;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

const toRequestEmployee = (employee: ListEmployee) => ({
  id: employee.id,
  lastName: employee.last_name,
  firstName: employee.first_name,
});

const toListItem = (
  row: VisibleListRow,
  signer: SignatureRequestItem['signer']
): SignatureRequestItem => {
  const common = {
    id: row.id,
    slot: row.slot,
    state: row.state,
    issuedAt: toIso(row.issued_at),
    notifiedAt: toIsoOrNull(row.notified_at),
    client: { id: row.clients.id, name: row.clients.legal_name },
    signer,
  };
  const record = row.training_records;
  if (record?.employees && record.trainings) {
    const { domain, phase, held_on: heldOn } = record.trainings;
    return {
      ...common,
      kind: 'training_record',
      label: signatureRequestLabel({ kind: 'training_record', domain, phase, heldOn }),
      employee: toRequestEmployee(record.employees),
      record: {
        id: record.id,
        trainingId: record.training_id,
        employee: toRequestEmployee(record.employees),
        domain,
        phase,
        heldOn,
      },
      testSheet: null,
      agreement: agreementSummaryOf(record.employees.employee_signing_agreements),
    };
  }
  const sheet = row.test_sheets!;
  const { domain, test, taken_on: takenOn } = sheet.test_results!;
  return {
    ...common,
    kind: 'test_sheet',
    label: signatureRequestLabel({ kind: 'test_sheet', domain, test, takenOn }),
    employee: toRequestEmployee(sheet.employees!),
    record: null,
    testSheet: { id: sheet.id, resultId: sheet.test_result_id, domain, test, takenOn },
    agreement: agreementSummaryOf(sheet.employees!.employee_signing_agreements),
  };
};

const agreementSummaryOf = (
  agreements: AgreementSummaryRow[] | null | undefined
): SigningAgreementSummary => {
  const row = agreements?.[0];
  return row
    ? {
        state: row.state as SigningAgreementState,
        employeeSignedAt: toIsoOrNull(row.employee_signed_at),
        employerSignedAt: toIsoOrNull(row.employer_signed_at),
      }
    : null;
};

export const listClientSignatureRequests: RouteHandler<
  typeof listClientSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { state } = c.req.valid('query');
  const db = createDataClient(c);
  await requireClient(db, clientId);
  const { data, error } = await db
    .from('signature_requests')
    .select(listColumns)
    .eq('client_id', clientId)
    .eq('state', state)
    .order('issued_at')
    .order('id')
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'client signature requests');
  const rows = (data as unknown as ListRow[]).filter(visible);
  const directory = rows.some((row) => row.signer_account_id)
    ? await signersOfClient(db, clientId)
    : [];
  return c.json(
    { items: rows.map((row) => toListItem(row, nameIn(directory, row.signer_account_id))) },
    200
  );
};

// Read with the secret key: every portal select names its columns, so the CNP and the notes never
// leave.
const portalRecordColumns =
  'id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, employees(id, last_name, first_name, employee_signing_agreements(state, employee_signed_at, employer_signed_at)), trainings(domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason)';

type PortalRecordRow = {
  id: string;
  occupation: string;
  admitted_on: string | null;
  admitted_by_name: string | null;
  admitted_by_job_title: string | null;
  employees: {
    id: string;
    last_name: string;
    first_name: string;
    employee_signing_agreements: AgreementSummaryRow[];
  };
  trainings: {
    domain: TrainingDomain;
    phase: TrainingPhase;
    held_on: string;
    duration_minutes: number;
    material: string;
    trainer_name: string;
    trainer_job_title: string;
    verifier_name: string | null;
    verifier_job_title: string | null;
    supplementary_reason: SupplementaryTrainingReason | null;
  };
};

type PortalRequestRow = {
  id: string;
  slot: SignatureRequestSlot;
  issued_at: string;
  training_record_id: string | null;
  test_sheet_id: string | null;
};

function toPortalRequest(
  request: PortalRequestRow,
  record: PortalRecordRow
): PortalSignatureRequest {
  const training = record.trainings;
  const employee = {
    id: record.employees.id,
    lastName: record.employees.last_name,
    firstName: record.employees.first_name,
  };
  return {
    id: request.id,
    kind: 'training_record',
    label: signatureRequestLabel({
      kind: 'training_record',
      domain: training.domain,
      phase: training.phase,
      heldOn: training.held_on,
    }),
    slot: request.slot,
    issuedAt: toIso(request.issued_at),
    signerName: request.slot === 'examiner' ? '' : printedSlot(request.slot, record).name,
    employee,
    record: {
      id: record.id,
      employee,
      domain: training.domain,
      phase: training.phase,
      heldOn: training.held_on,
      durationMinutes: training.duration_minutes,
      material: training.material,
      trainer: { name: training.trainer_name, jobTitle: training.trainer_job_title },
      verifier:
        training.verifier_name !== null && training.verifier_job_title !== null
          ? { name: training.verifier_name, jobTitle: training.verifier_job_title }
          : null,
      supplementaryReason: training.supplementary_reason,
      occupation: record.occupation,
      admission:
        record.admitted_on && record.admitted_by_name
          ? {
              admittedOn: record.admitted_on,
              name: record.admitted_by_name,
              jobTitle: record.admitted_by_job_title ?? '',
            }
          : null,
    },
    testSheet: null,
    agreement: agreementSummaryOf(record.employees.employee_signing_agreements),
  };
}

const portalSheetColumns = `id, test_result_id, employees!test_sheets_employee_of_client(id, last_name, first_name, ${agreementColumnsOfEmployee}), test_results!test_sheets_result_of_client(domain, test, taken_on, examiner_name, examiner_job_title, test_attempts!test_results_attempt_of_employee(score, total))`;

type PortalSheetRow = {
  id: string;
  test_result_id: string;
  employees: ListEmployee;
  test_results: {
    domain: TrainingDomain;
    test: KnowledgeTest;
    taken_on: string;
    examiner_name: string | null;
    examiner_job_title: string | null;
    test_attempts: { score: number | null; total: number } | null;
  };
};

function toPortalSheetRequest(
  request: PortalRequestRow,
  sheet: PortalSheetRow
): PortalSignatureRequest {
  const result = sheet.test_results;
  const employee = toRequestEmployee(sheet.employees);
  const examiner =
    result.examiner_name !== null && result.examiner_job_title !== null
      ? { name: result.examiner_name, jobTitle: result.examiner_job_title }
      : null;
  return {
    id: request.id,
    kind: 'test_sheet',
    label: signatureRequestLabel({
      kind: 'test_sheet',
      domain: result.domain,
      test: result.test,
      takenOn: result.taken_on,
    }),
    slot: request.slot,
    issuedAt: toIso(request.issued_at),
    signerName: printedTestSheetName(request.slot === 'trainee' ? 'trainee' : 'examiner', sheet),
    employee,
    record: null,
    testSheet: {
      id: sheet.id,
      resultId: sheet.test_result_id,
      domain: result.domain,
      test: result.test,
      code: knowledgeTestCodeOf(result.domain, result.test),
      title: knowledgeTestTitleOf(result.domain, result.test),
      takenOn: result.taken_on,
      score: result.test_attempts?.score ?? 0,
      total: result.test_attempts?.total ?? 0,
      examiner,
    },
    agreement: agreementSummaryOf(sheet.employees.employee_signing_agreements),
  };
}

// A workplace manager signs other employees' admissions, and an examiner who is a participant
// other employees' test sheets, which the participant policies do not show. The request rows
// the participant read as themselves are the authorization for reading these, by id and client,
// with the secret key.
async function portalItems(
  c: Context<ApiEnv>,
  clientId: string,
  requests: PortalRequestRow[]
): Promise<PortalSignatureRequest[]> {
  if (requests.length === 0) return [];
  const admin = createAdminClient(c);
  const recordIds = [...new Set(requests.flatMap((request) => request.training_record_id ?? []))];
  const sheetIds = [...new Set(requests.flatMap((request) => request.test_sheet_id ?? []))];
  const [records, sheets] = await Promise.all([
    recordIds.length === 0
      ? { data: [], error: null }
      : admin
          .from('training_records')
          .select(portalRecordColumns)
          .eq('client_id', clientId)
          .in('id', recordIds),
    sheetIds.length === 0
      ? { data: [], error: null }
      : admin
          .from('test_sheets')
          .select(portalSheetColumns)
          .eq('client_id', clientId)
          .in('id', sheetIds),
  ]);
  if (records.error) throw fromDatabaseError(records.error, 'portal signature records');
  if (sheets.error) throw fromDatabaseError(sheets.error, 'portal signature test sheets');
  const recordOf = new Map(
    (records.data as unknown as PortalRecordRow[]).map((row) => [row.id, row])
  );
  const sheetOf = new Map((sheets.data as unknown as PortalSheetRow[]).map((row) => [row.id, row]));
  return requests.flatMap((request) => {
    const record = request.training_record_id ? recordOf.get(request.training_record_id) : null;
    if (record) return [toPortalRequest(request, record)];
    const sheet = request.test_sheet_id ? sheetOf.get(request.test_sheet_id) : null;
    return sheet ? [toPortalSheetRequest(request, sheet)] : [];
  });
}

const portalRequestColumns = 'id, slot, issued_at, training_record_id, test_sheet_id';

export const listPortalSignatureRequests: RouteHandler<
  typeof listPortalSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId } = participationOf(c, participantId);
  const { data: requests, error } = await createDataClient(c)
    .from('signature_requests')
    .select(portalRequestColumns)
    .eq('signer_account_id', c.get('user').id)
    .eq('client_id', clientId)
    .eq('state', 'pending')
    .order('issued_at')
    .order('id')
    .limit(1000);
  if (error) throw fromDatabaseError(error, 'portal signature requests');
  return c.json({ items: await portalItems(c, clientId, requests) }, 200);
};

export const listPortalClientSignatureRequests: RouteHandler<
  typeof listPortalClientSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  // Checked here, since the read takes the secret key.
  if (participation.kind !== 'client_administrator') {
    throw new ApiError(
      'forbidden',
      "Only the client administrator sees the client's signature requests."
    );
  }
  const { data, error } = await createPortalReadClient(c)
    .from('signature_requests')
    .select(portalRequestColumns)
    .eq('client_id', participation.clientId)
    .eq('state', 'pending')
    .order('issued_at')
    .order('id')
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'portal client signature requests');
  return c.json({ items: await portalItems(c, participation.clientId, data) }, 200);
};
