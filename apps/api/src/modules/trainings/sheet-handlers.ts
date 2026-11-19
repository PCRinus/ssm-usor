import type { RouteHandler } from '@hono/zod-openapi';

import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { createFileStore } from '../../lib/files';
import {
  drawTrainingSheet,
  missingSheetDataResponse,
  storedSheetLink,
  trainingSheetReadiness,
} from './employee-sheets';
import type {
  getTrainingSheetLinkRoute,
  getTrainingSheetRoute,
  getTrainingSheetsRoute,
} from './sheet-routes';

export const getTrainingSheets: RouteHandler<typeof getTrainingSheetsRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  return c.json(await trainingSheetReadiness(createDataClient(c), clientId, employeeId), 200);
};

export const getTrainingSheet: RouteHandler<typeof getTrainingSheetRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain, sequence } = c.req.valid('query');
  const sheet = await drawTrainingSheet(
    c,
    createDataClient(c),
    { clientId, employeeId, domain, sequence },
    createFileStore(c).readTemplate
  );
  if ('missing' in sheet) return c.json(missingSheetDataResponse(sheet.missing), 409);
  return c.body(new Uint8Array(sheet.pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('attachment', sheet.fileName),
  });
};

export const getTrainingSheetLink: RouteHandler<typeof getTrainingSheetLinkRoute, ApiEnv> = async (
  c
) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { domain, sequence } = c.req.valid('query');
  return c.json(
    await storedSheetLink(c, createDataClient(c), { clientId, employeeId, domain, sequence }),
    200
  );
};
