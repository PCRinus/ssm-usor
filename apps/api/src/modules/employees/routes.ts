import { createRoute } from '@hono/zod-openapi';
import {
  createEmployeeRequestSchema,
  employeeInviteesLimit,
  employeeInviteesResponseSchema,
  employeeListResponseSchema,
  employeeResponseSchema,
  listEmployeeInviteesQuerySchema,
  listEmployeesQuerySchema,
  listOrganizationEmployeesQuerySchema,
  organizationEmployeeListResponseSchema,
  updateEmployeeJobPositionRequestSchema,
  updateEmployeeRequestSchema,
  updateEmployeeStatusRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import {
  bearerSecurity,
  clientNotFoundResponse,
  clientParams,
  employeeParams,
  errorContent,
  membershipErrors,
} from '../../lib/openapi';

export const listEmployeesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees',
  operationId: 'listEmployees',
  summary: "List a client's employees",
  description:
    'Paginated. Without a status filter the list holds current employees. Archived rows are never listed. One sort key at a time; "name" orders by last name then first name, and a training by its state (overdue, untrained, due, current) then its due date, employees without a state last either way. `q` keeps the employees whose name or employee number contains every word of it, regardless of case and diacritics; never the CNP. Each filter takes repeated values, any of which matches, and every filter given must match: `ssmTraining` and `suTraining` the training state in that domain ("attention" untrained or overdue), `test` the test state in either domain ("passed" in both), `attention` the needs ("toTrain" untrained or overdue in either domain and "trainingDue" due in either, as the clients list counts them), `jobPosition` and `workplace` the client\'s own, `portal` the standing on the portal, `dutiesAcknowledgement` the state of the acknowledgement of SSM duties. The states are those of current employees of active clients, so an archived client refuses the state filters (`ssmTraining`, `suTraining`, `test`, the training needs of `attention`) and the training sorts with `400`. `unfilteredTotal` counts the status asked for without the search and the filters. Each employee carries their standing on the portal (ADR 022): the active participant, else the newest invitation neither accepted nor revoked ("invited", or "expired" past its 30 days), else the latest revoked one, else "none"; with the ids its actions need. "portal" sorts by it in that order, then by name, and is read for an archived client too, whose access can still be revoked. Each current employee carries `dutiesAcknowledgement`, the state of their acknowledgement of SSM duties against the latest issued document 13 (ADR 046), as `GET …/duties-acknowledgement` reads it; a former employee carries null and is matched by no value of its filter. The CNP is only returned by the detail route.',
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
    404: clientNotFoundResponse,
    ...membershipErrors,
  },
});

export const listEmployeeInviteesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employee-invitees',
  operationId: 'listEmployeeInvitees',
  summary:
    "Every current employee the Portal tab's search and filters match, to invite them at once",
  description: `Without a page: a choice made from the Portal tab spans every page of it. The search and the filters read as on \`listEmployees\`. At most ${employeeInviteesLimit} employees by name, with \`total\` counting them all. Each comes as an invitee of \`inviteEmployeeParticipants\`: \`portal\` is \`participant\` for active access, \`invited\` for an invitation still open, and null otherwise, an expired or revoked invitation included.`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, query: listEmployeeInviteesQuerySchema },
  responses: {
    200: {
      description: 'The employees, by last and first name',
      content: {
        'application/json': {
          schema: employeeInviteesResponseSchema.meta({ id: 'EmployeeInviteesResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or query', content: errorContent },
    404: clientNotFoundResponse,
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
    404: clientNotFoundResponse,
    409: {
      description:
        'The client is archived (reason `client_archived`), or a current employee of the client has the CNP (reason `employee_cnp_taken`) or number (reason `employee_number_taken`)',
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
    'Terminating needs the leave date, on or after the hire date. Reactivating clears it and is meant for undoing a mistake; a rehire after a gap is a new employee. The CNP and the employee number are unique among current employees, so reactivating is refused while a current employee holds either.',
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
    409: {
      description:
        'The client is archived, or a current employee of the client has the CNP (reason `employee_cnp_taken`) or number (reason `employee_number_taken`) of the one being reactivated',
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
      description:
        'The client is archived (reason `client_archived`), or another current employee of the client has this CNP (reason `employee_cnp_taken`) or number (reason `employee_number_taken`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const listOrganizationEmployeesRoute = createRoute({
  method: 'get',
  path: '/employees',
  operationId: 'listOrganizationEmployees',
  summary: "List the organization's employees across its clients",
  description:
    "Paginated, searched, filtered and sorted like a client's list, each row with its client. Without a status filter the list holds current employees; employees of archived clients and of leads are never listed. `q` matches the name and the employee number, never the client: `client` filters by clients.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: listOrganizationEmployeesQuerySchema },
  responses: {
    200: {
      description: 'One page of employees with the total count',
      content: {
        'application/json': {
          schema: organizationEmployeeListResponseSchema.meta({
            id: 'OrganizationEmployeeListResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});
