import type { RouteHandler } from '@hono/zod-openapi';

import type { ApiEnv } from '../../lib/env';
import type {
  deleteDutiesAcknowledgementRecordRoute,
  getDutiesAcknowledgementRoute,
  getDutiesAcknowledgementSheetRoute,
  getDutiesAcknowledgementSheetWordRoute,
  recordDutiesAcknowledgementRoute,
} from './routes';

const notImplemented = () => {
  throw new Error('Not implemented');
};

export const getDutiesAcknowledgement: RouteHandler<typeof getDutiesAcknowledgementRoute, ApiEnv> =
  notImplemented;

export const getDutiesAcknowledgementSheet: RouteHandler<
  typeof getDutiesAcknowledgementSheetRoute,
  ApiEnv
> = notImplemented;

export const getDutiesAcknowledgementSheetWord: RouteHandler<
  typeof getDutiesAcknowledgementSheetWordRoute,
  ApiEnv
> = notImplemented;

export const recordDutiesAcknowledgement: RouteHandler<
  typeof recordDutiesAcknowledgementRoute,
  ApiEnv
> = notImplemented;

export const deleteDutiesAcknowledgementRecord: RouteHandler<
  typeof deleteDutiesAcknowledgementRecordRoute,
  ApiEnv
> = notImplemented;
