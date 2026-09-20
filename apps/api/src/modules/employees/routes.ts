import { createRoute, z } from '@hono/zod-openapi';
import {
  createEmployeeRequestSchema,
  employeeListResponseSchema,
  employeeResponseSchema,
  listEmployeesQuerySchema,
  updateEmployeeJobPositionRequestSchema,
  updateEmployeeRequestSchema,
  updateEmployeeStatusRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const employeeParams = clientParams.extend({ employeeId: z.uuid() });

export const listEmployeesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees',
  operationId: 'listEmployees',
  summary: "List a client's employees",
  description:
    'Paginated. Without a status filter the list holds current employees. Archived rows are never listed. One sort key at a time; "name" orders by last name then first name. The CNP is only returned by the detail route.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, query: listEmployeesQuerySchema },
  responses: {
    200: {
      description: 'One page of employees with the total count',
      content: {
        'application/json': {
          schema: employeeListResponseSchema.meta({ id: 'EmployeeListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or query', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    ...membershipErrors,
  },
});

export const createEmployeeRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employees',
  operationId: 'createEmployee',
  summary: 'Add an employee to a client',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createEmployeeRequestSchema.meta({ id: 'CreateEmployeeRequest' }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The created employee',
      content: {
        'application/json': { schema: employeeResponseSchema.meta({ id: 'EmployeeResponse' }) },
      },
    },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    409: {
      description: 'The client is archived, or the CNP or employee number is already used',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const getEmployeeRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}',
  operationId: 'getEmployee',
  summary: 'Read one employee, including the CNP',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The employee',
      content: {
        'application/json': { schema: employeeResponseSchema.meta({ id: 'EmployeeResponse' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'The employee does not exist under this client in the organization',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateEmployeeStatusRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/employees/{employeeId}/status',
  operationId: 'updateEmployeeStatus',
  summary: 'Mark an employee as former, or reactivate one',
  description:
    'Terminating needs the leave date, on or after the hire date. Reactivating clears it and is meant for undoing a mistake; a rehire after a gap is a new employee.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateEmployeeStatusRequestSchema.meta({ id: 'UpdateEmployeeStatusRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The employee after the change',
      content: {
        'application/json': { schema: employeeResponseSchema.meta({ id: 'EmployeeResponse' }) },
      },
    },
    400: {
      description: 'Invalid path or body, or a leave date before the hire date',
      content: errorContent,
    },
    404: {
      description: 'The employee does not exist under this client in the organization',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateEmployeeJobPositionRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/employees/{employeeId}/job-position',
  operationId: 'updateEmployeeJobPosition',
  summary: "Move an employee to another of the client's job positions",
  description:
    'The contract title stays as it is unless `jobTitle` is given: a person can change post without a new contract, and the other way round (ADR 006).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateEmployeeJobPositionRequestSchema.meta({
            id: 'UpdateEmployeeJobPositionRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The employee in the new position',
      content: {
        'application/json': { schema: employeeResponseSchema.meta({ id: 'EmployeeResponse' }) },
      },
    },
    400: {
      description: 'Invalid path or body, or a job position that is not one of this client',
      content: errorContent,
    },
    404: { description: 'The employee does not exist under this client', content: errorContent },
    ...membershipErrors,
  },
});

export const updateEmployeeRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/employees/{employeeId}',
  operationId: 'updateEmployee',
  summary: 'Replace what was entered about an employee',
  description:
    'The same fields and rules as adding one. Left out, `jobPositionId` keeps the position the person is in. Whether they still work there is a status change, not part of this.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateEmployeeRequestSchema.meta({ id: 'UpdateEmployeeRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The employee after the change',
      content: {
        'application/json': { schema: employeeResponseSchema.meta({ id: 'EmployeeResponse' }) },
      },
    },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: { description: 'The employee does not exist under this client', content: errorContent },
    409: {
      description: 'Another employee of the client has this CNP or number',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
