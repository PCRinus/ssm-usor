import type { RouteHandler } from '@hono/zod-openapi';
import type {
  EmployeeTrainingRecord,
  ProposedTrainingPerson,
  TrainingDetail,
  TrainingDomain,
  TrainingRequest,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Json } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { collator } from '../../lib/romanian';
import { romanianDay } from '../documents/context';
import { signedSheetContext, syncTrainingRows } from '../signed-sheets/signed-sheets';
import {
  issueSignatureRequests,
  planSignatureRequests,
  type SignaturePlan,
} from '../signing/requests';
import { fireSafetyTechnicianJobTitle, trainingProposal } from './proposal';
import type {
  createTrainingRoute,
  deleteTrainingRoute,
  getTrainingProposalRoute,
  getTrainingRoute,
  listEmployeeTrainingRecordsRoute,
  listTrainingsRoute,
  updateTrainingRoute,
} from './routes';
import { toAdmission, toTraining, trainingColumns } from './training-rows';

const signingColumns =
  'training_signatures(method, voided_at), signed_sheet_rows!signed_sheet_rows_record_of_client(id)';

const recordColumns = `id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, employees(id, last_name, first_name), ${signingColumns}`;

type RecordSigning = {
  training_signatures: { method: string; voided_at: string | null }[] | null;
  signed_sheet_rows: { id: string }[] | null;
};

function signingOf(records: RecordSigning[]) {
  const signatures = records.flatMap((record) => record.training_signatures ?? []);
  return {
    signed: signatures.some((each) => each.method === 'electronic' && each.voided_at === null),
    hasSignatures:
      signatures.length > 0 ||
      records.some((record) => (record.signed_sheet_rows ?? []).length > 0),
  };
}

const themesTypeKeys: Record<TrainingDomain, string> = {
  ssm: 'training_themes',
  psi: 'fire_training_themes',
};

const noSuchClient = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');
const noSuchTraining = () =>
  new ApiError('not_found', 'This training does not exist under this client.');

// Row-level security hides other organizations' clients, so a missing row is a 404 whether the
// client belongs to someone else or does not exist at all.
async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, legal_representative_name, legal_representative_role, periodic_training_minutes')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw noSuchClient();
  return data;
}

async function loadTraining(db: DataClient, clientId: string, trainingId: string) {
  const { data, error } = await db
    .from('trainings')
    .select(`${trainingColumns}, training_records(${recordColumns})`)
    .eq('id', trainingId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'get training');
  if (!data) throw noSuchTraining();
  const { training_records: records, ...training } = data;
  return {
    ...toTraining(training),
    ...signingOf(records as unknown as RecordSigning[]),
    signers: await slotSignersOf(
      db,
      records.map((record) => record.id)
    ),
    records: records
      .map((record) => ({
        id: record.id,
        employee: {
          id: record.employees.id,
          lastName: record.employees.last_name,
          firstName: record.employees.first_name,
        },
        occupation: record.occupation,
        admission: toAdmission(record),
      }))
      .sort(
        (a, b) =>
          collator.compare(a.employee.lastName, b.employee.lastName) ||
          collator.compare(a.employee.firstName, b.employee.firstName)
      ),
  } satisfies TrainingDetail;
}

async function slotSignersOf(db: DataClient, recordIds: string[]) {
  const signers: TrainingDetail['signers'] = { trainer: null, verifier: null, admitter: null };
  if (recordIds.length === 0) return signers;
  const { data, error } = await db
    .from('signature_requests')
    .select('slot, signer_account_id')
    .in('training_record_id', recordIds)
    .in('slot', ['trainer', 'verifier', 'admitter'])
    .neq('state', 'void')
    .not('signer_account_id', 'is', null)
    .order('issued_at');
  if (error) throw fromDatabaseError(error, 'training signers');
  for (const { slot, signer_account_id: accountId } of data) {
    if (slot !== 'trainee' && slot !== 'examiner') signers[slot] ??= accountId;
  }
  return signers;
}

const invalid = (path: string, message: string) =>
  new ApiError('validation_error', message, [{ path, message }]);

/** The attendees' records each print the name of the person's job position as it is now. */
async function attendeesOf(db: DataClient, clientId: string, body: TrainingRequest) {
  const { data, error } = await db
    .from('employees')
    .select('id, job_positions(name)')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .in('id', body.employeeIds);
  if (error) throw fromDatabaseError(error, 'find attendees');
  if (data.length !== body.employeeIds.length) {
    throw invalid('employeeIds', 'Every attendee must be an employee of this client.');
  }
  return data.map((employee) => ({
    employee_id: employee.id,
    occupation: employee.job_positions.name.trim(),
  }));
}

async function requireThemesRevision(
  db: DataClient,
  clientId: string,
  domain: TrainingDomain,
  revisionId: string
) {
  const { data, error } = await db
    .from('document_revisions')
    .select('id, client_documents!inner(client_id, type_key)')
    .eq('id', revisionId)
    .eq('client_documents.client_id', clientId)
    .eq('client_documents.type_key', themesTypeKeys[domain])
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find themes revision');
  if (!data) {
    throw invalid(
      'themesRevisionId',
      "This is not a revision of the client's training themes of this domain."
    );
  }
}

async function saveTraining(
  db: DataClient,
  clientId: string,
  trainingId: string | undefined,
  body: TrainingRequest
) {
  if (body.heldOn > romanianDay(new Date().toISOString())) {
    throw invalid('heldOn', 'A training is recorded once it has been held.');
  }
  const attendees = await attendeesOf(db, clientId, body);
  if (body.themesRevisionId) {
    await requireThemesRevision(db, clientId, body.domain, body.themesRevisionId);
  }
  const { data, error } = await db.rpc('save_training', {
    p_client_id: clientId,
    p_training_id: trainingId,
    p_domain: body.domain,
    p_phase: body.phase,
    p_held_on: body.heldOn,
    p_duration_minutes: body.durationMinutes,
    p_material: body.material,
    p_trainer_name: body.trainer.name,
    p_trainer_job_title: body.trainer.jobTitle,
    p_source: body.source,
    p_attendees: attendees as Json,
    // Left out, the database sets null: the generated types do not take null for these.
    p_verifier_name: body.verifier?.name ?? undefined,
    p_verifier_job_title: body.verifier?.jobTitle ?? undefined,
    p_supplementary_reason: body.supplementaryReason ?? undefined,
    p_themes_revision_id: body.themesRevisionId ?? undefined,
    p_notes: body.notes ?? undefined,
    p_admitted_on: body.admission?.admittedOn ?? undefined,
    p_admitted_by_name: body.admission?.name ?? undefined,
    p_admitted_by_job_title: body.admission?.jobTitle ?? undefined,
  });
  if (error) throw fromDatabaseError(error, 'save training');
  return data;
}

export const listTrainings: RouteHandler<typeof listTrainingsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { domain, phase } = c.req.valid('query');
  const db = createDataClient(c);
  await findClient(db, clientId);
  let query = db
    .from('trainings')
    .select(
      `${trainingColumns}, training_records(employees(id, last_name, first_name), ${signingColumns})`
    )
    .eq('client_id', clientId);
  if (domain) query = query.eq('domain', domain);
  if (phase) query = query.eq('phase', phase);
  const { data, error } = await query
    .order('held_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list trainings');
  return c.json(
    {
      items: data.map(({ training_records: records, ...training }) => ({
        ...toTraining(training),
        ...signingOf(records as unknown as RecordSigning[]),
        attendeeCount: records.length,
        attendees: records
          .map(({ employees: employee }) => ({
            employeeId: employee.id,
            lastName: employee.last_name,
            firstName: employee.first_name,
          }))
          .sort(
            (a, b) =>
              collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
          ),
      })),
    },
    200
  );
};

/**
 * After a save, best effort: the requests the save asks for, then the rows of its records on the
 * employees' stored sheets, filled from the records as they are now. The training stands either
 * way; a request that did not go out is issued by the next save, and a row a failed write left
 * behind is filled again before its next signature.
 */
async function afterSave(
  c: Context<ApiEnv>,
  db: DataClient,
  input: { clientId: string; trainingId: string; plan: SignaturePlan }
) {
  try {
    await issueSignatureRequests(c, db, input);
  } catch (error) {
    console.error(
      `Signature requests of training ${input.trainingId} not issued: ${error instanceof ApiError ? (error.reason ?? error.code) : error instanceof Error ? error.name : 'unknown'}`
    );
  }
  try {
    const { data, error } = await db
      .from('training_records')
      .select('id')
      .eq('training_id', input.trainingId);
    if (error) throw fromDatabaseError(error, 'records of a saved training');
    await syncTrainingRows(
      signedSheetContext(c),
      data.map((record) => record.id)
    );
  } catch (error) {
    console.error(
      `Signed sheet rows of training ${input.trainingId} not brought up to date: ${error instanceof Error ? error.name : 'unknown'}`
    );
  }
}

export const createTraining: RouteHandler<typeof createTrainingRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const body = c.req.valid('json');
  const plan = await planSignatureRequests(db, clientId, body);
  const trainingId = await saveTraining(db, clientId, undefined, body);
  if (!trainingId) throw noSuchClient();
  await afterSave(c, db, { clientId, trainingId, plan });
  return c.json({ training: await loadTraining(db, clientId, trainingId) }, 201);
};

export const getTraining: RouteHandler<typeof getTrainingRoute, ApiEnv> = async (c) => {
  const { clientId, trainingId } = c.req.valid('param');
  return c.json({ training: await loadTraining(createDataClient(c), clientId, trainingId) }, 200);
};

export const updateTraining: RouteHandler<typeof updateTrainingRoute, ApiEnv> = async (c) => {
  const { clientId, trainingId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const body = c.req.valid('json');
  const plan = await planSignatureRequests(db, clientId, body);
  const saved = await saveTraining(db, clientId, trainingId, body);
  if (!saved) throw noSuchTraining();
  await afterSave(c, db, { clientId, trainingId, plan });
  return c.json({ training: await loadTraining(db, clientId, trainingId) }, 200);
};

export const deleteTraining: RouteHandler<typeof deleteTrainingRoute, ApiEnv> = async (c) => {
  const { clientId, trainingId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('trainings')
    .delete()
    .eq('id', trainingId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete training');
  if (data.length === 0) throw noSuchTraining();
  return c.body(null, 204);
};

export const listEmployeeTrainingRecords: RouteHandler<
  typeof listEmployeeTrainingRecordsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain } = c.req.valid('query');
  const db = createDataClient(c);
  const employee = await db
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (employee.error) throw fromDatabaseError(employee.error, 'find employee');
  if (!employee.data) {
    throw new ApiError('not_found', 'This employee does not exist under this client.');
  }
  let query = db
    .from('training_records')
    .select(
      `id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, trainings!inner(${trainingColumns}, training_records(${signingColumns}))`
    )
    .eq('employee_id', employeeId);
  if (domain) query = query.eq('trainings.domain', domain);
  const { data, error } = await query
    .order('trainings(held_on)', { ascending: false })
    .order('trainings(created_at)', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list employee training records');
  return c.json(
    {
      items: data.map((record): EmployeeTrainingRecord => {
        const { training_records: records, ...training } = record.trainings;
        return {
          id: record.id,
          occupation: record.occupation,
          admission: toAdmission(record),
          training: toTraining(training),
          ...signingOf(records as unknown as RecordSigning[]),
        };
      }),
    },
    200
  );
};

const person = (
  name: string | null | undefined,
  jobTitle: string | null | undefined
): ProposedTrainingPerson | null =>
  name?.trim() ? { name: name.trim(), jobTitle: jobTitle?.trim() || null } : null;

export const getTrainingProposal: RouteHandler<typeof getTrainingProposalRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { domain, phase, heldOn, jobPositionId } = c.req.valid('query');
  const db = createDataClient(c);
  const client = await findClient(db, clientId);
  const [position, profile, organization, manager, fireSafety, themes] = await Promise.all([
    jobPositionId
      ? db
          .from('job_positions')
          .select('name, staff_category')
          .eq('id', jobPositionId)
          .eq('client_id', clientId)
          .maybeSingle()
      : null,
    db
      .from('profiles')
      .select('full_name, professional_title')
      .eq('user_id', c.get('user').id)
      .maybeSingle(),
    db
      .from('organizations')
      .select('fire_safety_technician_name')
      .eq('id', c.get('membership').organizationId)
      .maybeSingle(),
    // The order people were designated in is the order the decisions list them in.
    db
      .from('client_responsible_persons')
      .select('full_name, job_title')
      .eq('client_id', clientId)
      .contains('roles', ['workplace_manager'])
      .is('archived_at', null)
      .order('created_at')
      .order('id')
      .limit(1)
      .maybeSingle(),
    db
      .from('client_fire_safety')
      .select('periodic_training_hours')
      .eq('client_id', clientId)
      .maybeSingle(),
    phase === 'periodic' || phase === 'workplace'
      ? db
          .from('document_revisions')
          .select('id, data_snapshot, client_documents!inner(client_id, type_key)')
          .eq('client_documents.client_id', clientId)
          .eq('client_documents.type_key', themesTypeKeys[domain])
          .order('revision', { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
  ]);
  for (const [result, context] of [
    [position, 'proposal: job position'],
    [profile, 'proposal: profile'],
    [organization, 'proposal: organization'],
    [manager, 'proposal: workplace manager'],
    [fireSafety, 'proposal: fire safety'],
    [themes, 'proposal: themes'],
  ] as const) {
    if (result?.error) throw fromDatabaseError(result.error, context);
  }
  if (position && !position.data) {
    throw invalid('jobPositionId', 'This job position does not exist under this client.');
  }
  const hours = fireSafety.data?.periodic_training_hours;
  return c.json(
    trainingProposal({
      domain,
      phase,
      heldOn,
      position: position?.data
        ? { name: position.data.name, staffCategory: position.data.staff_category }
        : null,
      // An uploaded file has no data to propose from.
      themes: themes?.data?.data_snapshot
        ? { id: themes.data.id, snapshot: themes.data.data_snapshot }
        : null,
      people: {
        specialist: person(profile.data?.full_name, profile.data?.professional_title),
        workplaceManager: person(manager.data?.full_name, manager.data?.job_title),
        legalRepresentative: person(
          client.legal_representative_name,
          client.legal_representative_role
        ),
        fireSafetyTechnician: person(
          organization.data?.fire_safety_technician_name,
          fireSafetyTechnicianJobTitle
        ),
      },
      periodicMinutes:
        domain === 'ssm' ? client.periodic_training_minutes : hours ? hours * 60 : null,
    }),
    200
  );
};
