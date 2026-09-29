import { createRoute, z } from '@hono/zod-openapi';
import {
  clientFileDownloadResponseSchema,
  clientFileListResponseSchema,
  clientFileResponseSchema,
  setClientFileOwnersOnlyRequestSchema,
  updateClientFileRequestSchema,
  uploadClientFileQuerySchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const fileParams = z.object({ clientId: z.uuid(), fileId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};
const noSuchFile = {
  description: 'The file does not exist under this client, or the caller cannot see it',
  content: errorContent,
};
const notTheirs = {
  description: 'Not a member, or the file is neither theirs nor are they an owner',
  content: errorContent,
};
const archivedClient = {
  description: 'The client is archived (reason `client_archived`)',
  content: errorContent,
};
const fileContent = {
  'application/json': { schema: clientFileResponseSchema.meta({ id: 'ClientFileResponse' }) },
};

export const listClientFilesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/files',
  operationId: 'listClientFiles',
  summary: "List a client's files",
  description:
    'The files the caller can see, newest first (ADR 013). A specialist does not see the files for owners only, so a count shown to them counts only theirs.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The files',
      content: {
        'application/json': {
          schema: clientFileListResponseSchema.meta({ id: 'ClientFileListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const uploadClientFileRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/files',
  operationId: 'uploadClientFile',
  summary: 'Upload one file about a client',
  description:
    "Takes the bytes of the file, up to 20 MiB, as the body; one file per request. `fileName` is the file's own name, whose extension decides the type: PDF, JPEG, PNG, Word (`.docx`, `.doc`) or Excel (`.xlsx`, `.xls`); any other is refused (reason `client_file_type_not_allowed`), and so is content that is not of that type (reason `client_file_content_mismatch`). An empty file answers the reason `client_file_empty`, a larger one `client_file_too_large`. The name defaults to the file name without its extension. Only an owner uploads a file for owners only (`403`); a lead's files are always for owners only.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    query: uploadClientFileQuerySchema,
    body: {
      required: true,
      content: {
        'application/octet-stream': {
          schema: z.string().openapi({ type: 'string', format: 'binary' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The file', content: fileContent },
    400: {
      description: 'Invalid path or query, or the file is empty, too large or of a refused type',
      content: errorContent,
    },
    404: noSuchClient,
    409: archivedClient,
    ...membershipErrors,
    403: {
      description: 'Not a member, or a specialist asking for a file for owners only',
      content: errorContent,
    },
  },
});

export const updateClientFileRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/files/{fileId}',
  operationId: 'updateClientFile',
  summary: 'Rename or annotate a file',
  description: "By the member who uploaded it or by an owner; anyone else's attempt is `403`.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: fileParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateClientFileRequestSchema.meta({ id: 'UpdateClientFileRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The file after the change', content: fileContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchFile,
    409: archivedClient,
    ...membershipErrors,
    403: notTheirs,
  },
});

export const setClientFileOwnersOnlyRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/files/{fileId}/owners-only',
  operationId: 'setClientFileOwnersOnly',
  summary: 'Keep a file for owners only, or open it to the team',
  description:
    "Owners only. A lead's files stay for owners only until the lead is promoted (reason `client_file_lead_owners_only`).",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    params: fileParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: setClientFileOwnersOnlyRequestSchema.meta({
            id: 'SetClientFileOwnersOnlyRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The file after the change', content: fileContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchFile,
    409: {
      description: 'The client is archived, or is a lead whose files stay for owners only',
      content: errorContent,
    },
    ...ownerErrors,
  },
});

export const getClientFileDownloadRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/files/{fileId}/download',
  operationId: 'getClientFileDownload',
  summary: 'Get a short-lived link to a file',
  description:
    'A signed link valid for a minute, with the name the file was uploaded under. `disposition` says how to open it through `/files/download`: a PDF or an image in a tab, anything else as a download. Also for an archived client.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: fileParams },
  responses: {
    200: {
      description: 'The link',
      content: {
        'application/json': {
          schema: clientFileDownloadResponseSchema.meta({ id: 'ClientFileDownloadResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchFile,
    ...membershipErrors,
  },
});

export const deleteClientFileRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/files/{fileId}',
  operationId: 'deleteClientFile',
  summary: 'Delete a file for good',
  description:
    "The row and the stored file together, by the member who uploaded it or by an owner; anyone else's attempt is `403`. There is no recycle bin.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: fileParams },
  responses: {
    204: { description: 'The file is deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchFile,
    409: archivedClient,
    ...membershipErrors,
    403: notTheirs,
  },
});
