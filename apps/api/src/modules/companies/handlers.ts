import type { RouteHandler } from '@hono/zod-openapi';
import { normalizeCui } from '@ssm-usor/contracts';

import { requestFetch } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { lookupCompany as lookupAnafCompany } from './anaf';
import type { lookupCompanyRoute } from './routes';

export const lookupCompany: RouteHandler<typeof lookupCompanyRoute, ApiEnv> = async (c) => {
  // Validation guarantees a well-formed CUI.
  const { cui } = normalizeCui(c.req.valid('query').cui)!;
  const company = await lookupAnafCompany(cui, requestFetch(c, 8_000));
  if (!company) throw new ApiError('not_found', 'No company is registered with this CUI.');
  return c.json({ company }, 200);
};
