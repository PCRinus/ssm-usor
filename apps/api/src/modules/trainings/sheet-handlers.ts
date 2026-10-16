import type { RouteHandler } from '@hono/zod-openapi';
import {
  type MissingSheetDataResponse,
  type TrainingDomain,
  trainingDomains,
  trainingSheetTypeKeys,
} from '@ssm-usor/contracts';

import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createFileStore } from '../../lib/files';
import { requirePdfConverter } from '../../lib/pdf';
import { builtInTemplates, merge } from '../documents/documents';
import { toAdmission, toTraining, trainingColumns } from './handlers';
import {
  buildTrainingSheetData,
  missingSheetDataOf,
  type SheetRecord,
  type TrainingSheetFacts,
  trainingSheetFileName,
} from './sheet';
import type { getTrainingSheetRoute, getTrainingSheetsRoute } from './sheet-routes';

const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');

async function loadRecords(db: DataClient, employeeId: string, domain: TrainingDomain) {
  const { data, error } = await db
    .from('training_records')
    .select(
      `occupation, admitted_on, admitted_by_name, admitted_by_job_title, trainings!inner(${trainingColumns})`
    )
    .eq('employee_id', employeeId)
    .eq('trainings.domain', domain);
  if (error) throw fromDatabaseError(error, 'list sheet training records');
  return data.map((record): SheetRecord => ({
    occupation: record.occupation,
    admission: toAdmission(record),
    training: toTraining(record.trainings),
  }));
}

// Row-level security hides other organizations' clients and their employees, so a missing row
// is a 404 whoever the client belongs to.
async function loadSheetFacts(
  db: DataClient,
  clientId: string,
  employeeId: string
): Promise<Omit<TrainingSheetFacts, 'domain' | 'records'>> {
  const [employee, client, workplaces] = await Promise.all([
    db
      .from('employees')
      .select(
        'last_name, first_name, employee_number, job_title, home_address, birth_date, birth_place, blood_group, rh_factor, qualification, education, authorizations, commute_route, commute_minutes, job_positions(name, work_zone), client_workplaces!employees_workplace_in_client(id, name)'
      )
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db.from('clients').select('legal_name').eq('id', clientId).maybeSingle(),
    db
      .from('client_workplaces')
      .select('id, name')
      .eq('client_id', clientId)
      .is('archived_at', null)
      .order('created_at')
      .order('id')
      .limit(2),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'find sheet employee');
  if (client.error) throw fromDatabaseError(client.error, 'find sheet client');
  if (workplaces.error) throw fromDatabaseError(workplaces.error, 'find sheet workplaces');
  if (!employee.data || !client.data) throw noSuchEmployee();
  const row = employee.data;
  return {
    // Every plan carries the line for now (docs/document-branding.md).
    branding: true,
    client: { legalName: client.data.legal_name, activeWorkplaces: workplaces.data },
    employee: {
      lastName: row.last_name,
      firstName: row.first_name,
      employeeNumber: row.employee_number,
      contractTitle: row.job_title,
      homeAddress: row.home_address,
      birthDate: row.birth_date,
      birthPlace: row.birth_place,
      bloodGroup: row.blood_group,
      rhFactor: row.rh_factor,
      qualification: row.qualification,
      education: row.education,
      authorizations: row.authorizations,
      commuteRoute: row.commute_route,
      commuteMinutes: row.commute_minutes,
      workplace: row.client_workplaces,
      position: { name: row.job_positions.name, workZone: row.job_positions.work_zone },
    },
  };
}

export const getTrainingSheets: RouteHandler<typeof getTrainingSheetsRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const facts = await loadSheetFacts(createDataClient(c), clientId, employeeId);
  const readiness = (domain: TrainingDomain) => {
    const missing = missingSheetDataOf({ ...facts, domain, records: [] });
    return { ready: missing.length === 0, missing };
  };
  return c.json(
    Object.fromEntries(trainingDomains.map((domain) => [domain, readiness(domain)])) as Record<
      TrainingDomain,
      ReturnType<typeof readiness>
    >,
    200
  );
};

export const getTrainingSheet: RouteHandler<typeof getTrainingSheetRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain } = c.req.valid('query');
  const db = createDataClient(c);
  const facts: TrainingSheetFacts = {
    ...(await loadSheetFacts(db, clientId, employeeId)),
    domain,
    records: await loadRecords(db, employeeId, domain),
  };
  const missing = missingSheetDataOf(facts);
  if (missing.length > 0) {
    return c.json(
      {
        error: 'conflict',
        message: `Data the sheet prints is missing: ${missing.join(', ')}.`,
        reason: 'missing_sheet_data',
        missing,
      } satisfies MissingSheetDataResponse,
      409
    );
  }
  const pdf = requirePdfConverter(c);
  const typeKey = trainingSheetTypeKeys[domain];
  const [template] = await builtInTemplates(db, [typeKey]);
  if (!template) {
    console.error(`The template ${typeKey} is not registered: run pnpm templates:register.`);
    throw new ApiError(
      'service_unavailable',
      'The training sheet template is not available yet.',
      undefined,
      'template_missing'
    );
  }
  const { bytes } = merge(
    await createFileStore(c).readTemplate(template.storagePath),
    buildTrainingSheetData(facts),
    typeKey
  );
  const sheet = await pdf.convertDocx(bytes);
  return c.body(new Uint8Array(sheet), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition(
      'attachment',
      trainingSheetFileName(domain, facts.employee)
    ),
  });
};
