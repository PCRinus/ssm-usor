import { createRouter } from '../../router';
import {
  attachDocumentSignedCopy,
  confirmDocumentSignedCopy,
  deleteDocumentDraft,
  generateClientDocuments,
  getDocumentDownload,
  getDocumentReadiness,
  getRegenerationJob,
  issueDocument,
  listClientDocuments,
  listDocumentsBehind,
  printDocument,
  regenerateDocument,
  removeDocumentSignedCopy,
  saveDocumentDraftFile,
  startDocumentDraft,
  startDocumentRegeneration,
  uploadClientDocument,
} from './handlers';
import {
  attachDocumentSignedCopyRoute,
  confirmDocumentSignedCopyRoute,
  deleteDocumentDraftRoute,
  generateClientDocumentsRoute,
  getDocumentDownloadRoute,
  getDocumentReadinessRoute,
  getRegenerationJobRoute,
  issueDocumentRoute,
  listClientDocumentsRoute,
  listDocumentsBehindRoute,
  printDocumentRoute,
  regenerateDocumentRoute,
  removeDocumentSignedCopyRoute,
  saveDocumentDraftFileRoute,
  startDocumentDraftRoute,
  startDocumentRegenerationRoute,
  uploadClientDocumentRoute,
} from './routes';

export const documentsRouter = createRouter()
  // Before the routes of one document: `/documents/behind/regenerate` would otherwise be
  // taken for `/documents/{documentId}/regenerate` and refused as an invalid id.
  .openapi(listDocumentsBehindRoute, listDocumentsBehind)
  .openapi(startDocumentRegenerationRoute, startDocumentRegeneration)
  .openapi(getRegenerationJobRoute, getRegenerationJob)
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
