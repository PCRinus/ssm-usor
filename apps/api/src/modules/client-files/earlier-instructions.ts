import type { RouteHandler } from '@hono/zod-openapi';
import {
  type EarlierInstructionsDomain,
  type InstructionDomain,
  instructionDomains,
} from '@ssm-usor/contracts';

import {
  archivedClientError,
  createDataClient,
  type DataClient,
  everyRow,
  fromDatabaseError,
} from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { romanianDay } from '../documents/context';
import { fileColumns, type FileRow, findClient, memberNames, withLinks } from './handlers';
import type {
  clearEarlierInstructionsUnavailableRoute,
  getEarlierInstructionsRoute,
  markEarlierInstructionsUnavailableRoute,
} from './routes';

// What a client import kept as the pack's own instructions (ADR 030's sorting) answers the
// request as well as a copy added by hand (ADR 042).
const importedInstructions = (row: FileRow, domain: InstructionDomain) =>
  row.imports?.kind === 'client' &&
  row.imports.confirmed_at !== null &&
  row.import_files.some(
    (file) =>
      file.document_kind === 'own_instructions' &&
      file.document_domain === domain &&
      file.state !== 'other_company'
  );

async function paperTrainingCount(db: DataClient, clientId: string, domain: InstructionDomain) {
  const { count, error } = await db
    .from('trainings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('domain', domain)
    .eq('source', 'paper');
  if (error) throw fromDatabaseError(error, 'count paper trainings');
  return count ?? 0;
}

export const getEarlierInstructions: RouteHandler<
  typeof getEarlierInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const [rows, answers, counts] = await Promise.all([
    everyRow<FileRow>(
      (from, to) =>
        db
          .from('client_files')
          .select(fileColumns)
          .eq('client_id', clientId)
          .is('employee_id', null)
          .or('earlier_instructions_domain.not.is.null,import_id.not.is.null')
          .order('created_at')
          .order('id')
          .range(from, to),
      'list earlier instructions'
    ),
    db
      .from('earlier_instructions_unavailable')
      .select('domain, answered_at, answered_by')
      .eq('client_id', clientId),
    Promise.all(instructionDomains.map((domain) => paperTrainingCount(db, clientId, domain))),
  ]);
  if (answers.error) throw fromDatabaseError(answers.error, 'read earlier instructions answers');
  const kept = rows.filter(
    (row) =>
      row.earlier_instructions_domain !== null ||
      instructionDomains.some((domain) => importedInstructions(row, domain))
  );
  const [files, names] = await Promise.all([
    withLinks(c, db, kept),
    memberNames(
      db,
      answers.data.map((answer) => answer.answered_by)
    ),
  ]);
  const byId = new Map(files.map((file) => [file.id, file]));
  const domains = instructionDomains.map((domain, index): EarlierInstructionsDomain => {
    const imported = kept.filter((row) => importedInstructions(row, domain));
    const added = kept.filter((row) => row.earlier_instructions_domain === domain);
    const answer = answers.data.find((each) => each.domain === domain);
    const confirmedAt = imported
      .map((row) => row.imports!.confirmed_at!)
      .sort()
      .at(0);
    return {
      domain,
      paperTrainingCount: counts[index]!,
      state:
        imported.length > 0
          ? 'imported'
          : added.length > 0
            ? 'added'
            : answer
              ? 'unavailable'
              : 'missing',
      imported: confirmedAt
        ? { confirmedOn: romanianDay(confirmedAt), files: imported.map((row) => byId.get(row.id)!) }
        : null,
      files: added.map((row) => byId.get(row.id)!),
      unavailable: answer
        ? {
            answeredAt: answer.answered_at,
            answeredBy: answer.answered_by
              ? { id: answer.answered_by, fullName: names.get(answer.answered_by) ?? null }
              : null,
          }
        : null,
    };
  });
  return c.json({ domains }, 200);
};

async function requireActiveClient(db: DataClient, clientId: string) {
  const client = await findClient(db, clientId);
  if (client.archived_at) throw archivedClientError();
  if (client.stage !== 'client') {
    throw new ApiError('conflict', 'A lead has no trainings to answer for.');
  }
}

export const markEarlierInstructionsUnavailable: RouteHandler<
  typeof markEarlierInstructionsUnavailableRoute,
  ApiEnv
> = async (c) => {
  const { clientId, domain } = c.req.valid('param');
  const db = createDataClient(c);
  await requireActiveClient(db, clientId);
  const { error } = await db.from('earlier_instructions_unavailable').upsert(
    {
      client_id: clientId,
      organization_id: c.get('membership').organizationId,
      domain,
      answered_by: c.get('user').id,
    },
    { onConflict: 'client_id,domain', ignoreDuplicates: true }
  );
  if (error) throw fromDatabaseError(error, 'answer that there are no earlier instructions');
  return c.body(null, 204);
};

export const clearEarlierInstructionsUnavailable: RouteHandler<
  typeof clearEarlierInstructionsUnavailableRoute,
  ApiEnv
> = async (c) => {
  const { clientId, domain } = c.req.valid('param');
  const db = createDataClient(c);
  await requireActiveClient(db, clientId);
  const { error } = await db
    .from('earlier_instructions_unavailable')
    .delete()
    .eq('client_id', clientId)
    .eq('domain', domain);
  if (error) throw fromDatabaseError(error, 'take back the answer');
  return c.body(null, 204);
};
