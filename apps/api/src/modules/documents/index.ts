import { createRouter } from '../../router';
import {
  generateClientDocuments,
  getDocumentDownload,
  getDocumentReadiness,
  listClientDocuments,
} from './handlers';
import {
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  listClientDocumentsRoute,
} from './routes';

export const documentsRouter = createRouter()
  .openapi(getDocumentReadinessRoute, getDocumentReadiness)
  .openapi(listClientDocumentsRoute, listClientDocuments)
  .openapi(generateClientDocumentsRoute, generateClientDocuments)
  .openapi(getDocumentDownloadRoute, getDocumentDownload);
