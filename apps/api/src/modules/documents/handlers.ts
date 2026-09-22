import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';

import { createDataClient } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { createFileStore } from '../../lib/files';
import { createPdfConverter } from '../../lib/pdf';
import { missingDocumentData, workersRepresentativeClash } from './context';
import {
  type Actor,
  attachSignedCopy,
  deleteDraft,
  documentDownloadLink,
  generateClientDocuments as generate,
  issueDocument as issue,
  listClientDocuments as list,
  regenerateDocument as regenerate,
  removeSignedCopy,
  saveDraftFile,
  startDraftFromIssued,
  uploadDocumentFile as upload,
} from './documents';
import { loadDocumentFacts } from './facts';
import type {
  attachDocumentSignedCopyRoute,
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  regenerateDocumentRoute,
  removeDocumentSignedCopyRoute,
  saveDocumentDraftFileRoute,
  startDocumentDraftRoute,
  uploadClientDocumentRoute,
} from './routes';

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
  const facts = await loadDocumentFacts(createDataClient(c), clientId, c.get('membership').userId);
  // The date and the first decision number are asked when generating; neither can be missing.
  const missing = missingDocumentData({
    ...facts,
    issueDate: '2000-01-01',
    firstDecisionNumber: 1,
  });
  return c.json(
    {
      ready: missing.length === 0,
      missing,
      currentEmployeeCount: facts.currentEmployeeCount,
      workersRepresentativeClash: missing.includes(
        'responsible.workers_representative_is_legal_representative'
      )
        ? workersRepresentativeClash(facts)
        : null,
    },
    200
  );
};

export const listClientDocuments: RouteHandler<typeof listClientDocumentsRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  return c.json(await list(createDataClient(c), actorOf(c), clientId), 200);
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
    c.req.valid('json')
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

export const uploadClientDocument: RouteHandler<typeof uploadClientDocumentRoute, ApiEnv> = async (
  c
) => {
  const { clientId, typeKey } = c.req.valid('param');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const document = await upload(
    createDataClient(c),
    createFileStore(c),
    actorOf(c),
    clientId,
    typeKey,
    bytes
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

export const removeDocumentSignedCopy: RouteHandler<
  typeof removeDocumentSignedCopyRoute,
  ApiEnv
> = async (c) => {
  const { documentId } = c.req.valid('param');
  await removeSignedCopy(createDataClient(c), createFileStore(c), documentId);
  return c.body(null, 204);
};
