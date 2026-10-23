import type { RouteHandler } from '@hono/zod-openapi';
import {
  type AcknowledgeReleasesResponse,
  type Release,
  type ReleaseErrorReason,
  type ReleaseListResponse,
  updateFeatureSchema,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type { acknowledgeReleasesRoute, getReleaseRoute, listReleasesRoute } from './routes';

const releaseColumns = 'tag, published_at, headline, lead, features, improvements, fixes, unread';

type ReleaseRow = Database['public']['Views']['release_list']['Row'];

const featuresSchema = updateFeatureSchema.array();

// The generated types make every column of a view nullable; the table behind this one has them set.
function toRelease(row: ReleaseRow): Release {
  return {
    tag: row.tag!,
    publishedAt: new Date(row.published_at!).toISOString(),
    headline: row.headline!,
    lead: row.lead,
    features: featuresSchema.parse(row.features),
    improvements: row.improvements ?? [],
    fixes: row.fixes ?? [],
    unread: row.unread ?? false,
  };
}

const releaseNotFound = () => new ApiError('not_found', 'No release has this tag.');

export const listReleases: RouteHandler<typeof listReleasesRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('release_list')
    .select(releaseColumns)
    .order('published_at', { ascending: false });
  if (error) throw fromDatabaseError(error, 'releases list');

  return c.json({ items: data.map(toRelease) } satisfies ReleaseListResponse, 200);
};

export const getRelease: RouteHandler<typeof getReleaseRoute, ApiEnv> = async (c) => {
  const { tag } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('release_list')
    .select(releaseColumns)
    .eq('tag', tag)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'release');
  if (!data) throw releaseNotFound();

  return c.json(toRelease(data), 200);
};

export const acknowledgeReleases: RouteHandler<typeof acknowledgeReleasesRoute, ApiEnv> = async (
  c
) => {
  const { tag } = c.req.valid('json');

  // Not created here as `updateProfile` does: a profile needs a name this request lacks, and an
  // account without one has nothing unread anyway.
  const { data, error } = await createDataClient(c).rpc('acknowledge_releases', { through: tag });
  if (error) {
    if (error.code === 'REL01') throw releaseNotFound();
    if (error.code === 'REL02') {
      throw new ApiError(
        'conflict',
        'The account has no profile yet.',
        undefined,
        'profile_missing' satisfies ReleaseErrorReason
      );
    }
    throw fromDatabaseError(error, 'releases acknowledge');
  }

  return c.json({ acknowledgedThrough: data } satisfies AcknowledgeReleasesResponse, 200);
};
