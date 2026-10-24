import { createRouter } from '../../router';
import { getDashboardSummary } from './handlers';
import { getDashboardSummaryRoute } from './routes';

export const dashboardRouter = createRouter().openapi(
  getDashboardSummaryRoute,
  getDashboardSummary
);
