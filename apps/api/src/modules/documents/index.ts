import { createRouter } from '../../router';
import { getDocumentReadiness } from './handlers';
import { getDocumentReadinessRoute } from './routes';

export const documentsRouter = createRouter().openapi(
  getDocumentReadinessRoute,
  getDocumentReadiness
);
