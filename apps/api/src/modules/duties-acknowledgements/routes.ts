import { createRoute, z } from '@hono/zod-openapi';
import {
  dutiesAcknowledgementResponseSchema,
  recordDutiesAcknowledgementRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, employeeParams, errorContent, membershipErrors } from '../../lib/openapi';

const acknowledgementContent = {
  'application/json': {
    schema: dutiesAcknowledgementResponseSchema.meta({ id: 'DutiesAcknowledgementResponse' }),
  },
};

const noSuchEmployee = {
  description: 'The employee does not exist under this client in the organization',
  content: errorContent,
};

const noSheet = {
  description:
    "The client has no issued document 13 (reason `duties_not_issued`), or its latest issued revision has no annex for the employee's post (reason `duties_no_annex`)",
  content: errorContent,
};

const sheetUnavailable = {
  description:
    'Supabase is unavailable, the template is not registered (reason `template_missing`), or there is no converter or it failed (reason `pdf_unavailable`)',
  content: errorContent,
};

const sheetDescription =
  "The acknowledgement sheet (_fișa de luare la cunoștință a atribuțiilor SSM_, ADR 046): the annex of the employee's post in the latest issued revision of document 13, with only the role blocks naming this employee and only their name in them, and the employee's statement, name, date and signature lines. Built from that revision's snapshot, so it says what the revision says; nothing is stored. A former employee's sheet is drawn up too.";

export const getDutiesAcknowledgementRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/duties-acknowledgement',
  operationId: 'getDutiesAcknowledgement',
  summary: "An employee's acknowledgement of their SSM duties",
  description:
    "Against the latest issued revision of document 13 (ADR 046); a draft does not count. `status`: `not_issued` while the client has none; `no_annex` when it has no annex for the employee's post (archived, or created after it was issued); `to_sign` with nothing recorded; `signed` when the newest record was signed on the post's annex as it now reads and on the roles the employee holds in it; `sign_again` otherwise, `reasons` saying whether the annex (`annex_changed`) or the roles (`roles_changed`) differ. `annex` is the sheet to sign now. `current` is the newest record and `history` the earlier ones, newest first. Read the same way for a former employee.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: { description: 'The acknowledgement', content: acknowledgementContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEmployee,
    ...membershipErrors,
  },
});

export const getDutiesAcknowledgementSheetRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/duties-acknowledgement/sheet',
  operationId: 'getDutiesAcknowledgementSheet',
  summary: "Download an employee's acknowledgement sheet of SSM duties as a PDF",
  description: `${sheetDescription} Converted by the converter that makes the PDFs at issuing.`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The sheet, named in `Content-Disposition`',
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEmployee,
    409: noSheet,
    ...membershipErrors,
    // After the shared 503, which it replaces for this route.
    503: sheetUnavailable,
  },
});

export const getDutiesAcknowledgementSheetWordRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/duties-acknowledgement/sheet/word',
  operationId: 'getDutiesAcknowledgementSheetWord',
  summary: "Download an employee's acknowledgement sheet of SSM duties as a Word file",
  description: sheetDescription,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The sheet, named in `Content-Disposition`',
      content: {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          schema: z.string().openapi({ type: 'string', format: 'binary' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEmployee,
    409: noSheet,
    ...membershipErrors,
    503: sheetUnavailable,
  },
});

export const recordDutiesAcknowledgementRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employees/{employeeId}/duties-acknowledgement/records',
  operationId: 'recordDutiesAcknowledgement',
  summary: "Record an employee's acknowledgement sheet as signed on paper",
  description:
    "The sheet of `revisionId`, which must still be the latest issued revision of document 13, came back signed by hand on `signedOn`: not in the future, nor before the day the revision carries; stored as noon in Romania. `clientFileId` is the scan, a file of the client. The record keeps the revision, the post and the number of its annex, the annex's fingerprint and the roles the employee holds in it with theirs, so it shows as out of date once they change. Earlier records stay as history. The database records the member signed in and the moment.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: recordDutiesAcknowledgementRequestSchema.meta({
            id: 'RecordDutiesAcknowledgementRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The acknowledgement with the new record',
      content: acknowledgementContent,
    },
    400: {
      description: 'Invalid path or body, or a day in the future or before the revision',
      content: errorContent,
    },
    404: noSuchEmployee,
    409: {
      description:
        "The client has no issued document 13 (reason `duties_not_issued`), it has no annex for the employee's post (reason `duties_no_annex`), `revisionId` is not its latest issued revision (reason `duties_revision_not_current`), the file is not of the client, or the client is archived (reason `client_archived`)",
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const deleteDutiesAcknowledgementRecordRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/employees/{employeeId}/duties-acknowledgement/records/{recordId}',
  operationId: 'deleteDutiesAcknowledgementRecord',
  summary: 'Remove a record of an acknowledgement sheet made by mistake',
  description:
    'The record goes; its scan stays among the files of the client. The record before it, if any, becomes the current one.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams.extend({ recordId: z.uuid() }) },
  responses: {
    200: { description: 'The acknowledgement without the record', content: acknowledgementContent },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'The employee or the record does not exist under this client',
      content: errorContent,
    },
    409: {
      description: 'The client is archived (reason `client_archived`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
