import type { RouteHandler } from '@hono/zod-openapi';
import {
  type AppliedInstruction,
  categoryFitsDomain,
  type InstructionBody,
  instructionCategories,
  type InstructionDomain,
  type InstructionModule,
  type InstructionModuleGroup,
  type InstructionModuleSortKey,
  pageRange,
  spacedBody,
  textHash,
  unfilledMark,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { renderInstructionAnnex } from '../documents/annexes';
import { printedDate, romanianDay } from '../documents/context';
import { fileNameOf } from '../documents/documents';
import { findJobPosition } from '../job-positions/handlers';
import type {
  applyPositionInstructionsRoute,
  copyPositionInstructionsRoute,
  createInstructionModuleRoute,
  downloadInstructionModuleRoute,
  getInstructionModuleRoute,
  getInstructionModuleVersionRoute,
  listInstructionModuleChoicesRoute,
  listInstructionModulesRoute,
  listPositionInstructionsRoute,
  previewInstructionRoute,
  saveInstructionBodyRoute,
  updateInstructionModuleRoute,
} from './routes';

// The database holds the rules of the library (ADR 012, ADR 034): one title per organization,
// a category of the module's domain, no archiving a module a position applies, no new version
// on an archived one or of an unchanged body, a module applied only in its own domain, and each
// of the position's two decisions in step with the modules of its domain. The handlers word them.

type VersionRow = Pick<
  Database['public']['Tables']['instruction_module_versions']['Row'],
  'id' | 'number' | 'text_hash' | 'article_count' | 'created_at'
>;

type ListRow = Database['public']['Views']['instruction_module_list']['Row'];

// A view's columns are all nullable to the type generator; of these only archived_at can be.
type ModuleRow = {
  [Column in Exclude<keyof ListRow, 'archived_at'>]: NonNullable<ListRow[Column]>;
} & Pick<ListRow, 'archived_at'>;

const versionColumns = 'id, number, text_hash, article_count, created_at';

const moduleColumns =
  'id, title, module_group, domain, archived_at, created_at, updated_at, version_id, version_number, version_text_hash, version_article_count, version_created_at, applied_count';

const collator = new Intl.Collator('ro');

export const byGroupAndTitle = <T extends { group: InstructionModuleGroup; title: string }>(
  a: T,
  b: T
) =>
  instructionCategories.indexOf(a.group) - instructionCategories.indexOf(b.group) ||
  collator.compare(a.title, b.title);

const toVersion = (version: VersionRow) => ({
  id: version.id,
  number: version.number,
  textHash: version.text_hash,
  articleCount: version.article_count,
  createdAt: version.created_at,
});

function toModule(row: ModuleRow): InstructionModule {
  return {
    id: row.id,
    title: row.title,
    group: row.module_group,
    domain: row.domain,
    archivedAt: row.archived_at,
    version: {
      id: row.version_id,
      number: row.version_number,
      textHash: row.version_text_hash,
      articleCount: row.version_article_count,
      createdAt: row.version_created_at,
    },
    appliedCount: row.applied_count,
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

const noSuchVersion = () => new ApiError('not_found', 'This module has no such version.');

const categoryOfOtherDomain = () =>
  new ApiError(
    'validation_error',
    'The category belongs to the other domain.',
    [{ path: 'group', message: 'Choose a category of the module’s domain.' }],
    'instruction_module_category_domain'
  );

// The enum's order is the categories' order; the title breaks ties within one.
const sortColumns: Record<InstructionModuleSortKey, string[]> = {
  title: ['title'],
  group: ['module_group', 'title'],
  version: ['version_created_at'],
  appliedCount: ['applied_count'],
};

function moduleQuery(db: DataClient) {
  return db.from('instruction_module_list').select(moduleColumns);
}

async function readModule(db: DataClient, moduleId: string) {
  const { data, error } = await moduleQuery(db)
    .eq('id', moduleId)
    .returns<ModuleRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read instruction module');
  if (!data) throw noSuchModule();
  return toModule(data);
}

async function readVersion(db: DataClient, moduleId: string, versionId: string) {
  const { data, error } = await db
    .from('instruction_module_versions')
    .select(`${versionColumns}, body`)
    .eq('id', versionId)
    .eq('module_id', moduleId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read instruction module version');
  if (!data) throw noSuchVersion();
  return { version: toVersion(data), body: data.body as InstructionBody };
}

async function readModuleWithBody(db: DataClient, moduleId: string) {
  const module = await readModule(db, moduleId);
  const { body } = await readVersion(db, moduleId, module.version.id);
  return { module, body };
}

const sameBody = (left: InstructionBody, right: InstructionBody) =>
  JSON.stringify(spacedBody(left)) === JSON.stringify(spacedBody(right));

/** False when the body differs from the current version's only in whitespace. */
async function addVersion(
  db: DataClient,
  actor: { organizationId: string; userId: string },
  moduleId: string,
  body: InstructionBody
) {
  const latest = await db
    .from('instruction_module_versions')
    .select('number, body')
    .eq('module_id', moduleId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw fromDatabaseError(latest.error, 'read latest module version');
  if (latest.data && sameBody(latest.data.body as InstructionBody, body)) return false;
  const spaced = spacedBody(body);
  const { error } = await db.from('instruction_module_versions').insert({
    organization_id: actor.organizationId,
    module_id: moduleId,
    number: (latest.data?.number ?? 0) + 1,
    body: spaced,
    text_hash: await textHash(spaced),
    created_by: actor.userId,
  });
  if (error?.code === 'INS05') throw moduleArchived();
  // Another save of the same text landed first.
  if (error?.code === 'INS08') return false;
  if (error?.code === '23505') {
    throw new ApiError('conflict', 'The module was saved in the meantime; save it again.');
  }
  if (error) throw fromDatabaseError(error, 'add module version');
  return true;
}

const actorOf = (c: Context<ApiEnv>) => ({
  organizationId: c.get('membership').organizationId,
  userId: c.get('user').id,
});

async function createModule(
  db: DataClient,
  fields: {
    title: string;
    group: InstructionModuleGroup;
    domain: InstructionDomain;
    body: InstructionBody;
  }
) {
  if (!categoryFitsDomain(fields.group, fields.domain)) throw categoryOfOtherDomain();
  const body = spacedBody(fields.body);
  const { data, error } = await db.rpc('create_instruction_module', {
    p_title: fields.title,
    p_group: fields.group,
    p_domain: fields.domain,
    p_body: body,
    p_text_hash: await textHash(body),
  });
  if (error?.code === '23505') throw titleTaken();
  if (error) throw fromDatabaseError(error, 'create instruction module');
  return readModuleWithBody(db, data);
}

export const listInstructionModules: RouteHandler<
  typeof listInstructionModulesRoute,
  ApiEnv
> = async (c) => {
  const { page, pageSize, sort, order, status, domain } = c.req.valid('query');
  const db = createDataClient(c);
  const listed = () => {
    const query = db
      .from('instruction_module_list')
      .select(moduleColumns, { count: 'exact' })
      .filter('archived_at', status === 'archived' ? 'not.is' : 'is', null);
    return domain ? query.eq('domain', domain) : query;
  };
  let query = listed();
  for (const column of sortColumns[sort]) {
    query = query.order(column, { ascending: order === 'asc' });
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to).returns<ModuleRow[]>();
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count instruction modules');
    return c.json({ items: [], page, pageSize, total: recount.count ?? 0 }, 200);
  }
  if (error) throw fromDatabaseError(error, 'list instruction modules');
  return c.json({ items: data.map(toModule), page, pageSize, total: count ?? 0 }, 200);
};

export const listInstructionModuleChoices: RouteHandler<
  typeof listInstructionModuleChoicesRoute,
  ApiEnv
> = async (c) => {
  const { domain } = c.req.valid('query');
  let query = createDataClient(c)
    .from('instruction_module_list')
    .select('id, title, module_group, domain')
    .is('archived_at', null);
  if (domain) query = query.eq('domain', domain);
  const { data, error } = await query
    .order('domain')
    .order('module_group')
    .order('title')
    .order('id')
    .returns<Pick<ModuleRow, 'id' | 'title' | 'module_group' | 'domain'>[]>();
  if (error) throw fromDatabaseError(error, 'list instruction module choices');
  return c.json(
    {
      items: data.map((row) => ({
        id: row.id,
        title: row.title,
        group: row.module_group,
        domain: row.domain,
      })),
    },
    200
  );
};

export const createInstructionModule: RouteHandler<
  typeof createInstructionModuleRoute,
  ApiEnv
> = async (c) => {
  const created = await createModule(createDataClient(c), c.req.valid('json'));
  return c.json(created, 201);
};

export const getInstructionModule: RouteHandler<typeof getInstructionModuleRoute, ApiEnv> = async (
  c
) => {
  const { moduleId } = c.req.valid('param');
  return c.json(await readModuleWithBody(createDataClient(c), moduleId), 200);
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
  if (body.domain !== undefined) changes.domain = body.domain;
  if (body.archived !== undefined) {
    changes.archived_at = body.archived ? new Date().toISOString() : null;
  }
  if (body.group !== undefined || body.domain !== undefined) {
    const current = await readModule(db, moduleId);
    if (!categoryFitsDomain(body.group ?? current.group, body.domain ?? current.domain)) {
      throw categoryOfOtherDomain();
    }
  }
  if (Object.keys(changes).length > 0) {
    const { data, error } = await db
      .from('instruction_modules')
      .update(changes)
      .eq('id', moduleId)
      .select('id')
      .maybeSingle();
    if (error?.code === '23505') throw titleTaken();
    // The category changed with a concurrent move to the other domain.
    if (error?.code === '23514') throw categoryOfOtherDomain();
    if (error?.code === 'INS04') {
      throw new ApiError(
        'conflict',
        'A job position still applies this module; remove it there first.',
        undefined,
        'instruction_module_applied'
      );
    }
    if (error?.code === 'INS07') {
      throw new ApiError(
        'conflict',
        'A job position applies this module as part of its decision for the set of the current domain; remove it there before moving the module to the other set.',
        [{ path: 'domain', message: 'Remove the module from the positions that apply it first.' }],
        'instruction_module_domain_applied'
      );
    }
    if (error) throw fromDatabaseError(error, 'update instruction module');
    if (!data) throw noSuchModule();
  }
  return c.json(await readModuleWithBody(db, moduleId), 200);
};

export const saveInstructionBody: RouteHandler<typeof saveInstructionBodyRoute, ApiEnv> = async (
  c
) => {
  const { moduleId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const module = await readModule(db, moduleId);
  if (module.archivedAt) throw moduleArchived();
  const changed = await addVersion(db, actorOf(c), moduleId, body);
  return c.json({ ...(await readModuleWithBody(db, moduleId)), changed }, 200);
};

export const getInstructionModuleVersion: RouteHandler<
  typeof getInstructionModuleVersionRoute,
  ApiEnv
> = async (c) => {
  const { moduleId, versionId } = c.req.valid('param');
  return c.json(await readVersion(createDataClient(c), moduleId, versionId), 200);
};

const placeholderClient = {
  legalName: 'Numele clientului',
  representativeName: 'Numele reprezentantului',
  representativeRole: 'Administrator',
};

// Outside a client's documents there is no client to name.
async function libraryAnnexData(
  db: DataClient,
  organizationId: string,
  annex: { title: string; versionDate: string }
) {
  const { data, error } = await db
    .from('organizations')
    .select(
      'legal_name, legal_representative_name, legal_representative_role, fire_safety_technician_name'
    )
    .eq('id', organizationId)
    .single();
  if (error) throw fromDatabaseError(error, 'read organization for an annex');
  const filled = (value: string | null) => value?.trim() || unfilledMark;
  return {
    // Every plan carries the line for now (docs/document-branding.md).
    branding: true,
    issueDate: printedDate(romanianDay(new Date().toISOString())),
    provider: {
      legalName: filled(data.legal_name),
      representativeName: filled(data.legal_representative_name),
      representativeRole: filled(data.legal_representative_role),
    },
    client: placeholderClient,
    fireSafetyTechnician: { name: filled(data.fire_safety_technician_name) },
    number: 1,
    title: annex.title.trim(),
    versionDate: annex.versionDate,
  };
}

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const downloadInstructionModule: RouteHandler<
  typeof downloadInstructionModuleRoute,
  ApiEnv
> = async (c) => {
  const { moduleId } = c.req.valid('param');
  const { versionId } = c.req.valid('query');
  const db = createDataClient(c);
  const module = await readModule(db, moduleId);
  const { version, body } = await readVersion(db, moduleId, versionId ?? module.version.id);
  const data = await libraryAnnexData(db, c.get('membership').organizationId, {
    title: module.title,
    versionDate: printedDate(romanianDay(version.createdAt)),
  });
  const bytes = renderInstructionAnnex(module.domain, body, data);
  const fileName = `${fileNameOf(
    versionId ? `${module.title} - versiunea ${version.number}` : module.title
  )}.docx`;
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': docxType,
    'Content-Disposition': contentDisposition('attachment', fileName),
  });
};

export const previewInstruction: RouteHandler<typeof previewInstructionRoute, ApiEnv> = async (
  c
) => {
  const { title, domain, body } = c.req.valid('json');
  const db = createDataClient(c);
  const today = printedDate(romanianDay(new Date().toISOString()));
  const data = await libraryAnnexData(db, c.get('membership').organizationId, {
    title,
    versionDate: today,
  });
  return c.body(new Uint8Array(renderInstructionAnnex(domain, body, data)), 200, {
    'Content-Type': docxType,
  });
};

type AppliedRow = {
  module_id: string;
  instruction_modules: {
    title: string;
    module_group: InstructionModuleGroup;
    archived_at: string | null;
  };
};

async function listApplied(db: DataClient, jobPositionId: string, domain: InstructionDomain) {
  const { data, error } = await db
    .from('job_position_instructions')
    .select('module_id, instruction_modules!inner(title, module_group, archived_at)')
    .eq('job_position_id', jobPositionId)
    .eq('domain', domain)
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

const notInLibrary = () =>
  new ApiError('validation_error', 'A module is not in the library.', [
    { path: 'moduleIds', message: 'Choose modules from the library.' },
  ]);

const domainNames: Record<InstructionDomain, string> = {
  ssm: 'occupational safety',
  su: 'fire-safety',
};

const otherDomain = (modules: string[], domain: InstructionDomain) =>
  new ApiError(
    'validation_error',
    `Not ${domainNames[domain]} modules: ${modules.join(', ')}. A module is applied only as part of the decision for its own domain.`,
    [{ path: 'moduleIds', message: `Choose ${domainNames[domain]} modules.` }],
    'instruction_module_other_domain'
  );

/** Refuses a module of the other domain by its title, which the database would refuse unnamed. */
async function requireDomain(db: DataClient, moduleIds: string[], domain: InstructionDomain) {
  const { data, error } = await db
    .from('instruction_modules')
    .select('id, title, domain')
    .in('id', moduleIds);
  if (error) throw fromDatabaseError(error, 'read the domains of instruction modules');
  if (data.length < new Set(moduleIds).size) throw notInLibrary();
  const other = data.filter((module) => module.domain !== domain);
  if (other.length > 0)
    throw otherDomain(
      other.map((module) => `"${module.title}"`),
      domain
    );
}

async function apply(
  db: DataClient,
  actor: { organizationId: string; userId: string },
  clientId: string,
  jobPositionId: string,
  domain: InstructionDomain,
  moduleIds: string[]
) {
  if (moduleIds.length === 0) return;
  await requireDomain(db, moduleIds, domain);
  const { error } = await db.from('job_position_instructions').insert(
    moduleIds.map((moduleId) => ({
      organization_id: actor.organizationId,
      client_id: clientId,
      job_position_id: jobPositionId,
      module_id: moduleId,
      domain,
      created_by: actor.userId,
    }))
  );
  if (error?.code === 'INS03') throw moduleArchived();
  // Only when the module moved to the other domain since `requireDomain` read it.
  if (error?.code === 'INS06') throw otherDomain(moduleIds, domain);
  if (error?.code === '23503') throw notInLibrary();
  if (error) throw fromDatabaseError(error, 'apply instructions');
}

export const listPositionInstructions: RouteHandler<
  typeof listPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { domain } = c.req.valid('query');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const items = await listApplied(db, jobPositionId, domain);
  return c.json({ domain, items }, 200);
};

export const applyPositionInstructions: RouteHandler<
  typeof applyPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { domain } = body;
  const wanted = new Set(body.moduleIds);
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const current = new Set(
    (await listApplied(db, jobPositionId, domain)).map((item) => item.moduleId)
  );
  const removed = [...current].filter((moduleId) => !wanted.has(moduleId));
  const added = [...wanted].filter((moduleId) => !current.has(moduleId));
  // Added first: a set that only swaps modules never passes through "undecided".
  await apply(db, actorOf(c), clientId, jobPositionId, domain, added);
  if (removed.length > 0) {
    const { error } = await db
      .from('job_position_instructions')
      .delete()
      .eq('job_position_id', jobPositionId)
      .eq('domain', domain)
      .in('module_id', removed);
    if (error) throw fromDatabaseError(error, 'remove applied instructions');
  }
  const items = await listApplied(db, jobPositionId, domain);
  return c.json({ domain, items }, 200);
};

export const copyPositionInstructions: RouteHandler<
  typeof copyPositionInstructionsRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { fromJobPositionId, domain } = c.req.valid('json');
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
  const current = new Set(
    (await listApplied(db, jobPositionId, domain)).map((item) => item.moduleId)
  );
  const added = (await listApplied(db, fromJobPositionId, domain))
    .filter((item) => !item.archivedAt && !current.has(item.moduleId))
    .map((item) => item.moduleId);
  await apply(db, actorOf(c), clientId, jobPositionId, domain, added);
  const items = await listApplied(db, jobPositionId, domain);
  return c.json({ domain, items }, 200);
};
