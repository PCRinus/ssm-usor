import { createRoute, z } from '@hono/zod-openapi';
import {
  contractReturnRequestSchema,
  contractReturnResponseSchema,
  documentDownloadResponseSchema,
} from '@ssm-usor/contracts';

import { errorContent, publicErrors } from '../../lib/openapi';

// The return link (ADR 007, amended): public, for the person who received a contract by
// email. The token is the only credential, so it travels in bodies, never in URLs the API
// logs, and nothing here reads anything the send does not point at.

const tokenBody = {
  required: true,
  content: {
    'application/json': {
      schema: contractReturnRequestSchema.meta({ id: 'ContractReturnRequest' }),
    },
  },
};

const returnContent = {
  'application/json': {
    schema: contractReturnResponseSchema.meta({ id: 'ContractReturnResponse' }),
  },
};

const noSuchLink = { description: 'No send has this token', content: errorContent };
const unavailable = {
  503: { description: 'A dependency is temporarily unavailable', content: errorContent },
};

export const lookupContractReturnRoute = createRoute({
  method: 'post',
  path: '/contract-returns/lookup',
  operationId: 'lookupContractReturn',
  summary: 'Describe the contract behind a return link',
  description:
    'Public, and changes nothing. Says which contract the link is for, from whom, and whether it still takes a signed copy: `open`, `received` (one arrived and can be replaced), `confirmed`, `superseded` by a newer revision, or `expired`.',
  request: { body: tokenBody },
  responses: {
    200: {
      description: 'The contract the link is for, and where it stands',
      content: returnContent,
    },
    400: { description: 'Invalid request body', content: errorContent },
    404: noSuchLink,
    ...unavailable,
    ...publicErrors,
  },
});

export const downloadContractReturnRoute = createRoute({
  method: 'post',
  path: '/contract-returns/download',
  operationId: 'downloadContractReturn',
  summary: 'A short-lived link to the PDF that was sent',
  description:
    'The same revision the email carried, for a link that is `open` or `received`. A closed link answers 409 with the reason `return_link_closed`.',
  request: { body: tokenBody },
  responses: {
    200: {
      description: 'Where to fetch the PDF from, and the name to save it under',
      content: {
        'application/json': {
          schema: documentDownloadResponseSchema.meta({ id: 'DocumentDownloadResponse' }),
        },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    404: noSuchLink,
    409: { description: 'The link no longer takes a copy', content: errorContent },
    ...unavailable,
    ...publicErrors,
  },
});

export const uploadContractReturnRoute = createRoute({
  method: 'post',
  path: '/contract-returns/upload',
  operationId: 'uploadContractReturn',
  summary: 'Send the signed copy back through the link',
  description:
    'One PDF of at most 15 MB, signed with a qualified certificate or scanned. It is kept as the received copy of the revision that was sent, replacing an earlier one that no owner has confirmed yet; the owner is told. Refused with `return_link_closed` once a copy is confirmed, a newer revision is issued or the link expired, and with `return_link_too_many_uploads` past a bounded number of tries.',
  request: {
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: z
            .object({
              token: contractReturnRequestSchema.shape.token,
              file: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
            })
            .meta({ id: 'ContractReturnUploadRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The copy was received', content: returnContent },
    400: { description: 'Invalid request body, or not a PDF', content: errorContent },
    404: noSuchLink,
    409: { description: 'The link no longer takes a copy', content: errorContent },
    ...unavailable,
    ...publicErrors,
  },
});
