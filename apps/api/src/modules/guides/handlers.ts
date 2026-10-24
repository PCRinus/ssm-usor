import type { RouteHandler } from '@hono/zod-openapi';
import {
  type GuideState,
  type GuideStateListResponse,
  guideStatusSchema,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import type { listGuidesRoute, recordGuideRoute } from './routes';

type GuideRow = Pick<
  Database['public']['Tables']['user_guides']['Row'],
  'guide' | 'version' | 'status' | 'updated_at'
>;

function toGuideState(row: GuideRow): GuideState {
  return {
    guide: row.guide,
    version: row.version,
    status: guideStatusSchema.parse(row.status),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const listGuides: RouteHandler<typeof listGuidesRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('user_guides')
    .select('guide, version, status, updated_at')
    .order('guide');
  if (error) throw fromDatabaseError(error, 'guides list');

  return c.json({ items: data.map(toGuideState) } satisfies GuideStateListResponse, 200);
};

export const recordGuide: RouteHandler<typeof recordGuideRoute, ApiEnv> = async (c) => {
  const { guide } = c.req.valid('param');
  const { version, status } = c.req.valid('json');

  const { data, error } = await createDataClient(c)
    .rpc('record_user_guide', { guide, version, status })
    .single();
  if (error) throw fromDatabaseError(error, 'guide record');

  return c.json(toGuideState(data), 200);
};
