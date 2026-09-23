import { createRoute, z } from '@hono/zod-openapi';
import {
  clientDocumentListResponseSchema,
  clientDocumentResponseSchema,
  documentDownloadQuerySchema,
  documentDownloadResponseSchema,
  documentReadinessResponseSchema,
  generateDocumentsRequestSchema,
  generateDocumentsResponseSchema,
  issueDocumentRequestSchema,
  packDocumentTypeKeySchema,
  regenerateDocumentRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const documentParams = z.object({ documentId: z.uuid() });
const uploadParams = z.object({ clientId: z.uuid(), typeKey: packDocumentTypeKeySchema });
const revisionParams = z.object({ documentId: z.uuid(), revisionId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};

export const getDocumentReadinessRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/documents/readiness',
  operationId: 'getDocumentReadiness',
  summary: "Whether a client's documentation can be generated, and what is missing",
  description:
    'Documents never leave a data field blank, so generating is refused until the list is empty. The specialist is the caller: their name and professional title come from their profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'What is missing, by where it is filled in',
      content: {
        'application/json': {
          schema: documentReadinessResponseSchema.meta({ id: 'DocumentReadinessResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const listClientDocumentsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/documents',
  operationId: 'listClientDocuments',
  summary: "List a client's documents with their current draft and issued revisions",
  description:
    'In the order of the documentation set. `dataChanged` on a draft says that the stored facts would now print differently from what it was generated from.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The documents',
      content: {
        'application/json': {
          schema: clientDocumentListResponseSchema.meta({ id: 'ClientDocumentListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const generateClientDocumentsRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/documents/generate',
  operationId: 'generateClientDocuments',
  summary: "Generate the documents a client's documentation does not have yet",
  description:
    'Every built-in document type the client lacks is merged from its template and stored as revision 1, in draft. Documents that exist are left as they are and listed under `skipped`. Refused with the reason `missing_document_data` while the readiness list is not empty.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: generateDocumentsRequestSchema.meta({ id: 'GenerateDocumentsRequest' }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The documents that were created',
      content: {
        'application/json': {
          schema: generateDocumentsResponseSchema.meta({ id: 'GenerateDocumentsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchClient,
    409: { description: 'Data is missing, or the client is archived', content: errorContent },
    ...membershipErrors,
  },
});

export const getDocumentDownloadRoute = createRoute({
  method: 'get',
  path: '/documents/{documentId}/revisions/{revisionId}/download',
  operationId: 'getDocumentDownload',
  summary: "Get a short-lived link to a revision's Word file, or to its PDF",
  description:
    '`format=pdf` links to the PDF made when the revision was issued. A draft has none, and neither has a revision issued where no converter was configured: `404`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: revisionParams, query: documentDownloadQuerySchema },
  responses: {
    200: {
      description: 'The link',
      content: {
        'application/json': {
          schema: documentDownloadResponseSchema.meta({ id: 'DocumentDownloadResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or format', content: errorContent },
    404: {
      description: 'The revision does not exist in the organization, or has no PDF',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

const documentContent = {
  'application/json': {
    schema: clientDocumentResponseSchema.meta({ id: 'ClientDocumentResponse' }),
  },
};
const noSuchDocument = {
  description: 'The document does not exist in the organization',
  content: errorContent,
};

export const regenerateDocumentRoute = createRoute({
  method: 'post',
  path: '/documents/{documentId}/regenerate',
  operationId: 'regenerateDocument',
  summary: 'Merge one document again from the stored facts',
  description:
    'A draft is overwritten, hand edits included. An issued document gets a new draft revision and stays in force until that one is issued. A decision keeps its number.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: documentParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: regenerateDocumentRequestSchema.meta({ id: 'RegenerateDocumentRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The document with its new draft', content: documentContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchDocument,
    409: {
      description: 'Data is missing, the client is archived, or the type has no template',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const issueDocumentRoute = createRoute({
  method: 'post',
  path: '/documents/{documentId}/issue',
  operationId: 'issueDocument',
  summary: 'Issue the draft of a document',
  description:
    'Locks the draft with the hash of its file and supersedes the revision issued before, which stays downloadable. An issued revision never changes; a correction is a new draft. Where a converter is configured, the PDF of the file is made and stored first, and issuing locks both. A draft whose file still reads "DE COMPLETAT" is refused with the reason `unfilled_text` unless `acceptUnfilled` is set.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: documentParams,
    body: {
      // Optional, so issuing without a body keeps working.
      required: false,
      content: {
        'application/json': {
          schema: issueDocumentRequestSchema.meta({ id: 'IssueDocumentRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The document with its issued revision', content: documentContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchDocument,
    409: {
      description: 'The document has no draft, or its file still has text to fill in',
      content: errorContent,
    },
    ...membershipErrors,
    // After the shared 503, which it replaces for this route.
    503: {
      description:
        'Supabase is unavailable, or the PDF could not be made (reason `pdf_unavailable`); nothing was issued',
      content: errorContent,
    },
  },
});

export const startDocumentDraftRoute = createRoute({
  method: 'post',
  path: '/documents/{documentId}/draft',
  operationId: 'startDocumentDraft',
  summary: 'Start a draft from the issued revision of a document',
  description:
    'The new draft is a copy of the issued file, hand edits included, and the issued revision stays in force until the draft is issued. Regenerating is the way to a draft from the template and the facts of today.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: documentParams },
  responses: {
    200: { description: 'The document with its new draft', content: documentContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchDocument,
    409: {
      description:
        'The document already has a draft (`draft_exists`), has nothing issued, or its client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const deleteDocumentDraftRoute = createRoute({
  method: 'delete',
  path: '/documents/{documentId}/draft',
  operationId: 'deleteDocumentDraft',
  summary: 'Delete the draft of a document, with its file',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: documentParams },
  responses: {
    204: { description: 'The draft is gone; issued revisions are untouched' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchDocument,
    409: { description: 'The document has no draft', content: errorContent },
    ...membershipErrors,
  },
});

export const saveDocumentDraftFileRoute = createRoute({
  method: 'put',
  path: '/documents/{documentId}/draft/file',
  operationId: 'saveDocumentDraftFile',
  summary: "Replace the Word file of a document's draft",
  description:
    'Takes the bytes of a `.docx`, as the in-app editor saves them or as edited elsewhere, up to 15 MB. The draft is marked as edited. An issued revision has no file that can be written.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: documentParams,
    body: {
      required: true,
      content: {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          schema: z.string().openapi({ type: 'string', format: 'binary' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The document with its edited draft', content: documentContent },
    400: { description: 'Invalid path, or not a Word document', content: errorContent },
    404: noSuchDocument,
    409: { description: 'The document has no draft', content: errorContent },
    ...membershipErrors,
  },
});

export const attachDocumentSignedCopyRoute = createRoute({
  method: 'put',
  path: '/documents/{documentId}/signed-copy',
  operationId: 'attachDocumentSignedCopy',
  summary: 'Attach the signed copy of the issued revision, or replace it',
  description:
    "Takes the bytes of a PDF, up to 15 MB: a scan of the signed paper, or the file signed with the signer's own certificate. It is kept beside the issued revision with its hash. The app records that a file was attached, not that it is signed. A revision that is later superseded keeps its copy.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: documentParams,
    body: {
      required: true,
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
  },
  responses: {
    200: {
      description: 'The document, whose issued revision has a signed copy',
      content: documentContent,
    },
    400: { description: 'Invalid path, or not a PDF', content: errorContent },
    404: noSuchDocument,
    409: {
      description: 'Nothing is issued (`not_issued`), or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const confirmDocumentSignedCopyRoute = createRoute({
  method: 'post',
  path: '/documents/{documentId}/signed-copy/confirm',
  operationId: 'confirmDocumentSignedCopy',
  summary: 'Accept the copy received through the return link as the signed copy',
  description:
    'A copy the client uploaded through the return link is a received copy until an owner opens it and confirms it here; only then is the contract signed and the link closed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: documentParams },
  responses: {
    200: {
      description: 'The document, whose issued revision has a confirmed signed copy',
      content: documentContent,
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchDocument,
    409: {
      description: 'There is no received copy (`no_received_copy`), or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const removeDocumentSignedCopyRoute = createRoute({
  method: 'delete',
  path: '/documents/{documentId}/signed-copy',
  operationId: 'removeDocumentSignedCopy',
  summary: 'Remove the signed copy of the issued revision, with its file',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: documentParams },
  responses: {
    204: { description: 'The signed copy is gone; the revision is untouched' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchDocument,
    409: {
      description: 'There is no signed copy, or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const uploadClientDocumentRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/documents/{typeKey}/upload',
  operationId: 'uploadClientDocument',
  summary: "Take a Word file written elsewhere as a document's draft",
  description:
    'Takes the bytes of a `.docx`, up to 15 MB. A type the app cannot generate yet (the own instructions, the training themes, the protective equipment list, the risk assessment, the prevention plan) comes to exist this way, as revision 1 in draft. For a document that exists, the file replaces the draft, or starts the next draft beside the issued revision. A generated type that does not exist yet is refused with the reason `not_generated_yet`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: uploadParams,
    body: {
      required: true,
      content: {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          schema: z.string().openapi({ type: 'string', format: 'binary' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The document with the uploaded draft', content: documentContent },
    400: { description: 'Invalid path, or not a Word document', content: errorContent },
    404: noSuchClient,
    409: {
      description: 'The client is archived, or the document has to be generated first',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
