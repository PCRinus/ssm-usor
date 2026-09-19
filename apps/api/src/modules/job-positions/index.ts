import { createRouter } from '../../router';
import {
  createJobPosition,
  listJobPositions,
  removeJobPosition,
  updateJobPosition,
} from './handlers';
import {
  createJobPositionRoute,
  listJobPositionsRoute,
  removeJobPositionRoute,
  updateJobPositionRoute,
} from './routes';

export const jobPositionsRouter = createRouter()
  .openapi(listJobPositionsRoute, listJobPositions)
  .openapi(createJobPositionRoute, createJobPosition)
  .openapi(updateJobPositionRoute, updateJobPosition)
  .openapi(removeJobPositionRoute, removeJobPosition);
