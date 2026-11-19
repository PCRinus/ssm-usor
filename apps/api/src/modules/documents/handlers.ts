import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { createFileStore } from '../../lib/files';
import { createPdfConverter, requirePdfConverter } from '../../lib/pdf';
import { documentArchive } from './archive';
import { hasRiskEvaluator, undecidedJobPositions, workersRepresentativeClash } from './context';
import {
  documentAnnexFile,
  documentDownloadLink,
  documentWordFile,
  printDocument as print,
} from './downloads';
import { loadDocumentFacts } from './facts';
import { incompleteFireSubstances } from './fire-safety';
import { generateClientDocuments as generate, regenerateDocument as regenerate } from './generate';
import { listClientDocuments as list } from './present';
import {
  listDocumentsBehind as listBehind,
  readRegenerationJob,
  startRegeneration,
  startSetRegeneration as startSetJobs,
  summarizeDocumentsBehind,
} from './regeneration';
import {
  attachSignedCopy,
  confirmSignedCopy,
  deleteDraft,
  issueDocument as issue,
  removeSignedCopy,
  saveDraftFile,
  startDraftFromIssued,
  uploadDocumentFile as upload,
} from './revisions';
import { incompleteRiskEvaluations } from './risk-assessment';
import type {
  attachDocumentSignedCopyRoute,
  confirmDocumentSignedCopyRoute,
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentAnnexRoute,
  getDocumentArchiveRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  getDocumentsBehindSummaryRoute,
  getDocumentWordRoute,
  getRegenerationJobRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  listDocumentsBehindRoute,
  printDocumentRoute,
  regenerateDocumentRoute,
  removeDocumentSignedCopyRoute,
  saveDocumentDraftFileRoute,
  startDocumentDraftRoute,
  startDocumentRegenerationRoute,
  startSetRegenerationRoute,
  uploadClientDocumentRoute,
} from './routes';
import type { Actor } from './rows';
import { rulesOf } from './sets';

// During an impersonation the documents belong to the impersonated member's organization and
// name them as the specialist, while `created_by` records the platform admin, as elsewhere.
const actorOf = (c: Context<ApiEnv>): Actor => ({
  userId: c.get('membership').userId,
  organizationId: c.get('membership').organizationId,
  createdBy: c.get('user').id,
});

export const getDocumentReadiness: RouteHandler<typeof getDocumentReadinessRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { set } = c.req.valid('query');
  const facts = await loadDocumentFacts(createDataClient(c), clientId, c.get('membership'), set);
  // The date and the first decision number are asked when generating; neither can be missing.
  const missing = rulesOf(facts, {
    issueDate: '2000-01-01',
    period: null,
    firstDecisionNumber: 1,
  }).missing();
  return c.json(
    {
      ready: missing.length === 0,
      missing,
      hints:
        facts.set === 'occupational_safety' && !hasRiskEvaluator(facts)
          ? ['provider.riskEvaluator' as const]
          : [],
      currentEmployeeCount: facts.currentEmployeeCount,
      workersRepresentativeClash: missing.includes(
        'responsible.workers_representative_is_legal_representative'
      )
        ? workersRepresentativeClash(facts)
        : null,
      undecidedJobPositions: undecidedJobPositions(
        facts,
        facts.set === 'occupational_safety' ? ['equipment', 'instructions'] : ['fire_instructions']
      ),
      incompleteRiskEvaluations:
        facts.set === 'occupational_safety'
          ? incompleteRiskEvaluations(
              facts.riskEvaluations,
              facts.jobPositions,
              facts.client.sensitiveGroupsState
            )
          : [],
      incompleteFireSubstances:
        facts.set === 'fire_safety' ? incompleteFireSubstances(facts.fireSafety.substances) : [],
    },
    200
  );
};

export const listClientDocuments: RouteHandler<typeof listClientDocumentsRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { set } = c.req.valid('query');
  return c.json(await list(createDataClient(c), actorOf(c), clientId, set), 200);
};

export const generateClientDocuments: RouteHandler<
  typeof generateClientDocumentsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const result = await generate(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    clientId,
    c.req.valid('json'),
    c.req.valid('query').set
  );
  return c.json(result, 201);
};

export const getDocumentDownload: RouteHandler<typeof getDocumentDownloadRoute, ApiEnv> = async (
  c
) => {
  const { documentId, revisionId } = c.req.valid('param');
  const link = await documentDownloadLink(
    createDataClient(c),
    createFileStore(c),
    documentId,
    revisionId,
    c.req.valid('query').format
  );
  return c.json(link, 200);
};

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const getDocumentWord: RouteHandler<typeof getDocumentWordRoute, ApiEnv> = async (c) => {
  const { documentId, revisionId } = c.req.valid('param');
  const file = await documentWordFile(
    createDataClient(c),
    createFileStore(c),
    documentId,
    revisionId
  );
  return c.body(new Uint8Array(file.bytes), 200, {
    'Content-Type': docxType,
    'Content-Disposition': contentDisposition('attachment', file.fileName),
  });
};

export const getDocumentAnnex: RouteHandler<typeof getDocumentAnnexRoute, ApiEnv> = async (c) => {
  const { documentId, revisionId, number } = c.req.valid('param');
  const file = await documentAnnexFile(createDataClient(c), documentId, revisionId, number);
  return c.body(new Uint8Array(file.bytes), 200, {
    'Content-Type': docxType,
    'Content-Disposition': contentDisposition('attachment', file.fileName),
  });
};

export const getDocumentArchive: RouteHandler<typeof getDocumentArchiveRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { set, format } = c.req.valid('query');
  const archive = await documentArchive(
    createDataClient(c),
    createFileStore(c),
    clientId,
    set,
    format
  );
  return c.body(archive.bytes, 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition('attachment', archive.fileName),
  });
};

export const regenerateDocument: RouteHandler<typeof regenerateDocumentRoute, ApiEnv> = async (
  c
) => {
  const { documentId } = c.req.valid('param');
  const document = await regenerate(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    documentId,
    c.req.valid('json')
  );
  return c.json({ document }, 200);
};

export const issueDocument: RouteHandler<typeof issueDocumentRoute, ApiEnv> = async (c) => {
  const { documentId } = c.req.valid('param');
  const document = await issue(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    documentId,
    // No body at all is an empty one.
    c.req.valid('json') ?? {},
    createPdfConverter(c)
  );
  return c.json({ document }, 200);
};

export const startDocumentDraft: RouteHandler<typeof startDocumentDraftRoute, ApiEnv> = async (
  c
) => {
  const { documentId } = c.req.valid('param');
  const document = await startDraftFromIssued(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    documentId
  );
  return c.json({ document }, 200);
};

export const deleteDocumentDraft: RouteHandler<typeof deleteDocumentDraftRoute, ApiEnv> = async (
  c
) => {
  const { documentId } = c.req.valid('param');
  await deleteDraft(createDataClient(c), createFileStore(c), documentId);
  return c.body(null, 204);
};

export const saveDocumentDraftFile: RouteHandler<
  typeof saveDocumentDraftFileRoute,
  ApiEnv
> = async (c) => {
  const { documentId } = c.req.valid('param');
  // The body is the file itself, not JSON, so it is read here rather than validated above.
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const document = await saveDraftFile(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    documentId,
    bytes
  );
  return c.json({ document }, 200);
};

export const printDocument: RouteHandler<typeof printDocumentRoute, ApiEnv> = async (c) => {
  const { documentId } = c.req.valid('param');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const pdf = await print(createDataClient(c), requirePdfConverter(c), documentId, bytes);
  return c.body(new Uint8Array(pdf), 200, { 'Content-Type': 'application/pdf' });
};

export const uploadClientDocument: RouteHandler<typeof uploadClientDocumentRoute, ApiEnv> = async (
  c
) => {
  const { clientId, typeKey } = c.req.valid('param');
  const { period } = c.req.valid('query');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const document = await upload(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    clientId,
    typeKey,
    bytes,
    period
  );
  return c.json({ document }, 200);
};

export const attachDocumentSignedCopy: RouteHandler<
  typeof attachDocumentSignedCopyRoute,
  ApiEnv
> = async (c) => {
  const { documentId } = c.req.valid('param');
  // The body is the file itself, not JSON, so it is read here rather than validated above.
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const document = await attachSignedCopy(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    documentId,
    bytes
  );
  return c.json({ document }, 200);
};

export const confirmDocumentSignedCopy: RouteHandler<
  typeof confirmDocumentSignedCopyRoute,
  ApiEnv
> = async (c) => {
  const { documentId } = c.req.valid('param');
  const document = await confirmSignedCopy(createDataClient(c), actorOf(c), documentId);
  return c.json({ document }, 200);
};

export const removeDocumentSignedCopy: RouteHandler<
  typeof removeDocumentSignedCopyRoute,
  ApiEnv
> = async (c) => {
  const { documentId } = c.req.valid('param');
  await removeSignedCopy(createDataClient(c), createFileStore(c), documentId);
  return c.body(null, 204);
};

export const listDocumentsBehind: RouteHandler<typeof listDocumentsBehindRoute, ApiEnv> = async (
  c
) => {
  const items = await listBehind(createDataClient(c), c.get('membership').organizationId);
  return c.json({ items }, 200);
};

export const startDocumentRegeneration: RouteHandler<
  typeof startDocumentRegenerationRoute,
  ApiEnv
> = async (c) => {
  const job = await startRegeneration(
    createDataClient(c),
    createAdminClient(c),
    c.env.REGENERATION_QUEUE,
    actorOf(c),
    c.req.valid('json').typeKey
  );
  return c.json({ job }, 201);
};

export const getDocumentsBehindSummary: RouteHandler<
  typeof getDocumentsBehindSummaryRoute,
  ApiEnv
> = async (c) => {
  const summary = await summarizeDocumentsBehind(
    createDataClient(c),
    c.get('membership').organizationId
  );
  return c.json(summary, 200);
};

export const startSetRegeneration: RouteHandler<typeof startSetRegenerationRoute, ApiEnv> = async (
  c
) => {
  const started = await startSetJobs(
    createDataClient(c),
    createAdminClient(c),
    c.env.REGENERATION_QUEUE,
    actorOf(c),
    c.req.valid('json').set
  );
  return c.json(started, 201);
};

export const getRegenerationJob: RouteHandler<typeof getRegenerationJobRoute, ApiEnv> = async (
  c
) => {
  const job = await readRegenerationJob(createDataClient(c), c.req.valid('param').jobId);
  return c.json({ job }, 200);
};
