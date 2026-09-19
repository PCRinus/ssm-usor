import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';

import { createDataClient } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { createFileStore } from '../../lib/files';
import { missingDocumentData } from './context';
import {
  type Actor,
  documentDownloadLink,
  generateClientDocuments as generate,
  listClientDocuments as list,
} from './documents';
import { loadDocumentFacts } from './facts';
import type {
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  listClientDocumentsRoute,
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
  return c.json({ ready: missing.length === 0, missing }, 200);
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
    revisionId
  );
  return c.json(link, 200);
};
