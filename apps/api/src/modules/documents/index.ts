import { createRouter } from '../../router';
import {
  attachDocumentSignedCopy,
  deleteDocumentDraft,
  generateClientDocuments,
  getDocumentDownload,
  getDocumentReadiness,
  issueDocument,
  listClientDocuments,
  regenerateDocument,
  removeDocumentSignedCopy,
  saveDocumentDraftFile,
  startDocumentDraft,
  uploadClientDocument,
} from './handlers';
import {
  attachDocumentSignedCopyRoute,
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  regenerateDocumentRoute,
  removeDocumentSignedCopyRoute,
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
  .openapi(attachDocumentSignedCopyRoute, attachDocumentSignedCopy)
  .openapi(removeDocumentSignedCopyRoute, removeDocumentSignedCopy)
  .openapi(uploadClientDocumentRoute, uploadClientDocument);
