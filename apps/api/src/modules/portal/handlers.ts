import type { RouteHandler } from '@hono/zod-openapi';
import type {
  PortalClientEmployee,
  PortalEmployeeData,
  PortalMe,
  PortalResponsiblePerson,
  PortalTrainingRecord,
  PortalTrainingRecordsResponse,
  TrainingDomain,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore } from '../../lib/files';
import { type Participation, participationOf } from '../../lib/participant';
import { recordSlots, requestColumns, signatureColumns } from '../signing/record-slots';
import { testStatusColumns, toEmployeeTests } from '../tests/status';
import {
  drawTrainingSheet,
  missingSheetDataResponse,
  trainingSheetReadiness,
} from '../trainings/sheet-handlers';
import { toEmployeeTraining } from '../trainings/status';
import { toAdmission } from '../trainings/training-rows';
import type {
  getPortalEmployeeDataRoute,
  getPortalEmployeeTrainingSheetRoute,
  getPortalEmployeeTrainingSheetsRoute,
  getPortalMeRoute,
  getPortalTrainingSheetRoute,
  getPortalTrainingSheetsRoute,
  listPortalClientEmployeesRoute,
  listPortalEmployeeTrainingRecordsRoute,
  listPortalResponsiblePersonsRoute,
  listPortalTrainingRecordsRoute,
  recordPortalNoticeRoute,
  setPortalLanguageRoute,
} from './routes';

// Policies choose the rows a participant reads, not the columns: every select here names its
// columns, so the CNP, the specialist's notes and the provider's bank and terms never leave.
const trainingStatusColumns =
  'training_status(ssm_state, ssm_due_on, ssm_last_periodic_on, ssm_interval_months, ssm_interval_source, psi_state, psi_due_on, psi_last_periodic_on, psi_interval_months, psi_interval_source)';

const recordColumns = `id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, trainings!inner(domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason, source, created_at), signature_requests!signature_requests_record_of_client(${requestColumns}), training_signatures!training_signatures_record_of_client(${signatureColumns})`;

const dataColumns = `last_name, first_name, employee_number, job_title, hired_at, home_address, birth_date, birth_place, blood_group, rh_factor, qualification, education, authorizations, commute_route, commute_minutes, job_positions(name), client_workplaces!employees_workplace_in_client(name), ${trainingStatusColumns}`;

const employeeListColumns =
  `id, last_name, first_name, job_positions(name), client_workplaces!employees_workplace_in_client(name), ${trainingStatusColumns}, ${testStatusColumns}` as const;

const responsiblePersonColumns =
  'id, full_name, job_title, roles, employee_id, client_workplaces!client_responsible_persons_workplace_of_client(name)';

type EmployeeRef = { clientId: string; employeeId: string };

function ownEmployee(participation: Participation): EmployeeRef {
  if (!participation.employeeId) {
    throw new ApiError('not_found', 'This participant is not an employee of the client.');
  }
  return { clientId: participation.clientId, employeeId: participation.employeeId };
}

// Checked here and not left to the policies: an account that is also a member of the
// organization reads every employee through the members' policies.
function administrator(c: Context<ApiEnv>, participantId: string) {
  const participation = participationOf(c, participantId);
  if (participation.kind !== 'client_administrator') {
    throw new ApiError(
      'forbidden',
      "Only the client administrator sees the client's employees and responsible persons."
    );
  }
  return participation;
}

const administeredEmployee = (
  c: Context<ApiEnv>,
  participantId: string,
  employeeId: string
): EmployeeRef => ({ clientId: administrator(c, participantId).clientId, employeeId });

const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');

async function trainingRecords(
  db: DataClient,
  { clientId, employeeId }: EmployeeRef
): Promise<PortalTrainingRecordsResponse> {
  const [employee, records] = await Promise.all([
    db
      .from('employees')
      .select(`id, ${trainingStatusColumns}`)
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('training_records')
      .select(recordColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .order('trainings(held_on)', { ascending: false })
      .order('trainings(created_at)', { ascending: false })
      .order('id')
      .order('created_at', { referencedTable: 'signature_requests', ascending: false })
      .order('created_at', { referencedTable: 'training_signatures', ascending: false }),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'portal records employee');
  if (records.error) throw fromDatabaseError(records.error, 'portal training records');
  if (!employee.data) throw noSuchEmployee();
  return {
    items: records.data.map((record): PortalTrainingRecord => ({
      id: record.id,
      domain: record.trainings.domain,
      phase: record.trainings.phase,
      heldOn: record.trainings.held_on,
      durationMinutes: record.trainings.duration_minutes,
      material: record.trainings.material,
      trainer: {
        name: record.trainings.trainer_name,
        jobTitle: record.trainings.trainer_job_title,
      },
      verifier:
        record.trainings.verifier_name !== null && record.trainings.verifier_job_title !== null
          ? { name: record.trainings.verifier_name, jobTitle: record.trainings.verifier_job_title }
          : null,
      supplementaryReason: record.trainings.supplementary_reason,
      source: record.trainings.source,
      occupation: record.occupation,
      admission: toAdmission(record),
      slots: recordSlots(
        { verifierName: record.trainings.verifier_name, admittedOn: record.admitted_on },
        record.signature_requests,
        record.training_signatures,
        []
      ).map(({ slot, state, signedAt, signerName, signerJobTitle }) => ({
        slot,
        state,
        signedAt,
        signerName,
        signerJobTitle,
      })),
    })),
    training: toEmployeeTraining(employee.data.training_status),
  };
}

// A missing employee row answers 404 inside loadSheetFacts, which the readiness reads.
const sheets = (c: Context<ApiEnv>, { clientId, employeeId }: EmployeeRef) =>
  trainingSheetReadiness(createDataClient(c), clientId, employeeId);

// Storage lets only members read the templates. The participant reads the template's registry
// row through their own policy, so the path the secret key reads is one they may use.
const sheet = (
  c: Context<ApiEnv>,
  employee: EmployeeRef,
  domain: TrainingDomain,
  sequence: number | undefined
) =>
  drawTrainingSheet(
    c,
    createDataClient(c),
    { ...employee, domain, sequence },
    createAdminFileStore(c).readTemplate
  );

export const getPortalMe: RouteHandler<typeof getPortalMeRoute, ApiEnv> = async (c) =>
  c.json(
    {
      participations: c.get('participations').map((participation) => ({
        participantId: participation.participantId,
        organizationName: participation.organizationName,
        clientId: participation.clientId,
        clientName: participation.clientName,
        kind: participation.kind,
        employeeId: participation.employeeId,
        fullName: participation.fullName,
        noticeVersion: participation.noticeVersion,
        language: participation.language,
      })),
    } satisfies PortalMe,
    200
  );

export const recordPortalNotice: RouteHandler<typeof recordPortalNoticeRoute, ApiEnv> = async (
  c
) => {
  const { participantId } = c.req.valid('param');
  const { version } = c.req.valid('json');
  participationOf(c, participantId);
  const { data: recorded, error } = await createDataClient(c).rpc('record_participant_notice', {
    p_participant_id: participantId,
    p_version: version,
  });
  if (error) throw fromDatabaseError(error, 'record participant notice');
  if (!recorded) throw new ApiError('not_found', 'This participation is not yours.');
  return c.body(null, 204);
};

export const setPortalLanguage: RouteHandler<typeof setPortalLanguageRoute, ApiEnv> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { language } = c.req.valid('json');
  participationOf(c, participantId);
  const { data: saved, error } = await createDataClient(c).rpc('set_participant_language', {
    p_participant_id: participantId,
    p_language: language,
  });
  if (error) throw fromDatabaseError(error, 'set participant language');
  if (!saved) throw new ApiError('not_found', 'This participation is not yours.');
  return c.body(null, 204);
};

export const listPortalTrainingRecords: RouteHandler<
  typeof listPortalTrainingRecordsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const employee = ownEmployee(participationOf(c, participantId));
  return c.json(await trainingRecords(createDataClient(c), employee), 200);
};

export const getPortalEmployeeData: RouteHandler<
  typeof getPortalEmployeeDataRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  const { clientId, employeeId } = ownEmployee(participation);
  const db = createDataClient(c);
  const [employee, organization] = await Promise.all([
    db
      .from('employees')
      .select(dataColumns)
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db.from('organizations').select('name, phone').eq('id', participation.organizationId).single(),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'portal employee data');
  if (organization.error) throw fromDatabaseError(organization.error, 'portal provider');
  if (!employee.data) throw noSuchEmployee();
  const row = employee.data;
  return c.json(
    {
      employee: {
        lastName: row.last_name,
        firstName: row.first_name,
        employeeNumber: row.employee_number,
        contractTitle: row.job_title,
        position: row.job_positions.name,
        workplace: row.client_workplaces?.name ?? null,
        hiredAt: row.hired_at,
        homeAddress: row.home_address,
        birthDate: row.birth_date,
        birthPlace: row.birth_place,
        bloodGroup: row.blood_group as PortalEmployeeData['employee']['bloodGroup'],
        rhFactor: row.rh_factor as PortalEmployeeData['employee']['rhFactor'],
        qualification: row.qualification,
        education: row.education,
        authorizations: row.authorizations,
        commuteRoute: row.commute_route,
        commuteMinutes: row.commute_minutes,
      },
      training: toEmployeeTraining(row.training_status),
      client: { name: participation.clientName },
      provider: { name: organization.data.name, phone: organization.data.phone },
    } satisfies PortalEmployeeData,
    200
  );
};

export const getPortalTrainingSheets: RouteHandler<
  typeof getPortalTrainingSheetsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  return c.json(await sheets(c, ownEmployee(participationOf(c, participantId))), 200);
};

export const getPortalTrainingSheet: RouteHandler<
  typeof getPortalTrainingSheetRoute,
  ApiEnv
> = async (c) => {
  const { participantId, domain } = c.req.valid('param');
  const { sequence } = c.req.valid('query');
  const drawn = await sheet(c, ownEmployee(participationOf(c, participantId)), domain, sequence);
  if ('missing' in drawn) return c.json(missingSheetDataResponse(drawn.missing), 409);
  return c.body(new Uint8Array(drawn.pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('attachment', drawn.fileName),
  });
};

export const listPortalClientEmployees: RouteHandler<
  typeof listPortalClientEmployeesRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId } = administrator(c, participantId);
  const { data, error } = await createDataClient(c)
    .from('employees')
    .select(employeeListColumns)
    .eq('client_id', clientId)
    .neq('status', 'terminated')
    .is('archived_at', null)
    .order('last_name')
    .order('first_name')
    .order('id')
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'portal client employees');
  return c.json(
    {
      items: data.map((row): PortalClientEmployee => ({
        id: row.id,
        lastName: row.last_name,
        firstName: row.first_name,
        position: row.job_positions.name,
        workplace: row.client_workplaces?.name ?? null,
        training: toEmployeeTraining(row.training_status),
        tests: toEmployeeTests(row.test_status),
      })),
    },
    200
  );
};

export const listPortalResponsiblePersons: RouteHandler<
  typeof listPortalResponsiblePersonsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId } = administrator(c, participantId);
  const { data, error } = await createDataClient(c)
    .from('client_responsible_persons')
    .select(responsiblePersonColumns)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('full_name')
    .order('id');
  if (error) throw fromDatabaseError(error, 'portal responsible persons');
  return c.json(
    {
      items: data.map((row): PortalResponsiblePerson => ({
        id: row.id,
        fullName: row.full_name,
        jobTitle: row.job_title,
        roles: row.roles,
        employeeId: row.employee_id,
        workplace: row.client_workplaces?.name ?? null,
      })),
    },
    200
  );
};

export const listPortalEmployeeTrainingRecords: RouteHandler<
  typeof listPortalEmployeeTrainingRecordsRoute,
  ApiEnv
> = async (c) => {
  const { participantId, employeeId } = c.req.valid('param');
  const employee = administeredEmployee(c, participantId, employeeId);
  return c.json(await trainingRecords(createDataClient(c), employee), 200);
};

export const getPortalEmployeeTrainingSheets: RouteHandler<
  typeof getPortalEmployeeTrainingSheetsRoute,
  ApiEnv
> = async (c) => {
  const { participantId, employeeId } = c.req.valid('param');
  return c.json(await sheets(c, administeredEmployee(c, participantId, employeeId)), 200);
};

export const getPortalEmployeeTrainingSheet: RouteHandler<
  typeof getPortalEmployeeTrainingSheetRoute,
  ApiEnv
> = async (c) => {
  const { participantId, employeeId, domain } = c.req.valid('param');
  const { sequence } = c.req.valid('query');
  const drawn = await sheet(
    c,
    administeredEmployee(c, participantId, employeeId),
    domain,
    sequence
  );
  if ('missing' in drawn) return c.json(missingSheetDataResponse(drawn.missing), 409);
  return c.body(new Uint8Array(drawn.pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('attachment', drawn.fileName),
  });
};
