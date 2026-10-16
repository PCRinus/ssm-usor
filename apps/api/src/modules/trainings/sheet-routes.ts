import { createRoute, z } from '@hono/zod-openapi';
import {
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
    "For each domain, `ready` and the codes of what is missing (ADR 021): the commute route on the occupational safety sheet (`employee.commute_route`), and on both the workplace when the client has more than one active workplace and the employee has none (`employee.workplace`). Every other empty line prints empty. A former employee's sheets are drawn up too.",
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
    "Built on the spot from the employee, their workplace and position, and their training records of the domain, merged into the newest registered version of the sheet's template and converted by the converter that makes the PDFs at issuing; nothing is stored. Hiring trainings not recorded yet print blank, and the periodic tables run on in blank rows to the end of their page for signing on paper.",
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
    400: { description: 'Invalid path or domain', content: errorContent },
    404: noSuchEmployee,
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
        'Supabase is unavailable, the template is not registered (reason `template_missing`), or there is no converter or it failed (reason `pdf_unavailable`)',
      content: errorContent,
    },
  },
});
