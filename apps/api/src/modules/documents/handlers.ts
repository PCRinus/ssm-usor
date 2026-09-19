import type { RouteHandler } from '@hono/zod-openapi';

import { createDataClient } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { missingDocumentData } from './context';
import { loadDocumentFacts } from './facts';
import type { getDocumentReadinessRoute } from './routes';

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
