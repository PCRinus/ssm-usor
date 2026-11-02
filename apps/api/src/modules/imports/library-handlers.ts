import type { RouteHandler } from '@hono/zod-openapi';
import {
  categoryFitsDomain,
  foldText,
  importErrorReasons,
  type ImportLibraryPart,
  type ImportLibraryPartDetail,
  type ImportLibraryPost,
  type InstructionImportChanges,
  instructionImportChangesSchema,
  libraryPartDomains,
  textHash,
} from '@ssm-usor/contracts';
import {
  type InstructionsProposal,
  instructionsProposalSchema,
  type ProposedInstruction,
} from '@ssm-usor/import';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { createAdminClient } from '../../lib/admin-db';
import { adminToolsAllowed } from '../../lib/auth';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { creditsStore } from '../credits/store';
import { existingRecords, findImport, storedChanges, storedProposal } from './handlers';
import { libraryPartExpiry, libraryReasons } from './library';
import { toClientPayload } from './payload';
import { describe } from './pipeline';
import type {
  confirmImportLibraryPartRoute,
  listImportLibraryPartsRoute,
  retryImportLibraryPartRoute,
  saveImportLibraryPartChangesRoute,
} from './routes';
import { missingImportSettings } from './settings';

type PartRow = Pick<
  Database['public']['Tables']['import_library_parts']['Row'],
  | 'part'
  | 'status'
  | 'attempt'
  | 'failure_reason'
  | 'version'
  | 'proposal'
  | 'changes'
  | 'read_at'
  | 'confirmed_at'
  | 'input_tokens'
  | 'cached_input_tokens'
  | 'output_tokens'
  | 'cost_usd'
>;

const partColumns =
  'part, status, attempt, failure_reason, version, proposal, changes, read_at, confirmed_at, input_tokens, cached_input_tokens, output_tokens, cost_usd';

type FoundImport = Awaited<ReturnType<typeof findImport>>;

const conflict = (message: string, reason: string) =>
  new ApiError('conflict', message, undefined, reason);

const noSuchPart = () =>
  new ApiError('not_found', 'This import has no such part in your organization.');

const storedInstructions = (value: unknown): InstructionsProposal | null => {
  const parsed = instructionsProposalSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const storedPartChanges = (value: unknown): InstructionImportChanges | null => {
  const parsed = instructionImportChangesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

async function partsOf(db: DataClient, importId: string) {
  const { data, error } = await db
    .from('import_library_parts')
    .select(partColumns)
    .eq('import_id', importId)
    .order('part');
  if (error) throw fromDatabaseError(error, 'list library parts');
  return data;
}

async function partOf(db: DataClient, importId: string, part: ImportLibraryPart) {
  const { data, error } = await db
    .from('import_library_parts')
    .select(partColumns)
    .eq('import_id', importId)
    .eq('part', part)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read library part');
  if (!data) throw noSuchPart();
  return data;
}

// apply_client_import answers no ids for the posts it made, so a proposal's post finds its job
// position by the name the confirmed review gave it.
async function postsOf(db: DataClient, row: FoundImport): Promise<ImportLibraryPost[]> {
  const stored = storedProposal(row.proposal);
  const existing = row.client_id ? await existingRecords(db, row.client_id) : null;
  const posts: ImportLibraryPost[] = [];
  if (stored) {
    const rows =
      row.status === 'confirmed' && existing
        ? toClientPayload({
            proposal: stored.proposal,
            changes: storedChanges(row.changes),
            intoExistingClient: row.into_existing_client,
            existing,
            registeredCompany: stored.registeredCompany,
          }).payload.job_positions
        : [];
    for (const position of stored.proposal.jobPositions) {
      const written = rows.find((each) => each.key === position.id);
      const jobPositionId = written
        ? typeof written.id === 'string'
          ? written.id
          : (existing?.jobPositions.find(
              (each) => foldText(each.name) === foldText(String(written.name ?? position.name))
            )?.id ?? null)
        : null;
      posts.push({
        id: position.id,
        name: String(written?.name ?? position.name),
        jobPositionId,
      });
    }
  }
  const taken = new Set(posts.map((post) => post.jobPositionId));
  for (const position of existing?.jobPositions ?? []) {
    if (!taken.has(position.id)) {
      posts.push({ id: position.id, name: position.name, jobPositionId: position.id });
    }
  }
  return posts;
}

function positionPostsOf(proposal: InstructionsProposal, row: FoundImport) {
  const stored = storedProposal(row.proposal);
  const byName = new Map(
    (stored?.proposal.jobPositions ?? []).map((position) => [foldText(position.name), position.id])
  );
  return Object.fromEntries(
    proposal.positions.map((position) => [
      position.key,
      position.clientPost ? (byName.get(foldText(position.clientPost)) ?? null) : null,
    ])
  );
}

const defaultPosts = (
  instruction: ProposedInstruction,
  positionPosts: Record<string, string | null>
) => [
  ...new Set(instruction.posts.flatMap((key) => (positionPosts[key] ? [positionPosts[key]] : []))),
];

const usageOf = (part: PartRow) => ({
  costUsd: Number(part.cost_usd ?? 0),
  inputTokens: Number(part.input_tokens ?? 0),
  cachedInputTokens: Number(part.cached_input_tokens ?? 0),
  outputTokens: Number(part.output_tokens ?? 0),
});

async function creditsByPart(c: Context<ApiEnv>, importId: string) {
  const entries = await creditsStore(createAdminClient(c)).importEntries([importId]);
  const credits = new Map<string, number>();
  for (const entry of entries) {
    if (entry.import_part) {
      credits.set(entry.import_part, (credits.get(entry.import_part) ?? 0) - entry.credits);
    }
  }
  return credits;
}

function present(
  c: Context<ApiEnv>,
  row: FoundImport,
  part: PartRow,
  credits: Map<string, number>
): ImportLibraryPartDetail & { proposal: InstructionsProposal | null } {
  const proposal = storedInstructions(part.proposal);
  const count = (status: ProposedInstruction['status']) =>
    proposal?.instructions.filter((instruction) => instruction.status === status).length ?? 0;
  return {
    part: part.part,
    domain: libraryPartDomains[part.part],
    status: part.status,
    attempt: part.attempt,
    failureReason: part.failure_reason,
    version: part.version,
    changes: proposal ? storedPartChanges(part.changes) : null,
    counts: proposal
      ? {
          identical: count('identical'),
          similar: count('similar'),
          new: count('new'),
          unread: proposal.unread.length,
        }
      : null,
    positionPosts: proposal ? positionPostsOf(proposal, row) : {},
    readAt: part.read_at,
    confirmedAt: part.confirmed_at,
    expiresAt: row.status === 'confirmed' ? libraryPartExpiry(row.confirmed_at) : null,
    credits: Math.max(0, credits.get(part.part) ?? 0),
    proposal,
    ...(adminToolsAllowed(c) ? { usage: usageOf(part) } : {}),
  };
}

export const listImportLibraryParts: RouteHandler<
  typeof listImportLibraryPartsRoute,
  ApiEnv
> = async (c) => {
  const { importId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  const parts = row.kind === 'client' ? await partsOf(db, importId) : [];
  if (parts.length === 0) return c.json({ parts: [], posts: [] }, 200);
  const [posts, credits] = await Promise.all([postsOf(db, row), creditsByPart(c, importId)]);
  return c.json({ parts: parts.map((part) => present(c, row, part, credits)), posts }, 200);
};

type DatabaseFailure = { code?: string | null; message?: string; details?: string | null };

function partError(error: DatabaseFailure, context: string) {
  switch (error.code) {
    case 'P0002':
      return noSuchPart();
    case 'ILP01':
      return conflict('The library part is not ready for review.', importErrorReasons.partNotReady);
    case 'ILP02':
      return conflict(
        'Someone saved the library part since you read it. Read it again.',
        importErrorReasons.changed
      );
    case 'ILP03':
      return conflict('Confirm the client first.', importErrorReasons.clientUnconfirmed);
    case 'ILP04':
      return conflict(
        'The library part expired 14 days after the client was confirmed.',
        importErrorReasons.partExpired
      );
    case 'ILP05':
      return conflict(
        error.message ?? 'A module of the library has this title.',
        importErrorReasons.titleTaken
      );
    case 'ILP06':
      return conflict('Only a failed part is read again.', importErrorReasons.partNotFailed);
    case '22023':
      console.error(`The library part payload broke its contract (${context}).`);
      return conflict(
        'The client or the library changed since the part was reviewed. Read it again.',
        importErrorReasons.outdated
      );
  }
  return fromDatabaseError(error, context);
}

function checkedChanges(
  changes: InstructionImportChanges,
  proposal: InstructionsProposal | null,
  part: ImportLibraryPart
) {
  const keys = new Set(proposal?.instructions.map((instruction) => instruction.key) ?? []);
  const issues = Object.entries(changes.instructions).flatMap(([key, change]) => [
    ...(keys.has(key) ? [] : [{ path: `changes.instructions.${key}`, message: 'unknown' }]),
    ...(change.category && !categoryFitsDomain(change.category, libraryPartDomains[part])
      ? [{ path: `changes.instructions.${key}.category`, message: 'other_domain' }]
      : []),
  ]);
  if (issues.length > 0) {
    throw new ApiError('validation_error', 'The changes name what the part does not have.', issues);
  }
}

export const saveImportLibraryPartChanges: RouteHandler<
  typeof saveImportLibraryPartChangesRoute,
  ApiEnv
> = async (c) => {
  const { importId, part } = c.req.valid('param');
  const { version, changes } = c.req.valid('json');
  const db = createDataClient(c);
  const current = await partOf(db, importId, part);
  checkedChanges(changes, storedInstructions(current.proposal), part);
  const { data, error } = await db.rpc('save_import_library_part_changes', {
    p_import_id: importId,
    p_part: part,
    p_expected_version: version,
    p_changes: JSON.parse(JSON.stringify(changes)),
  });
  if (error) throw partError(error, 'save library part changes');
  return c.json({ version: data }, 200);
};

interface LibraryPayload {
  create: {
    title: string;
    category: string;
    body: ProposedInstruction['body'];
    text_hash: string;
    job_position_ids: string[];
  }[];
  use: { module_id: string; job_position_ids: string[] }[];
}

async function libraryPayload(
  proposal: InstructionsProposal,
  changes: InstructionImportChanges | null,
  part: ImportLibraryPart,
  posts: ImportLibraryPost[],
  positionPosts: Record<string, string | null>
): Promise<{ payload: LibraryPayload; createdKeys: string[] }> {
  const jobPositionOf = new Map<string, string | null>([
    ...posts.map((post) => [post.id, post.jobPositionId] as const),
    ...posts.flatMap((post) =>
      post.jobPositionId ? [[post.jobPositionId, post.jobPositionId] as const] : []
    ),
  ]);
  const payload: LibraryPayload = { create: [], use: [] };
  const createdKeys: string[] = [];
  const issues: { path: string; message: string }[] = [];
  for (const instruction of proposal.instructions) {
    const change = changes?.instructions[instruction.key] ?? {};
    if (change.included === false) continue;
    const references = change.posts ?? defaultPosts(instruction, positionPosts);
    const jobPositionIds = [
      ...new Set(
        references.flatMap((reference) => {
          const id = jobPositionOf.get(reference);
          if (id === undefined) {
            issues.push({ path: `instructions.${instruction.key}.posts`, message: 'unknown' });
          }
          // Null for a post the client import left out, which there is nothing to apply to.
          return id ? [id] : [];
        })
      ),
    ];
    const choice = change.choice ?? instruction.choice;
    if (
      instruction.match &&
      (instruction.status === 'identical' ||
        (instruction.status === 'similar' && choice === 'use_existing'))
    ) {
      payload.use.push({ module_id: instruction.match.moduleId, job_position_ids: jobPositionIds });
      continue;
    }
    const category = change.category ?? instruction.category;
    if (!categoryFitsDomain(category, libraryPartDomains[part])) {
      issues.push({ path: `instructions.${instruction.key}.category`, message: 'other_domain' });
    }
    const body = change.body ?? instruction.body;
    createdKeys.push(instruction.key);
    payload.create.push({
      title: (change.title ?? instruction.title).trim(),
      category,
      body,
      text_hash: await textHash(body),
      job_position_ids: jobPositionIds,
    });
  }
  if (issues.some((issue) => issue.message === 'other_domain')) {
    throw new ApiError(
      'unprocessable',
      'Some values still need a decision.',
      issues.filter((issue) => issue.message === 'other_domain'),
      importErrorReasons.incomplete
    );
  }
  if (issues.length > 0) {
    throw conflict(
      'The client changed since the part was reviewed. Read it again.',
      importErrorReasons.outdated
    );
  }
  return { payload, createdKeys };
}

async function takenTitles(
  db: DataClient,
  organizationId: string,
  created: { key: string; title: string }[]
) {
  if (created.length === 0) return;
  const { data, error } = await db
    .from('instruction_modules')
    .select('title')
    .eq('organization_id', organizationId)
    .is('archived_at', null);
  if (error) throw fromDatabaseError(error, 'read library titles');
  const seen = new Set(data.map((module) => module.title.trim().toLowerCase()));
  const issues: { path: string; message: string }[] = [];
  for (const { key, title } of created) {
    const folded = title.toLowerCase();
    if (seen.has(folded)) issues.push({ path: `instructions.${key}.title`, message: 'taken' });
    seen.add(folded);
  }
  if (issues.length > 0) {
    throw new ApiError(
      'conflict',
      'A module of the library already has this title.',
      issues,
      importErrorReasons.titleTaken
    );
  }
}

export const confirmImportLibraryPart: RouteHandler<
  typeof confirmImportLibraryPartRoute,
  ApiEnv
> = async (c) => {
  const { importId, part } = c.req.valid('param');
  const { version } = c.req.valid('json');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  const current = await partOf(db, importId, part);
  if (row.status !== 'confirmed') throw partError({ code: 'ILP03' }, 'confirm library part');
  const proposal = storedInstructions(current.proposal);
  if ((current.status !== 'to_review' && current.status !== 'nothing_new') || !proposal) {
    throw partError({ code: 'ILP01' }, 'confirm library part');
  }
  if (current.version !== version) throw partError({ code: 'ILP02' }, 'confirm library part');
  const changes = storedPartChanges(current.changes);
  const posts = await postsOf(db, row);
  const { payload, createdKeys } = await libraryPayload(
    proposal,
    changes,
    part,
    posts,
    positionPostsOf(proposal, row)
  );
  await takenTitles(
    db,
    c.get('membership').organizationId,
    payload.create.map((item, index) => ({ key: createdKeys[index]!, title: item.title }))
  );
  const { data, error } = await db.rpc('apply_instruction_import', {
    p_import_id: importId,
    p_part: part,
    p_expected_version: version,
    p_payload: JSON.parse(JSON.stringify(payload)),
  });
  if (error?.code === '23514') {
    throw new ApiError(
      'unprocessable',
      'The library refused a value of the part.',
      [
        {
          path: 'instructions',
          message: fromDatabaseError(error, 'confirm library part').constraint?.name ?? 'refused',
        },
      ],
      importErrorReasons.refused
    );
  }
  if (error) throw partError(error, 'confirm library part');
  const result = data as { created: string[]; used: string[]; links: number };
  return c.json(
    {
      createdModuleIds: result.created,
      usedModuleIds: [...new Set(result.used)],
      links: result.links,
    },
    200
  );
};

export const retryImportLibraryPart: RouteHandler<
  typeof retryImportLibraryPartRoute,
  ApiEnv
> = async (c) => {
  const { importId, part } = c.req.valid('param');
  const missing = missingImportSettings(c.env);
  if (missing.length > 0) {
    console.error(`Imports are not configured: missing ${missing.join(', ')}.`);
    throw new ApiError(
      'service_unavailable',
      'Importul din documente nu este disponibil acum.',
      undefined,
      importErrorReasons.unavailable
    );
  }
  const db = createDataClient(c);
  const { data: attempt, error } = await db.rpc('retry_import_library_part', {
    p_import_id: importId,
    p_part: part,
  });
  if (error) throw partError(error, 'retry library part');
  try {
    await c.env.IMPORT_QUEUE!.send({ type: 'read-instructions', importId, part, attempt });
  } catch (failure) {
    console.error(
      `Library part ${part} of import ${importId} was not queued: ${describe(failure)}`
    );
    await createAdminClient(c)
      .from('import_library_parts')
      .update({
        status: 'failed',
        failure_reason: libraryReasons.failed,
        failed_at: new Date().toISOString(),
      })
      .eq('import_id', importId)
      .eq('part', part)
      .eq('attempt', attempt)
      .eq('status', 'reading');
    throw new ApiError('service_unavailable', undefined, undefined, importErrorReasons.unavailable);
  }
  const row = await findImport(db, importId);
  const current = await partOf(db, importId, part);
  return c.json({ part: present(c, row, current, await creditsByPart(c, importId)) }, 200);
};
