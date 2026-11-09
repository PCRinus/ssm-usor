import { createRoute, z } from '@hono/zod-openapi';
import {
  fileLinkResponseSchema,
  missingSheetDataResponseSchema,
  trainingSheetQuerySchema,
  trainingSheetsResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const employeeParams = z.object({ clientId: z.uuid(), employeeId: z.uuid() });

const noSuchEmployee = {
  description: 'The employee does not exist under this client in the organization',
  content: errorContent,
};

export const getTrainingSheetsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/training-sheets',
  operationId: 'getTrainingSheets',
  summary: "Whether an employee's two individual training sheets can be drawn up",
  description:
    "For each domain, `ready` and the codes of what is missing (ADR 021): the commute route on the occupational safety sheet (`employee.commute_route`), and on both the workplace when the client has more than one active workplace and the employee has none (`employee.workplace`). Every other empty line prints empty. A former employee's sheets are drawn up too. `stored` is true once signing has started and the sheet is the stored signed sheet (ADR 023), which is then always ready; `sequences` lists the stored sheet and its continuation sheets by number.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The readiness of both sheets',
      content: {
        'application/json': {
          schema: trainingSheetsResponseSchema.meta({ id: 'TrainingSheetsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEmployee,
    ...membershipErrors,
  },
});

export const getTrainingSheetRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/training-sheet',
  operationId: 'getTrainingSheet',
  summary: "Download an employee's individual training sheet of a domain as a PDF",
  description:
    "Once signing has started, the stored signed sheet (ADR 023): the PDF form as signed so far, or a sheet and its continuation sheets merged into one PDF, flattened, whose signatures are then not verifiable in that copy: it is stamped on every page as a copy to read and named `…-copie.pdf`, and `?sequence=n` serves the original of sheet n as signed (`sequences` in the readiness lists them; `404` for a number the employee has no stored sheet of). Before, built on the spot from the employee, their workplace and position, and their training records of the domain, merged into the newest registered version of the sheet's template and converted by the converter that makes the PDFs at issuing; nothing is stored. Hiring trainings not recorded yet print blank, and the periodic tables run on in blank rows to the end of their page for signing on paper.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams, query: trainingSheetQuerySchema },
  responses: {
    200: {
      description: 'The sheet, named in `Content-Disposition`',
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    404: {
      description:
        'The employee does not exist under this client in the organization, or has no stored sheet of that `sequence`',
      content: errorContent,
    },
    409: {
      description:
        'Data the sheet needs is missing (reason `missing_sheet_data`, the codes under `missing`)',
      content: {
        'application/json': {
          schema: missingSheetDataResponseSchema.meta({ id: 'MissingSheetDataResponse' }),
        },
      },
    },
    ...membershipErrors,
    // After the shared 503, which it replaces for this route.
    503: {
      description:
        'Supabase is unavailable, the template is not registered (reason `template_missing`), there is no converter or it failed (reason `pdf_unavailable`), or the signer that stamps a merged copy did (reason `signer_unavailable`)',
      content: errorContent,
    },
  },
});

export const getTrainingSheetLinkRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/training-sheet/link',
  operationId: 'getTrainingSheetLink',
  summary: "A short-lived link to an employee's stored signed sheet",
  description:
    "For a real link on the page, which the browser opens through `GET /files/download`: shown `inline`, the PDF opens in the browser's viewer, which the in-app browser of a mail client can do where it cannot download. Only a stored sheet (ADR 023) has a file to link to; a sheet drawn up on the spot and the merged reading copy come from the PDF route. `sequence` names one of several stored sheets and may be left out when there is one. The link is valid for ten minutes.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams, query: trainingSheetQuerySchema },
  responses: {
    200: {
      description: 'The link',
      content: {
        'application/json': { schema: fileLinkResponseSchema.meta({ id: 'FileLinkResponse' }) },
      },
    },
    400: { description: 'Invalid path, domain or sequence', content: errorContent },
    404: {
      description:
        'The employee does not exist under this client in the organization, has no stored sheet of the domain, or none of that `sequence`',
      content: errorContent,
    },
    409: {
      description:
        'Several sheets are stored and `sequence` names none of them (reason `several_sheets`)',
      content: errorContent,
    },
    ...membershipErrors,
    503: { description: 'Storage is unavailable', content: errorContent },
  },
});
