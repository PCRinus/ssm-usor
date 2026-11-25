import type { RouteHandler } from '@hono/zod-openapi';
import {
  type DutiesAcknowledgementChangeReason,
  dutiesAcknowledgementErrorReasons,
  type DutiesAcknowledgementRecord,
  type DutiesAcknowledgementResponse,
  type DutiesAcknowledgementState,
  type DutiesAcknowledgementStatus,
  type SsmDutyRole,
} from '@ssm-usor/contracts';
import {
  buildDutiesAcknowledgementData,
  dutiesAcknowledgementTypeKey,
  type PrintedDutyAnnex,
} from '@ssm-usor/document-engine/ssm-duties';
import type { Context } from 'hono';

import type { Json } from '../../database.types';
import { contentDisposition, fileNameWords } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createFileStore } from '../../lib/files';
import { requirePdfConverter } from '../../lib/pdf';
import { printedNames } from '../../lib/printed-names';
import { romanianDay, romanianNoon } from '../../lib/romanian';
import { mergeBuiltIn } from '../../lib/templates';
import { toIso } from '../../lib/timestamps';
import type {
  deleteDutiesAcknowledgementRecordRoute,
  getDutiesAcknowledgementRoute,
  getDutiesAcknowledgementSheetRoute,
  getDutiesAcknowledgementSheetWordRoute,
  recordDutiesAcknowledgementRoute,
} from './routes';

type Ids = { clientId: string; employeeId: string };

type HeldRole = { role: SsmDutyRole; fingerprint: string };

const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');

const stateColumns =
  'state, document_id, revision_id, issue_date, annex_number, position_name, annex_fingerprint, roles, annex_changed, roles_changed';

type StateRow = {
  state: DutiesAcknowledgementStatus;
  document_id: string | null;
  revision_id: string | null;
  issue_date: string | null;
  annex_number: number | null;
  position_name: string | null;
  annex_fingerprint: string | null;
  roles: Json | null;
  annex_changed: boolean | null;
  roles_changed: boolean | null;
};

type Sources = {
  employee: { id: string; first_name: string; last_name: string; job_position_id: string };
  state: StateRow;
};

async function sourcesOf(db: DataClient, { clientId, employeeId }: Ids): Promise<Sources> {
  const [employee, state] = await Promise.all([
    db
      .from('employees')
      .select('id, first_name, last_name, job_position_id')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('employee_duty_acknowledgement_states')
      .select(stateColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'acknowledgement employee');
  if (state.error) throw fromDatabaseError(state.error, 'acknowledgement state');
  if (!employee.data || !state.data) throw noSuchEmployee();
  return { employee: employee.data, state: state.data as StateRow };
}

const heldRoles = (roles: Json | null) => (Array.isArray(roles) ? roles : []) as HeldRole[];

const recordColumns =
  'id, state, signed_at, client_file_id, revision_id, job_position_id, position_name, annex_number, roles, recorded_at, recorded_by, document_revisions!employee_duty_acknowledgements_revision_in_organization(document_id, document_generations!document_revisions_generation_in_organization(issue_date))';

type RecordRow = {
  id: string;
  state: string;
  signed_at: string;
  client_file_id: string | null;
  revision_id: string;
  job_position_id: string;
  position_name: string;
  annex_number: number;
  roles: Json;
  recorded_at: string;
  recorded_by: string | null;
  // A record is made only against an issued revision of a generation.
  document_revisions: { document_id: string; document_generations: { issue_date: string } };
};

async function recordsOf(db: DataClient, { clientId, employeeId }: Ids) {
  const { data, error } = await db
    .from('employee_duty_acknowledgements')
    .select(recordColumns)
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .returns<RecordRow[]>();
  if (error) throw fromDatabaseError(error, 'duty acknowledgements');
  const recorders = [...new Set(data.flatMap((row) => (row.recorded_by ? [row.recorded_by] : [])))];
  if (recorders.length === 0) return { rows: data, names: new Map<string, string | null>() };
  const profiles = await db.from('profiles').select('user_id, full_name').in('user_id', recorders);
  if (profiles.error) throw fromDatabaseError(profiles.error, 'acknowledgement recorders');
  return {
    rows: data,
    names: new Map(profiles.data.map((profile) => [profile.user_id, profile.full_name])),
  };
}

const toRecord = (
  row: RecordRow,
  names: Map<string, string | null>
): DutiesAcknowledgementRecord => ({
  id: row.id,
  state: row.state as DutiesAcknowledgementState,
  signedAt: toIso(row.signed_at),
  signedOn: romanianDay(row.signed_at),
  clientFileId: row.client_file_id,
  annex: {
    documentId: row.document_revisions.document_id,
    revisionId: row.revision_id,
    issueDate: row.document_revisions.document_generations.issue_date,
    number: row.annex_number,
    position: { id: row.job_position_id, name: row.position_name },
    roles: heldRoles(row.roles).map((held) => held.role),
  },
  recordedAt: toIso(row.recorded_at),
  recordedBy: row.recorded_by
    ? { id: row.recorded_by, fullName: names.get(row.recorded_by) ?? null }
    : null,
});

const withSheet = (status: DutiesAcknowledgementStatus) =>
  status === 'to_sign' || status === 'signed' || status === 'sign_again';

function toResponse(
  { employee, state }: Sources,
  { rows, names }: Awaited<ReturnType<typeof recordsOf>>
): DutiesAcknowledgementResponse {
  const records = rows.map((row) => toRecord(row, names));
  const revision =
    state.document_id && state.revision_id && state.issue_date
      ? {
          documentId: state.document_id,
          revisionId: state.revision_id,
          issueDate: state.issue_date,
        }
      : null;
  const reasons: DutiesAcknowledgementChangeReason[] =
    state.state === 'sign_again'
      ? [
          ...(state.annex_changed ? (['annex_changed'] as const) : []),
          ...(state.roles_changed ? (['roles_changed'] as const) : []),
        ]
      : [];
  return {
    status: state.state,
    reasons,
    revision,
    annex:
      revision && withSheet(state.state)
        ? {
            ...revision,
            number: state.annex_number!,
            position: { id: employee.job_position_id, name: state.position_name! },
            roles: heldRoles(state.roles).map((held) => held.role),
          }
        : null,
    current: records[0] ?? null,
    history: records.slice(1),
  };
}

const acknowledgementOf = async (db: DataClient, ids: Ids) => {
  const [sources, records] = await Promise.all([sourcesOf(db, ids), recordsOf(db, ids)]);
  return toResponse(sources, records);
};

const noSheet = (status: DutiesAcknowledgementStatus) =>
  status === 'not_issued'
    ? ApiError.conflict(
        dutiesAcknowledgementErrorReasons.notIssued,
        'The client has no issued document 13 to acknowledge.'
      )
    : ApiError.conflict(
        dutiesAcknowledgementErrorReasons.noAnnex,
        "The issued document 13 has no annex for the employee's post."
      );

const invalid = (path: string, message: string) =>
  new ApiError('validation_error', message, [{ path, message }]);

export const getDutiesAcknowledgement: RouteHandler<
  typeof getDutiesAcknowledgementRoute,
  ApiEnv
> = async (c) => c.json(await acknowledgementOf(createDataClient(c), c.req.valid('param')), 200);

export const recordDutiesAcknowledgement: RouteHandler<
  typeof recordDutiesAcknowledgementRoute,
  ApiEnv
> = async (c) => {
  const ids = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const { employee, state } = await sourcesOf(db, ids);
  if (!withSheet(state.state)) throw noSheet(state.state);
  if (body.revisionId !== state.revision_id) {
    throw ApiError.conflict(
      dutiesAcknowledgementErrorReasons.revisionNotCurrent,
      'A newer revision of document 13 was issued since; its sheet is the one to sign.'
    );
  }
  if (body.signedOn > romanianDay(new Date())) {
    throw invalid('signedOn', 'The sheet cannot be signed in the future.');
  }
  if (body.signedOn < state.issue_date!) {
    throw invalid('signedOn', 'The sheet cannot be signed before document 13 was issued.');
  }
  const saved = await db.from('employee_duty_acknowledgements').insert({
    organization_id: c.get('membership').organizationId,
    client_id: ids.clientId,
    employee_id: employee.id,
    revision_id: body.revisionId,
    job_position_id: employee.job_position_id,
    position_name: state.position_name!,
    annex_number: state.annex_number!,
    annex_fingerprint: state.annex_fingerprint!,
    roles: state.roles ?? [],
    signed_at: romanianNoon(body.signedOn).toISOString(),
    client_file_id: body.clientFileId ?? null,
  });
  if (saved.error) {
    if (saved.error.code === '23503') {
      throw new ApiError('conflict', 'The file is not a file of this client.');
    }
    throw fromDatabaseError(saved.error, 'record duty acknowledgement');
  }
  return c.json(await acknowledgementOf(db, ids), 200);
};

export const deleteDutiesAcknowledgementRecord: RouteHandler<
  typeof deleteDutiesAcknowledgementRecordRoute,
  ApiEnv
> = async (c) => {
  const { recordId, ...ids } = c.req.valid('param');
  const db = createDataClient(c);
  const deleted = await db
    .from('employee_duty_acknowledgements')
    .delete()
    .eq('id', recordId)
    .eq('employee_id', ids.employeeId)
    .eq('client_id', ids.clientId)
    .select('id');
  if (deleted.error) throw fromDatabaseError(deleted.error, 'remove duty acknowledgement');
  if (deleted.data.length === 0) {
    throw new ApiError('not_found', 'This employee has no such record.');
  }
  return c.json(await acknowledgementOf(db, ids), 200);
};

type PrintedSnapshot = {
  branding?: unknown;
  issueDate?: unknown;
  client?: { legalName?: unknown } | null;
  dutyAnnexes?: PrintedDutyAnnex[];
};

async function sheetDocx(c: Context<ApiEnv>, ids: Ids) {
  const db = createDataClient(c);
  const { employee, state } = await sourcesOf(db, ids);
  if (!withSheet(state.state)) throw noSheet(state.state);
  const revision = await db
    .from('document_revisions')
    .select('data_snapshot')
    .eq('id', state.revision_id!)
    .single();
  if (revision.error) throw fromDatabaseError(revision.error, 'document 13 snapshot');
  const snapshot = (revision.data.data_snapshot ?? {}) as PrintedSnapshot;
  const annex = snapshot.dutyAnnexes?.find(
    (printed) => printed.positionId === employee.job_position_id
  );
  if (!annex) throw noSheet('no_annex');
  const name = `${employee.first_name} ${employee.last_name}`;
  const data = buildDutiesAcknowledgementData({
    branding: snapshot.branding === true,
    issueDate: typeof snapshot.issueDate === 'string' ? snapshot.issueDate : '',
    client: {
      legalName: typeof snapshot.client?.legalName === 'string' ? snapshot.client.legalName : '',
    },
    employee: { name },
    annex,
    roles: heldRoles(state.roles).map((held) => held.role),
  });
  const { bytes } = await mergeBuiltIn(
    db,
    createFileStore(c).readTemplate,
    dutiesAcknowledgementTypeKey,
    data,
    'duties acknowledgement',
    printedNames('occupational_safety')
  );
  return {
    docx: bytes,
    baseName: `Fisa-atributii-SSM-${fileNameWords(`${employee.last_name} ${employee.first_name}`).join('-')}`,
  };
}

export const getDutiesAcknowledgementSheetWord: RouteHandler<
  typeof getDutiesAcknowledgementSheetWordRoute,
  ApiEnv
> = async (c) => {
  const { docx, baseName } = await sheetDocx(c, c.req.valid('param'));
  return c.body(new Uint8Array(docx), 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': contentDisposition('attachment', `${baseName}.docx`),
  });
};

export const getDutiesAcknowledgementSheet: RouteHandler<
  typeof getDutiesAcknowledgementSheetRoute,
  ApiEnv
> = async (c) => {
  const pdf = requirePdfConverter(c);
  const { docx, baseName } = await sheetDocx(c, c.req.valid('param'));
  return c.body(new Uint8Array(await pdf.convertDocx(docx)), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('attachment', `${baseName}.pdf`),
  });
};
