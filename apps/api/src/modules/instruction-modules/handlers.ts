import type { RouteHandler } from '@hono/zod-openapi';
import type {
  AppliedInstruction,
  InstructionModule,
  InstructionModuleGroup,
} from '@ssm-usor/contracts';
import {
  countArticles,
  firstLine,
  instructionModuleSkeleton,
  sweepFonts,
} from '@ssm-usor/document-engine';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import { requireDocx, sha256 } from '../../lib/docx';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createFileStore, type FileStore } from '../../lib/files';
import {
  findJobPosition,
  jobPositionColumns,
  jobPositionCounts,
  toJobPosition,
} from '../job-positions/handlers';
import type {
  applyPositionInstructionsRoute,
  copyPositionInstructionsRoute,
  createInstructionModuleRoute,
  decidePositionInstructionsRoute,
  getInstructionModuleRoute,
  instructionModuleFileLinkRoute,
  listInstructionModulesRoute,
  listPositionInstructionsRoute,
  saveInstructionModuleFileRoute,
  updateInstructionModuleRoute,
  uploadInstructionModuleRoute,
} from './routes';

// The database holds the rules of the library (ADR 012): one title per organization, no
// archiving a module a position applies, no new file on an archived one, and the position's
// decision in step with the modules it applies. The handlers word them.

type VersionRow = Pick<
  Database['public']['Tables']['instruction_module_versions']['Row'],
  'id' | 'number' | 'sha256' | 'size_bytes' | 'article_count' | 'created_at'
>;

type ModuleRow = Pick<
  Database['public']['Tables']['instruction_modules']['Row'],
  'id' | 'title' | 'module_group' | 'archived_at' | 'created_at' | 'updated_at'
> & { instruction_module_versions: VersionRow[] };

const moduleColumns =
  'id, title, module_group, archived_at, created_at, updated_at, instruction_module_versions(id, number, sha256, size_bytes, article_count, created_at)';

const groupOrder: Record<InstructionModuleGroup, number> = {
  work_activity: 0,
  work_equipment: 1,
  protective_equipment: 2,
};

const collator = new Intl.Collator('ro');

export const byGroupAndTitle = <T extends { group: InstructionModuleGroup; title: string }>(
  a: T,
  b: T
) => groupOrder[a.group] - groupOrder[b.group] || collator.compare(a.title, b.title);

function toModule(row: ModuleRow, appliedCount: number): InstructionModule {
  const version = row.instruction_module_versions[0];
  // The row is written before its first version; a module caught in between is not one yet.
  if (!version) throw new ApiError('not_found', 'This module has no file yet.');
  return {
    id: row.id,
    title: row.title,
    group: row.module_group,
    archivedAt: row.archived_at,
    version: {
      id: version.id,
      number: version.number,
      sha256: version.sha256,
      sizeBytes: version.size_bytes,
      articleCount: version.article_count,
      createdAt: version.created_at,
    },
    appliedCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const titleTaken = () =>
  new ApiError(
    'conflict',
    'The library already has a module of this title.',
    [{ path: 'title', message: 'The library already has a module of this title.' }],
    'instruction_module_title_taken'
  );

const moduleArchived = () =>
  new ApiError(
    'conflict',
    'The module is archived; restore it first.',
    undefined,
    'instruction_module_archived'
  );

const noSuchModule = () =>
  new ApiError('not_found', 'This module does not exist in your organization.');

function moduleQuery(db: DataClient) {
  return db
    .from('instruction_modules')
    .select(moduleColumns)
    .order('number', { referencedTable: 'instruction_module_versions', ascending: false })
    .limit(1, { referencedTable: 'instruction_module_versions' });
}

/** Per module, how many current positions apply it, across the organization's clients. */
async function appliedCounts(db: DataClient, moduleIds?: string[]) {
  let query = db
    .from('job_position_instructions')
    .select('module_id, job_positions!inner(archived_at)')
    .is('job_positions.archived_at', null);
  if (moduleIds) query = query.in('module_id', moduleIds);
  const { data, error } = await query.returns<{ module_id: string }[]>();
  if (error) throw fromDatabaseError(error, 'count applied instructions');
  const counts = new Map<string, number>();
  for (const row of data) counts.set(row.module_id, (counts.get(row.module_id) ?? 0) + 1);
  return counts;
}

async function readModule(db: DataClient, moduleId: string) {
  const { data, error } = await moduleQuery(db).eq('id', moduleId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'read instruction module');
  if (!data) throw noSuchModule();
  const counts = await appliedCounts(db, [moduleId]);
  return toModule(data, counts.get(moduleId) ?? 0);
}

async function addVersion(
  db: DataClient,
  files: FileStore,
  actor: { organizationId: string; userId: string },
  moduleId: string,
  bytes: Uint8Array
) {
  const latest = await db
    .from('instruction_module_versions')
    .select('number')
    .eq('module_id', moduleId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw fromDatabaseError(latest.error, 'read latest module version');
  const number = (latest.data?.number ?? 0) + 1;
  // The row before the file: the storage policy accepts only a path a version names.
  const path = `${actor.organizationId}/${moduleId}/${number}.docx`;
  const { error } = await db.from('instruction_module_versions').insert({
    organization_id: actor.organizationId,
    module_id: moduleId,
    number,
    docx_path: path,
    sha256: await sha256(bytes),
    size_bytes: bytes.length,
    article_count: countArticles(bytes),
    created_by: actor.userId,
  });
  if (error?.code === 'INS05') throw moduleArchived();
  if (error) throw fromDatabaseError(error, 'add module version');
  await files.writeModule(path, bytes);
}

const actorOf = (c: Context<ApiEnv>) => ({
  organizationId: c.get('membership').organizationId,
  userId: c.get('user').id,
});

async function createModule(
  db: DataClient,
  files: FileStore,
  actor: { organizationId: string; userId: string },
  fields: { title: string; group: InstructionModuleGroup },
  bytes: Uint8Array
) {
  const { data, error } = await db
    .from('instruction_modules')
    .insert({
      organization_id: actor.organizationId,
      title: fields.title,
      module_group: fields.group,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw titleTaken();
  if (error) throw fromDatabaseError(error, 'create instruction module');
  await addVersion(db, files, actor, data.id, bytes);
  return readModule(db, data.id);
}

export const listInstructionModules: RouteHandler<
  typeof listInstructionModulesRoute,
  ApiEnv
> = async (c) => {
  const { archived } = c.req.valid('query');
  const db = createDataClient(c);
  let query = moduleQuery(db);
  query =
    archived === 'true' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, error } = await query;
  if (error) throw fromDatabaseError(error, 'list instruction modules');
  const counts = await appliedCounts(db);
  const items = data
    .filter((row) => row.instruction_module_versions.length > 0)
    .map((row) => toModule(row, counts.get(row.id) ?? 0))
    .sort(byGroupAndTitle);
  return c.json({ items }, 200);
};

export const createInstructionModule: RouteHandler<
  typeof createInstructionModuleRoute,
  ApiEnv
> = async (c) => {
  const body = c.req.valid('json');
  const module = await createModule(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    body,
    instructionModuleSkeleton()
  );
  return c.json({ module }, 201);
};

export const uploadInstructionModule: RouteHandler<
  typeof uploadInstructionModuleRoute,
  ApiEnv
> = async (c) => {
  const query = c.req.valid('query');
  // The body is the file itself, not JSON, so it is read here rather than validated above.
  const uploaded = new Uint8Array(await c.req.arrayBuffer());
  requireDocx(uploaded);
  const bytes = sweepFonts(uploaded);
  const title = (query.title ?? firstLine(bytes) ?? '').slice(0, 200).trim();
  if (title.length < 2) {
    throw new ApiError('validation_error', 'The file has no first line to take a title from.', [
      { path: 'title', message: 'Give the module a title.' },
    ]);
  }
  const module = await createModule(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    { title, group: query.group },
    bytes
  );
  return c.json({ module }, 201);
};

export const getInstructionModule: RouteHandler<typeof getInstructionModuleRoute, ApiEnv> = async (
  c
) => {
  const { moduleId } = c.req.valid('param');
  return c.json({ module: await readModule(createDataClient(c), moduleId) }, 200);
};

export const updateInstructionModule: RouteHandler<
  typeof updateInstructionModuleRoute,
  ApiEnv
> = async (c) => {
  const { moduleId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const changes: Database['public']['Tables']['instruction_modules']['Update'] = {};
  if (body.title !== undefined) changes.title = body.title;
  if (body.group !== undefined) changes.module_group = body.group;
  if (body.archived !== undefined) {
    changes.archived_at = body.archived ? new Date().toISOString() : null;
  }
  if (Object.keys(changes).length > 0) {
    const { data, error } = await db
      .from('instruction_modules')
      .update(changes)
      .eq('id', moduleId)
      .select('id')
      .maybeSingle();
    if (error?.code === '23505') throw titleTaken();
    if (error?.code === 'INS04') {
      throw new ApiError(
        'conflict',
        'A job position still applies this module; remove it there first.',
        undefined,
        'instruction_module_applied'
      );
    }
    if (error) throw fromDatabaseError(error, 'update instruction module');
    if (!data) throw noSuchModule();
  }
  return c.json({ module: await readModule(db, moduleId) }, 200);
};

const fileNameOf = (title: string) =>
  `${title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()}.docx`;

export const getInstructionModuleFileLink: RouteHandler<
  typeof instructionModuleFileLinkRoute,
  ApiEnv
> = async (c) => {
  const { moduleId } = c.req.valid('param');
  const db = createDataClient(c);
  const module = await readModule(db, moduleId);
  const expiresInSeconds = 60;
  const path = `${c.get('membership').organizationId}/${moduleId}/${module.version.number}.docx`;
  const fileName = fileNameOf(module.title);
  return c.json(
    {
      url: await createFileStore(c).moduleLink(path, fileName, expiresInSeconds),
      fileName,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    },
    200
  );
};

export const saveInstructionModuleFile: RouteHandler<
  typeof saveInstructionModuleFileRoute,
  ApiEnv
> = async (c) => {
  const { moduleId } = c.req.valid('param');
  // The body is the file itself, not JSON, so it is read here rather than validated above.
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  requireDocx(bytes);
  const db = createDataClient(c);
  const module = await readModule(db, moduleId);
  if (module.archivedAt) throw moduleArchived();
  await addVersion(db, createFileStore(c), actorOf(c), moduleId, bytes);
  return c.json({ module: await readModule(db, moduleId) }, 200);
};

type AppliedRow = {
  module_id: string;
  instruction_modules: {
    title: string;
    module_group: InstructionModuleGroup;
    archived_at: string | null;
  };
};

async function listApplied(db: DataClient, jobPositionId: string) {
  const { data, error } = await db
    .from('job_position_instructions')
    .select('module_id, instruction_modules!inner(title, module_group, archived_at)')
    .eq('job_position_id', jobPositionId)
    .returns<AppliedRow[]>();
  if (error) throw fromDatabaseError(error, 'list applied instructions');
  return data
    .map((row): AppliedInstruction => ({
      moduleId: row.module_id,
      title: row.instruction_modules.title,
      group: row.instruction_modules.module_group,
      archivedAt: row.instruction_modules.archived_at,
    }))
    .sort(byGroupAndTitle);
}

async function decisionOf(db: DataClient, jobPositionId: string) {
  const { data, error } = await db
    .from('job_positions')
    .select('needs_instructions')
    .eq('id', jobPositionId)
    .single();
  if (error) throw fromDatabaseError(error, 'read instructions decision');
  return data.needs_instructions;
}

async function apply(
  db: DataClient,
  actor: { organizationId: string; userId: string },
  clientId: string,
  jobPositionId: string,
  moduleIds: string[]
) {
  if (moduleIds.length === 0) return;
  const { error } = await db.from('job_position_instructions').insert(
    moduleIds.map((moduleId) => ({
      organization_id: actor.organizationId,
      client_id: clientId,
      job_position_id: jobPositionId,
      module_id: moduleId,
      created_by: actor.userId,
    }))
  );
  if (error?.code === 'INS03') throw moduleArchived();
  if (error?.code === '23503') {
    throw new ApiError('validation_error', 'A module is not in the library.', [
      { path: 'moduleIds', message: 'Choose modules from the library.' },
    ]);
  }
  if (error) throw fromDatabaseError(error, 'apply instructions');
}

export const listPositionInstructions: RouteHandler<
  typeof listPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  const position = await findJobPosition(db, clientId, jobPositionId);
  const items = await listApplied(db, jobPositionId);
  return c.json({ items, needsInstructions: position.needs_instructions }, 200);
};

export const applyPositionInstructions: RouteHandler<
  typeof applyPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const wanted = new Set(c.req.valid('json').moduleIds);
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const current = new Set((await listApplied(db, jobPositionId)).map((item) => item.moduleId));
  const removed = [...current].filter((moduleId) => !wanted.has(moduleId));
  const added = [...wanted].filter((moduleId) => !current.has(moduleId));
  // Added first: a set that only swaps modules never passes through "undecided".
  await apply(db, actorOf(c), clientId, jobPositionId, added);
  if (removed.length > 0) {
    const { error } = await db
      .from('job_position_instructions')
      .delete()
      .eq('job_position_id', jobPositionId)
      .in('module_id', removed);
    if (error) throw fromDatabaseError(error, 'remove applied instructions');
  }
  const items = await listApplied(db, jobPositionId);
  return c.json({ items, needsInstructions: await decisionOf(db, jobPositionId) }, 200);
};

export const copyPositionInstructions: RouteHandler<
  typeof copyPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { fromJobPositionId } = c.req.valid('json');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  if (fromJobPositionId === jobPositionId) {
    throw new ApiError('validation_error', 'A position cannot copy its own modules.', [
      { path: 'fromJobPositionId', message: 'Choose another position of this client.' },
    ]);
  }
  const source = await db
    .from('job_positions')
    .select('id')
    .eq('id', fromJobPositionId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (source.error) throw fromDatabaseError(source.error, 'find source job position');
  if (!source.data) {
    throw new ApiError('validation_error', 'The source is not a position of this client.', [
      { path: 'fromJobPositionId', message: 'Choose another position of this client.' },
    ]);
  }
  const current = new Set((await listApplied(db, jobPositionId)).map((item) => item.moduleId));
  const added = (await listApplied(db, fromJobPositionId))
    .filter((item) => !item.archivedAt && !current.has(item.moduleId))
    .map((item) => item.moduleId);
  await apply(db, actorOf(c), clientId, jobPositionId, added);
  const items = await listApplied(db, jobPositionId);
  return c.json({ items, needsInstructions: await decisionOf(db, jobPositionId) }, 200);
};

export const decidePositionInstructions: RouteHandler<
  typeof decidePositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { needsInstructions } = c.req.valid('json');
  if (needsInstructions === true) {
    throw new ApiError(
      'validation_error',
      'Applying a module says that the position needs instructions.',
      [{ path: 'needsInstructions', message: 'Apply a module instead.' }],
      'instructions_decided_by_modules'
    );
  }
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('job_positions')
    .update({ needs_instructions: needsInstructions })
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .select(jobPositionColumns)
    .single();
  if (error?.code === 'INS01') {
    throw new ApiError(
      'conflict',
      'The position applies modules; remove them before saying it needs none.',
      undefined,
      'instructions_applied'
    );
  }
  if (error) throw fromDatabaseError(error, 'decide instructions');
  const counts = await jobPositionCounts(db, clientId, jobPositionId);
  return c.json({ jobPosition: toJobPosition(data, counts.get(jobPositionId)) }, 200);
};
