import { createRouter } from '../../router';
import {
  deleteDocumentDraft,
  generateClientDocuments,
  getDocumentDownload,
  getDocumentReadiness,
  issueDocument,
  listClientDocuments,
  regenerateDocument,
  saveDocumentDraftFile,
  startDocumentDraft,
  uploadClientDocument,
} from './handlers';
import {
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  regenerateDocumentRoute,
  saveDocumentDraftFileRoute,
  startDocumentDraftRoute,
  uploadClientDocumentRoute,
} from './routes';

export const documentsRouter = createRouter()
  .openapi(getDocumentReadinessRoute, getDocumentReadiness)
  .openapi(listClientDocumentsRoute, listClientDocuments)
  .openapi(generateClientDocumentsRoute, generateClientDocuments)
  .openapi(getDocumentDownloadRoute, getDocumentDownload)
  .openapi(regenerateDocumentRoute, regenerateDocument)
  .openapi(issueDocumentRoute, issueDocument)
  .openapi(startDocumentDraftRoute, startDocumentDraft)
  .openapi(deleteDocumentDraftRoute, deleteDocumentDraft)
  .openapi(saveDocumentDraftFileRoute, saveDocumentDraftFile)
  .openapi(uploadClientDocumentRoute, uploadClientDocument);
