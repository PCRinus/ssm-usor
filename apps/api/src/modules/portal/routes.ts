import { createRoute, z } from '@hono/zod-openapi';
import {
  fileLinkResponseSchema,
  missingSheetDataResponseSchema,
  portalClientEmployeesResponseSchema,
  portalEmployeeDataSchema,
  portalLanguageRequestSchema,
  portalMeSchema,
  portalNoticeRequestSchema,
  portalResponsiblePersonsResponseSchema,
  portalTrainingRecordsResponseSchema,
  portalTrainingSheetsSchema,
  trainingDomainSchema,
  trainingSheetSequenceQuerySchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';
import { requireParticipant } from '../../lib/participant';

// The portal's generated client is made of the operations with this tag and no others.
const tags = ['portal'];

const participantParams = z.object({ participantId: z.uuid() });
const employeeParams = participantParams.extend({ employeeId: z.uuid() });
const domainParams = participantParams.extend({ domain: trainingDomainSchema });
const employeeDomainParams = employeeParams.extend({ domain: trainingDomainSchema });

const participantErrors = {
  ...authErrors,
  403: { description: 'The account is not a participant of any client', content: errorContent },
  404: { description: "The participation is not the account's", content: errorContent },
} as const;

const administratorErrors = {
  ...authErrors,
  403: {
    description:
      "The account is not a participant, or the participation is not a client administrator's",
    content: errorContent,
  },
  404: {
    description: "The participation is not the account's, or the employee is not of its client",
    content: errorContent,
  },
} as const;

const ownErrors = {
  ...participantErrors,
  404: {
    description:
      "The participation is not the account's, or it is a client administrator's who is not an employee",
    content: errorContent,
  },
} as const;

const recordsContent = {
  'application/json': {
    schema: portalTrainingRecordsResponseSchema.meta({ id: 'PortalTrainingRecordsResponse' }),
  },
};
const sheetsContent = {
  'application/json': {
    schema: portalTrainingSheetsSchema.meta({ id: 'PortalTrainingSheetsResponse' }),
  },
};
const pdfContent = {
  'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
};
const linkContent = {
  'application/json': { schema: fileLinkResponseSchema.meta({ id: 'FileLinkResponse' }) },
};
const severalSheets = {
  description:
    'Several sheets are stored and `sequence` names none of them (reason `several_sheets`)',
  content: errorContent,
};
const missingSheetData = {
  description:
    "Data the sheet needs is missing (reason `missing_sheet_data`, the codes under `missing`); the client's specialist fills it",
  content: {
    'application/json': {
      schema: missingSheetDataResponseSchema.meta({ id: 'MissingSheetDataResponse' }),
    },
  },
};
const sheetUnavailable = {
  description:
    'Supabase is unavailable, the template is not registered (reason `template_missing`), or there is no converter or it failed (reason `pdf_unavailable`)',
  content: errorContent,
};

export const getPortalMeRoute = createRoute({
  method: 'get',
  path: '/portal/me',
  operationId: 'getPortalMe',
  tags,
  summary: 'The clients the signed-in account is a participant of',
  description:
    "Accepts the open invitations of the account's confirmed address first, so a first sign-in needs nothing else (ADR 022). Every portal route does the same. When there are several, the portal asks which client to open.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  responses: {
    200: {
      description: 'The participations, never empty',
      content: { 'application/json': { schema: portalMeSchema.meta({ id: 'PortalMeResponse' }) } },
    },
    ...authErrors,
    403: participantErrors[403],
  },
});

export const recordPortalNoticeRoute = createRoute({
  method: 'post',
  path: '/portal/participants/{participantId}/notice',
  operationId: 'recordPortalNotice',
  tags,
  summary: 'Record that the privacy notice was shown',
  description: 'The version shown and the time are kept on the participation.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: {
    params: participantParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: portalNoticeRequestSchema.meta({ id: 'PortalNoticeRequest' }),
        },
      },
    },
  },
  responses: {
    204: { description: 'Recorded' },
    400: { description: 'Invalid path or body', content: errorContent },
    ...participantErrors,
  },
});

export const setPortalLanguageRoute = createRoute({
  method: 'put',
  path: '/portal/participants/{participantId}/language',
  operationId: 'setPortalLanguage',
  tags,
  summary: 'Choose the language the portal is shown in',
  description: 'Kept on the participation; the portal uses it at every sign-in.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: {
    params: participantParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: portalLanguageRequestSchema.meta({ id: 'PortalLanguageRequest' }),
        },
      },
    },
  },
  responses: {
    204: { description: 'Saved' },
    400: { description: 'Invalid path or body', content: errorContent },
    ...participantErrors,
  },
});

export const listPortalTrainingRecordsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/training-records',
  operationId: 'listPortalTrainingRecords',
  tags,
  summary: "The participant's own training records and training state",
  description: 'Newest first, both domains, with the state and the next due date per domain.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'Records and state', content: recordsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...ownErrors,
  },
});

export const getPortalEmployeeDataRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/data',
  operationId: 'getPortalEmployeeData',
  tags,
  summary: 'What the employer holds about the participant (Datele mele)',
  description:
    "The identification data the individual training sheets print, read-only, and who corrects it. Never the CNP or the specialist's notes.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: {
      description: 'The data',
      content: {
        'application/json': {
          schema: portalEmployeeDataSchema.meta({ id: 'PortalEmployeeDataResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...ownErrors,
  },
});

export const getPortalTrainingSheetsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/sheets',
  operationId: 'getPortalTrainingSheets',
  tags,
  summary: "Whether the participant's two individual training sheets can be opened",
  description:
    "For each domain, `ready` and the codes of what the client's specialist still has to fill, and `stored` once the sheet is the stored signed sheet (ADR 023).",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'The readiness of both sheets', content: sheetsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...ownErrors,
  },
});

export const getPortalTrainingSheetRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/sheets/{domain}',
  operationId: 'getPortalTrainingSheet',
  tags,
  summary: "The participant's individual training sheet of a domain as a PDF",
  description:
    "As the employee's page in the app has it: the stored signed sheet once signing has started (ADR 023), else drawn up on the spot and not stored. Several stored sheets (a sheet and its continuation sheets) come merged into one flattened copy, stamped on every page as a copy to read and named `…-copie.pdf`, whose signatures do not verify; `?sequence=n` serves the original of sheet n as signed, `sequences` in the readiness listing them. ",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: domainParams, query: trainingSheetSequenceQuerySchema },
  responses: {
    200: { description: 'The sheet, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    409: missingSheetData,
    ...ownErrors,
    503: sheetUnavailable,
  },
});

export const getPortalTrainingSheetLinkRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/sheets/{domain}/link',
  operationId: 'getPortalTrainingSheetLink',
  tags,
  summary: "A short-lived link to the participant's stored signed sheet",
  description:
    "For a real link on the page, which the browser opens through `GET /files/download`: shown `inline`, the PDF opens in the browser's viewer, which the in-app browser of a mail client can do where it cannot download. Only a stored sheet (ADR 023) has a file to link to; a sheet drawn up on the spot and the merged reading copy come from the PDF route. `sequence` names one of several stored sheets and may be left out when there is one. Valid for ten minutes.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: domainParams, query: trainingSheetSequenceQuerySchema },
  responses: {
    200: { description: 'The link', content: linkContent },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    409: severalSheets,
    ...ownErrors,
    404: {
      description: `${ownErrors[404].description}, or there is no stored sheet of the domain or of that sequence`,
      content: errorContent,
    },
  },
});

export const listPortalClientEmployeesRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees',
  operationId: 'listPortalClientEmployees',
  tags,
  summary: "The client's current employees with their training states",
  description: 'For the client administrator only. Ordered by name.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: {
      description: 'The employees',
      content: {
        'application/json': {
          schema: portalClientEmployeesResponseSchema.meta({
            id: 'PortalClientEmployeesResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...administratorErrors,
  },
});

export const listPortalEmployeeTrainingRecordsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/{employeeId}/training-records',
  operationId: 'listPortalEmployeeTrainingRecords',
  tags,
  summary: "An employee's training records and training state, for the client administrator",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: employeeParams },
  responses: {
    200: { description: 'Records and state', content: recordsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...administratorErrors,
  },
});

export const getPortalEmployeeTrainingSheetsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/{employeeId}/sheets',
  operationId: 'getPortalEmployeeTrainingSheets',
  tags,
  summary: "Whether an employee's sheets can be opened, for the client administrator",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: employeeParams },
  responses: {
    200: { description: 'The readiness of both sheets', content: sheetsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...administratorErrors,
  },
});

export const getPortalEmployeeTrainingSheetRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/{employeeId}/sheets/{domain}',
  operationId: 'getPortalEmployeeTrainingSheet',
  tags,
  summary: "An employee's individual training sheet as a PDF, for the client administrator",
  description:
    'Several stored sheets (a sheet and its continuation sheets) come merged into one flattened copy, stamped on every page as a copy to read and named `…-copie.pdf`, whose signatures do not verify; `?sequence=n` serves the original of sheet n as signed, `sequences` in the readiness listing them.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: employeeDomainParams, query: trainingSheetSequenceQuerySchema },
  responses: {
    200: { description: 'The sheet, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    409: missingSheetData,
    ...administratorErrors,
    503: sheetUnavailable,
  },
});

export const getPortalEmployeeTrainingSheetLinkRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/{employeeId}/sheets/{domain}/link',
  operationId: 'getPortalEmployeeTrainingSheetLink',
  tags,
  summary: "A short-lived link to an employee's stored signed sheet, for the client administrator",
  description: "As the participant's own.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: employeeDomainParams, query: trainingSheetSequenceQuerySchema },
  responses: {
    200: { description: 'The link', content: linkContent },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    409: severalSheets,
    ...administratorErrors,
    404: {
      description: `${administratorErrors[404].description}, or there is no stored sheet of the domain or of that sequence`,
      content: errorContent,
    },
  },
});

export const listPortalResponsiblePersonsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/responsible-persons',
  operationId: 'listPortalResponsiblePersons',
  tags,
  summary: "The client's responsible persons, for the client administrator",
  description:
    'The people the client designates by decision, with their roles, as the decisions name them. Archived rows are not listed. Ordered by name.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: {
      description: 'The responsible persons',
      content: {
        'application/json': {
          schema: portalResponsiblePersonsResponseSchema.meta({
            id: 'PortalResponsiblePersonsResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...administratorErrors,
    404: participantErrors[404],
  },
});
