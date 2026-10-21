import type { RouteHandler } from '@hono/zod-openapi';
import {
  type FileLinkResponse,
  type MissingSheetData,
  type MissingSheetDataResponse,
  type TrainingDomain,
  trainingDomains,
  type TrainingSheetsResponse,
  trainingSheetTypeKeys,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore, createFileStore } from '../../lib/files';
import { createPdfConverter, requirePdfConverter } from '../../lib/pdf';
import { createSigner } from '../../lib/signer';
import { builtInTemplates, merge } from '../documents/documents';
import { supabaseSheetStore } from '../signed-sheets/store';
import { currentSheetPdf } from '../signed-sheets/stored';
import {
  buildTrainingSheetData,
  missingSheetDataOf,
  type SheetRecord,
  type TrainingSheetFacts,
  trainingSheetFileName,
} from './sheet';
import type {
  getTrainingSheetLinkRoute,
  getTrainingSheetRoute,
  getTrainingSheetsRoute,
} from './sheet-routes';
import { toAdmission, toTraining, trainingColumns } from './training-rows';

const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');

export async function loadRecords(db: DataClient, employeeId: string, domain: TrainingDomain) {
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
export async function loadSheetFacts(
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

async function storedSequences(db: DataClient, clientId: string, employeeId: string) {
  const { data, error } = await db
    .from('signed_sheets')
    .select('domain, sequence')
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .order('sequence');
  if (error) throw fromDatabaseError(error, 'stored sheets');
  const sequences = new Map<TrainingDomain, number[]>();
  for (const row of data) {
    sequences.set(row.domain, [...(sequences.get(row.domain) ?? []), row.sequence]);
  }
  return sequences;
}

export async function trainingSheetReadiness(
  db: DataClient,
  clientId: string,
  employeeId: string
): Promise<TrainingSheetsResponse> {
  const [facts, stored] = await Promise.all([
    loadSheetFacts(db, clientId, employeeId),
    storedSequences(db, clientId, employeeId),
  ]);
  const readiness = (domain: TrainingDomain) => {
    const sequences = stored.get(domain) ?? [];
    if (sequences.length > 0) return { ready: true, missing: [], stored: true, sequences };
    const missing = missingSheetDataOf({ ...facts, domain, records: [] });
    return { ready: missing.length === 0, missing, stored: false, sequences };
  };
  return Object.fromEntries(
    trainingDomains.map((domain) => [domain, readiness(domain)])
  ) as TrainingSheetsResponse;
}

export const missingSheetDataResponse = (missing: MissingSheetData[]) =>
  ({
    error: 'conflict',
    message: `Data the sheet prints is missing: ${missing.join(', ')}.`,
    reason: 'missing_sheet_data',
    missing,
  }) satisfies MissingSheetDataResponse;

export type DrawnSheet = { missing: MissingSheetData[] } | { pdf: Uint8Array; fileName: string };

function storedFileName(base: string, stored: { copy: boolean; sequence: number | null }) {
  if (stored.copy) return base.replace(/\.pdf$/, '-copie.pdf');
  if (stored.sequence && stored.sequence > 1)
    return base.replace(/\.pdf$/, `-${stored.sequence}.pdf`);
  return base;
}

/**
 * The stored signed sheet once signing has started (ADR 023), the original of `sequence` or the
 * copy merged from all, else the sheet drawn up on the spot. The caller reads the template, since
 * who may read Storage differs between them.
 */
export async function drawTrainingSheet(
  c: Context<ApiEnv>,
  db: DataClient,
  sheet: { clientId: string; employeeId: string; domain: TrainingDomain; sequence?: number },
  readTemplate: (storagePath: string) => Promise<Uint8Array>
): Promise<DrawnSheet> {
  const { clientId, employeeId, domain, sequence } = sheet;
  const identity = await loadSheetFacts(db, clientId, employeeId);
  const stored = await currentSheetPdf(
    {
      // The caller's own policies have shown the sheet's row, so its file is one they may read.
      store: supabaseSheetStore(db),
      files: { readDocument: (path) => adminFileStore(c.env, c.req.raw.signal).readDocument(path) },
      pdf: createPdfConverter(c),
      signer: createSigner(c),
    },
    employeeId,
    domain,
    { clientId, sequence }
  );
  if (stored) {
    return {
      pdf: stored.pdf,
      fileName: storedFileName(trainingSheetFileName(domain, identity.employee), stored),
    };
  }
  if (sequence !== undefined) {
    throw new ApiError('not_found', 'The employee has no signed sheet of this number.');
  }
  const facts: TrainingSheetFacts = {
    ...identity,
    domain,
    records: await loadRecords(db, employeeId, domain),
  };
  const missing = missingSheetDataOf(facts);
  if (missing.length > 0) return { missing };
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
    await readTemplate(template.storagePath),
    buildTrainingSheetData(facts),
    typeKey
  );
  return {
    pdf: await pdf.convertDocx(bytes),
    fileName: trainingSheetFileName(domain, facts.employee),
  };
}

/**
 * A signed link to a stored sheet, the original of `sequence` or the only one, for the page to put
 * on a real anchor. A sheet drawn up on the spot and the merged reading copy have no stored file,
 * so only the PDF route serves them.
 */
export async function storedSheetLink(
  c: Context<ApiEnv>,
  db: DataClient,
  sheet: { clientId: string; employeeId: string; domain: TrainingDomain; sequence?: number }
): Promise<FileLinkResponse> {
  const { clientId, employeeId, domain, sequence } = sheet;
  const [identity, sheets] = await Promise.all([
    loadSheetFacts(db, clientId, employeeId),
    supabaseSheetStore(db).sheets(employeeId, domain, clientId),
  ]);
  const stored =
    sequence === undefined
      ? sheets.length === 1
        ? sheets[0]
        : undefined
      : sheets.find((each) => each.sequence === sequence);
  if (!stored && (sheets.length === 0 || sequence !== undefined)) {
    throw new ApiError('not_found', 'The employee has no stored sheet of this number.');
  }
  if (!stored) {
    throw new ApiError(
      'conflict',
      'The employee has several stored sheets: name one with `sequence`.',
      undefined,
      'several_sheets'
    );
  }
  // Ten minutes: the page keeps the link on a real anchor and renews it before then; a phone may
  // sleep in between.
  const expiresInSeconds = 600;
  return {
    // The caller's own policies have shown the sheet's row, so its file is one they may read.
    url: await adminFileStore(c.env, c.req.raw.signal).documentLink(
      stored.storagePath,
      expiresInSeconds
    ),
    fileName: storedFileName(trainingSheetFileName(domain, identity.employee), {
      copy: false,
      sequence: stored.sequence,
    }),
    expiresInSeconds,
  };
}

export const getTrainingSheets: RouteHandler<typeof getTrainingSheetsRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  return c.json(await trainingSheetReadiness(createDataClient(c), clientId, employeeId), 200);
};

export const getTrainingSheet: RouteHandler<typeof getTrainingSheetRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain, sequence } = c.req.valid('query');
  const sheet = await drawTrainingSheet(
    c,
    createDataClient(c),
    { clientId, employeeId, domain, sequence },
    createFileStore(c).readTemplate
  );
  if ('missing' in sheet) return c.json(missingSheetDataResponse(sheet.missing), 409);
  return c.body(new Uint8Array(sheet.pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('attachment', sheet.fileName),
  });
};

export const getTrainingSheetLink: RouteHandler<typeof getTrainingSheetLinkRoute, ApiEnv> = async (
  c
) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain, sequence } = c.req.valid('query');
  return c.json(
    await storedSheetLink(c, createDataClient(c), { clientId, employeeId, domain, sequence }),
    200
  );
};
