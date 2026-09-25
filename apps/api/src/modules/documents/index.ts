import { createRouter } from '../../router';
import {
  attachDocumentSignedCopy,
  confirmDocumentSignedCopy,
  deleteDocumentDraft,
  generateClientDocuments,
  getDocumentDownload,
  getDocumentReadiness,
  issueDocument,
  listClientDocuments,
  printDocument,
  regenerateDocument,
  removeDocumentSignedCopy,
  saveDocumentDraftFile,
  startDocumentDraft,
  uploadClientDocument,
} from './handlers';
import {
  attachDocumentSignedCopyRoute,
  confirmDocumentSignedCopyRoute,
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  printDocumentRoute,
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
  .openapi(printDocumentRoute, printDocument)
  .openapi(attachDocumentSignedCopyRoute, attachDocumentSignedCopy)
  .openapi(confirmDocumentSignedCopyRoute, confirmDocumentSignedCopy)
  .openapi(removeDocumentSignedCopyRoute, removeDocumentSignedCopy)
  .openapi(uploadClientDocumentRoute, uploadClientDocument);
